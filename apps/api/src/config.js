import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { configFilename, envName, product } from './product.js';
import { normalizeApiRoot } from './util.js';
import { normalizeDriverConfig } from './drivers/config.js';

export const DEFAULTS = {
  port: 3000,
  dataDir: './data',
  apiRoot: product.defaults?.apiRoot ?? '/v0',
  publicBaseUrl: 'http://localhost:3000',
  // One line across the top of every page of the web client: a maintenance
  // window, a sign-in method that just changed. Null is no banner, and the
  // optional link is where the message sends people for details.
  banner: {
    message: null,
    link: null,
  },
  requireHttps: false,
  trustProxy: false,
  database: {
    url: null,
    maxConnections: 10,
    connectTimeoutSeconds: 30,
    idleTimeoutSeconds: 60,
  },
  auth: {
    // The methods the instance offers. Null means "derive the set from the
    // oidc/webauthn/device settings below", which is what every config written
    // before the driver registry expects.
    methods: null,
    // Computed from `methods`: whether POST /sessions and the password form of
    // registration are open at all.
    passwordEnabled: true,
    policy: {
      registration: 'open',
      requireMfa: false,
      allowAccountLinking: true,
    },
    sessionTtlDays: 7,
    scrypt: { N: 16384, r: 8, p: 1 },
    oidc: {
      issuer: null,
      clientId: null,
      clientSecret: null,
      required: false,
    },
    webauthn: {
      // The domain a passkey is scoped to. Null means the hostname of
      // publicBaseUrl, which is right whenever the web client and the API are
      // served from the same site.
      rpId: null,
      // The name an authenticator shows when it asks to store the passkey.
      rpName: null,
    },
    device: {
      // The page a browser visits to approve a CLI sign-in. Null turns the
      // device flow off, since without a page to approve on a client would
      // wait for something nobody can do.
      verificationUrl: null,
    },
    // How long a session stays "recently authenticated" for the operations
    // that demand it (adding/removing a passkey, regenerating backup codes).
    reauthWindowMinutes: 10,
  },
  rateLimits: {
    loginAttemptsPerWindow: 5,
    loginWindowMinutes: 15,
    signupsPerIpPerWindow: 5,
    signupWindowMinutes: 15,
    publishPerWindow: 30,
    publishWindowMinutes: 60,
    downloadsPerIpPerWindow: 240,
    downloadWindowMinutes: 5,
    reportsPerWindow: 10,
    reportsWindowMinutes: 60,
    routesPerIpPerWindow: 600,
    routeWindowMinutes: 15,
  },
  pagination: {
    defaultLimit: 20,
    maxLimit: 50,
  },
  limits: {
    maxBlobBytes: 2 * 1024 * 1024,
    maxAccountBlobBytes: 64 * 1024 * 1024,
    maxSourceBytes: 1024 * 1024,
    maxProfileImageBytes: 2 * 1024 * 1024,
  },
  compiler: {
    command: null,
    timeoutMs: 30_000,
    memoryMb: 192,
    addressSpaceMb: 1536,
    minify: true,
  },
  logging: {
    requests: false,
  },
  cors: {
    allowedOrigins: '*',
  },
  // An ordered failover chain. `none` is no mail: every feature whose driver
  // requires mail refuses to be configured alongside it.
  mail: {
    drivers: [{ driver: 'none', options: {} }],
  },
  // Every other kind runs one instance unless its configuration lists more.
  drivers: {
    storage: null,
    cache: null,
    jobs: null,
    search: null,
    captcha: null,
    scanner: null,
    notify: null,
    metrics: null,
    compiler: null,
  },
};

// The buckets that a null switches off entirely, and the only keys for which a
// null is a value rather than the absence of one. An environment variable is a
// string, so "off" (or "null") is how an operator spells it there; no other key
// may use those spellings, or a mistyped port or quota would become null instead
// of failing startup.
const NULLABLE_KEYS = new Set([
  'rateLimits.publishPerWindow',
  'rateLimits.downloadsPerIpPerWindow',
  'rateLimits.reportsPerWindow',
]);

// Merge the config file over the defaults. `path` is the dotted key the value
// came from, because an explicit null means "off" for the nullable buckets
// and "not set" for everything else: keeping the default when a file says
// `publishPerWindow: null` would silently leave the bucket on, which is the one
// thing that line is there to do.
function mergeDeep(base, override, path = '') {
  if (override === undefined) return base;
  if (override === null) return NULLABLE_KEYS.has(path) ? null : base;
  if (Array.isArray(base)) return override;
  if (typeof base === 'object' && base !== null) {
    const out = structuredClone(base);
    for (const [key, value] of Object.entries(override)) {
      if (value !== undefined)
        out[key] = mergeDeep(base[key], value, path ? `${path}.${key}` : key);
    }
    return out;
  }
  return override;
}

