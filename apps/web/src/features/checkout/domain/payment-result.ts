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
  href: "/" | "/carrito" | "/checkout/pago" | "/cuenta/pedidos" | "/checkout/resultado";
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
    primary: { label: "Ver mis pedidos", href: "/cuenta/pedidos" },
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
    secondary: { label: "Ver mis pedidos", href: "/cuenta/pedidos" },
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
