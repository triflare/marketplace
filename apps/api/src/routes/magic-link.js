import { Router } from 'express';
import { beginSigninMfa, hasPasskeys } from '../mfa.js';
import {
  accountForMagicLink,
  beginMagicLink,
  consumeMagicLink,
  issueExchangeCode,
  normalizeEmail,
  redeemExchangeCode,
} from '../magic-link.js';
import { fieldErrors, notFound } from '../errors.js';
import { safeReturnToUrl } from '../return-to.js';
import { sessionToObject, userToObject } from '../serialize.js';
import { createSession, requireObjectBody, sessionPath } from './shared.js';

// The link is a first factor: it proves the address, and an account with a
// passkey still stops at its second one. Everything the driver hands out is
// single-use, and the browser half trades its code for a session rather than
// carrying the token in a URL.
export function makeMagicLinkRouter({ db, config, rateLimiter, drivers }) {
  const router = Router();
  const enabled = config.auth.methods.some((entry) => entry.driver === 'magic-link');
  const sessionTtlMs = config.auth.sessionTtlDays * 86_400_000;

  router.use((req, res, next) => {
    if (!enabled) throw notFound();
    next();
  });

  router.post('/', async (req, res) => {
    requireObjectBody(req);
    const email = normalizeEmail(req.body.email);
    if (!email) {
      throw fieldErrors([{ field: 'email', message: 'A valid email address is required.' }]);
    }
    // A client that is not on the instance's own origin -- the web app on its
    // own port, say -- names where the browser should land after the link is
    // clicked. The address has to be one this instance trusts, or the link
    // would hand its one-time code to whoever the caller named.
    const returnTo = req.body.returnTo ?? null;
    const ctx = drivers.context({ request: req });
    await beginMagicLink({ db, config, mail: ctx.mail, rateLimiter, ip: req.ip }, email, returnTo);
    // The answer is the same for a known and an unknown address: whether an
    // account exists is not something this endpoint tells a caller.
    res.status(202).json({ sent: true });
  });

  router.get('/verify', async (req, res) => {
    const row = await consumeMagicLink(db, req.query.token);
    const { user } = await accountForMagicLink(db, config, row.Subject);
    if (!wantsHtml(req)) return send(res, await sessionBody(user));
    const code = await issueExchangeCode(db, row.Id, user.Id);
    const target = redirectTarget(safeReturnToUrl(req.query.returnTo, config), config);
    target.searchParams.set('magic_link_code', code);
    res.redirect(target.toString());
  });

  router.post('/complete', async (req, res) => {
    requireObjectBody(req);
    const row = await consumeMagicLink(db, req.body.token);
    const { user } = await accountForMagicLink(db, config, row.Subject);
    send(res, await sessionBody(user));
  });

  router.post('/exchange', async (req, res) => {
    requireObjectBody(req);
    const user = await redeemExchangeCode(db, req.body.code);
    send(res, await sessionBody(user));
  });

  async function sessionBody(user) {
    if (await hasPasskeys(db, user.Id)) {
      return { status: 202, body: await beginSigninMfa(db, user.Id) };
    }
    const created = await createSession(db, user.Id, sessionTtlMs);
    return {
      status: 201,
      location: sessionPath(config, created.session),
      body: {
        session: sessionToObject(created.session),
        user: userToObject(user, config),
        token: created.token,
      },
    };
  }

  return router;
}

function send(res, outcome) {
  if (outcome.location) res.location(outcome.location);
  res.status(outcome.status).json(outcome.body);
}

function wantsHtml(req) {
  return String(req.headers.accept ?? '').includes('text/html');
}

// The stored returnTo was checked when the link was sent, so this only has to
// turn it into a URL and fall back to the instance root when there is none.
function redirectTarget(value, config) {
  try {
    return new URL(value ?? '', config.publicBaseUrl);
  } catch {
    return new URL(config.publicBaseUrl);
  }
}
