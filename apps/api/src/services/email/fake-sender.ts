import { randomUUID } from "node:crypto";

import type { Logger } from "../../lib/logger.js";
import type { EmailSender, OutgoingEmail, SendResult } from "./sender.js";

/**
 * Adaptador falso (por defecto en desarrollo y siempre en tests): no usa la red.
 * Guarda los correos en memoria y responde "aceptado". En los tests se le puede
 * programar el resultado de cada envío para simular fallos y timeouts.
 */
export class FakeEmailSender implements EmailSender {
  readonly name = "fake";
  /** Correos "enviados", en orden. */
  readonly sent: OutgoingEmail[] = [];
  private readonly queued: SendResult[] = [];

  constructor(private readonly logger?: Logger) {}

  /** Programa los próximos resultados (en orden); después vuelve a "aceptado". */
  respondWith(...results: SendResult[]): this {
    this.queued.push(...results);
    return this;
  }

  send(email: OutgoingEmail): Promise<SendResult> {
    this.sent.push(email);
    const result = this.queued.shift() ?? {
      outcome: "accepted",
      messageId: `fake-${randomUUID()}`,
    };
    // Sin destinatario ni cuerpo en el log (pueden traer datos personales o un token).
    this.logger?.info(
      { tag: email.tag, outcome: result.outcome },
      "Correo simulado (EMAIL_PROVIDER=fake)",
    );
    return Promise.resolve(result);
  }
}
