import { z } from "zod";

import type {
  DeliveryQuote,
  PlaceOrderFailure,
  PlaceOrderResult,
  StartPaymentFailure,
  StartPaymentResult,
} from "../application/ports";
import type { CheckoutDetails, Delivery } from "../domain/checkout-details";
import { fromApiQuote } from "../domain/shipping";

/*
 * Traducción entre el checkout de la tienda y la API (LN-09 pedidos, LN-10
 * pagos; apps/api/openapi.yaml). Puro (sin server-only) para probarlo.
 */

const ApiQuote = z.object({
  cost: z.number().int().nullable(),
  reason: z.enum(["pickup", "threshold", "zone", "pending_rate", "coordinate"]),
  leadTime: z.string().nullable(),
  message: z.string().nullable(),
  totals: z.object({
    subtotal: z.number().int(),
    discount: z.number().int(),
    shipping: z.number().int().nullable(),
    total: z.number().int(),
  }),
});

const CreatedOrder = z.object({ orderNumber: z.string(), accessToken: z.string() });
const PaymentCreated = z.object({ redirectUrl: z.url() });
const ApiError = z.object({
  message: z.string().optional(),
  details: z.object({ reason: z.string().optional() }).loose().optional(),
});

/** Query string de GET /shipping/quote. */
export function toQuoteSearch(delivery: Delivery): string {
  const params = new URLSearchParams(
    delivery.method === "retiro"
      ? { method: "retiro" }
      : { method: "despacho", region: delivery.region, commune: delivery.commune },
  );
  return params.toString();
}

/** Respuesta 200 de GET /shipping/quote; lanza si no tiene la forma esperada. */
export function toDeliveryQuote(body: unknown): DeliveryQuote {
  const quote = ApiQuote.parse(body);
  return { shipping: fromApiQuote(quote), totals: quote.totals };
}

/** Cuerpo de POST /orders. */
export function toOrderBody(details: CheckoutDetails, expectedTotal: number) {
  const { buyer, delivery, billing } = details;
  return {
    buyer,
    delivery:
      delivery.method === "retiro"
        ? { method: "retiro" }
        : {
            method: "despacho",
            region: delivery.region,
            commune: delivery.commune,
            street: delivery.street,
            unit: delivery.unit,
            notes: delivery.notes,
          },
    billing:
      billing.document === "boleta"
        ? { document: "boleta" }
        : {
            document: "factura",
            rut: billing.rut,
            businessName: billing.businessName,
            activity: billing.activity,
            email: billing.email,
            address: billing.address,
            commune: billing.commune,
            purchaseOrder: billing.purchaseOrder,
          },
    expectedTotal,
    termsAccepted: true,
  };
}

const ORDER_REASONS: Record<string, PlaceOrderFailure> = {
  empty_cart: "cart",
  cart_blocked: "cart",
  coupon_invalid: "cart",
  cart_changed: "cart",
  cart_unpriced: "cart",
  coupon_exhausted: "cart",
  total_changed: "total_changed",
  pickup_disabled: "pickup_disabled",
  idempotency_mismatch: "idempotency_mismatch",
  in_progress: "in_progress",
};

const ORDER_MESSAGES: Record<PlaceOrderFailure, string> = {
  cart: "Tu carrito cambió. Revísalo antes de pagar.",
  details: "Revisa tus datos antes de pagar.",
  total_changed: "El total de tu compra cambió. Revísalo antes de pagar.",
  idempotency_mismatch: "Tus datos cambiaron. Intenta pagar de nuevo.",
  in_progress: "Estamos creando tu pedido. Espera unos segundos e inténtalo otra vez.",
  pickup_disabled: "El retiro en taller no está disponible por ahora. Elige despacho.",
  unavailable: "No pudimos crear tu pedido. Intenta de nuevo en unos minutos.",
};

const errorOf = (body: unknown) => ApiError.safeParse(body).data;

/** Respuesta de POST /orders → resultado del checkout. */
export function toPlaceOrderResult(status: number, body: unknown): PlaceOrderResult {
  if (status === 200 || status === 201) {
    const created = CreatedOrder.safeParse(body);
    if (created.success) return { ok: true, ...created.data };
    return { ok: false, reason: "unavailable", message: ORDER_MESSAGES.unavailable };
  }
  const error = errorOf(body);
  const reason: PlaceOrderFailure =
    status === 422
      ? "details"
      : status === 409
        ? (ORDER_REASONS[error?.details?.reason ?? ""] ?? "unavailable")
        : "unavailable";
  // El texto de la API es para el comprador, salvo en los casos internos.
  const own = reason === "unavailable" || reason === "idempotency_mismatch";
  return { ok: false, reason, message: (!own && error?.message) || ORDER_MESSAGES[reason] };
}

const PAYMENT_REASONS: Record<string, StartPaymentFailure> = {
  payment_uncertain: "uncertain",
  already_paid: "already_paid",
  order_not_payable: "not_payable",
  payment_expired: "not_payable",
  nothing_to_charge: "not_payable",
  stock_unavailable: "stock_unavailable",
  payment_unavailable: "unavailable",
};

const PAYMENT_MESSAGES: Record<StartPaymentFailure, string> = {
  uncertain: "Estamos verificando tu pago anterior. Espera antes de intentarlo otra vez.",
  already_paid: "Este pedido ya está pagado.",
  not_payable: "El plazo para pagar este pedido terminó. Vuelve a intentarlo.",
  stock_unavailable: "Ya no quedan unidades para este pedido. Vuelve al carrito.",
  not_found: "No encontramos tu pedido. Vuelve a intentarlo.",
  unavailable: "No pudimos iniciar el pago. Inténtalo en unos minutos.",
};

/** Respuesta de POST /payments/flow/create → resultado del checkout. */
export function toStartPaymentResult(status: number, body: unknown): StartPaymentResult {
  if (status === 200) {
    const created = PaymentCreated.safeParse(body);
    if (created.success) return { ok: true, redirectUrl: created.data.redirectUrl };
    return { ok: false, reason: "unavailable", message: PAYMENT_MESSAGES.unavailable };
  }
  const error = errorOf(body);
  const reason: StartPaymentFailure =
    status === 401 || status === 404
      ? "not_found"
      : status === 409
        ? (PAYMENT_REASONS[error?.details?.reason ?? ""] ?? "unavailable")
        : "unavailable";
  return { ok: false, reason, message: PAYMENT_MESSAGES[reason] };
}

/** Solo se redirige a la pasarela oficial de Flow (nunca a otro host). */
export function isFlowUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === "https:" && (hostname === "flow.cl" || hostname.endsWith(".flow.cl"));
  } catch {
    return false;
  }
}
