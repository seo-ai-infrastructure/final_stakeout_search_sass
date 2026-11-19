-- What each purchase was (by price-list key), and for the welcome pack the card it was paid with and whether it was sent back: one welcome pack per account and per card.
ALTER TABLE "PaymentOrder" ADD COLUMN IF NOT EXISTS "item" TEXT;
ALTER TABLE "PaymentOrder" ADD COLUMN IF NOT EXISTS "cardFingerprint" TEXT;
ALTER TABLE "PaymentOrder" ADD COLUMN IF NOT EXISTS "refundedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "PaymentOrder_item_cardFingerprint_idx" ON "PaymentOrder"("item", "cardFingerprint");