// The suffix of each variable's name; the prefix is the product's `envPrefix`,
// so renaming the product renames the whole operator-facing surface.
const ENV_OVERRIDES = [
  ['port', 'PORT'],
  ['dataDir', 'DATA_DIR'],
  ['apiRoot', 'API_ROOT'],
  ['publicBaseUrl', 'PUBLIC_BASE_URL'],
  ['banner.message', 'BANNER_MESSAGE'],
  ['banner.link', 'BANNER_LINK'],
  ['requireHttps', 'REQUIRE_HTTPS'],
  ['trustProxy', 'TRUST_PROXY'],
  ['database.url', 'DATABASE_URL'],
  ['database.maxConnections', 'DATABASE_MAX_CONNECTIONS'],
  ['auth.sessionTtlDays', 'SESSION_TTL_DAYS'],
  ['auth.oidc.issuer', 'OIDC_ISSUER'],
  ['auth.oidc.clientId', 'OIDC_CLIENT_ID'],
  ['auth.oidc.clientSecret', 'OIDC_CLIENT_SECRET'],
  ['auth.oidc.required', 'OIDC_REQUIRED'],
  ['auth.webauthn.rpId', 'WEBAUTHN_RP_ID'],
  ['auth.webauthn.rpName', 'WEBAUTHN_RP_NAME'],
  ['auth.reauthWindowMinutes', 'REAUTH_WINDOW_MINUTES'],
  ['auth.device.verificationUrl', 'DEVICE_VERIFICATION_URL'],
  ['rateLimits.loginAttemptsPerWindow', 'LOGIN_ATTEMPTS_PER_WINDOW'],
  ['rateLimits.loginWindowMinutes', 'LOGIN_WINDOW_MINUTES'],
  ['rateLimits.signupsPerIpPerWindow', 'SIGNUPS_PER_IP_PER_WINDOW'],
  ['rateLimits.signupWindowMinutes', 'SIGNUP_WINDOW_MINUTES'],
  ['rateLimits.publishPerWindow', 'PUBLISH_PER_WINDOW'],
  ['rateLimits.publishWindowMinutes', 'PUBLISH_WINDOW_MINUTES'],
  ['rateLimits.downloadsPerIpPerWindow', 'DOWNLOADS_PER_IP_PER_WINDOW'],
  ['rateLimits.downloadWindowMinutes', 'DOWNLOAD_WINDOW_MINUTES'],
  ['rateLimits.reportsPerWindow', 'REPORTS_PER_WINDOW'],
  ['rateLimits.reportsWindowMinutes', 'REPORTS_WINDOW_MINUTES'],
  ['rateLimits.routesPerIpPerWindow', 'ROUTES_PER_IP_PER_WINDOW'],
  ['rateLimits.routeWindowMinutes', 'ROUTE_WINDOW_MINUTES'],
  ['pagination.defaultLimit', 'PAGINATION_DEFAULT_LIMIT'],
  ['pagination.maxLimit', 'PAGINATION_MAX_LIMIT'],
  ['limits.maxBlobBytes', 'MAX_BLOB_BYTES'],
  ['limits.maxAccountBlobBytes', 'MAX_ACCOUNT_BLOB_BYTES'],
  ['limits.maxSourceBytes', 'MAX_SOURCE_BYTES'],
  ['limits.maxProfileImageBytes', 'MAX_PROFILE_IMAGE_BYTES'],
  ['compiler.command', 'COMPILER'],
  ['compiler.timeoutMs', 'COMPILER_TIMEOUT_MS'],
  ['compiler.memoryMb', 'COMPILER_MEMORY_MB'],
  ['compiler.addressSpaceMb', 'COMPILER_ADDRESS_SPACE_MB'],
  ['compiler.minify', 'COMPILER_MINIFY'],
  ['logging.requests', 'LOG_REQUESTS'],
  ['cors.allowedOrigins', 'CORS_ALLOWED_ORIGINS'],
].map(([key, suffix]) => [key, envName(suffix)]);

