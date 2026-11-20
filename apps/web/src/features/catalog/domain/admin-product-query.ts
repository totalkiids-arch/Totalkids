/**
 * Consulta del listado de productos del panel. Todo vive en la URL
 * (`/admin/productos?q=&estado=&pagina=`), igual que el catálogo público:
 * se puede compartir, funciona con atrás/adelante y sin JavaScript.
 */
import type { AdminProduct } from "./admin-product";
import { normalizeSku } from "./admin-product";

export const PUBLICATION_FILTERS = [
  { value: "todos", label: "Todos" },
  { value: "activo", label: "Activo" },
  { value: "inactivo", label: "Inactivo" },
] as const;
export type PublicationFilter = (typeof PUBLICATION_FILTERS)[number]["value"];

export const ADMIN_PAGE_SIZE = 20;
const Q_MAX = 80;

export interface AdminProductQuery {
  q: string;
  status: PublicationFilter;
  page: number;
}

type Params = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? "";

/** Lee la consulta de `searchParams`. Valores inválidos vuelven al valor por defecto. */
export function parseAdminProductQuery(params: Params): AdminProductQuery {
  const status = first(params.estado);
  const page = Number(first(params.pagina));
  return {
    q: first(params.q).trim().slice(0, Q_MAX),
    status: PUBLICATION_FILTERS.some((f) => f.value === status)
      ? (status as PublicationFilter)
      : "todos",
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

/** "?q=cuna&estado=activo&pagina=2"; omite los valores por defecto. "" si no hay nada. */
export function toAdminProductSearch(query: AdminProductQuery): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.status !== "todos") params.set("estado", query.status);
  if (query.page > 1) params.set("pagina", String(query.page));
  const text = params.toString();
  return text ? `?${text}` : "";
}

/** Sin tildes ni mayúsculas, para buscar "cuna" y encontrar "Cuna". */
function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export interface AdminProductPage {
  items: AdminProduct[];
  total: number;
  page: number;
  pageCount: number;
}

/** Busca por nombre o SKU, filtra por publicación y pagina (la página se ajusta al rango). */
export function applyAdminProductQuery(
  products: readonly AdminProduct[],
  query: AdminProductQuery,
  pageSize = ADMIN_PAGE_SIZE,
): AdminProductPage {
  const term = fold(query.q);
  const skuTerm = normalizeSku(query.q);
  const matches = products.filter((product) => {
    if (query.status === "activo" && !product.active) return false;
    if (query.status === "inactivo" && product.active) return false;
    if (term === "") return true;
    return (
      fold(product.name).includes(term) ||
      product.variants.some((v) => normalizeSku(v.sku).includes(skuTerm))
    );
  });
  const pageCount = Math.max(1, Math.ceil(matches.length / pageSize));
  const page = Math.min(query.page, pageCount);
  return {
    items: matches.slice((page - 1) * pageSize, page * pageSize),
    total: matches.length,
    page,
    pageCount,
  };
}
