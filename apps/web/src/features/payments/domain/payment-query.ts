/**
 * Pagos y conciliación del panel (RF-33). Dominio puro.
 *
 * El filtro vive en la URL (`/admin/pagos?estado=&pedido=&pagina=`): se
 * comparte, funciona con atrás/adelante y sin JavaScript. `pedido` muestra solo
 * los intentos de ese pedido (p. ej. desde el detalle del pedido).
 */
import {
  ATTEMPT_STATUS_LABEL,
  ATTEMPT_STATUSES,
  isAttemptStatus,
  type AttemptStatus,
} from "./payment-status";

/** Una fila de la tabla: un intento de cobro en Flow. */
export interface PaymentAttemptRow {
  /** Número visible del pedido ("TK-1053"). */
  orderId: string;
  buyerName: string;
  /** Identificador propio enviado a Flow. */
  commerceOrder: string;
  amount: number;
  status: AttemptStatus;
  /** Fecha y hora ISO del intento. */
  createdAt: string;
  /** Última consulta a Flow, ISO. */
  lastCheckedAt: string | null;
  /** Es el último intento del pedido. */
  current: boolean;
  /** Último intento pendiente o en revisión: lo concilia la consulta a Flow (LN-15). */
  reconcilable: boolean;
}

export type PaymentFilter = AttemptStatus | "todos";

export const PAYMENT_FILTERS: readonly { value: PaymentFilter; label: string }[] = [
  { value: "todos", label: "Todos" },
  ...ATTEMPT_STATUSES.map((status) => ({ value: status, label: ATTEMPT_STATUS_LABEL[status] })),
];

export const PAYMENTS_PAGE_SIZE = 20;

export interface PaymentQuery {
  status: PaymentFilter;
  /** Pedido ("TK-1053"), o "" para todos. */
  order: string;
  page: number;
}

export interface PaymentPage {
  rows: PaymentAttemptRow[];
  /** Intentos por estado (con el filtro de pedido). */
  counts: Record<AttemptStatus, number>;
  total: number;
  page: number;
  pageCount: number;
}

type Params = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? "";

const ORDER_ID = /^TK-\d{1,10}$/;

/** Lee la consulta de `searchParams`; valores inválidos vuelven al valor por defecto. */
export function parsePaymentQuery(params: Params): PaymentQuery {
  const status = first(params.estado);
  const order = first(params.pedido).trim().toUpperCase();
  const page = Number(first(params.pagina));
  return {
    status: isAttemptStatus(status) ? status : "todos",
    order: ORDER_ID.test(order) ? order : "",
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

/** "?estado=in_review&pedido=TK-1053&pagina=2"; "" si no hay nada. */
export function toPaymentSearch(query: Partial<PaymentQuery>): string {
  const params = new URLSearchParams();
  if (query.status && query.status !== "todos") params.set("estado", query.status);
  if (query.order) params.set("pedido", query.order);
  if (query.page && query.page > 1) params.set("pagina", String(query.page));
  const text = params.toString();
  return text ? `?${text}` : "";
}

/** Parámetros de GET /admin/payments. */
export function toApiPaymentSearch(query: PaymentQuery, pageSize = PAYMENTS_PAGE_SIZE): string {
  const params = new URLSearchParams({ page: String(query.page), pageSize: String(pageSize) });
  if (query.status !== "todos") params.set("status", query.status);
  if (query.order) params.set("order", query.order);
  return params.toString();
}
