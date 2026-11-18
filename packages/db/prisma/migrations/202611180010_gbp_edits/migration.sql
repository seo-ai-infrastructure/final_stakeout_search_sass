-- The record of every Google Business Profile edit sent from the admin editor: who sent it, what
-- changed, the profile exactly as it was before (to restore from), and whether Google is showing it.
-- A new table: existing rows and the running code are unaffected.
CREATE TABLE "GbpEdit" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "title" TEXT,
  "tier" TEXT NOT NULL,
  "changes" JSONB NOT NULL,
  "before" JSONB NOT NULL,
  "status" TEXT NOT NULL,
  "error" TEXT,
  "checkedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GbpEdit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "GbpEdit_locationId_createdAt_idx" ON "GbpEdit"("locationId", "createdAt");
