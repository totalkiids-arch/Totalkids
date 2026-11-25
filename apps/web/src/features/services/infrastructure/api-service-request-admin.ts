import "server-only";

import { panelGet, panelSend } from "@/shared/infrastructure/panel-api";
import { businessFieldErrors, isPanelApiError } from "@/shared/lib/panel-errors";

import type { ServiceRequestAdmin } from "../application/service-request-admin";
import { toApiRequestSearch, validateFollowUp } from "../domain/service-request-admin";
import { toRequestDetail, toRequestPage } from "./admin-requests-api";

/**
 * Solicitudes de servicio del panel en la API (Administrador y Operador). El
 * seguimiento se valida antes de llamar (mismos mensajes); la API vuelve a
 * aplicar las reglas y registra el cambio con quien lo hizo.
 */

const enc = encodeURIComponent;
const NOT_FOUND = "Esa solicitud ya no existe. Recarga la página.";

export const apiServiceRequestAdmin: ServiceRequestAdmin = {
  async list(query) {
    return toRequestPage(await panelGet(`/admin/service-requests?${toApiRequestSearch(query)}`));
  },

  async get(ref) {
    try {
      return toRequestDetail(await panelGet(`/admin/service-requests/${enc(ref)}`));
    } catch (error) {
      // Una referencia con forma inválida (422) tampoco existe.
      if (isPanelApiError(error) && (error.kind === "not-found" || error.kind === "validation"))
        return null;
      throw error;
    }
  },

  async followUp(ref, input) {
    const current = await apiServiceRequestAdmin.get(ref);
    if (!current) return { ok: false, errors: { form: NOT_FOUND } };
    const result = validateFollowUp(current, input);
    if (!result.ok) return result;
    try {
      await panelSend(`/admin/service-requests/${enc(ref)}`, {
        method: "PATCH",
        body: result.changes,
      });
      return { ok: true };
    } catch (error) {
      return { ok: false, errors: businessFieldErrors(error, NOT_FOUND) };
    }
  },
};
