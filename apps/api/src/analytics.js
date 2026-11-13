import { fieldErrors } from './errors.js';
import { hashDownloadAddress } from './metrics.js';
import { compareSemver } from './util.js';

const DAY_MS = 24 * 60 * 60 * 1000;
// A page render and its hydration are two requests for one visit, and a reload
// a minute later is the same person. One view per client per extension in this
// window keeps those from inflating the count without needing a session.
const VIEW_WINDOW_MS = 30 * 60 * 1000;
const SURFACES = new Set(['explore', 'search', 'profile', 'trending']);

// Crawlers and command-line fetchers would otherwise count as readers because
// they asked for the page. The list stays on obvious tokens: a missed bot
// inflates a number, a false positive hides a reader.
const BOT_AGENTS =
  /bot|crawler|spider|slurp|archiver|headlesschrome|phantomjs|selenium|python-requests|python-urllib|curl\/|wget\/|libwww|httpclient|lighthouse|pingdom|uptime|monitor|preview/i;

export function isBot(userAgent) {
  return BOT_AGENTS.test(String(userAgent ?? ''));
}

// Buckets are UTC dates, like the download rollups.
function utcMidnight(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

// A DATE arrives as a Date from the driver and as a string from a raw literal.
function dayKey(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function clientInfo(req) {
  const userAgent = String(req.headers['user-agent'] ?? '').slice(0, 250);
  return { userAgent, ip: req.ip, bot: isBot(userAgent) };
}

// Analytics history is read one day at a time, so a range is a small window
// rather than an open scan.
export function parseAnalyticsDays(raw, fallback = 30) {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 365) {
    throw fieldErrors([
      { field: 'days', message: 'Must be a whole number of days from 1 to 365.' },
    ]);
  }
  return value;
}

// An extension that predates the column, or has no settings row at all, still
// collects: the default is on, and a missing row is not a "no".
async function analyticsEnabled(db, namespace, id) {
  const row = await db.Extensions.findUnique({
    where: { Namespace_ExtensionId: { Namespace: namespace, ExtensionId: id } },
    select: { AnalyticsEnabled: true },
  });
  return row?.AnalyticsEnabled !== false;
}

// Metrics never get in the way of a page, so a failure here costs the event and
// nothing else. The caller does not await this.
export function recordView(db, config, req, { namespace, id, version }) {
  const { userAgent, ip, bot } = clientInfo(req);
  if (bot) return;
  void (async () => {
    if (!(await analyticsEnabled(db, namespace, id))) return;
    const ipHash = await hashDownloadAddress(db, config, ip).catch(() => null);
    if (!ipHash) {
      // No usable address: there is nothing to dedupe on, so the visit counts.
      await db.ViewEvents.create({
        data: {
          Namespace: namespace,
          ExtensionId: id,
          Version: version ?? null,
          UserAgent: userAgent,
        },
      });
      return;
    }
    // The conflict target is what makes this idempotent: a page render and its
    // hydration arrive together, and the second insert loses rather than
    // needing to read the window first.
    await db.$executeRaw`
      INSERT INTO "ViewEvents" ("Namespace", "ExtensionId", "Version", "UserAgent", "IpHash", "Window")
      VALUES (
        ${namespace},
        ${id},
        ${version ?? null},
        ${userAgent},
        ${ipHash},
        ${`${ipHash}:${Math.floor(Date.now() / VIEW_WINDOW_MS)}`}
      )
      ON CONFLICT ("Namespace", "ExtensionId", "Window") DO NOTHING
    `;
  })().catch(() => {});
}

// One row per extension on the page, written in a single insert. A listing is
// served rather than seen, so this counts appearances in the response, and the
// per-extension switch is read for the page's own addresses instead of once per
// entry.
export function recordImpressions(db, config, req, entries, surface) {
  if (entries.length === 0 || !SURFACES.has(surface)) return;
  const { userAgent, ip, bot } = clientInfo(req);
  if (bot) return;
  const rows = entries.map((entry, index) => ({
    Namespace: entry.namespace,
    ExtensionId: entry.id,
    Version: entry.version ?? null,
    Position: index + 1,
  }));
  void (async () => {
    const ipHash = await hashDownloadAddress(db, config, ip).catch(() => null);
    const namespaces = rows.map((row) => row.Namespace);
    const ids = rows.map((row) => row.ExtensionId);
    const disabled = await db.$queryRaw`
      SELECT "Namespace", "ExtensionId" FROM "Extensions"
      WHERE "AnalyticsEnabled" = false
        AND ("Namespace", "ExtensionId") IN (
          SELECT * FROM unnest(${namespaces}::text[], ${ids}::text[])
        )
    `;
    const off = new Set(disabled.map((row) => `${row.Namespace}/${row.ExtensionId}`));
    const data = rows
      .filter((row) => !off.has(`${row.Namespace}/${row.ExtensionId}`))
      .map((row) => ({
        ...row,
        Surface: surface,
        UserAgent: userAgent,
        IpHash: ipHash,
      }));
    if (data.length === 0) return;
    await db.ImpressionEvents.createMany({ data });
  })().catch(() => {});
}

export async function setAnalyticsEnabled(db, namespace, id, enabled) {
  const account = await db.Users.findUnique({
    where: { Namespace: namespace },
    select: { Id: true },
  });
  await db.Extensions.upsert({
    where: { Namespace_ExtensionId: { Namespace: namespace, ExtensionId: id } },
    create: {
      Namespace: namespace,
      ExtensionId: id,
      NamespaceId: account?.Id ?? null,
      AnalyticsEnabled: enabled,
    },
    update: { AnalyticsEnabled: enabled },
  });
  return enabled;
}

// The account's own reach, for the dashboard. It is the same rollups the
// extension page reads, summed over every address the namespace publishes.
export async function accountAnalytics(db, { namespace, days = 30, now = new Date() }) {
  const today = utcMidnight(now);
  const from = new Date(today.getTime() - (days - 1) * DAY_MS);
  const [views, impressions, downloads] = await Promise.all([
    db.$queryRaw`
      SELECT COALESCE(SUM("TotalViews"), 0)::bigint AS total
      FROM "ExtensionDailyViews"
      WHERE "Namespace" = ${namespace}
        AND "Day" >= ${from}::date AND "Day" <= ${today}::date
    `,
    db.$queryRaw`
      SELECT COALESCE(SUM("TotalImpressions"), 0)::bigint AS total
      FROM "ExtensionDailyImpressions"
      WHERE "Namespace" = ${namespace}
        AND "Day" >= ${from}::date AND "Day" <= ${today}::date
    `,
    db.$queryRaw`
      SELECT COALESCE(SUM("TotalDownloads"), 0)::bigint AS total
      FROM "ExtensionDailyDownloads"
      WHERE "Namespace" = ${namespace}
        AND "Day" >= ${from}::date AND "Day" <= ${today}::date
    `,
  ]);
  return {
    namespace,
    range: { days, from: dayKey(from), to: dayKey(today) },
    totals: {
      views: Number(views[0]?.total ?? 0),
      impressions: Number(impressions[0]?.total ?? 0),
      downloads: Number(downloads[0]?.total ?? 0),
    },
  };
}

export async function extensionAnalytics(db, { namespace, id, days = 30, now = new Date() }) {
  const today = utcMidnight(now);
  const from = new Date(today.getTime() - (days - 1) * DAY_MS);
  const [
    enabled,
    viewRows,
    impressionRows,
    downloadRows,
    surfaceRows,
    versionViews,
    versionImpressions,
    versionDownloads,
  ] = await Promise.all([
    analyticsEnabled(db, namespace, id),
    db.$queryRaw`
        SELECT "Day", "TotalViews", "DistinctViews" FROM "ExtensionDailyViews"
        WHERE "Namespace" = ${namespace} AND "ExtensionId" = ${id}
          AND "Day" >= ${from}::date AND "Day" <= ${today}::date
      `,
    // The rollup is keyed by surface, so a day has one row per surface. The
    // chart wants the day's total; the breakdown keeps the per-surface split.
    db.$queryRaw`
        SELECT "Day",
          SUM("TotalImpressions")::bigint AS "TotalImpressions",
          SUM("DistinctImpressions")::bigint AS "DistinctImpressions"
        FROM "ExtensionDailyImpressions"
        WHERE "Namespace" = ${namespace} AND "ExtensionId" = ${id}
          AND "Day" >= ${from}::date AND "Day" <= ${today}::date
        GROUP BY "Day"
      `,
    db.$queryRaw`
        SELECT "Day", "TotalDownloads" FROM "ExtensionDailyDownloads"
        WHERE "Namespace" = ${namespace} AND "ExtensionId" = ${id}
          AND "Day" >= ${from}::date AND "Day" <= ${today}::date
      `,
    db.$queryRaw`
        SELECT "Surface",
          COALESCE(SUM("TotalImpressions"), 0)::bigint AS "Total",
          COALESCE(SUM("DistinctImpressions"), 0)::bigint AS "Distinct"
        FROM "ExtensionDailyImpressions"
        WHERE "Namespace" = ${namespace} AND "ExtensionId" = ${id}
          AND "Day" >= ${from}::date AND "Day" <= ${today}::date
        GROUP BY "Surface"
        ORDER BY "Total" DESC, "Surface" ASC
      `,
    db.$queryRaw`
        SELECT "Version",
          COALESCE(SUM("TotalViews"), 0)::bigint AS "Views",
          COALESCE(SUM("DistinctViews"), 0)::bigint AS "DistinctViews"
        FROM "ExtensionVersionDailyViews"
        WHERE "Namespace" = ${namespace} AND "ExtensionId" = ${id}
          AND "Day" >= ${from}::date AND "Day" <= ${today}::date
        GROUP BY "Version"
      `,
    db.$queryRaw`
        SELECT "Version", COALESCE(SUM("TotalImpressions"), 0)::bigint AS "Impressions"
        FROM "ExtensionVersionDailyImpressions"
        WHERE "Namespace" = ${namespace} AND "ExtensionId" = ${id}
          AND "Day" >= ${from}::date AND "Day" <= ${today}::date
        GROUP BY "Version"
      `,
    db.$queryRaw`
        SELECT "Version", COALESCE(SUM("TotalDownloads"), 0)::bigint AS "Downloads"
        FROM "ExtensionVersionDailyDownloads"
        WHERE "Namespace" = ${namespace} AND "ExtensionId" = ${id}
          AND "Day" >= ${from}::date AND "Day" <= ${today}::date
        GROUP BY "Version"
      `,
  ]);

  const views = new Map(viewRows.map((row) => [dayKey(row.Day), row]));
  const impressions = new Map(impressionRows.map((row) => [dayKey(row.Day), row]));
  const downloads = new Map(downloadRows.map((row) => [dayKey(row.Day), row]));

  const totals = { views: 0, impressions: 0, downloads: 0 };
  const daily = [];
  for (let time = from.getTime(); time <= today.getTime(); time += DAY_MS) {
    const day = new Date(time).toISOString().slice(0, 10);
    const view = views.get(day);
    const impression = impressions.get(day);
    const download = downloads.get(day);
    const point = {
      day,
      views: Number(view?.TotalViews ?? 0),
      distinctViews: Number(view?.DistinctViews ?? 0),
      impressions: Number(impression?.TotalImpressions ?? 0),
      distinctImpressions: Number(impression?.DistinctImpressions ?? 0),
      downloads: Number(download?.TotalDownloads ?? 0),
    };
    totals.views += point.views;
    totals.impressions += point.impressions;
    totals.downloads += point.downloads;
    daily.push(point);
  }

  // One row per version, merged from three rollups. SemVer order puts the
  // current release first; a version that only appears in a download rollup
  // still gets a row, with zero reads.
  const versions = new Map();
  const versionRow = (version) => {
    if (!versions.has(version)) {
      versions.set(version, {
        version,
        views: 0,
        distinctViews: 0,
        impressions: 0,
        downloads: 0,
      });
    }
    return versions.get(version);
  };
  for (const row of versionViews) {
    const entry = versionRow(row.Version);
    entry.views = Number(row.Views);
    entry.distinctViews = Number(row.DistinctViews);
  }
  for (const row of versionImpressions)
    versionRow(row.Version).impressions = Number(row.Impressions);
  for (const row of versionDownloads) versionRow(row.Version).downloads = Number(row.Downloads);

  return {
    namespace,
    id,
    enabled,
    range: { days, from: dayKey(from), to: dayKey(today) },
    totals,
    daily,
    surfaces: surfaceRows.map((row) => ({
      surface: row.Surface,
      impressions: Number(row.Total),
      distinctImpressions: Number(row.Distinct),
    })),
    versions: [...versions.values()].sort((a, b) => {
      const order = compareSemver(b.version, a.version);
      return order === 0 ? a.version.localeCompare(b.version) : order;
    }),
  };
}
