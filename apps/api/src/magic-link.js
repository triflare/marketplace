import { hashToken, newToken } from './auth.js';
import { displayNameFromEmail, freeNamespace, namespaceFromEmail } from './accounts.js';
import { forbidden, unauthorized } from './errors.js';
import { withLocks } from './locks.js';
import {
  actionButton,
  emailLayout,
  escapeHtml,
  fallbackLink,
  paragraph,
} from './mail-templates.js';
import { product } from './product.js';
import { resolveReturnToUrl } from './return-to.js';
import { normalizeApiRoot } from './util.js';

export const MAGIC_LINK_TTL_MS = 15 * 60_000;
const EXCHANGE_TTL_MS = 5 * 60_000;
const MAX_EMAIL_LENGTH = 254;

// One address, one spelling: the identity row is keyed on this, so a link sent
// to Alice@Example.com has to find the account the same address created.
export function normalizeEmail(value) {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  if (email.length === 0 || email.length > MAX_EMAIL_LENGTH) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

// The link lands on the API, which then sends the browser to whoever asked for
// it -- normally the web client, which trades the one-time code for a session.
// `returnTo` travels in the link rather than in a stored row, so the address in
// the message is the whole instruction.
export function magicLinkUrl(config, token, returnTo) {
  const root = normalizeApiRoot(config.apiRoot);
  const url = new URL(
    `${config.publicBaseUrl.replace(/\/+$/, '')}${root ? `/${root}` : ''}/auth/magic-link/verify`,
  );
  url.searchParams.set('token', token);
  if (returnTo) url.searchParams.set('returnTo', returnTo);
  return url.toString();
}

// Every message has the same wording, whether or not the address has an
// account: the link is the only thing that differs, and it is what the
// recipient asked for.
export function magicLinkMessage(config, email, token, returnTo) {
  const url = magicLinkUrl(config, token, returnTo);
  return {
    to: email,
    subject: `Sign in to ${product.name}`,
    text: `Open this link to sign in to ${product.name}:\n\n${url}\n\nThe link works once and expires in 15 minutes. If you did not ask for it, ignore this message.`,
    // The plain part is the message that always renders; the HTML one is what
    // most people actually see, so it names the address being signed in and
    // carries the same single-use link.
    html: emailLayout({
      config,
      intro: `Sign in to ${product.name}`,
      content: [
        paragraph(
          `Use the button below to sign in as <strong style="color:#111827">${escapeHtml(email)}</strong>.`,
        ),
        actionButton({ href: url, label: 'Sign in' }),
        fallbackLink(url),
        paragraph(
          'The link works once and expires in 15 minutes. If you didn’t ask for it, you can ignore this message — nothing happens until it is opened.',
        ),
      ].join(''),
      footnote: 'You received this because someone asked to sign in with this address.',
    }),
    purpose: 'magic-link',
  };
}

// Hands out a link. `mail` is the host's failover chain, so the driver that
// delivers this message is whichever one accepts it.
export async function beginMagicLink({ db, config, mail, rateLimiter, ip }, email, returnTo) {
  const target = returnTo ? resolveReturnToUrl(returnTo, config) : null;
  // Both buckets are plain count-and-reject windows: one per address, so a
  // single inbox cannot be flooded, and one per caller, so one client cannot
  // enumerate addresses by mail volume.
  await rateLimiter.signupCheck(`magic-link:${email}`);
  await rateLimiter.signupCheck(`magic-link:ip:${ip}`);
  await db.AuthChallenges.deleteMany({ where: { ExpiresAt: { lt: new Date() } } });
  const token = newToken();
  await db.AuthChallenges.create({
    data: {
      Driver: 'magic-link',
      Subject: email,
      SecretHash: hashToken(token),
      ExpiresAt: new Date(Date.now() + MAGIC_LINK_TTL_MS),
    },
  });
  await mail.send(magicLinkMessage(config, email, token, target));
}

// Claims the link exactly once. The conditional update is the claim: two
// requests presenting the same token find one row between them, and the one
// that loses sees nothing.
export async function consumeMagicLink(db, token) {
  if (typeof token !== 'string' || token === '') {
    throw unauthorized('That link is invalid or has expired.');
  }
  const [row] = await db.$queryRaw`
    UPDATE "AuthChallenges"
    SET "ConsumedAt" = now()
    WHERE "SecretHash" = ${hashToken(token)}
      AND "Driver" = 'magic-link'
      AND "ConsumedAt" IS NULL AND "ExpiresAt" > now()
    RETURNING *
  `;
  if (!row) throw unauthorized('That link is invalid or has expired.');
  return row;
}

// The account behind the address, created on first use when registration is
// open. A link or a code is a verified address, so the identity is created
// verified. `driver` keeps the two email methods as separate identities, which
// is what lets both be enabled without one shadowing the other.
export async function accountForMagicLink(db, config, email, driver = 'magic-link') {
  const existing = await db.AuthIdentities.findUnique({
    where: { Driver_Issuer_Subject: { Driver: driver, Issuer: '', Subject: email } },
    include: { Users: true },
  });
  if (existing?.Users) return { user: existing.Users, created: false };

  if (config.auth.policy.registration === 'closed') {
    throw forbidden('Registration is closed on this instance.');
  }
  return withLocks(db, ['signup-bootstrap'], async (tx) => {
    const raced = await tx.AuthIdentities.findUnique({
      where: { Driver_Issuer_Subject: { Driver: driver, Issuer: '', Subject: email } },
      include: { Users: true },
    });
    if (raced?.Users) return { user: raced.Users, created: false };
    const count = await tx.Users.count();
    const user = await tx.Users.create({
      data: {
        Namespace: await freeNamespace(tx, namespaceFromEmail(email)),
        DisplayName: displayNameFromEmail(email),
        Role: count === 0 ? 'admin' : 'normal',
      },
    });
    await tx.AuthIdentities.create({
      data: {
        UserId: user.Id,
        Driver: driver,
        Issuer: '',
        Subject: email,
        Email: email,
        VerifiedAt: new Date(),
      },
    });
    return { user, created: true };
  });
}

// Gives the browser a one-time code instead of a session token, so the token
// never lands in a URL or a history entry. The API client, which can read a
// response body, gets the session directly.
export async function issueExchangeCode(db, challengeId, userId) {
  const code = newToken();
  await db.AuthChallenges.update({
    where: { Id: challengeId },
    data: {
      UserId: userId,
      ExchangeCodeHash: hashToken(code),
      ExpiresAt: new Date(Date.now() + EXCHANGE_TTL_MS),
    },
  });
  return code;
}

// Redeems that code for the account it was minted for, deleting the row in the
// same statement so a replayed code finds nothing.
export async function redeemExchangeCode(db, code) {
  if (typeof code !== 'string' || code === '') {
    throw unauthorized('That code is invalid or has expired.');
  }
  const [row] = await db.$queryRaw`
    DELETE FROM "AuthChallenges"
    WHERE "ExchangeCodeHash" = ${hashToken(code)} AND "UserId" IS NOT NULL
      AND "Driver" = 'magic-link' AND "ExpiresAt" > now()
    RETURNING *
  `;
  if (!row) throw unauthorized('That code is invalid or has expired.');
  const user = await db.Users.findUnique({ where: { Id: row.UserId } });
  if (!user) throw unauthorized('That code is invalid or has expired.');
  return user;
}
