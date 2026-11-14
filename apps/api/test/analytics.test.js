import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import request from 'supertest';
import {
  apiPath,
  bearer,
  boot,
  publishProject,
  resetDb,
  signupAndAccept,
  uniqNs,
} from './helpers.mjs';
import { aggregateDayLoader } from '../src/metrics.js';
import { BLOB_GC_LOCK_KEY } from '../src/blobs.js';

let app;
let db;
let aggregateDay;
before(async () => {
  ({ app, db } = await boot());
  aggregateDay = aggregateDayLoader(db);
});
beforeEach(resetDb);
after(async () => {
  await db.$disconnect();
});

async function publishAs(ns, token, adminToken, id, version, code) {
  await publishProject(app, ns, id, token, { version, code });
  await request(app)
    .patch(apiPath(`/@${ns}/${id}/versions/${version}`))
    .set('If-Match', '*')
    .set(bearer(adminToken))
    .send({ status: 'approved' })
    .expect(200);
}

async function makePublished() {
  const admin = await signupAndAccept(app, uniqNs());
  const owner = await signupAndAccept(app, uniqNs());
  await publishAs(owner.user.namespace, owner.token, admin.token, 'hello', '1.0.0', '// v1');
  return {
    ownerNs: owner.user.namespace,
    ownerToken: owner.token,
    adminToken: admin.token,
  };
}

async function viewCount(namespace, id) {
  const [row] = await db.$queryRaw`
    SELECT COUNT(*)::int AS n FROM "ViewEvents"
    WHERE "Namespace" = ${namespace} AND "ExtensionId" = ${id}
  `;
  return row.n;
}

async function impressionCount(namespace) {
  const [row] = await db.$queryRaw`
    SELECT COUNT(*)::int AS n FROM "ImpressionEvents"
    WHERE "Namespace" = ${namespace}
  `;
  return row.n;
}

// Recording runs after the response, so poll rather than guess at a delay.
async function waitFor(read, count) {
  for (let i = 0; i < 50; i += 1) {
    if ((await read()) >= count) return;
    await sleep(20);
  }
  throw new Error(`timed out waiting for ${count} rows`);
}

function analyticsUrl(namespace, id, query = '') {
  return apiPath(`/@${namespace}/${id}/analytics${query}`);
}

test('crawler user agents are not counted as views or impressions', async () => {
  const { ownerNs } = await makePublished();
  const bot = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
  await request(app)
    .get(apiPath(`/@${ownerNs}/hello`))
    .set('User-Agent', bot)
    .expect(200);
  await request(app).get(apiPath('/extensions')).set('User-Agent', bot).expect(200);
  await sleep(150);
  assert.equal(await viewCount(ownerNs, 'hello'), 0);
  assert.equal(await impressionCount(ownerNs), 0);

  // A browser asking for the same page is still a view.
  await request(app)
    .get(apiPath(`/@${ownerNs}/hello`))
    .expect(200);
  await waitFor(() => viewCount(ownerNs, 'hello'), 1);
});

test('views and impressions split by version', async () => {
  const { ownerNs, ownerToken } = await makePublished();
  await request(app)
    .get(apiPath(`/@${ownerNs}/hello`))
    .expect(200);
  await request(app).get(apiPath('/extensions')).expect(200);
  await publishProject(app, ownerNs, 'hello', ownerToken, { version: '2.0.0', code: '// v2' });
  await request(app).get(apiPath('/extensions')).expect(200);
  await waitFor(() => impressionCount(ownerNs), 2);
  await aggregateDay(new Date());

  const analytics = await request(app)
    .get(analyticsUrl(ownerNs, 'hello'))
    .set(bearer(ownerToken))
    .expect(200);
  const byVersion = new Map(analytics.body.versions.map((entry) => [entry.version, entry]));
  assert.equal(byVersion.get('1.0.0').views, 1);
  assert.equal(byVersion.get('1.0.0').impressions, 1);
  assert.equal(byVersion.get('2.0.0').impressions, 1);
  assert.equal(byVersion.get('2.0.0').views, 0);
  assert.equal(analytics.body.versions[0].version, '2.0.0');
});

