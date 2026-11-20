"use server";

import { pickRequestValues, type RequestValues } from "../domain/service-request";
import { submitServiceRequest, type SubmitRequestResult } from "../container";

/** Estado del formulario (useActionState). null = sin enviar. */
export type ServiceRequestState =
  | Extract<SubmitRequestResult, { ok: true }>
  | (Extract<SubmitRequestResult, { ok: false }> & { values: RequestValues })
  | null;

/**
 * Envía la solicitud. Con errores devuelve lo escrito para volver a llenar el
 * formulario (React lo limpia después de la acción).
 */
export async function submitServiceRequestAction(
  _: ServiceRequestState,
  formData: FormData,
): Promise<ServiceRequestState> {
  const input = Object.fromEntries(formData);
  const result = await submitServiceRequest(input);
  return result.ok ? result : { ...result, values: pickRequestValues(input) };
}
