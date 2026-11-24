import { afterEach, describe, expect, it, vi } from "vitest";

import { createLogger } from "../src/lib/logger.js";
import { BREVO_API_URL, BrevoEmailSender } from "../src/services/email/brevo-sender.js";
import { createEmailSender, type EmailSenderEnv } from "../src/services/email/create-sender.js";
import { FakeEmailSender } from "../src/services/email/fake-sender.js";
import type { OutgoingEmail } from "../src/services/email/sender.js";

// Puerto de envío y adaptadores (LN-14). Ningún test usa la red: Brevo recibe
// un fetch simulado.

const EMAIL: OutgoingEmail = {
  to: "ana@ejemplo.cl",
  subject: "Tu compra #TK-1048 está confirmada",
  html: "<p>Hola</p>",
  text: "Hola",
  tag: "purchase_confirmed",
};

const CONFIG = {
  apiKey: "xkeysib-clave-de-prueba",
  senderEmail: "no-reply@example.com",
  senderName: "Total Kids",
  timeoutMs: 50,
};

function silentLogger() {
  const logger = createLogger("silent", false);
  return Object.assign(logger, { error: vi.fn(), warn: vi.fn(), info: vi.fn() });
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function networkError(code: string) {
  return Object.assign(new TypeError("fetch failed"), {
    cause: Object.assign(new Error(code), { code }),
  });
}

function brevo(fetchImpl: typeof fetch) {
  const logger = silentLogger();
  return { sender: new BrevoEmailSender(CONFIG, logger, fetchImpl), logger };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("BrevoEmailSender", () => {
  it("manda la petición a la API transaccional con api-key, remitente, HTML y texto", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json(201, { messageId: "<abc@smtp-relay>" }));
    const { sender } = brevo(fetchImpl);

    expect(await sender.send(EMAIL)).toEqual({
      outcome: "accepted",
      messageId: "<abc@smtp-relay>",
    });

    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe(BREVO_API_URL);
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>)["api-key"]).toBe(CONFIG.apiKey);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(String(init?.body))).toEqual({
      sender: { email: "no-reply@example.com", name: "Total Kids" },
      to: [{ email: "ana@ejemplo.cl" }],
      subject: EMAIL.subject,
      htmlContent: EMAIL.html,
      textContent: EMAIL.text,
      tags: ["purchase_confirmed"],
    });
  });

  it("2xx con cuerpo ilegible igual queda aceptado", async () => {
    const { sender } = brevo(
      vi.fn<typeof fetch>().mockResolvedValue(new Response("no-json", { status: 201 })),
    );
    expect(await sender.send(EMAIL)).toEqual({ outcome: "accepted", messageId: null });
  });

  it.each([400, 404, 422])("%i es fallo definitivo, sin reintento", async (status) => {
    const { sender, logger } = brevo(
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          json(status, { code: "invalid_parameter", message: "email ana@ejemplo.cl is not valid" }),
        ),
    );
    const result = await sender.send(EMAIL);
    expect(result).toEqual({
      outcome: "rejected",
      detail: `Brevo respondió ${String(status)} (invalid_parameter)`,
    });
    // El detalle nunca trae el destinatario ni la API key.
    expect(JSON.stringify(result)).not.toMatch(/ana@ejemplo|xkeysib/);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it.each([401, 403])(
    "%i (API key o remitente) es reintentable y alerta de configuración",
    async (status) => {
      const { sender, logger } = brevo(
        vi
          .fn<typeof fetch>()
          .mockResolvedValue(json(status, { code: "unauthorized", message: "Key not found" })),
      );
      const result = await sender.send(EMAIL);
      expect(result.outcome).toBe("retryable");
      expect(logger.error).toHaveBeenCalledTimes(1);
      const [fields, message] = logger.error.mock.calls[0] as unknown as [object, string];
      expect(message).toMatch(/BREVO_API_KEY/);
      expect(JSON.stringify(fields)).not.toMatch(/ana@ejemplo|xkeysib/);
    },
  );

  it.each([429, 500, 502, 503])("%i es reintentable", async (status) => {
    const { sender, logger } = brevo(vi.fn<typeof fetch>().mockResolvedValue(json(status, {})));
    expect(await sender.send(EMAIL)).toEqual({
      outcome: "retryable",
      detail: `Brevo respondió ${String(status)} (sin_codigo)`,
    });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("504 es incierto: el correo pudo haber salido", async () => {
    const { sender } = brevo(vi.fn<typeof fetch>().mockResolvedValue(json(504, {})));
    expect((await sender.send(EMAIL)).outcome).toBe("timeout");
  });

  it("sin respuesta dentro del plazo es incierto (timeout real con AbortSignal)", async () => {
    const hanging: typeof fetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(init.signal?.reason as Error);
        });
      });
    const { sender } = brevo(hanging);
    expect(await sender.send(EMAIL)).toEqual({
      outcome: "timeout",
      detail: "Brevo no respondió en 50 ms",
    });
  });

  it.each(["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN"])(
    "%s (no llegó a Brevo) es reintentable",
    async (code) => {
      const { sender } = brevo(vi.fn<typeof fetch>().mockRejectedValue(networkError(code)));
      expect(await sender.send(EMAIL)).toEqual({
        outcome: "retryable",
        detail: `Sin conexión con Brevo (${code})`,
      });
    },
  );

  it("una conexión cortada después de enviar es incierta", async () => {
    const { sender } = brevo(vi.fn<typeof fetch>().mockRejectedValue(networkError("ECONNRESET")));
    expect((await sender.send(EMAIL)).outcome).toBe("timeout");
  });
});

