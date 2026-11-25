-- LN-11: carrito del que salió el pedido. Al confirmarse el pago se elimina el
-- carrito (el comprador ya no ve lo que pagó); el pedido conserva su snapshot.
ALTER TABLE "orders" ADD COLUMN "cart_id" UUID;
ALTER TABLE "orders" ADD CONSTRAINT "orders_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "carts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "orders_cart_id_idx" ON "orders"("cart_id");
