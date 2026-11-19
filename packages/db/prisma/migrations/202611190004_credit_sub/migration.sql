-- A monthly credit plan as a subscription: which plan, its state at Stripe, and how much of the account's balance is the plan's (see packages/core/creditPlan.ts).
CREATE TABLE IF NOT EXISTS "CreditSub" (
  "userId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "subscriptionId" TEXT,
  "plan" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'none',
  "periodEnd" TIMESTAMP(3),
  "bucket" INTEGER NOT NULL DEFAULT 0,
  "packFloor" INTEGER NOT NULL DEFAULT 0,
  "grantAt" TIMESTAMP(3),
  "cancelAtEnd" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CreditSub_pkey" PRIMARY KEY ("userId")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CreditSub_subscriptionId_key" ON "CreditSub"("subscriptionId");
