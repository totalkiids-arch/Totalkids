import { randomUUID } from "node:crypto";

import { apiFetch } from "@/shared/infrastructure/api-client";

// Ruta BFF: el navegador llama a /api/health (Next.js) y Next.js llama a la API.
// Así la API nunca se expone directamente al navegador.
export async function GET(request: Request): Promise<Response> {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();

  try {
    const upstream = await apiFetch("/api/v1/health", {
      requestId,
      forwardedFor: request.headers.get("x-forwarded-for"),
    });
    const body: unknown = await upstream.json();
    return Response.json(body, {
      status: upstream.status,
      headers: { "x-request-id": requestId },
    });
  } catch {
    return Response.json(
      {
        code: "API_UNREACHABLE",
        message: "No se pudo contactar la API",
        details: null,
        requestId,
      },
      { status: 502, headers: { "x-request-id": requestId } },
    );
  }
}
