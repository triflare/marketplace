import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { apiPath, bearer, boot, resetDb, signup, signupAndAccept, uniqNs } from './helpers.mjs';
import { DOWNLOAD_EVENT_RETENTION_DAYS, purgeExpiredPersonalData } from '../src/privacy.js';

let app;
let db;
before(async () => {
  ({ app, db } = await boot());
});
beforeEach(resetDb);
after(async () => {
  await db.$disconnect();
});

test('an account can download the data held about it', async () => {
  const account = await signup(app, uniqNs());
  const ns = account.body.user.namespace;
  const token = account.body.token;

  // Accepting the privacy policy alone is not behind the terms gate: the
  // record has to be writable before the terms have been accepted.
  const current = await request(app)
    .get(apiPath(`/users/${ns}`))
    .set(bearer(token))
    .expect(200);
  const accepted = await request(app)
    .patch(apiPath(`/users/${ns}`))
    .set(bearer(token))
    .set('If-Match', current.headers.etag)
    .send({ privacyAcceptedVersion: 1 });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
  assert.equal(accepted.body.privacyAcceptedVersion, 1);
  assert.ok(accepted.body.privacyAcceptedAt);

  const exported = await request(app).get(apiPath('/me/export')).set(bearer(token)).expect(200);
  assert.match(exported.headers['content-disposition'], /^attachment; filename="account-/);

  assert.equal(exported.body.account.namespace, ns);
  assert.equal(exported.body.account.privacyAcceptedVersion, 1);
  assert.equal(exported.body.legal.accepted.privacyVersion, 1);
  assert.ok(exported.body.legal.documents.length >= 2);
  assert.equal(exported.body.retention.downloadEventsDays, DOWNLOAD_EVENT_RETENTION_DAYS);
  assert.ok(Array.isArray(exported.body.sessions));
  assert.ok(Array.isArray(exported.body.emailIdentities));
});

test('a data export needs a credential', async () => {
  await request(app).get(apiPath('/me/export')).expect(401);
});

test('the retention sweep removes rows past their window and keeps the rest', async () => {
  const account = await signupAndAccept(app, uniqNs());
  const user = await db.Users.findUnique({ where: { Namespace: account.user.namespace } });
  const old = new Date(Date.now() - (DOWNLOAD_EVENT_RETENTION_DAYS + 1) * 86_400_000);
  const fresh = new Date();

  await db.DownloadEvents.create({
    data: { Namespace: 'old', ExtensionId: 'ext', Version: '1.0.0', CreatedAt: old },
  });
  await db.DownloadEvents.create({
    data: { Namespace: 'fresh', ExtensionId: 'ext', Version: '1.0.0', CreatedAt: fresh },
  });
  await db.MailOutbox.create({ data: { To: 'old@example.com', Subject: 'Old', CreatedAt: old } });
  await db.MailOutbox.create({
    data: { To: 'fresh@example.com', Subject: 'New', CreatedAt: fresh },
  });
  await db.AuthChallenges.create({
    data: {
      Driver: 'magic-link',
      Subject: 'expired@example.com',
      SecretHash: 'expired-challenge',
      ExpiresAt: new Date(Date.now() - 1000),
    },
  });
  await db.DeviceCodes.create({
    data: {
      DeviceCodeHash: 'expired-device',
      UserCodeHash: 'expired-user',
      ClientName: 'cli',
      ExpiresAt: new Date(Date.now() - 1000),
    },
  });
  await db.MfaChallenges.create({
    data: { UserId: user.Id, Kind: 'signin', ExpiresAt: new Date(Date.now() - 1000) },
  });
  await db.IdempotencyKeys.create({
    data: {
      UserId: user.Id,
      Route: '/test',
      Key: 'expired-key',
      Fingerprint: 'fingerprint',
      ExpiresAt: new Date(Date.now() - 1000),
    },
  });

  const purged = await purgeExpiredPersonalData(db);
  assert.equal(purged.downloadEvents, 1);
  assert.equal(purged.mailOutbox, 1);
  assert.equal(purged.authChallenges, 1);
  assert.equal(purged.deviceCodes, 1);
  assert.equal(purged.mfaChallenges, 1);
  assert.equal(purged.idempotencyKeys, 1);

  assert.equal(await db.DownloadEvents.count(), 1);
  assert.equal(await db.MailOutbox.count(), 1);
  assert.equal(await db.AuthChallenges.count(), 0);
  assert.equal(await db.DeviceCodes.count(), 0);
  assert.equal(await db.MfaChallenges.count(), 0);
  assert.equal(await db.IdempotencyKeys.count(), 0);
});

test('deleting an account erases its address from mail and its handle from the audit trail', async () => {
  const account = await signupAndAccept(app, uniqNs());
  const ns = account.user.namespace;
  const user = await db.Users.findUnique({ where: { Namespace: ns } });

  await db.AuthIdentities.create({
    data: {
      UserId: user.Id,
      Driver: 'magic-link',
      Issuer: '',
      Subject: 'gone@example.com',
      Email: 'gone@example.com',
    },
  });
  await db.MailOutbox.create({
    data: { To: 'gone@example.com', Subject: 'Sign in', Message: { text: 'a link' } },
  });
  await db.MailOutbox.create({ data: { To: 'other@example.com', Subject: 'Other' } });
  await db.AuditLog.create({
    data: {
      ActorId: user.Id,
      ActorNamespace: ns,
      Action: 'profile.update',
      TargetNamespace: ns,
    },
  });

  await request(app)
    .delete(apiPath(`/users/${ns}`))
    .set(bearer(account.token))
    .expect(204);

  assert.equal(await db.MailOutbox.count({ where: { To: 'gone@example.com' } }), 0);
  assert.equal(await db.MailOutbox.count({ where: { To: 'other@example.com' } }), 1);

  const [row] = await db.$queryRaw`
    SELECT "ActorNamespace", "TargetNamespace", "ActorId" FROM "AuditLog"
    WHERE "Action" = 'profile.update'
  `;
  assert.equal(row.ActorNamespace, 'deleted-account');
  assert.equal(row.TargetNamespace, null);
  assert.equal(row.ActorId, null);
});
