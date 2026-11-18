-- An account's link to Google (Search Console and Analytics, read-only): which Google login it is,
-- what it allowed, and the refresh token, stored encrypted. A new table: nothing existing changes.
CREATE TABLE "GoogleConnection" (
  "userId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "scopes" TEXT NOT NULL,
  "refreshToken" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GoogleConnection_pkey" PRIMARY KEY ("userId")
);
