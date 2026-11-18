import type { IncomingMessage, ServerResponse } from "node:http";

import { pino, type DestinationStream } from "pino";
import { pinoHttp } from "pino-http";

/** Rutas que nunca deben llegar a los logs (credenciales, tokens, cookies). */
const REDACT_PATHS = [
  "req.headers.cookie",
  "req.headers.authorization",
  'res.headers["set-cookie"]',
  "*.password",
  "*.token",
  "*.refreshToken",
  "*.accessToken",
];

export function createLogger(level: string, pretty: boolean, destination?: DestinationStream) {
  const options = {
    level,
    redact: { paths: REDACT_PATHS, censor: "[REDACTED]" },
    ...(pretty ? { transport: { target: "pino-pretty", options: { colorize: true } } } : {}),
  };
  return destination ? pino(options, destination) : pino(options);
}

export type Logger = ReturnType<typeof createLogger>;

/** Prefijos cuyas peticiones no se registran (archivos estáticos de Swagger UI). */
const IGNORED_PREFIXES = ["/api/docs"];

/**
 * Middleware de log HTTP: una línea compacta por petición (método, URL, estado,
 * tiempo y requestId). No registra headers para no filtrar cookies ni tokens.
 */
export function httpLogger(logger: Logger) {
  return pinoHttp({
    logger,
    genReqId: (req) => String(req.id),
    autoLogging: {
      ignore: (req) => IGNORED_PREFIXES.some((prefix) => req.url?.startsWith(prefix)),
    },
    serializers: {
      req: (req: { id: unknown; method: string; url: string }) => ({
        id: req.id,
        method: req.method,
        url: req.url,
      }),
      res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
    },
    customSuccessMessage: summary,
    customErrorMessage: summary,
  });
}

/** "GET /api/v1/health 200". Usa originalUrl: los routers de Express reescriben req.url. */
function summary(req: IncomingMessage & { originalUrl?: string }, res: ServerResponse): string {
  return `${req.method} ${req.originalUrl ?? req.url} ${res.statusCode}`;
}
