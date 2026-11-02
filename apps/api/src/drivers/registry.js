// The registry is a fixed table. A driver is a module that ships with the
// server, and a configuration naming one the table does not hold is a mistake
// rather than a cue to import something: loading a package name out of
// configuration is remote code execution with the database URL in scope.
const KINDS = new Map();

// `methods` is what every descriptor in the kind has to implement. Auth and
// mail differ enough that a shared method list would only be the union of
// both, so each kind declares its own.
export function defineKind({ id, label, methods, ctxFirst = [], multiple = false }) {
  if (!id || typeof id !== 'string') throw new Error('a driver kind needs an id');
  if (KINDS.has(id)) throw new Error(`driver kind "${id}" is defined twice`);
  for (const method of methods) {
    if (typeof method !== 'string') throw new Error(`driver kind "${id}" has a bad method name`);
  }
  KINDS.set(id, {
    id,
    label,
    methods: [...methods],
    // Auth's begin/complete/describe take the context first; everything else
    // takes it last, which is the shape the descriptors are written in.
    ctxFirst: new Set(ctxFirst),
    multiple,
    drivers: new Map(),
  });
  return id;
}

export function registerDriver(descriptor) {
  const kind = KINDS.get(descriptor?.kind);
  if (!kind) {
    throw new Error(`driver "${descriptor?.id}" names an unknown kind "${descriptor?.kind}"`);
  }
  if (typeof descriptor.id !== 'string' || descriptor.id === '') {
    throw new Error(`a ${kind.id} driver needs an id`);
  }
  if (kind.drivers.has(descriptor.id)) {
    throw new Error(`driver "${kind.id}/${descriptor.id}" is registered twice`);
  }
  for (const method of kind.methods) {
    if (typeof descriptor[method] !== 'function') {
      throw new Error(`driver "${kind.id}/${descriptor.id}" has no ${method}()`);
    }
  }
  kind.drivers.set(descriptor.id, {
    options: [],
    capabilities: {},
    requirements: {},
    ...descriptor,
  });
}

export function getKind(id) {
  return KINDS.get(id) ?? null;
}

export function getDescriptor(kind, id) {
  return KINDS.get(kind)?.drivers.get(id) ?? null;
}

export function listDescriptors(kind) {
  const entry = KINDS.get(kind);
  return entry ? [...entry.drivers.values()] : [];
}

export function listKinds() {
  return [...KINDS.values()].map(({ id, label }) => ({ id, label }));
}

// A descriptor's options are a form schema the admin surface renders and the
// configuration validator checks. A key the schema does not name is refused
// rather than stored, so a typo in config.yaml is an error instead of a
// silently ignored setting.
export function optionSchema(kind, driverId) {
  return getDescriptor(kind, driverId)?.options ?? [];
}

export function checkOptions(kind, driverId, options) {
  const schema = optionSchema(kind, driverId);
  const known = new Set(schema.map((option) => option.key));
  const errors = [];
  for (const key of Object.keys(options ?? {})) {
    if (!known.has(key)) {
      errors.push({ field: `${kind}.${driverId}.${key}`, message: 'Unknown option.' });
    }
  }
  for (const option of schema) {
    const value = options?.[option.key];
    if (value === undefined || value === null || value === '') {
      if (option.required) {
        errors.push({
          field: `${kind}.${driverId}.${option.key}`,
          message: 'A value is required.',
        });
      }
      continue;
    }
    if (option.type === 'boolean' && typeof value !== 'boolean') {
      errors.push({
        field: `${kind}.${driverId}.${option.key}`,
        message: 'Must be true or false.',
      });
    }
    if (option.type === 'number' && (!Number.isFinite(Number(value)) || Number(value) <= 0)) {
      errors.push({
        field: `${kind}.${driverId}.${option.key}`,
        message: 'Must be a positive number.',
      });
    }
    if (option.type === 'url' && !isHttpUrl(value)) {
      errors.push({
        field: `${kind}.${driverId}.${option.key}`,
        message: 'Must be an http or https URL.',
      });
    }
  }
  return errors;
}

function isHttpUrl(value) {
  if (typeof value !== 'string') return false;
  const parsed = URL.parse(value);
  return Boolean(parsed) && (parsed.protocol === 'https:' || parsed.protocol === 'http:');
}
