import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import YAML from 'yaml';
import { loadConfig } from './config.js';
import { createDb } from './db.js';
import { fieldErrors, HttpError } from './errors.js';
import { configStorage } from './server-config.js';
import { product } from './product.js';

// Everything the first-run screen asks for. The list is deliberately longer
// than "a database URL": an instance that starts and then has to be fixed by
// hand is a worse first run than one that collects the handful of settings an
// operator almost always changes. Each entry is also the validation contract,
// so the browser form, the JSON API, and the file all agree.
export const ONBOARDING_FIELDS = [
  {
    key: 'database.url',
    type: 'database-url',
    label: 'PostgreSQL connection URL',
    help: 'The database the registry keeps its accounts, extensions, and settings in.',
    placeholder: 'postgres://user:password@db:5432/triflare',
    required: true,
    secret: true,
  },
  {
    key: 'publicBaseUrl',
    type: 'url',
    label: 'Public base URL of this API',
    help: 'Used in install links, badges, and OAuth redirects. The address a browser can reach.',
    placeholder: 'https://registry.example.com',
    required: true,
  },
  {
    key: 'environment',
    type: 'select',
    label: 'Environment',
    help: 'Production turns on the checks that only make sense on a live instance.',
    options: [
      { value: 'production', label: 'Production' },
      { value: 'development', label: 'Development' },
    ],
    required: true,
  },
  {
    key: 'port',
    type: 'number',
    label: 'Listen port',
    help: 'Port the API process binds. Changing it needs a restart.',
    min: 1,
    max: 65535,
  },
  {
    key: 'apiRoot',
    type: 'text',
    label: 'API path prefix',
    help: 'Every route is served under this prefix. /v1 is the default.',
    placeholder: '/v1',
  },
  {
    key: 'requireHttps',
    type: 'boolean',
    label: 'Require HTTPS',
    help: 'Reject plain HTTP requests. Turn this on when TLS terminates in front of the API.',
  },
  {
    key: 'trustProxy',
    type: 'boolean',
    label: 'Behind a reverse proxy',
    help: 'Read the forwarded scheme and client address so rate limits count each visitor.',
  },
  {
    key: 'cors.allowedOrigins',
    type: 'origins',
    label: 'Browser origins',
    help: 'The web client origin(s), comma separated, or * for any. Passkeys and magic links need this.',
    placeholder: 'https://registry.example.com',
  },
  {
    key: 'auth.policy.registration',
    type: 'select',
    label: 'Registration',
    help: 'Whether an unknown person may create an account. The first account is an admin either way.',
    options: [
      { value: 'open', label: 'Open' },
      { value: 'closed', label: 'Closed' },
    ],
  },
  {
    key: 'auth.sessionTtlDays',
    type: 'number',
    label: 'Session lifetime (days)',
    help: 'Applies to sessions created after the change.',
    min: 1,
    max: 365,
  },
  {
    key: 'auth.webauthn.rpId',
    type: 'text',
    label: 'Passkey domain',
    help: 'Bare hostname passkeys are scoped to. Leave empty to use the hostname of the public base URL.',
    placeholder: 'example.com',
    nullable: true,
  },
  {
    key: 'auth.webauthn.rpName',
    type: 'text',
    label: 'Passkey display name',
    help: 'The name an authenticator shows when it offers to store a passkey.',
    nullable: true,
  },
  {
    key: 'auth.device.verificationUrl',
    type: 'url',
    label: 'CLI approval page',
    help: 'Page a browser opens to approve a CLI sign-in. Leave empty to turn the device flow off.',
    placeholder: 'https://registry.example.com/device',
    nullable: true,
  },
  {
    key: 'process.supervised',
    type: 'boolean',
    label: 'Process is supervised',
    help: 'Allow POST /admin/system/restart to exit so something outside can start the process again.',
  },
  {
    key: 'process.drainSeconds',
    type: 'number',
    label: 'Restart drain (seconds)',
    help: 'How long a requested restart waits for in-flight requests.',
    min: 1,
    max: 600,
  },
  {
    key: 'metrics.intervalMs',
    type: 'number',
    label: 'Download rollup interval (ms)',
    help: 'How often the daily download statistics are recomputed.',
    min: 1000,
    max: 86_400_000,
  },
  {
    key: 'logging.requests',
    type: 'boolean',
    label: 'Log every request',
    help: 'Write one structured line per request in addition to the in-memory counters.',
  },
  {
    key: 'secrets.downloadHashKey',
    type: 'secret',
    label: 'Download address hash key',
    help: 'Optional. Leave empty to generate one into the data directory. Changing it clears existing hashes.',
    nullable: true,
  },
];

