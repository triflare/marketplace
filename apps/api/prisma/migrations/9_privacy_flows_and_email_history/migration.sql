-- A sign-in that creates an account needs the version accepted before the
-- address was verified. The row is the only place that survives the redirect.
ALTER TABLE "AuthChallenges" ADD COLUMN "PrivacyAcceptedVersion" INTEGER;

-- The browser leaves for the provider before the account exists, so the
-- authorize request carries the accepted version through the flow row.
ALTER TABLE "OidcFlows" ADD COLUMN "PrivacyAcceptedVersion" INTEGER;

-- Mail already queued to an address the account used to hold still names it.
-- The account deletion sweep needs those former addresses, not only the
-- current identity rows.
ALTER TABLE "Users" ADD COLUMN "PreviousEmails" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
