import { z } from "zod";

import { lineId, MAX_LINES, MAX_QUANTITY_PER_LINE, type CartLine } from "./cart";

/**
 * Formato del carrito guardado en cookie. No lleva precios ni datos personales:
 * solo lo elegido, que el servidor revalida contra el catálogo (RF-06). Por eso
 * no necesita ser httpOnly, y el encabezado puede leer la cantidad sin pedirla
 * al servidor (las páginas siguen siendo estáticas).
 */
export const CART_COOKIE = "tk_carrito";
export const CART_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 días

const SLUG = z.string().regex(/^[a-z0-9-]{1,120}$/);
const StoredLine = z.object({
  s: SLUG,
  k: z.string().min(1).max(60),
  q: z
    .number()
    .int()
    .min(1)
    .transform((q) => Math.min(q, MAX_QUANTITY_PER_LINE)),
  e: z.array(z.string().max(40)).max(10).default([]),
  t: z.record(z.string().max(40), z.string().max(60)).default({}),
});
const StoredCart = z.object({ v: z.literal(1), l: z.array(z.unknown()).max(MAX_LINES) });

export function serializeCart(lines: readonly CartLine[]): string {
  return JSON.stringify({
    v: 1,
    l: lines.map((l) => ({ s: l.slug, k: l.sku, q: l.quantity, e: l.extras, t: l.texts })),
  });
}

/**
 * Lee la cookie. Un formato irreconocible es un carrito vacío; una línea
 * inválida se descarta sin perder las demás.
 */
export function parseCart(raw: string | undefined): CartLine[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  const parsed = StoredCart.safeParse(data);
  if (!parsed.success) return [];
  const lines = new Map<string, CartLine>();
  for (const item of parsed.data.l) {
    const l = StoredLine.safeParse(item);
    if (!l.success) continue;
    const line = {
      slug: l.data.s,
      sku: l.data.k,
      quantity: l.data.q,
      extras: l.data.e,
      texts: l.data.t,
    };
    const id = lineId(line);
    if (!lines.has(id)) lines.set(id, { ...line, id });
  }
  return [...lines.values()];
}
