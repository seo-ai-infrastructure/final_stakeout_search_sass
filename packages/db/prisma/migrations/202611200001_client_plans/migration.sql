-- Per-client monthly plans (Track and Command) on the existing monthly subscription: how many Track
-- seats it holds, and how much of the account's balance is the plan's Real-Device Sessions (the same
-- rollover rules as packages/core/creditPlan.ts). `grantedSeats`: clients whose sessions this month
-- has already added. Additive only.
ALTER TABLE "GbpSub" ADD COLUMN IF NOT EXISTS "trackSeats" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "GbpSub" ADD COLUMN IF NOT EXISTS "bucket" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "GbpSub" ADD COLUMN IF NOT EXISTS "packFloor" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "GbpSub" ADD COLUMN IF NOT EXISTS "grantAt" TIMESTAMP(3);
ALTER TABLE "GbpSub" ADD COLUMN IF NOT EXISTS "grantedSeats" INTEGER NOT NULL DEFAULT 0;
