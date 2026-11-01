// Imported for the side effect: the built-in descriptors have to be in the
// registry before any configuration is resolved against it.
import './index.js';
import { deviceEnabled } from '../device.js';
import { oidcEnabled } from '../oidc.js';
import { webauthnSettings } from '../mfa.js';
import { checkOptions, getDescriptor, getKind, listKinds } from './registry.js';
import { DriverConfigError } from './host.js';

// The order the admin surface lists kinds in. Auth and mail first because
// those are the ones an instance is expected to touch.
export const KIND_ORDER = [
  'auth',
  'mail',
  'storage',
  'cache',
  'jobs',
  'search',
  'captcha',
  'scanner',
  'notify',
  'metrics',
  'compiler',
];

// `{ driver: x }`, `{ driver: x, options: {} }`, or the driver name on its own.
// A kind that can hold several is an array of those; a single one is not, so a
// configuration that names two mail providers without the list is refused.
export function asDriverEntry(value) {
  if (typeof value === 'string') return { driver: value, options: {} };
  if (value && typeof value === 'object' && typeof value.driver === 'string') {
    return { driver: value.driver, options: value.options ?? {}, id: value.id };
  }
  return null;
}

function asList(value, { multiple }) {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value;
  return multiple ? [value] : [value];
}

// The methods an instance offers. Without `auth.methods` the set is derived
// from the settings that used to spell the same thing one key at a time, so an
// existing config file keeps working and keeps meaning what it meant.
function methodEntries(config) {
  if (Array.isArray(config.auth.methods)) {
    return config.auth.methods.map(asDriverEntry).filter(Boolean);
  }
  const methods = [];
  if (!config.auth.oidc.required) methods.push({ driver: 'password', options: {} });
  if (oidcEnabled(config)) {
    methods.push({
      driver: 'oidc',
      options: {
        issuer: config.auth.oidc.issuer,
        clientId: config.auth.oidc.clientId,
        clientSecret: config.auth.oidc.clientSecret,
      },
    });
  }
  methods.push({
    driver: 'passkey',
    options: {
      rpId: config.auth.webauthn.rpId,
      rpName: config.auth.webauthn.rpName,
    },
  });
  if (deviceEnabled(config)) {
    methods.push({
      driver: 'device-code',
      options: { verificationUrl: config.auth.device.verificationUrl },
    });
  }
  return methods;
}

function mailEntries(config) {
  const drivers = config.mail?.drivers;
  if (drivers === undefined || drivers === null || (Array.isArray(drivers) && !drivers.length)) {
    return [{ driver: 'none', options: {} }];
  }
  return asList(drivers, { multiple: true }).map(asDriverEntry).filter(Boolean);
}

function kindEntries(config, kind) {
  if (kind === 'auth') return methodEntries(config);
  if (kind === 'mail') return mailEntries(config);
  const configured = config.drivers?.[kind];
  if (configured === undefined || configured === null) return defaultEntries(kind);
  return asList(configured, { multiple: getKind(kind)?.multiple === true })
    .map(asDriverEntry)
    .filter(Boolean);
}

// The driver an unconfigured kind runs: the behavior the server had before the
// kind existed. A kind with no default is one that must be configured.
function defaultEntries(kind) {
  const defaults = {
    storage: { driver: 'local', options: {} },
    cache: { driver: 'memory', options: {} },
    jobs: { driver: 'inline', options: {} },
    search: { driver: 'postgres', options: {} },
    captcha: { driver: 'none', options: {} },
    scanner: { driver: 'patterns', options: {} },
    notify: { driver: 'in-app', options: {} },
    metrics: { driver: 'prometheus', options: {} },
    compiler: { driver: 'extend', options: {} },
  };
  return defaults[kind] ? [defaults[kind]] : [];
}

// The ids a kind's instances are addressed by: the driver name for the first
// one, numbered after that unless the configuration named it.
export function withIds(entries) {
  const counts = new Map();
  return entries.map((entry) => {
    const count = (counts.get(entry.driver) ?? 0) + 1;
    counts.set(entry.driver, count);
    return {
      ...entry,
      id: entry.id ?? (count === 1 ? entry.driver : `${entry.driver}-${count}`),
    };
  });
}

function checkPasskeyConfiguration(config, entry, errors) {
  try {
    webauthnSettings({
      ...config,
      auth: {
        ...config.auth,
        webauthn: {
          rpId: entry.options?.rpId ?? config.auth.webauthn.rpId,
          rpName: entry.options?.rpName ?? config.auth.webauthn.rpName,
        },
      },
    });
  } catch (error) {
    errors.push({ field: 'auth.passkey.rpId', message: error.message });
  }
}

