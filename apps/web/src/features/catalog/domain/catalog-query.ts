/**
 * Consulta del catálogo (búsqueda, filtros, orden y página) y las reglas para
 * aplicarla. Dominio puro: el mismo modelo sirve para leer la URL, armar enlaces
 * y, más adelante, traducirse a la consulta de la API.
 */
import {
  AGE_BUCKETS,
  CATEGORIES,
  COLORS,
  MATERIALS,
  isOnSale,
  type AgeBucketId,
  type CategorySlug,
  type ColorSlug,
  type MaterialSlug,
  type ProductSummary,
} from "./product";

export const SORT_OPTIONS = [
  { id: "mas-vendidos", label: "Más vendidos" },
  { id: "menor-precio", label: "Menor precio" },
  { id: "mayor-precio", label: "Mayor precio" },
  { id: "novedades", label: "Novedades" },
] as const;
export type SortId = (typeof SORT_OPTIONS)[number]["id"];

export const PAGE_SIZE = 9;

export interface CatalogQuery {
  q: string;
  category: CategorySlug | null;
  ages: AgeBucketId[];
  colors: ColorSlug[];
  materials: MaterialSlug[];
  priceMin: number | null;
  priceMax: number | null;
  onSale: boolean;
  sort: SortId;
  page: number;
}

export const EMPTY_QUERY: CatalogQuery = {
  q: "",
  category: null,
  ages: [],
  colors: [],
  materials: [],
  priceMin: null,
  priceMax: null,
  onSale: false,
  sort: "mas-vendidos",
  page: 1,
};

export interface CatalogPage {
  items: ProductSummary[];
  total: number;
  page: number;
  pageCount: number;
}

type RawParams = Record<string, string | string[] | undefined>;

const list = (value: string | string[] | undefined): string[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];
const first = (value: string | string[] | undefined): string | undefined => list(value)[0];

function pick<T extends string>(values: string[], allowed: readonly string[]): T[] {
  return [...new Set(values.filter((v) => allowed.includes(v)))] as T[];
}

/** Precio desde texto libre ("$ 25.000" → 25000). Vacío o inválido → null. */
export function parsePrice(value: string | undefined): number | null {
  const digits = value?.replace(/\D/g, "") ?? "";
  if (digits === "") return null;
  const amount = Number(digits);
  return Number.isSafeInteger(amount) ? amount : null;
}

/** Lee la consulta desde los searchParams de la URL. Ignora valores desconocidos. */
export function parseCatalogQuery(params: RawParams): CatalogQuery {
  const category = first(params.categoria);
  const sort = first(params.orden);
  const page = Number(first(params.pagina));
  let priceMin = parsePrice(first(params.precio_min));
  let priceMax = parsePrice(first(params.precio_max));
  if (priceMin !== null && priceMax !== null && priceMin > priceMax) {
    [priceMin, priceMax] = [priceMax, priceMin];
  }
  return {
    q: (first(params.q) ?? "").trim().slice(0, 100),
    category: CATEGORIES.some((c) => c.slug === category) ? (category as CategorySlug) : null,
    ages: pick<AgeBucketId>(
      list(params.edad),
      AGE_BUCKETS.map((b) => b.id),
    ),
    colors: pick<ColorSlug>(
      list(params.color),
      COLORS.map((c) => c.slug),
    ),
    materials: pick<MaterialSlug>(
      list(params.material),
      MATERIALS.map((m) => m.slug),
    ),
    priceMin,
    priceMax,
    onSale: first(params.ofertas) === "1",
    sort: SORT_OPTIONS.some((s) => s.id === sort) ? (sort as SortId) : "mas-vendidos",
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

/** Arma el query string ("?q=…&edad=3-5") de una consulta. Omite valores por defecto. */
export function toQueryString(query: CatalogQuery): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.category) params.set("categoria", query.category);
  query.ages.forEach((v) => params.append("edad", v));
  query.colors.forEach((v) => params.append("color", v));
  query.materials.forEach((v) => params.append("material", v));
  if (query.priceMin !== null) params.set("precio_min", String(query.priceMin));
  if (query.priceMax !== null) params.set("precio_max", String(query.priceMax));
  if (query.onSale) params.set("ofertas", "1");
  if (query.sort !== EMPTY_QUERY.sort) params.set("orden", query.sort);
  if (query.page > 1) params.set("pagina", String(query.page));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/** Cantidad de filtros activos (sin contar búsqueda, categoría ni orden). */
export function countActiveFilters(query: CatalogQuery): number {
  return (
    query.ages.length +
    query.colors.length +
    query.materials.length +
    (query.priceMin !== null || query.priceMax !== null ? 1 : 0) +
    (query.onSale ? 1 : 0)
  );
}

/** Minúsculas y sin tildes, para buscar "baul" y encontrar "Baúl". */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function matchesSearch(product: ProductSummary, q: string): boolean {
  if (!q) return true;
  const haystack = normalize(`${product.name} ${product.category} ${product.summary}`);
  return normalize(q)
    .split(/\s+/)
    .every((word) => haystack.includes(word));
}

function matchesAges(product: ProductSummary, ages: AgeBucketId[]): boolean {
  if (ages.length === 0) return true;
  const productMax = product.ages.max ?? Infinity;
  return AGE_BUCKETS.filter((b) => ages.includes(b.id)).some(
    (b) => product.ages.min <= (b.max ?? Infinity) && productMax >= b.min,
  );
}

function matchesPrice(product: ProductSummary, min: number | null, max: number | null): boolean {
  if (min === null && max === null) return true;
  // Sin precio publicado no se puede afirmar que esté en el rango.
  if (product.price === null) return false;
  return (min === null || product.price >= min) && (max === null || product.price <= max);
}

const anyOf = <T>(selected: T[], values: readonly T[]) =>
  selected.length === 0 || selected.some((v) => values.includes(v));

/** Precio ascendente/descendente; los productos sin precio van al final. */
function byPrice(direction: 1 | -1) {
  return (a: ProductSummary, b: ProductSummary) => {
    if (a.price === null) return b.price === null ? 0 : 1;
    if (b.price === null) return -1;
    return (a.price - b.price) * direction;
  };
}

const SORTERS: Record<SortId, (a: ProductSummary, b: ProductSummary) => number> = {
  "mas-vendidos": (a, b) => b.popularity - a.popularity,
  "menor-precio": byPrice(1),
  "mayor-precio": byPrice(-1),
  novedades: (a, b) => b.publishedAt.localeCompare(a.publishedAt),
};

/** Aplica búsqueda, filtros, orden y paginación. La página se ajusta al rango válido. */
export function applyCatalogQuery(
  products: readonly ProductSummary[],
  query: CatalogQuery,
): CatalogPage {
  const filtered = products
    .filter(
      (p) =>
        matchesSearch(p, query.q) &&
        (query.category === null || p.categories.includes(query.category)) &&
        matchesAges(p, query.ages) &&
        anyOf(query.colors, p.colors) &&
        anyOf(query.materials, p.materials) &&
        matchesPrice(p, query.priceMin, query.priceMax) &&
        (!query.onSale || isOnSale(p)),
    )
    .sort((a, b) => SORTERS[query.sort](a, b) || b.popularity - a.popularity);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(query.page, pageCount);
  return {
    items: filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    total: filtered.length,
    page,
    pageCount,
  };
}
