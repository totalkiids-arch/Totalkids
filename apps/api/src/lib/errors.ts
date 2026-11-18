/** Formato estándar de error de la API. */
export interface ErrorBody {
  code: string;
  message: string;
  details: unknown;
  requestId: string;
}

/** Error de aplicación con código HTTP y código legible por máquina. */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details: unknown = null,
  ) {
    super(message);
    this.name = "AppError";
  }
}