describe("FakeEmailSender", () => {
  it("guarda en memoria, acepta por defecto y permite programar resultados", async () => {
    const sender = new FakeEmailSender().respondWith({ outcome: "timeout", detail: "simulado" });
    expect((await sender.send(EMAIL)).outcome).toBe("timeout");
    const second = await sender.send(EMAIL);
    expect(second.outcome).toBe("accepted");
    expect(second).toMatchObject({ messageId: expect.stringMatching(/^fake-/) as unknown });
    expect(sender.sent).toHaveLength(2);
  });
});

describe("createEmailSender", () => {
  const base: EmailSenderEnv = {
    NODE_ENV: "development",
    EMAIL_PROVIDER: "fake",
    BREVO_SENDER_EMAIL: "no-reply@example.com",
    BREVO_SENDER_NAME: "Total Kids",
    EMAIL_SEND_TIMEOUT_MS: 10_000,
  };

  it("usa el falso por defecto", () => {
    expect(createEmailSender(base, silentLogger()).name).toBe("fake");
  });

  it("en tests siempre usa el falso, aunque se pida Brevo con API key", async () => {
    const fetchSpy = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchSpy);
    const sender = createEmailSender(
      { ...base, NODE_ENV: "test", EMAIL_PROVIDER: "brevo", BREVO_API_KEY: "xkeysib-real" },
      silentLogger(),
      fetchSpy,
    );
    expect(sender).toBeInstanceOf(FakeEmailSender);
    await sender.send(EMAIL);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("Brevo solo con EMAIL_PROVIDER=brevo y API key", () => {
    const logger = silentLogger();
    expect(createEmailSender({ ...base, EMAIL_PROVIDER: "brevo" }, logger).name).toBe("fake");
    expect(logger.warn).toHaveBeenCalled();
    expect(
      createEmailSender({ ...base, EMAIL_PROVIDER: "brevo", BREVO_API_KEY: "xkeysib-x" }, logger)
        .name,
    ).toBe("brevo");
    expect(createEmailSender({ ...base, BREVO_API_KEY: "xkeysib-x" }, logger).name).toBe("fake");
  });
});
