-- Alinea el modelo de datos con los cambios pedidos por el cliente después de LN-01:
--   UI-09  compras solo como invitado (sin cuentas de comprador)
--   UI-11  productos a pedido (se compran aunque no haya stock)
--   UI-12  factura emitida por Total Kids con folio
--   UI-13  despacho a coordinar (la tarifa puede quedar por confirmar)

-- ── UI-09: sin cuentas de comprador ──────────────────────────────────────────

-- Si quedara algún comprador con cuenta, la migración se detiene: no se puede
-- decidir automáticamente si pasa a ser parte del equipo o se elimina.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "users" WHERE "role" = 'customer') THEN
    RAISE EXCEPTION 'Hay usuarios con rol customer: asígnales admin u operator, o elimínalos, antes de migrar';
  END IF;
END $$;

-- El rol queda sin valor por defecto: siempre se indica al crear la cuenta.
CREATE TYPE "user_role_new" AS ENUM ('admin', 'operator');
ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "users" ALTER COLUMN "role" TYPE "user_role_new" USING ("role"::text::"user_role_new");
ALTER TYPE "user_role" RENAME TO "user_role_old";
ALTER TYPE "user_role_new" RENAME TO "user_role";
DROP TYPE "user_role_old";

-- Carritos: solo de invitados. Los carritos son temporales; uno sin cookie de
-- invitado no se puede recuperar, así que se descarta.
ALTER TABLE "carts" DROP CONSTRAINT "carts_has_owner";
ALTER TABLE "carts" DROP CONSTRAINT "carts_user_id_fkey";
DROP INDEX "carts_user_id_idx";
DELETE FROM "carts" WHERE "guest_token_hash" IS NULL;
ALTER TABLE "carts" DROP COLUMN "user_id",
ALTER COLUMN "guest_token_hash" SET NOT NULL;

-- Pedidos: el comprador queda solo en el snapshot (nombre, RUT, correo, teléfono).
ALTER TABLE "orders" DROP CONSTRAINT "orders_user_id_fkey";
DROP INDEX "orders_user_id_created_at_idx";
ALTER TABLE "orders" DROP COLUMN "user_id";

-- ── UI-13: despacho a coordinar ──────────────────────────────────────────────

-- Tarifa por confirmar en la zona (null) y en el pedido: no suma al total ni
-- se cobra en Flow; se acuerda con el cliente.
ALTER TABLE "shipping_zones" ALTER COLUMN "price" DROP NOT NULL;
ALTER TABLE "orders" ALTER COLUMN "shipping_cost" DROP NOT NULL;

ALTER TABLE "orders" DROP CONSTRAINT "orders_amounts_non_negative";
ALTER TABLE "orders" ADD CONSTRAINT "orders_amounts_non_negative" CHECK (
  "subtotal" >= 0 AND "discount" >= 0 AND ("shipping_cost" IS NULL OR "shipping_cost" >= 0) AND "total" >= 0
);
ALTER TABLE "orders" DROP CONSTRAINT "orders_total_formula";
ALTER TABLE "orders" ADD CONSTRAINT "orders_total_formula" CHECK (
  "total" = "subtotal" - "discount" + coalesce("shipping_cost", 0)
);
-- El retiro en taller sigue siendo sin costo (orders_pickup_details exige
-- shipping_cost = 0, y con NULL el CHECK no fallaría): se exige explícito.
ALTER TABLE "orders" DROP CONSTRAINT "orders_pickup_details";
ALTER TABLE "orders" ADD CONSTRAINT "orders_pickup_details" CHECK (
  "delivery_method" <> 'pickup' OR ("pickup_details" IS NOT NULL AND "shipping_cost" IS NOT NULL AND "shipping_cost" = 0)
);

-- ── UI-12: factura con folio ─────────────────────────────────────────────────

ALTER TABLE "orders" ADD COLUMN "invoice_folio" VARCHAR(20),
ADD COLUMN "invoice_issued_at" TIMESTAMPTZ(3),
ADD COLUMN "invoice_issued_by_label" VARCHAR(120),
ADD COLUMN "invoice_issued_by_user_id" UUID;

ALTER TABLE "orders" ADD CONSTRAINT "orders_invoice_issued_by_user_id_fkey" FOREIGN KEY ("invoice_issued_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Un folio no se repite entre pedidos.
CREATE UNIQUE INDEX "orders_invoice_folio_key" ON "orders" ("invoice_folio") WHERE "invoice_folio" IS NOT NULL;

-- Folio solo en pedidos con factura y ya pagados; se registra con fecha y actor.
ALTER TABLE "orders" ADD CONSTRAINT "orders_invoice_folio_rules" CHECK (
  "invoice_folio" IS NULL
  OR (
    "tax_document" = 'factura'
    AND "paid_at" IS NOT NULL
    AND length(trim("invoice_folio")) > 0
    AND "invoice_issued_at" IS NOT NULL
    AND "invoice_issued_by_label" IS NOT NULL
  )
);

-- ── UI-11: productos a pedido ────────────────────────────────────────────────

-- La línea a pedido se marca al comprar y no reserva stock (stock_reservations
-- solo cubre líneas con stock), así se mantiene stock_reserved ≤ stock_physical.
ALTER TABLE "order_items" ADD COLUMN "lead_time" VARCHAR(60),
ADD COLUMN "made_to_order" BOOLEAN NOT NULL DEFAULT false;
