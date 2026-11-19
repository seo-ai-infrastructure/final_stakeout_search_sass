-- The lasting copy of what used to live only in Redis: admin settings, white-label brands and logos, merged client names, the review-alert secret.
CREATE TABLE IF NOT EXISTS "Kept" (
  "scope" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Kept_pkey" PRIMARY KEY ("scope", "key")
);
