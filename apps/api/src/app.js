import express from 'express';
import compression from 'compression';
import { loadConfig } from './config.js';
import { createDb } from './db.js';
import { createDriverHost } from './drivers/host.js';
import { createBlobStore } from './blob-store.js';
import { normalizeDriverConfig } from './drivers/config.js';
import { makeAuthenticate, makeRequireTerms } from './auth.js';
import { makeRateLimiter } from './rate-limit.js';
import { makeHttpRateLimiter } from './http-rate-limit.js';
import { makeRequestTelemetry } from './observability.js';
import { makeCors } from './cors.js';
import { makeRequestId } from './request-id.js';
import { makeResponseHints } from './http-hints.js';
import { HttpError, notFound, errorHandler } from './errors.js';
import { normalizeApiRoot } from './util.js';
import { makeMeRouter } from './routes/me.js';
import { makeAuthRouter } from './routes/auth.js';
import { makeMfaRouter } from './routes/mfa.js';
import { makeDeviceRouter } from './routes/device.js';
import { makeMagicLinkRouter } from './routes/magic-link.js';
import { makeEmailOtpRouter } from './routes/email-otp.js';
import { makeEmailSettingsRouter } from './routes/email.js';
import { makePasskeySigninRouter } from './routes/passkey-signin.js';
import { makeMagicPasswordRouter } from './routes/magic-password.js';
import { makeSessionsRouter } from './routes/sessions.js';
import { makeTokensRouter } from './routes/tokens.js';
import { makeUsersRouter } from './routes/users.js';
import { makeNotificationsRouter } from './routes/notifications.js';
import { makePackagesRouter } from './routes/packages.js';
import { makeBlobsRouter } from './routes/blobs.js';
import { makeDiscoveryRouter } from './routes/discovery.js';
import { makeOrgsRouter } from './routes/orgs.js';
import { makeAdminRouter } from './routes/admin.js';
import { makeDriversRouter } from './routes/drivers.js';
import { makeMailOutboxRouter } from './routes/mail-outbox.js';
import { makeReportsRouter } from './routes/reports.js';
import { makeSystemRouter } from './routes/system.js';
import { makeMethodGuard } from './methods.js';

