-- Pricing (24 Nov 2026): founding members (the first 15 accounts on a plan, +25% plan sessions a
-- month) and yearly plans (billed once a year, points and briefs still added each month).
-- Applied by hand on 24 Nov 2026 (so written to run again safely).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "foundingNo" INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS "User_foundingNo_key" ON "User"("foundingNo");
ALTER TABLE "GbpSub" ADD COLUMN IF NOT EXISTS "billingInterval" TEXT NOT NULL DEFAULT 'month';
ALTER TABLE "GbpSub" ADD COLUMN IF NOT EXISTS "periodStart" TIMESTAMP(3);
ALTER TABLE "GbpSub" ADD COLUMN IF NOT EXISTS "nextGrantAt" TIMESTAMP(3);
