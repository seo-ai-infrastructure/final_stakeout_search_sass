-- A business's Google ID ("/g/...") and website, beside its name, so AI answers are matched exactly
-- (two offices with the same name have different IDs). Additive and nullable: existing rows and the
-- running code are unaffected.
ALTER TABLE "GridScan" ADD COLUMN "targetKgmid" TEXT;
ALTER TABLE "GridScan" ADD COLUMN "targetDomain" TEXT;
ALTER TABLE "SavedBusiness" ADD COLUMN "kgmid" TEXT;
ALTER TABLE "SavedBusiness" ADD COLUMN "domain" TEXT;
