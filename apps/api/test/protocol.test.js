import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {
  apiPath,
  bearer,
  boot,
  projectTarball,
  publishProject,
  resetDb,
  signupAndAccept,
  uniqNs,
} from './helpers.mjs';

let app;
let db;
before(async () => {
  ({ app, db } = await boot());
});
beforeEach(resetDb);
after(async () => {
  await db.$disconnect();
});

async function approve(ns, adminToken, id, version) {
  const current = await request(app)
    .get(apiPath(`/@${ns}/${id}/versions/${version}`))
    .set(bearer(adminToken))
    .expect(200);
  await request(app)
    .patch(apiPath(`/@${ns}/${id}/versions/${version}`))
    .set(bearer(adminToken))
    .set('If-Match', current.headers.etag)
    .send({ status: 'approved' })
    .expect(200);
}

async function published(opts = {}) {
  const admin = await signupAndAccept(app, uniqNs());
  const ownerNs = uniqNs();
  const owner = await signupAndAccept(app, ownerNs);
  const created = await publishProject(app, ownerNs, 'hello', owner.token, {
    version: '1.0.0',
    code: 'console.log(1)',
    ...opts,
  });
  await approve(ownerNs, admin.token, 'hello', '1.0.0');
  return { admin, ownerNs, owner, created };
}

test('a known path with the wrong method answers 405 and names the right ones', async () => {
  const wrong = await request(app).post(apiPath('/meta')).send({}).expect(405);
  assert.equal(wrong.body.type, '/problems/method-not-allowed');
  assert.match(wrong.headers.allow, /GET/);
  assert.match(wrong.headers.allow, /OPTIONS/);

  // Express answers OPTIONS for a matched route itself, which is also where
  // its Allow header comes from.
  const asked = await request(app).options(apiPath('/meta')).expect(200);
  assert.match(asked.headers.allow, /GET/);

  // A path nobody serves is still a 404, not a 405.
  await request(app).post(apiPath('/nothing-here')).send({}).expect(404);
});

test('a deleted extension answers 410 for its versions, and 404 for a stranger', async () => {
  const { ownerNs, owner } = await published();
  await request(app)
    .delete(apiPath(`/@${ownerNs}/hello`))
    .set(bearer(owner.token))
    .expect(204);

  const version = await request(app)
    .get(apiPath(`/@${ownerNs}/hello/versions/1.0.0`))
    .expect(410);
  assert.equal(version.body.type, '/problems/gone');

  await request(app)
    .get(apiPath(`/@${ownerNs}/hello/versions/9.9.9`))
    .expect(410);
  await request(app)
    .get(apiPath(`/@${ownerNs}/hello/versions/1.0.0/download`))
    .expect(410);
  await request(app)
    .get(apiPath(`/@${ownerNs}/never-existed/versions/1.0.0`))
    .expect(404);
});

test('a profile write needs If-Match, and a stale one is refused', async () => {
  const ns = uniqNs();
  const { token } = await signupAndAccept(app, ns);

  await request(app)
    .patch(apiPath(`/users/${ns}`))
    .set(bearer(token))
    .send({ bio: 'hi' })
    .expect(428);

  const read = await request(app)
    .get(apiPath(`/users/${ns}`))
    .set(bearer(token))
    .expect(200);
  assert.match(read.headers.etag, /^"[^"]+"$/);

  await request(app)
    .patch(apiPath(`/users/${ns}`))
    .set(bearer(token))
    .set('If-Match', 'W/"not-the-revision"')
    .send({ bio: 'hi' })
    .expect(412);

  const updated = await request(app)
    .patch(apiPath(`/users/${ns}`))
    .set(bearer(token))
    .set('If-Match', read.headers.etag)
    .send({ bio: 'hi' })
    .expect(200);
  assert.notEqual(updated.headers.etag, read.headers.etag, 'the write moved the revision');

  // The revision the client started from is no longer current.
  await request(app)
    .patch(apiPath(`/users/${ns}`))
    .set(bearer(token))
    .set('If-Match', read.headers.etag)
    .send({ bio: 'again' })
    .expect(412);

  // `*` is a client choosing last-write-wins on purpose.
  await request(app)
    .patch(apiPath(`/users/${ns}`))
    .set(bearer(token))
    .set('If-Match', '*')
    .send({ bio: 'third' })
    .expect(200);
});

test('deprecating a version is conditional on the revision it was read from', async () => {
  const { ownerNs, owner } = await published();
  const path = apiPath(`/@${ownerNs}/hello/versions/1.0.0`);
  const read = await request(app).get(path).expect(200);

  await request(app)
    .patch(path)
    .set(bearer(owner.token))
    .send({ deprecationMessage: 'old' })
    .expect(428);

  const first = await request(app)
    .patch(path)
    .set(bearer(owner.token))
    .set('If-Match', read.headers.etag)
    .send({ deprecationMessage: 'old' })
    .expect(200);
  assert.notEqual(first.headers.etag, read.headers.etag);

  await request(app)
    .patch(path)
    .set(bearer(owner.token))
    .set('If-Match', read.headers.etag)
    .send({ deprecationMessage: 'older' })
    .expect(412);
});

