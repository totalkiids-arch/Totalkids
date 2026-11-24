/**
 * Errores de la API traducidos al panel. Puro (sin Next.js): lo usan el cliente
 * BFF del panel (shared/infrastructure/panel-api.ts), los adaptadores api-* y la
 * interfaz para elegir el mensaje.
 *
 * La API responde { code, message, details, requestId } (SRS 4.4.2):
 * - 422 trae details.issues[{ location, path, message }] (un issue por campo),
 * - 429 trae details.retryAfterSeconds y la cabecera Retry-After.
 */
export type PanelErrorKind =
  | "unauthorized"
  | "forbidden"
  | "not-found"
  | "conflict"
  | "validation"
  | "rate-limited"
  | "unavailable";

export class PanelApiError extends Error {
  readonly kind: PanelErrorKind;
  readonly status: number | null;
  /** Mensaje por campo (path del issue → mensaje), solo en 422. */
  readonly fieldErrors: Record<string, string>;
  readonly retryAfterSeconds: number | null;
  readonly requestId: string | null;

  constructor(
    kind: PanelErrorKind,
    message: string,
    extra: {
      status?: number | null;
      fieldErrors?: Record<string, string>;
      retryAfterSeconds?: number | null;
      requestId?: string | null;
      cause?: unknown;
    } = {},
  ) {
    super(message, { cause: extra.cause });
    this.name = "PanelApiError";
    this.kind = kind;
    this.status = extra.status ?? null;
    this.fieldErrors = extra.fieldErrors ?? {};
    this.retryAfterSeconds = extra.retryAfterSeconds ?? null;
    this.requestId = extra.requestId ?? null;
  }
}

export function isPanelApiError(error: unknown): error is PanelApiError {
  return error instanceof PanelApiError;
}

export const PANEL_MESSAGES = {
  unauthorized: "Tu sesión terminó. Ingresa de nuevo.",
  forbidden: "No tienes permiso para esta acción.",
  notFound: "No encontramos lo que buscabas. Puede que ya no exista.",
  conflict: "Los datos cambiaron mientras trabajabas. Recarga la página e intenta de nuevo.",
  validation: "Revisa los datos marcados.",
  rateLimited: "Demasiados intentos. Espera unos minutos e intenta de nuevo.",
  unavailable: "No pudimos conectar con el servidor del panel. Intenta de nuevo en unos minutos.",
} as const;

interface ApiErrorBody {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  requestId?: unknown;
}

function fieldErrorsFrom(details: unknown): Record<string, string> {
  const issues = (details as { issues?: unknown } | null)?.issues;
  const errors: Record<string, string> = {};
  if (!Array.isArray(issues)) return errors;
  for (const issue of issues as { path?: unknown; message?: unknown }[]) {
    const path = typeof issue.path === "string" && issue.path ? issue.path : "form";
    if (typeof issue.message === "string" && !(path in errors)) errors[path] = issue.message;
  }
  return errors;
}

function retryAfterFrom(details: unknown, header: string | null): number | null {
  const fromBody = (details as { retryAfterSeconds?: unknown } | null)?.retryAfterSeconds;
  if (typeof fromBody === "number" && fromBody > 0) return Math.ceil(fromBody);
  const fromHeader = Number(header);
  return Number.isFinite(fromHeader) && fromHeader > 0 ? Math.ceil(fromHeader) : null;
}

/** Traduce una respuesta de error de la API (status ≥ 400) a PanelApiError. */
export function fromApiResponse(
  status: number,
  body: unknown,
  retryAfterHeader: string | null = null,
): PanelApiError {
  const data = (body ?? {}) as ApiErrorBody;
  const apiMessage = typeof data.message === "string" ? data.message : null;
  const requestId = typeof data.requestId === "string" ? data.requestId : null;
  const base = { status, requestId };

  switch (status) {
    case 401:
      return new PanelApiError("unauthorized", apiMessage ?? PANEL_MESSAGES.unauthorized, base);
    case 403:
      // CSRF_FAILED también es 403, pero con otro sentido: el formulario quedó viejo.
      if (data.code === "CSRF_FAILED")
        return new PanelApiError(
          "conflict",
          "El formulario venció. Recarga la página e intenta de nuevo.",
          base,
        );
      return new PanelApiError("forbidden", PANEL_MESSAGES.forbidden, base);
    case 404:
      return new PanelApiError("not-found", apiMessage ?? PANEL_MESSAGES.notFound, base);
    case 409:
      return new PanelApiError("conflict", apiMessage ?? PANEL_MESSAGES.conflict, base);
    case 422:
      return new PanelApiError("validation", apiMessage ?? PANEL_MESSAGES.validation, {
        ...base,
        fieldErrors: fieldErrorsFrom(data.details),
      });
    case 429: {
      const retryAfterSeconds = retryAfterFrom(data.details, retryAfterHeader);
      return new PanelApiError("rate-limited", rateLimitMessage(retryAfterSeconds), {
        ...base,
        retryAfterSeconds,
      });
    }
    default:
      // 400, 413, 415 o 5xx: para el equipo es lo mismo, no se pudo completar.
      if (status >= 500) return new PanelApiError("unavailable", PANEL_MESSAGES.unavailable, base);
      return new PanelApiError("conflict", apiMessage ?? PANEL_MESSAGES.conflict, base);
  }
}

/** «Demasiados intentos. Espera N minutos…», con los minutos que pide la API. */
export function rateLimitMessage(retryAfterSeconds: number | null): string {
  if (!retryAfterSeconds) return PANEL_MESSAGES.rateLimited;
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return `Demasiados intentos. Espera ${minutes} ${minutes === 1 ? "minuto" : "minutos"} e intenta de nuevo.`;
}

/** La API no respondió (timeout, caída o red). */
export function unavailableError(cause?: unknown): PanelApiError {
  return new PanelApiError("unavailable", PANEL_MESSAGES.unavailable, { cause });
}

/** Mensaje para mostrar al equipo a partir de cualquier error. */
export function panelErrorMessage(error: unknown): string {
  return isPanelApiError(error) ? error.message : PANEL_MESSAGES.unavailable;
}
