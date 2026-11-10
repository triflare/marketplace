-- A version alone says which text was accepted, not when. Both are needed to
-- show that consent was given against the document the account actually saw.
ALTER TABLE "Users" ADD COLUMN "TermsAcceptedAt" TIMESTAMPTZ(6);

-- The privacy policy was linked from signup but never recorded. It has its own
-- version because the two documents change independently.
ALTER TABLE "Users" ADD COLUMN "PrivacyAcceptedVersion" INTEGER;
ALTER TABLE "Users" ADD COLUMN "PrivacyAcceptedAt" TIMESTAMPTZ(6);