test('a public page read records one view per client window', async () => {
  const { ownerNs, ownerToken } = await makePublished();
  await request(app)
    .get(apiPath(`/@${ownerNs}/hello`))
    .expect(200);
  await request(app)
    .get(apiPath(`/@${ownerNs}/hello`))
    .expect(200);

  await waitFor(() => viewCount(ownerNs, 'hello'), 1);
  // A render and its hydration are two reads for one visit.
  await sleep(100);
  assert.equal(await viewCount(ownerNs, 'hello'), 1);

  await aggregateDay(new Date());
  const analytics = await request(app)
    .get(analyticsUrl(ownerNs, 'hello'))
    .set(bearer(ownerToken))
    .expect(200);
  assert.equal(analytics.body.enabled, true);
  assert.equal(analytics.body.totals.views, 1);
  assert.equal(analytics.body.daily.length, 30);
  assert.equal(analytics.body.daily.at(-1).views, 1);
  assert.equal(analytics.body.daily.at(-1).distinctViews, 1);
  assert.deepEqual(analytics.body.range.days, 30);
});

test('listing responses record impressions with their surface and position', async () => {
  const { ownerNs, ownerToken } = await makePublished();
  await publishProject(app, ownerNs, 'gizmo', ownerToken, { version: '1.0.0' });

  await request(app).get(apiPath('/extensions?sort=name')).expect(200);
  await waitFor(() => impressionCount(ownerNs), 2);

  await request(app).get(apiPath('/extensions?q=gizmo')).expect(200);
  await request(app)
    .get(apiPath(`/extensions?namespace=${ownerNs}`))
    .expect(200);
  // Trending only lists extensions with a download in the last week.
  await db.$executeRaw`
    INSERT INTO "ExtensionDailyDownloads" ("Namespace", "ExtensionId", "Day", "TotalDownloads")
    VALUES (${ownerNs}, 'gizmo', CURRENT_DATE, 5)
  `;
  await request(app).get(apiPath('/extensions/trending')).expect(200);
  await waitFor(() => impressionCount(ownerNs), 6);

  await aggregateDay(new Date());
  // Each extension counts its own appearances, so gizmo has one on every
  // surface even though the pages listed two extensions.
  const analytics = await request(app)
    .get(analyticsUrl(ownerNs, 'gizmo'))
    .set(bearer(ownerToken))
    .expect(200);
  const surfaces = new Map(
    analytics.body.surfaces.map((entry) => [entry.surface, entry.impressions]),
  );
  assert.equal(surfaces.get('explore'), 1);
  assert.equal(surfaces.get('search'), 1);
  assert.equal(surfaces.get('profile'), 1);
  assert.equal(surfaces.get('trending'), 1);
  assert.equal(analytics.body.totals.impressions, 4);

  const positions = await db.$queryRaw`
    SELECT "Position" FROM "ImpressionEvents"
    WHERE "Namespace" = ${ownerNs} AND "Surface" = 'explore'
    ORDER BY "Position"
  `;
  assert.deepEqual(
    positions.map((row) => row.Position),
    [1, 2],
  );
});

