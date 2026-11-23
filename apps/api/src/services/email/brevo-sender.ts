import type { Logger } from "../../lib/logger.js";
import type { EmailSender, OutgoingEmail, SendResult } from "./sender.js";

/**
 * Adaptador de Brevo: API transaccional (`POST /v3/smtp/email`) con el `fetch`
 * nativo de Node y un timeout. Clasifica cada respuesta según el puerto
 * (`sender.ts`). Los detalles que devuelve no llevan el destinatario, el cuerpo
 * ni la API key: solo el estado HTTP y el código de error de Brevo.
 */

export const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

export interface BrevoConfig {
  apiKey: string;
  apiUrl?: string | undefined;
  senderEmail: string;
  senderName: string;
  timeoutMs: number;
}

/** Errores de red que ocurren antes de entregar la petición: es seguro reintentar. */
const NOT_SENT_CODES = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "UND_ERR_CONNECT_TIMEOUT",
]);

/** Estados en los que Brevo no aceptó el mensaje y conviene reintentar. */
const RETRYABLE_STATUS = new Set([401, 403, 408, 429, 500, 502, 503]);
/** API key o remitente mal configurados: se reintenta y se alerta. */
const CONFIG_STATUS = new Set([401, 403]);

function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const cause = (error as { cause?: unknown }).cause;
  const code =
    (cause as { code?: unknown } | undefined)?.code ?? (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

/** Solo el código de error de Brevo ("invalid_parameter"); su mensaje puede traer el correo. */
async function brevoErrorCode(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { code?: unknown };
    return typeof body.code === "string"
      ? body.code.slice(0, 60).replace(/[^\w.-]/g, "")
      : "sin_codigo";
  } catch {
    return "sin_codigo";
  }
}

export class BrevoEmailSender implements EmailSender {
  readonly name = "brevo";

  constructor(
    private readonly config: BrevoConfig,
    private readonly logger: Logger,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(email: OutgoingEmail): Promise<SendResult> {
    let response: Response;
    try {
      response = await this.fetchImpl(this.config.apiUrl ?? BREVO_API_URL, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "api-key": this.config.apiKey,
        },
        body: JSON.stringify({
          sender: { email: this.config.senderEmail, name: this.config.senderName },
          to: [{ email: email.to }],
          subject: email.subject,
          htmlContent: email.html,
          textContent: email.text,
          tags: [email.tag],
        }),
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
    } catch (error) {
      if (isTimeout(error)) {
        return {
          outcome: "timeout",
          detail: `Brevo no respondió en ${String(this.config.timeoutMs)} ms`,
        };
      }
      const code = errorCode(error);
      if (code && NOT_SENT_CODES.has(code)) {
        return { outcome: "retryable", detail: `Sin conexión con Brevo (${code})` };
      }
      // La conexión se cortó sin respuesta: el correo pudo haber salido.
      return {
        outcome: "timeout",
        detail: `Conexión con Brevo interrumpida (${code ?? "sin código"})`,
      };
    }

    if (response.ok) {
      try {
        const body = (await response.json()) as { messageId?: unknown };
        const id = typeof body.messageId === "string" ? body.messageId.slice(0, 120) : null;
        return { outcome: "accepted", messageId: id };
      } catch {
        // Brevo ya aceptó: si el cuerpo no se puede leer, igual quedó enviado.
        return { outcome: "accepted", messageId: null };
      }
    }

    const status = response.status;
    const code = await brevoErrorCode(response);
    const detail = `Brevo respondió ${String(status)} (${code})`;
    if (CONFIG_STATUS.has(status)) {
      // Alerta operativa (RNF-15): sin destinatario ni API key.
      this.logger.error(
        { status, code },
        "Brevo rechazó la autenticación: revisa BREVO_API_KEY y el remitente autorizado. Los correos se reintentarán.",
      );
    }
    if (RETRYABLE_STATUS.has(status)) return { outcome: "retryable", detail };
    if (status === 504) return { outcome: "timeout", detail };
    if (status >= 500) return { outcome: "retryable", detail };
    return { outcome: "rejected", detail };
  }
}
