import "server-only";

import { serverEnv } from "@/shared/config/server-env";

export interface ApiFetchOptions extends Omit<RequestInit, "headers"> {
  /** Se propaga como X-Request-Id para correlacionar logs entre Next.js y la API. */
  requestId: string;
  /** IP original del cliente, para que la API (rate limit, auditoría) vea la IP real. */
  forwardedFor?: string | null;
  headers?: Record<string, string>;
  /** Tiempo máximo de espera en ms. */
  timeoutMs?: number;
}

/**
 * Cliente HTTP de servidor hacia la API Express. Lo usan las rutas BFF de
 * src/app/api/*. Nunca se importa desde código de cliente.
 */
export function apiFetch(path: `/${string}`, options: ApiFetchOptions): Promise<Response> {
  const { requestId, forwardedFor, headers, timeoutMs = 5000, ...init } = options;
  return fetch(`${serverEnv.API_URL}${path}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
    ...init,
    headers: {
      accept: "application/json",
      "x-request-id": requestId,
      ...(forwardedFor ? { "x-forwarded-for": forwardedFor } : {}),
      ...headers,
    },
  });
}
