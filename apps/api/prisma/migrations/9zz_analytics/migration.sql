-- Views and listing impressions, kept as raw events for the distinct counts and
-- as daily rollups for the charts. Both mirror the download tables: the event
-- row answers "how many different clients", the rollup answers "how many".
ALTER TABLE "Extensions" ADD COLUMN "AnalyticsEnabled" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "ViewEvents" (
  "Id" BIGSERIAL PRIMARY KEY,
  "Namespace" TEXT NOT NULL,
  "ExtensionId" TEXT NOT NULL,
  -- The release the page was showing, so the publisher can tell which version
  -- people are landing on.
  "Version" TEXT,
  "UserAgent" TEXT NOT NULL DEFAULT '',
  "IpHash" TEXT,
  -- Hash plus a 30-minute bucket. The unique index makes two inserts for the
  -- same visit a no-op rather than depending on a read-then-write check.
  "Window" TEXT,
  "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX "view_events_ns_id_ts_idx"
  ON "ViewEvents"("Namespace", "ExtensionId", "CreatedAt");

CREATE UNIQUE INDEX "view_events_window_idx"
  ON "ViewEvents"("Namespace", "ExtensionId", "Window");

-- The retention sweep deletes by age alone, so that predicate needs its own
-- index rather than scanning the extension index first.
CREATE INDEX "view_events_ts_idx" ON "ViewEvents"("CreatedAt");

CREATE TABLE "ImpressionEvents" (
  "Id" BIGSERIAL PRIMARY KEY,
  "Namespace" TEXT NOT NULL,
  "ExtensionId" TEXT NOT NULL,
  "Version" TEXT,
  "Surface" TEXT NOT NULL,
  "Position" INT,
  "UserAgent" TEXT NOT NULL DEFAULT '',
  "IpHash" TEXT,
  "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX "impression_events_ns_id_ts_idx"
  ON "ImpressionEvents"("Namespace", "ExtensionId", "CreatedAt");

CREATE INDEX "impression_events_ts_idx" ON "ImpressionEvents"("CreatedAt");

CREATE TABLE "ExtensionDailyViews" (
  "Namespace" TEXT NOT NULL,
  "ExtensionId" TEXT NOT NULL,
  "Day" DATE NOT NULL,
  "TotalViews" BIGINT NOT NULL DEFAULT 0,
  "DistinctViews" BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY ("Namespace", "ExtensionId", "Day")
);

-- Surface is part of the key so an author can see where people found the
-- extension, not only how many times it was listed.
CREATE TABLE "ExtensionDailyImpressions" (
  "Namespace" TEXT NOT NULL,
  "ExtensionId" TEXT NOT NULL,
  "Surface" TEXT NOT NULL,
  "Day" DATE NOT NULL,
  "TotalImpressions" BIGINT NOT NULL DEFAULT 0,
  "DistinctImpressions" BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY ("Namespace", "ExtensionId", "Surface", "Day")
);

-- Per-version views and impressions, the same shape as the per-version download
-- rollup so the three can be joined by version. Surface stays out of the
-- impression rollup here: the version table already splits the numbers, and
-- the surface breakdown is a whole-extension view.
CREATE TABLE "ExtensionVersionDailyViews" (
  "Namespace" TEXT NOT NULL,
  "ExtensionId" TEXT NOT NULL,
  "Version" TEXT NOT NULL,
  "Day" DATE NOT NULL,
  "TotalViews" BIGINT NOT NULL DEFAULT 0,
  "DistinctViews" BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY ("Namespace", "ExtensionId", "Version", "Day")
);

CREATE TABLE "ExtensionVersionDailyImpressions" (
  "Namespace" TEXT NOT NULL,
  "ExtensionId" TEXT NOT NULL,
  "Version" TEXT NOT NULL,
  "Day" DATE NOT NULL,
  "TotalImpressions" BIGINT NOT NULL DEFAULT 0,
  "DistinctImpressions" BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY ("Namespace", "ExtensionId", "Version", "Day")
);
