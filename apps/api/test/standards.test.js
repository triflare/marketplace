import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {
  apiPath,
  bearer,
  boot,
  publishProject,
  resetDb,
  signupAndAccept,
  uniqNs,
} from './helpers.mjs';
import { HttpError } from '../src/errors.js';
import { PROBLEMS, problemFor } from '../src/problems.js';

let app;
let db;
before(async () => {
  ({ app, db } = await boot());
});
beforeEach(resetDb);
after(async () => {
  await db.$disconnect();
});

async function publishAs(ns, nsToken, adminToken, id, version) {
  await publishProject(app, ns, id, nsToken, { version });
  await request(app)
    .patch(apiPath(`/@${ns}/${id}/versions/${version}`))
    .set('If-Match', '*')
    .set(bearer(adminToken))
    .send({ status: 'approved' })
    .expect(200);
}

test('every response carries a request id, and a supplied one is kept', async () => {
  const generated = await request(app).get(apiPath('/meta')).expect(200);
  assert.equal(typeof generated.headers['x-request-id'], 'string');
  assert.ok(generated.headers['x-request-id'].length > 8);

  const supplied = await request(app)
    .get(apiPath('/meta'))
    .set('X-Request-Id', 'gateway-abc-123')
    .expect(200);
  assert.equal(supplied.headers['x-request-id'], 'gateway-abc-123');
});

test('a request id that cannot be a header value is replaced', async () => {
  const response = await request(app)
    .get(apiPath('/meta'))
    .set('X-Request-Id', 'a'.repeat(200))
    .expect(200);
  assert.notEqual(response.headers['x-request-id'], 'a'.repeat(200));
});

test('an error is a problem document with a catalogue type and the request id', async () => {
  const response = await request(app).get(apiPath('/@nobody/nothing')).expect(404);
  assert.match(response.headers['content-type'], /application\/problem\+json/);
  assert.equal(response.body.type, '/problems/not-found');
  assert.equal(response.body.status, 404);
  assert.equal(response.body.title, 'Not Found');
  assert.equal(response.body.instance, apiPath('/@nobody/nothing'));
  assert.equal(response.body.requestId, response.headers['x-request-id']);
});

test('a 401 sends a bearer challenge, naming an invalid token when one was sent', async () => {
  const missing = await request(app).get(apiPath('/me')).expect(401);
  assert.equal(missing.headers['www-authenticate'], 'Bearer');

  const invalid = await request(app)
    .get(apiPath('/me'))
    .set('Authorization', 'Bearer not-a-token')
    .expect(401);
  assert.match(invalid.headers['www-authenticate'], /^Bearer error="invalid_token"/);
});

test('the problem catalogue lists every slug and serves one at a time', async () => {
  const catalogue = await request(app).get('/problems').expect(200);
  assert.ok(catalogue.body.data.length > 5);
  const notFound = catalogue.body.data.find((entry) => entry.slug === 'not-found');
  assert.equal(notFound.type, '/problems/not-found');
  assert.equal(notFound.status, 404);
  assert.equal(typeof notFound.description, 'string');

  const one = await request(app).get('/problems/rate-limited').expect(200);
  assert.equal(one.body.status, 429);
  assert.equal(one.body.type, '/problems/rate-limited');

  await request(app).get('/problems/no-such-problem').expect(404);
});

