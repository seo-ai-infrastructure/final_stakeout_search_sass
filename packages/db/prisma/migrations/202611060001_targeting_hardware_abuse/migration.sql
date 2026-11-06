-- Starter credits are granted only after email verification.
ALTER TABLE "User" ALTER COLUMN "creditBalance" SET DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);
-- Existing accounts already received their grant; treat them as verified.
UPDATE "User" SET "emailVerifiedAt" = "createdAt" WHERE "passwordHash" IS NOT NULL;

-- Fleet sync records connectivity separately from the admin's enable switch.
ALTER TABLE "DevicePool" ADD COLUMN "offlineAt" TIMESTAMP(3);
-- Sync previously disabled offline phones itself; it no longer touches isEnabled.

-- CreateTable
CREATE TABLE "EmailToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "userId" TEXT,
    "scanId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EmailToken_tokenHash_key" ON "EmailToken"("tokenHash");
CREATE INDEX "EmailToken_email_purpose_createdAt_idx" ON "EmailToken"("email", "purpose", "createdAt");
