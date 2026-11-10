-- What the phone saw at each point, compactly (packages/core/pinInsights.ts): Local Finder with
-- distances, advertisers, and the websites the AI Overview cited. Filled at completion and backfilled.
ALTER TABLE "GridPin" ADD COLUMN "insights" JSONB;
