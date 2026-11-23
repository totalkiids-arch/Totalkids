import { loadEnv } from "./config/env.js";
import { createLogger } from "./lib/logger.js";
import { createPrismaClient } from "./lib/prisma.js";
import { createEmailSender } from "./services/email/create-sender.js";
import { createEmailWorker } from "./services/email/worker.js";

/**
 * Proceso del worker de correos (LN-14), separado de la API:
 *
 *   pnpm --filter @totalkids/api worker:dev   # desarrollo (EMAIL_PROVIDER=fake por defecto)
 *   pnpm --filter @totalkids/api worker       # producción (tras build)
 *
 * Se puede correr más de una instancia: el reclamo usa FOR UPDATE SKIP LOCKED.
 */

const env = loadEnv();
const logger = createLogger(env.LOG_LEVEL, env.NODE_ENV === "development");
const prisma = createPrismaClient(env.DATABASE_URL);
const sender = createEmailSender(env, logger);

if (env.NODE_ENV === "production" && sender.name === "fake") {
  logger.warn("EMAIL_PROVIDER=fake en producción: los correos NO se envían");
}

const worker = createEmailWorker({
  prisma,
  sender,
  logger,
  config: {
    siteUrl: env.PUBLIC_SITE_URL,
    batchSize: env.EMAIL_WORKER_BATCH,
    pollIntervalMs: env.EMAIL_WORKER_POLL_MS,
    lockTimeoutMs: env.EMAIL_WORKER_LOCK_TIMEOUT_MS,
  },
});

worker.start();

let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} recibido, deteniendo el worker de correos`);
  // Termina el lote en curso (no deja envíos a medias) y no toma más.
  await worker.stop();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
