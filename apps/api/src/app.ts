import { randomBytes } from "node:crypto";

import cors from "cors";
import express, { type Express, type Router } from "express";
import helmet from "helmet";

import { DEV_IMAGES_URL, parseTrustProxy, type Env } from "./config/env.js";
import { httpLogger, type Logger } from "./lib/logger.js";
import type { PrismaClient } from "./lib/prisma.js";
import { bodyParsers, isFlowCallbackPath, requireContentType } from "./middleware/body.js";
import { csrfProtection, type CsrfSessionKey } from "./middleware/csrf.js";
import { createErrorHandler, notFound } from "./middleware/error-handler.js";
import { panelCsrfSessionKey, requirePanel } from "./middleware/panel-auth.js";
import { globalLimiter } from "./middleware/rate-limit.js";
import { requestId } from "./middleware/request-id.js";
import { adminCatalogRouter } from "./routes/admin-catalog.js";
import { adminEmailsRouter } from "./routes/admin-emails.js";
import { authRouter } from "./routes/auth.js";
import { catalogRouter } from "./routes/catalog.js";
import { csrfRouter } from "./routes/csrf.js";
import { docsRouter } from "./routes/docs.js";
import { healthRouter } from "./routes/health.js";
import { LocalDiskImageStorage } from "./services/images/local-disk.js";
import type { ImageStorage } from "./services/images/storage.js";

export interface AppDeps {
  env: Pick<
    Env,
    | "NODE_ENV"
    | "CORS_ORIGINS"
    | "TRUST_PROXY"
    | "RATE_LIMIT_WINDOW_MS"
    | "RATE_LIMIT_MAX"
    | "CSRF_SECRET"
    | "API_DOCS"
  > &
    Partial<Pick<Env, "IMAGES_DIR" | "IMAGES_PUBLIC_URL">>;
  logger: Logger;
  prisma: PrismaClient;
  /**
   * Punto de composición: monta routers adicionales bajo /api/v1, después de
   * todos los middlewares comunes. Lo usan los tests para rutas de prueba.
   */
  registerRoutes?: (v1: Router) => void;
  /**
   * Clave de la sesión actual a la que se ata el token CSRF. Por defecto, el hash
   * de la cookie del panel (LN-04); LN-06 le suma la del carrito.
   */
  csrfSessionKey?: CsrfSessionKey;
  /**
   * Almacenamiento de las imágenes del catálogo (LN-12). Por defecto, disco
   * local en IMAGES_DIR; los tests inyectan uno en una carpeta temporal.
   */
  imageStorage?: ImageStorage;
}

/** CSRF_SECRET es obligatorio en producción (env.ts); fuera de ella se genera uno. */
function resolveCsrfSecret(env: AppDeps["env"], logger: Logger): string {
  if (env.CSRF_SECRET) return env.CSRF_SECRET;
  if (env.NODE_ENV === "production") throw new Error("CSRF_SECRET es obligatorio en producción");
  logger.warn("CSRF_SECRET no definido: se usa uno aleatorio (los tokens caducan al reiniciar)");
  return randomBytes(32).toString("hex");
}

export function createApp({
  env,
  logger,
  prisma,
  registerRoutes,
  csrfSessionKey,
  imageStorage,
}: AppDeps): Express {
  const app = express();
  const isProduction = env.NODE_ENV === "production";
  const sessionKey = csrfSessionKey ?? panelCsrfSessionKey(isProduction);
  const csrfSecret = resolveCsrfSecret(env, logger);
  const storage =
    imageStorage ??
    new LocalDiskImageStorage(env.IMAGES_DIR ?? "uploads", env.IMAGES_PUBLIC_URL ?? DEV_IMAGES_URL);

  // La API recibe tráfico a través de Next.js: confiar en X-Forwarded-For del proxy
  // para que req.ip (y express-rate-limit) vean la IP real del navegador.
  app.set("trust proxy", parseTrustProxy(env.TRUST_PROXY));
  app.disable("x-powered-by");

  app.use(requestId);
  app.use(httpLogger(logger));
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGINS }));

  const v1 = express.Router();
  // Las respuestas de la API son por usuario o volátiles: nunca se cachean.
  v1.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  v1.use(globalLimiter(env));
  v1.use(requireContentType);
  v1.use(bodyParsers());
  v1.use(
    csrfProtection({
      secret: csrfSecret,
      isProduction,
      allowedOrigins: env.CORS_ORIGINS,
      sessionKey,
      isExempt: isFlowCallbackPath,
    }),
  );
  v1.use(healthRouter(prisma));
  v1.use(csrfRouter({ secret: csrfSecret, isProduction, sessionKey }));
  v1.use(authRouter({ prisma, isProduction }));
  v1.use(catalogRouter(prisma));
  // Panel: todo /admin exige sesión del equipo (denegar por defecto, RF-31). Cada
  // ruta agrega el rol que necesita con requireRole.
  v1.use("/admin", requirePanel(prisma, isProduction));
  v1.use(adminEmailsRouter(prisma));
  v1.use(adminCatalogRouter(prisma, storage));
  registerRoutes?.(v1);
  app.use("/api/v1", v1);

  // Imágenes subidas desde el panel: la API las sirve solo fuera de producción.
  // En producción las sirve el proxy del VPS (o un almacenamiento externo).
  if (!isProduction && storage instanceof LocalDiskImageStorage) {
    app.use("/uploads", storage.staticHandler());
  }

  // Contrato OpenAPI: activo en desarrollo; en producción solo si API_DOCS=enabled
  // (SRS 4.4.2). Deshabilitado, /api/docs cae en el 404 estándar.
  if (env.API_DOCS === "enabled") {
    app.use("/api/docs", docsRouter());
  }

  app.use(notFound);
  app.use(createErrorHandler({ isProduction }));

  return app;
}
