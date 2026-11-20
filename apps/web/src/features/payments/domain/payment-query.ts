/**
 * Pagos y conciliación del panel (RF-33). Dominio puro.
 *
 * El filtro vive en la URL (`/admin/pagos?estado=&pedido=`): se comparte, funciona
 * con atrás/adelante y sin JavaScript. `pedido` preselecciona el pedido en el
 * formulario de conciliación.
 */
import {
  isPaymentStatus,
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUSES,
  type PaymentStatus,
} from "./payment-status";

/** Una fila de la tabla: un intento de cobro en Flow. */
export interface PaymentAttemptRow {
  orderId: string;
  buyerName: string;
  /** Identificador propio enviado a Flow. */
  commerceOrder: string;
  amount: number;
  status: PaymentStatus;
  /** Fecha y hora ISO del intento. */
  createdAt: string;
  /** Última consulta a Flow, ISO. */
  lastCheckedAt: string | null;
  /** Es el último intento del pedido (el único que se concilia). */
  current: boolean;
}

/** Se consulta a Flow el intento vigente que sigue pendiente o en revisión. */
export function isReconcilable(row: Pick<PaymentAttemptRow, "status" | "current">): boolean {
  return row.current && (row.status === "pending" || row.status === "in_review");
}

export type PaymentFilter = PaymentStatus | "todos";

export const PAYMENT_FILTERS: readonly { value: PaymentFilter; label: string }[] = [
  { value: "todos", label: "Todos" },
  ...PAYMENT_STATUSES.map((status) => ({ value: status, label: PAYMENT_STATUS_LABEL[status] })),
];

export interface PaymentQuery {
  status: PaymentFilter;
  /** Pedido preseleccionado para conciliar ("TK-1053"), o "". */
  order: string;
}

type Params = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? "";

const ORDER_ID = /^TK-\d{1,10}$/;

/** Lee la consulta de `searchParams`; valores inválidos vuelven al valor por defecto. */
export function parsePaymentQuery(params: Params): PaymentQuery {
  const status = first(params.estado);
  const order = first(params.pedido).trim().toUpperCase();
  return {
    status: isPaymentStatus(status) ? status : "todos",
    order: ORDER_ID.test(order) ? order : "",
  };
}

/** "?estado=in_review&pedido=TK-1053"; "" si no hay nada. */
export function toPaymentSearch(query: Partial<PaymentQuery>): string {
  const params = new URLSearchParams();
  if (query.status && query.status !== "todos") params.set("estado", query.status);
  if (query.order) params.set("pedido", query.order);
  const text = params.toString();
  return text ? `?${text}` : "";
}

/** Más recientes primero, filtrados por estado. */
export function filterPaymentAttempts(
  rows: readonly PaymentAttemptRow[],
  status: PaymentFilter,
): PaymentAttemptRow[] {
  return [...rows]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .filter((row) => status === "todos" || row.status === status);
}

export function countPaymentAttempts(
  rows: readonly PaymentAttemptRow[],
): Record<PaymentStatus, number> {
  const counts = Object.fromEntries(PAYMENT_STATUSES.map((s) => [s, 0])) as Record<
    PaymentStatus,
    number
  >;
  for (const row of rows) counts[row.status] += 1;
  return counts;
}

/** Estado del formulario de conciliación (lo comparten la pantalla y la Server Action). */
export interface ReconcileFormState {
  values: { order: string; result: string; reason: string };
  errors: Partial<Record<string, string>>;
}
