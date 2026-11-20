import { getAdminSession } from "@/features/auth";
import { exportSubscribersCsv } from "@/features/newsletter";
import { csvDownload } from "@/shared/lib/csv";

/**
 * Exportación CSV de suscriptores con el filtro de la URL (RF-29: solo el
 * administrador exporta suscriptores). Los route handlers no pasan por el
 * layout del panel: el rol se verifica aquí. Sesión de DEMOSTRACIÓN; la
 * autorización real la aplica el backend (LN-04).
 */
export async function GET(request: Request) {
  const session = await getAdminSession();
  if (session?.role !== "admin") return new Response("No autorizado", { status: 403 });
  const params = Object.fromEntries(new URL(request.url).searchParams);
  return csvDownload("total-kids-suscriptores.csv", await exportSubscribersCsv(params));
}
