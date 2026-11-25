import { redirect } from "next/navigation";

import { getAdminSession } from "@/features/auth";
import { exportSales } from "@/features/reports";

/**
 * Exportación CSV de las ventas del período (RF-29, RF-30). Solo
 * Administrador. Los Route Handlers no pasan por el layout del panel: el rol se
 * verifica aquí, y la API lo vuelve a exigir.
 */
export async function GET(request: Request) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/ingresar");
  if (session.role !== "admin") return new Response("No autorizado", { status: 403 });
  return exportSales(Object.fromEntries(new URL(request.url).searchParams));
}
