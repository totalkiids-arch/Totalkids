/**
 * Paso "Pago" (RF-15): antes de ir a Flow, el comprador acepta las condiciones
 * de compra, despacho y privacidad. Dominio puro.
 */

/** Nombre de la casilla de condiciones en el formulario. */
export const TERMS_FIELD = "condiciones";

export const TERMS_REQUIRED_MESSAGE = "Revisa y acepta las condiciones para continuar.";

export type PaymentConfirmation = { ok: true } | { ok: false; error: string };

/** Valores crudos del formulario (p. ej. `Object.fromEntries(formData)`). */
export function parsePaymentConfirmation(
  input: Partial<Record<string, unknown>>,
): PaymentConfirmation {
  const terms = input[TERMS_FIELD];
  return terms === "on" || terms === "true"
    ? { ok: true }
    : { ok: false, error: TERMS_REQUIRED_MESSAGE };
}
