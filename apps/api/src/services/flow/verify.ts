import type { FlowPaymentStatus } from "./client.js";

/** El intento local contra el que se compara la respuesta de Flow (RF-16). */
export interface ExpectedPayment {
  commerceOrder: string;
  /** null si todavía no se conoce (creación incierta). */
  flowOrder: number | null;
  amount: number;
  currency: string;
}

export type FlowMismatch = "commerce_order" | "flow_order" | "amount" | "currency";

/**
 * Diferencias entre lo que informa Flow y el intento local. Con cualquiera, el
 * pago NO se confirma y queda para revisión (RF-16, flujo A4). Vacío = coincide.
 */
export function flowMismatches(
  expected: ExpectedPayment,
  actual: FlowPaymentStatus,
): FlowMismatch[] {
  const found: FlowMismatch[] = [];
  if (actual.commerceOrder !== expected.commerceOrder) found.push("commerce_order");
  if (expected.flowOrder !== null && actual.flowOrder !== expected.flowOrder) {
    found.push("flow_order");
  }
  if (actual.amount !== expected.amount) found.push("amount");
  if (actual.currency !== expected.currency) found.push("currency");
  return found;
}