test('turning collection off stops new events and keeps history', async () => {
  const { ownerNs, ownerToken } = await makePublished();
  await request(app)
    .get(apiPath(`/@${ownerNs}/hello`))
    .expect(200);
  await waitFor(() => viewCount(ownerNs, 'hello'), 1);
  await request(app).get(apiPath('/extensions')).expect(200);
  await waitFor(() => impressionCount(ownerNs), 1);
  await aggregateDay(new Date());

  const account = await request(app)
    .get(apiPath('/me/analytics'))
    .set(bearer(ownerToken))
    .expect(200);
  assert.equal(account.body.totals.views, 1);
  assert.equal(account.body.totals.impressions, 1);
  await request(app).get(apiPath('/me/analytics')).expect(401);

  const off = await request(app)
    .put(analyticsUrl(ownerNs, 'hello'))
    .set(bearer(ownerToken))
    .send({ enabled: false })
    .expect(200);
  assert.equal(off.body.enabled, false);

  await request(app)
    .get(apiPath(`/@${ownerNs}/hello`))
    .expect(200);
  await sleep(150);
  assert.equal(await viewCount(ownerNs, 'hello'), 1);
  await request(app).get(apiPath('/extensions')).expect(200);
  await sleep(150);
  assert.equal(await impressionCount(ownerNs), 1);

  const analytics = await request(app)
    .get(analyticsUrl(ownerNs, 'hello'))
    .set(bearer(ownerToken))
    .expect(200);
  assert.equal(analytics.body.enabled, false);
  assert.equal(analytics.body.totals.views, 1);
  assert.equal(analytics.body.totals.impressions, 1);

  await request(app)
    .put(analyticsUrl(ownerNs, 'hello'))
    .set(bearer(ownerToken))
    .send({ enabled: true })
    .expect(200);
});

test('analytics need an owner or an admin', async () => {
  const { ownerNs, ownerToken, adminToken } = await makePublished();
  const other = await signupAndAccept(app, uniqNs());

  await request(app).get(analyticsUrl(ownerNs, 'hello')).expect(401);
  await request(app).get(analyticsUrl(ownerNs, 'hello')).set(bearer(other.token)).expect(403);
  await request(app).get(analyticsUrl(ownerNs, 'hello')).set(bearer(adminToken)).expect(200);
  await request(app).get(analyticsUrl(ownerNs, 'hello')).set(bearer(ownerToken)).expect(200);
  await request(app)
    .put(analyticsUrl(ownerNs, 'hello'))
    .set(bearer(other.token))
    .send({ enabled: false })
    .expect(403);
  await request(app)
    .put(analyticsUrl(ownerNs, 'hello'))
    .set(bearer(ownerToken))
    .send({ enabled: 'no' })
    .expect(422);
});

test('an empty range reads as zeros and days is validated', async () => {
  const { ownerNs, ownerToken } = await makePublished();
  const empty = await request(app)
    .get(analyticsUrl(ownerNs, 'hello', '?days=7'))
    .set(bearer(ownerToken))
    .expect(200);
  assert.equal(empty.body.daily.length, 7);
  assert.ok(
    empty.body.daily.every(
      (point) => point.views === 0 && point.impressions === 0 && point.downloads === 0,
    ),
  );
  assert.deepEqual(empty.body.surfaces, []);

  await request(app)
    .get(analyticsUrl(ownerNs, 'hello', '?days=0'))
    .set(bearer(ownerToken))
    .expect(422);
  await request(app)
    .get(analyticsUrl(ownerNs, 'hello', '?days=abc'))
    .set(bearer(ownerToken))
    .expect(422);
  await request(app).get(analyticsUrl(ownerNs, 'missing')).set(bearer(ownerToken)).expect(404);
});

test('deleting an extension clears its analytics', async () => {
  const { ownerNs, ownerToken } = await makePublished();
  await request(app)
    .get(apiPath(`/@${ownerNs}/hello`))
    .expect(200);
  await waitFor(() => viewCount(ownerNs, 'hello'), 1);
  await request(app).get(apiPath('/extensions')).expect(200);
  await waitFor(() => impressionCount(ownerNs), 1);
  await aggregateDay(new Date());

  await request(app)
    .delete(apiPath(`/@${ownerNs}/hello`))
    .set(bearer(ownerToken))
    .expect(204);

  assert.equal(await viewCount(ownerNs, 'hello'), 0);
  assert.equal(await impressionCount(ownerNs), 0);
  assert.equal(
    await db.ExtensionDailyViews.count({
      where: { Namespace: ownerNs, ExtensionId: 'hello' },
    }),
    0,
  );
  assert.equal(
    await db.ExtensionDailyImpressions.count({
      where: { Namespace: ownerNs, ExtensionId: 'hello' },
    }),
    0,
  );
});

