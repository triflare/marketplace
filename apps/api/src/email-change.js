import { hashToken } from './auth.js';
import { uniqueViolation } from './db.js';
import { getDescriptor } from './drivers/registry.js';
import { generateEmailOtp } from './email-otp.js';
import { conflict, fieldErrors, forbidden, HttpError } from './errors.js';
import { codeBlock, emailLayout, escapeHtml, paragraph } from './mail-templates.js';
import { normalizeEmail } from './magic-link.js';
import { product } from './product.js';

// A change of address is proven the same way a sign-in by address is: a
// six-digit code mailed to the new address. The row is kept apart from the
// sign-in codes by its driver name, so a code asked for here cannot sign
// anybody in and a sign-in code cannot move an address.
export const EMAIL_CHANGE_DRIVER = 'email-change';
export const EMAIL_CHANGE_TTL_MS = 10 * 60_000;

// The drivers whose identity *is* an email address, read from what the driver
// says it needs rather than from a list here: a method that requires mail is
// one that signs in by address. A new mail-backed method therefore joins the
// account's email automatically instead of being forgotten.
function isEmailIdentity(row) {
  return getDescriptor('auth', row.Driver)?.requirements?.mail === true;
}

// Whether a message could be delivered at all. `none` is the driver that stands
// for "no mail"; every other configured instance was chosen for a reason, and
// the config validator already refuses a mail-backed auth method beside `none`.
export function mailConfigured(config) {
  return (config.driverInstances?.mail ?? []).some((entry) => entry.driver !== 'none');
}

// The address the account signs in with when it uses an email method. The
// sign-in methods are asked in their usual order first, so an account that
// somehow holds more than one reports the one a reader would expect.
export async function accountEmail(db, userId) {
  const rows = (
    await db.AuthIdentities.findMany({ where: { UserId: userId }, orderBy: { Id: 'asc' } })
  ).filter(isEmailIdentity);
  const preferred =
    rows.find((row) => row.Driver === 'magic-link') ??
    rows.find((row) => row.Driver === 'email-otp') ??
    rows[0];
  return preferred ? (preferred.Email ?? preferred.Subject) : null;
}

// A code with the address it confirms, in the same plain-and-HTML shape as the
// sign-in messages so a reader sees nothing unfamiliar while doing something
// unusually sensitive.
export function emailChangeMessage(config, email, code) {
  return {
    to: email,
    subject: `Confirm your new ${product.name} email address`,
    text: `Your confirmation code is ${code}. It expires in 10 minutes and works once.\n\nIf you did not ask to change your email address, ignore this message: the address on your account is unchanged until this code is entered.`,
    html: emailLayout({
      config,
      intro: 'Confirm your new email address',
      content: [
        paragraph(
          `Enter this code to use <strong style="color:#111827">${escapeHtml(email)}</strong> for ${escapeHtml(product.name)}.`,
        ),
        codeBlock(code),
        paragraph(
          'It expires in 10 minutes and works once. If you didn’t ask for this, ignore the message — the address on your account stays exactly as it was.',
        ),
      ].join(''),
      footnote:
        'You received this because someone asked to change the email address on an account.',
    }),
    purpose: 'email-change',
  };
}

