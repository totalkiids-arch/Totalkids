import type { ActivityPage, ActivityQuery } from "../domain/activity";

/**
 * Puerto: historial de actividad del panel (RF-27, RF-34). Lo implementa la API
 * (GET /admin/activity, solo Administrador), que filtra y pagina audit_log.
 */
export interface ActivityLog {
  list(query: ActivityQuery): Promise<ActivityPage>;
}
