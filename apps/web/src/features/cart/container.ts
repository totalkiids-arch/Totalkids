// Raíz de composición de "cart": el carrito del invitado vive en la API (LN-06, LN-07).
import type { CartView } from "./application/cart-view";
import { apiCart, CartRejectedError, CartUnavailableError } from "./infrastructure/api-cart";

export type CartResult = { ok: true; cart: CartView } | { ok: false; error: string };

const UNAVAILABLE = "No pudimos actualizar tu carrito. Intenta de nuevo en unos segundos.";

async function attempt(run: () => Promise<CartView>): Promise<CartResult> {
  try {
    return { ok: true, cart: await run() };
  } catch (error) {
    if (error instanceof CartRejectedError) return { ok: false, error: error.message };
    if (error instanceof CartUnavailableError) return { ok: false, error: UNAVAILABLE };
    throw error;
  }
}

/** Caso de uso: ver el carrito revalidado por la API (RF-05, RF-06). */
export function getCart(): Promise<CartView> {
  return apiCart.read();
}

/**
 * Cookie del carrito para que el checkout cotice y cree el pedido con este
 * mismo carrito (GET /shipping/quote, POST /orders). Solo en el servidor.
 */
export function cartSessionCookie(): Promise<string> {
  return apiCart.sessionCookie();
}

/** Caso de uso: agregar desde la ficha (RF-04, RF-05). La API valida variante, extras y textos. */
export function addToCart(request: {
  sku: string;
  quantity: number;
  extras: string[];
  texts: Record<string, string>;
}): Promise<CartResult> {
  // Solo los textos de los extras elegidos.
  const texts = Object.fromEntries(
    request.extras.flatMap((id) => (request.texts[id] ? [[id, request.texts[id]]] : [])),
  );
  return attempt(() => apiCart.add({ ...request, texts }));
}

/** Caso de uso: cambiar la cantidad (0 elimina la línea). */
export function changeQuantity(id: string, quantity: number): Promise<CartResult> {
  return attempt(() => (quantity <= 0 ? apiCart.remove(id) : apiCart.setQuantity(id, quantity)));
}

/** Caso de uso: quitar una línea. */
export function removeFromCart(id: string): Promise<CartResult> {
  return attempt(() => apiCart.remove(id));
}

/** Caso de uso: aplicar un cupón (RF-07): uno por carrito, el nuevo reemplaza al anterior. */
export function applyCoupon(code: string): Promise<CartResult> {
  return attempt(() => apiCart.applyCoupon(code));
}

/** Caso de uso: quitar el cupón. */
export function removeCoupon(): Promise<CartResult> {
  return attempt(() => apiCart.removeCoupon());
}