// The code is the request. It names the account it belongs to, so the person
// confirming has to still be signed in as that account, and it names the new
// address, so a code for one address cannot move the account to another.
export async function beginEmailChange({ db, config, mail, rateLimiter, ip }, user, requested) {
  if (!mailConfigured(config)) {
    throw forbidden(
      'Changing your email needs a mail driver, and this instance has none configured.',
    );
  }
  const email = normalizeEmail(requested);
  if (!email) {
    throw fieldErrors([{ field: 'email', message: 'A valid email address is required.' }]);
  }

  const current = await accountEmail(db, user.Id);
  if (!current) {
    throw conflict('This account has no email address to change.');
  }
  if (email === current) {
    throw fieldErrors([
      { field: 'email', message: 'That is already the address on this account.' },
    ]);
  }

  // The same pair of buckets a sign-in message uses: one per address so a single
  // inbox cannot be flooded, one per caller so one client cannot enumerate
  // addresses by the volume of mail it causes.
  await rateLimiter.signupCheck(`email-change:${email}`);
  await rateLimiter.signupCheck(`email-change:ip:${ip}`);

  await assertAddressFree(db, email, user.Id);

  await db.AuthChallenges.deleteMany({ where: { ExpiresAt: { lt: new Date() } } });
  // Asking again replaces the request that is still on its way, so the code
  // from the earlier message stops working the moment a new one is sent.
  await db.AuthChallenges.deleteMany({
    where: { Driver: EMAIL_CHANGE_DRIVER, UserId: user.Id, ConsumedAt: null },
  });
  const code = generateEmailOtp();
  await db.AuthChallenges.create({
    data: {
      Driver: EMAIL_CHANGE_DRIVER,
      Subject: email,
      SecretHash: hashToken(code),
      UserId: user.Id,
      ExpiresAt: new Date(Date.now() + EMAIL_CHANGE_TTL_MS),
    },
  });
  await mail.send(emailChangeMessage(config, email, code));
  return { sent: true };
}

// Claims the code once and re-keys every address-based identity the account
// has, so the sign-in methods that were using the old address now use the new
// one. A code for an address another account already signs in with is refused
// rather than merged: moving an address must not hand over somebody's account.
export async function confirmEmailChange({ db }, user, requested, code) {
  const email = normalizeEmail(requested);
  if (!email) {
    throw fieldErrors([{ field: 'email', message: 'A valid email address is required.' }]);
  }
  const entered = typeof code === 'string' ? code.replace(/\s+/g, '') : '';
  if (!/^\d{6}$/.test(entered)) {
    throw fieldErrors([{ field: 'code', message: 'Enter the six-digit code from the message.' }]);
  }

  const [claimed] = await db.$queryRaw`
    UPDATE "AuthChallenges"
    SET "ConsumedAt" = now()
    WHERE "Driver" = ${EMAIL_CHANGE_DRIVER}
      AND "Subject" = ${email}
      AND "UserId" = ${user.Id}
      AND "SecretHash" = ${hashToken(entered)}
      AND "ConsumedAt" IS NULL AND "ExpiresAt" > now()
    RETURNING *
  `;
  // A wrong or spent code is a problem with the field, not with the session:
  // the caller is still signed in, so a client should say what is wrong with
  // the code rather than ask them to sign in again.
  if (!claimed) {
    throw new HttpError(422, {
      title: 'Unprocessable Entity',
      detail: 'That code is invalid or has expired.',
    });
  }

  // Checked again here, not only when the message went out: another account
  // could have taken the address in the meantime.
  await assertAddressFree(db, email, user.Id);

  const identities = (
    await db.AuthIdentities.findMany({ where: { UserId: user.Id }, orderBy: { Id: 'asc' } })
  ).filter(isEmailIdentity);
  if (identities.length === 0) {
    throw conflict('This account has no email address to change.');
  }
  const previous = await accountEmail(db, user.Id);
  const drivers = [...new Set(identities.map((row) => row.Driver))];

  try {
    await db.$transaction(async (tx) => {
      await tx.AuthIdentities.updateMany({
        where: { UserId: user.Id, Driver: { in: drivers } },
        data: { Subject: email, Email: email, VerifiedAt: new Date() },
      });
      // Any other outstanding request for this account is stale now.
      await tx.AuthChallenges.deleteMany({
        where: { Driver: EMAIL_CHANGE_DRIVER, UserId: user.Id },
      });
    });
  } catch (error) {
    // A racing change can still lose the unique key on (driver, issuer,
    // subject); that is the same conflict, told the same way.
    if (uniqueViolation(error)) {
      throw conflict('That address is already in use on this instance.');
    }
    throw error;
  }

  return { email, previous };
}

async function assertAddressFree(db, email, userId) {
  const rows = await db.AuthIdentities.findMany({
    where: { Subject: email, NOT: { UserId: userId } },
    select: { Driver: true },
  });
  if (rows.some(isEmailIdentity)) {
    throw conflict('That address is already in use on this instance.');
  }
}
