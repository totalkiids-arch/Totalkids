import { randomUUID } from "node:crypto";

import type { Logger } from "../../lib/logger.js";
import type { PrismaClient } from "../../lib/prisma.js";
import type { FlowClient } from "../flow/client.js";
import { expireOrder } from "./expire.js";
import { reconcilePayment, type ReconcileOutcome } from "./reconcile.js";
import { CLAIM_LEASE_MS, STALE_PENDING_MS } from "./rules.js";

/**
 * Job durable de vencimientos y conciliación (LN-15; RF-18, RF-33, RN-04),
 * dentro del worker (`src/worker.ts`). Todo el estado vive en PostgreSQL: un
 * reinicio no pierde nada. Se pueden correr varias instancias:
 *
 * a. Conciliación: reclama intentos `pending`/`in_review` que toca consultar
 *    (`next_check_at` vencido o nulo) y que estén vencidos, sean antiguos o
 *    estén en revisión. El reclamo es un UPDATE con `FOR UPDATE SKIP LOCKED`
 *    que corre `next_check_at` un plazo corto: dos workers nunca consultan el
 *    mismo intento a la vez. Cada uno se concilia con `reconcilePayment`.
 * b. Vencimiento: los pedidos `pending_payment` con el plazo vencido y SIN
 *    intento abierto se vencen de a uno, cada uno en su transacción con la fila
 *    tomada con `FOR UPDATE SKIP LOCKED`. Los que tienen un intento abierto
 *    nunca se vencen sin consultar a Flow: pasan por (a).
 *
 * Cada cambio vuelve a comprobar el estado con el pedido bloqueado y los
 * correos usan una clave única: correrlo dos veces no duplica nada.
 */

export interface PaymentJobsConfig {
  batchSize: number;
  intervalMs: number;
  leaseMs?: number;
  /**
   * Solo pedidos de este comprador (correo exacto). Para tests contra una base
   * compartida; en operación normal no se usa.
   */
  scopeBuyerEmail?: string;
}

export interface PaymentJobsDeps {
  prisma: PrismaClient;
  flow: FlowClient | null;
  logger: Logger;
  adminEmail: string;
  config: PaymentJobsConfig;
  /** Reloj inyectable (tests). */
  now?: () => Date;
}

export interface PaymentJobsRun {
  /** Intentos consultados y su resultado. */
  reconciled: { paymentId: string; outcome: ReconcileOutcome | "error" }[];
  /** Pedidos vencidos sin intento abierto. */
  expired: number;
}

export interface PaymentJobs {
  runOnce(): Promise<PaymentJobsRun>;
  start(): void;
  stop(): Promise<void>;
}

export function createPaymentJobs(deps: PaymentJobsDeps): PaymentJobs {
  const { prisma, logger, config } = deps;
  const now = deps.now ?? (() => new Date());
  const lease = config.leaseMs ?? CLAIM_LEASE_MS;
  const scope = config.scopeBuyerEmail ?? null;

  async function claimPayments(): Promise<string[]> {
    const at = now();
    const leaseUntil = new Date(at.getTime() + lease);
    const staleBefore = new Date(at.getTime() - STALE_PENDING_MS);
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      UPDATE "payments" AS p
      SET "next_check_at" = ${leaseUntil}, "updated_at" = ${at}
      WHERE p."id" IN (
        SELECT c."id" FROM "payments" c
        JOIN "orders" o ON o."id" = c."order_id"
        WHERE c."status" IN ('pending', 'in_review')
          AND (c."next_check_at" IS NULL OR c."next_check_at" <= ${at})
          AND (c."status" = 'in_review' OR o."payment_due_at" <= ${at}
               OR c."created_at" <= ${staleBefore})
          AND (${scope}::text IS NULL OR o."buyer_email" = ${scope}::text)
        ORDER BY c."next_check_at" NULLS FIRST, c."created_at", c."id"
        LIMIT ${config.batchSize}
        FOR UPDATE OF c SKIP LOCKED
      )
      RETURNING p."id"`;
    return rows.map((r) => r.id);
  }

  /** Vence un pedido sin intento abierto; false si no quedaba ninguno por vencer. */
  async function expireNext(): Promise<boolean> {
    const at = now();
    return prisma.$transaction(
      async (tx) => {
        const [row] = await tx.$queryRaw<{ id: string }[]>`
          SELECT o."id" FROM "orders" o
          WHERE o."status" = 'pending_payment' AND o."payment_due_at" <= ${at}
            AND NOT EXISTS (
              SELECT 1 FROM "payments" p
              WHERE p."order_id" = o."id" AND p."status" IN ('pending', 'in_review')
            )
            AND (${scope}::text IS NULL OR o."buyer_email" = ${scope}::text)
          ORDER BY o."payment_due_at", o."id"
          LIMIT 1
          FOR UPDATE SKIP LOCKED`;
        if (!row) return false;
        const expired = await expireOrder(tx, row.id, {
          now: at,
          reason: "Plazo de pago vencido sin un pago iniciado",
        });
        if (expired) logger.info({ orderId: row.id }, "Pedido vencido");
        return true;
      },
      { timeout: 15_000 },
    );
  }

  async function runOnce(): Promise<PaymentJobsRun> {
    const reconciled: PaymentJobsRun["reconciled"] = [];
    for (const paymentId of await claimPayments()) {
      try {
        const { outcome } = await reconcilePayment(
          { prisma, flow: deps.flow, adminEmail: deps.adminEmail, logger },
          paymentId,
          { now: now() },
        );
        reconciled.push({ paymentId, outcome });
      } catch (error) {
        // El reclamo vence solo: se reintenta en la próxima vuelta.
        const name = error instanceof Error ? error.name : "Error";
        logger.error({ paymentId, err: { name } }, "No se pudo conciliar el pago");
        reconciled.push({ paymentId, outcome: "error" });
      }
    }
    let expired = 0;
    for (let i = 0; i < config.batchSize; i += 1) {
      if (!(await expireNext())) break;
      expired += 1;
    }
    return { reconciled, expired };
  }

  // ── Bucle y apagado limpio ───────────────────────────────────────────────────

  const runId = randomUUID().slice(0, 8);
  let loop: Promise<void> | null = null;
  let stopping = false;
  let wake: (() => void) | null = null;

  const pause = (ms: number) =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, ms);
      wake = () => {
        clearTimeout(timer);
        resolve();
      };
    });

  return {
    runOnce,
    start() {
      if (loop) return;
      stopping = false;
      loop = (async () => {
        logger.info({ runId, flow: deps.flow !== null }, "Job de pagos y vencimientos iniciado");
        while (!stopping) {
          try {
            const run = await runOnce();
            if (run.reconciled.length || run.expired) {
              logger.info(
                { reconciled: run.reconciled.length, expired: run.expired },
                "Vuelta de conciliación y vencimientos",
              );
            }
          } catch (error) {
            const name = error instanceof Error ? error.name : "Error";
            logger.error({ err: { name } }, "Error en la vuelta de conciliación y vencimientos");
          }
          if (!stopping) await pause(config.intervalMs);
        }
        logger.info({ runId }, "Job de pagos y vencimientos detenido");
      })();
    },
    async stop() {
      stopping = true;
      wake?.();
      await loop;
      loop = null;
    },
  };
}
