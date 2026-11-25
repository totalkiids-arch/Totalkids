import "server-only";

import { apiFetch } from "@/shared/infrastructure/api-client";
import { FORM_MESSAGES, generalFormError, postApiForm } from "@/shared/infrastructure/api-forms";
import { requestContext } from "@/shared/infrastructure/request-context";

import { GuestOrderUnavailableError, type GuestOrderGateway } from "../application/ports";
import { ApiGuestOrder, ApiLookup, toOrder } from "./guest-order-api";

/**
 * Pedido del invitado en la API (LN-09): POST /orders/lookup con número y correo
 * entrega el pedido y su credencial; GET /orders/{n} la exige en X-Order-Access.
 * Cualquier dato que no calce responde lo mismo (404): no se revela qué existe.
 */
export const apiGuestOrders: GuestOrderGateway = {
  async lookup(orderId, email) {
    let result;
    try {
      result = await postApiForm("/orders/lookup", { orderNumber: orderId, email });
    } catch {
      throw new GuestOrderUnavailableError(FORM_MESSAGES.unavailable);
    }
    if (result.status === 404 || result.status === 422) return null;
    if (result.status !== 200) throw new GuestOrderUnavailableError(generalFormError(result));
    const parsed = ApiLookup.safeParse(result.body);
    if (!parsed.success) throw new GuestOrderUnavailableError(FORM_MESSAGES.unavailable);
    return { order: toOrder(parsed.data.order), token: parsed.data.accessToken };
  },

  async get(orderId, token) {
    let response: Response;
    try {
      response = await apiFetch(`/api/v1/orders/${encodeURIComponent(orderId)}`, {
        ...(await requestContext()),
        headers: { "x-order-access": token },
      });
    } catch {
      throw new GuestOrderUnavailableError(FORM_MESSAGES.unavailable);
    }
    if (response.status === 401 || response.status === 404) return null;
    if (!response.ok) throw new GuestOrderUnavailableError(FORM_MESSAGES.unavailable);
    const parsed = ApiGuestOrder.safeParse(await response.json().catch(() => null));
    if (!parsed.success) throw new GuestOrderUnavailableError(FORM_MESSAGES.unavailable);
    return toOrder(parsed.data);
  },
};
