-- Live report embeds (Agency and up) and scan-finished webhooks (Scale and up), 24 Nov 2026.
-- Applied by hand on 24 Nov 2026 (so written to run again safely).
CREATE TABLE IF NOT EXISTS "ReportEmbed" ("id" TEXT PRIMARY KEY, "token" TEXT NOT NULL, "userId" TEXT NOT NULL, "scanId" TEXT NOT NULL, "keyword" TEXT NOT NULL, "business" TEXT NOT NULL, "gridSize" INTEGER NOT NULL, "centerLat" DOUBLE PRECISION NOT NULL, "centerLng" DOUBLE PRECISION NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "revokedAt" TIMESTAMP(3));
CREATE UNIQUE INDEX IF NOT EXISTS "ReportEmbed_token_key" ON "ReportEmbed"("token");
CREATE INDEX IF NOT EXISTS "ReportEmbed_userId_idx" ON "ReportEmbed"("userId");
CREATE TABLE IF NOT EXISTS "WebhookEndpoint" ("userId" TEXT PRIMARY KEY, "url" TEXT NOT NULL, "secret" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL);
CREATE TABLE IF NOT EXISTS "WebhookDelivery" ("id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "scanId" TEXT, "event" TEXT NOT NULL, "payload" JSONB NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING', "attempts" INTEGER NOT NULL DEFAULT 0, "nextAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "lastStatus" INTEGER, "lastError" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "sentAt" TIMESTAMP(3));
CREATE INDEX IF NOT EXISTS "WebhookDelivery_status_nextAt_idx" ON "WebhookDelivery"("status", "nextAt");
CREATE INDEX IF NOT EXISTS "WebhookDelivery_userId_createdAt_idx" ON "WebhookDelivery"("userId", "createdAt");
