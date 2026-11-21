-- Seats and the two scan speeds. GbpSub reuses the columns added by 202611200001_client_plans:
-- "trackSeats" holds Scout seats and "grantedSeats" the monthly points already covered this month.
-- GridScan: how a scan runs ('now' = Scan Now, 'scheduled'), when a scheduled scan starts, and when
-- a first $5 audit gets its free re-run. Additive only.
ALTER TABLE "GridScan" ADD COLUMN IF NOT EXISTS "speed" TEXT NOT NULL DEFAULT 'now';
ALTER TABLE "GridScan" ADD COLUMN IF NOT EXISTS "runAt" TIMESTAMP(3);
ALTER TABLE "GridScan" ADD COLUMN IF NOT EXISTS "freeRescanAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "GridScan_status_runAt_idx" ON "GridScan"("status", "runAt");
CREATE INDEX IF NOT EXISTS "GridScan_freeRescanAt_idx" ON "GridScan"("freeRescanAt");
