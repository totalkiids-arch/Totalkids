import { MAX_QUANTITY_PER_LINE, type CartLine, type CartLineInput } from "../domain/cart";
import type { CartProduct } from "./ports";

export type AddResult = { ok: true; input: CartLineInput } | { ok: false; error: string };

/**
 * Valida en el servidor lo que llega desde la ficha (RF-04, RF-06): el producto y
 * la variante existen, la cantidad está dentro del máximo por línea (todo se
 * fabrica a pedido: el stock no limita la compra), los extras se ofrecen y los textos personalizados cumplen sus límites.
 */
export function validateAdd(
  product: CartProduct | null,
  request: { quantity: number; extras: string[]; texts: Record<string, string> },
  inCart: readonly CartLine[],
): AddResult {
  if (!product) return { ok: false, error: "Este producto ya no está disponible." };

  const quantity = Math.trunc(request.quantity);
  if (!Number.isFinite(quantity) || quantity < 1 || quantity > MAX_QUANTITY_PER_LINE) {
    return { ok: false, error: `Elige entre 1 y ${MAX_QUANTITY_PER_LINE} unidades.` };
  }
  const alreadyInCart = inCart
    .filter((l) => l.sku === product.sku)
    .reduce((sum, l) => sum + l.quantity, 0);
  const left = MAX_QUANTITY_PER_LINE - alreadyInCart;
  if (quantity > left) {
    return {
      ok: false,
      error:
        left <= 0
          ? `Ya tienes ${MAX_QUANTITY_PER_LINE} unidades en el carrito. Para más, escríbenos y lo cotizamos.`
          : `Solo puedes agregar ${left} ${left === 1 ? "unidad más" : "unidades más"}.`,
    };
  }

  const extras = [...new Set(request.extras)];
  const texts: Record<string, string> = {};
  for (const id of extras) {
    const extra = product.extras.find((e) => e.id === id);
    if (!extra) return { ok: false, error: "Uno de los servicios elegidos ya no está disponible." };
    if (extra.personalization) {
      const text = (request.texts[id] ?? "").trim();
      if (text === "" || text.length > extra.personalization.maxLength) {
        return {
          ok: false,
          error: `Revisa el ${extra.personalization.label.toLowerCase()} (máximo ${extra.personalization.maxLength} caracteres).`,
        };
      }
      texts[id] = text;
    }
  }

  return { ok: true, input: { slug: product.slug, sku: product.sku, quantity, extras, texts } };
}
