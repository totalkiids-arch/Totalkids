/**
 * Listado de pedidos del panel (RF-28). Dominio puro.
 *
 * La consulta vive en la URL (`/admin/pedidos?q=&estado=&pagina=`), igual que
 * el listado de productos: se puede compartir, funciona con atrás/adelante y
 * sin JavaScript.
 */
import type { AdminOrderListItem } from "./admin-order";
import { ORDER_STATUS_LABEL, ORDER_STATUSES, type OrderStatus } from "./order";

export const ORDER_STATUS_FILTERS = [
  { value: "todos", label: "Todos" },
  ...ORDER_STATUSES.map((status) => ({ value: status, label: ORDER_STATUS_LABEL[status] })),
] as const;
export type OrderStatusFilter = OrderStatus | "todos";

export const ADMIN_ORDERS_PAGE_SIZE = 20;
const Q_MAX = 80;

export interface AdminOrderQuery {
  q: string;
  status: OrderStatusFilter;
  page: number;
}

type Params = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? "";

const isStatus = (value: string): value is OrderStatus =>
  (ORDER_STATUSES as readonly string[]).includes(value);

/** Lee la consulta de `searchParams`. Valores inválidos vuelven al valor por defecto. */
export function parseAdminOrderQuery(params: Params): AdminOrderQuery {
  const status = first(params.estado);
  const page = Number(first(params.pagina));
  return {
    q: first(params.q).trim().slice(0, Q_MAX),
    status: isStatus(status) ? status : "todos",
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

/** "?q=camila&estado=shipped&pagina=2"; omite los valores por defecto. "" si no hay nada. */
export function toAdminOrderSearch(
  query: Pick<AdminOrderQuery, "q" | "status"> & { page?: number },
) {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.status !== "todos") params.set("estado", query.status);
  if (query.page && query.page > 1) params.set("pagina", String(query.page));
  const text = params.toString();
  return text ? `?${text}` : "";
}

/** Filtros de GET /admin/orders y de la exportación CSV (sin página). */
export function toApiOrderFilters(query: Pick<AdminOrderQuery, "q" | "status">): URLSearchParams {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.status !== "todos") params.set("status", query.status);
  return params;
}

/** Parámetros de GET /admin/orders: búsqueda, estado y página (la API pagina y ordena). */
export function toApiOrderSearch(
  query: AdminOrderQuery,
  pageSize = ADMIN_ORDERS_PAGE_SIZE,
): string {
  const params = new URLSearchParams({ page: String(query.page), pageSize: String(pageSize) });
  for (const [key, value] of toApiOrderFilters(query)) params.set(key, value);
  return params.toString();
}

export interface AdminOrderListPage {
  items: AdminOrderListItem[];
  total: number;
  page: number;
  pageCount: number;
}
