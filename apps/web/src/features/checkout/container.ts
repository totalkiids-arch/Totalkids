// Raíz de composición de "checkout": conecta los puertos con sus adaptadores actuales.
import {
  getOrderForViewer,
  GuestOrderUnavailableError,
  orderTotal,
  rememberGuestOrder,
  type Order,
} from "@/features/orders";

import {
  checkoutBlocker,
  summarizeQuotedOrder,
  type OrderSummary,
} from "./application/order-summary";
import { paymentStepRedirect, type PaymentStepRedirect } from "./application/payment-guard";
import type {
  CheckoutCartReader,
  CheckoutDraftStore,
  CheckoutGateway,
  OrderAttemptStore,
} from "./application/ports";
import { pickCheckoutValues, type CheckoutValues } from "./domain/checkout-draft";
import {
  parseCheckoutDetails,
  type CheckoutDetails,
  type CheckoutErrors,
  type CheckoutInput,
} from "./domain/checkout-details";
import { parsePaymentConfirmation } from "./domain/payment-confirmation";
import {
  linkToOrder,
  orderPaymentStatus,
  paymentResultView,
  UNKNOWN_ORDER_RESULT,
  type PaymentResultView,
} from "./domain/payment-result";
import { shippingLabel } from "./domain/shipping";
import { apiCheckoutGateway } from "./infrastructure/api-checkout-gateway";
import { cartCheckoutReader } from "./infrastructure/cart-checkout-reader";
import { isFlowUrl } from "./infrastructure/checkout-api";
import { cookieCheckoutDraftStore } from "./infrastructure/cookie-checkout-draft-store";
import { cookieOrderAttemptStore } from "./infrastructure/cookie-order-attempt-store";

const cart: CheckoutCartReader = cartCheckoutReader;
const drafts: CheckoutDraftStore = cookieCheckoutDraftStore;
const gateway: CheckoutGateway = apiCheckoutGateway;
const attempts: OrderAttemptStore = cookieOrderAttemptStore;

/**
 * Caso de uso: abrir "Datos y facturación". Entrega el carrito vigente, lo que
 * el comprador ya había escrito y si puede avanzar (carrito vacío o con
 * productos agotados no avanza).
 */
export async function getCheckoutStep() {
  const [current, values] = await Promise.all([cart.read(), drafts.read()]);
  return {
    cart: current,
    values,
    blocker: checkoutBlocker(current),
  };
}

export type SaveDetailsResult =
  | { ok: true }
  | {
      ok: false;
      /** Error por campo del formulario. */
      errors: CheckoutErrors;
      /** Error general (p. ej. el carrito cambió mientras se completaba). */
      message: string | null;
      /** Lo escrito, para volver a llenar el formulario. */
      values: CheckoutValues;
    };

/**
 * Caso de uso: guardar "Datos y facturación" (RF-09, RF-10, RF-11). Valida en
 * el servidor y revisa que el carrito siga comprable antes de pasar al pago.
 */
export async function saveCheckoutDetails(input: CheckoutInput): Promise<SaveDetailsResult> {
  const values = pickCheckoutValues(input);
  const result = parseCheckoutDetails(values);
  if (!result.ok) return { ok: false, errors: result.errors, message: null, values };

  const blocker = checkoutBlocker(await cart.read());
  if (blocker) {
    return {
      ok: false,
      errors: {},
      message:
        blocker === "empty"
          ? "Tu carrito está vacío. Agrega productos para continuar."
          : "Algunos productos se agotaron. Vuelve al carrito para revisarlos.",
      values,
    };
  }

  await drafts.write(values);
  return { ok: true };
}

export type PaymentStep =
  | { ok: true; details: CheckoutDetails; summary: OrderSummary }
  | { ok: false; redirectTo: PaymentStepRedirect };

/**
 * Caso de uso: abrir el paso "Pago". Revalida en el servidor el carrito y los
 * datos guardados; si algo falta, indica adónde volver (ver paymentStepRedirect).
 * La API cotiza la entrega con la comuna: ese total es el que se cobrará.
 */
export async function getPaymentStep(): Promise<PaymentStep> {
  const [current, values] = await Promise.all([cart.read(), drafts.read()]);
  const result = parseCheckoutDetails(values);
  const redirectTo = paymentStepRedirect(current, result);
  if (redirectTo || !result.ok) return { ok: false, redirectTo: redirectTo ?? "/checkout" };
  const quote = await gateway.quote(result.details.delivery);
  // Retiro deshabilitado mientras se completaban los datos: elegir otra entrega.
  if (!quote) return { ok: false, redirectTo: "/checkout" };
  return { ok: true, details: result.details, summary: summarizeQuotedOrder(current, quote) };
}

/** Caso de uso: olvidar el borrador (al terminar o abandonar la compra). */
export async function clearCheckoutDraft() {
  await drafts.clear();
}

