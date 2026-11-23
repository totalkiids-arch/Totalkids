import type { ServiceRequest } from "../domain/service-request";

/**
 * Puerto: dónde se registra una solicitud de servicio (RF-24). La implementa la
 * API (LN-08): la guarda y envía el correo de recepción al solicitante y al equipo.
 */
export interface ServiceRequestGateway {
  /** Devuelve la referencia con la que el comprador puede consultar su solicitud. */
  submit(request: ServiceRequest): Promise<{ reference: string }>;
}

/** No se pudo registrar la solicitud; `message` es para mostrar al visitante. */
export class ServiceRequestRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServiceRequestRejectedError";
  }
}
