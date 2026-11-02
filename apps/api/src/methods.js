import { HttpError } from './errors.js';
import { specDocument } from './openapi.js';
import { product } from './product.js';

// A request whose path exists but whose method does not gets a 405 naming the
// methods that do, rather than a 404 that reads as "this endpoint is gone".
//
// The table comes from the OpenAPI description rather than from an inspection of
// the Express router: the spec is the public contract, its paths are already
// linted, and a route that is missing from it is a defect the spec linter and
// the parity test are for. The paths are relative to the versioned root, so the
// request path is matched with that prefix stripped.
const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

// The endpoints outside the version prefix. They are a fixed handful, and they
// are deliberately not in the versioned description.
const UNVERSIONED = new Map([
  ['/', ['GET']],
  ['/docs', ['GET']],
  ['/health', ['GET']],
  ['/ready', ['GET']],
  ['/problems', ['GET']],
  ['/problems/{slug}', ['GET']],
  ['/openapi/v1.yml', ['GET']],
]);

function compile(template) {
  const source = template
    .split(/(\{[^}]+\})/)
    .map((part) => (part.startsWith('{') ? '[^/]+' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('');
  return new RegExp(`^${source}$`);
}

let table = null;

function loadTable() {
  const entries = [...UNVERSIONED].map(([template, methods]) => ({
    regexp: compile(template),
    methods: new Set(methods),
  }));
  const spec = specDocument();
  for (const [template, item] of Object.entries(spec?.paths ?? {})) {
    const methods = new Set();
    for (const method of METHODS) if (item[method]) methods.add(method.toUpperCase());
    if (methods.size > 0) entries.push({ regexp: compile(template), methods });
  }
  return entries;
}

function allowedFor(pathname, root) {
  table ??= loadTable();
  if (root && !pathname.startsWith(`${root}/`) && pathname !== root) return null;
  const relative = root ? pathname.slice(root.length) || '/' : pathname;
  for (const entry of table) {
    if (entry.regexp.test(relative)) return entry.methods;
  }
  return null;
}

function allowHeader(methods) {
  const listed = new Set(methods);
  if (listed.has('GET')) listed.add('HEAD');
  listed.add('OPTIONS');
  return [...listed].sort().join(', ');
}

export function makeMethodGuard(apiRoot) {
  const root = apiRoot ? `/${apiRoot}` : '';
  return function methodGuard(req, res, next) {
    const allowed = allowedFor(req.path, root);
    if (!allowed) return next();
    const method = req.method.toUpperCase();
    if (allowed.has(method) || (method === 'HEAD' && allowed.has('GET'))) return next();
    if (method === 'OPTIONS') {
      res.set('Allow', allowHeader(allowed)).status(204).end();
      return;
    }
    return next(
      new HttpError(405, {
        detail: `${product.name} serves ${allowHeader(allowed)} on this path.`,
        headers: { Allow: allowHeader(allowed) },
      }),
    );
  };
}
