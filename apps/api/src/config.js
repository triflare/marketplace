import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { configFilename, product } from './product.js';
import { normalizeApiRoot } from './util.js';
import { normalizeDriverConfig } from './drivers/config.js';

export const DEFAULTS = {
  port: 3000,
  dataDir: './data',
  apiRoot: product.defaults?.apiRoot ?? '/v0',
  publicBaseUrl: 'http://localhost:3000',
  // `production` turns on the checks that only make sense on a live instance,
  // such as refusing the log mail driver. It is a setting rather than an
  // environment variable so the onboarding screen can ask for it.
  environment: 'development',
  onboarding: {
    // Set once the first-run screen has written the settings it needs. A config
    // that predates onboarding has no marker; a database URL is enough to treat
    // it as finished.
    completed: false,
  },
  process: {
    // Whether something outside restarts this process after a requested
    // restart, and how long a restart drains in-flight requests.
    supervised: false,
    drainSeconds: 10,
  },
  metrics: {
    intervalMs: 60 * 60 * 1000,
  },
  secrets: {
    // A key used to hash download addresses. Null means generate one into the
    // data directory on first use.
    downloadHashKey: null,
  },
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
// null is a value rather than the absence of one. `null` is how an operator
// spells "off" in the file; no other key may use it, or a mistyped port or quota
// would become null instead of failing startup.
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

// Where the configuration file is when the caller named none. A `config.yaml`
// in the working directory wins: that is how a checkout runs, and it is where an
// operator mounting a file by hand puts it. Without one the file belongs to the
// data directory, the one directory a container deployment is told to give a
// volume. The image deliberately does not carry a `config.yaml`, so a first-run
// deployment has nowhere else to keep the settings onboarding writes, and those
// settings survive a redeploy.
function defaultConfigPath() {
  const local = path.resolve(configFilename());
  if (existsSync(local)) return local;
  return path.resolve(process.cwd(), DEFAULTS.dataDir, configFilename());
}

// Whether the first-run screen still has work to do. A config written before
// onboarding existed has no marker; a database URL in it means it was already
// configured by hand, so it is treated as finished rather than dragged back to
// the setup screen. An explicit `onboarding.completed: false` always wins, and a
// config with no database URL is never finished even if the marker is set.
function resolveOnboarding(config, raw) {
  const hasDatabaseUrl =
    typeof config.database.url === 'string' && config.database.url.trim() !== '';
  const markerPresent =
    raw?.onboarding !== null &&
    typeof raw?.onboarding === 'object' &&
    Object.hasOwn(raw.onboarding, 'completed');
  const completed = markerPresent ? config.onboarding.completed === true : hasDatabaseUrl;
  config.onboarding.completed = completed;
  config.setupRequired = !completed || !hasDatabaseUrl;
  if (!hasDatabaseUrl) config.database.url = null;
}

// The origins a browser is allowed to call from. The file can spell the list as
// a YAML list or as one comma-separated string, because both are natural to
// write by hand. A value that cannot be compared exactly against an Origin
// header is refused here rather than silently never matching.
function normalizeCors(config) {
  const value = config.cors?.allowedOrigins ?? '*';
  if (value === '*') {
    config.cors.allowedOrigins = '*';
    return;
  }
  const list = Array.isArray(value)
    ? value
    : String(value)
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
  if (list.includes('*')) {
    config.cors.allowedOrigins = '*';
    return;
  }
  const origins = [];
  for (const origin of list) {
    const parsed = URL.parse(String(origin));
    if (
      !parsed ||
      (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') ||
      parsed.origin === 'null' ||
      parsed.origin !== String(origin).replace(/\/$/, '')
    ) {
      throw new Error(`cors.allowedOrigins entries must be absolute origins (got "${origin}")`);
    }
    origins.push(parsed.origin);
  }
  config.cors.allowedOrigins = origins;
}

function requireInteger(value, key, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${key} must be a whole number between ${min} and ${max}`);
  }
}

// The settings that are not part of a section with its own normalizer. Each one
// is a closed set or a number the rest of the server does arithmetic with, so a
// typo is refused at startup rather than becoming `NaN` on a request path.
function normalizeServerSettings(config) {
  if (!['development', 'production'].includes(config.environment)) {
    throw new Error(
      `environment must be "development" or "production" (got ${JSON.stringify(config.environment)})`,
    );
  }
  if (typeof config.onboarding?.completed !== 'boolean') {
    throw new Error('onboarding.completed must be true or false');
  }
  if (typeof config.process?.supervised !== 'boolean') {
    throw new Error('process.supervised must be true or false');
  }
  requireInteger(config.process.drainSeconds, 'process.drainSeconds');
  requireInteger(config.metrics?.intervalMs, 'metrics.intervalMs');
  const key = config.secrets?.downloadHashKey;
  if (key !== null && (typeof key !== 'string' || key.trim() === '')) {
    throw new Error('secrets.downloadHashKey must be a non-empty string or null');
  }
  if (key !== null) config.secrets.downloadHashKey = key.trim();
}

export function loadConfig(configPath) {
  const filePath = configPath ?? defaultConfigPath();
  let raw = {};
  if (existsSync(filePath)) {
    const parsed = YAML.parse(readFileSync(filePath, 'utf8'));
    if (parsed && typeof parsed === 'object') raw = parsed;
  }
  const config = mergeDeep(DEFAULTS, raw);
  config.apiRoot = normalizeApiRoot(config.apiRoot);
  normalizeOidc(config);
  normalizeWebauthn(config);
  normalizeDevice(config);
  normalizeBanner(config);
  normalizeCors(config);
  normalizeServerSettings(config);
  resolveOnboarding(config, raw);
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
  // A missing database URL is not fatal: it is what the first-run screen is
  // for. `setupRequired` tells the entry point to serve that screen instead of
  // opening a pool it has nowhere to point at.
  config.dataDir = path.resolve(process.cwd(), config.dataDir);
  // Recorded so the admin configuration endpoints can edit the same file this
  // instance was started from, rather than guessing at a name. It can name a
  // file that does not exist yet: the first save creates it.
  config.configPath = path.resolve(filePath);
  // Resolved last, because the driver mixture is validated against the rest of
  // the configuration: a passkey method needs a relying party, and a mail-using
  // method needs a mail chain that can deliver.
  normalizeDriverConfig(config);
  return config;
}