function validate(config, instances) {
  const errors = [];

  // A kind this build does not have would otherwise be merged in and ignored,
  // and the operator would believe a backend they configured was in use.
  for (const [kind, value] of Object.entries(config.drivers ?? {})) {
    if (value === null || value === undefined) continue;
    if (!getKind(kind)) {
      errors.push({ field: `drivers.${kind}`, message: `Unknown driver kind "${kind}".` });
    }
  }

  for (const kind of listKinds()) {
    const entries = withIds(instances[kind.id] ?? []);
    const seen = new Set();
    for (const entry of entries) {
      if (seen.has(entry.id)) {
        errors.push({
          field: `${kind.id}.${entry.id}`,
          message: 'Two instances of this kind share an id.',
        });
      }
      seen.add(entry.id);
      const descriptor = getDescriptor(kind.id, entry.driver);
      if (!descriptor) {
        const available = [...(getKind(kind.id)?.drivers.keys() ?? [])].join(', ');
        errors.push({
          field: `${kind.id}.driver`,
          message: `Unknown driver "${entry.driver}". Available: ${available}.`,
        });
        continue;
      }
      errors.push(...checkOptions(kind.id, entry.driver, entry.options));
      if (kind.id === 'auth' && entry.driver === 'passkey') {
        checkPasskeyConfiguration(config, entry, errors);
      }
    }
    instances[kind.id] = entries;
  }

  if (!instances.auth.length) {
    errors.push({ field: 'auth.methods', message: 'At least one sign-in method is required.' });
  }

  const mailDelivers = instances.mail.some((entry) => entry.driver !== 'none');
  for (const entry of instances.auth) {
    const descriptor = getDescriptor('auth', entry.driver);
    if (descriptor?.requirements?.mail && !mailDelivers) {
      errors.push({
        field: `auth.${entry.driver}`,
        message: 'This method sends mail, and mail.drivers is none.',
      });
    }
  }
  if (
    instances.mail.some((entry) => entry.driver === 'log') &&
    config.environment === 'production'
  ) {
    errors.push({
      field: 'mail.drivers',
      message: 'The log mail driver is refused in production, where nobody reads the log.',
    });
  }

  // Storage is where the blobs already are; a backend change is a migration,
  // not a setting, so a config that names one this build cannot read fails at
  // startup instead of losing the existing files quietly.
  for (const entry of instances.storage ?? []) {
    if (entry.driver === 'local' && typeof entry.options?.dir === 'string') {
      if (entry.options.dir.trim() === '') {
        errors.push({ field: 'drivers.storage.dir', message: 'Must be a directory.' });
      }
    }
  }

  if (errors.length) throw new DriverConfigError(errors);
  return instances;
}

// Everything the host needs, keyed by kind. `auth` and `mail` come from their
// own sections because those were the two that existed before the registry;
// the rest live under `drivers`.
export function resolveDriverConfig(config) {
  const instances = {};
  for (const kind of listKinds()) instances[kind.id] = kindEntries(config, kind.id);
  validate(config, instances);
  return instances;
}

// Projects the method set back onto the settings the rest of the server still
// reads -- the OIDC client, the WebAuthn relying party, the device approval
// page -- so those modules do not each have to learn the registry.
function projectLegacyFields(config, methods) {
  const oidc = methods.find((entry) => entry.driver === 'oidc');
  const passkey = methods.find((entry) => entry.driver === 'passkey');
  const device = methods.find((entry) => entry.driver === 'device-code');

  config.auth.passwordEnabled = methods.some((entry) => entry.driver === 'password');
  // Assigned rather than merged: a method set that leaves the provider out has
  // to actually turn it off, or the old section would keep advertising it.
  config.auth.oidc.issuer = oidc?.options.issuer ?? null;
  config.auth.oidc.clientId = oidc?.options.clientId ?? null;
  config.auth.oidc.clientSecret = oidc?.options.clientSecret ?? null;
  config.auth.webauthn.rpId = passkey?.options.rpId ?? null;
  config.auth.webauthn.rpName = passkey?.options.rpName ?? null;
  config.auth.device.verificationUrl = device?.options.verificationUrl ?? null;
}

export function normalizeDriverConfig(config) {
  const methods = methodEntries(config);
  config.auth.methods = methods.map((entry) => ({
    driver: entry.driver,
    ...(entry.id ? { id: entry.id } : {}),
    ...(Object.keys(entry.options ?? {}).length ? { options: entry.options } : {}),
  }));
  projectLegacyFields(config, methods);
  const instances = resolveDriverConfig(config);
  config.driverInstances = instances;
  return config;
}

// What a secret option looks like on read: enough to know it is set, never the
// value. The admin endpoint pairs this with the driver's option schema.
export function maskOptions(kind, entry) {
  const schema = getDescriptor(kind, entry.driver)?.options ?? [];
  const masked = {};
  for (const [key, value] of Object.entries(entry.options ?? {})) {
    const option = schema.find((candidate) => candidate.key === key);
    masked[key] = option?.secret
      ? { set: value !== null && value !== undefined && value !== '' }
      : value;
  }
  return masked;
}
