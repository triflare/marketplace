import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { apiPath, bearer, boot, resetDb, signupAndAccept } from './helpers.mjs';

let app;
let config;
let db;
let admin;
let member;

before(async () => {
  const booted = await boot({
    auth: { methods: [{ driver: 'password' }, { driver: 'magic-link' }] },
    mail: { drivers: [{ driver: 'file' }] },
  });
  app = booted.app;
  config = booted.config;
  db = booted.db;
  await resetDb();
  admin = await signupAndAccept(app, 'outbox-admin');
  member = await signupAndAccept(app, 'outbox-member');
});

// Rows are the only thing the tests count, so each one starts from an empty
// outbox without throwing away the accounts the admin gate needs.
async function clearOutbox() {
  await db.MailOutbox.deleteMany();
}

// A row as a previous attempt would have left it. Tests that need a particular
// outcome (sent, pending, refused) set it here instead of arranging for a
// provider to fail in exactly that way.
function makeRow(overrides = {}) {
  return db.MailOutbox.create({
    data: {
      To: 'someone@example.com',
      Subject: 'Hello',
      Purpose: 'notice',
      Status: 'failed',
      Attempts: 1,
      LastError: 'the provider said no',
      Message: {
        to: 'someone@example.com',
        subject: 'Hello',
        text: 'A body.',
        purpose: 'notice',
      },
      ...overrides,
    },
  });
}

function mailFiles() {
  const dir = path.join(config.dataDir, 'mail');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((name) => name.endsWith('.eml'));
}

test('the outbox is admin only', async () => {
  await request(app).get(apiPath('/admin/mail/outbox')).set(bearer(member.token)).expect(403);
  await request(app).get(apiPath('/admin/mail/outbox')).set(bearer(admin.token)).expect(200);
});

test('a message is in the outbox before it is sent, and the list shows no body', async () => {
  await clearOutbox();
  await request(app)
    .post(apiPath('/auth/magic-link'))
    .send({ email: 'Signin@Example.com' })
    .expect(202);

  const r = await request(app)
    .get(apiPath('/admin/mail/outbox'))
    .set(bearer(admin.token))
    .expect(200);
  assert.equal(r.body.data.length, 1);
  const [entry] = r.body.data;
  assert.equal(entry.purpose, 'magic-link');
  assert.equal(entry.status, 'sent');
  assert.equal(entry.driver, 'file');
  assert.equal(entry.attempts, 1);
  assert.equal(entry.lastError, null);
  assert.equal(entry.to, 'signin@example.com');
  assert.ok(entry.sentAt);
  // The body is a sign-in link, so it is not in the collection an admin scans.
  assert.equal(entry.message, undefined);
});

test('the list filters by status and walks newest first', async () => {
  await clearOutbox();
  const first = await makeRow({ Subject: 'One' });
  const second = await makeRow({ Subject: 'Two' });
  const third = await makeRow({ Subject: 'Three', Status: 'sent', LastError: null });

  const all = await request(app)
    .get(apiPath('/admin/mail/outbox'))
    .set(bearer(admin.token))
    .expect(200);
  // Ids keep counting past the rows earlier tests cleared, so the order is
  // asserted against the rows this test made rather than against literals.
  assert.deepEqual(
    all.body.data.map((entry) => entry.id),
    [String(third.Id), String(second.Id), String(first.Id)],
  );

  const failed = await request(app)
    .get(apiPath('/admin/mail/outbox?status=failed'))
    .set(bearer(admin.token))
    .expect(200);
  assert.deepEqual(
    failed.body.data.map((entry) => entry.id),
    [String(second.Id), String(first.Id)],
  );

  await request(app)
    .get(apiPath('/admin/mail/outbox?status=exploded'))
    .set(bearer(admin.token))
    .expect(422);
});

test('the detail carries exactly what was sent', async () => {
  await clearOutbox();
  await request(app)
    .post(apiPath('/auth/magic-link'))
    .send({ email: 'detail@example.com' })
    .expect(202);
  const row = await db.MailOutbox.findFirst();

  const r = await request(app)
    .get(apiPath(`/admin/mail/outbox/${row.Id}`))
    .set(bearer(admin.token))
    .expect(200);
  assert.equal(r.body.id, String(row.Id));
  assert.equal(r.body.message.to, 'detail@example.com');
  assert.match(r.body.message.text, /token=/);

  await request(app)
    .get(apiPath('/admin/mail/outbox/99999999'))
    .set(bearer(admin.token))
    .expect(404);
  await request(app)
    .get(apiPath('/admin/mail/outbox/not-a-number'))
    .set(bearer(admin.token))
    .expect(404);
});

test('a retry sends the stored message and writes back to the same row', async () => {
  await clearOutbox();
  const row = await makeRow({
    To: 'retry@example.com',
    Message: {
      to: 'retry@example.com',
      subject: 'Hello',
      text: 'A body.',
      purpose: 'notice',
    },
  });
  const before = mailFiles().length;

  const r = await request(app)
    .post(apiPath(`/admin/mail/outbox/${row.Id}/retry`))
    .set(bearer(admin.token))
    .expect(200);
  assert.equal(r.body.id, String(row.Id));
  assert.equal(r.body.status, 'sent');
  assert.equal(r.body.driver, 'file');
  assert.equal(r.body.attempts, 2);
  assert.equal(r.body.lastError, null);
  assert.ok(r.body.sentAt);
  assert.ok(r.body.result.file.endsWith('.eml'));

  // One message, one row: the attempt is recorded on it rather than added as a
  // second message the viewer would then show twice.
  assert.equal(await db.MailOutbox.count(), 1);
  assert.equal(mailFiles().length, before + 1);

  const delivered = fs.readFileSync(r.body.result.file, 'utf8');
  assert.match(delivered, /To: retry@example\.com/);
  assert.match(delivered, /A body\./);

  const retried = await db.AuditLog.findMany({ where: { Action: 'mail.retry' } });
  assert.equal(retried.length, 1);
  assert.equal(retried[0].Detail.outboxId, String(row.Id));
});

test('a delivered message is not sent again', async () => {
  await clearOutbox();
  const row = await makeRow({ Status: 'sent', SentAt: new Date(), LastError: null });
  const r = await request(app)
    .post(apiPath(`/admin/mail/outbox/${row.Id}/retry`))
    .set(bearer(admin.token))
    .expect(409);
  assert.equal(r.body.title, 'Already Sent');
  assert.equal(await db.MailOutbox.count({ where: { Status: 'sent' } }), 1);
});

test('a message the provider refuses stays failed and says why', async () => {
  await clearOutbox();
  // No subject: the driver refuses this before it reaches a transport, which is
  // the same answer a provider gives about a message it will not take.
  const row = await makeRow({ Message: { to: 'broken@example.com' } });

  const r = await request(app)
    .post(apiPath(`/admin/mail/outbox/${row.Id}/retry`))
    .set(bearer(admin.token))
    .expect(502);
  assert.equal(r.body.title, 'Delivery Failed');

  const after = await db.MailOutbox.findUnique({ where: { Id: row.Id } });
  assert.equal(after.Status, 'failed');
  assert.equal(after.Attempts, 2);
  assert.match(after.LastError, /subject/i);
});

test('a retry of a row that is not there is a 404', async () => {
  await request(app)
    .post(apiPath('/admin/mail/outbox/99999999/retry'))
    .set(bearer(admin.token))
    .expect(404);
});
