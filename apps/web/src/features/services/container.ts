// Raíz de composición de "services": conecta los puertos con sus adaptadores actuales.
import type { ActivityEntry } from "@/features/activity";
import { chileDateTimeForCsv } from "@/shared/lib/chile-time";
import { toCsv } from "@/shared/lib/csv";

import { ServiceRequestRejectedError, type ServiceRequestGateway } from "./application/ports";
import type { ServiceRequestAdmin } from "./application/service-request-admin";
import {
  parseServiceRequest,
  requestServiceTitle,
  type RequestErrors,
} from "./domain/service-request";
import {
  filterRequests,
  parseRequestQuery,
  REQUESTER_ACTOR,
  requestsCsvTable,
} from "./domain/service-request-admin";
import { apiServiceRequestGateway } from "./infrastructure/api-service-request-gateway";
import { demoServiceRequestDesk } from "./infrastructure/demo-service-request-desk";

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
// DEMO hasta LN-13 (ver infrastructure/demo-service-request-desk.ts). El
// formulario público ya usa la API (LN-08), así que las solicitudes reales no
// aparecen aquí. Las pantallas, las acciones y la exportación verifican el rol.
export const serviceRequestAdmin: ServiceRequestAdmin = demoServiceRequestDesk;

/**
 * Caso de uso: CSV de solicitudes con los filtros de la URL (RF-29), solo para
 * el Administrador (lo verifica el Route Handler). Datos personales mínimos.
 */
export async function exportServiceRequestsCsv(
  params: Record<string, string | string[] | undefined>,
): Promise<string> {
  const rows = filterRequests(await serviceRequestAdmin.list(), parseRequestQuery(params));
  const table = requestsCsvTable(rows, chileDateTimeForCsv);
  return toCsv(table.header, table.rows);
}

/**
 * Caso de uso: seguimiento de solicitudes hecho por el equipo, para el
 * historial (RF-34). Lo que registra el solicitante no se lista aquí.
 */
export async function listActivity(): Promise<ActivityEntry[]> {
  return (await serviceRequestAdmin.list()).flatMap((request) =>
    request.history.flatMap((entry, index) =>
      entry.actor === REQUESTER_ACTOR
        ? []
        : [
            {
              id: `solicitud-${request.id}-${index}`,
              at: entry.at,
              actor: entry.actor,
              area: "solicitudes" as const,
              action: entry.change,
              reason: null,
              reference: {
                label: request.id,
                href: `/admin/solicitudes?id=${encodeURIComponent(request.id)}#detalle`,
              },
            },
          ],
    ),
  );
}
