import type { Metadata } from "next";

import { AdminSectionGate, getAdminSession } from "@/features/auth";
import { listSalesForReports } from "@/features/orders";
import { buildSalesReport, chileDay, parseReportPeriod, ReportsScreen } from "@/features/reports";

export const metadata: Metadata = { title: "Reportes" };

/**
 * Compone dos features sin acoplarlas: las ventas salen de orders y el reporte
 * lo arma reports. Período en la URL (?desde=&hasta=), así se puede compartir.
 */
export default async function Page({ searchParams }: PageProps<"/admin/reportes">) {
  const [params, session, sales] = await Promise.all([
    searchParams,
    getAdminSession(),
    listSalesForReports(),
  ]);
  const period = parseReportPeriod(params, chileDay(new Date().toISOString()));
  return (
    <AdminSectionGate section="reportes">
      <ReportsScreen
        report={buildSalesReport(sales, period.period)}
        error={period.ok ? undefined : period.error}
        canExport={session?.role === "admin"}
      />
    </AdminSectionGate>
  );
}
