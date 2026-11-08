import { createHash } from 'node:crypto';
import { uniqueViolation } from './db.js';
import { fieldErrors, HttpError } from './errors.js';

// How long an answer stays replayable. Long enough for a client to retry a
// publish it never saw the answer to, short enough that the table stays small.
const TTL_MS = 24 * 60 * 60 * 1000;
// A claim left behind by a process that died mid-request may be taken over
// after this long, so a crash costs one retry rather than the rest of the TTL.
const STALE_CLAIM_MS = 5 * 60 * 1000;
const KEY = /^[\x21-\x7e]{8,128}$/;

// `Idempotency-Key` makes a creation safe to retry. The first request with a
// key does the work and stores its answer; a retry with the same key and the
// same request replays that answer instead of creating a second resource. The
// key is scoped to the credential's account and to the route it was used on, so
// two clients cannot collide and one key cannot be spent on another endpoint.
//
// Anonymous creations are not covered: there is no account to scope the key to,
// and a key shared across callers would be a way to read somebody else's answer.
export function idempotent(db) {
  return async function idempotency(req, res, next) {
    const key = req.get('idempotency-key');
    if (key === undefined) return next();
    if (!KEY.test(key)) {
      throw fieldErrors([
        {
          field: 'Idempotency-Key',
          message: 'Must be 8 to 128 printable ASCII characters.',
        },
      ]);
    }
    const userId = req.auth?.user?.Id;
    if (userId === undefined) return next();

    const route = `${req.method} ${req.baseUrl}${req.path}`;
    // A publish body is the tarball itself, so the bytes are hashed directly
    // rather than expanded into JSON first.
    const material = Buffer.isBuffer(req.body) ? req.body : JSON.stringify(req.body ?? null);
    const fingerprint = createHash('sha256').update(material).digest('base64url');
    const where = { UserId_Route_Key: { UserId: userId, Route: route, Key: key } };

    async function replay(row) {
      if (row.Fingerprint !== fingerprint) {
        throw new HttpError(422, {
          slug: 'idempotency-key-reused',
          detail: 'This key was used for a different request. Use a new key for a new request.',
        });
      }
      if (row.Status === null) {
        throw new HttpError(409, {
          slug: 'idempotency-in-progress',
          detail: 'A request with this key is still being processed. Retry in a moment.',
        });
      }
      res.set('Idempotent-Replayed', 'true');
      return res.status(row.Status).json(row.Body);
    }

    const existing = await db.IdempotencyKeys.findUnique({ where });
    if (existing) {
      const stale =
        existing.Status === null && Date.now() - existing.CreatedAt.getTime() > STALE_CLAIM_MS;
      // Past its TTL the row is cache the sweep has not reached yet, so the key
      // counts as unused rather than replaying an answer meant to be forgotten.
      const expired = existing.ExpiresAt.getTime() <= Date.now();
      if (!stale && !expired) return replay(existing);
      await db.IdempotencyKeys.deleteMany({ where: { Id: existing.Id } });
    }

    try {
      await db.IdempotencyKeys.create({
        data: {
          UserId: userId,
          Route: route,
          Key: key,
          Fingerprint: fingerprint,
          ExpiresAt: new Date(Date.now() + TTL_MS),
        },
      });
    } catch (error) {
      // Two requests with one key raced: the loser reports the winner's state
      // rather than doing the work twice.
      if (uniqueViolation(error)) {
        const winner = await db.IdempotencyKeys.findUnique({ where });
        if (winner) return replay(winner);
      }
      throw error;
    }

    // Expired answers are cleared when a new key is claimed, which is the only
    // moment the table grows, so no sweep of its own is needed.
    void db.IdempotencyKeys.deleteMany({ where: { ExpiresAt: { lt: new Date() } } }).catch(
      () => {},
    );

    const json = res.json.bind(res);
    let stored = false;
    let released = false;
    res.json = (body) => {
      const status = res.statusCode;
      // A failed attempt leaves the key free: the client asked for the work, it
      // did not happen, and the same key should be able to try again. The row is
      // deleted before the error is flushed, for the same reason the answer is
      // written before the response: a client can retry the moment it reads it,
      // and must not meet its own claim and be told the work is in progress.
      if (status >= 400) {
        if (released) return json(body);
        released = true;
        db.IdempotencyKeys.deleteMany({ where }).then(
          () => json(body),
          () => json(body),
        );
        return res;
      }
      const payload =
        status >= 200 && status < 300 ? JSON.parse(JSON.stringify(body ?? null)) : null;
      if (payload === null || stored) {
        json(body);
        return res;
      }
      // The answer is written before the response is flushed. A client can
      // retry the moment it reads this answer, and a retry that met the claim
      // while it was still empty would be told the work is in progress after it
      // had already finished.
      stored = true;
      db.IdempotencyKeys.update({ where, data: { Status: status, Body: payload } }).then(
        () => json(body),
        () => json(body),
      );
      return res;
    };

    // Covers the error paths that answer without `res.json`; the ones that went
    // through it have released the key by the time this fires.
    res.on('finish', () => {
      if (res.statusCode >= 400 && !released) {
        released = true;
        void db.IdempotencyKeys.deleteMany({ where }).catch(() => {});
      }
    });

    return next();
  };
}
