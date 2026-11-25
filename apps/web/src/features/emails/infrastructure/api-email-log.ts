import "server-only";

import { panelGet, panelSend } from "@/shared/infrastructure/panel-api";
import { isPanelApiError } from "@/shared/lib/panel-errors";

import type { EmailLog } from "../application/ports";
import { toApiEmailSearch } from "../domain/email-log";
import { toEmailDetail, toEmailPage, toResendId } from "./admin-emails-api";

const enc = encodeURIComponent;

/** Registro de correos en la API. El reenvío lo autoriza y lo audita la API. */
export const apiEmailLog: EmailLog = {
  async list(query) {
    return toEmailPage(await panelGet(`/admin/emails?${toApiEmailSearch(query)}`));
  },

  async get(id) {
    try {
      return toEmailDetail(await panelGet(`/admin/emails/${enc(id)}`));
    } catch (error) {
      if (isPanelApiError(error) && (error.kind === "not-found" || error.kind === "validation"))
        return null;
      throw error;
    }
  },

  async resend(id) {
    try {
      const response = await panelSend(`/admin/emails/${enc(id)}/resend`);
      return { ok: true, resendId: toResendId(response.body) };
    } catch (error) {
      if (isPanelApiError(error)) {
        // 409: no está fallido o incierto, ya hay un reenvío en curso o es una recuperación.
        if (error.kind === "conflict") return { ok: false, reason: "not-allowed" };
        if (error.kind === "not-found" || error.kind === "validation") {
          return { ok: false, reason: "not-found" };
        }
        if (error.kind === "rate-limited") {
          return { ok: false, reason: "rate-limited", retryAfterSeconds: error.retryAfterSeconds };
        }
      }
      throw error;
    }
  },
};
