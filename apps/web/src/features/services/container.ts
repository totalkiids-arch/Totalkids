// Raíz de composición de "services": conecta los puertos con sus adaptadores actuales.
import type { ServiceRequestGateway } from "./application/ports";
import {
  parseServiceRequest,
  requestServiceTitle,
  type RequestErrors,
} from "./domain/service-request";
import { demoServiceRequestGateway } from "./infrastructure/demo-service-request-gateway";

const gateway: ServiceRequestGateway = demoServiceRequestGateway;

/** Fecha de hoy en Chile, "AAAA-MM-DD" (para validar la fecha preferida). */
function todayInChile(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
}

export type SubmitRequestResult =
  | { ok: true; reference: string; serviceTitle: string; email: string }
  | { ok: false; errors: RequestErrors };

/** Caso de uso: enviar una solicitud de servicio especial (RF-24), validada en el servidor. */
export async function submitServiceRequest(
  input: Partial<Record<string, unknown>>,
): Promise<SubmitRequestResult> {
  const result = parseServiceRequest(input, todayInChile());
  if (!result.ok) return result;
  const { reference } = await gateway.submit(result.request);
  return {
    ok: true,
    reference,
    serviceTitle: requestServiceTitle(result.request),
    email: result.request.email,
  };
}
