-- Live 5G Proof audits (24 Nov 2026): a scan whose points run on the 5G lines only.
-- Applied by hand on 24 Nov 2026 (so written to run again safely).
ALTER TABLE "GridScan" ADD COLUMN IF NOT EXISTS "laneOnly" BOOLEAN NOT NULL DEFAULT false;
