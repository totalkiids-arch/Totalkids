import { loadEnv } from "./config/env.js";
import { createLogger } from "./lib/logger.js";
import { createPrismaClient } from "./lib/prisma.js";
import { purgeExpiredCarts } from "./services/cart/session.js";
import { createEmailSender } from "./services/email/create-sender.js";
import { createEmailWorker } from "./services/email/worker.js";
import { createFlowClient } from "./services/flow/client.js";
import { parseFlowConfig } from "./services/flow/config.js";
import { RECONCILE_INTERVAL_MS, runReconciliation } from "./services/flow/reconcile.js";

/**
 * Proceso del worker, separado de la API: correos (LN-14), limpieza de carritos
 * (LN-06) y conciliación y vencimientos (LN-15):
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

// Conciliación con Flow y vencimientos (LN-15), cada 2 min y sin solaparse.
const flowConfig = parseFlowConfig(process.env);
if (!flowConfig) logger.warn("Flow sin configurar: solo se vencen pedidos sin cobro abierto");
const flow = flowConfig && {
  client: createFlowClient(flowConfig),
  sealSecret: flowConfig.secretKey,
};
let shuttingDown = false;
let reconciling: Promise<void> | null = null;
async function reconcile() {
  try {
    const run = await runReconciliation(prisma, flow, {
      adminEmail: env.EMAIL_ADMIN_TO,
      logger,
      shouldStop: () => shuttingDown,
    });
    if (run.reconciled + run.expired + run.failed > 0) logger.info(run, "Conciliación de pagos");
  } catch (err) {
    logger.error({ err }, "No se pudo conciliar los pagos");
  }
}
function startReconciliation() {
  reconciling ??= reconcile().finally(() => {
    reconciling = null;
  });
}
startReconciliation();
const reconcileTimer = setInterval(startReconciliation, RECONCILE_INTERVAL_MS);
reconcileTimer.unref();

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(cartPurgeTimer);
  clearInterval(reconcileTimer);
  logger.info(`${signal} recibido, deteniendo el worker`);
  // Termina el lote en curso (no deja envíos a medias) y no toma más.
  await worker.stop();
  await reconciling;
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
