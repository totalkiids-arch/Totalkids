// Raíz de composición de "checkout": conecta los puertos con sus adaptadores actuales.
import { site } from "@/shared/config/site";

import { checkoutBlocker, summarizeOrder } from "./application/order-summary";
import type { CheckoutCartReader, CheckoutDraftStore } from "./application/ports";
import { pickCheckoutValues, type CheckoutValues } from "./domain/checkout-draft";
import {
  parseCheckoutDetails,
  type CheckoutDetails,
  type CheckoutErrors,
  type CheckoutInput,
} from "./domain/checkout-details";
import { parsePaymentConfirmation } from "./domain/payment-confirmation";
import { cartCheckoutReader } from "./infrastructure/cart-checkout-reader";
import { cookieCheckoutDraftStore } from "./infrastructure/cookie-checkout-draft-store";

const cart: CheckoutCartReader = cartCheckoutReader;
const drafts: CheckoutDraftStore = cookieCheckoutDraftStore;

/** Despacho gratis desde este subtotal (RF-08); null = el cliente aún no lo define. */
export const FREE_SHIPPING_THRESHOLD = site.freeShippingThreshold;

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
    freeShippingThreshold: FREE_SHIPPING_THRESHOLD,
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

/**
 * Caso de uso: lo que el paso de pago necesita. null si faltan datos válidos o
 * el carrito ya no se puede pagar (el paso de pago vuelve a "Datos y facturación").
 */
export async function getConfirmedCheckout(): Promise<{
  details: CheckoutDetails;
  summary: ReturnType<typeof summarizeOrder>;
} | null> {
  const [current, values] = await Promise.all([cart.read(), drafts.read()]);
  const result = parseCheckoutDetails(values);
  if (!result.ok || checkoutBlocker(current)) return null;
  return {
    details: result.details,
    summary: summarizeOrder(current, result.details.delivery.method, FREE_SHIPPING_THRESHOLD),
  };
}

/** Caso de uso: olvidar el borrador (al terminar o abandonar la compra). */
export async function clearCheckoutDraft() {
  await drafts.clear();
}

export type StartPaymentResult =
  | { ok: true; redirectTo: "/checkout/resultado?estado=pending" }
  | { ok: false; reason: "terms"; error: string }
  | { ok: false; reason: "details" };

/**
 * Caso de uso: ir a pagar con Flow (RF-15). Exige aceptar las condiciones y
 * vuelve a revisar los datos y el carrito en el servidor.
 *
 * Pago de DEMOSTRACIÓN: no crea el pedido ni abre la pasarela. Lleva al
 * resultado "pendiente", que es lo que ve el comprador al volver de Flow antes
 * de que la API confirme el cobro (RF-17). Con la API, aquí se crea el pedido,
 * se reserva el stock y se redirige a la URL de pago que entrega Flow.
 */
export async function startDemoPayment(input: CheckoutInput): Promise<StartPaymentResult> {
  const confirmation = parsePaymentConfirmation(input);
  if (!confirmation.ok) return { ok: false, reason: "terms", error: confirmation.error };
  if (!(await getConfirmedCheckout())) return { ok: false, reason: "details" };
  return { ok: true, redirectTo: "/checkout/resultado?estado=pending" };
}
