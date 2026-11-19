import "server-only";

import { getCart } from "@/features/cart";

import type { CheckoutCartReader } from "../application/ports";

/**
 * Lee el carrito desde la feature "cart", que ya lo revalida contra el catálogo
 * (RF-06). Las líneas agotadas no entran al resumen: bloquean el pago.
 */
export const cartCheckoutReader: CheckoutCartReader = {
  async read() {
    const cart = await getCart();
    return {
      lines: cart.lines
        .filter((l) => l.status !== "unavailable")
        .map((l) => ({
          id: l.line.id,
          name: l.product.name,
          detail:
            [l.product.option, ...l.extras.map((e) => e.label)].filter(Boolean).join(" · ") || null,
          quantity: l.quantity,
          total: l.total,
        })),
      subtotal: cart.subtotal,
      unpriced: cart.unpriced,
      blocked: cart.blocked,
    };
  },
};
