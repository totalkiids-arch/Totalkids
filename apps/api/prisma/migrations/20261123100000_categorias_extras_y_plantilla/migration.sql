-- AlterTable
ALTER TABLE "products" ADD COLUMN     "lead_time" VARCHAR(60),
ADD COLUMN     "option_name" VARCHAR(40);

-- AlterTable
ALTER TABLE "product_extras" ADD COLUMN     "price" INTEGER,
ADD COLUMN     "text_max_length" INTEGER;

-- AlterTable
ALTER TABLE "settings" ADD COLUMN     "active_theme" VARCHAR(30) NOT NULL DEFAULT 'clasica';

-- CreateTable
CREATE TABLE "product_categories" (
    "product_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,

    CONSTRAINT "product_categories_pkey" PRIMARY KEY ("product_id","category_id")
);

-- CreateIndex
CREATE INDEX "product_categories_category_id_idx" ON "product_categories"("category_id");

-- AddForeignKey
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Completa el modelo con lo que la aplicación ya usa (revisión de LN-01):
--   UI-11  varias categorías por producto (p. ej. "Línea JUNJI"), nombre de la
--          opción entre variantes y precio de armado/personalización por producto
--   UI-11  plazo de fabricación a pedido del producto (lo copia order_items.lead_time)
--   UI-13  plantilla visual activa de la tienda
-- Restricciones agregadas a mano (Prisma no las expresa).
-- ─────────────────────────────────────────────────────────────────────────────

-- Textos opcionales: si vienen, no están en blanco.
ALTER TABLE "products" ADD CONSTRAINT "products_option_name_present" CHECK ("option_name" IS NULL OR length(trim("option_name")) > 0);
ALTER TABLE "products" ADD CONSTRAINT "products_lead_time_present" CHECK ("lead_time" IS NULL OR length(trim("lead_time")) > 0);

-- Precio por producto entero no negativo (RN-01) y largo del texto razonable.
ALTER TABLE "product_extras" ADD CONSTRAINT "product_extras_price_non_negative" CHECK ("price" IS NULL OR "price" >= 0);
ALTER TABLE "product_extras" ADD CONSTRAINT "product_extras_text_max_length_range" CHECK ("text_max_length" IS NULL OR "text_max_length" BETWEEN 1 AND 200);

-- Solo las plantillas que existen en la tienda (features/themes de la web).
ALTER TABLE "settings" ADD CONSTRAINT "settings_active_theme_known" CHECK (
  "active_theme" IN ('clasica', 'navidad', 'pascua', 'ano-nuevo', 'fiestas-patrias', 'invierno', 'primavera')
);
