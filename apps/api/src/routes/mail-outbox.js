import { Router } from 'express';
import { requireAdmin } from '../auth.js';
import { auditSoon } from '../audit.js';
import { fieldErrors, HttpError, notFound } from '../errors.js';
import { decodeCursor, keysetPage, pageToken, parseDir, parseLimit } from '../pagination.js';

const STATUSES = ['pending', 'sent', 'failed'];

// The route and the outcome of one outbound message. The body itself is not
// here: it is often a sign-in link, so a list an admin scrolls through says
// what was sent and how it went, and reading the actual text is one request
// further in.
function outboxToObject(row) {
  return {
    id: String(row.Id),
    to: row.To,
    subject: row.Subject,
    purpose: row.Purpose,
    driver: row.Driver,
    status: row.Status,
    attempts: row.Attempts,
    lastError: row.LastError,
    createdAt: row.CreatedAt.toISOString(),
    updatedAt: row.UpdatedAt.toISOString(),
    sentAt: row.SentAt ? row.SentAt.toISOString() : null,
  };
}

function outboxDetail(row) {
  return { ...outboxToObject(row), message: row.Message ?? {} };
}

// Every outbound message is written to the outbox before a provider sees it, so
// this is where a delivery an operator has to chase shows up. Admin only: the
// rows name recipients and carry whatever was sent to them.
export function makeMailOutboxRouter({ db, config, drivers }) {
  const router = Router();

  function idOf(req) {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) throw notFound('No such message.');
    return id;
  }

  router.get('/admin/mail/outbox', requireAdmin, async (req, res) => {
    const limit = parseLimit(config, req.query.limit);
    const cursor = decodeCursor(pageToken(req), { i: 'int' });
    const back = parseDir(req.query.dir);
    const where = {};
    const { status, purpose } = req.query;
    if (status !== undefined) {
      if (typeof status !== 'string' || !STATUSES.includes(status)) {
        throw fieldErrors([
          { field: 'status', message: `Must be one of: ${STATUSES.join(', ')}.` },
        ]);
      }
      where.Status = status;
    }
    if (purpose !== undefined) {
      if (typeof purpose !== 'string' || purpose.trim() === '') {
        throw fieldErrors([
          { field: 'purpose', message: 'Must be a purpose, such as magic-link.' },
        ]);
      }
      where.Purpose = purpose.trim();
    }
    if (cursor) where.Id = back ? { gt: cursor.i } : { lt: cursor.i };
    const rows = await db.MailOutbox.findMany({
      where,
      orderBy: { Id: back ? 'asc' : 'desc' },
      take: limit + 1,
    });
    res.json(
      keysetPage(req, rows, {
        limit,
        back,
        cursor,
        serialize: outboxToObject,
        keyOf: (row) => ({ i: Number(row.Id) }),
      }),
    );
  });

  router.get('/admin/mail/outbox/:id', requireAdmin, async (req, res) => {
    const row = await db.MailOutbox.findUnique({ where: { Id: idOf(req) } });
    if (!row) throw notFound('No such message.');
    res.json(outboxDetail(row));
  });

  router.post('/admin/mail/outbox/:id/retry', requireAdmin, async (req, res) => {
    const id = idOf(req);
    const row = await db.MailOutbox.findUnique({ where: { Id: id } });
    if (!row) throw notFound('No such message.');
    // A delivered message is not sent again: the recipient would get the same
    // link or notice twice. A failed attempt, and one a previous process left
    // pending, are what a retry is for.
    if (row.Status === 'sent') {
      throw new HttpError(409, {
        slug: 'already-sent',
        detail: 'This message was delivered; sending it again would duplicate it.',
      });
    }
    if (!drivers.get('mail')) {
      throw new HttpError(409, {
        slug: 'mail-unavailable',
        detail: 'No mail driver is configured, so nothing can be sent.',
      });
    }

    let result;
    try {
      result = await drivers.retryOutbox(id, req);
    } catch (error) {
      // The row carries the failure already; the provider's own words are what
      // the admin needs to see, so they are the response rather than a bare 500.
      throw new HttpError(502, {
        slug: 'mail-delivery-failed',
        detail: error?.message ?? 'The mail provider refused the message.',
      });
    }

    const updated = await db.MailOutbox.findUnique({ where: { Id: id } });
    auditSoon(
      db,
      req.auth.user,
      'mail.retry',
      {},
      {
        outboxId: String(id),
        to: row.To,
        purpose: row.Purpose,
      },
    );
    res.json({ ...outboxDetail(updated), result: result ?? null });
  });

  return router;
}
