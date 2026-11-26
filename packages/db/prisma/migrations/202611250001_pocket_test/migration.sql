-- The $1 pocket test: one live phone search at the buyer's own spot.
CREATE TABLE IF NOT EXISTS "PocketTest" (
  "id" TEXT PRIMARY KEY,
  "token" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "keyword" TEXT NOT NULL,
  "business" TEXT NOT NULL,
  "lat" DOUBLE PRECISION NOT NULL,
  "lng" DOUBLE PRECISION NOT NULL,
  "placeLabel" TEXT,
  "checkoutId" TEXT,
  "customerId" TEXT,
  "paidAt" TIMESTAMP(3),
  "userId" TEXT,
  "madeAccount" BOOLEAN NOT NULL DEFAULT false,
  "scanId" TEXT,
  "refundedAt" TIMESTAMP(3),
  "refundWhy" TEXT,
  "ipHash" TEXT,
  "cardFingerprint" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "PocketTest_token_key" ON "PocketTest"("token");
CREATE UNIQUE INDEX IF NOT EXISTS "PocketTest_checkoutId_key" ON "PocketTest"("checkoutId");
CREATE UNIQUE INDEX IF NOT EXISTS "PocketTest_scanId_key" ON "PocketTest"("scanId");
CREATE INDEX IF NOT EXISTS "PocketTest_userId_idx" ON "PocketTest"("userId");
CREATE INDEX IF NOT EXISTS "PocketTest_email_createdAt_idx" ON "PocketTest"("email", "createdAt");
CREATE INDEX IF NOT EXISTS "PocketTest_ipHash_createdAt_idx" ON "PocketTest"("ipHash", "createdAt");
CREATE INDEX IF NOT EXISTS "PocketTest_cardFingerprint_idx" ON "PocketTest"("cardFingerprint");
