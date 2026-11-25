"use client";

import { CART_CHANGED_EVENT as EVENT } from "@/shared/ui/cart-signal";

import { CART_UNITS_COOKIE } from "../application/cart-view";

export { notifyCartChanged } from "@/shared/ui/cart-signal";

export function subscribeCart(callback: () => void) {
  window.addEventListener(EVENT, callback);
  window.addEventListener("focus", callback);
  // cookieStore avisa también cambios hechos por formularios sin JavaScript propio.
  const store = (globalThis as { cookieStore?: EventTarget }).cookieStore;
  store?.addEventListener("change", callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("focus", callback);
    store?.removeEventListener("change", callback);
  };
}

/** Unidades en el carrito según la cookie de unidades (sin pedirlas al servidor). */
export function readCartUnits(): number {
  const raw = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${CART_UNITS_COOKIE}=`))
    ?.slice(CART_UNITS_COOKIE.length + 1);
  const units = Number(raw);
  return Number.isInteger(units) && units > 0 ? Math.min(units, 999) : 0;
}
