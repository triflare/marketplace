import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { apiPath, boot, uniqNs } from './helpers.mjs';

let app;

before(async () => {
  ({ app } = await boot({ auth: { policy: { registration: 'closed' } } }));
});

test('the descriptor says registration is closed', async () => {
  const r = await request(app).get(apiPath('/auth')).expect(200);
  assert.equal(r.body.registration, 'closed');
  // The methods are still advertised: an existing account signs in exactly as
  // it did before, and the page is what stops offering a new one.
  assert.ok(r.body.methods.length > 0);
});

test('a password sign-up is refused with the policy named', async () => {
  const r = await request(app)
    .post(apiPath('/users'))
    .send({ namespace: uniqNs(), password: 'testing-password' })
    .expect(403);
  assert.match(r.body.detail, /Registration is closed/);
});
