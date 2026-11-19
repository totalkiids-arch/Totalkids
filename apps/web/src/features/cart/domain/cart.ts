/**
 * Carrito: líneas elegidas por el comprador (RF-05). Dominio puro.
 *
 * Una línea guarda solo lo que el comprador eligió (SKU, cantidad, extras y
 * textos). Precio, stock y vigencia NO se guardan: se recalculan contra el
 * catálogo cada vez que se muestra el carrito (RF-06).
 */

/** Unidades máximas por línea (igual que la ficha). */
export const MAX_QUANTITY_PER_LINE = 9;
/** Líneas máximas: acota el tamaño del carrito guardado. */
export const MAX_LINES = 30;

export interface CartLine {
  /** Identifica la combinación SKU + extras + textos. */
  id: string;
  slug: string;
  sku: string;
  quantity: number;
  /** Ids de extras elegidos, ordenados. */
  extras: string[];
  /** Texto de cada extra personalizable (p. ej. el nombre del niño). */
  texts: Record<string, string>;
}

export type CartLineInput = Omit<CartLine, "id">;

/**
 * Mismo SKU con extras o textos distintos son líneas distintas: el armado o el
 * nombre de un niño no se mezclan con los de otra unidad (RF-05).
 */
export function lineId(line: Pick<CartLine, "sku" | "extras" | "texts">): string {
  const extras = [...line.extras].sort();
  const texts = extras.map((id) => `${id}=${line.texts[id]?.trim() ?? ""}`);
  return [line.sku, ...extras, ...texts].join("|");
}

const clamp = (quantity: number) =>
  Math.min(Math.max(Math.trunc(quantity), 0), MAX_QUANTITY_PER_LINE);

/** Agrega unidades; si la combinación ya está, suma cantidades (con tope por línea). */
export function addLine(lines: readonly CartLine[], input: CartLineInput): CartLine[] {
  const extras = [...new Set(input.extras)].sort();
  const texts = Object.fromEntries(
    extras.flatMap((id) => {
      const text = input.texts[id];
      return text === undefined ? [] : [[id, text.trim()]];
    }),
  );
  const id = lineId({ sku: input.sku, extras, texts });
  const existing = lines.find((l) => l.id === id);
  if (existing) {
    return lines.map((l) =>
      l.id === id ? { ...l, quantity: clamp(l.quantity + input.quantity) } : l,
    );
  }
  if (lines.length >= MAX_LINES) throw new CartFullError();
  return [...lines, { ...input, id, extras, texts, quantity: clamp(input.quantity) }];
}

/** Cambia la cantidad; 0 o menos elimina la línea. */
export function setQuantity(lines: readonly CartLine[], id: string, quantity: number): CartLine[] {
  const next = clamp(quantity);
  return next === 0
    ? removeLine(lines, id)
    : lines.map((l) => (l.id === id ? { ...l, quantity: next } : l));
}

export function removeLine(lines: readonly CartLine[], id: string): CartLine[] {
  return lines.filter((l) => l.id !== id);
}

export function countUnits(lines: readonly Pick<CartLine, "quantity">[]): number {
  return lines.reduce((sum, l) => sum + l.quantity, 0);
}

export class CartFullError extends Error {
  constructor() {
    super(`El carrito admite hasta ${MAX_LINES} productos distintos.`);
  }
}
