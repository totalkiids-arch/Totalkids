import "server-only";

import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

/**
 * Datos de la petición del navegador que Next.js reenvía a la API: el
 * X-Request-Id (para correlacionar logs) y la IP original (X-Forwarded-For),
 * para que los límites por IP y la auditoría de la API vean al visitante y no
 * al servidor de Next.
 */
export async function requestContext() {
  const incoming = await headers();
  return {
    requestId: incoming.get("x-request-id") ?? randomUUID(),
    forwardedFor: incoming.get("x-forwarded-for") ?? incoming.get("x-real-ip"),
  };
}
