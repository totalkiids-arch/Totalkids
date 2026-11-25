import "server-only";

import { panelGet, panelSend } from "@/shared/infrastructure/panel-api";
import { isPanelApiError } from "@/shared/lib/panel-errors";

import type { SubscriberAdmin } from "../application/subscriber-admin";
import { toApiSubscriberSearch } from "../domain/subscriber";
import { toSubscriberPage } from "./admin-subscribers-api";

/** Suscriptores del newsletter en la API (solo Administrador). */
export const apiSubscriberAdmin: SubscriberAdmin = {
  async list(query) {
    return toSubscriberPage(await panelGet(`/admin/newsletter?${toApiSubscriberSearch(query)}`));
  },

  async registerUnsubscribe(id) {
    try {
      await panelSend(`/admin/newsletter/${encodeURIComponent(id)}/unsubscribe`);
      return { ok: true };
    } catch (error) {
      if (isPanelApiError(error)) {
        // 409: ya estaba de baja (la fecha original no cambia).
        if (error.kind === "conflict") return { ok: false, reason: "already-unsubscribed" };
        if (error.kind === "not-found" || error.kind === "validation") {
          return { ok: false, reason: "not-found" };
        }
      }
      throw error;
    }
  },
};
