/**
 * Consulta del catálogo (búsqueda, filtros, orden y página). Dominio puro: el
 * mismo modelo sirve para leer la URL, armar enlaces y traducirse a la consulta
 * de la API (infrastructure/store-catalog-api.ts), que es quien la aplica.
 */
import {
  CATEGORIES,
  LEVELS,
  MATERIALS,
  type CategorySlug,
  type LevelId,
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
  levels: LevelId[];
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
  levels: [],
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
    levels: pick<LevelId>(
      list(params.nivel),
      LEVELS.map((l) => l.id),
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

/** Arma el query string ("?q=…&nivel=sala-cuna") de una consulta. Omite valores por defecto. */
export function toQueryString(query: CatalogQuery): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.category) params.set("categoria", query.category);
  query.levels.forEach((v) => params.append("nivel", v));
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
    query.levels.length +
    query.materials.length +
    (query.priceMin !== null || query.priceMax !== null ? 1 : 0) +
    (query.onSale ? 1 : 0)
  );
}
