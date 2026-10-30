import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { beginEmailChange } from '../src/email-change.js';
import { apiPath, bearer, boot, resetDb, signup } from './helpers.mjs';

let app;
let config;
let db;

before(async () => {
  const booted = await boot({
    auth: { methods: [{ driver: 'password' }, { driver: 'magic-link' }] },
    mail: { drivers: [{ driver: 'file' }] },
  });
  app = booted.app;
  config = booted.config;
  db = booted.db;
});

function newestMail() {
  const dir = path.join(config.dataDir, 'mail');
  const files = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.eml'))
    .sort();
  return fs.readFileSync(path.join(dir, files[files.length - 1]), 'utf8');
}

function tokenFrom(eml) {
  const match = eml.match(/verify\?token=([0-9a-f]+)/);
  assert.ok(match, 'the message carries a verification link');
  return match[1];
}

function codeFrom(eml) {
  const match = eml.match(/code is (\d{6})/);
  assert.ok(match, 'the message carries a six-digit code');
  return match[1];
}

// Signs in by opening the link the message carries, which is also how an
// account with a mail-backed identity is created.
async function signInByEmail(email) {
  await request(app).post(apiPath('/auth/magic-link')).send({ email }).expect(202);
  const token = tokenFrom(newestMail());
  const signedIn = await request(app)
    .post(apiPath('/auth/magic-link/complete'))
    .send({ token })
    .expect(201);
  return signedIn.body;
}

test('an account reports the address its email sign-in uses', async () => {
  await resetDb();
  const { token } = await signInByEmail('First@Example.com');

  const state = await request(app).get(apiPath('/auth/email')).set(bearer(token)).expect(200);
  // The address is normalized on the way in, so the same spelling comes back.
  assert.deepEqual(state.body, { email: 'first@example.com', changeable: true });

  // Reading the account's own address is a session act, not a public one.
  await request(app).get(apiPath('/auth/email')).expect(401);
});

test('a change is proven at the new address before any identity moves', async () => {
  await resetDb();
  const { user, token } = await signInByEmail('before@example.com');

  const asked = await request(app)
    .post(apiPath('/auth/email/change'))
    .set(bearer(token))
    .send({ email: 'After@Example.com' })
    .expect(202);
  assert.deepEqual(asked.body, { sent: true });

  // The code went out before anything changed, so a failed delivery stays
  // visible in the outbox like every other message.
  const [outboxRow] = await db.MailOutbox.findMany({ orderBy: { Id: 'desc' } });
  assert.equal(outboxRow.Purpose, 'email-change');
  assert.equal(outboxRow.Status, 'sent');
  assert.equal(outboxRow.To, 'after@example.com');

  // Nothing has moved yet: the account still signs in as the old address.
  const stillOld = await request(app).get(apiPath('/auth/email')).set(bearer(token)).expect(200);
  assert.equal(stillOld.body.email, 'before@example.com');

  const code = codeFrom(newestMail());
  const wrong = code === '000000' ? '111111' : '000000';
  await request(app)
    .post(apiPath('/auth/email/confirm'))
    .set(bearer(token))
    .send({ email: 'after@example.com', code: wrong })
    .expect(422);

  const confirmed = await request(app)
    .post(apiPath('/auth/email/confirm'))
    .set(bearer(token))
    .send({ email: 'after@example.com', code })
    .expect(200);
  assert.deepEqual(confirmed.body, { email: 'after@example.com' });

  const moved = await request(app).get(apiPath('/auth/email')).set(bearer(token)).expect(200);
  assert.equal(moved.body.email, 'after@example.com');

  const identities = await db.AuthIdentities.findMany({ orderBy: { Id: 'asc' } });
  assert.deepEqual(
    identities
      .map((row) => [{ driver: row.Driver, subject: row.Subject, email: row.Email }])
      .flat(),
    [{ driver: 'magic-link', subject: 'after@example.com', email: 'after@example.com' }],
  );
  assert.ok(identities[0].VerifiedAt, 'the new address is recorded as verified');

  // A link sent to the new address finds the same account rather than making a
  // new one, which is what re-keying the identity buys.
  const again = await signInByEmail('after@example.com');
  assert.equal(again.user.namespace, user.namespace);
});

