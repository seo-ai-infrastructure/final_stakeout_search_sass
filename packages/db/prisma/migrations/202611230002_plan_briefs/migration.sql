-- Account plans (Nov 2026): briefs bought on the account, a plan's briefs on its subscription, and what paid for each compiled brief.
-- Applied by hand on 23 Nov 2026 (so written to run again safely).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "briefBalance" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "GbpSub" ADD COLUMN IF NOT EXISTS "briefPlan" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "GbpSub" ADD COLUMN IF NOT EXISTS "briefCarry" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "GbpSub" ADD COLUMN IF NOT EXISTS "grantedBriefs" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "briefs" ADD COLUMN IF NOT EXISTS "paid_by" TEXT NOT NULL DEFAULT 'admin';
ALTER TABLE "GbpSub" ADD COLUMN IF NOT EXISTS "accountPlan" TEXT;
