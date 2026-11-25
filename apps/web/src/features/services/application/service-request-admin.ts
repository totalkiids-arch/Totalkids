import type {
  AdminRequestDetail,
  FollowUpErrors,
  FollowUpInput,
  RequestPage,
  RequestQuery,
} from "../domain/service-request-admin";

export type FollowUpResult = { ok: true } | { ok: false; errors: FollowUpErrors };

/**
 * Puerto: solicitudes de servicio en el panel (RF-24, RF-29). Lo implementa la
 * API (GET /admin/service-requests y GET/PATCH /admin/service-requests/{ref},
 * Administrador y Operador), que filtra, pagina, aplica las reglas y registra
 * el cambio con quien lo hizo.
 */
export interface ServiceRequestAdmin {
  list(query: RequestQuery): Promise<RequestPage>;
  /** `ref` = referencia ("SOL-1002"). null si no existe. */
  get(ref: string): Promise<AdminRequestDetail | null>;
  /** Cambia estado y/o nota interna. */
  followUp(ref: string, input: FollowUpInput): Promise<FollowUpResult>;
}
