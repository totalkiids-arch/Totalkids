// Raíz de composición de "newsletter": conecta los puertos con sus adaptadores actuales.
import type { NewsletterGateway } from "./application/ports";
import { parseSubscription, parseUnsubscribe } from "./domain/subscription";
import { demoNewsletterGateway } from "./infrastructure/demo-newsletter-gateway";

const gateway: NewsletterGateway = demoNewsletterGateway;

/** Caso de uso: suscribirse con consentimiento explícito (RF-25, RF-35). */
export async function subscribe(input: Partial<Record<string, unknown>>) {
  const result = parseSubscription(input, new Date().toISOString());
  if (result.ok) await gateway.subscribe(result.email, result.consent);
  return result;
}

/** Caso de uso: darse de baja (RF-25). */
export async function unsubscribe(input: Partial<Record<string, unknown>>) {
  const result = parseUnsubscribe(input);
  if (result.ok) await gateway.unsubscribe(result.email);
  return result;
}
