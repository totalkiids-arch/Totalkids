import type { Logger } from "../../lib/logger.js";
import { BrevoEmailSender } from "./brevo-sender.js";
import { FakeEmailSender } from "./fake-sender.js";
import type { EmailSender } from "./sender.js";

/** Variables que eligen y configuran el adaptador (ver `config/env.ts`). */
export interface EmailSenderEnv {
  NODE_ENV: "development" | "test" | "production";
  EMAIL_PROVIDER: "fake" | "brevo";
  BREVO_API_KEY?: string | undefined;
  BREVO_API_URL?: string | undefined;
  BREVO_SENDER_EMAIL: string;
  BREVO_SENDER_NAME: string;
  EMAIL_SEND_TIMEOUT_MS: number;
}

/**
 * Elige el adaptador. Nunca se envían correos reales por accidente:
 *
 * - En tests (`NODE_ENV=test`) siempre el falso, aunque se pida Brevo.
 * - Brevo solo con `EMAIL_PROVIDER=brevo` y una API key.
 * - En cualquier otro caso, el falso.
 */
export function createEmailSender(
  env: EmailSenderEnv,
  logger: Logger,
  fetchImpl: typeof fetch = fetch,
): EmailSender {
  if (env.NODE_ENV === "test") return new FakeEmailSender(logger);
  if (env.EMAIL_PROVIDER !== "brevo") return new FakeEmailSender(logger);
  if (!env.BREVO_API_KEY) {
    logger.warn("EMAIL_PROVIDER=brevo sin BREVO_API_KEY: se usa el adaptador falso");
    return new FakeEmailSender(logger);
  }
  return new BrevoEmailSender(
    {
      apiKey: env.BREVO_API_KEY,
      apiUrl: env.BREVO_API_URL,
      senderEmail: env.BREVO_SENDER_EMAIL,
      senderName: env.BREVO_SENDER_NAME,
      timeoutMs: env.EMAIL_SEND_TIMEOUT_MS,
    },
    logger,
    fetchImpl,
  );
}
