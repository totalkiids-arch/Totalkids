-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('customer', 'admin', 'operator');

-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "auth_token_purpose" AS ENUM ('password_reset', 'email_verification');

-- CreateEnum
CREATE TYPE "product_status" AS ENUM ('draft', 'active', 'inactive');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "role" "user_role" NOT NULL DEFAULT 'customer',
    "status" "user_status" NOT NULL DEFAULT 'active',
    "email_verified_at" TIMESTAMPTZ(3),
    "last_login_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "purpose" "auth_token_purpose" NOT NULL,
    "token_hash" VARCHAR(128) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(128) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "last_seen_at" TIMESTAMPTZ(3),
    "user_agent" VARCHAR(400),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "description" VARCHAR(500),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "summary" VARCHAR(400),
    "description" TEXT NOT NULL DEFAULT '',
    "age_groups" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "materials" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dimensions" VARCHAR(200),
    "specs" JSONB NOT NULL DEFAULT '[]',
    "status" "product_status" NOT NULL DEFAULT 'draft',
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "published_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variants" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "sku" VARCHAR(60) NOT NULL,
    "option_label" VARCHAR(80),
    "color" VARCHAR(60),
    "size" VARCHAR(60),
    "price" INTEGER,
    "compare_at_price" INTEGER,
    "stock_physical" INTEGER NOT NULL DEFAULT 0,
    "stock_reserved" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_images" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "variant_id" UUID,
    "url" VARCHAR(500) NOT NULL,
    "alt" VARCHAR(200) NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extras" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "price" INTEGER,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "requires_text" BOOLEAN NOT NULL DEFAULT false,
    "text_label" VARCHAR(80),
    "text_max_length" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "extras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_extras" (
    "product_id" UUID NOT NULL,
    "extra_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "product_extras_pkey" PRIMARY KEY ("product_id","extra_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_status_idx" ON "users"("role", "status");

-- CreateIndex
CREATE UNIQUE INDEX "auth_tokens_token_hash_key" ON "auth_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "auth_tokens_user_id_purpose_idx" ON "auth_tokens"("user_id", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "products_slug_key" ON "products"("slug");

-- CreateIndex
CREATE INDEX "products_category_id_status_idx" ON "products"("category_id", "status");

-- CreateIndex
CREATE INDEX "products_status_published_at_idx" ON "products"("status", "published_at");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_sku_key" ON "product_variants"("sku");

-- CreateIndex
CREATE INDEX "product_variants_product_id_idx" ON "product_variants"("product_id");

-- CreateIndex
CREATE INDEX "product_images_product_id_sort_order_idx" ON "product_images"("product_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "extras_code_key" ON "extras"("code");

-- CreateIndex
CREATE INDEX "product_extras_extra_id_idx" ON "product_extras"("extra_id");

-- AddForeignKey
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_extras" ADD CONSTRAINT "product_extras_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_extras" ADD CONSTRAINT "product_extras_extra_id_fkey" FOREIGN KEY ("extra_id") REFERENCES "extras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Restricciones de integridad que Prisma no expresa (SRS 4.5, RN-01, RN-03).
-- Agregadas a mano: la base las garantiza aunque la aplicación falle.
-- ─────────────────────────────────────────────────────────────────────────────

-- Correo siempre en minúsculas: así el índice único no distingue mayúsculas.
ALTER TABLE "users" ADD CONSTRAINT "users_email_lowercase" CHECK ("email" = lower("email"));

-- Un token o sesión no puede vencer antes de crearse.
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_expiry_after_creation" CHECK ("expires_at" > "created_at");
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_expiry_after_creation" CHECK ("expires_at" > "created_at");

-- Slugs aptos para la URL: minúsculas, números y guiones.
ALTER TABLE "categories" ADD CONSTRAINT "categories_slug_format" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
ALTER TABLE "products" ADD CONSTRAINT "products_slug_format" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

-- Un producto publicado tiene fecha de publicación.
ALTER TABLE "products" ADD CONSTRAINT "products_published_has_date" CHECK ("status" <> 'active' OR "published_at" IS NOT NULL);

-- RN-01: importes en CLP enteros no negativos. El precio anterior, si existe, es mayor al actual.
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_price_non_negative" CHECK ("price" IS NULL OR "price" >= 0);
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_compare_at_above_price" CHECK ("compare_at_price" IS NULL OR ("price" IS NOT NULL AND "compare_at_price" > "price"));

-- RN-03: el inventario nunca queda negativo y lo reservado no supera lo físico.
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_stock_physical_non_negative" CHECK ("stock_physical" >= 0);
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_stock_reserved_non_negative" CHECK ("stock_reserved" >= 0);
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_reserved_within_physical" CHECK ("stock_reserved" <= "stock_physical");

ALTER TABLE "product_images" ADD CONSTRAINT "product_images_size_positive" CHECK (("width" IS NULL OR "width" > 0) AND ("height" IS NULL OR "height" > 0));

-- Extras: precio no negativo; si pide un texto, tiene etiqueta y largo máximo razonable.
ALTER TABLE "extras" ADD CONSTRAINT "extras_price_non_negative" CHECK ("price" IS NULL OR "price" >= 0);
ALTER TABLE "extras" ADD CONSTRAINT "extras_text_rules" CHECK (
  NOT "requires_text"
  OR ("text_label" IS NOT NULL AND "text_max_length" BETWEEN 1 AND 200)
);
