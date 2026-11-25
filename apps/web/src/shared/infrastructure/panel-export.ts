import "server-only";

import type { Route } from "next";
import { redirect } from "next/navigation";

import { isPanelApiError } from "@/shared/lib/panel-errors";

import { panelDownload } from "./panel-api";

export type ExportResource = "orders" | "sales" | "service-requests" | "subscribers";

/** Valor de `?aviso=` con que se vuelve a la pantalla si la exportación falla. */
export const EXPORT_NOTICE = { tooMany: "exportar-acotar", failed: "exportar-error" } as const;

const withNotice = (back: string, notice: string) =>
  `${back}${back.includes("?") ? "&" : "?"}aviso=${notice}` as Route;

/**
 * Descarga una exportación CSV de la API (GET /admin/exports/{resource}) y la
 * reenvía al navegador tal cual: la API ya arma el archivo (UTF-8 con BOM,
 * fórmulas neutralizadas, hora de Chile), lo nombra y registra la descarga.
 *
 * Para Route Handlers GET. Sin sesión lleva al ingreso; sin permiso responde
 * 403. Si hay demasiadas filas (422) o la API no responde, vuelve a `back` (la
 * pantalla con sus filtros) con un aviso: nunca entrega un archivo vacío.
 */
export async function forwardExport(
  resource: ExportResource,
  apiSearch: URLSearchParams,
  back: string,
): Promise<Response> {
  const query = apiSearch.toString();
  let response: Response;
  try {
    response = await panelDownload(`/admin/exports/${resource}${query ? `?${query}` : ""}`);
  } catch (error) {
    if (isPanelApiError(error)) {
      if (error.kind === "forbidden") return new Response("No autorizado", { status: 403 });
      redirect(
        withNotice(
          back,
          error.kind === "validation" ? EXPORT_NOTICE.tooMany : EXPORT_NOTICE.failed,
        ),
      );
    }
    throw error;
  }
  return new Response(response.body, {
    headers: {
      "Content-Type": response.headers.get("content-type") ?? "text/csv; charset=utf-8",
      "Content-Disposition":
        response.headers.get("content-disposition") ??
        `attachment; filename="total-kids-${resource}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
