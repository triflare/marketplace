// Retention rules for the tables that collect personal data on the way to
// somewhere else. The download log feeds the daily rollups, the outbox exists
// so a failed message can be retried, and the challenge tables hold an address
// until its code expires. None of them has a reason to keep a row past that.
const DAY_MS = 24 * 60 * 60 * 1000;

// The windows a config that names neither gets. The running instance passes
// its configured values on every sweep, so changing one takes effect without a
// restart.
export const DEFAULT_DOWNLOAD_EVENT_RETENTION_DAYS = 30;
export const DEFAULT_ANALYTICS_EVENT_RETENTION_DAYS = 30;
export const DEFAULT_MAIL_OUTBOX_RETENTION_DAYS = 30;

export async function purgeExpiredPersonalData(
  db,
  {
    now = new Date(),
    downloadEventRetentionDays = DEFAULT_DOWNLOAD_EVENT_RETENTION_DAYS,
    analyticsEventRetentionDays = DEFAULT_ANALYTICS_EVENT_RETENTION_DAYS,
    mailOutboxRetentionDays = DEFAULT_MAIL_OUTBOX_RETENTION_DAYS,
  } = {},
) {
  const downloadCutoff = new Date(now.getTime() - downloadEventRetentionDays * DAY_MS);
  const analyticsCutoff = new Date(now.getTime() - analyticsEventRetentionDays * DAY_MS);
  const outboxCutoff = new Date(now.getTime() - mailOutboxRetentionDays * DAY_MS);

  const [
    downloads,
    views,
    impressions,
    outbox,
    challenges,
    deviceCodes,
    mfaChallenges,
    idempotencyKeys,
  ] = await db.$transaction([
    db.DownloadEvents.deleteMany({ where: { CreatedAt: { lt: downloadCutoff } } }),
    db.ViewEvents.deleteMany({ where: { CreatedAt: { lt: analyticsCutoff } } }),
    db.ImpressionEvents.deleteMany({ where: { CreatedAt: { lt: analyticsCutoff } } }),
    db.MailOutbox.deleteMany({
      where: { CreatedAt: { lt: outboxCutoff }, Status: { in: ['sent', 'failed'] } },
    }),
    db.AuthChallenges.deleteMany({ where: { ExpiresAt: { lt: now } } }),
    db.DeviceCodes.deleteMany({ where: { ExpiresAt: { lt: now } } }),
    db.MfaChallenges.deleteMany({ where: { ExpiresAt: { lt: now } } }),
    db.IdempotencyKeys.deleteMany({ where: { ExpiresAt: { lt: now } } }),
  ]);

  return {
    downloadEvents: downloads.count,
    viewEvents: views.count,
    impressionEvents: impressions.count,
    mailOutbox: outbox.count,
    authChallenges: challenges.count,
    deviceCodes: deviceCodes.count,
    mfaChallenges: mfaChallenges.count,
    idempotencyKeys: idempotencyKeys.count,
  };
}
