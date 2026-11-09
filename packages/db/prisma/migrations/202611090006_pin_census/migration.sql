-- Each grid point's Census neighborhood (block group, tract and ZIP estimates with the data vintage),
-- saved once from the yearly lookup files built by tools/census/build.py.
ALTER TABLE "GridPin" ADD COLUMN "census" JSONB;
