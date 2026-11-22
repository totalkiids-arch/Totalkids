/** Formato estándar de error de la API (SRS 4.4.2). */
export interface ErrorBody {
  code: string;
  message: string;
  details: unknown;
  requestId: string;
}

/**
 * Catálogo estable de códigos de error. Los clientes (Next.js) pueden ramificar
 * por `code`; el `message` es para personas y puede cambiar.
 */
export const ERROR_CODES = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  CSRF_FAILED: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  VALIDATION_ERROR: 422,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  DATABASE_UNAVAILABLE: 503,
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

/** Error de aplicación con código HTTP y código legible por máquina. */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details: unknown = null,
  ) {
    super(message);
    this.name = "AppError";
  }
}

function make(code: ErrorCode, defaultMessage: string) {
  return (message: string = defaultMessage, details: unknown = null) =>
    new AppError(ERROR_CODES[code], code, message, details);
}

/**
 * Fábricas para los casos habituales: `throw errors.notFound("Producto no encontrado")`.
 * El status sale del catálogo, así no se desalinean código y status.
 */
export const errors = {
  badRequest: make("BAD_REQUEST", "Solicitud inválida"),
  unauthorized: make("UNAUTHORIZED", "Debes iniciar sesión"),
  forbidden: make("FORBIDDEN", "No tienes permiso para esta acción"),
  csrfFailed: make("CSRF_FAILED", "La verificación de seguridad del formulario falló"),
  notFound: make("NOT_FOUND", "Recurso no encontrado"),
  conflict: make("CONFLICT", "El recurso cambió o ya existe"),
  validation: make("VALIDATION_ERROR", "Los datos enviados no son válidos"),
  rateLimited: make("RATE_LIMITED", "Demasiadas solicitudes, intenta más tarde"),
  internal: make("INTERNAL_ERROR", "Error interno del servidor"),
};
