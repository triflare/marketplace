import { Router } from 'express';
import { requireSession } from '../auth.js';
import { audit } from '../audit.js';
import {
  accountEmail,
  beginEmailChange,
  confirmEmailChange,
  mailConfigured,
} from '../email-change.js';
import { requireObjectBody } from './shared.js';

// The address an account signs in with. Reading it is what lets a settings page
// say which inbox a code will reach; changing it is a mail round trip, so the
// new address is proven before any identity moves.
export function makeEmailSettingsRouter({ db, config, rateLimiter, drivers }) {
  const router = Router();

  router.get('/', requireSession, async (req, res) => {
    const email = await accountEmail(db, req.auth.user.Id);
    res.json({
      email,
      // An address to move to is required as much as a way to send the code.
      changeable: email !== null && mailConfigured(config),
    });
  });

  router.post('/change', requireSession, async (req, res) => {
    requireObjectBody(req);
    const ctx = drivers.context({ request: req });
    await beginEmailChange(
      { db, config, mail: ctx.mail, rateLimiter, ip: req.ip },
      req.auth.user,
      req.body.email,
    );
    res.status(202).json({ sent: true });
  });

  router.post('/confirm', requireSession, async (req, res) => {
    requireObjectBody(req);
    // Guessing a code is bounded by the same pair of buckets a sign-in uses,
    // per caller and per account.
    await rateLimiter.loginCheck(`email-change:verify:${req.ip}`);
    await rateLimiter.loginCheck(`email-change:verify:${req.auth.user.Id}`);
    const result = await confirmEmailChange({ db }, req.auth.user, req.body.email, req.body.code);
    await audit(
      db,
      req.auth.user,
      'account.email.change',
      { namespace: req.auth.user.Namespace },
      { from: result.previous, to: result.email },
    );
    res.json({ email: result.email });
  });

  return router;
}
