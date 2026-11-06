-- Per-phone health and auto-pause.
ALTER TABLE "DevicePool" ADD COLUMN "recentOutcomes" TEXT NOT NULL DEFAULT '';
ALTER TABLE "DevicePool" ADD COLUMN "pinsSucceeded" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "DevicePool" ADD COLUMN "pinsFailed" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "DevicePool" ADD COLUMN "lastFailureCode" TEXT;
ALTER TABLE "DevicePool" ADD COLUMN "lastFailureAt" TIMESTAMP(3);
ALTER TABLE "DevicePool" ADD COLUMN "lastSuccessAt" TIMESTAMP(3);
ALTER TABLE "DevicePool" ADD COLUMN "autoPausedAt" TIMESTAMP(3);
ALTER TABLE "DevicePool" ADD COLUMN "autoPauseReason" TEXT;

-- Queue wait measurement.
ALTER TABLE "GridPin" ADD COLUMN "startedAt" TIMESTAMP(3);
CREATE INDEX "GridPin_startedAt_idx" ON "GridPin"("startedAt");
