-- CreateEnum
CREATE TYPE "service_request_status" AS ENUM ('new', 'in_progress', 'resolved');

-- CreateEnum
CREATE TYPE "subscriber_status" AS ENUM ('active', 'unsubscribed');

-- CreateEnum
CREATE TYPE "outbox_status" AS ENUM ('pending', 'processing', 'done', 'failed', 'dead');

-- CreateEnum
CREATE TYPE "email_event" AS ENUM ('order_received', 'purchase_confirmed', 'new_sale', 'payment_rejected', 'order_shipped', 'order_delivered', 'service_request', 'password_recovery');

-- CreateEnum
CREATE TYPE "email_status" AS ENUM ('pending', 'sent', 'failed', 'uncertain');

-- CreateEnum
CREATE TYPE "email_attempt_kind" AS ENUM ('automatic', 'manual');

-- CreateEnum
CREATE TYPE "email_attempt_result" AS ENUM ('sent', 'failed', 'timeout');

-- CreateEnum
CREATE TYPE "idempotency_status" AS ENUM ('in_progress', 'completed');

-- CreateTable
CREATE TABLE "service_requests" (
    "id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "service" VARCHAR(40) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "phone" VARCHAR(16),
    "commune" VARCHAR(60),
    "children_ages" VARCHAR(60),
    "preferred_date" DATE,
    "message" VARCHAR(2000) NOT NULL,
    "privacy_accepted_at" TIMESTAMPTZ(3) NOT NULL,
    "privacy_version" VARCHAR(40) NOT NULL,
    "status" "service_request_status" NOT NULL DEFAULT 'new',
    "internal_note" VARCHAR(1000) NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "service_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "newsletter_subscribers" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "status" "subscriber_status" NOT NULL DEFAULT 'active',
    "consented_at" TIMESTAMPTZ(3) NOT NULL,
    "consent_version" VARCHAR(40) NOT NULL,
    "unsubscribe_token_hash" VARCHAR(128) NOT NULL,
    "unsubscribed_at" TIMESTAMPTZ(3),
    "unsubscribed_by" VARCHAR(120),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "newsletter_subscribers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_jobs" (
    "id" UUID NOT NULL,
    "type" VARCHAR(60) NOT NULL,
    "event_key" VARCHAR(160) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "outbox_status" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 4,
    "next_run_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_at" TIMESTAMPTZ(3),
    "locked_by" VARCHAR(80),
    "last_error" VARCHAR(1000),
    "processed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "outbox_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_log" (
    "id" UUID NOT NULL,
    "event" "email_event" NOT NULL,
    "recipient" VARCHAR(254) NOT NULL,
    "event_key" VARCHAR(160) NOT NULL,
    "status" "email_status" NOT NULL DEFAULT 'pending',
    "provider_message_id" VARCHAR(120),
    "order_id" UUID,
    "service_request_id" UUID,
    "outbox_job_id" UUID,
    "resend_of_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "email_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_attempts" (
    "id" UUID NOT NULL,
    "email_id" UUID NOT NULL,
    "kind" "email_attempt_kind" NOT NULL,
    "result" "email_attempt_result" NOT NULL,
    "actor_user_id" UUID,
    "actor_label" VARCHAR(120),
    "detail" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID,
    "actor_label" VARCHAR(120) NOT NULL,
    "action" VARCHAR(80) NOT NULL,
    "resource_type" VARCHAR(40) NOT NULL,
    "resource_id" VARCHAR(60) NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "reason" VARCHAR(500),
    "request_id" VARCHAR(100),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "id" UUID NOT NULL,
    "scope" VARCHAR(80) NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "request_hash" VARCHAR(128) NOT NULL,
    "status" "idempotency_status" NOT NULL DEFAULT 'in_progress',
    "response_status" INTEGER,
    "response_body" JSONB,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "service_requests_number_key" ON "service_requests"("number");

-- CreateIndex
CREATE INDEX "service_requests_status_created_at_idx" ON "service_requests"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "newsletter_subscribers_email_key" ON "newsletter_subscribers"("email");

-- CreateIndex
CREATE UNIQUE INDEX "newsletter_subscribers_unsubscribe_token_hash_key" ON "newsletter_subscribers"("unsubscribe_token_hash");

-- CreateIndex
CREATE INDEX "newsletter_subscribers_status_idx" ON "newsletter_subscribers"("status");

-- CreateIndex
CREATE UNIQUE INDEX "outbox_jobs_event_key_key" ON "outbox_jobs"("event_key");

-- CreateIndex
CREATE INDEX "outbox_jobs_status_next_run_at_idx" ON "outbox_jobs"("status", "next_run_at");

-- CreateIndex
CREATE UNIQUE INDEX "email_log_event_key_key" ON "email_log"("event_key");

-- CreateIndex
CREATE INDEX "email_log_status_created_at_idx" ON "email_log"("status", "created_at");

-- CreateIndex
CREATE INDEX "email_log_order_id_idx" ON "email_log"("order_id");

-- CreateIndex
CREATE INDEX "email_log_service_request_id_idx" ON "email_log"("service_request_id");

-- CreateIndex
CREATE INDEX "email_attempts_email_id_created_at_idx" ON "email_attempts"("email_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_log_resource_type_resource_id_created_at_idx" ON "audit_log"("resource_type", "resource_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_log_actor_user_id_created_at_idx" ON "audit_log"("actor_user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_log_created_at_idx" ON "audit_log"("created_at");

-- CreateIndex
CREATE INDEX "idempotency_records_expires_at_idx" ON "idempotency_records"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_scope_key_key" ON "idempotency_records"("scope", "key");

-- AddForeignKey
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_service_request_id_fkey" FOREIGN KEY ("service_request_id") REFERENCES "service_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_outbox_job_id_fkey" FOREIGN KEY ("outbox_job_id") REFERENCES "outbox_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_resend_of_id_fkey" FOREIGN KEY ("resend_of_id") REFERENCES "email_log"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_attempts" ADD CONSTRAINT "email_attempts_email_id_fkey" FOREIGN KEY ("email_id") REFERENCES "email_log"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_attempts" ADD CONSTRAINT "email_attempts_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Integridad que Prisma no expresa (SRS 4.4.3, 4.5). Agregada a mano.
-- ─────────────────────────────────────────────────────────────────────────────

-- Las referencias visibles de solicitudes parten en SOL-1001.
ALTER SEQUENCE "service_requests_number_seq" RESTART WITH 1001;

-- ── Solicitudes de servicio ──────────────────────────────────────────────────

ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_email_lowercase" CHECK ("email" = lower("email"));
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_service_format" CHECK ("service" ~ '^[a-z]+(-[a-z]+)*$');
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_message_length" CHECK (length(trim("message")) BETWEEN 10 AND 2000);

-- ── Newsletter ───────────────────────────────────────────────────────────────

ALTER TABLE "newsletter_subscribers" ADD CONSTRAINT "newsletter_subscribers_email_lowercase" CHECK ("email" = lower("email"));
-- Una baja tiene fecha y responsable; un suscriptor activo no los tiene.
ALTER TABLE "newsletter_subscribers" ADD CONSTRAINT "newsletter_subscribers_unsubscribe_data" CHECK (
  ("status" = 'unsubscribed') = ("unsubscribed_at" IS NOT NULL AND "unsubscribed_by" IS NOT NULL)
);

-- ── Outbox ───────────────────────────────────────────────────────────────────

ALTER TABLE "outbox_jobs" ADD CONSTRAINT "outbox_jobs_attempts_range" CHECK (
  "max_attempts" >= 1 AND "attempts" BETWEEN 0 AND "max_attempts"
);
-- Un trabajo en proceso está bloqueado por un worker; uno terminado tiene fecha.
ALTER TABLE "outbox_jobs" ADD CONSTRAINT "outbox_jobs_processing_locked" CHECK (
  "status" <> 'processing' OR ("locked_at" IS NOT NULL AND "locked_by" IS NOT NULL)
);
ALTER TABLE "outbox_jobs" ADD CONSTRAINT "outbox_jobs_done_has_date" CHECK ("status" <> 'done' OR "processed_at" IS NOT NULL);

-- ── Correos ──────────────────────────────────────────────────────────────────

ALTER TABLE "email_log" ADD CONSTRAINT "email_log_recipient_lowercase" CHECK ("recipient" = lower("recipient"));
-- Referencia opcional: a lo más un pedido o una solicitud, no ambos.
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_single_reference" CHECK (
  "order_id" IS NULL OR "service_request_id" IS NULL
);
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_not_own_resend" CHECK ("resend_of_id" IS NULL OR "resend_of_id" <> "id");
-- Un intento manual (reenvío) siempre tiene responsable.
ALTER TABLE "email_attempts" ADD CONSTRAINT "email_attempts_manual_has_actor" CHECK (
  "kind" <> 'manual' OR "actor_label" IS NOT NULL
);

-- ── Auditoría e idempotencia ─────────────────────────────────────────────────

ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_action_format" CHECK ("action" ~ '^[a-z_]+\.[a-z_]+$');
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_details_object" CHECK (jsonb_typeof("details") = 'object');

-- El historial de auditoría no se modifica ni se borra: solo se agregan entradas.
CREATE FUNCTION "audit_log_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log solo admite inserciones: no se modifica ni se borra'
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER "audit_log_append_only"
  BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION "audit_log_append_only"();

-- Una respuesta guardada es completa: estado HTTP y cuerpo.
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_completed_response" CHECK (
  "status" <> 'completed' OR ("response_status" BETWEEN 100 AND 599)
);
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_expiry_after_creation" CHECK ("expires_at" > "created_at");
