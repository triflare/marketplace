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

// The account the presented token belongs to. It sits at the root of the API
// because it is not addressed by namespace: there is exactly one, and the token
// already names it.
export function makeMeRouter({ db, config }) {
  const router = Router();

  router.get('/me', requireAuth, (req, res) => {
    res.set('ETag', userEtag(req.auth.user)).json(userToObject(req.auth.user, config));
  });

  // Everything the registry holds that names or describes this account, in one
  // document a person can read or take elsewhere. Secrets are left out: a
  // session or token is a credential, not a record about the person, and a
  // password hash is of no use to them.
  router.get('/me/export', requireScope('manage:account'), async (req, res) => {
    const user = await db.Users.findUnique({ where: { Id: req.auth.user.Id } });
    if (!user) throw notFound('No such account.');

    const [
      identities,
      sessions,
      tokens,
      passkeys,
      notifications,
      reports,
      memberships,
      versions,
      legal,
    ] = await Promise.all([
      db.AuthIdentities.findMany({
        where: { UserId: user.Id },
        orderBy: { Id: 'asc' },
      }),
      db.Sessions.findMany({ where: { UserId: user.Id }, orderBy: { Id: 'asc' } }),
      db.AutomationTokens.findMany({ where: { UserId: user.Id }, orderBy: { Id: 'asc' } }),
      db.Passkeys.findMany({ where: { UserId: user.Id }, orderBy: { Id: 'asc' } }),
      db.Notifications.findMany({ where: { UserId: user.Id }, orderBy: { Id: 'asc' } }),
      db.Reports.findMany({ where: { ReporterId: user.Id }, orderBy: { Id: 'asc' } }),
      db.OrganizationOwners.findMany({
        where: { UserId: user.Id },
        select: { OrgId: true, AddedAt: true },
        orderBy: { OrgId: 'asc' },
      }),
      db.Versions.findMany({
        where: { OwnerId: user.Id },
        orderBy: { Id: 'asc' },
        select: {
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

    res.set('Content-Disposition', `attachment; filename="account-${user.Namespace}.json"`);
    res.json({
      formatVersion: 1,
      generatedAt: new Date().toISOString(),
      account: userToObject(user, config),
      emailIdentities: identities.map((row) => ({
        driver: row.Driver,
        issuer: row.Issuer,
        subject: row.Subject,
        email: row.Email ?? null,
        verifiedAt: row.VerifiedAt ? row.VerifiedAt.toISOString() : null,
        createdAt: row.CreatedAt.toISOString(),
      })),
      sessions: sessions.map(sessionToObject),
      automationTokens: tokens.map(automationTokenToObject),
      passkeys: passkeys.map(passkeyToObject),
      notifications: notifications.map(notificationToObject),
      reports: reports.map(reportToOwnerObject),
      organizations: organizations.map((row) => ({
        namespace: row.Namespace,
        displayName: row.DisplayName,
        createdAt: row.CreatedAt.toISOString(),
      })),
      versions: versions.map((row) => ({
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
      })),
      legal: {
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
      },
      retention: {
        downloadEventsDays: config.privacy.downloadEventRetentionDays,
        mailOutboxDays: config.privacy.mailOutboxRetentionDays,
      },
    });
  });

  return router;
}
