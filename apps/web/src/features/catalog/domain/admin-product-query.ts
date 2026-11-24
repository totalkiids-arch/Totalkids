/**
 * Consulta del listado de productos del panel. Todo vive en la URL
 * (`/admin/productos?q=&estado=&pagina=`), igual que el catálogo público:
 * se puede compartir, funciona con atrás/adelante y sin JavaScript.
 * La búsqueda (nombre o SKU), el filtro y la paginación los resuelve la API.
 */
import type { AdminProductListItem, ProductStatus } from "./admin-product";

export const PUBLICATION_FILTERS = [
  { value: "todos", label: "Todos" },
  { value: "activo", label: "Publicado" },
  { value: "borrador", label: "Borrador" },
  { value: "inactivo", label: "Inactivo" },
] as const;
export type PublicationFilter = (typeof PUBLICATION_FILTERS)[number]["value"];

const FILTER_STATUS: Record<PublicationFilter, ProductStatus | null> = {
  todos: null,
  activo: "active",
  borrador: "draft",
  inactivo: "inactive",
};

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

/** Parámetros de GET /admin/products para la consulta del panel. */
export function toApiProductSearch(query: AdminProductQuery, pageSize = ADMIN_PAGE_SIZE): string {
  const params = new URLSearchParams({ page: String(query.page), pageSize: String(pageSize) });
  if (query.q) params.set("q", query.q);
  const status = FILTER_STATUS[query.status];
  if (status) params.set("status", status);
  return params.toString();
}

export interface AdminProductPage {
  items: AdminProductListItem[];
  total: number;
  page: number;
  pageCount: number;
}
