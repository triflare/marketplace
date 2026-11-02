import { createHash } from 'node:crypto';
import { parseFields, projectBody } from './fields.js';

// Response properties every JSON route gets without each one remembering:
// Link headers for pages, a weak ETag so an anonymous reader can revalidate,
// and `no-store` on anything carrying a credential or a one-time secret.
const SECRET_KEYS = new Set(['token', 'password', 'backupCodes', 'secret']);

function carriesSecret(value, depth = 0) {
  if (depth > 4 || value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some((entry) => carriesSecret(entry, depth + 1));
  for (const [key, entry] of Object.entries(value)) {
    if (SECRET_KEYS.has(key) && entry !== null && entry !== undefined && entry !== '') {
      return true;
    }
    if (carriesSecret(entry, depth + 1)) return true;
  }
  return false;
}

function pageLinks(value) {
  if (!value || typeof value !== 'object') return null;
  const parts = [];
  for (const rel of ['prev', 'next']) {
    const href = value[rel];
    if (typeof href === 'string' && href !== '') {
      parts.push(`<${href}>; rel="${rel}"`);
    }
  }
  return parts.length > 0 ? parts.join(', ') : null;
}

function etagFor(text) {
  return `W/"${createHash('sha256').update(text).digest('base64url').slice(0, 24)}"`;
}

function matches(header, etag) {
  if (typeof header !== 'string') return false;
  if (header.trim() === '*') return true;
  return header
    .split(',')
    .map((entry) => entry.trim())
    .some((entry) => entry === etag || entry === etag.replace(/^W\//, ''));
}

// Wrapping `res.json` rather than every route keeps the policy in one place:
// a route that wants different caching says so with its own header and the
// wrapper leaves it alone.
export function makeResponseHints() {
  return function responseHints(req, res, next) {
    const json = res.json.bind(res);

    res.json = (body) => {
      // `?fields=` trims a successful GET to the keys it names. Errors keep
      // their shape: a projection is for a representation, not for a failure.
      if ((req.method === 'GET' || req.method === 'HEAD') && res.statusCode < 300) {
        const fields = parseFields(req.query.fields);
        if (fields) body = projectBody(body, fields);
      }

      if (body && typeof body === 'object' && !Buffer.isBuffer(body)) {
        if (!res.get('Cache-Control')) {
          // A secret must never be written down, and a response built around
          // the caller's own credential is that caller's business alone. A
          // route that sets its own policy (an avatar's long max-age) keeps it.
          if (carriesSecret(body)) res.set('Cache-Control', 'no-store');
          else if (req.get('authorization')) res.set('Cache-Control', 'private, no-store');
        }

        // A route may already have set a Link (a deprecation's successor, for
        // instance); the page links are appended rather than replacing it.
        const links = pageLinks(body._links);
        if (links) {
          const existing = res.get('Link');
          res.set('Link', existing ? `${existing}, ${links}` : links);
        }

        // An anonymous representation gets a weak validator derived from its
        // bytes. A route that names a revision (a profile, a version) sets its
        // own instead, and that one is honoured the same way: emitting a
        // validator and then ignoring a conditional request for it is worse
        // than emitting none.
        const readable = (req.method === 'GET' || req.method === 'HEAD') && res.statusCode < 300;
        if (
          readable &&
          !res.get('ETag') &&
          !req.get('authorization') &&
          !String(res.get('Cache-Control') ?? '').includes('no-store')
        ) {
          res.set('ETag', etagFor(JSON.stringify(body)));
        }
        const etag = readable ? res.get('ETag') : null;
        if (etag && matches(req.get('if-none-match'), etag)) {
          res.status(304).end();
          return res;
        }
      }
      return json(body);
    };

    next();
  };
}