export type StartPaymentResult =
  /** A Flow, o al resultado si ya hay un pago en curso o confirmado. */
  | { ok: true; redirectTo: string }
  | { ok: false; reason: "terms" | "error"; error: string }
  | { ok: false; reason: "details"; redirectTo: PaymentStepRedirect };

const resultPage = (orderNumber: string) =>
  `/checkout/resultado?pedido=${encodeURIComponent(orderNumber)}`;

/**
 * Caso de uso: ir a pagar con Flow (RF-13, RF-15). Exige aceptar las
 * condiciones y revalida datos, carrito y total en el servidor. Crea el pedido
 * (reserva el stock) con una clave idempotente y abre el pago en Flow:
 *
 * - Doble clic o volver desde Flow: la misma clave responde el mismo pedido y la
 *   API reutiliza el intento vigente (RF-15), sin cobrar dos veces (RN-06).
 * - Datos o carrito distintos: la API lo detecta y se usa una clave nueva.
 * - Pedido vencido o sin stock: la próxima vez se crea otro.
 */
export async function startPayment(input: CheckoutInput): Promise<StartPaymentResult> {
  const confirmation = parsePaymentConfirmation(input);
  if (!confirmation.ok) return { ok: false, reason: "terms", error: confirmation.error };
  const step = await getPaymentStep();
  if (!step.ok) return { ok: false, reason: "details", redirectTo: step.redirectTo };

  const place = (key: string) => gateway.placeOrder(step.details, step.summary.total, key);
  let placed = await place(await attempts.current());
  if (!placed.ok && placed.reason === "idempotency_mismatch") {
    placed = await place(await attempts.rotate());
  }
  if (!placed.ok) {
    if (placed.reason === "cart") return { ok: false, reason: "details", redirectTo: "/carrito" };
    if (placed.reason === "details") {
      return { ok: false, reason: "details", redirectTo: "/checkout" };
    }
    return { ok: false, reason: "error", error: placed.message };
  }

  // La credencial queda en este navegador: el resultado y el seguimiento la usan.
  await rememberGuestOrder(placed.orderNumber, placed.accessToken);
  const payment = await gateway.startPayment(placed.orderNumber, placed.accessToken);
  if (payment.ok) {
    if (isFlowUrl(payment.redirectUrl)) return { ok: true, redirectTo: payment.redirectUrl };
    return {
      ok: false,
      reason: "error",
      error: "No pudimos iniciar el pago. Inténtalo en unos minutos.",
    };
  }
  switch (payment.reason) {
    case "uncertain":
    case "already_paid":
      return { ok: true, redirectTo: resultPage(placed.orderNumber) };
    case "not_payable":
    case "stock_unavailable":
    case "not_found":
      // Ese pedido ya no se puede pagar: el próximo intento crea otro.
      await attempts.rotate();
      return { ok: false, reason: "error", error: payment.message };
    case "unavailable":
      return { ok: false, reason: "error", error: payment.message };
  }
}

export interface PaymentResult {
  view: PaymentResultView;
  /** Pedido consultado en la API; null si este navegador no tiene su credencial. */
  order: {
    number: string;
    buyerName: string;
    email: string;
    delivery: string;
    total: number;
    /** Boleta = comprobante de Flow; factura = la emite Total Kids. */
    document: "boleta" | "factura";
  } | null;
}

function deliveryText(order: Order): string {
  if (order.delivery.method === "retiro") return "Retiro en taller";
  if (order.shippingToCoordinate) return "Despacho a coordinar (no incluido en el total)";
  return order.shipping === 0
    ? "Despacho gratis"
    : `Despacho ${shippingLabel({ kind: "rate", cost: order.shipping, leadTime: null })}`;
}

/**
 * Caso de uso: resultado del pago al volver de Flow (RF-17). El estado sale del
 * pedido en la API, consultado con la credencial guardada en este navegador;
 * la URL solo dice qué pedido mirar (nunca su estado, RNF-04).
 */
export async function getPaymentResult(pedido: string | null): Promise<PaymentResult> {
  let found: { order: Order } | null = null;
  if (pedido) {
    try {
      found = await getOrderForViewer(pedido);
    } catch (error) {
      if (!(error instanceof GuestOrderUnavailableError)) throw error;
    }
  }
  if (!found) return { view: UNKNOWN_ORDER_RESULT, order: null };
  const { order } = found;
  const base = paymentResultView(orderPaymentStatus(order, new Date()));
  return {
    view: {
      ...base,
      primary: linkToOrder(base.primary, order.id),
      secondary: linkToOrder(base.secondary, order.id),
    },
    order: {
      number: order.id,
      buyerName: order.buyerName,
      email: order.email,
      delivery: deliveryText(order),
      total: order.payment?.total ?? orderTotal(order),
      document: order.document,
    },
  };
}
