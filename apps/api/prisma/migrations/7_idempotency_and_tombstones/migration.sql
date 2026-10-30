-- CreateTable
CREATE TABLE "ExtensionTombstones" (
    "Namespace" TEXT NOT NULL,
    "ExtensionId" TEXT NOT NULL,
    "DeletedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExtensionTombstones_pkey" PRIMARY KEY ("Namespace","ExtensionId")
);

-- CreateTable
CREATE TABLE "IdempotencyKeys" (
    "Id" BIGSERIAL NOT NULL,
    "UserId" BIGINT NOT NULL,
    "Route" TEXT NOT NULL,
    "Key" TEXT NOT NULL,
    "Fingerprint" TEXT NOT NULL,
    "Status" INTEGER,
    "Body" JSONB,
    "CreatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ExpiresAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "IdempotencyKeys_pkey" PRIMARY KEY ("Id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKeys_UserId_Route_Key_key" ON "IdempotencyKeys"("UserId", "Route", "Key");

-- CreateIndex
CREATE INDEX "IdempotencyKeys_ExpiresAt_idx" ON "IdempotencyKeys"("ExpiresAt");

-- AlterTable
ALTER TABLE "Users" ADD COLUMN "UpdatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AddForeignKey
ALTER TABLE "IdempotencyKeys" ADD CONSTRAINT "IdempotencyKeys_UserId_fkey" FOREIGN KEY ("UserId") REFERENCES "Users"("Id") ON DELETE CASCADE ON UPDATE NO ACTION;
