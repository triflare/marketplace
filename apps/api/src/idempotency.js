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
      if (!stale) return replay(existing);
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
    res.json = (body) => {
      const status = res.statusCode;
      const payload =
        status >= 200 && status < 300 ? JSON.parse(JSON.stringify(body ?? null)) : null;
      if (payload !== null && !stored) {
        stored = true;
        void db.IdempotencyKeys.update({ where, data: { Status: status, Body: payload } }).catch(
          () => {},
        );
      }
      return json(body);
    };

    // A failed attempt leaves the key free: the client asked for the work, it
    // did not happen, and the same key should be able to try again.
    res.on('finish', () => {
      if (res.statusCode >= 400) {
        void db.IdempotencyKeys.deleteMany({ where }).catch(() => {});
      }
    });

    return next();
  };
}
