-- LN-15: conciliación y vencimientos (RF-18, RF-33, RN-04 a RN-06).
-- Los valores nuevos de los enums no se usan en esta migración: PostgreSQL no
-- permite usarlos en la misma transacción en que se agregan.

-- Pago cobrado por Flow que no se puede aplicar al pedido (doble cobro o
-- discrepancia): queda a la espera de una devolución manual. No cuenta como cobro.
ALTER TYPE "payment_status" ADD VALUE 'refund_pending';

-- Alerta al equipo por un pedido o pago en revisión (RN-04, RN-05, A4).
ALTER TYPE "email_event" ADD VALUE 'payment_review_alert';

-- Conciliación periódica con backoff: consultas inciertas seguidas y próxima consulta.
ALTER TABLE "payments" ADD COLUMN "reconcile_attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "payments" ADD COLUMN "next_check_at" TIMESTAMPTZ(3);
ALTER TABLE "payments" ADD CONSTRAINT "payments_reconcile_attempts_nonnegative" CHECK ("reconcile_attempts" >= 0);
CREATE INDEX "payments_status_next_check_at_idx" ON "payments"("status", "next_check_at");
