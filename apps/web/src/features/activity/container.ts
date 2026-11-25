// Raíz de composición de "activity": conecta el puerto con su adaptador.
import type { ActivityLog } from "./application/ports";
import type { ActivityQuery } from "./domain/activity";
import { apiActivityLog } from "./infrastructure/api-activity-log";

const activityLog: ActivityLog = apiActivityLog;

/** Caso de uso: una página del historial de actividad (RF-27, RF-34). */
export function listActivity(query: ActivityQuery) {
  return activityLog.list(query);
}
