import type { Subscriber, UnsubscribeOutcome } from "../domain/subscriber";

/**
 * Puerto: suscriptores en el panel (RF-25, RF-29, RF-35). Con la API
 * (LN-08/LN-13): GET /admin/newsletter y la exportación, solo Administrador.
 */
export interface SubscriberAdmin {
  list(): Promise<Subscriber[]>;
  /** Baja registrada desde el panel, por id; no borra el registro. */
  registerUnsubscribe(
    id: string,
    actor: string,
  ): Promise<UnsubscribeOutcome | { ok: false; reason: "not-found" }>;
}
