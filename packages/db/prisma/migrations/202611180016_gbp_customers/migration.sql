-- Customers' own Google accounts, the listings they pay for, and their monthly subscription.
CREATE TABLE IF NOT EXISTS "GbpAccount" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "profileId" TEXT,
  "name" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GbpAccount_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "GbpAccount_groupId_key" ON "GbpAccount"("groupId");
CREATE UNIQUE INDEX IF NOT EXISTS "GbpAccount_profileId_key" ON "GbpAccount"("profileId");
CREATE INDEX IF NOT EXISTS "GbpAccount_userId_idx" ON "GbpAccount"("userId");

CREATE TABLE IF NOT EXISTS "GbpPlan" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "title" TEXT,
  "plan" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "endsAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GbpPlan_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "GbpPlan_userId_locationId_key" ON "GbpPlan"("userId", "locationId");
CREATE INDEX IF NOT EXISTS "GbpPlan_locationId_idx" ON "GbpPlan"("locationId");

CREATE TABLE IF NOT EXISTS "GbpSub" (
  "userId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "subscriptionId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'none',
  "periodEnd" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GbpSub_pkey" PRIMARY KEY ("userId")
);
CREATE UNIQUE INDEX IF NOT EXISTS "GbpSub_subscriptionId_key" ON "GbpSub"("subscriptionId");
