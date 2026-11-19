"use server";

import { redirect } from "next/navigation";

import { saveCheckoutDetails, type SaveDetailsResult } from "../container";

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
