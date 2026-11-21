// Raíz de composición de "cart": conecta los puertos con sus adaptadores actuales.
import type { CartCatalog, CartStore } from "./application/ports";
import { priceCart } from "./application/price-cart";
import { validateAdd, type AddResult } from "./application/validate-add";
import {
  addLine,
  CartFullError,
  MAX_QUANTITY_PER_LINE,
  removeLine,
  setQuantity,
  type CartLine,
} from "./domain/cart";
import { catalogCartCatalog } from "./infrastructure/catalog-cart-catalog";
import { cookieCartStore } from "./infrastructure/cookie-cart-store";

const store: CartStore = cookieCartStore;
const catalog: CartCatalog = catalogCartCatalog;

async function resolve(lines: readonly CartLine[]) {
  const products = await Promise.all(lines.map((l) => catalog.findVariant(l.slug, l.sku)));
  return new Map(lines.map((l, i) => [l.id, products[i] ?? null]));
}

/** Caso de uso: ver el carrito revalidado contra el catálogo (RF-05, RF-06). */
export async function getCart() {
  const lines = await store.read();
  return priceCart(lines, await resolve(lines));
}

/** Caso de uso: agregar desde la ficha, validado en el servidor (RF-04, RF-05). */
export async function addToCart(request: {
  slug: string;
  sku: string;
  quantity: number;
  extras: string[];
  texts: Record<string, string>;
}): Promise<AddResult> {
  const lines = await store.read();
  const result = validateAdd(await catalog.findVariant(request.slug, request.sku), request, lines);
  if (!result.ok) return result;
  try {
    await store.write(addLine(lines, result.input));
  } catch (error) {
    if (error instanceof CartFullError) return { ok: false, error: error.message };
    throw error;
  }
  return result;
}

/** Caso de uso: cambiar la cantidad (0 elimina). */
export async function changeQuantity(id: string, quantity: number) {
  const lines = await store.read();
  const product = lines.find((l) => l.id === id);
  if (!product) return;
  const variant = await catalog.findVariant(product.slug, product.sku);
  // Sin variante vigente no se cambia; el stock no limita (todo se fabrica a pedido).
  const max = variant ? MAX_QUANTITY_PER_LINE : 0;
  await store.write(setQuantity(lines, id, Math.min(quantity, max)));
}

/** Caso de uso: quitar una línea. */
export async function removeFromCart(id: string) {
  await store.write(removeLine(await store.read(), id));
}

/** Caso de uso: guardar los ajustes informados (productos retirados, stock). */
export async function acceptCartChanges() {
  const lines = await store.read();
  await store.write(priceCart(lines, await resolve(lines)).normalized);
}
