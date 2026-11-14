import { Router } from 'express';
import { requireAuth, requireScope } from '../auth.js';
import {
  automationTokenToObject,
  notificationToObject,
  passkeyToObject,
  reportToOwnerObject,
  sessionToObject,
  userToObject,
} from '../serialize.js';
import { notFound } from '../errors.js';
import { userEtag } from '../validators.js';
import { accountAnalytics, parseAnalyticsDays } from '../analytics.js';

const EXPORT_PAGE_SIZE = 500;

// One page at a time, keyed on the primary key. A cursor keeps each query
// bounded without putting a ceiling on the complete export.
async function* pagedRows(db, model, { where, select }) {
  let cursor = null;
  for (;;) {
    const query = {
      where: cursor === null ? where : { AND: [where, { Id: { gt: cursor } }] },
      orderBy: { Id: 'asc' },
      take: EXPORT_PAGE_SIZE,
    };
    if (select) query.select = select;
    const rows = await db[model].findMany(query);
    if (rows.length === 0) return;
    for (const row of rows) yield row;
    if (rows.length < EXPORT_PAGE_SIZE) return;
    cursor = rows[rows.length - 1].Id;
  }
}

async function writeChunk(res, chunk) {
  if (res.destroyed) throw new Error('Export response closed.');
  if (res.write(chunk)) return;
  await new Promise((resolve, reject) => {
    const cleanup = () => {
      res.off('drain', onDrain);
      res.off('error', onError);
      res.off('close', onClose);
    };
    const onDrain = () => {
      cleanup();
      resolve();
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const onClose = () => onError(new Error('Export response closed.'));
    res.once('drain', onDrain);
    res.once('error', onError);
    res.once('close', onClose);
    if (res.destroyed) onClose();
  });
}

async function writeArray(res, rows, serialize) {
  await writeChunk(res, '[');
  let first = true;
  for await (const row of rows) {
    if (!first) await writeChunk(res, ',');
    await writeChunk(res, JSON.stringify(serialize(row)));
    first = false;
  }
  await writeChunk(res, ']');
}

// The account the presented token belongs to. It sits at the root of the API
// because it is not addressed by namespace: there is exactly one, and the token
// already names it.
export function makeMeRouter({ db, config }) {
  const router = Router();

  router.get('/me', requireAuth, (req, res) => {
    res.set('ETag', userEtag(req.auth.user)).json(userToObject(req.auth.user, config));
  });

  // The dashboard's reach row: the same daily rollups as one extension's
  // analytics, summed over every address this namespace publishes.
  router.get('/me/analytics', requireAuth, async (req, res) => {
    res.json(
      await accountAnalytics(db, {
        namespace: req.auth.user.Namespace,
        days: parseAnalyticsDays(req.query.days),
      }),
    );
  });

  // Everything the registry holds that names or describes this account, in one
  // document a person can read or take elsewhere. Secrets are left out: a
  // session or token is a credential, not a record about the person, and a
  // password hash is of no use to them.
  router.get('/me/export', requireScope('manage:account'), async (req, res) => {
    const user = await db.Users.findUnique({ where: { Id: req.auth.user.Id } });
    if (!user) throw notFound('No such account.');

    const [identities, tokens, passkeys, memberships, legal] = await Promise.all([
      db.AuthIdentities.findMany({
        where: { UserId: user.Id },
        orderBy: { Id: 'asc' },
      }),
      db.AutomationTokens.findMany({ where: { UserId: user.Id }, orderBy: { Id: 'asc' } }),
      db.Passkeys.findMany({ where: { UserId: user.Id }, orderBy: { Id: 'asc' } }),
      db.OrganizationOwners.findMany({
        where: { UserId: user.Id },
        select: { OrgId: true, AddedAt: true },
        orderBy: { OrgId: 'asc' },
      }),
      db.LegalDocuments.findMany({
        select: { Kind: true, Version: true, UpdatedAt: true },
        orderBy: { Kind: 'asc' },
      }),
    ]);

    const orgIds = memberships.map((row) => row.OrgId);
    const organizations =
      orgIds.length === 0
        ? []
        : await db.Users.findMany({
            where: { Id: { in: orgIds }, Kind: 'organization' },
            select: { Namespace: true, DisplayName: true, CreatedAt: true },
            orderBy: { Namespace: 'asc' },
          });

    const emailIdentities = identities.map((row) => ({
      driver: row.Driver,
      issuer: row.Issuer,
      subject: row.Subject,
      email: row.Email ?? null,
      verifiedAt: row.VerifiedAt ? row.VerifiedAt.toISOString() : null,
      createdAt: row.CreatedAt.toISOString(),
    }));
    const legalDocument = {
      documents: legal.map((row) => ({
        kind: row.Kind,
        version: row.Version,
        updatedAt: row.UpdatedAt.toISOString(),
      })),
      accepted: {
        termsVersion: user.TermsAcceptedVersion ?? null,
        termsAcceptedAt: user.TermsAcceptedAt ? user.TermsAcceptedAt.toISOString() : null,
        privacyVersion: user.PrivacyAcceptedVersion ?? null,
        privacyAcceptedAt: user.PrivacyAcceptedAt ? user.PrivacyAcceptedAt.toISOString() : null,
      },
    };
    const retention = {
      downloadEventsDays: config.privacy.downloadEventRetentionDays,
      analyticsEventsDays: config.privacy.analyticsEventRetentionDays,
      mailOutboxDays: config.privacy.mailOutboxRetentionDays,
    };

    res.set('Content-Disposition', `attachment; filename="account-${user.Namespace}.json"`);
    res.set('Cache-Control', 'no-store');
    res.type('application/json');

    try {
      await writeChunk(
        res,
        `{"formatVersion":1,"generatedAt":${JSON.stringify(new Date().toISOString())},"account":${JSON.stringify(userToObject(user, config))},"emailIdentities":${JSON.stringify(emailIdentities)},"sessions":`,
      );
      await writeArray(
        res,
        pagedRows(db, 'Sessions', { where: { UserId: user.Id } }),
        sessionToObject,
      );
      await writeChunk(
        res,
        `,"automationTokens":${JSON.stringify(tokens.map(automationTokenToObject))},"passkeys":${JSON.stringify(passkeys.map(passkeyToObject))},"notifications":`,
      );
      await writeArray(
        res,
        pagedRows(db, 'Notifications', { where: { UserId: user.Id } }),
        notificationToObject,
      );
      await writeChunk(res, ',"reports":');
      await writeArray(
        res,
        pagedRows(db, 'Reports', { where: { ReporterId: user.Id } }),
        reportToOwnerObject,
      );
      await writeChunk(
        res,
        `,"organizations":${JSON.stringify(
          organizations.map((row) => ({
            namespace: row.Namespace,
            displayName: row.DisplayName,
            createdAt: row.CreatedAt.toISOString(),
          })),
        )},"versions":`,
      );
      await writeArray(
        res,
        pagedRows(db, 'Versions', {
          where: { OwnerId: user.Id },
          select: {
            Id: true,
            Namespace: true,
            ExtensionId: true,
            Version: true,
            Status: true,
            Name: true,
            License: true,
            Description: true,
            Author: true,
            CreatedAt: true,
            PublishedAt: true,
          },
        }),
        (row) => ({
          namespace: row.Namespace,
          id: row.ExtensionId,
          version: row.Version,
          status: row.Status,
          name: row.Name,
          license: row.License,
          description: row.Description,
          author: row.Author ?? null,
          createdAt: row.CreatedAt.toISOString(),
          publishedAt: row.PublishedAt ? row.PublishedAt.toISOString() : null,
        }),
      );
      await writeChunk(
        res,
        `,"legal":${JSON.stringify(legalDocument)},"retention":${JSON.stringify(retention)}}`,
      );
      res.end();
    } catch (error) {
      if (res.headersSent) {
        res.destroy(error);
        return;
      }
      throw error;
    }
  });

  return router;
}
