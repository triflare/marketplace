import { fieldErrors } from './errors.js';

// Where a browser is sent once a flow that started here hands it back. A path
// is resolved against publicBaseUrl and has to stay on that origin; an absolute
// URL has to name an origin the instance already trusts. Either way the stored
// value is the resolved URL, because otherwise a flow carrying an attacker's
// returnTo would hand that site a freshly minted sign-in code.
export function returnToPath(value, config) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > 1024) {
    throw fieldErrors([{ field: 'returnTo', message: 'Must be a path or an allowed origin.' }]);
  }
  // Control characters are stripped by the URL parser rather than encoded, so
  // "/<tab>/evil.example" would first pass the leading-slash check here and
  // then resolve to "//evil.example" off-origin. Backslashes are refused for
  // the same reason on the browsers that treat them as slashes.
  if (hasControlChars(value) || value.includes('\\')) {
    throw fieldErrors([{ field: 'returnTo', message: 'Must be a path on this instance.' }]);
  }
  const base = URL.parse(config.publicBaseUrl);
  if (value.startsWith('/')) {
    const target = resolveAgainst(value, config.publicBaseUrl);
    if (!base || !target || target.origin !== base.origin) {
      throw fieldErrors([{ field: 'returnTo', message: 'Must be a path on this instance.' }]);
    }
    return `${target.pathname}${target.search}${target.hash}`;
  }
  const parsed = URL.parse(value);
  if (!parsed || (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')) {
    throw fieldErrors([{ field: 'returnTo', message: 'Must be a path or an allowed origin.' }]);
  }
  if (!allowedReturnOrigins(config).has(parsed.origin)) {
    throw fieldErrors([
      {
        field: 'returnTo',
        message:
          "Must be a path on this instance, or an origin in the instance's cors.allowedOrigins.",
      },
    ]);
  }
  return parsed.toString();
}

// The same check, answered as an absolute URL: a message has to carry a whole
// address, while an API response may keep the path the caller gave.
export function resolveReturnToUrl(value, config) {
  const target = returnToPath(value, config);
  return target === null ? null : new URL(target, config.publicBaseUrl).toString();
}

// For a value that arrives in a URL someone clicked. A refusal here is not an
// error the visitor can act on, so the flow falls back to the instance root.
export function safeReturnToUrl(value, config) {
  try {
    return resolveReturnToUrl(value, config);
  } catch {
    return null;
  }
}

export function hasControlChars(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function resolveAgainst(value, base) {
  try {
    return new URL(value, base);
  } catch {
    return null;
  }
}

function allowedReturnOrigins(config) {
  const origins = new Set();
  const base = URL.parse(config.publicBaseUrl);
  if (base) origins.add(base.origin);
  for (const origin of Array.isArray(config.cors.allowedOrigins)
    ? config.cors.allowedOrigins
    : []) {
    const parsed = URL.parse(origin);
    if (parsed) origins.add(parsed.origin);
  }
  return origins;
}
