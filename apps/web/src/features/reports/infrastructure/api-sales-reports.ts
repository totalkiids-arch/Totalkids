import "server-only";

import { panelGet } from "@/shared/infrastructure/panel-api";

import type { SalesReports } from "../application/ports";
import { toApiPeriodSearch } from "../domain/sales-report";
import { toSalesReport } from "./sales-report-api";

/** Reporte de ventas en la API (solo Administrador). */
export const apiSalesReports: SalesReports = {
  async get(period) {
    return toSalesReport(await panelGet(`/admin/reports/sales?${toApiPeriodSearch(period)}`));
  },
};
