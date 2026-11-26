-- When a pocket test's buyer was emailed how it ended.
ALTER TABLE "PocketTest" ADD COLUMN IF NOT EXISTS "notifiedAt" TIMESTAMP(3);
