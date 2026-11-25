import "server-only";

import { cartSessionCookie } from "@/features/cart";
import { apiFetch } from "@/shared/infrastructure/api-client";
import { postApiForm } from "@/shared/infrastructure/api-forms";
import { requestContext } from "@/shared/infrastructure/request-context";

import { CheckoutUnavailableError, type CheckoutGateway } from "../application/ports";
import {
  toDeliveryQuote,
  toOrderBody,
  toPlaceOrderResult,
  toQuoteSearch,
  toStartPaymentResult,
} from "./checkout-api";

/** Crear el pedido y abrir el pago llaman a Flow o bloquean filas: más margen. */
const WRITE_TIMEOUT_MS = 15_000;

/**
 * Checkout en la API (LN-11). Cotizar y crear el pedido usan el carrito de
 * este navegador (su cookie, CSRF atado a él); el pago usa la credencial del
 * pedido (X-Order-Access). El navegador nunca llama a la API.
 */
export const apiCheckoutGateway: CheckoutGateway = {
  async quote(delivery) {
    const cookie = await cartSessionCookie();
    let response: Response;
    try {
      response = await apiFetch(`/api/v1/shipping/quote?${toQuoteSearch(delivery)}`, {
        ...(await requestContext()),
        headers: cookie ? { cookie } : {},
      });
    } catch (error) {
      throw new CheckoutUnavailableError(error);
    }
    // 422: retiro deshabilitado (o una comuna que la API no acepta).
    if (response.status === 422) return null;
    if (!response.ok) throw new CheckoutUnavailableError(`API ${response.status}`);
    try {
      return toDeliveryQuote(await response.json());
    } catch (error) {
      throw new CheckoutUnavailableError(error);
    }
  },

  async placeOrder(details, expectedTotal, idempotencyKey) {
    try {
      const result = await postApiForm("/orders", toOrderBody(details, expectedTotal), {
        sessionCookie: await cartSessionCookie(),
        headers: { "idempotency-key": idempotencyKey },
        timeoutMs: WRITE_TIMEOUT_MS,
      });
      return toPlaceOrderResult(result.status, result.body);
    } catch {
      return toPlaceOrderResult(503, null);
    }
  },

  async startPayment(orderNumber, accessToken) {
    try {
      const result = await postApiForm(
        "/payments/flow/create",
        { orderNumber },
        {
          sessionCookie: await cartSessionCookie(),
          headers: { "x-order-access": accessToken },
          timeoutMs: WRITE_TIMEOUT_MS,
        },
      );
      return toStartPaymentResult(result.status, result.body);
    } catch {
      return toStartPaymentResult(503, null);
    }
  },
};
