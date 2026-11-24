-- Team seats (24 Nov 2026): people an account owner adds by email sign in and work in the owner's account.
-- Applied by hand on 24 Nov 2026 (so written to run again safely).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "teamOf" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "teamAddedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "User_teamOf_idx" ON "User"("teamOf");
