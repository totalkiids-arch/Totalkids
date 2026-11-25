import type { ReportPeriod, SalesReport } from "../domain/sales-report";

/**
 * Puerto: reporte de ventas (RF-30). Lo implementa la API
 * (GET /admin/reports/sales, solo Administrador), que calcula cobros,
 * reembolsos aparte y totales con días de Chile. Un período que la API
 * rechaza (422) se lanza como PanelApiError con el mensaje por campo.
 */
export interface SalesReports {
  get(period: ReportPeriod): Promise<SalesReport>;
}
