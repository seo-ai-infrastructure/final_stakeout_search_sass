-- Where a scan's searches come from: "residential" (home internet) or "mobile" (mobile data).
-- Additive with a default, so existing rows and the running code are unaffected.
ALTER TABLE "GridScan" ADD COLUMN "network" TEXT NOT NULL DEFAULT 'residential';
