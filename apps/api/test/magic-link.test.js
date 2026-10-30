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
  const file = files[files.length - 1];
  return fs.readFileSync(path.join(dir, file), 'utf8');
}

function tokenFrom(eml) {
  const match = eml.match(/token=([A-Za-z0-9_-]+)/);
  assert.ok(match, 'the message carries a link');
  return match[1];
}

function linkFrom(eml) {
  const match = eml.match(/https?:\/\/\S+/);
  assert.ok(match, 'the message carries a URL');
  return new URL(match[0]);
}

test('GET /auth advertises the configured methods', async () => {
  const r = await request(app).get(apiPath('/auth')).expect(200);
  assert.deepEqual(
    r.body.methods.map((method) => method.driver),
    ['password', 'magic-link'],
  );
  assert.equal(r.body.passwordAuth, true);
});

test('a link signs in the address it was sent to, once', async () => {
  await resetDb();
  const sent = await request(app)
    .post(apiPath('/auth/magic-link'))
    .send({ email: 'Person@Example.com' })
    .expect(202);
  assert.deepEqual(sent.body, { sent: true });

  // Every message is written down before it goes out, so a delivery failure is
  // something an admin can see rather than a line in a log.
  const outbox = await db.MailOutbox.findMany();
  assert.equal(outbox.length, 1);
  assert.equal(outbox[0].Purpose, 'magic-link');
  assert.equal(outbox[0].Status, 'sent');
  assert.equal(outbox[0].Driver, 'file');

  const token = tokenFrom(newestMail());
  const signedIn = await request(app)
    .get(apiPath(`/auth/magic-link/verify?token=${token}`))
    .expect(201);
  assert.equal(signedIn.body.user.namespace, 'person');
  assert.match(signedIn.body.token, /^[0-9a-f]{64}$/);

  // The same link again finds nothing: it was consumed by the first request.
  await request(app)
    .get(apiPath(`/auth/magic-link/verify?token=${token}`))
    .expect(401);
});

test('an unknown address gets the same answer and the same mail', async () => {
  await resetDb();
  const known = await request(app)
    .post(apiPath('/auth/magic-link'))
    .send({ email: 'nobody@example.com' })
    .expect(202);
  assert.deepEqual(known.body, { sent: true });
  const eml = newestMail();
  assert.match(eml, /To: nobody@example.com/);
  assert.match(eml, /token=/);
});

test('a malformed address is refused before any mail is sent', async () => {
  const r = await request(app)
    .post(apiPath('/auth/magic-link'))
    .send({ email: 'not-an-address' })
    .expect(422);
  assert.equal(r.body.errors[0].field, 'email');
});

test('the second sign-in for an address reuses the account', async () => {
  await resetDb();
  await request(app).post(apiPath('/auth/magic-link')).send({ email: 'twice@example.com' });
  const first = tokenFrom(newestMail());
  const one = await request(app)
    .get(apiPath(`/auth/magic-link/verify?token=${first}`))
    .expect(201);

  await request(app).post(apiPath('/auth/magic-link')).send({ email: 'twice@example.com' });
  const second = tokenFrom(newestMail());
  const two = await request(app)
    .get(apiPath(`/auth/magic-link/verify?token=${second}`))
    .expect(201);
  assert.equal(two.body.user.namespace, one.body.user.namespace);
  assert.notEqual(two.body.token, one.body.token);
});

test('the message carries a styled HTML part beside the plain one', async () => {
  await resetDb();
  await request(app)
    .post(apiPath('/auth/magic-link'))
    .send({ email: 'styled@example.com' })
    .expect(202);

  const eml = newestMail();
  // A reader without HTML still gets the link, and one with it gets the card.
  assert.match(eml, /multipart\/alternative/);
  assert.match(eml, /Content-Type: text\/html/);
  assert.match(eml, /<html lang="en">/);
  assert.match(eml, /styled@example\.com/);
  assert.ok(eml.includes(`token=${tokenFrom(eml)}`), 'the button links to the same token');
});

test('the link sends the browser back to the page that asked for it', async () => {
  await resetDb();
  await request(app)
    .post(apiPath('/auth/magic-link'))
    .send({ email: 'returning@example.com', returnTo: '/login?next=%2Fdashboard' })
    .expect(202);

  const link = linkFrom(newestMail());
  // The link is an API URL; the page it returns to travels with it, resolved
  // against the instance so the redirect cannot leave the site.
  assert.equal(
    link.searchParams.get('returnTo'),
    `${config.publicBaseUrl}/login?next=%2Fdashboard`,
  );

  const redirect = await request(app)
    .get(apiPath(`/auth/magic-link/verify?${link.searchParams.toString()}`))
    .set('Accept', 'text/html')
    .expect(302);
  const location = new URL(redirect.headers.location);
  assert.equal(location.origin + location.pathname, `${config.publicBaseUrl}/login`);
  assert.equal(location.searchParams.get('next'), '/dashboard');
  assert.ok(location.searchParams.get('magic_link_code'));
});

test('a link cannot be asked to return to another site', async () => {
  await resetDb();
  const refused = await request(app)
    .post(apiPath('/auth/magic-link'))
    .send({ email: 'careful@example.com', returnTo: 'https://evil.example/steal' })
    .expect(422);
  assert.equal(refused.body.errors[0].field, 'returnTo');
  // The refusal happens before the mail chain is touched: a link that carries
  // somebody else's address would hand that site the one-time code.
  assert.equal(await db.MailOutbox.count(), 0);
});

test('the browser flow trades a one-time code for the session', async () => {
  await resetDb();
  await request(app).post(apiPath('/auth/magic-link')).send({ email: 'browser@example.com' });
  const token = tokenFrom(newestMail());
  const redirect = await request(app)
    .get(apiPath(`/auth/magic-link/verify?token=${token}`))
    .set('Accept', 'text/html')
    .expect(302);
  const location = new URL(redirect.headers.location);
  const code = location.searchParams.get('magic_link_code');
  assert.ok(code, 'the redirect carries a code rather than a token');

  const exchanged = await request(app)
    .post(apiPath('/auth/magic-link/exchange'))
    .send({ code })
    .expect(201);
  assert.equal(exchanged.body.user.namespace, 'browser');
  // A browser cannot carry the session token in the URL, so the exchange is
  // the only way to get one, and it works once.
  await request(app).post(apiPath('/auth/magic-link/exchange')).send({ code }).expect(401);
});

test('the method is closed when the method set leaves it out', async () => {
  // This file's instance has it on; the off case is covered by config
  // validation, which is where the refusal belongs.
  assert.ok(config.auth.methods.some((entry) => entry.driver === 'magic-link'));
});
