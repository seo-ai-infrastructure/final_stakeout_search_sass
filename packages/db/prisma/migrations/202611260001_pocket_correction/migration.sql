-- A correction email owed to a pocket test's buyer, and when it went.
ALTER TABLE "PocketTest" ADD COLUMN IF NOT EXISTS "correctionAt" TIMESTAMP(3);
ALTER TABLE "PocketTest" ADD COLUMN IF NOT EXISTS "correctionSentAt" TIMESTAMP(3);