export function createApp(opts = {}) {
  const config = opts.config ?? loadConfig();
  const db = opts.db ?? createDb(config);

  const app = express();
  app.disable('x-powered-by');

  // The host owns the configured instances and is the only thing that swaps
  // them. Routers resolve through it, so a replacement is visible on the next
  // call rather than at the next boot.
  const drivers = opts.drivers ?? createDriverHost({ config, db });
  // A config built outside loadConfig (the suite does this) still has to be
  // resolved: the method set is what the routers read, and deriving it here
  // keeps the two ways into the process saying the same thing.
  if (!config.driverInstances) normalizeDriverConfig(config);
  drivers.boot(config.driverInstances);
  // Blob bytes live behind the storage driver, resolved per call like every
  // other driver. The local backend keeps the filesystem fast paths; a remote
  // one is addressed by the same digest keys.
  const blobs = opts.blobs ?? createBlobStore({ config, drivers });
  // Kept by reference: the entry point attaches reload/restart after the app
  // is built, and the routes have to see them.
  const system = opts.system ?? {};
  system.supervised ??= false;
  system.startedAt ??= new Date();
  system.configPath ??= config.configPath ?? null;
  system.lastReload ??= null;
  app.locals.system = system;
  app.locals.drivers = drivers;
  app.set('trust proxy', opts.trustProxy ?? config.trustProxy ?? false);

  // Before anything that can fail, so a rejection still names the occurrence.
  app.use(makeRequestId());
  app.use(compression());
  // Wraps res.json; registered before the routers so every body written below
  // picks up the Link, ETag, and no-store rules.
  app.use(makeResponseHints());

  if (config.requireHttps) {
    app.use((req, res, next) => {
      if (req.secure) return next();
      return next(new HttpError(403, { title: 'Forbidden', detail: 'HTTPS is required.' }));
    });
  }

  app.use(makeCors(config.cors));

  // Counts and timings for /admin/metrics; also the structured request log
  // when `logging.requests` is on. Mounted before the rate limiter and the
  // routers so rate-limited responses and unmatched paths still count.
  const telemetry = makeRequestTelemetry({ logRequests: config.logging?.requests === true });
  app.locals.telemetry = telemetry;
  app.use(telemetry.middleware);

  // Coarse per-IP DoS backstop for every route, including the file-serving
  // and ownership-checked endpoints. The DB-backed buckets in rate-limit.js
  // layer their precise login/signup/publish/download windows on top.
  app.use(makeHttpRateLimiter(config));

  const jsonBody = express.json({ limit: '100kb' });
  app.use((req, res, next) => {
    const isPublish = req.method === 'POST' && /\/@[^/?]+\/[^/?]+\/versions\/?$/.test(req.path);
    return isPublish ? next() : jsonBody(req, res, next);
  });
  app.use(makeAuthenticate(db));

  const rateLimiter = makeRateLimiter(db, config);
  app.locals.rateLimiter = rateLimiter;
  const termsGate = makeRequireTerms(db);
  // How configStorage decides whether the config file survives a recreate. Left
  // unset the route reads the real mount table; a test passes its own so the
  // answer does not depend on where the checkout happens to be running.
  const storageProbe = opts.storageProbe ?? {};
  const shared = {
    db,
    config,
    rateLimiter,
    termsGate,
    storageProbe,
    drivers,
    blobs,
    resolveTarget: opts.resolveTarget,
  };

  const apiRoot = normalizeApiRoot(config.apiRoot);
  const root = apiRoot ? `/${apiRoot}` : '';
  const mount = (suffix) => `${root}${suffix}`;
  // The organization list is the registry listing scoped to a namespace, so the
  // discovery router is built first and lends it out rather than the two keeping
  // a copy of the same query and sort apart.
  const discovery = makeDiscoveryRouter(shared);

  // Root-level: liveness, readiness, the problem catalogue, the spec, and the
  // links index. Everything under `root` is the versioned surface.
  app.use(makeSystemRouter({ config, db }));

  app.use(mount('/sessions'), makeSessionsRouter(shared));
  // Before the auth router: `/auth/mfa` and `/auth/device` are longer prefixes
  // of the same mount point, and Express tries routers in the order they are
  // registered.
  app.use(mount('/auth/mfa'), makeMfaRouter(shared));
  app.use(mount('/auth/device'), makeDeviceRouter(shared));
  app.use(mount('/auth/magic-link'), makeMagicLinkRouter(shared));
  app.use(mount('/auth/email-otp'), makeEmailOtpRouter(shared));
  // After the sign-in email routers so their longer prefixes are tried first.
  app.use(mount('/auth/email'), makeEmailSettingsRouter(shared));
  app.use(mount('/auth/passkey'), makePasskeySigninRouter(shared));
  app.use(mount('/auth/magic-password'), makeMagicPasswordRouter(shared));
  app.use(mount('/auth'), makeAuthRouter(shared));
  app.use(mount('/tokens'), makeTokensRouter(shared));
  app.use(mount('/users'), makeUsersRouter(shared));
  app.use(mount('/orgs'), makeOrgsRouter({ ...shared, listExtensions: discovery.listExtensions }));
  app.use(mount('/notifications'), makeNotificationsRouter(shared));
  app.use(mount('/reports'), makeReportsRouter(shared));
  app.use(root || '/', makeMeRouter(shared));
  app.use(root || '/', makeBlobsRouter(shared));
  app.use(root || '/', makePackagesRouter(shared));
  app.use(root || '/', discovery.router);
  app.use(root || '/', makeDriversRouter(shared));
  app.use(root || '/', makeMailOutboxRouter(shared));
  app.use(root || '/', makeAdminRouter(shared));

  // After every router: a path that exists but not for this method is a 405
  // with an Allow header, not the 404 the fall-through would produce.
  app.use(makeMethodGuard(apiRoot));
  app.use((req, res, next) => next(notFound()));
  app.use(errorHandler);

  return { app, db, config, rateLimiter, telemetry, drivers, blobs };
}
