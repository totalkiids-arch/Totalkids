import "server-only";

import { panelGet } from "@/shared/infrastructure/panel-api";
import { isPanelApiError } from "@/shared/lib/panel-errors";

import type { ActivityLog } from "../application/ports";
import { toApiActivitySearch } from "../domain/activity";
import { needsZoneNames, toActivityPage, toZoneNames, withZoneNames } from "./activity-api";

/** Nombres de las zonas de despacho; vacío si la consulta falla (el historial se muestra igual). */
async function zoneNames(): Promise<Map<string, string>> {
  try {
    return toZoneNames(await panelGet("/admin/shipping-zones"));
  } catch (error) {
    // Un 401 ya redirigió al ingreso (lanza NEXT_REDIRECT): se deja pasar.
    if (!isPanelApiError(error)) throw error;
    return new Map();
  }
}

/** Historial de actividad en la API (solo Administrador). */
export const apiActivityLog: ActivityLog = {
  async list(query) {
    const page = toActivityPage(await panelGet(`/admin/activity?${toApiActivitySearch(query)}`));
    // La API nombra las zonas por su id: se completa con la comuna (una sola consulta).
    return needsZoneNames(page) ? withZoneNames(page, await zoneNames()) : page;
  },
};
