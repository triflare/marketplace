import { fieldErrors } from './errors.js';

const MAX_FIELDS = 20;
const NAME = /^[A-Za-z][A-Za-z0-9_]*$/;

// `?fields=id,name` trims a response to the keys a caller asked for. Parsing is
// separate from projecting so a request that names no fields costs nothing and
// a malformed list is a 422 before any query runs.
export function parseFields(raw) {
  if (raw === undefined) return null;
  if (typeof raw !== 'string') {
    throw fieldErrors([{ field: 'fields', message: 'Must be a comma-separated list of names.' }]);
  }
  const names = [
    ...new Set(
      raw
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean),
    ),
  ];
  if (names.length === 0) {
    throw fieldErrors([{ field: 'fields', message: 'Name at least one field.' }]);
  }
  if (names.length > MAX_FIELDS) {
    throw fieldErrors([{ field: 'fields', message: `At most ${MAX_FIELDS} fields.` }]);
  }
  for (const name of names) {
    if (!NAME.test(name)) {
      throw fieldErrors([{ field: 'fields', message: `"${name}" is not a field name.` }]);
    }
  }
  return names;
}

function pick(item, names) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
  const out = {};
  for (const name of names) {
    if (Object.hasOwn(item, name)) out[name] = item[name];
  }
  return out;
}

// A collection keeps its envelope and projects each item; a single document is
// projected whole. Naming only fields the resource does not have is a mistake
// worth reporting rather than answering with an empty object, but an empty page
// has nothing to check against, so it is left alone.
export function projectBody(body, names) {
  if (names === null || !body || typeof body !== 'object' || Buffer.isBuffer(body)) return body;

  if (Array.isArray(body.data)) {
    if (body.data.length > 0) {
      const present = new Set();
      for (const item of body.data) {
        if (item && typeof item === 'object') for (const key of Object.keys(item)) present.add(key);
      }
      if (!names.some((name) => present.has(name))) {
        throw fieldErrors([
          { field: 'fields', message: `This resource has none of: ${names.join(', ')}.` },
        ]);
      }
    }
    return { ...body, data: body.data.map((item) => pick(item, names)) };
  }

  if (!names.some((name) => Object.hasOwn(body, name))) {
    throw fieldErrors([
      { field: 'fields', message: `This resource has none of: ${names.join(', ')}.` },
    ]);
  }
  return pick(body, names);
}
