-- Signing AI apps in to the MCP server (OAuth 2.1), and two things moved out of Redis so they cannot be lost: an agent's review drafts and the monthly limit on its scans.
CREATE TABLE IF NOT EXISTS "OAuthClient" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "redirectUris" JSONB NOT NULL,
  "secretHash" TEXT,
  "uri" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OAuthClient_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "OAuthGrant" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "clientName" TEXT NOT NULL,
  "resource" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "OAuthGrant_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "OAuthGrant_userId_idx" ON "OAuthGrant"("userId");
CREATE INDEX IF NOT EXISTS "OAuthGrant_clientId_idx" ON "OAuthGrant"("clientId");
CREATE TABLE IF NOT EXISTS "OAuthCode" (
  "hash" TEXT NOT NULL,
  "grantId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "redirectUri" TEXT NOT NULL,
  "codeChallenge" TEXT NOT NULL,
  "resource" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  CONSTRAINT "OAuthCode_pkey" PRIMARY KEY ("hash")
);
CREATE INDEX IF NOT EXISTS "OAuthCode_grantId_idx" ON "OAuthCode"("grantId");
CREATE TABLE IF NOT EXISTS "OAuthToken" (
  "hash" TEXT NOT NULL,
  "grantId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "rotatedAt" TIMESTAMP(3),
  CONSTRAINT "OAuthToken_pkey" PRIMARY KEY ("hash")
);
CREATE INDEX IF NOT EXISTS "OAuthToken_grantId_idx" ON "OAuthToken"("grantId");
CREATE INDEX IF NOT EXISTS "OAuthToken_expiresAt_idx" ON "OAuthToken"("expiresAt");
CREATE TABLE IF NOT EXISTS "ReviewDraft" (
  "id" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "reviewId" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReviewDraft_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ReviewDraft_profileId_reviewId_key" ON "ReviewDraft"("profileId", "reviewId");
CREATE TABLE IF NOT EXISTS "AgentLimit" (
  "userId" TEXT NOT NULL,
  "monthlyCredits" INTEGER,
  "month" TEXT NOT NULL DEFAULT '',
  "used" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgentLimit_pkey" PRIMARY KEY ("userId")
);
