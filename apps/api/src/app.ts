import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";

import { parseTrustProxy, type Env } from "./config/env.js";
import { httpLogger, type Logger } from "./lib/logger.js";
import type { PrismaClient } from "./lib/prisma.js";
import { errorHandler, notFound } from "./middleware/error-handler.js";
import { requestId } from "./middleware/request-id.js";
import { docsRouter } from "./routes/docs.js";
import { healthRouter } from "./routes/health.js";

export interface AppDeps {
  env: Pick<Env, "CORS_ORIGINS" | "TRUST_PROXY">;
  logger: Logger;
  prisma: Pick<PrismaClient, "$queryRaw">;
}

export function createApp({ env, logger, prisma }: AppDeps): Express {
  const app = express();

  // La API recibe tráfico a través de Next.js: confiar en X-Forwarded-For del proxy
  // para que req.ip (y express-rate-limit, cuando se configure) vean la IP real.
  app.set("trust proxy", parseTrustProxy(env.TRUST_PROXY));
  app.disable("x-powered-by");

  app.use(requestId);
  app.use(httpLogger(logger));
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGINS }));
  app.use(express.json({ limit: "1mb" }));

  const v1 = express.Router();
  v1.use(healthRouter(prisma));
  app.use("/api/v1", v1);

  app.use("/api/docs", docsRouter());

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
