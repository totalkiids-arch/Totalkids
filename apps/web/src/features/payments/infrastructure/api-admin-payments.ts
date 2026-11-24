import "server-only";

import { panelGet } from "@/shared/infrastructure/panel-api";

import type { AdminPayments } from "../application/ports";
import { toApiPaymentSearch } from "../domain/payment-query";
import { toPaymentPage } from "./admin-payments-api";

/** Intentos de pago en la API (solo lectura, más recientes primero). */
export const apiAdminPayments: AdminPayments = {
  async list(query) {
    return toPaymentPage(await panelGet(`/admin/payments?${toApiPaymentSearch(query)}`));
  },
};
