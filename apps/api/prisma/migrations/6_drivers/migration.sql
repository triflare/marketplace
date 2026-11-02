-- The identity table becomes the registry's: a driver names the credential,
-- and the issuer is empty for the drivers that do not have one.
ALTER TABLE "UserIdentities" RENAME TO "AuthIdentities";
ALTER TABLE "AuthIdentities" ADD COLUMN "Driver" TEXT NOT NULL DEFAULT 'oidc';
ALTER TABLE "AuthIdentities" ADD COLUMN "VerifiedAt" TIMESTAMPTZ(6);
UPDATE "AuthIdentities" SET "VerifiedAt" = "CreatedAt" WHERE "VerifiedAt" IS NULL;

DROP INDEX IF EXISTS "UserIdentities_Issuer_Subject_key";
ALTER INDEX IF EXISTS "UserIdentities_UserId_idx" RENAME TO "AuthIdentities_UserId_idx";
ALTER INDEX IF EXISTS "UserIdentities_pkey" RENAME TO "AuthIdentities_pkey";
CREATE UNIQUE INDEX "AuthIdentities_Driver_Issuer_Subject_key"
  ON "AuthIdentities" ("Driver", "Issuer", "Subject");
CREATE INDEX "AuthIdentities_Driver_Subject_idx" ON "AuthIdentities" ("Driver", "Subject");

CREATE TABLE "AuthChallenges" (
  "Id" BIGSERIAL NOT NULL,
  "Driver" TEXT NOT NULL,
  "Subject" TEXT NOT NULL,
  "SecretHash" TEXT NOT NULL,
  "Challenge" TEXT,
  "UserId" BIGINT,
  "ExchangeCodeHash" TEXT,
  "ExpiresAt" TIMESTAMPTZ(6) NOT NULL,
  "ConsumedAt" TIMESTAMPTZ(6),
  "Attempts" INTEGER NOT NULL DEFAULT 0,
  "CreatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthChallenges_pkey" PRIMARY KEY ("Id")
);
CREATE UNIQUE INDEX "AuthChallenges_SecretHash_key" ON "AuthChallenges" ("SecretHash");
CREATE UNIQUE INDEX "AuthChallenges_ExchangeCodeHash_key" ON "AuthChallenges" ("ExchangeCodeHash");
CREATE INDEX "AuthChallenges_ExpiresAt_idx" ON "AuthChallenges" ("ExpiresAt");
CREATE INDEX "AuthChallenges_Driver_Subject_idx" ON "AuthChallenges" ("Driver", "Subject");
ALTER TABLE "AuthChallenges" ADD CONSTRAINT "AuthChallenges_UserId_fkey"
  FOREIGN KEY ("UserId") REFERENCES "Users" ("Id") ON DELETE CASCADE ON UPDATE NO ACTION;

CREATE TABLE "MailOutbox" (
  "Id" BIGSERIAL NOT NULL,
  "To" TEXT NOT NULL,
  "Subject" TEXT NOT NULL,
  "Purpose" TEXT,
  "Driver" TEXT,
  "Status" TEXT NOT NULL DEFAULT 'pending',
  "Attempts" INTEGER NOT NULL DEFAULT 0,
  "LastError" TEXT,
  "Message" JSONB NOT NULL DEFAULT '{}',
  "CreatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "UpdatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "SentAt" TIMESTAMPTZ(6),
  CONSTRAINT "MailOutbox_pkey" PRIMARY KEY ("Id")
);
CREATE INDEX "MailOutbox_Status_CreatedAt_idx" ON "MailOutbox" ("Status", "CreatedAt");
CREATE INDEX "MailOutbox_CreatedAt_idx" ON "MailOutbox" ("CreatedAt" DESC);
