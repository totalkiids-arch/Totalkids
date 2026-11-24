import "server-only";

import { getCart } from "@/features/cart";

import type { CheckoutCartReader } from "../application/ports";

/**
 * Lee el carrito desde la feature "cart", que ya lo calcula la API (RF-06).
 * Las líneas que ya no se venden no entran al resumen: bloquean el pago. El
 * subtotal va con el descuento del cupón ya aplicado; el despacho se suma aparte.
 * (LN-11 conecta el checkout con POST /orders y /shipping/quote.)
 */
export const cartCheckoutReader: CheckoutCartReader = {
  async read() {
    const cart = await getCart();
    return {
      lines: cart.lines
        .filter((l) => l.status !== "unavailable")
        .map((l) => ({
          id: l.id,
          name: l.name,
          detail: [l.option, ...l.extras.map((e) => e.label)].filter(Boolean).join(" · ") || null,
          quantity: l.quantity,
          total: l.total,
        })),
      subtotal: cart.total,
      unpriced: cart.unpriced,
      blocked: !cart.canCheckout,
    };
  },
};
