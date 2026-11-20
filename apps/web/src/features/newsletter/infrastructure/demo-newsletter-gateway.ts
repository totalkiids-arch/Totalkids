import "server-only";

import type { NewsletterGateway } from "../application/ports";

/**
 * Adaptador de DEMOSTRACIÓN (hasta LN-08): no guarda suscripciones ni bajas y
 * no envía correos. La pantalla lo informa.
 */
export const demoNewsletterGateway: NewsletterGateway = {
  async subscribe() {},
  async unsubscribe() {},
};
