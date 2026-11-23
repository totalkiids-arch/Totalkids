import "server-only";

import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { apiFetch } from "./api-client";

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

async function requestContext() {
  const incoming = await headers();
  return {
    requestId: incoming.get("x-request-id") ?? randomUUID(),
    forwardedFor: incoming.get("x-forwarded-for") ?? incoming.get("x-real-ip"),
  };
}

/** Par cookie=valor del Set-Cookie de /csrf que trae el token (el nombre cambia en producción). */
function csrfCookiePair(response: Response, token: string): string | null {
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(";")[0] ?? "";
    if (pair.slice(pair.indexOf("=") + 1) === token) return pair;
  }
  return null;
}

/** POST JSON a la API con un token CSRF recién emitido. */
export async function postApiForm(path: `/${string}`, body: unknown): Promise<ApiFormResult> {
  const context = await requestContext();
  try {
    const csrf = await apiFetch("/api/v1/csrf", context);
    const { csrfToken } = (await csrf.json()) as { csrfToken?: unknown };
    const cookie = typeof csrfToken === "string" ? csrfCookiePair(csrf, csrfToken) : null;
    if (typeof csrfToken !== "string" || !cookie) throw new Error("Respuesta de /csrf inválida");

    const response = await apiFetch(`/api/v1${path}`, {
      ...context,
      method: "POST",
      headers: { "content-type": "application/json", cookie, "x-csrf-token": csrfToken },
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
