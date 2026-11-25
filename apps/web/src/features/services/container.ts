// Raíz de composición de "services": conecta los puertos con sus adaptadores.
import { forwardExport } from "@/shared/infrastructure/panel-export";

import { ServiceRequestRejectedError, type ServiceRequestGateway } from "./application/ports";
import type { ServiceRequestAdmin } from "./application/service-request-admin";
import {
  parseServiceRequest,
  requestServiceTitle,
  type RequestErrors,
} from "./domain/service-request";
import {
  parseRequestQuery,
  requestQueryString,
  toApiRequestFilters,
} from "./domain/service-request-admin";
import { apiServiceRequestAdmin } from "./infrastructure/api-service-request-admin";
import { apiServiceRequestGateway } from "./infrastructure/api-service-request-gateway";

const gateway: ServiceRequestGateway = apiServiceRequestGateway;

/** Fecha de hoy en Chile, "AAAA-MM-DD" (para validar la fecha preferida). */
function todayInChile(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
}

export type SubmitRequestResult =
  | { ok: true; reference: string; serviceTitle: string; email: string }
  | { ok: false; errors: RequestErrors; formError?: string };

/** Caso de uso: enviar una solicitud de servicio especial (RF-24), validada en el servidor. */
export async function submitServiceRequest(
  input: Partial<Record<string, unknown>>,
): Promise<SubmitRequestResult> {
  const result = parseServiceRequest(input, todayInChile());
  if (!result.ok) return result;
  let reference: string;
  try {
    ({ reference } = await gateway.submit(result.request));
  } catch (error) {
    if (error instanceof ServiceRequestRejectedError) {
      return { ok: false, errors: {}, formError: error.message };
    }
    throw error;
  }
  return {
    ok: true,
    reference,
    serviceTitle: requestServiceTitle(result.request),
    email: result.request.email,
  };
}

// ── Panel: solicitudes (UI-14) ───────────────────────────────────────────────
// Administrador y Operador. La API filtra, pagina, aplica las reglas y registra
// cada cambio con quien lo hizo.
export const serviceRequestAdmin: ServiceRequestAdmin = apiServiceRequestAdmin;

/**
 * Caso de uso: CSV de solicitudes con los filtros de la URL (RF-29), solo para
 * el Administrador (lo verifica el Route Handler y la API). Lo arma la API, con
 * datos personales mínimos (sin teléfono, mensaje ni nota).
 */
export function exportServiceRequests(
  params: Record<string, string | string[] | undefined>,
): Promise<Response> {
  const query = parseRequestQuery(params);
  return forwardExport(
    "service-requests",
    toApiRequestFilters(query),
    `/admin/solicitudes${requestQueryString(query)}`,
  );
}
