import type { EmailRecord, ResendOutcome } from "../domain/email-log";

/**
 * Puerto: registro de correos transaccionales (RF-20, RF-21; `email_log` de la
 * SRS 4.4.3). Con la API (LN-14/LN-16): consulta del registro y
 * POST /admin/emails/{id}/resend, solo Administrador.
 */
export interface EmailLog {
  list(): Promise<EmailRecord[]>;
  get(id: string): Promise<EmailRecord | null>;
  /** Reenvío manual auditado. No modifica pedidos ni solicitudes. */
  resend(id: string, actor: string): Promise<ResendOutcome>;
}
