-- CreateEnum
CREATE TYPE "order_status" AS ENUM ('pending_payment', 'in_review', 'confirmed', 'preparing', 'shipped', 'delivered', 'cancelled', 'expired');

-- CreateEnum
CREATE TYPE "delivery_method" AS ENUM ('shipping', 'pickup');

-- CreateEnum
CREATE TYPE "tax_document" AS ENUM ('boleta', 'factura');

-- CreateEnum
CREATE TYPE "payment_status" AS ENUM ('pending', 'paid', 'rejected', 'voided', 'in_review', 'expired');

-- CreateEnum
CREATE TYPE "refund_status" AS ENUM ('requested', 'processed', 'failed');

-- CreateEnum
CREATE TYPE "reservation_status" AS ENUM ('active', 'consumed', 'released', 'in_review');

-- CreateEnum
CREATE TYPE "inventory_movement_kind" AS ENUM ('reservation', 'release', 'sale', 'adjustment', 'restock');

-- CreateEnum
CREATE TYPE "coupon_redemption_status" AS ENUM ('reserved', 'consumed', 'released');

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "user_id" UUID,
    "status" "order_status" NOT NULL DEFAULT 'pending_payment',
    "currency" CHAR(3) NOT NULL DEFAULT 'CLP',
    "idempotency_key" VARCHAR(100) NOT NULL,
    "buyer_name" VARCHAR(120) NOT NULL,
    "buyer_rut" VARCHAR(12) NOT NULL,
    "buyer_email" VARCHAR(254) NOT NULL,
    "buyer_phone" VARCHAR(16) NOT NULL,
    "delivery_method" "delivery_method" NOT NULL,
    "shipping_zone_id" UUID,
    "shipping_region" VARCHAR(4),
    "shipping_commune" VARCHAR(80),
    "shipping_street" VARCHAR(160),
    "shipping_unit" VARCHAR(60),
    "shipping_notes" VARCHAR(300),
    "shipping_lead_time" VARCHAR(60),
    "pickup_details" VARCHAR(200),
    "tax_document" "tax_document" NOT NULL,
    "invoice_rut" VARCHAR(12),
    "invoice_business_name" VARCHAR(160),
    "invoice_activity" VARCHAR(120),
    "invoice_email" VARCHAR(254),
    "invoice_address" VARCHAR(160),
    "invoice_commune" VARCHAR(60),
    "purchase_order_required" BOOLEAN NOT NULL DEFAULT false,
    "subtotal" INTEGER NOT NULL,
    "discount" INTEGER NOT NULL DEFAULT 0,
    "shipping_cost" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "coupon_id" UUID,
    "coupon_code" VARCHAR(40),
    "carrier" VARCHAR(80),
    "tracking_code" VARCHAR(80),
    "terms_accepted_at" TIMESTAMPTZ(3) NOT NULL,
    "terms_version" VARCHAR(40) NOT NULL,
    "payment_due_at" TIMESTAMPTZ(3) NOT NULL,
    "paid_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "restock_recorded_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "variant_id" UUID,
    "product_name" VARCHAR(160) NOT NULL,
    "sku" VARCHAR(60) NOT NULL,
    "option_label" VARCHAR(80),
    "quantity" INTEGER NOT NULL,
    "unit_price" INTEGER NOT NULL,
    "extras_unit_price" INTEGER NOT NULL DEFAULT 0,
    "line_total" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_item_extras" (
    "id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "extra_code" VARCHAR(40) NOT NULL,
    "extra_name" VARCHAR(80) NOT NULL,
    "unit_price" INTEGER,
    "text" VARCHAR(200),

    CONSTRAINT "order_item_extras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_status_history" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "from_status" "order_status",
    "to_status" "order_status" NOT NULL,
    "actor_user_id" UUID,
    "actor_label" VARCHAR(120) NOT NULL,
    "reason" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "attempt" INTEGER NOT NULL,
    "commerce_order" VARCHAR(60) NOT NULL,
    "flow_order" BIGINT,
    "token_hash" VARCHAR(128),
    "status" "payment_status" NOT NULL DEFAULT 'pending',
    "amount" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'CLP',
    "payment_method" VARCHAR(40),
    "provider_response" JSONB,
    "paid_at" TIMESTAMPTZ(3),
    "last_checked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refund_records" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "refund_date" DATE NOT NULL,
    "reference" VARCHAR(120) NOT NULL,
    "status" "refund_status" NOT NULL DEFAULT 'requested',
    "registered_by_user_id" UUID,
    "registered_by_label" VARCHAR(120) NOT NULL,
    "resolved_by_user_id" UUID,
    "resolved_by_label" VARCHAR(120),
    "resolved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refund_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_reservations" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "reservation_status" NOT NULL DEFAULT 'active',
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "resolved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "stock_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_movements" (
    "id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "kind" "inventory_movement_kind" NOT NULL,
    "physical_delta" INTEGER NOT NULL DEFAULT 0,
    "reserved_delta" INTEGER NOT NULL DEFAULT 0,
    "physical_after" INTEGER NOT NULL,
    "reserved_after" INTEGER NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "order_id" UUID,
    "actor_user_id" UUID,
    "actor_label" VARCHAR(120) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupon_redemptions" (
    "id" UUID NOT NULL,
    "coupon_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "status" "coupon_redemption_status" NOT NULL DEFAULT 'reserved',
    "discount" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "coupon_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "orders_number_key" ON "orders"("number");

