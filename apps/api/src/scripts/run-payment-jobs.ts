import { loadEnv } from "../config/env.js";
import { createLogger } from "../lib/logger.js";
import { createPrismaClient } from "../lib/prisma.js";
import { createFlowClient } from "../services/flow/client.js";
import { parseFlowConfig } from "../services/flow/config.js";
import { createPaymentJobs } from "../services/reconciliation/job.js";

/**
 * Una sola vuelta del job de conciliación y vencimientos (LN-15), sin esperar
 * al worker. Para probar a mano:
 *
 *   pnpm --filter @totalkids/api payments:run-once
 *
 * Es seguro aunque el worker esté corriendo: usa el mismo reclamo con SKIP LOCKED.
 */

const env = loadEnv();
const logger = createLogger(env.LOG_LEVEL, env.NODE_ENV === "development");
const prisma = createPrismaClient(env.DATABASE_URL);
const flowConfig = parseFlowConfig(process.env);
if (!flowConfig) logger.warn("Flow sin configurar: los pagos abiertos se tratan como inciertos");

try {
  const run = await createPaymentJobs({
    prisma,
    flow: flowConfig && createFlowClient(flowConfig),
    logger,
    adminEmail: env.EMAIL_ADMIN_TO,
    config: { batchSize: env.PAYMENT_JOB_BATCH, intervalMs: env.PAYMENT_JOB_INTERVAL_MS },
  }).runOnce();
  logger.info(
    { expired: run.expired, reconciled: run.reconciled },
    "Vuelta de conciliación y vencimientos terminada",
  );
} finally {
  await prisma.$disconnect();
}
