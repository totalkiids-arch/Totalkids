/**
 * Puerto de envío de correos (LN-14). El worker no conoce al proveedor: recibe
 * un `EmailSender` y actúa según el resultado clasificado.
 *
 * | resultado   | cuándo                                                 | qué hace el worker                   |
 * | ----------- | ------------------------------------------------------ | ------------------------------------ |
 * | `accepted`  | el proveedor aceptó el mensaje (2xx)                   | correo `sent` con su id              |
 * | `rejected`  | error definitivo (400, 404, 422…: destinatario o datos) | correo `failed`, sin reintento       |
 * | `retryable` | 401/403 (configuración), 429, 500/502/503 o sin conexión | reintento a 1, 5 y 15 min; luego dead |
 * | `timeout`   | sin respuesta, 504 o conexión cortada tras enviar       | correo `uncertain`, sin reintento    |
 *
 * Un timeout no se reenvía a ciegas: el correo pudo haber salido (SRS 4.4.3).
 */

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Etiqueta para el proveedor (el evento: "purchase_confirmed"). */
  tag: string;
}

export type SendResult =
  | { outcome: "accepted"; messageId: string | null }
  | { outcome: "rejected"; detail: string }
  | { outcome: "retryable"; detail: string }
  | { outcome: "timeout"; detail: string };

export interface EmailSender {
  /** Nombre del adaptador para logs ("fake", "brevo"). */
  readonly name: string;
  /** Nunca lanza: todo error queda clasificado en el resultado. */
  send(email: OutgoingEmail): Promise<SendResult>;
}
