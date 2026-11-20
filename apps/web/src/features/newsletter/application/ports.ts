import type { Consent } from "../domain/subscription";

/**
 * Puerto: lista de suscriptores del newsletter (RF-25). Con la API (LN-08),
 * guarda el correo con su consentimiento y registra las bajas.
 */
export interface NewsletterGateway {
  subscribe(email: string, consent: Consent): Promise<void>;
  /** No informa si el correo estaba suscrito (no se revela quién está en la lista). */
  unsubscribe(email: string): Promise<void>;
}
