import { getAdminSession } from "@/features/auth";
import { exportServiceRequestsCsv } from "@/features/services";
import { csvDownload } from "@/shared/lib/csv";

/**
 * Exportación CSV de solicitudes con los filtros de la URL (RF-29). Solo
 * Administrador (tabla de la API de la SRS: exportaciones). Los route handlers
 * no pasan por el layout del panel: el rol se verifica aquí. Sesión de
 * DEMOSTRACIÓN; la autorización real la aplica el backend (LN-04).
 */
export async function GET(request: Request) {
  const session = await getAdminSession();
  if (session?.role !== "admin") return new Response("No autorizado", { status: 403 });
  const params = Object.fromEntries(new URL(request.url).searchParams);
  return csvDownload("total-kids-solicitudes.csv", await exportServiceRequestsCsv(params));
}
