import { Router } from 'express';
import { HttpError, notFound } from '../errors.js';
import { pageLinks } from '../pagination.js';
import { problemCatalogue, problemFor } from '../problems.js';
import { product } from '../product.js';
import { normalizeApiRoot } from '../util.js';
import { specText } from '../openapi.js';

// The process endpoints: liveness, readiness, the problem catalogue, the spec
// this build is running, and a links index. They sit at the origin root rather
// than under the version prefix, because they describe the instance rather than
// a versioned resource, and an error's `type` resolves to /problems/<slug> from
// any request path.
export function makeSystemRouter({ config, db }) {
  const router = Router();
  const apiRoot = normalizeApiRoot(config.apiRoot);
  const root = apiRoot ? `/${apiRoot}` : '';

  function readSpec() {
    const spec = specText();
    if (spec === null) throw notFound('This build does not ship an OpenAPI description.');
    return spec;
  }

  router.get('/health', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({
      status: 'ok',
      version: product.version,
      uptime: Math.round(process.uptime()),
    });
  });

  router.get('/ready', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      // A typed count proves the connection and the migrated schema at once,
      // which is what a readiness probe is for; a bare SELECT 1 would only
      // prove the socket.
      await db.Users.count();
    } catch {
      throw new HttpError(503, {
        slug: 'service-unavailable',
        detail: 'The database does not answer yet.',
      });
    }
    res.json({ status: 'ready' });
  });

  router.get('/problems', (req, res) => {
    res.json({
      data: problemCatalogue(),
      _links: pageLinks(req),
    });
  });

  router.get('/problems/:slug', (req, res) => {
    const problem = problemFor(req.params.slug);
    if (!problem) throw notFound('No problem type has that slug.');
    res.json(problem);
  });

  router.get('/openapi/v1.yml', (req, res) => {
    const body = readSpec();
    res.set('Content-Type', 'application/yaml; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=300');
    res.send(body);
  });

  router.get('/docs', (req, res) => {
    const specUrl = '/openapi/v1.yml';
    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${product.name} API</title>
<style>
  body { font: 16px/1.6 system-ui, sans-serif; max-width: 42rem; margin: 3rem auto; padding: 0 1rem; color: #18181b; }
  code { background: #f4f4f5; padding: 0.1rem 0.3rem; border-radius: 4px; }
  ul { padding-left: 1.2rem; }
  @media (prefers-color-scheme: dark) { body { background: #18181b; color: #e4e4e7; } code { background: #27272a; } a { color: #4ade80; } }
</style>
</head>
<body>
<h1>${product.name} API</h1>
<p>Version ${product.version}, served under <code>${root || '/'}</code>.</p>
<p>Every response is JSON except the badges, the feeds, and the spec. Errors are
<a href="/problems">RFC 9457 problem documents</a>; a client can resolve a
<code>type</code> against any slug the catalogue lists.</p>
<ul>
  <li><a href="${specUrl}">OpenAPI description</a> (<code>${specUrl}</code>)</li>
  <li><a href="/">Links index</a></li>
  <li><a href="/health">Health</a> and <a href="/ready">readiness</a></li>
</ul>
<p>Load the spec into Swagger UI, Insomnia, or Bruno to explore it; this page
does not bundle a UI, so it stays a few hundred bytes and works offline.</p>
</body>
</html>`;
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=300');
    res.send(html);
  });

  router.get('/', (req, res) => {
    res.json({
      name: product.name,
      version: product.version,
      tagline: product.tagline,
      apiRoot: root || '/',
      docs: '/docs',
      openapi: '/openapi/v1.yml',
      problems: '/problems',
      health: '/health',
      ready: '/ready',
      _links: {
        self: '/',
        me: `${root}/me`,
        extensions: `${root}/extensions`,
        trending: `${root}/extensions/trending`,
        search: `${root}/extensions?q=`,
        users: `${root}/users`,
        orgs: `${root}/orgs`,
        sessions: `${root}/sessions`,
        tokens: `${root}/tokens`,
        notifications: `${root}/notifications`,
        reports: `${root}/reports`,
        stats: `${root}/stats`,
        meta: `${root}/meta`,
        terms: `${root}/terms`,
        privacy: `${root}/privacy`,
        feed: `${root}/feed.atom`,
      },
    });
  });

  return router;
}
