import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { brandText, product } from './product.js';
import { createApp } from './app.js';
import { createSetupApp } from './setup-app.js';
import { HttpError } from './errors.js';
import { createDb, ensureDataDirs, reconcileOnBoot, runMigrations } from './db.js';
import { dailyAggregationJob } from './metrics.js';
import { makeMaintenanceJob } from './maintenance.js';
import { makeWebhooks } from './webhooks.js';

// `backgroundJobs` is off for the test suite. The jobs all run a pass
// immediately, and their passes collide with the suite's own setup: the daily
// aggregation locks the download rollups before reading download_events, which
// is the reverse of the order a TRUNCATE takes those tables in, so resetDb and
// a background pass deadlock. Tests that want a job build it themselves and
// drive it directly.
export async function bootstrap(
  config = loadConfig(),
  { backgroundJobs = true, storageProbe, resolveTarget, migrations = true, system } = {},
) {
  // Before the database exists there is nothing to open, reconcile, or migrate.
  // The setup app is the whole instance until onboarding writes a URL.
  if (config.setupRequired) {
    if (storageProbe && system) system.storageProbe = storageProbe;
    const { app } = createSetupApp({ config, system });
    return {
      app,
      db: null,
      config,
      rateLimiter: null,
      telemetry: null,
      drivers: null,
      blobs: null,
    };
  }
  ensureDataDirs(config.dataDir);
  const db = createDb(config);
  try {
    // The suite applies the migrations once and then tells every later boot to
    // skip the bridge: each test file boots its own app, so re-running it would
    // spawn `prisma migrate deploy` a few dozen times to find nothing pending.
    // Production always applies them.
    if (migrations) await runMigrations(db, config);
    await reconcileOnBoot(db, config);
    const { app, rateLimiter, telemetry, drivers, blobs } = createApp({
      config,
      db,
      storageProbe,
      resolveTarget,
      system,
    });
    if (!backgroundJobs) {
      return { app, db, config, rateLimiter, telemetry, drivers, blobs };
    }
    const metricsJob = dailyAggregationJob(db, config).start();
    const webhookWorker = makeWebhooks({ db }).worker().start();
    const maintenanceJob = makeMaintenanceJob({ db, config, blobs }).start();
    return {
      app,
      db,
      config,
      rateLimiter,
      telemetry,
      drivers,
      blobs,
      metricsJob,
      webhookWorker,
      maintenanceJob,
    };
  } catch (error) {
    await db.$disconnect();
    throw error;
  }
}

const isMain = process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url);

if (isMain) {
  const configPath = process.argv[2];
  // Read before the system record: loadConfig is what resolves the path when the
  // operator named none, and the record has to report the file in use.
  const config = loadConfig(configPath);
  // The supervisor check is opt-in: the operator says something outside will
  // start this process again, and only then may it exit on request.
  const system = {
    supervised: config.process.supervised,
    startedAt: new Date(),
    configPath: config.configPath,
    lastReload: null,
    setupRequired: config.setupRequired,
  };

  let booted = await bootstrap(config, { system });
  // The listening socket is bound once and never closed by a reload: the
  // handler looks up the current app, so a rebuild is invisible to clients.
  let currentApp = booted.app;
  const server = http.createServer((req, res) => currentApp(req, res));

  async function stopApp(app) {
    app.locals?.rateLimiter?.stop?.();
    await app.locals?.drivers?.close?.();
  }

  // The socket belongs to the process, not to an app, so a setup app can be
  // replaced by the full one without dropping connections.
  async function swap(next) {
    const previous = currentApp;
    currentApp = next.app;
    await stopApp(previous);
    booted = next;
    system.setupRequired = next.config.setupRequired === true;
    system.lastReload = new Date();
  }

  // Called by the setup app once onboarding has written a usable config. The
  // fresh config is passed in because the setup app already validated it; a
  // reload from disk goes through loadConfig instead.
  system.onboard = async (freshConfig) => {
    const fresh = freshConfig ?? loadConfig(configPath);
    if (fresh.setupRequired) {
      throw new HttpError(409, {
        slug: 'setup-required',
        detail: 'The configuration is not complete yet.',
      });
    }
    const rebuilt = await bootstrap(fresh, { system });
    await swap(rebuilt);
    return {
      setupRequired: false,
      driversRevision: rebuilt.drivers?.revision?.() ?? null,
    };
  };

  system.reload = async () => {
    const fresh = loadConfig(configPath);
    if (fresh.setupRequired) {
      const rebuilt = createSetupApp({ config: fresh, system });
      await swap({
        app: rebuilt.app,
        db: null,
        config: fresh,
        rateLimiter: null,
        telemetry: null,
        drivers: null,
        blobs: null,
      });
      return { setupRequired: true };
    }
    if (!booted.db) {
      // The file gained a database URL while the setup app was serving: this is
      // the transition onboarding makes, so run it through the same path.
      return system.onboard(fresh);
    }
    if (fresh.database.url !== booted.config.database.url) {
      // Reopening the pool under the workers that already hold the old one is
      // a restart's job, not a reload's.
      throw new HttpError(409, {
        title: 'Restart Required',
        detail: 'The database URL changed, and a new pool needs a restart.',
      });
    }
    const rebuilt = createApp({
      config: fresh,
      db: booted.db,
      storageProbe: undefined,
      resolveTarget: undefined,
      system,
    });
    await swap({
      ...booted,
      app: rebuilt.app,
      config: fresh,
      rateLimiter: rebuilt.rateLimiter,
      telemetry: rebuilt.telemetry,
      drivers: rebuilt.drivers,
      blobs: rebuilt.blobs,
    });
    return { driversRevision: rebuilt.drivers.revision() };
  };

  system.restart = async () => {
    if (system.restarting) return;
    system.restarting = true;
    const drainSeconds = booted.config.process.drainSeconds;
    server.close();
    // In-flight requests get the drain window, then the connections are torn
    // down. Drivers close before the process leaves, so a message already
    // accepted is not cut off mid-send.
    const force = setTimeout(() => server.closeAllConnections(), drainSeconds * 1000);
    await new Promise((resolve) => {
      server.once('close', resolve);
      setTimeout(resolve, drainSeconds * 1000);
    });
    clearTimeout(force);
    await stopApp(currentApp);
    await booted.db?.$disconnect();
    process.exit(0);
  };

  server.listen(booted.config.port, () => {
    console.log(
      `${brandText(product.name)} v${product.version} listening on http://localhost:${booted.config.port}${system.supervised ? ' (supervised)' : ''}${config.setupRequired ? ' (first-run setup)' : ''}`,
    );
  });

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    booted.rateLimiter?.stop?.();
    await booted.metricsJob?.stop?.();
    await booted.webhookWorker?.stop?.();
    await booted.maintenanceJob?.stop?.();
    await stopApp(currentApp);
    const force = setTimeout(() => server.closeAllConnections(), 5000);
    await new Promise((resolve) => server.close(resolve));
    clearTimeout(force);
    await booted.db?.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
