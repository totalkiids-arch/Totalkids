import type { CatalogQuery } from "../domain/catalog-query";

type Field = "q" | "category" | "filters" | "sort";

/**
 * Campos ocultos que conservan partes de la consulta al enviar un formulario GET
 * (p. ej. el orden mantiene búsqueda, categoría y filtros).
 */
export function QueryHiddenFields({
  query,
  keep,
}: {
  query: CatalogQuery;
  keep: readonly Field[];
}) {
  const fields: [string, string][] = [];
  if (keep.includes("q") && query.q) fields.push(["q", query.q]);
  if (keep.includes("category") && query.category) fields.push(["categoria", query.category]);
  if (keep.includes("filters")) {
    query.levels.forEach((v) => fields.push(["nivel", v]));
    query.materials.forEach((v) => fields.push(["material", v]));
    if (query.priceMin !== null) fields.push(["precio_min", String(query.priceMin)]);
    if (query.priceMax !== null) fields.push(["precio_max", String(query.priceMax)]);
    if (query.onSale) fields.push(["ofertas", "1"]);
  }
  if (keep.includes("sort") && query.sort !== "mas-vendidos") fields.push(["orden", query.sort]);
  return (
    <>
      {fields.map(([name, value], index) => (
        <input key={`${name}-${value}-${index}`} type="hidden" name={name} value={value} />
      ))}
    </>
  );
}
