import { Router } from 'express';
import { accountForEmailOtp, beginEmailOtp, consumeEmailOtp } from '../email-otp.js';
import { fieldErrors, notFound } from '../errors.js';
import { normalizeEmail } from '../magic-link.js';
import { beginSigninMfa, hasPasskeys } from '../mfa.js';
import { sessionToObject, userToObject } from '../serialize.js';
import { createSession, requireObjectBody, sessionPath } from './shared.js';

// The code is a first factor like a link: it proves the address, and an account
// with a passkey still stops at its second one. It is claimed once, so the same
// code cannot open two sessions.
export function makeEmailOtpRouter({ db, config, rateLimiter, drivers }) {
  const router = Router();
  const enabled = config.auth.methods.some((entry) => entry.driver === 'email-otp');
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
    const ctx = drivers.context({ request: req });
    await beginEmailOtp({ db, config, mail: ctx.mail, rateLimiter, ip: req.ip }, email);
    // The answer is the same for a known and an unknown address: whether an
    // account exists is not something this endpoint tells a caller.
    res.status(202).json({ sent: true });
  });

  router.post('/verify', async (req, res) => {
    requireObjectBody(req);
    const email = normalizeEmail(req.body.email);
    if (!email) {
      throw fieldErrors([{ field: 'email', message: 'A valid email address is required.' }]);
    }
    const code = typeof req.body.code === 'string' ? req.body.code.trim() : '';
    // Guessing is bounded per caller and per address, the same pair of buckets
    // the password route uses for the same reason.
    await rateLimiter.loginCheck(`email-otp:verify:${req.ip}`);
    await rateLimiter.loginCheck(`email-otp:verify:${email}`);
    await consumeEmailOtp(db, email, code);
    const { user } = await accountForEmailOtp(db, config, email);

    if (await hasPasskeys(db, user.Id)) {
      return res.status(202).json(await beginSigninMfa(db, user.Id));
    }
    const created = await createSession(db, user.Id, sessionTtlMs);
    res
      .location(sessionPath(config, created.session))
      .status(201)
      .json({
        session: sessionToObject(created.session),
        user: userToObject(user, config),
        token: created.token,
      });
  });

  return router;
}
