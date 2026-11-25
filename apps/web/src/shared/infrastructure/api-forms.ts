import "server-only";

import { apiFetch } from "./api-client";
import { requestContext } from "./request-context";

/**
 * Envío de formularios públicos a la API desde el servidor de Next.js (Server
 * Actions). La API exige CSRF de doble envío: aquí se pide un token a /csrf y se
 * manda en la cookie y en X-CSRF-Token. Sin cookies de sesión del navegador, el
 * token queda atado a la clave vacía, que es la de un formulario sin sesión.
 *
 * Reenvía la IP original (X-Forwarded-For) para que los límites por IP de la
 * API cuenten al visitante y no al servidor de Next.
 */

export interface ApiFormResult {
  status: number;
  /** Cuerpo JSON de la respuesta, o null si no trae. */
  body: unknown;
}

/** La API no respondió (caída, timeout o red). */
export class ApiUnavailableError extends Error {
  constructor(cause?: unknown) {
    super("No se pudo contactar la API", { cause });
    this.name = "ApiUnavailableError";
  }
}

/** Par cookie=valor del Set-Cookie de /csrf que trae el token (el nombre cambia en producción). */
function csrfCookiePair(response: Response, token: string): string | null {
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(";")[0] ?? "";
    if (pair.slice(pair.indexOf("=") + 1) === token) return pair;
  }
  return null;
}

export interface PostApiOptions {
  /**
   * Cookie de sesión que la API usa para atar el CSRF (p. ej. la del carrito,
   * "tk_carrito=…"). Va en /csrf y en el envío.
   */
  sessionCookie?: string;
  /** Cabeceras extra (Idempotency-Key, X-Order-Access…). */
  headers?: Record<string, string>;
  timeoutMs?: number;
}

/** POST JSON a la API con un token CSRF recién emitido. */
export async function postApiForm(
  path: `/${string}`,
  body: unknown,
  options: PostApiOptions = {},
): Promise<ApiFormResult> {
  const context = await requestContext();
  const session = options.sessionCookie ?? "";
  try {
    const csrf = await apiFetch("/api/v1/csrf", {
      ...context,
      headers: session ? { cookie: session } : {},
    });
    const { csrfToken } = (await csrf.json()) as { csrfToken?: unknown };
    const pair = typeof csrfToken === "string" ? csrfCookiePair(csrf, csrfToken) : null;
    if (typeof csrfToken !== "string" || !pair) throw new Error("Respuesta de /csrf inválida");

    const response = await apiFetch(`/api/v1${path}`, {
      ...context,
      method: "POST",
      ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {}),
      headers: {
        ...options.headers,
        "content-type": "application/json",
        cookie: [session, pair].filter(Boolean).join("; "),
        "x-csrf-token": csrfToken,
      },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    return { status: response.status, body: text ? (JSON.parse(text) as unknown) : null };
  } catch (error) {
    throw new ApiUnavailableError(error);
  }
}

/** Mensaje de la API en una respuesta de error ({ code, message, … }), si lo trae. */
export function apiErrorMessage(body: unknown): string | null {
  const message = (body as { message?: unknown } | null)?.message;
  return typeof message === "string" ? message : null;
}

/** Mensajes para el visitante cuando la API no acepta el envío. */
export const FORM_MESSAGES = {
  unavailable: "No pudimos enviar el formulario. Intenta de nuevo en unos minutos.",
  tooMany: "Recibimos muchos envíos desde tu conexión. Intenta de nuevo en unos minutos.",
};

/** Mensaje general para un estado que no es éxito ni error de validación. */
export function generalFormError(result: ApiFormResult): string {
  return result.status === 429 ? FORM_MESSAGES.tooMany : FORM_MESSAGES.unavailable;
}
