"use server";

import { redirect } from "next/navigation";

import { saveCheckoutDetails, startDemoPayment, type SaveDetailsResult } from "../container";

/** Estado del formulario "Datos y facturación" (useActionState). null = sin enviar. */
export type CheckoutDetailsState = Extract<SaveDetailsResult, { ok: false }> | null;

/**
 * Envía "Datos y facturación". Si todo es válido, guarda el borrador y lleva al
 * pago; si no, devuelve los errores y lo escrito (React limpia el formulario
 * después de la acción, así que la pantalla lo vuelve a llenar).
 */
export async function submitCheckoutDetailsAction(
  _: CheckoutDetailsState,
  formData: FormData,
): Promise<CheckoutDetailsState> {
  const result = await saveCheckoutDetails(Object.fromEntries(formData));
  if (!result.ok) return result;
  redirect("/checkout/pago");
}

/** Estado del formulario de pago (useActionState). null = sin enviar. */
export type PaymentState = { error: string } | null;

/**
 * Envía el paso "Pago" (demostración de Flow). Sin condiciones aceptadas
 * devuelve el error; si faltan datos o el carrito cambió, vuelve a "Datos y
 * facturación"; si todo está en orden, lleva al resultado del pago.
 */
export async function startPaymentAction(
  _: PaymentState,
  formData: FormData,
): Promise<PaymentState> {
  const result = await startDemoPayment(Object.fromEntries(formData));
  if (result.ok) redirect(result.redirectTo);
  if (result.reason === "details") redirect("/checkout");
  return { error: result.error };
}
