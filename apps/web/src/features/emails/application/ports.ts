import type { EmailDetail, EmailPage, EmailQuery, ResendOutcome } from "../domain/email-log";

/**
 * Puerto: registro de correos transaccionales (RF-20, RF-21; `email_log` de la
 * SRS 4.4.3). Lo implementa la API: GET /admin/emails y /admin/emails/{id}
 * (Administrador y Operador; el Operador no ve recuperaciones ni bajas) y
 * POST /admin/emails/{id}/resend (solo Administrador).
 */
export interface EmailLog {
  list(query: EmailQuery): Promise<EmailPage>;
  /** null si no existe o no es visible para el rol. */
  get(id: string): Promise<EmailDetail | null>;
  /** Reenvío manual auditado (lo encola la API). No modifica pedidos ni solicitudes. */
  resend(id: string): Promise<ResendOutcome>;
}
