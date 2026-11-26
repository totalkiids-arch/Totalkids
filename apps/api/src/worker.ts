import { loadEnv } from "./config/env.js";
import { createLogger } from "./lib/logger.js";
import { createPrismaClient } from "./lib/prisma.js";
import { purgeExpiredCarts } from "./services/cart/session.js";
import { createEmailSender } from "./services/email/create-sender.js";
import { createEmailWorker } from "./services/email/worker.js";
import { createFlowClient } from "./services/flow/client.js";
import { parseFlowConfig } from "./services/flow/config.js";
import { createPaymentJobs } from "./services/reconciliation/job.js";

/**
 * Proceso del worker (LN-14, LN-15), separado de la API: correos, conciliación
 * de pagos con Flow, vencimiento de pedidos y limpieza de carritos.
 *
 *   pnpm --filter @totalkids/api worker:dev   # desarrollo (EMAIL_PROVIDER=fake por defecto)
 *   pnpm --filter @totalkids/api worker       # producción (tras build)
 *
 * Se puede correr más de una instancia: correos y pagos se reclaman con
 * FOR UPDATE SKIP LOCKED, y cada cambio de un pedido se hace con su fila bloqueada.
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
    // Plan gratis de Brevo: 300 correos al día, con reserva para los críticos.
    dailyQuota: {
      limit: env.EMAIL_DAILY_LIMIT,
      reserve: env.EMAIL_DAILY_RESERVE,
      adminEmail: env.EMAIL_ADMIN_TO,
    },
    storeContact: env.STORE_CONTACT ?? null,
  },
});

worker.start();

// Conciliación con Flow y vencimientos (LN-15; RF-18, RF-33, RN-04).
const flowConfig = parseFlowConfig(process.env);
if (!flowConfig) {
  logger.warn(
    "Flow sin configurar: solo se vencen pedidos sin pago iniciado; los pagos abiertos quedan en revisión",
  );
}
const paymentJobs = createPaymentJobs({
  prisma,
  flow: flowConfig && createFlowClient(flowConfig),
  logger,
  adminEmail: env.EMAIL_ADMIN_TO,
  config: { batchSize: env.PAYMENT_JOB_BATCH, intervalMs: env.PAYMENT_JOB_INTERVAL_MS },
});
paymentJobs.start();

// Limpieza de carritos vencidos (LN-06), aparte del bucle de correos. Si hay
// varias instancias, todas pueden borrar: el DELETE es idempotente.
const CART_PURGE_INTERVAL_MS = 60 * 60 * 1000;
async function purgeCarts() {
  try {
    const count = await purgeExpiredCarts(prisma);
    if (count > 0) logger.info({ count }, "Carritos vencidos borrados");
  } catch (err) {
    logger.error({ err }, "No se pudieron borrar los carritos vencidos");
  }
}
void purgeCarts();
const cartPurgeTimer = setInterval(() => void purgeCarts(), CART_PURGE_INTERVAL_MS);
cartPurgeTimer.unref();

let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(cartPurgeTimer);
  logger.info(`${signal} recibido, deteniendo el worker`);
  // Termina el lote en curso (no deja envíos ni conciliaciones a medias) y no toma más.
  await Promise.all([worker.stop(), paymentJobs.stop()]);
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
