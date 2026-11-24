import { getAdminSession } from "@/features/auth";
import { exportAdminOrdersCsv } from "@/features/orders";

/**
 * Exportación CSV del listado de pedidos con los filtros de la URL (RF-28).
 * Solo el Administrador exporta pedidos. Los route handlers no pasan por el
 * layout del panel: el rol se verifica aquí (y la API lo vuelve a exigir).
 */
export async function GET(request: Request) {
  const session = await getAdminSession();
  if (session?.role !== "admin") {
    return new Response("No autorizado", { status: 403 });
  }
  const params = Object.fromEntries(new URL(request.url).searchParams);
  // BOM para que Excel lea bien las tildes.
  const csv = `\uFEFF${await exportAdminOrdersCsv(params)}`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="pedidos.csv"',
      "Cache-Control": "no-store",
    },
  });
}
