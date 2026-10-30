import { randomInt } from 'node:crypto';
import { hashToken } from './auth.js';
import { unauthorized } from './errors.js';
import { accountForMagicLink } from './magic-link.js';
import { codeBlock, emailLayout, escapeHtml, paragraph } from './mail-templates.js';
import { product } from './product.js';

export const EMAIL_OTP_TTL_MS = 10 * 60_000;

export function generateEmailOtp() {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

// The code is the whole message: no link, no token, and the same wording for a
// known and an unknown address, so it says nothing about who has an account.
export function emailOtpMessage(config, email, code) {
  return {
    to: email,
    subject: `Your ${product.name} sign-in code`,
    text: `Your sign-in code is ${code}. It expires in 10 minutes and works once.\n\nIf you did not ask for it, ignore this message.`,
    // The code is the whole message, so the HTML part puts it where the eye
    // lands first rather than dressing it up as a link.
    html: emailLayout({
      config,
      intro: 'Your sign-in code',
      content: [
        paragraph(
          `Enter this code to sign in as <strong style="color:#111827">${escapeHtml(email)}</strong>.`,
        ),
        codeBlock(code),
        paragraph(
          'It expires in 10 minutes and works once. If you didn’t ask for it, you can ignore this message — the code is useless without the address it was sent to.',
        ),
      ].join(''),
      footnote: 'You received this because someone asked for a sign-in code for this address.',
    }),
    purpose: 'email-otp',
  };
}

export async function beginEmailOtp({ db, config, mail, rateLimiter, ip }, email) {
  // One bucket per address so a single inbox cannot be flooded, one per caller
  // so one client cannot enumerate addresses by mail volume.
  await rateLimiter.signupCheck(`email-otp:${email}`);
  await rateLimiter.signupCheck(`email-otp:ip:${ip}`);
  await db.AuthChallenges.deleteMany({ where: { ExpiresAt: { lt: new Date() } } });
  // Asking again is how a user recovers from a message they mistyped, and it
  // also invalidates the code that is still on its way.
  await db.AuthChallenges.deleteMany({
    where: { Driver: 'email-otp', Subject: email, ConsumedAt: null },
  });
  const code = generateEmailOtp();
  await db.AuthChallenges.create({
    data: {
      Driver: 'email-otp',
      Subject: email,
      SecretHash: hashToken(code),
      ExpiresAt: new Date(Date.now() + EMAIL_OTP_TTL_MS),
    },
  });
  await mail.send(emailOtpMessage(config, email, code));
}

// Claimed exactly once, and only for the address it was sent to: the row is
// found by both, so a code for one inbox does not open another.
export async function consumeEmailOtp(db, email, code) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) {
    throw unauthorized('That code is invalid or has expired.');
  }
  const [row] = await db.$queryRaw`
    UPDATE "AuthChallenges"
    SET "ConsumedAt" = now()
    WHERE "Driver" = 'email-otp'
      AND "Subject" = ${email}
      AND "SecretHash" = ${hashToken(code)}
      AND "ConsumedAt" IS NULL AND "ExpiresAt" > now()
    RETURNING *
  `;
  if (!row) throw unauthorized('That code is invalid or has expired.');
  return row;
}

// A correct code is a verified address, so the account is created with that
// identity already verified. The driver name keeps the two email methods apart
// even when both are enabled.
export function accountForEmailOtp(db, config, email) {
  return accountForMagicLink(db, config, email, 'email-otp');
}
