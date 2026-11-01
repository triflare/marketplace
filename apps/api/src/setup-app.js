import express from 'express';
import compression from 'compression';
import { makeCors } from './cors.js';
import { makeRequestId } from './request-id.js';
import { makeResponseHints } from './http-hints.js';
import { errorHandler, notFound } from './errors.js';
import { normalizeApiRoot } from './util.js';
import { makeOnboardingRouter } from './routes/onboarding.js';
import { product } from './product.js';

// The app served before the instance has a database. It deliberately has no
// database client, no session handling, and no routers: the only thing it can
// do is explain itself and write the first configuration. Keeping it this small
// is what lets a fresh container answer a browser before PostgreSQL exists.
export function createSetupApp({ config, system = {} }) {
  const app = express();
  app.disable('x-powered-by');
  app.locals.system = system;
  app.set('trust proxy', config.trustProxy ?? false);

  app.use(makeRequestId());
  app.use(compression());
  app.use(makeResponseHints());
  app.use(makeCors(config.cors));

  const jsonBody = express.json({ limit: '100kb' });
  app.use((req, res, next) => jsonBody(req, res, next));

  const apiRoot = normalizeApiRoot(config.apiRoot);
  const root = apiRoot ? `/${apiRoot}` : '';

  app.get('/health', (req, res) => {
    res.set('Cache-Control', 'no-store').json({
      status: 'ok',
      version: product.version,
      setupRequired: config.setupRequired === true,
      uptime: Math.round(process.uptime()),
    });
  });

  app.get('/ready', (req, res) => {
    res.set('Cache-Control', 'no-store').status(503).json({
      status: 'setup-required',
      detail: 'The instance is waiting for first-run configuration.',
    });
  });

  app.get('/', (req, res) => {
    res.set('Cache-Control', 'no-store').json({
      name: product.name,
      version: product.version,
      setupRequired: config.setupRequired === true,
      onboarding: `${root}/onboarding`,
      health: '/health',
    });
  });

  const onboarding = makeOnboardingRouter({ config, system });
  app.use(onboarding);
  if (root) app.use(root, onboarding);

  app.use((req, res, next) => next(notFound()));
  app.use(errorHandler);

  return { app, config };
}