const FIELD_BY_KEY = new Map(ONBOARDING_FIELDS.map((field) => [field.key, field]));

function readAt(source, key) {
  return key.split('.').reduce((acc, part) => (acc == null ? acc : acc[part]), source);
}

function isBlank(value) {
  return value === null || value === undefined || value === '';
}

function invalid(field, message) {
  throw fieldErrors([{ field: field.key, message }]);
}

function coerce(field, value) {
  if (isBlank(value)) {
    if (field.required) invalid(field, 'A value is required.');
    return null;
  }

  switch (field.type) {
    case 'database-url': {
      const text = String(value).trim();
      let parsed;
      try {
        parsed = new URL(text);
      } catch {
        invalid(field, 'Must be a PostgreSQL connection URL.');
      }
      if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
        invalid(field, 'Must start with postgres:// or postgresql://.');
      }
      return text;
    }
    case 'url': {
      const text = String(value).trim();
      let parsed;
      try {
        parsed = new URL(text);
      } catch {
        invalid(field, 'Must be an absolute URL.');
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        invalid(field, 'Must be an http or https URL.');
      }
      return text.replace(/\/+$/, '') || text;
    }
    case 'number': {
      const n = typeof value === 'number' ? value : Number(value);
      if (!Number.isInteger(n)) invalid(field, 'Must be a whole number.');
      if (field.min !== undefined && n < field.min) {
        invalid(field, `Must be at least ${field.min}.`);
      }
      if (field.max !== undefined && n > field.max) {
        invalid(field, `Must be at most ${field.max}.`);
      }
      return n;
    }
    case 'boolean': {
      if (typeof value === 'boolean') return value;
      if (value === 'true') return true;
      if (value === 'false') return false;
      invalid(field, 'Must be true or false.');
      break;
    }
    case 'select': {
      const text = String(value);
      if (!field.options.some((option) => option.value === text)) {
        invalid(
          field,
          `Must be one of: ${field.options.map((option) => option.value).join(', ')}.`,
        );
      }
      return text;
    }
    case 'origins': {
      const list = Array.isArray(value)
        ? value
        : String(value)
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean);
      if (list.includes('*')) return '*';
      const origins = [];
      for (const origin of list) {
        let parsed;
        try {
          parsed = new URL(String(origin));
        } catch {
          invalid(field, `"${origin}" is not an absolute origin.`);
        }
        if (
          (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
          parsed.origin === 'null' ||
          parsed.origin !== String(origin).replace(/\/$/, '')
        ) {
          invalid(field, `"${origin}" is not an absolute origin.`);
        }
        origins.push(parsed.origin);
      }
      return origins;
    }
    case 'secret': {
      if (typeof value !== 'string' || value.trim() === '') {
        invalid(field, 'Must be a non-empty string.');
      }
      return value.trim();
    }
    default: {
      const text = String(value).trim();
      if (field.nullable && text === '') return null;
      return text;
    }
  }
}

// The value a field would have after this submission. A field the caller left
// out keeps what the file already says, so the form only has to send what it
// changed and a required key can be satisfied by an earlier run.
function effectiveValue(field, patch, config) {
  if (Object.hasOwn(patch, field.key)) return coerce(field, patch[field.key]);
  const current = readAt(config, field.key);
  if (field.secret) {
    // A secret is never sent back to the browser, so an empty submission means
    // "keep the one already stored" rather than "clear it".
    return current;
  }
  if (isBlank(current) && field.required) invalid(field, 'A value is required.');
  return current;
}