-- CreateIndex
CREATE UNIQUE INDEX "orders_idempotency_key_key" ON "orders"("idempotency_key");

-- CreateIndex
CREATE INDEX "orders_user_id_created_at_idx" ON "orders"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "orders_buyer_email_idx" ON "orders"("buyer_email");

-- CreateIndex
CREATE INDEX "orders_status_created_at_idx" ON "orders"("status", "created_at");

-- CreateIndex
CREATE INDEX "orders_status_payment_due_at_idx" ON "orders"("status", "payment_due_at");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE INDEX "order_items_variant_id_idx" ON "order_items"("variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_item_extras_order_item_id_extra_code_key" ON "order_item_extras"("order_item_id", "extra_code");

-- CreateIndex
CREATE INDEX "order_status_history_order_id_created_at_idx" ON "order_status_history"("order_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "payments_commerce_order_key" ON "payments"("commerce_order");

-- CreateIndex
CREATE UNIQUE INDEX "payments_flow_order_key" ON "payments"("flow_order");

-- CreateIndex
CREATE UNIQUE INDEX "payments_token_hash_key" ON "payments"("token_hash");

-- CreateIndex
CREATE INDEX "payments_status_last_checked_at_idx" ON "payments"("status", "last_checked_at");

-- CreateIndex
CREATE UNIQUE INDEX "payments_order_id_attempt_key" ON "payments"("order_id", "attempt");

-- CreateIndex
CREATE INDEX "refund_records_order_id_idx" ON "refund_records"("order_id");

-- CreateIndex
CREATE INDEX "refund_records_payment_id_idx" ON "refund_records"("payment_id");

-- CreateIndex
CREATE INDEX "stock_reservations_status_expires_at_idx" ON "stock_reservations"("status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "stock_reservations_order_id_variant_id_key" ON "stock_reservations"("order_id", "variant_id");

-- CreateIndex
CREATE INDEX "inventory_movements_variant_id_created_at_idx" ON "inventory_movements"("variant_id", "created_at");

-- CreateIndex
CREATE INDEX "inventory_movements_order_id_idx" ON "inventory_movements"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "coupon_redemptions_order_id_key" ON "coupon_redemptions"("order_id");

-- CreateIndex
CREATE INDEX "coupon_redemptions_coupon_id_status_idx" ON "coupon_redemptions"("coupon_id", "status");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_shipping_zone_id_fkey" FOREIGN KEY ("shipping_zone_id") REFERENCES "shipping_zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item_extras" ADD CONSTRAINT "order_item_extras_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_records" ADD CONSTRAINT "refund_records_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_records" ADD CONSTRAINT "refund_records_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_records" ADD CONSTRAINT "refund_records_registered_by_user_id_fkey" FOREIGN KEY ("registered_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_records" ADD CONSTRAINT "refund_records_resolved_by_user_id_fkey" FOREIGN KEY ("resolved_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Integridad que Prisma no expresa (SRS 4.5, RN-01 a RN-06). Agregada a mano.
-- ─────────────────────────────────────────────────────────────────────────────

-- Los números de pedido visibles parten en TK-1001.
ALTER SEQUENCE "orders_number_seq" RESTART WITH 1001;

-- ── Pedidos ──────────────────────────────────────────────────────────────────

ALTER TABLE "orders" ADD CONSTRAINT "orders_currency_clp" CHECK ("currency" = 'CLP');
ALTER TABLE "orders" ADD CONSTRAINT "orders_buyer_email_lowercase" CHECK ("buyer_email" = lower("buyer_email"));

-- RN-01: importes enteros no negativos; el descuento no supera el subtotal y
-- total = subtotal − descuento + despacho.
ALTER TABLE "orders" ADD CONSTRAINT "orders_amounts_non_negative" CHECK (
  "subtotal" >= 0 AND "discount" >= 0 AND "shipping_cost" >= 0 AND "total" >= 0
);
ALTER TABLE "orders" ADD CONSTRAINT "orders_discount_within_subtotal" CHECK ("discount" <= "subtotal");
ALTER TABLE "orders" ADD CONSTRAINT "orders_total_formula" CHECK ("total" = "subtotal" - "discount" + "shipping_cost");

-- Un descuento siempre viene de un cupón (no se acumulan cupones: uno por pedido).
ALTER TABLE "orders" ADD CONSTRAINT "orders_discount_has_coupon" CHECK ("discount" = 0 OR "coupon_code" IS NOT NULL);

-- Entrega: el despacho lleva dirección completa; el retiro, los datos de la tienda y sin costo.
ALTER TABLE "orders" ADD CONSTRAINT "orders_shipping_address" CHECK (
  "delivery_method" <> 'shipping'
  OR ("shipping_region" IS NOT NULL AND "shipping_commune" IS NOT NULL AND "shipping_street" IS NOT NULL)
);
ALTER TABLE "orders" ADD CONSTRAINT "orders_pickup_details" CHECK (
  "delivery_method" <> 'pickup' OR ("pickup_details" IS NOT NULL AND "shipping_cost" = 0)
);

-- Factura: datos completos de la empresa.
ALTER TABLE "orders" ADD CONSTRAINT "orders_invoice_data" CHECK (
  "tax_document" <> 'factura'
  OR (
    "invoice_rut" IS NOT NULL AND "invoice_business_name" IS NOT NULL AND "invoice_activity" IS NOT NULL
    AND "invoice_email" IS NOT NULL AND "invoice_address" IS NOT NULL AND "invoice_commune" IS NOT NULL
  )
);

-- No se despacha sin transportista ni seguimiento (despacho a domicilio).
ALTER TABLE "orders" ADD CONSTRAINT "orders_shipped_has_tracking" CHECK (
  "delivery_method" <> 'shipping'
  OR "status" NOT IN ('shipped', 'delivered')
  OR ("carrier" IS NOT NULL AND "tracking_code" IS NOT NULL)
);

-- Un pedido confirmado o posterior tiene fecha de pago.
ALTER TABLE "orders" ADD CONSTRAINT "orders_paid_has_date" CHECK (
  "status" NOT IN ('confirmed', 'preparing', 'shipped', 'delivered') OR "paid_at" IS NOT NULL
);
ALTER TABLE "orders" ADD CONSTRAINT "orders_payment_due_after_creation" CHECK ("payment_due_at" > "created_at");

-- ── Líneas del pedido ────────────────────────────────────────────────────────

ALTER TABLE "order_items" ADD CONSTRAINT "order_items_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_prices_non_negative" CHECK ("unit_price" >= 0 AND "extras_unit_price" >= 0);
-- RN-01: total de la línea = (precio + extras por unidad) × cantidad.
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_line_total_formula" CHECK (
  "line_total" = ("unit_price" + "extras_unit_price") * "quantity"
);
ALTER TABLE "order_item_extras" ADD CONSTRAINT "order_item_extras_price_non_negative" CHECK ("unit_price" IS NULL OR "unit_price" >= 0);

-- ── Historial de estados ─────────────────────────────────────────────────────

ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_changes_status" CHECK (
  "from_status" IS NULL OR "from_status" <> "to_status"
);

-- ── Pagos ────────────────────────────────────────────────────────────────────

ALTER TABLE "payments" ADD CONSTRAINT "payments_currency_clp" CHECK ("currency" = 'CLP');
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "payments" ADD CONSTRAINT "payments_attempt_positive" CHECK ("attempt" >= 1);
ALTER TABLE "payments" ADD CONSTRAINT "payments_paid_has_date" CHECK ("status" <> 'paid' OR "paid_at" IS NOT NULL);

-- RF-19: a lo más un cobro confirmado por pedido (efectos no repetidos).
CREATE UNIQUE INDEX "payments_one_paid_per_order" ON "payments" ("order_id") WHERE "status" = 'paid';

-- RN-06: un nuevo intento solo si el anterior ya no es pagable. A lo más un
-- intento vigente (pendiente o incierto) por pedido.
CREATE UNIQUE INDEX "payments_one_open_attempt_per_order" ON "payments" ("order_id")
  WHERE "status" IN ('pending', 'in_review');

-- ── Reembolsos manuales ──────────────────────────────────────────────────────

ALTER TABLE "refund_records" ADD CONSTRAINT "refund_records_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "refund_records" ADD CONSTRAINT "refund_records_reference_present" CHECK (length(trim("reference")) > 0);
ALTER TABLE "refund_records" ADD CONSTRAINT "refund_records_resolution" CHECK (
  ("status" = 'requested') = ("resolved_at" IS NULL)
);

-- RF-32: los reembolsos no fallidos de un pago no superan lo cobrado, y solo
-- se registran sobre un pago confirmado del mismo pedido. Se bloquea la fila
-- del pago para que dos registros simultáneos no superen el monto.
CREATE FUNCTION "refund_records_within_charge"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  charged integer;
  committed integer;
BEGIN
  SELECT "amount" INTO charged
    FROM "payments"
   WHERE "id" = NEW."payment_id" AND "order_id" = NEW."order_id" AND "status" = 'paid'
   FOR UPDATE;
  IF charged IS NULL THEN
    RAISE EXCEPTION 'El reembolso debe corresponder a un pago confirmado del mismo pedido'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(SUM("amount"), 0) INTO committed
    FROM "refund_records"
   WHERE "payment_id" = NEW."payment_id" AND "status" <> 'failed' AND "id" <> NEW."id";

  IF NEW."status" <> 'failed' AND committed + NEW."amount" > charged THEN
    RAISE EXCEPTION 'Los reembolsos (%) superan el monto cobrado (%)', committed + NEW."amount", charged
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "refund_records_within_charge"
  BEFORE INSERT OR UPDATE OF "amount", "status", "payment_id", "order_id" ON "refund_records"
  FOR EACH ROW EXECUTE FUNCTION "refund_records_within_charge"();

-- ── Reservas e inventario ────────────────────────────────────────────────────

ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_resolution" CHECK (
  ("status" IN ('active', 'in_review')) = ("resolved_at" IS NULL)
);

-- El movimiento cambia algo, deja el stock en un estado válido (RN-03) y tiene motivo.
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_changes_stock" CHECK (
  "physical_delta" <> 0 OR "reserved_delta" <> 0
);
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_valid_result" CHECK (
  "physical_after" >= 0 AND "reserved_after" >= 0 AND "reserved_after" <= "physical_after"
);
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_reason_present" CHECK (length(trim("reason")) > 0);
-- Reservas, ventas, liberaciones y reposiciones siempre se refieren a un pedido.
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_order_reference" CHECK (
  "kind" = 'adjustment' OR "order_id" IS NOT NULL
);

-- ── Usos de cupón ────────────────────────────────────────────────────────────

ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_discount_non_negative" CHECK ("discount" >= 0);
