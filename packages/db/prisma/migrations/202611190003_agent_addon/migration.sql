-- Whether an account's subscription carries the AI agents add-on (one flat price for any number of listings).
ALTER TABLE "GbpSub" ADD COLUMN IF NOT EXISTS "agentAddon" BOOLEAN NOT NULL DEFAULT false;
