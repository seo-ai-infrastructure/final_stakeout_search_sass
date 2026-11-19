-- Since when a customer's Google Business connection has had no paying listing: unpaid connections are removed after 7 days.
ALTER TABLE "GbpAccount" ADD COLUMN IF NOT EXISTS "unpaidSince" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