test('invalid detail includes do not consume the client view window', async () => {
  const { ownerNs } = await makePublished();
  await request(app)
    .get(apiPath(`/@${ownerNs}/hello?include=invalid`))
    .expect(422);
  await request(app)
    .get(apiPath(`/@${ownerNs}/hello?include=owner,latestVersion`))
    .expect(200);
  await waitFor(() => viewCount(ownerNs, 'hello'), 1);
  assert.equal(await viewCount(ownerNs, 'hello'), 1);
});

test('rollups preserve unversioned events, surfaces, distinct counts and reruns', async () => {
  const { ownerNs } = await makePublished();
  const day = new Date('2026-01-02T12:00:00Z');
  for (const Version of [null, '1.0.0', '1.0.0']) {
    await db.ViewEvents.create({
      data: {
        Namespace: ownerNs,
        ExtensionId: 'hello',
        Version,
        CreatedAt: day,
        IpHash: 'same',
      },
    });
    for (const Surface of ['explore', 'search']) {
      await db.ImpressionEvents.create({
        data: {
          Namespace: ownerNs,
          ExtensionId: 'hello',
          Version,
          Surface,
          CreatedAt: day,
          IpHash: 'same',
        },
      });
    }
  }
  await aggregateDay(day);
  await aggregateDay(day);
  const where = { Namespace: ownerNs, ExtensionId: 'hello' };
  const [views] = await db.ExtensionDailyViews.findMany({ where });
  assert.equal(Number(views.TotalViews), 3);
  assert.equal(Number(views.DistinctViews), 1);
  const [versionViews] = await db.ExtensionVersionDailyViews.findMany({ where });
  assert.equal(Number(versionViews.TotalViews), 2);
  const surfaces = await db.ExtensionDailyImpressions.findMany({ where });
  assert.equal(surfaces.length, 2);
  for (const surface of surfaces) {
    assert.equal(Number(surface.TotalImpressions), 3);
    assert.equal(Number(surface.DistinctImpressions), 1);
  }
  const [versionImpressions] = await db.ExtensionVersionDailyImpressions.findMany({ where });
  assert.equal(Number(versionImpressions.TotalImpressions), 4);
  assert.equal(Number(versionImpressions.DistinctImpressions), 1);
});

test('every daily rollup holds the shared deletion lock while writing', async () => {
  const writes = [];
  const checkedDb = {
    $transaction: (run, options) =>
      db.$transaction(
        (tx) =>
          run({
            $queryRaw: tx.$queryRaw.bind(tx),
            $executeRaw: async (strings, ...values) => {
              const [locks] = await db.$transaction(
                (probe) => probe.$queryRaw`
                SELECT pg_try_advisory_xact_lock(hashtextextended(${BLOB_GC_LOCK_KEY}, 0)) AS exclusive,
                       pg_try_advisory_xact_lock_shared(hashtextextended(${BLOB_GC_LOCK_KEY}, 0)) AS shared
              `,
              );
              assert.equal(locks.exclusive, false);
              assert.equal(locks.shared, true);
              writes.push(strings.join('?'));
              return tx.$executeRaw(strings, ...values);
            },
          }),
        options,
      ),
    $executeRaw: () => {
      throw new Error('rollup write bypassed the transaction');
    },
  };

  await aggregateDayLoader(checkedDb)(new Date('2026-01-02T12:00:00Z'));
  assert.equal(writes.length, 3);
  for (const table of ['DownloadEvents', 'ViewEvents', 'ImpressionEvents']) {
    assert.equal(writes.filter((sql) => sql.includes(`FROM "${table}"`)).length, 1);
  }
});
