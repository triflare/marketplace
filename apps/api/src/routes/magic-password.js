import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { makeRequireRecentAuth, requireSession } from '../auth.js';
import { displayNameFromEmail, freeNamespace, namespaceFromEmail } from '../accounts.js';
import { conflict, fieldErrors, notFound } from '../errors.js';
import { hashPassword } from '../password.js';
import { normalizeEmail } from '../magic-link.js';
import { withLocks } from '../locks.js';
import { sessionToObject, userToObject } from '../serialize.js';
import { createSession, requireObjectBody, sessionPath } from './shared.js';

const DRIVER = 'magic-password';

// The password driver with a generated secret and the address as the
// identifier: registration makes the account and a password, shows the
// password once, and signs the account in. There is no mail involved in
// delivering it -- the response is the delivery -- which is why an instance
// enabling this still has to have a mail driver: the address is the way back
// in when the password is lost.
export function makeMagicPasswordRouter({ db, config, rateLimiter }) {
  const router = Router();
  const enabled = config.auth.methods.some((entry) => entry.driver === DRIVER);
  const requireRecentAuth = makeRequireRecentAuth(config);
  const sessionTtlMs = config.auth.sessionTtlDays * 86_400_000;
  const scrypt = config.auth.scrypt;

  router.use((req, res, next) => {
    if (!enabled) throw notFound();
    next();
  });

  router.post('/register', async (req, res) => {
    requireObjectBody(req);
    const email = normalizeEmail(req.body.email);
    if (!email) {
      throw fieldErrors([{ field: 'email', message: 'A valid email address is required.' }]);
    }
    await rateLimiter.signupCheck(`signup:${req.ip}`, res);
    const password = generatePassword();
    const passwordHash = await hashPassword(password, scrypt);

    const user = await withLocks(db, ['signup-bootstrap'], async (tx) => {
      const existing = await tx.AuthIdentities.findUnique({
        where: { Driver_Issuer_Subject: { Driver: DRIVER, Issuer: '', Subject: email } },
      });
      if (existing) throw conflict('An account already uses that address.');
      const count = await tx.Users.count();
      const created = await tx.Users.create({
        data: {
          Namespace: await freeNamespace(tx, namespaceFromEmail(email)),
          DisplayName: displayNameFromEmail(email),
          PasswordHash: passwordHash,
          Role: count === 0 ? 'admin' : 'normal',
        },
      });
      await tx.AuthIdentities.create({
        data: {
          UserId: created.Id,
          Driver: DRIVER,
          Issuer: '',
          Subject: email,
          Email: email,
          VerifiedAt: new Date(),
        },
      });
      return created;
    });

    const created = await createSession(db, user.Id, sessionTtlMs);
    res
      .location(sessionPath(config, created.session))
      .status(201)
      .json({
        user: userToObject(user, config),
        session: sessionToObject(created.session),
        token: created.token,
        password,
        // The response is the only place the generated password appears; the row
        // holds the scrypt hash like any other password.
        passwordShownOnce: true,
      });
  });

  // A new password for the account, shown once. Recent authentication is
  // required, since this is a credential change.
  router.post('/rotate', [requireSession, requireRecentAuth], async (req, res) => {
    const password = generatePassword();
    const passwordHash = await hashPassword(password, scrypt);
    await db.Users.update({
      where: { Id: req.auth.user.Id },
      data: { PasswordHash: passwordHash, UpdatedAt: new Date() },
    });
    res.status(201).json({ password, passwordShownOnce: true });
  });

  return router;
}

// Twenty-four URL-safe characters: about 144 bits, which is far past what a
// password field needs and still fits on one line of a terminal.
export function generatePassword() {
  return randomBytes(18).toString('base64url');
}
