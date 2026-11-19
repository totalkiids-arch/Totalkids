"use client";

/**
 * Señal "el carrito cambió", para que el botón del encabezado relea la cantidad.
 * Vive en shared para que la ficha (catalog) y el carrito (cart) la usen sin
 * depender una de otra.
 */
export const CART_CHANGED_EVENT = "tk:carrito";

export function notifyCartChanged() {
  window.dispatchEvent(new Event(CART_CHANGED_EVENT));
}
