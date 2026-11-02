import { Router } from 'express';
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { hashToken, newToken } from '../auth.js';
import { CEREMONY_TTL_MS, decodePublicKey, webauthnSettings } from '../mfa.js';
import { fieldErrors, notFound, unauthorized } from '../errors.js';
import { sessionToObject, userToObject } from '../serialize.js';
import { createSession, requireObjectBody, sessionPath } from './shared.js';

const KIND = 'signin-passkey';

// The claim and the read are one conditional DELETE ... RETURNING, so two
// requests presenting the same flow token cannot both find it.
async function claimSigninChallenge(db, flowToken) {
  const [row] = await db.$queryRaw`
    DELETE FROM "AuthChallenges"
    WHERE "SecretHash" = ${hashToken(flowToken)} AND "Driver" = ${KIND}
      AND "ExpiresAt" > now()
    RETURNING *
  `;
  return row ?? null;
}

// Signing in with a passkey alone: the authenticator proves possession and the
// person verifies it, so the result is a complete session rather than a first
// factor waiting on a second one.
export function makePasskeySigninRouter({ db, config, rateLimiter }) {
  const router = Router();
  const enabled = config.auth.methods.some((entry) => entry.driver === 'passkey');
  const settings = webauthnSettings(config);
  const sessionTtlMs = config.auth.sessionTtlDays * 86_400_000;

  router.use((req, res, next) => {
    if (!enabled) throw notFound();
    next();
  });

  router.post('/options', async (req, res) => {
    requireObjectBody(req);
    const namespace = req.body.namespace;
    if (typeof namespace !== 'string' || namespace === '') {
      throw fieldErrors([{ field: 'namespace', message: 'A namespace is required.' }]);
    }
    const user = await db.Users.findUnique({ where: { Namespace: namespace } });
    const passkeys = user
      ? await db.Passkeys.findMany({
          where: { UserId: user.Id },
          select: { CredentialId: true, Transports: true },
        })
      : [];
    const options = await generateAuthenticationOptions({
      rpID: settings.rpId,
      allowCredentials: passkeys.map((passkey) => ({
        id: passkey.CredentialId,
        ...(passkey.Transports?.length ? { transports: passkey.Transports } : {}),
      })),
      userVerification: 'required',
    });

    // The same answer for a namespace that exists and one that does not: a
    // browser prompts for the passkey either way, and the verify step is where
    // a missing account is refused.
    const flowToken = newToken();
    if (user) {
      await db.$transaction([
        db.AuthChallenges.deleteMany({ where: { UserId: user.Id, Driver: KIND } }),
        db.AuthChallenges.create({
          data: {
            Driver: KIND,
            Subject: namespace,
            SecretHash: hashToken(flowToken),
            Challenge: options.challenge,
            UserId: user.Id,
            ExpiresAt: new Date(Date.now() + CEREMONY_TTL_MS),
          },
        }),
      ]);
    }
    res.json({ flowToken, options });
  });

  router.post('/verify', async (req, res) => {
    requireObjectBody(req);
    const { flowToken, response } = req.body;
    if (typeof flowToken !== 'string' || flowToken === '') {
      throw unauthorized('That sign-in is unknown or has expired.');
    }
    const row = await claimSigninChallenge(db, flowToken);
    if (!row || !row.Challenge || row.UserId === null) {
      throw unauthorized('That sign-in is unknown or has expired.');
    }
    const user = await db.Users.findUnique({ where: { Id: row.UserId } });
    if (!user) throw unauthorized('That sign-in is unknown or has expired.');

    const recordFailures = await Promise.all([
      rateLimiter.loginCheck(`login:${user.Namespace}|${req.ip}`),
      rateLimiter.loginCheck(`login:ip:${req.ip}`),
    ]);
    let passkey;
    try {
      passkey = await verifiedPasskey(response, row.Challenge, user.Id);
    } catch (error) {
      if (error?.status === 401) await Promise.all(recordFailures.map((record) => record()));
      throw error;
    }

    const created = await db.$transaction(async (tx) => {
      await tx.Passkeys.update({
        where: { Id: passkey.Id },
        data: {
          Counter: BigInt(passkey.newCounter ?? Number(passkey.Counter)),
          LastUsedAt: new Date(),
        },
      });
      return createSession(tx, user.Id, sessionTtlMs);
    });
    res
      .location(sessionPath(config, created.session))
      .status(201)
      .json({
        session: sessionToObject(created.session),
        user: userToObject(user, config),
        token: created.token,
      });
  });

  async function verifiedPasskey(response, challenge, userId) {
    const credentialId = response?.id;
    if (typeof credentialId !== 'string' || credentialId === '') {
      throw unauthorized('That passkey is not valid.');
    }
    const passkey = await db.Passkeys.findUnique({ where: { CredentialId: credentialId } });
    if (!passkey || Number(passkey.UserId) !== Number(userId)) {
      throw unauthorized('That passkey is not valid.');
    }
    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: challenge,
        expectedOrigin: settings.origins,
        expectedRPID: settings.rpId,
        credential: {
          id: passkey.CredentialId,
          publicKey: decodePublicKey(passkey.PublicKey),
          counter: Number(passkey.Counter),
        },
        requireUserVerification: true,
      });
    } catch {
      throw unauthorized('That passkey could not be verified.');
    }
    if (!verification.verified) throw unauthorized('That passkey could not be verified.');
    return { ...passkey, newCounter: verification.authenticationInfo.newCounter };
  }

  return router;
}
