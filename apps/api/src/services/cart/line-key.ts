import { createHash } from "node:crypto";

/**
 * Texto de personalización normalizado: NFC, sin espacios al borde y con los
 * espacios interiores colapsados. Se conservan mayúsculas y tildes («Sofía»).
 */
export function normalizeText(text: string): string {
  return text.normalize("NFC").replace(/\s+/g, " ").trim();
}

/**
 * Identifica la combinación de una línea (RF-05): SKU + extras + textos. Mismo
 * SKU con extras o textos distintos es otra línea; la misma combinación suma
 * cantidad. Los extras y textos van en un hash para que la clave quepa siempre
 * en `cart_items.line_key` (400).
 */
export function lineKey(sku: string, extras: readonly { code: string; text: string | null }[]) {
  if (extras.length === 0) return sku;
  const canonical = [...extras]
    .sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0))
    .map((e) => [e.code, e.text === null ? null : normalizeText(e.text)]);
  const digest = createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
  return `${sku}|${digest}`;
}
