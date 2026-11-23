import type { Consent } from "../domain/subscription";

/**
 * Puerto: lista de suscriptores del newsletter (RF-25, RF-35). La implementa la
 * API (LN-08): guarda el correo con su consentimiento y registra las bajas.
 */
export interface NewsletterGateway {
  subscribe(email: string, consent: Consent): Promise<void>;
  /**
   * Pide el enlace de baja: si el correo está suscrito, le llega un correo para
   * confirmarla. No informa si estaba suscrito (no se revela quién está en la lista).
   */
  requestUnsubscribeLink(email: string): Promise<void>;
  /** Confirma la baja con el token del enlace. false si el enlace no es válido. */
  confirmUnsubscribe(token: string): Promise<boolean>;
}

/** La API no aceptó el envío; `message` es para mostrar al visitante. */
export class NewsletterUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NewsletterUnavailableError";
  }
}
