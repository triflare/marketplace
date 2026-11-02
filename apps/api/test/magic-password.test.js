import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { acceptTerms, apiPath, bearer, boot, resetDb } from './helpers.mjs';

let app;

before(async () => {
  ({ app } = await boot({
    auth: { methods: [{ driver: 'magic-password' }] },
    mail: { drivers: [{ driver: 'file' }] },
  }));
});

test('GET /auth reports the generated-password method and no password form', async () => {
  const r = await request(app).get(apiPath('/auth')).expect(200);
  assert.equal(r.body.passwordAuth, false);
  assert.deepEqual(
    r.body.methods.map((method) => method.driver),
    ['magic-password'],
  );
});

test('registration returns the password once and signs the account in', async () => {
  await resetDb();
  const created = await request(app)
    .post(apiPath('/auth/magic-password/register'))
    .send({ email: 'worker@example.com' })
    .expect(201);
  assert.equal(created.body.user.namespace, 'worker');
  assert.ok(created.body.password.length >= 20);
  assert.equal(created.body.passwordShownOnce, true);
  assert.match(created.body.token, /^[0-9a-f]{64}$/);

  await acceptTerms(app, created.body.user.namespace, created.body.token);

  const signedIn = await request(app)
    .post(apiPath('/sessions'))
    .send({ email: 'worker@example.com', password: created.body.password })
    .expect(201);
  assert.equal(signedIn.body.user.namespace, 'worker');
});

test('the address is unique across accounts', async () => {
  await resetDb();
  await request(app)
    .post(apiPath('/auth/magic-password/register'))
    .send({ email: 'once@example.com' })
    .expect(201);
  await request(app)
    .post(apiPath('/auth/magic-password/register'))
    .send({ email: 'ONCE@example.com' })
    .expect(409);
});

test('a wrong password is refused, and rotation replaces the old one', async () => {
  await resetDb();
  const created = await request(app)
    .post(apiPath('/auth/magic-password/register'))
    .send({ email: 'rotate@example.com' })
    .expect(201);
  await acceptTerms(app, created.body.user.namespace, created.body.token);

  await request(app)
    .post(apiPath('/sessions'))
    .send({ email: 'rotate@example.com', password: 'not-the-password' })
    .expect(401);

  const rotated = await request(app)
    .post(apiPath('/auth/magic-password/rotate'))
    .set(bearer(created.body.token))
    .expect(201);
  assert.notEqual(rotated.body.password, created.body.password);

  await request(app)
    .post(apiPath('/sessions'))
    .send({ email: 'rotate@example.com', password: created.body.password })
    .expect(401);
  await request(app)
    .post(apiPath('/sessions'))
    .send({ email: 'rotate@example.com', password: rotated.body.password })
    .expect(201);
});