test('an Idempotency-Key replays the first answer instead of creating twice', async () => {
  const { token } = await signupAndAccept(app, uniqNs());
  const body = { name: 'ci', scopes: ['publish'] };

  const first = await request(app)
    .post(apiPath('/tokens'))
    .set(bearer(token))
    .set('Idempotency-Key', 'retry-key-0001')
    .send(body)
    .expect(201);
  const replay = await request(app)
    .post(apiPath('/tokens'))
    .set(bearer(token))
    .set('Idempotency-Key', 'retry-key-0001')
    .send(body)
    .expect(201);

  assert.equal(replay.headers['idempotent-replayed'], 'true');
  assert.equal(replay.body.id, first.body.id);
  assert.equal(await db.AutomationTokens.count(), 1, 'the work happened once');

  const reused = await request(app)
    .post(apiPath('/tokens'))
    .set(bearer(token))
    .set('Idempotency-Key', 'retry-key-0001')
    .send({ name: 'other', scopes: ['publish'] })
    .expect(422);
  assert.equal(reused.body.type, '/problems/idempotency-key-reused');
});

test('Idempotency-Key makes a publish safe to retry', async () => {
  const admin = await signupAndAccept(app, uniqNs());
  const ownerNs = uniqNs();
  const owner = await signupAndAccept(app, ownerNs);
  await publishProject(app, ownerNs, 'hello', owner.token, { version: '1.0.0' });
  await approve(ownerNs, admin.token, 'hello', '1.0.0');

  // The same bytes with the same key are the same request: no second version.
  const bytes = await projectTarball({ id: 'hello', version: '2.0.0' });
  const send = () =>
    request(app)
      .post(apiPath(`/@${ownerNs}/hello/versions`))
      .set(bearer(owner.token))
      .set('Idempotency-Key', 'publish-key-01')
      .set('Content-Type', 'application/gzip')
      .send(bytes);
  const first = await send().expect(201);
  const replay = await send().expect(201);

  assert.equal(replay.headers['idempotent-replayed'], 'true');
  assert.equal(replay.body.version, first.body.version);
  assert.equal(
    await db.Versions.count({
      where: { Namespace: ownerNs, ExtensionId: 'hello', Version: '2.0.0' },
    }),
    1,
    'the retry did not create a second version',
  );
});

test('fields trims a representation and refuses names the resource lacks', async () => {
  await published();
  const trimmed = await request(app).get(apiPath('/extensions?fields=id,name')).expect(200);
  assert.deepEqual(Object.keys(trimmed.body.data[0]).sort(), ['id', 'name']);
  assert.ok(trimmed.body._links, 'the envelope survives a projection');

  const bad = await request(app).get(apiPath('/extensions?fields=not_a_field')).expect(422);
  assert.equal(bad.body.type, '/problems/validation-error');
});

test('include folds the owner and the newest version into a detail response', async () => {
  const { ownerNs } = await published();
  const plain = await request(app)
    .get(apiPath(`/@${ownerNs}/hello`))
    .expect(200);
  assert.equal(plain.body.owner, undefined);
  assert.equal(plain.body.latestVersion, undefined);

  const folded = await request(app)
    .get(apiPath(`/@${ownerNs}/hello?include=owner,latestVersion`))
    .expect(200);
  assert.equal(folded.body.owner.namespace, ownerNs);
  assert.equal(folded.body.latestVersion.version, '1.0.0');

  await request(app)
    .get(apiPath(`/@${ownerNs}/hello?include=nope`))
    .expect(422);
});

test('page is the documented name for the cursor a link carries', async () => {
  const admin = await signupAndAccept(app, uniqNs());
  const ownerNs = uniqNs();
  const owner = await signupAndAccept(app, ownerNs);
  await publishProject(app, ownerNs, 'alpha', owner.token);
  await approve(ownerNs, admin.token, 'alpha', '1.0.0');
  await publishProject(app, ownerNs, 'beta', owner.token);

  const first = await request(app).get(apiPath('/extensions?limit=1')).expect(200);
  const next = first.body._links.next;
  assert.match(next, /cursor=/);

  const asPage = next.replace('cursor=', 'page=');
  const second = await request(app).get(asPage).expect(200);
  const following = await request(app).get(next).expect(200);
  assert.deepEqual(
    second.body.data.map((row) => row.id),
    following.body.data.map((row) => row.id),
  );

  await request(app)
    .get(`${apiPath('/extensions?limit=1')}&page=one&cursor=two`)
    .expect(400);
});

test('a download redirects to the immutable blob and the blob is cacheable', async () => {
  const { ownerNs } = await published({ code: 'console.log(42)' });
  const download = await request(app)
    .get(apiPath(`/@${ownerNs}/hello/versions/1.0.0/download`))
    .expect(302);
  assert.match(download.headers.location, /\/v1\/blobs\/[0-9a-f]{64}$/);

  const blob = await request(app).get(download.headers.location).expect(200);
  assert.match(blob.headers['cache-control'], /immutable/);
  assert.match(blob.text, /console\.log\(42\)/);
});

test('a bucket that counts a publish reports what is left of the window', async () => {
  const ownerNs = uniqNs();
  const owner = await signupAndAccept(app, ownerNs);
  const created = await publishProject(app, ownerNs, 'hello', owner.token);
  assert.match(created.headers.ratelimit, /r=\d+/);
  assert.match(created.headers.ratelimit, /t=\d+/);
  assert.match(created.headers['ratelimit-policy'], /q=\d+;w=\d+/);
});