function publicFields(config, storage) {
  return ONBOARDING_FIELDS.map((field) => {
    const current = readAt(config, field.key);
    return {
      key: field.key,
      type: field.type,
      label: field.label,
      help: field.help ?? null,
      placeholder: field.placeholder ?? null,
      required: field.required === true,
      nullable: field.nullable === true,
      secret: field.secret === true,
      options: field.options ?? null,
      min: field.min ?? null,
      max: field.max ?? null,
      value: field.secret ? null : (current ?? null),
      configured: field.secret ? !isBlank(current) : !isBlank(current),
    };
  }).concat([
    {
      // Not a setting: the screen needs to say where the file is and whether a
      // change to it survives a redeploy.
      key: '_storage',
      type: 'info',
      label: 'Configuration file',
      value: storage.path,
      writable: storage.writable,
      persistent: storage.persistent,
      reason: storage.reason,
    },
  ]);
}

/** Whether first-run setup is still needed, and what the form should ask. */
export function onboardingStatus(config, options = {}) {
  const storage = configStorage(config.configPath, options);
  return {
    required: config.setupRequired === true,
    editable: storage.writable,
    persistent: storage.persistent,
    reason: storage.reason,
    configPath: storage.path,
    product: { name: product.name, version: product.version, tagline: product.tagline },
    fields: publicFields(config, storage),
  };
}

function yamlSource(file) {
  return existsSync(file) ? readFileSync(file, 'utf8') : '';
}

// A probe before the file is committed. A URL that parses but points at nothing
// is the most common first-run mistake, and finding it here keeps the instance
// on the setup screen instead of writing a config the next boot cannot use.
async function probeDatabase(config) {
  let db;
  try {
    db = createDb(config);
    await db.$queryRaw`SELECT 1`;
  } catch (error) {
    throw new HttpError(502, {
      slug: 'service-unavailable',
      detail: `The database did not answer: ${error.message}`,
    });
  } finally {
    await db?.$disconnect().catch(() => {});
  }
}

/**
 * Validates the submitted settings, writes them through the YAML document so an
 * operator's comments and key order survive, and marks onboarding complete.
 *
 * The candidate is written to a sibling temporary file and loaded with the same
 * `loadConfig` the server uses before it replaces the real file. A setting that
 * passes the form but fails the server's own checks therefore leaves the
 * original file exactly as it was.
 */
export async function applyOnboarding(config, patch, options = {}) {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) {
    throw fieldErrors([{ field: 'settings', message: 'Must be an object of settings.' }]);
  }
  const storage = configStorage(config.configPath, options);
  if (!storage.writable) {
    throw new HttpError(409, {
      slug: 'configuration-read-only',
      detail:
        storage.reason ??
        'The configuration file is not writable by this process, so onboarding cannot save anything.',
    });
  }

  const unknown = Object.keys(patch).filter((key) => !FIELD_BY_KEY.has(key));
  if (unknown.length) {
    throw fieldErrors(
      unknown.map((key) => ({
        field: key,
        message: 'This is not an onboarding setting.',
      })),
    );
  }

  const errors = [];
  const values = {};
  for (const field of ONBOARDING_FIELDS) {
    try {
      values[field.key] = effectiveValue(field, patch, config);
    } catch (error) {
      errors.push(...(error.errors ?? [{ field: field.key, message: error.message }]));
    }
  }
  if (errors.length) throw fieldErrors(errors);

  const document = YAML.parseDocument(yamlSource(storage.path));
  if (document.contents === null) document.contents = document.createNode({});
  for (const [key, value] of Object.entries(values)) {
    document.setIn(key.split('.'), value);
  }
  // The marker is what tells the next boot to skip this screen. It is written
  // only after the values above have passed validation.
  document.setIn(['onboarding', 'completed'], true);

  const dir = path.dirname(storage.path);
  mkdirSync(dir, { recursive: true });
  const temporary = path.join(
    dir,
    `.${path.basename(storage.path)}.${randomBytes(6).toString('hex')}.tmp`,
  );

  try {
    writeFileSync(temporary, document.toString(), { encoding: 'utf8', mode: 0o600 });
    const candidate = loadConfig(temporary);
    if (candidate.setupRequired) {
      throw fieldErrors([{ field: 'database.url', message: 'A database URL is required.' }]);
    }
    await probeDatabase(candidate);
    renameSync(temporary, storage.path);
    return { config: loadConfig(storage.path), changed: Object.keys(values) };
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
}
