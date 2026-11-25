/**
 * Pedidos tal como los muestra el panel (RF-27, RF-28, RF-32, RF-34), con los
 * datos de la API (LN-13). Dominio puro.
 *
 * Las reglas (transiciones permitidas, tope de reembolsos, factura pendiente…)
 * las calcula y aplica la API: el detalle ya trae las transiciones disponibles,
 * si se puede registrar la reposición y si un pago sin resolver bloquea. Aquí
 * solo hay tipos y textos.
 */
import { ORDER_STATUS_LABEL, type OrderStatus } from "./order";

/** Estado del último intento de pago del pedido; "none" si nunca se intentó. */
export const ORDER_PAYMENT_STATES = [
  "pending",
  "paid",
  "rejected",
  "voided",
  "in_review",
  "expired",
  "refund_pending",
  "none",
] as const;
export type OrderPaymentState = (typeof ORDER_PAYMENT_STATES)[number];

export type DeliveryMethod = "shipping" | "pickup";

/** Fila del listado de pedidos. */
export interface AdminOrderListItem {
  /** Número visible ("TK-1048"). */
  ref: string;
  createdAt: string;
  buyerName: string;
  email: string;
  status: OrderStatus;
  paymentStatus: OrderPaymentState;
  paymentLabel: string;
  deliveryMethod: DeliveryMethod;
  invoicePending: boolean;
  total: number;
}

export interface AdminOrderLine {
  name: string;
  sku: string;
  /** Variante elegida, o null. */
  option: string | null;
  /** Extras con su texto ("Armado a domicilio", "Nombre: «Sofía»"). */
  extras: string[];
  quantity: number;
  unitPrice: number;
  extrasUnitPrice: number;
  lineTotal: number;
  madeToOrder: boolean;
}

/** Resoluciones manuales que la API permite para un intento (LN-15, solo Administrador). */
export type AttemptResolution = "release" | "refund_pending" | "confirm";

export interface AdminPaymentAttempt {
  /** Identificador del intento (para consultar en Flow o resolver). */
  id: string;
  commerceOrder: string;
  status: string;
  label: string;
  amount: number;
  createdAt: string;
  lastCheckedAt: string | null;
  /** Último intento pendiente o en revisión: «Consultar en Flow». */
  reconcilable: boolean;
  resolutions: AttemptResolution[];
}

export const REFUND_STATUSES = ["requested", "processed", "failed"] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

export const REFUND_STATUS_LABEL: Record<RefundStatus, string> = {
  requested: "Solicitado",
  processed: "Procesado",
  failed: "Fallido",
};

export type OrderRefundState = "not_requested" | RefundStatus;

export const ORDER_REFUND_STATE_LABEL: Record<OrderRefundState, string> = {
  not_requested: "Sin reembolsos",
  requested: "Reembolso solicitado",
  processed: "Reembolso procesado",
  failed: "Reembolso fallido",
};

export interface AdminRefund {
  id: string;
  amount: number;
  /** Día de Chile (AAAA-MM-DD). */
  date: string;
  reference: string;
  status: RefundStatus;
  /** Quién lo registró (nombre o rol). */
  registeredBy: string;
}

export interface RefundTotals {
  /** Monto del pago confirmado. */
  charged: number;
  /** Solicitados + procesados (cuentan para el tope). */
  committed: number;
  processed: number;
  /** Lo que aún se puede registrar. */
  refundable: number;
  state: OrderRefundState;
}

export type HistoryKind = "status" | "refund" | "restock" | "invoice";

export interface HistoryEntry {
  at: string;
  /** Nombre de la persona o el rol ("Administrador", "Sistema"). */
  actor: string;
  kind: HistoryKind;
  /** "En preparación", "Reembolso registrado por $10.000"… */
  title: string;
  reason: string | null;
}

export interface IssuedInvoice {
  number: string;
  issuedAt: string;
  issuedBy: string;
}

export interface AdminOrderDetail {
  /** uuid del pedido en la API. */
  id: string;
  /** Número visible ("TK-1048"). */
  ref: string;
  createdAt: string;
  status: OrderStatus;
  buyer: { name: string; rut: string; email: string; phone: string };
  delivery: {
    method: DeliveryMethod;
    /** Dirección armada (domicilio) o null en retiro. */
    address: string | null;
    notes: string | null;
    leadTime: string | null;
    pickupDetails: string | null;
    carrier: string | null;
    trackingCode: string | null;
  };
  billing: {
    document: "boleta" | "factura";
    rut: string | null;
    businessName: string | null;
    activity: string | null;
    email: string | null;
    address: string | null;
    invoice: IssuedInvoice | null;
    invoicePending: boolean;
  };
  lines: AdminOrderLine[];
  amounts: {
    subtotal: number;
    discount: number;
    /** null = despacho a coordinar. */
    shippingCost: number | null;
    total: number;
    couponCode: string | null;
  };
  payment: { status: OrderPaymentState; label: string; paidAt: string | null };
  attempts: AdminPaymentAttempt[];
  refunds: AdminRefund[];
  refundTotals: RefundTotals;
  /** Del más antiguo al más reciente. */
  history: HistoryEntry[];
  /** Calculado por la API: los estados a los que se puede pasar ahora. */
  transitions: OrderStatus[];
  canRecordRestock: boolean;
  blockedByUnresolvedPayment: boolean;
}

/** En retiro en taller, "Despachado" es "Listo para retiro" (sin transportista ni seguimiento). */
export function statusOptionLabel(status: OrderStatus, method: DeliveryMethod): string {
  return status === "shipped" && method === "pickup"
    ? "Listo para retiro"
    : ORDER_STATUS_LABEL[status];
}

/** El formulario pide transportista y seguimiento solo al despachar a domicilio. */
export function needsTracking(method: DeliveryMethod, options: readonly OrderStatus[]): boolean {
  return method === "shipping" && options.includes("shipped");
}

// ── Formularios ──────────────────────────────────────────────────────────────
// Las reglas y sus mensajes son de la API (422/409 por campo); aquí solo los
// largos máximos para los campos.

export const REASON_MAX = 500;
export const TRACKING_MAX = 80;
export const REFERENCE_MAX = 120;
export const INVOICE_NUMBER_MAX = 10;

export type FieldErrors = Partial<Record<string, string>>;

/**
 * Resumen del panel (GET /admin/summary). Los cobros del mes y el stock bajo
 * solo los recibe el Administrador: para el Operador llegan en null.
 */
export interface PanelSummary {
  byStatus: Record<OrderStatus, number>;
  paymentsInReview: number;
  paymentsPending: number;
  /** Los 5 pedidos más recientes. */
  recentOrders: AdminOrderListItem[];
  sales: { from: string; to: string; charged: number; refunded: number; net: number } | null;
  /** Variantes activas con 1 a 3 unidades disponibles. */
  lowStockVariants: number | null;
  /**
   * Alertas abiertas (LN-15): pedidos en revisión o con un pago en revisión.
   * `reason` es el motivo de la última revisión registrada, si se conoce.
   */
  alerts: {
    total: number;
    items: { ref: string; status: OrderStatus; reason: string | null; since: string }[];
  };
}
