-- Rivals' public Google listings, looked up for the competitor gaps panel and kept for 14 days.
-- A new table: nothing existing changes.
CREATE TABLE "RivalProfile" (
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "data" JSONB,
  "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RivalProfile_pkey" PRIMARY KEY ("key")
);
