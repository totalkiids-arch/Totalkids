import type {
  AdminServiceRequest,
  FollowUpInput,
  FollowUpResult,
} from "../domain/service-request-admin";

/**
 * Puerto: solicitudes de servicio en el panel (RF-24, RF-29). Con la API
 * (LN-08/LN-13): GET /admin/service-requests y GET/PATCH /admin/service-requests/{id},
 * para Administrador y Operador.
 */
export interface ServiceRequestAdmin {
  list(): Promise<AdminServiceRequest[]>;
  get(id: string): Promise<AdminServiceRequest | null>;
  /** Cambia estado y/o nota interna; el adaptador vuelve a validar con el dominio. */
  followUp(id: string, input: FollowUpInput, actor: string): Promise<FollowUpResult>;
}
