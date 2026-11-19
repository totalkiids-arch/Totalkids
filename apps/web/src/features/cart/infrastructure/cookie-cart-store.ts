import "server-only";

import { cookies } from "next/headers";

import type { CartStore } from "../application/ports";
import { CART_COOKIE, CART_COOKIE_MAX_AGE, parseCart, serializeCart } from "../domain/cart-cookie";

/**
 * Carrito invitado en cookie (provisional hasta tener la API). Escribir solo es
 * posible desde Server Actions o Route Handlers.
 */
export const cookieCartStore: CartStore = {
  async read() {
    return parseCart((await cookies()).get(CART_COOKIE)?.value);
  },
  async write(lines) {
    const jar = await cookies();
    if (lines.length === 0) {
      jar.delete(CART_COOKIE);
      return;
    }
    jar.set(CART_COOKIE, serializeCart(lines), {
      path: "/",
      maxAge: CART_COOKIE_MAX_AGE,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      // Sin datos sensibles (ver cart-cookie.ts): el encabezado lee la cantidad.
      httpOnly: false,
    });
  },
};
