"use server";

import type { Route } from "next";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import { saveCheckoutDetails, startPayment, type SaveDetailsResult } from "../container";

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
 * Envía el paso "Pago": crea el pedido y lleva a Flow (o al resultado si ya
 * hay un pago en curso). Sin condiciones aceptadas devuelve el error; si faltan
 * datos o el carrito cambió, vuelve a "Datos y facturación" o al carrito. Con
 * otro error, la página se vuelve a cotizar (p. ej. un total que cambió).
 */
export async function startPaymentAction(
  _: PaymentState,
  formData: FormData,
): Promise<PaymentState> {
  const result = await startPayment(Object.fromEntries(formData));
  // A la pasarela de Flow (URL externa, ya verificada) o al resultado.
  if (result.ok) redirect(result.redirectTo as Route);
  if (result.reason === "details") redirect(result.redirectTo);
  if (result.reason === "error") refresh();
  return { error: result.error };
}
