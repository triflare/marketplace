import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {
  TEST_PUBLIC_BASE_URL,
  apiPath,
  boot,
  registerPasskey,
  resetDb,
  signupAccept,
} from './helpers.mjs';

let app;

before(async () => {
  ({ app } = await boot());
});

function origin() {
  const url = new URL(TEST_PUBLIC_BASE_URL);
  return { origin: url.origin, rpId: url.hostname };
}

test('a registered passkey signs its account in without a password', async () => {
  await resetDb();
  const account = await signupAccept(app, 'passkeyuser');
  const { authenticator } = await registerPasskey(app, account.token);

  const options = await request(app)
    .post(apiPath('/auth/passkey/options'))
    .send({ namespace: 'passkeyuser' })
    .expect(200);
  assert.ok(options.body.flowToken);
  assert.ok(options.body.options.challenge);

  const response = authenticator.authenticationResponse({
    challenge: options.body.options.challenge,
    ...origin(),
  });
  const signedIn = await request(app)
    .post(apiPath('/auth/passkey/verify'))
    .send({ flowToken: options.body.flowToken, response })
    .expect(201);
  assert.equal(signedIn.body.user.namespace, 'passkeyuser');
  assert.match(signedIn.body.token, /^[0-9a-f]{64}$/);
});

test('the assertion is spent by the sign-in it completes', async () => {
  await resetDb();
  const account = await signupAccept(app, 'replay');
  const { authenticator } = await registerPasskey(app, account.token);
  const options = await request(app)
    .post(apiPath('/auth/passkey/options'))
    .send({ namespace: 'replay' })
    .expect(200);
  const response = authenticator.authenticationResponse({
    challenge: options.body.options.challenge,
    ...origin(),
  });
  await request(app)
    .post(apiPath('/auth/passkey/verify'))
    .send({ flowToken: options.body.flowToken, response })
    .expect(201);
  await request(app)
    .post(apiPath('/auth/passkey/verify'))
    .send({ flowToken: options.body.flowToken, response })
    .expect(401);
});

test('an unknown namespace gets options and no account', async () => {
  await resetDb();
  const options = await request(app)
    .post(apiPath('/auth/passkey/options'))
    .send({ namespace: 'doesnotexist' })
    .expect(200);
  assert.equal(options.body.options.allowCredentials.length, 0);
  await request(app)
    .post(apiPath('/auth/passkey/verify'))
    .send({ flowToken: options.body.flowToken, response: { id: 'x' } })
    .expect(401);
});

test('a passkey from another account is refused', async () => {
  await resetDb();
  const owner = await signupAccept(app, 'ownerpasskey');
  const other = await signupAccept(app, 'otherpasskey');
  const { authenticator } = await registerPasskey(app, owner.token);
  await registerPasskey(app, other.token);

  const options = await request(app)
    .post(apiPath('/auth/passkey/options'))
    .send({ namespace: 'otherpasskey' })
    .expect(200);
  const response = authenticator.authenticationResponse({
    challenge: options.body.options.challenge,
    ...origin(),
  });
  await request(app)
    .post(apiPath('/auth/passkey/verify'))
    .send({ flowToken: options.body.flowToken, response })
    .expect(401);
});