test('an anonymous GET carries a weak ETag and revalidates with 304', async () => {
  const first = await request(app).get(apiPath('/meta')).expect(200);
  const etag = first.headers.etag;
  assert.match(etag, /^W\//);

  const revalidated = await request(app)
    .get(apiPath('/meta'))
    .set('If-None-Match', etag)
    .expect(304);
  assert.equal(revalidated.text ?? '', '');
});

test('a response carrying a secret is not cacheable', async () => {
  const { token } = await signupAndAccept(app, uniqNs());
  const created = await request(app)
    .post(apiPath('/tokens'))
    .set(bearer(token))
    .send({ name: 'ci', scopes: ['publish'] })
    .expect(201);
  assert.equal(created.headers['cache-control'], 'no-store');
  assert.equal(created.headers.location, apiPath(`/tokens/${created.body.id}`));
  assert.ok(created.body.token);
});

test('a response for a signed-in caller is private and not stored', async () => {
  const { token } = await signupAndAccept(app, uniqNs());
  const me = await request(app).get(apiPath('/me')).set(bearer(token)).expect(200);
  assert.equal(me.headers['cache-control'], 'private, no-store');
  // A revision tag, not a hash of the bytes: it is the same document for the
  // owner and for a passer-by, and If-Match compares against it.
  assert.match(me.headers.etag, /^"[^"]+"$/);

  await request(app)
    .get(apiPath('/me'))
    .set(bearer(token))
    .set('If-None-Match', me.headers.etag)
    .expect(304);
});

test('a problem type always reads the same title', () => {
  for (const [slug, entry] of Object.entries(PROBLEMS)) {
    const error = new HttpError(entry.status, {
      slug,
      detail: 'detail',
      title: 'Some other title',
    });
    assert.equal(error.title, entry.title, `${slug} kept a caller-supplied title`);
    assert.equal(error.toJSON().type, `/problems/${slug}`);
    assert.equal(problemFor(slug).title, entry.title);
  }
});

test('the catalogue names the specific failures, not just the buckets', async () => {
  const { body } = await request(app).get('/problems').expect(200);
  const slugs = body.data.map((entry) => entry.slug);
  for (const slug of ['already-sent', 'mail-unavailable', 'configuration-read-only']) {
    assert.ok(slugs.includes(slug), `${slug} is missing from the catalogue`);
  }
  const alreadySent = body.data.find((entry) => entry.slug === 'already-sent');
  assert.equal(alreadySent.title, 'Already Sent');
  assert.equal(alreadySent.status, 409);
});

test('a page of a collection names its neighbour in a Link header', async () => {
  const admin = await signupAndAccept(app, uniqNs());
  const ownerNs = uniqNs();
  const owner = await signupAndAccept(app, ownerNs);
  await publishAs(ownerNs, owner.token, admin.token, 'alpha', '1.0.0');
  await publishProject(app, ownerNs, 'beta', owner.token, { version: '1.0.0' });

  const page = await request(app).get(apiPath('/extensions?limit=1')).expect(200);
  assert.equal(page.body.data.length, 1);
  assert.match(page.headers.link, /rel="next"/);
  assert.ok(page.body._links.next);
});

test('q filters the listing, and /search says it is being retired', async () => {
  const admin = await signupAndAccept(app, uniqNs());
  const ownerNs = uniqNs();
  const owner = await signupAndAccept(app, ownerNs);
  await publishAs(ownerNs, owner.token, admin.token, 'alphabet', '1.0.0');
  await publishProject(app, ownerNs, 'numbers', owner.token, { version: '1.0.0' });

  const filtered = await request(app).get(apiPath('/extensions?q=alpha')).expect(200);
  assert.deepEqual(
    filtered.body.data.map((entry) => entry.id),
    ['alphabet'],
  );

  const empty = await request(app).get(apiPath('/extensions?q=   ')).expect(200);
  assert.equal(empty.body.data.length, 2);

  const deprecated = await request(app).get(apiPath('/search?query=alpha')).expect(200);
  assert.equal(deprecated.headers.deprecation, 'true');
  assert.match(deprecated.headers.sunset, /GMT$/);
  assert.match(deprecated.headers.link, /rel="successor-version"/);
  assert.equal(deprecated.body.data.length, 1);
});

test('the process endpoints answer at the origin root', async () => {
  const health = await request(app).get('/health').expect(200);
  assert.equal(health.body.status, 'ok');
  assert.equal(health.headers['cache-control'], 'no-store');

  const ready = await request(app).get('/ready').expect(200);
  assert.equal(ready.body.status, 'ready');

  const index = await request(app).get('/').expect(200);
  assert.equal(index.body.apiRoot, apiPath(''));
  assert.equal(index.body._links.extensions, apiPath('/extensions'));
  assert.equal(index.body.openapi, '/openapi/v1.yml');
});

test('the running spec and a docs page are served', async () => {
  const spec = await request(app).get('/openapi/v1.yml').expect(200);
  assert.match(spec.headers['content-type'], /application\/yaml/);
  assert.match(spec.text, /^openapi: '3\.1\.0'/);

  const docs = await request(app).get('/docs').expect(200);
  assert.match(docs.headers['content-type'], /text\/html/);
  assert.match(docs.text, /\/openapi\/v1\.yml/);
});
