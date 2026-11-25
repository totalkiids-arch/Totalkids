// Raíz de composición de "reports": conecta el puerto con su adaptador.
import { forwardExport } from "@/shared/infrastructure/panel-export";
import { chileDay } from "@/shared/lib/chile-time";
import { isPanelApiError } from "@/shared/lib/panel-errors";

import type { SalesReports } from "./application/ports";
import {
  parseReportPeriod,
  reportPeriodSearch,
  toApiPeriodSearch,
  type SalesReport,
} from "./domain/sales-report";
import { apiSalesReports } from "./infrastructure/api-sales-reports";

const salesReports: SalesReports = apiSalesReports;

type Params = Record<string, string | string[] | undefined>;

const today = () => chileDay(new Date().toISOString());

/**
 * Caso de uso: reporte de ventas del período de la URL (RF-30). Si el período
 * no es válido (aquí o para la API), muestra el mes en curso con el error.
 */
export async function getSalesReport(
  params: Params,
): Promise<{ report: SalesReport; error?: string }> {
  const parsed = parseReportPeriod(params, today());
  if (!parsed.ok) return { report: await salesReports.get(parsed.period), error: parsed.error };
  try {
    return { report: await salesReports.get(parsed.period) };
  } catch (error) {
    if (!isPanelApiError(error) || error.kind !== "validation") throw error;
    const fallback = parseReportPeriod({}, today()).period;
    const message = error.fieldErrors.from ?? error.fieldErrors.to ?? error.message;
    return { report: await salesReports.get(fallback), error: message };
  }
}

/**
 * Caso de uso: CSV de las ventas del período (RF-29, RF-30), una fila por
 * cobro, armado por la API. Solo Administrador (lo verifica el Route Handler y
 * la API).
 */
export function exportSales(params: Params): Promise<Response> {
  const { period } = parseReportPeriod(params, today());
  return forwardExport(
    "sales",
    toApiPeriodSearch(period),
    `/admin/reportes${reportPeriodSearch(period)}`,
  );
}
