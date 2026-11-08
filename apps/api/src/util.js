import { readFileSync } from 'node:fs';
import semver from 'semver';

export const NAMESPACE_PATTERN = '^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$';
export const EXTENSION_ID_PATTERN = '^[a-z0-9]{1,64}$';
export const COLOR_PATTERN = '^#[0-9a-fA-F]{6}$';

export const namespacePattern = new RegExp(NAMESPACE_PATTERN);
export const extensionIdPattern = new RegExp(EXTENSION_ID_PATTERN);
export const colorPattern = new RegExp(COLOR_PATTERN);

export function isValidNamespace(value) {
  return typeof value === 'string' && namespacePattern.test(value);
}

export function isValidExtensionId(value) {
  return typeof value === 'string' && extensionIdPattern.test(value);
}

export function normalizeSemver(value) {
  return typeof value === 'string' ? semver.valid(value) : null;
}

export function compareSemver(a, b) {
  return semver.compare(a, b);
}

export function maxVersionBySemver(versions) {
  let max = null;
  for (const version of versions) {
    if (!semver.valid(version)) continue;
    if (max === null || semver.gt(version, max)) max = version;
  }
  return max;
}

export function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// Query parameters and route parameters arrive as strings under normal
// routing, but a crafted query can surface arrays or objects. Returning a
// non-string as null keeps downstream string operations on verified values.
export function asString(value) {
  return typeof value === 'string' ? value : null;
}

// Strip trailing slashes by walking back once instead of matching /\/+$/, which
// backtracks on a long run of slashes and turns a user-supplied URL into a
// denial-of-service primitive. Linear in the length of the string.
export function stripTrailingSlashes(text) {
  let end = text.length;
  while (end > 0 && text.charCodeAt(end - 1) === 0x2f) end -= 1;
  return text.slice(0, end);
}

// Route parameters and driver messages can carry line breaks and other control
// characters, which would let a caller forge additional log lines. Replacing
// them keeps one event on one line.
// The characters that would let a caller break out of one log line. A predicate
// rather than a regular expression: these codepoints are the point here, not the
// accident no-control-regex exists to catch.
function isLogControl(code) {
  return code <= 0x1f || code === 0x7f || code === 0x2028 || code === 0x2029;
}

export function sanitizeLogText(value) {
  let out = '';
  let needsSpace = false;
  for (const char of String(value)) {
    if (isLogControl(char.codePointAt(0))) {
      needsSpace = out.length > 0;
      continue;
    }
    if (needsSpace) {
      out += ' ';
      needsSpace = false;
    }
    out += char;
  }
  return out;
}

// Read a file that may not exist, in one operation. existsSync() followed by a
// read is a check-then-use pair: the file can be created or removed between the
// two calls, so the answer describes a file that is no longer there.
export function readFileIfPresent(file) {
  try {
    return readFileSync(file);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

// "v0", "/v0", "/v0/" all mean the same thing; "''" or "/" means "no prefix".
export function normalizeApiRoot(value) {
  if (value === undefined || value === null) return 'v0';
  return String(value).replace(/^\/+|\/+$/g, '');
}

export function foldText(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function buildSearchText({ name, id, namespace, description }) {
  return foldText([name, id, namespace, description].join(' '));
}
