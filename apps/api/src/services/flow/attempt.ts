import type { Payment } from "../../generated/prisma/client.js";
import type { FlowPaymentStatus } from "./client.js";
import { unseal } from "./seal.js";
import type { FlowGateway } from "./start.js";

/** URL de pago guardada del intento; null si nunca se recibió. */
export function attemptUrl(
  flow: Pick<FlowGateway, "sealSecret">,
  payment: Pick<Payment, "redirectUrlEncrypted">,
): string | null {
  return payment.redirectUrlEncrypted && unseal(payment.redirectUrlEncrypted, flow.sealSecret);
}

/**
 * Estado real de un intento en Flow. Con el token (va en la URL guardada) usa
 * `getStatus`; si la creación quedó incierta y nunca se recibió, por número de orden.
 */
export async function queryAttempt(
  flow: Pick<FlowGateway, "client" | "sealSecret">,
  payment: Pick<Payment, "commerceOrder" | "redirectUrlEncrypted">,
): Promise<{ status: FlowPaymentStatus; token?: string }> {
  const url = attemptUrl(flow, payment);
  const token = url ? new URL(url).searchParams.get("token") : null;
  if (token) return { status: await flow.client.getStatus(token), token };
  return { status: await flow.client.getStatusByCommerceOrder(payment.commerceOrder) };
}
