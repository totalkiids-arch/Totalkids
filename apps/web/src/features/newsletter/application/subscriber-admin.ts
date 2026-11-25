import type { SubscriberPage, SubscriberQuery, UnsubscribeResult } from "../domain/subscriber";

/**
 * Puerto: suscriptores en el panel (RF-25, RF-29, RF-35). Lo implementa la API
 * (GET /admin/newsletter y POST /admin/newsletter/{id}/unsubscribe, solo
 * Administrador), que filtra, pagina y registra la baja con el rol de quien la hizo.
 */
export interface SubscriberAdmin {
  list(query: SubscriberQuery): Promise<SubscriberPage>;
  /** Baja registrada desde el panel, por id; no borra el registro. */
  registerUnsubscribe(id: string): Promise<UnsubscribeResult>;
}
