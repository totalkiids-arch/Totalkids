import "server-only";

import type { ServiceRequestGateway } from "../application/ports";

/**
 * Adaptador de DEMOSTRACIÓN (hasta LN-08): no guarda la solicitud ni envía
 * correos. Solo entrega una referencia para mostrar la confirmación. La
 * pantalla lo informa para no prometer un contacto que aún no ocurre.
 */
export const demoServiceRequestGateway: ServiceRequestGateway = {
  async submit() {
    return { reference: `SOL-${Date.now().toString(36).toUpperCase()}` };
  },
};
