/**
 * Identificadores para URL ("Montessori y Pikler" → "montessori-y-pikler"). Es la
 * misma regla que usa el panel (apps/web, admin-product.ts) y cumple el CHECK
 * `^[a-z0-9]+(-[a-z0-9]+)*$` de categorías y productos.
 */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Primer slug libre a partir de `base`: "silla", "silla-2", "silla-3"… Recorta
 * la base para respetar `maxLength` incluido el sufijo.
 */
export async function uniqueSlug(
  base: string,
  maxLength: number,
  isTaken: (slug: string) => Promise<boolean>,
): Promise<string> {
  const trimmed = (max: number) => base.slice(0, max).replace(/-+$/, "");
  let candidate = trimmed(maxLength);
  for (let n = 2; await isTaken(candidate); n++) {
    const suffix = `-${String(n)}`;
    candidate = `${trimmed(maxLength - suffix.length)}${suffix}`;
  }
  return candidate;
}
