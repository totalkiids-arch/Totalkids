import { redirect } from "next/navigation";

import { getAdminSession } from "@/features/auth";
import { exportSubscribers } from "@/features/newsletter";

/**
 * Exportación CSV de suscriptores con los filtros de la URL (RF-29). Solo
 * Administrador. Los Route Handlers no pasan por el layout del panel: el rol se
 * verifica aquí, y la API lo vuelve a exigir.
 */
export async function GET(request: Request) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/ingresar");
  if (session.role !== "admin") return new Response("No autorizado", { status: 403 });
  return exportSubscribers(Object.fromEntries(new URL(request.url).searchParams));
}
