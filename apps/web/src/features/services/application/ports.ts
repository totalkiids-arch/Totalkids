import type { ServiceRequest } from "../domain/service-request";

/**
 * Puerto: dónde se registra una solicitud de servicio (RF-24). Con la API
 * (LN-08), la guarda, la muestra en el panel y envía el correo de recepción.
 */
export interface ServiceRequestGateway {
  /** Devuelve la referencia con la que el comprador puede consultar su solicitud. */
  submit(request: ServiceRequest): Promise<{ reference: string }>;
}
