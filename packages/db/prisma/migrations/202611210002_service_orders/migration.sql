-- White-label services ordered for clients (citations, local traffic), fulfilled by hand.
CREATE TABLE "service_orders" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "client_name" TEXT NOT NULL,
    "service_type" TEXT NOT NULL,
    "stripe_checkout_or_sub_id" TEXT NOT NULL,
    "checkout_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'awaiting_payment',
    "cents" INTEGER NOT NULL,
    "intake_payload_json" JSONB NOT NULL,
    "deliverable_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_orders_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "service_orders_checkout_id_key" ON "service_orders"("checkout_id");

CREATE INDEX "service_orders_workspace_id_created_at_idx" ON "service_orders"("workspace_id", "created_at");
