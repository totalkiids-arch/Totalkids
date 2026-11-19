import "server-only";

import { cookies } from "next/headers";

import type { CheckoutDraftStore } from "../application/ports";
import {
  CHECKOUT_COOKIE,
  CHECKOUT_COOKIE_MAX_AGE,
  parseCheckoutDraft,
  serializeCheckoutDraft,
} from "../domain/checkout-draft";

/**
 * Borrador del checkout en cookie (provisional hasta tener la API). Lleva datos
 * personales: httpOnly (el navegador no la lee), segura en producción y de
 * corta duración. Escribir solo es posible desde Server Actions o Route Handlers.
 */
export const cookieCheckoutDraftStore: CheckoutDraftStore = {
  async read() {
    return parseCheckoutDraft((await cookies()).get(CHECKOUT_COOKIE)?.value);
  },
  async write(values) {
    (await cookies()).set(CHECKOUT_COOKIE, serializeCheckoutDraft(values), {
      path: "/checkout",
      maxAge: CHECKOUT_COOKIE_MAX_AGE,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
    });
  },
  async clear() {
    (await cookies()).delete({ name: CHECKOUT_COOKIE, path: "/checkout" });
  },
};
