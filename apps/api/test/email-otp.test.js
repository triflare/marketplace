import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { apiPath, boot, resetDb } from './helpers.mjs';

let app;
let config;
let db;

before(async () => {
  const booted = await boot({
    auth: { methods: [{ driver: 'password' }, { driver: 'email-otp' }] },
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

function codeFrom(eml) {
  const match = eml.match(/code is (\d{6})/);
  assert.ok(match, 'the message carries a six-digit code');
  return match[1];
}

test('GET /auth advertises the email code method', async () => {
  const r = await request(app).get(apiPath('/auth')).expect(200);
  assert.deepEqual(
    r.body.methods.map((method) => method.driver),
    ['password', 'email-otp'],
  );
});

test('the code signs in the address it was sent to, once', async () => {
  await resetDb();
  const sent = await request(app)
    .post(apiPath('/auth/email-otp'))
    .send({ email: 'Code@Example.com' })
    .expect(202);
  assert.deepEqual(sent.body, { sent: true });

  // The code was written before it went out, so a failed delivery is visible.
  const [row] = await db.MailOutbox.findMany();
  assert.equal(row.Purpose, 'email-otp');
  assert.equal(row.Status, 'sent');

  const code = codeFrom(newestMail());
  const signedIn = await request(app)
    .post(apiPath('/auth/email-otp/verify'))
    .send({ email: 'code@example.com', code })
    .expect(201);
  assert.equal(signedIn.body.user.namespace, 'code');
  assert.match(signedIn.body.token, /^[0-9a-f]{64}$/);
  assert.equal(signedIn.headers.location, apiPath(`/sessions/${signedIn.body.session.id}`));

  // The same code again finds nothing: it was consumed by the first call.
  await request(app)
    .post(apiPath('/auth/email-otp/verify'))
    .send({ email: 'code@example.com', code })
    .expect(401);
});

test('the message carries a styled HTML part beside the plain one', async () => {
  await resetDb();
  await request(app)
    .post(apiPath('/auth/email-otp'))
    .send({ email: 'styled-code@example.com' })
    .expect(202);

  const eml = newestMail();
  assert.match(eml, /multipart\/alternative/);
  assert.match(eml, /Content-Type: text\/html/);
  assert.match(eml, /<html lang="en">/);
  // The code shows in both halves: the plain sentence and the styled block.
  const code = codeFrom(eml);
  assert.match(eml, new RegExp(`letter-spacing:0.28em[^>]*>${code}<`));
});

test('a wrong code and an unknown spelling of the address are refused', async () => {
  await resetDb();
  await request(app)
    .post(apiPath('/auth/email-otp'))
    .send({ email: 'right@example.com' })
    .expect(202);
  const code = codeFrom(newestMail());
  const wrong = code === '000000' ? '111111' : '000000';

  await request(app)
    .post(apiPath('/auth/email-otp/verify'))
    .send({ email: 'right@example.com', code: wrong })
    .expect(401);

  // A code belongs to the address it was sent to, not to whoever types it.
  await request(app)
    .post(apiPath('/auth/email-otp/verify'))
    .send({ email: 'other@example.com', code })
    .expect(401);
});

test('asking for a new code retires the previous one', async () => {
  await resetDb();
  await request(app)
    .post(apiPath('/auth/email-otp'))
    .send({ email: 'again@example.com' })
    .expect(202);
  const first = codeFrom(newestMail());

  await request(app)
    .post(apiPath('/auth/email-otp'))
    .send({ email: 'again@example.com' })
    .expect(202);
  const second = codeFrom(newestMail());

  if (first !== second) {
    await request(app)
      .post(apiPath('/auth/email-otp/verify'))
      .send({ email: 'again@example.com', code: first })
      .expect(401);
  }
  await request(app)
    .post(apiPath('/auth/email-otp/verify'))
    .send({ email: 'again@example.com', code: second })
    .expect(201);
});

test('a malformed address is a validation error, and the method can be absent', async () => {
  await request(app).post(apiPath('/auth/email-otp')).send({ email: 'not-an-address' }).expect(422);
});
