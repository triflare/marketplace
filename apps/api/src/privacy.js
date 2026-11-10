// Retention rules for the tables that collect personal data on the way to
// somewhere else. The download log feeds the daily rollups, the outbox exists
// so a failed message can be retried, and the challenge tables hold an address
// until its code expires. None of them has a reason to keep a row past that.
const DAY_MS = 24 * 60 * 60 * 1000;

export const DOWNLOAD_EVENT_RETENTION_DAYS = 30;
export const MAIL_OUTBOX_RETENTION_DAYS = 30;

export async function purgeExpiredPersonalData(db, { now = new Date() } = {}) {
  const downloadCutoff = new Date(now.getTime() - DOWNLOAD_EVENT_RETENTION_DAYS * DAY_MS);
  const outboxCutoff = new Date(now.getTime() - MAIL_OUTBOX_RETENTION_DAYS * DAY_MS);

  const [downloads, outbox, challenges, deviceCodes, mfaChallenges, idempotencyKeys] =
    await db.$transaction([
      db.DownloadEvents.deleteMany({ where: { CreatedAt: { lt: downloadCutoff } } }),
      db.MailOutbox.deleteMany({ where: { CreatedAt: { lt: outboxCutoff } } }),
      db.AuthChallenges.deleteMany({ where: { ExpiresAt: { lt: now } } }),
      db.DeviceCodes.deleteMany({ where: { ExpiresAt: { lt: now } } }),
      db.MfaChallenges.deleteMany({ where: { ExpiresAt: { lt: now } } }),
      db.IdempotencyKeys.deleteMany({ where: { ExpiresAt: { lt: now } } }),
    ]);

  return {
    downloadEvents: downloads.count,
    mailOutbox: outbox.count,
    authChallenges: challenges.count,
    deviceCodes: deviceCodes.count,
    mfaChallenges: mfaChallenges.count,
    idempotencyKeys: idempotencyKeys.count,
  };
}
