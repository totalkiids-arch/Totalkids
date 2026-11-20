/**
 * Listado de pedidos del panel (RF-28). Dominio puro.
 *
 * La consulta vive en la URL (`/admin/pedidos?q=&estado=&pagina=`), igual que
 * el listado de productos: se puede compartir, funciona con atrás/adelante y
 * sin JavaScript.
 */
import {
  ORDER_STATUS_LABEL,
  ORDER_STATUSES,
  orderTotal,
  sortByNewest,
  type Order,
  type OrderStatus,
} from "./order";

/** Estado del pago, derivado del estado del pedido. */
export type PaymentStatus = "paid" | "pending" | "uncertain" | "unpaid";

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  paid: "Pagado",
  pending: "Pendiente",
  uncertain: "Por conciliar",
  unpaid: "Sin pago",
};

/**
 * Qué se sabe del pago a partir del estado. Un pedido cancelado se trata como
 * no pagado: las devoluciones de pedidos ya pagados se registran en Pagos.
 */
export function paymentStatus(status: OrderStatus): PaymentStatus {
  switch (status) {
    case "pending_payment":
      return "pending";
    case "in_review":
      return "uncertain";
    case "confirmed":
    case "preparing":
    case "shipped":
    case "delivered":
      return "paid";
    case "cancelled":
    case "expired":
      return "unpaid";
  }
}

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

/** Sin tildes ni mayúsculas, para que "gonzalez" encuentre "González". */
function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** Busca por número, nombre o correo y filtra por estado. Más recientes primero. */
export function filterAdminOrders(
  orders: readonly Order[],
  query: Pick<AdminOrderQuery, "q" | "status">,
): Order[] {
  const term = fold(query.q);
  return sortByNewest(orders).filter((order) => {
    if (query.status !== "todos" && order.status !== query.status) return false;
    if (term === "") return true;
    return [order.id, order.buyerName, order.email].some((field) => fold(field).includes(term));
  });
}

export interface AdminOrderPage {
  items: Order[];
  total: number;
  page: number;
  pageCount: number;
}

/** Filtra y pagina; la página se ajusta al rango disponible. */
export function applyAdminOrderQuery(
  orders: readonly Order[],
  query: AdminOrderQuery,
  pageSize = ADMIN_ORDERS_PAGE_SIZE,
): AdminOrderPage {
  const matches = filterAdminOrders(orders, query);
  const pageCount = Math.max(1, Math.ceil(matches.length / pageSize));
  const page = Math.min(query.page, pageCount);
  return {
    items: matches.slice((page - 1) * pageSize, page * pageSize),
    total: matches.length,
    page,
    pageCount,
  };
}

/**
 * Celda CSV segura: entre comillas, con las comillas duplicadas, y con un
 * apóstrofo delante si empieza como fórmula (=, +, -, @), para que una hoja de
 * cálculo no ejecute texto escrito por un cliente.
 */
function csvCell(value: string | number): string {
  const text = String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** CSV del listado (con los filtros aplicados), separado por punto y coma para Excel en español. */
export function ordersToCsv(orders: readonly Order[]): string {
  const header = ["Pedido", "Fecha", "Cliente", "Correo", "Estado", "Pago", "Total CLP"];
  const rows = orders.map((order) => [
    order.id,
    order.createdAt,
    order.buyerName,
    order.email,
    ORDER_STATUS_LABEL[order.status],
    PAYMENT_STATUS_LABEL[paymentStatus(order.status)],
    orderTotal(order),
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n");
}
