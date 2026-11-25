import type { Metadata } from "next";

import { AdminSectionGate, getAdminSession } from "@/features/auth";
import { getSalesReport, ReportsScreen } from "@/features/reports";

export const metadata: Metadata = { title: "Reportes" };

/**
 * Reporte de ventas del período en la URL (?desde=&hasta=), así se puede
 * compartir. Lo calcula la API (solo Administrador).
 */
export default async function Page({ searchParams }: PageProps<"/admin/reportes">) {
  const params = await searchParams;
  return (
    <AdminSectionGate section="reportes">
      <Report params={params} />
    </AdminSectionGate>
  );
}

/** Dentro de la compuerta: el Operador no llega a pedir el reporte a la API. */
async function Report({ params }: { params: Record<string, string | string[] | undefined> }) {
  const [session, { report, error }] = await Promise.all([
    getAdminSession(),
    getSalesReport(params),
  ]);
  return (
    <ReportsScreen
      report={report}
      error={error}
      canExport={session?.role === "admin"}
      aviso={params.aviso}
    />
  );
}
