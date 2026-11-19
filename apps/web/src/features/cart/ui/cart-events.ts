"use client";

import { CART_COOKIE, parseCart } from "../domain/cart-cookie";
import { countUnits } from "../domain/cart";
import { CART_CHANGED_EVENT as EVENT } from "@/shared/ui/cart-signal";

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

/** Unidades en el carrito según la cookie (sin pedirlas al servidor). */
export function readCartUnits(): number {
  const raw = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${CART_COOKIE}=`))
    ?.slice(CART_COOKIE.length + 1);
  if (!raw) return 0;
  try {
    return countUnits(parseCart(decodeURIComponent(raw)));
  } catch {
    return 0;
  }
}
