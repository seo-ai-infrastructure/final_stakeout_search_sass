-- The change watchdog: what each Google listing looked like when we last agreed with it, and the
-- changes found since that we did not send. Two new tables: nothing existing changes.
CREATE TABLE "GbpWatch" (
  "locationId" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "title" TEXT,
  "baseline" JSONB NOT NULL,
  "accepted" JSONB NOT NULL DEFAULT '{}',
  "baselineAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "problem" TEXT,
  CONSTRAINT "GbpWatch_pkey" PRIMARY KEY ("locationId")
);

CREATE TABLE "GbpDrift" (
  "id" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "title" TEXT,
  "field" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "was" TEXT NOT NULL,
  "now" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "foundAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  CONSTRAINT "GbpDrift_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GbpDrift_status_foundAt_idx" ON "GbpDrift"("status", "foundAt");
CREATE INDEX "GbpDrift_locationId_field_status_idx" ON "GbpDrift"("locationId", "field", "status");
