-- CreateEnum
CREATE TYPE "coupon_kind" AS ENUM ('percent', 'amount');

-- CreateTable
CREATE TABLE "carts" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "guest_token_hash" VARCHAR(128),
    "coupon_id" UUID,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "carts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart_items" (
    "id" UUID NOT NULL,
    "cart_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "line_key" VARCHAR(400) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cart_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart_item_extras" (
    "cart_item_id" UUID NOT NULL,
    "extra_id" UUID NOT NULL,
    "text" VARCHAR(200),

    CONSTRAINT "cart_item_extras_pkey" PRIMARY KEY ("cart_item_id","extra_id")
);

-- CreateTable
CREATE TABLE "coupons" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "kind" "coupon_kind" NOT NULL,
    "value" INTEGER NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "max_uses" INTEGER NOT NULL,
    "uses_count" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipping_zones" (
    "id" UUID NOT NULL,
    "region" VARCHAR(4) NOT NULL,
    "commune" VARCHAR(80) NOT NULL,
    "price" INTEGER NOT NULL,
    "lead_time" VARCHAR(60) NOT NULL,
    "free_shipping_eligible" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "shipping_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "pickup_details" VARCHAR(200) NOT NULL,
    "pickup_enabled" BOOLEAN NOT NULL DEFAULT true,
    "free_shipping_threshold" INTEGER,
    "reservation_minutes" INTEGER NOT NULL DEFAULT 30,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "banners" (
    "id" UUID NOT NULL,
    "title" VARCHAR(80) NOT NULL,
    "text" VARCHAR(200) NOT NULL,
    "href" VARCHAR(200) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "starts_at" TIMESTAMPTZ(3),
    "ends_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "banners_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "carts_guest_token_hash_key" ON "carts"("guest_token_hash");

-- CreateIndex
CREATE INDEX "carts_user_id_idx" ON "carts"("user_id");

-- CreateIndex
CREATE INDEX "carts_expires_at_idx" ON "carts"("expires_at");

-- CreateIndex
CREATE INDEX "cart_items_variant_id_idx" ON "cart_items"("variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "cart_items_cart_id_line_key_key" ON "cart_items"("cart_id", "line_key");

-- CreateIndex
CREATE UNIQUE INDEX "coupons_code_key" ON "coupons"("code");

-- CreateIndex
CREATE INDEX "coupons_active_starts_on_ends_on_idx" ON "coupons"("active", "starts_on", "ends_on");

-- CreateIndex
CREATE UNIQUE INDEX "shipping_zones_region_commune_key" ON "shipping_zones"("region", "commune");

-- CreateIndex
CREATE INDEX "banners_active_sort_order_idx" ON "banners"("active", "sort_order");

-- AddForeignKey
ALTER TABLE "carts" ADD CONSTRAINT "carts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carts" ADD CONSTRAINT "carts_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "carts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_item_extras" ADD CONSTRAINT "cart_item_extras_cart_item_id_fkey" FOREIGN KEY ("cart_item_id") REFERENCES "cart_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_item_extras" ADD CONSTRAINT "cart_item_extras_extra_id_fkey" FOREIGN KEY ("extra_id") REFERENCES "extras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Restricciones de integridad que Prisma no expresa (SRS 4.5, RN-01).
-- ─────────────────────────────────────────────────────────────────────────────

-- Un carrito es de un usuario o de una sesión invitada (al menos uno de los dos).
ALTER TABLE "carts" ADD CONSTRAINT "carts_has_owner" CHECK ("user_id" IS NOT NULL OR "guest_token_hash" IS NOT NULL);

-- Cantidad por línea entre 1 y 9 (tope de la ficha y del carrito).
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_quantity_range" CHECK ("quantity" BETWEEN 1 AND 9);

-- Cupones: código en mayúsculas sin espacios; valor según el tipo; vigencia ordenada.
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_code_format" CHECK ("code" ~ '^[A-Z0-9_-]{3,40}$');
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_value_by_kind" CHECK (
  ("kind" = 'percent' AND "value" BETWEEN 1 AND 100)
  OR ("kind" = 'amount' AND "value" > 0)
);
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_validity_order" CHECK ("ends_on" >= "starts_on");
-- Control concurrente del cupo: los usos nunca superan el máximo.
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_max_uses_positive" CHECK ("max_uses" > 0);
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_uses_within_max" CHECK ("uses_count" BETWEEN 0 AND "max_uses");

-- Zonas de despacho: código de región válido y tarifa entera no negativa.
ALTER TABLE "shipping_zones" ADD CONSTRAINT "shipping_zones_region_format" CHECK ("region" ~ '^[A-Z]{2}$');
ALTER TABLE "shipping_zones" ADD CONSTRAINT "shipping_zones_price_non_negative" CHECK ("price" >= 0);

-- Configuración: una sola fila; umbral no negativo; reserva entre 1 y 120 minutos.
ALTER TABLE "settings" ADD CONSTRAINT "settings_single_row" CHECK ("id" = 1);
ALTER TABLE "settings" ADD CONSTRAINT "settings_threshold_non_negative" CHECK ("free_shipping_threshold" IS NULL OR "free_shipping_threshold" >= 0);
ALTER TABLE "settings" ADD CONSTRAINT "settings_reservation_range" CHECK ("reservation_minutes" BETWEEN 1 AND 120);

-- Banners: enlace interno y ventana de publicación ordenada.
ALTER TABLE "banners" ADD CONSTRAINT "banners_internal_href" CHECK ("href" LIKE '/%' AND "href" NOT LIKE '//%');
ALTER TABLE "banners" ADD CONSTRAINT "banners_order_positive" CHECK ("sort_order" >= 1);
ALTER TABLE "banners" ADD CONSTRAINT "banners_window_order" CHECK ("starts_at" IS NULL OR "ends_at" IS NULL OR "ends_at" > "starts_at");
