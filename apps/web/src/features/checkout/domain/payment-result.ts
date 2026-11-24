import type { GuestPaymentStatus } from "@/features/orders";
import type { PaymentStatus } from "@/features/payments";

/**
 * Resultado del pago al volver de Flow (RF-17). Dominio puro.
 *
 * Reintento seguro: solo se ofrece pagar de nuevo cuando el intento anterior ya
 * NO puede cobrarse (rechazado). Mientras el pago esté pendiente o en revisión,
 * volver a pagar podría cobrar dos veces, así que no se ofrece. Un pago vencido
 * vuelve al carrito para revisar precio y stock antes de otra compra.
 * Un estado desconocido se trata como pendiente: nunca se da por pagado.
 */

/** Qué puede hacer el comprador respecto de pagar otra vez. */
export type RetryPolicy =
  /** Ya está pagado: no hay nada que reintentar. */
  | "none"
  /** Hay que esperar la confirmación: reintentar podría cobrar dos veces. */
  | "wait"
  /** El intento anterior ya no es cobrable: se puede pagar de nuevo. */
  | "retry"
  /** Venció la reserva: se vuelve al carrito para revalidar. */
  | "restart";

export type ResultTone = "success" | "waiting" | "error";

export interface ResultAction {
  label: string;
  /** Las de seguimiento y resultado se completan con el pedido (linkToOrder). */
  href:
    | "/"
    | "/carrito"
    | "/checkout/pago"
    | "/seguimiento"
    | "/checkout/resultado"
    | `/seguimiento/${string}`
    | `/checkout/resultado?pedido=${string}`;
}

export interface PaymentResultView {
  status: PaymentStatus;
  tone: ResultTone;
  title: string;
  message: string;
  retry: RetryPolicy;
  primary: ResultAction;
  secondary: ResultAction;
}

const STORE: ResultAction = { label: "Volver a la tienda", href: "/" };

const VIEWS: Record<PaymentStatus, Omit<PaymentResultView, "status">> = {
  paid: {
    tone: "success",
    title: "¡Tu compra está confirmada!",
    message: "Recibimos tu pago. Prepararemos tus muebles para su próxima aventura.",
    retry: "none",
    primary: { label: "Consultar mi pedido", href: "/seguimiento" },
    secondary: STORE,
  },
  pending: {
    tone: "waiting",
    title: "Estamos verificando tu pago",
    message:
      "Volver de Flow no confirma el cobro. Espera la verificación antes de intentar pagar nuevamente.",
    retry: "wait",
    primary: { label: "Consultar el estado otra vez", href: "/checkout/resultado" },
    secondary: STORE,
  },
  rejected: {
    tone: "error",
    title: "No se pudo completar el pago",
    message:
      "Flow rechazó el intento y no se hizo ningún cobro. Puedes intentarlo de nuevo con el mismo u otro medio de pago.",
    retry: "retry",
    primary: { label: "Intentar pagar de nuevo", href: "/checkout/pago" },
    secondary: { label: "Volver al carrito", href: "/carrito" },
  },
  in_review: {
    tone: "waiting",
    title: "Tu pago necesita una revisión",
    message:
      "No podemos descartar un cobro, así que no intentes pagar de nuevo. Conservamos tu pedido en revisión y te escribiremos cuando esté resuelto.",
    retry: "wait",
    primary: STORE,
    secondary: { label: "Consultar mi pedido", href: "/seguimiento" },
  },
  expired: {
    tone: "error",
    title: "El plazo de pago terminó",
    message:
      "La reserva de tus productos venció. Vuelve al carrito para revisar precio y disponibilidad antes de comprar otra vez.",
    retry: "restart",
    primary: { label: "Volver al carrito", href: "/carrito" },
    secondary: STORE,
  },
};

/** Qué mostrar para un estado. Sin estado conocido, se muestra como pendiente. */
export function paymentResultView(status: PaymentStatus | null): PaymentResultView {
  const resolved = status ?? "pending";
  return { status: resolved, ...VIEWS[resolved] };
}

/** Solo se puede volver a pagar si el intento anterior ya no es cobrable. */
export function canRetryPayment(status: PaymentStatus | null): boolean {
  return paymentResultView(status).retry === "retry";
}

/** Estados del pedido con el pago ya confirmado. */
const PAID_ORDER = new Set(["confirmed", "preparing", "shipped", "delivered"]);

/** Lo que el resultado necesita del pedido (GuestOrder de la API). */
export interface ResultOrder {
  status: string;
  payment?: { status: GuestPaymentStatus | null; dueAt: string } | undefined;
}

/**
 * Estado del pago a mostrar, desde el pedido que entrega la API (nunca desde la
 * URL ni el retorno de Flow, RNF-04). Un cobro informado pero aún no aplicado
 * al pedido se muestra pendiente: el pedido manda.
 */
export function orderPaymentStatus(order: ResultOrder, now: Date): PaymentStatus {
  if (PAID_ORDER.has(order.status)) return "paid";
  if (order.status === "in_review") return "in_review";
  if (order.status !== "pending_payment") return "expired";
  const payment = order.payment;
  if (payment?.status === "in_review") return "in_review";
  if (payment && new Date(payment.dueAt).getTime() <= now.getTime()) return "expired";
  if (payment?.status === "rejected" || payment?.status === "voided") return "rejected";
  if (payment?.status === "expired") return "expired";
  return "pending";
}

/** Enlaces del resultado apuntando al pedido (seguimiento y volver a consultar). */
export function linkToOrder(action: ResultAction, orderNumber: string | null): ResultAction {
  if (!orderNumber) return action;
  const id = encodeURIComponent(orderNumber);
  if (action.href === "/seguimiento") return { ...action, href: `/seguimiento/${id}` };
  if (action.href === "/checkout/resultado") {
    return { ...action, href: `/checkout/resultado?pedido=${id}` };
  }
  return action;
}

/**
 * Sin pedido que mostrar (otro navegador o la credencial venció): no se
 * informa ningún estado; se consulta con número y correo.
 */
export const UNKNOWN_ORDER_RESULT: PaymentResultView = {
  status: "pending",
  tone: "waiting",
  title: "Consulta el estado de tu pedido",
  message:
    "No encontramos tu pedido en este navegador. Consúltalo con el número y el correo de la compra; también te escribimos cuando se confirme el pago.",
  retry: "wait",
  primary: { label: "Consultar mi pedido", href: "/seguimiento" },
  secondary: STORE,
};