test('a spent code cannot move the address a second time', async () => {
  await resetDb();
  const { token } = await signInByEmail('once@example.com');
  await request(app)
    .post(apiPath('/auth/email/change'))
    .set(bearer(token))
    .send({ email: 'twice@example.com' })
    .expect(202);
  const code = codeFrom(newestMail());

  await request(app)
    .post(apiPath('/auth/email/confirm'))
    .set(bearer(token))
    .send({ email: 'twice@example.com', code })
    .expect(200);
  await request(app)
    .post(apiPath('/auth/email/confirm'))
    .set(bearer(token))
    .send({ email: 'twice@example.com', code })
    .expect(422);
});

test('a code is bound to the account that asked for it', async () => {
  await resetDb();
  const first = await signInByEmail('owner@example.com');
  const second = await signInByEmail('someone-else@example.com');

  await request(app)
    .post(apiPath('/auth/email/change'))
    .set(bearer(first.token))
    .send({ email: 'wanted@example.com' })
    .expect(202);
  const code = codeFrom(newestMail());

  // The second account cannot spend the first one's code, even presenting the
  // same address: the challenge names the account it was issued to.
  await request(app)
    .post(apiPath('/auth/email/confirm'))
    .set(bearer(second.token))
    .send({ email: 'wanted@example.com', code })
    .expect(422);
});

test('an address another account signs in with is refused and left untouched', async () => {
  await resetDb();
  const mine = await signInByEmail('mine@example.com');
  const theirs = await signInByEmail('theirs@example.com');

  const refused = await request(app)
    .post(apiPath('/auth/email/change'))
    .set(bearer(mine.token))
    .send({ email: 'theirs@example.com' })
    .expect(409);
  assert.match(refused.body.detail, /already in use/);

  const before = await request(app).get(apiPath('/auth/email')).set(bearer(mine.token)).expect(200);
  assert.equal(before.body.email, 'mine@example.com');

  // Asking for the address on the account is not a change either.
  await request(app)
    .post(apiPath('/auth/email/change'))
    .set(bearer(mine.token))
    .send({ email: 'mine@example.com' })
    .expect(422);

  const after = await request(app)
    .get(apiPath('/auth/email'))
    .set(bearer(theirs.token))
    .expect(200);
  assert.equal(after.body.email, 'theirs@example.com');
});

test('a password-only account has no address to change', async () => {
  await resetDb();
  const created = await signup(app, 'password-only');
  assert.equal(created.status, 201);

  const state = await request(app)
    .get(apiPath('/auth/email'))
    .set(bearer(created.body.token))
    .expect(200);
  assert.deepEqual(state.body, { email: null, changeable: false });

  await request(app)
    .post(apiPath('/auth/email/change'))
    .set(bearer(created.body.token))
    .send({ email: 'later@example.com' })
    .expect(409);
});

test('without a mail driver a change is refused before any code is minted', async () => {
  await resetDb();
  const created = await signup(app, 'no-mail');
  assert.equal(created.status, 201);
  const user = await db.Users.findUnique({ where: { Namespace: 'no-mail' } });
  const mailOff = {
    ...config,
    driverInstances: { ...config.driverInstances, mail: [{ driver: 'none', options: {} }] },
  };

  await assert.rejects(
    beginEmailChange(
      {
        db,
        config: mailOff,
        mail: { send: async () => assert.fail('no message should be sent') },
        rateLimiter: { signupCheck: async () => {} },
        ip: '127.0.0.1',
      },
      user,
      'later@example.com',
    ),
    (error) => error.status === 403,
  );
  assert.equal(await db.AuthChallenges.count(), 0);
});