// `fallback` is the DEFAULTS value for the key, not whatever YAML merged in: the
// coercion each value goes through is the one its default type calls for.
function coerceEnvValue(raw, fallback, variable, key) {
  if (NULLABLE_KEYS.has(key) && (raw === 'off' || raw === 'null')) return null;
  if (typeof fallback === 'boolean') {
    if (raw === 'true' || raw === '1') return true;
    if (raw === 'false' || raw === '0') return false;
    throw new Error(`${variable} must be "true" or "false" (got "${raw}")`);
  }
  if (typeof fallback === 'number') {
    const n = Number(raw);
    if (!Number.isInteger(n) || n <= 0) {
      throw new Error(`${variable} must be a positive integer (got "${raw}")`);
    }
    return n;
  }
  return raw;
}

function coerceTrustProxy(raw) {
  if (raw === 'true') return true;
  if (raw === 'false' || raw === '0') return false;
  if (/^[1-9]\d*$/.test(raw)) return Number(raw);
  return raw;
}

function coerceAllowedOrigins(raw) {
  if (raw === '*') return '*';
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

// An identity provider configured only halfway, or required but absent, is an
// instance where nobody can sign in -- so it fails here rather than at the
// first sign-in attempt. A bare issuer also gets normalized (no trailing
// slash, since discovery is fetched at issuer + /.well-known/...) and the
// client id is stringified, because YAML spells a numeric id as a number.
function normalizeOidc(config) {
  const oidc = config.auth.oidc;
  if (oidc.issuer !== null && oidc.issuer !== undefined && oidc.issuer !== '') {
    if (typeof oidc.issuer !== 'string') {
      throw new Error(`auth.oidc.issuer must be a URL string (got ${JSON.stringify(oidc.issuer)})`);
    }
    oidc.issuer = oidc.issuer.replace(/\/+$/, '');
    const parsed = URL.parse(oidc.issuer);
    if (!parsed || (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')) {
      throw new Error(`auth.oidc.issuer must be an http or https URL (got "${oidc.issuer}")`);
    }
  } else {
    oidc.issuer = null;
  }
  oidc.clientId =
    oidc.clientId === null || oidc.clientId === undefined ? null : String(oidc.clientId);
  oidc.clientSecret =
    oidc.clientSecret === null || oidc.clientSecret === undefined || oidc.clientSecret === ''
      ? null
      : String(oidc.clientSecret);
  if ((oidc.issuer || oidc.clientId || oidc.clientSecret) && !(oidc.issuer && oidc.clientId)) {
    throw new Error('auth.oidc.issuer and auth.oidc.clientId must be set together');
  }
  if (oidc.required && !oidc.issuer) {
    throw new Error(
      'auth.oidc.required is true, but auth.oidc.issuer and auth.oidc.clientId are not both set',
    );
  }
}

// The approval page belongs to the web client, so its URL is configured rather
// than derived from publicBaseUrl: the API cannot know which path the client
// serves it on, and a wrong guess would send people to a 404 mid sign-in.
function normalizeDevice(config) {
  const device = config.auth.device;
  if (
    device.verificationUrl === undefined ||
    device.verificationUrl === null ||
    device.verificationUrl === ''
  ) {
    device.verificationUrl = null;
    return;
  }
  if (typeof device.verificationUrl !== 'string') {
    throw new Error(
      `auth.device.verificationUrl must be a URL string (got ${JSON.stringify(device.verificationUrl)})`,
    );
  }
  const parsed = URL.parse(device.verificationUrl);
  if (!parsed || (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')) {
    throw new Error(
      `auth.device.verificationUrl must be an http or https URL (got "${device.verificationUrl}")`,
    );
  }
  device.verificationUrl = parsed.toString();
}

// The banner is one line of plain text: the web client scrolls it, so a
// paragraph or a newline would either be unwrapped into one run or cut off. The
// link is where "details" points, and is dropped when there is no message for
// it to belong to.
function normalizeBanner(config) {
  const banner = config.banner ?? {};
  const message =
    banner.message === null || banner.message === undefined
      ? ''
      : String(banner.message).replace(/\s+/g, ' ').trim();
  if (message.length > 280) {
    throw new Error(`banner.message must be at most 280 characters (got ${message.length})`);
  }
  banner.message = message === '' ? null : message;

  const link = banner.link === null || banner.link === undefined ? '' : String(banner.link).trim();
  if (link === '') {
    banner.link = null;
  } else {
    const parsed = URL.parse(link);
    if (!parsed || (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')) {
      throw new Error(`banner.link must be an http or https URL (got "${link}")`);
    }
    banner.link = parsed.toString();
  }
  if (!banner.message) banner.link = null;
  config.banner = banner;
}

// A WebAuthn relying party is an origin's host, so the RP ID is a bare
// hostname: a scheme, a port, or a path in it would be accepted here and then
// silently never match what the browser sends. The name is free text shown by
// the authenticator.
function normalizeWebauthn(config) {
  const webauthn = config.auth.webauthn;
  if (webauthn.rpId === undefined || webauthn.rpId === null || webauthn.rpId === '') {
    webauthn.rpId = null;
  } else {
    webauthn.rpId = String(webauthn.rpId).trim().toLowerCase().replace(/\.$/, '');
    if (!/^[a-z0-9.-]+$/.test(webauthn.rpId) || webauthn.rpId.includes('..')) {
      throw new Error(
        `auth.webauthn.rpId must be a bare hostname, like "example.com" (got "${webauthn.rpId}")`,
      );
    }
  }
  webauthn.rpName =
    webauthn.rpName === undefined || webauthn.rpName === null || webauthn.rpName === ''
      ? null
      : String(webauthn.rpName);
}

function applyEnvOverrides(config) {
  for (const [key, variable] of ENV_OVERRIDES) {
    const raw = process.env[variable];
    if (raw === undefined) continue;
    const parts = key.split('.');
    const target = parts.slice(0, -1).reduce((acc, part) => acc[part], config);
    const last = parts[parts.length - 1];
    if (key === 'trustProxy') {
      target[last] = coerceTrustProxy(raw);
      continue;
    }
    if (key === 'cors.allowedOrigins') {
      target[last] = coerceAllowedOrigins(raw);
      continue;
    }
    target[last] = coerceEnvValue(
      raw,
      parts.reduce((acc, part) => acc[part], DEFAULTS),
      variable,
      key,
    );
  }
}

// Where the configuration file is when the caller named none. A `config.yaml`
// in the working directory wins: that is how a checkout runs, and it is where an
// operator mounting a file by hand puts it. Without one the file belongs to the
// data directory, the one directory a container deployment is told to give a
// volume. The image deliberately does not carry a `config.yaml`, so an
// environment-only deployment has nowhere else to keep settings an admin saves
// from the interface, and a change written there survives a redeploy.
function defaultConfigPath() {
  const local = path.resolve(configFilename());
  if (existsSync(local)) return local;
  const dataDir = process.env[envName('DATA_DIR')] ?? DEFAULTS.dataDir;
  return path.resolve(process.cwd(), dataDir, configFilename());
}

export function loadConfig(configPath) {
  const filePath = configPath ?? defaultConfigPath();
  let raw = {};
  if (existsSync(filePath)) {
    const parsed = YAML.parse(readFileSync(filePath, 'utf8'));
    if (parsed && typeof parsed === 'object') raw = parsed;
  }
  const config = mergeDeep(DEFAULTS, raw);
  applyEnvOverrides(config);
  config.apiRoot = normalizeApiRoot(config.apiRoot);
  normalizeOidc(config);
  normalizeWebauthn(config);
  normalizeDevice(config);
  normalizeBanner(config);
  const reauthWindow = config.auth.reauthWindowMinutes;
  const reauthWindowMinutes = Number(reauthWindow);
  if (
    !['number', 'string'].includes(typeof reauthWindow) ||
    !Number.isFinite(reauthWindowMinutes) ||
    reauthWindowMinutes <= 0
  ) {
    throw new Error('auth.reauthWindowMinutes must be a finite positive number');
  }
  config.auth.reauthWindowMinutes = reauthWindowMinutes;
  // Registration policy is a closed set. `invite` and `allowlist` are in the
  // design and not built; accepting the name would leave registration open to
  // everyone, which is the one thing those settings exist to prevent.
  if (!['open', 'closed'].includes(config.auth.policy.registration)) {
    throw new Error(
      `auth.policy.registration must be "open" or "closed" (got ${JSON.stringify(config.auth.policy.registration)}); invite and allowlist are not implemented`,
    );
  }
  if (!config.database.url) {
    throw new Error(
      `database.url is required (set it in ${filePath}, pass a file via --config, or set ${envName('DATABASE_URL')})`,
    );
  }
  config.dataDir = path.resolve(process.cwd(), config.dataDir);
  // Recorded so the admin configuration endpoints can edit the same file this
  // instance was started from, rather than guessing at a name. It can name a
  // file that does not exist yet: the first save creates it.
  config.configPath = path.resolve(filePath);
  // Resolved last, because the driver mixture is validated against the rest of
  // the configuration: a passkey method needs a relying party, and a mail-using
  // method needs a mail chain that can deliver.
  normalizeDriverConfig(config, { env: process.env });
  return config;
}
