import { getAdminSession } from "@/features/auth";
import { listSalesForReports } from "@/features/orders";
import {
  buildSalesReport,
  chileDay,
  parseReportPeriod,
  REPORT_CSV_HEADER,
  reportCsvRows,
} from "@/features/reports";
import { chileDateTimeForCsv } from "@/shared/lib/chile-time";
import { csvDownload, toCsv } from "@/shared/lib/csv";

/**
 * Exportación CSV del reporte de ventas del período (RF-29, RF-30). Solo
 * Administrador (tabla de la API de la SRS: exportaciones). Los route handlers
 * no pasan por el layout del panel: el rol se verifica aquí. Sesión de
 * DEMOSTRACIÓN; la autorización real la aplica el backend (LN-04).
 */
export async function GET(request: Request) {
  const session = await getAdminSession();
  if (session?.role !== "admin") return new Response("No autorizado", { status: 403 });

  const params = Object.fromEntries(new URL(request.url).searchParams);
  const period = parseReportPeriod(params, chileDay(new Date().toISOString()));
  if (!period.ok) return new Response(period.error, { status: 400 });

  const report = buildSalesReport(await listSalesForReports(), period.period);
  return csvDownload(
    `total-kids-ventas-${period.period.from}-${period.period.to}.csv`,
    toCsv(REPORT_CSV_HEADER, reportCsvRows(report, chileDateTimeForCsv)),
  );
}
