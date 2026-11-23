-- Applied by hand on 23 Nov 2026 (so written to run again safely).
-- Compiled revenue briefs: a saved copy of the brief, its own assumptions and share link.
CREATE TABLE IF NOT EXISTS "briefs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "scan_id" TEXT NOT NULL,
    "business" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "assumptions" JSONB,
    "share_token" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "briefs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "briefs_share_token_key" ON "briefs"("share_token");

CREATE INDEX IF NOT EXISTS "briefs_user_id_created_at_idx" ON "briefs"("user_id", "created_at");

CREATE INDEX IF NOT EXISTS "briefs_scan_id_idx" ON "briefs"("scan_id");
