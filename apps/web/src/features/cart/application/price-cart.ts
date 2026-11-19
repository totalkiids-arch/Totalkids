import { MAX_QUANTITY_PER_LINE, type CartLine } from "../domain/cart";
import type { CartProduct } from "./ports";

export interface PricedLine {
  line: CartLine;
  product: CartProduct;
  /** Cantidad válida (ajustada al stock). */
  quantity: number;
  /** Tope para el selector de cantidad. */
  maxQuantity: number;
  /** Extras vigentes elegidos, con su precio y texto. */
  extras: { id: string; label: string; price: number | null; text: string | null }[];
  /** (Precio de la variante + extras con precio) × cantidad; null si la variante no tiene precio. */
  total: number | null;
  status: "ok" | "adjusted" | "unavailable";
  /** Qué se ajustó, para informarlo (RF-05, RF-06). */
  note: string | null;
}

export interface PricedCart {
  lines: PricedLine[];
  /** Productos que ya no se venden; se quitan del carrito. */
  removed: string[];
  units: number;
  /** Suma de las líneas comprables con precio conocido. */
  subtotal: number;
  /** Productos o servicios cuyo precio falta definir: no entran al subtotal. */
  unpriced: string[];
  /** Hay líneas agotadas: no se puede continuar hasta quitarlas. */
  blocked: boolean;
  /** Hubo ajustes respecto de lo guardado. */
  changed: boolean;
  /** Líneas guardadas ya corregidas, para persistir los ajustes. */
  normalized: CartLine[];
}

/**
 * Revalida el carrito contra el catálogo vigente (RF-06): quita productos que ya
 * no se venden, descarta extras que dejaron de ofrecerse, ajusta cantidades al
 * stock y marca como agotadas las líneas sin disponibilidad. Función pura.
 */
export function priceCart(
  lines: readonly CartLine[],
  products: ReadonlyMap<string, CartProduct | null>,
): PricedCart {
  const priced: PricedLine[] = [];
  const removed: string[] = [];
  const normalized: CartLine[] = [];
  const unpriced = new Set<string>();

  for (const line of lines) {
    const product = products.get(line.id) ?? null;
    if (!product) {
      removed.push(line.slug);
      continue;
    }

    const notes: string[] = [];
    const extras = line.extras.flatMap((id) => {
      const extra = product.extras.find((e) => e.id === id);
      if (!extra) {
        notes.push("Quitamos un servicio que ya no está disponible.");
        return [];
      }
      return [{ id, label: extra.label, price: extra.price, text: line.texts[id] ?? null }];
    });

    const maxQuantity = Math.max(0, Math.min(product.available, MAX_QUANTITY_PER_LINE));
    const unavailable = maxQuantity === 0;
    const quantity = unavailable ? line.quantity : Math.min(line.quantity, maxQuantity);
    if (!unavailable && quantity < line.quantity) {
      notes.push(
        `Ajustamos la cantidad a ${quantity}: ${quantity === 1 ? "es la unidad disponible" : "son las unidades disponibles"}.`,
      );
    }

    if (!unavailable) {
      if (product.price === null) unpriced.add(product.name);
      for (const extra of extras) if (extra.price === null) unpriced.add(extra.label);
    }
    const unit =
      product.price === null
        ? null
        : extras.reduce((sum, e) => sum + (e.price ?? 0), product.price);

    priced.push({
      line,
      product,
      quantity,
      maxQuantity,
      extras,
      total: unit === null ? null : unit * quantity,
      status: unavailable ? "unavailable" : notes.length > 0 ? "adjusted" : "ok",
      note: unavailable
        ? "Se agotó. Quítalo para continuar con la compra."
        : notes.join(" ") || null,
    });
    normalized.push({
      ...line,
      quantity,
      extras: extras.map((e) => e.id),
      texts: Object.fromEntries(extras.flatMap((e) => (e.text === null ? [] : [[e.id, e.text]]))),
    });
  }

  const buyable = priced.filter((l) => l.status !== "unavailable");
  return {
    lines: priced,
    removed,
    units: buyable.reduce((sum, l) => sum + l.quantity, 0),
    subtotal: buyable.reduce((sum, l) => sum + (l.total ?? 0), 0),
    unpriced: [...unpriced],
    blocked: priced.length !== buyable.length,
    changed: removed.length > 0 || priced.some((l) => l.status === "adjusted"),
    normalized,
  };
}

/** Progreso hacia el despacho gratis (RF-08); null si no hay umbral configurado. */
export function freeShippingProgress(subtotal: number, threshold: number | null) {
  if (threshold === null || threshold <= 0) return null;
  const remaining = Math.max(0, threshold - subtotal);
  return { remaining, percent: Math.min(100, Math.round((subtotal / threshold) * 100)) };
}
