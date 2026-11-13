-- A release held for review is stored as source only and built once a
-- moderator approves it, so a build hook cannot run here before then.
ALTER TABLE "Versions" ALTER COLUMN "BlobPath" DROP NOT NULL;
