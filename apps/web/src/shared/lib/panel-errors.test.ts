import { describe, expect, it } from "vitest";

import {
  attemptPanel,
  businessFieldErrors,
  isPanelFailure,
  fromApiResponse,
  PANEL_MESSAGES,
  panelErrorMessage,
  rateLimitMessage,
  unavailableError,
} from "./panel-errors";

const body = (code: string, message: string, details: unknown = null) => ({
  code,
  message,
  details,
  requestId: "req-1",
});

describe("fromApiResponse", () => {
  it("401 → unauthorized con el mensaje de la API", () => {
    const error = fromApiResponse(401, body("UNAUTHORIZED", "Correo o contraseña incorrectos"));
    expect(error.kind).toBe("unauthorized");
    expect(error.message).toBe("Correo o contraseña incorrectos");
    expect(error.requestId).toBe("req-1");
  });

  it("403 → sin permiso; un 403 de CSRF pide recargar", () => {
    expect(fromApiResponse(403, body("FORBIDDEN", "x")).kind).toBe("forbidden");
    expect(fromApiResponse(403, body("FORBIDDEN", "x")).message).toBe(PANEL_MESSAGES.forbidden);
    const csrf = fromApiResponse(403, body("CSRF_FAILED", "x"));
    expect(csrf.kind).toBe("conflict");
    expect(csrf.message).toMatch(/recarga/i);
  });

  it("409 → conflict con el mensaje de la API", () => {
    const error = fromApiResponse(409, body("CONFLICT", "El folio ya está registrado"));
    expect(error.kind).toBe("conflict");
    expect(error.message).toBe("El folio ya está registrado");
    expect(error.fieldErrors).toEqual({});
  });

  it("409 con details.field deja el mensaje en ese campo", () => {
    const error = fromApiResponse(
      409,
      body("CONFLICT", "Ese folio ya está en otro pedido.", { field: "number" }),
    );
    expect(error.fieldErrors).toEqual({ number: "Ese folio ya está en otro pedido." });
  });

  it("422 → errores por campo (el primero de cada campo)", () => {
    const error = fromApiResponse(
      422,
      body("VALIDATION_ERROR", "Los datos enviados no son válidos", {
        issues: [
          { location: "body", path: "email", message: "Ingresa un correo válido" },
          { location: "body", path: "email", message: "otro" },
          { location: "body", path: "", message: "general" },
        ],
      }),
    );
    expect(error.kind).toBe("validation");
    expect(error.fieldErrors).toEqual({ email: "Ingresa un correo válido", form: "general" });
  });

  it("429 → mensaje de espera con los minutos del cuerpo o de Retry-After", () => {
    const fromBody = fromApiResponse(
      429,
      body("RATE_LIMITED", "x", { retryAfterSeconds: 240 }),
      null,
    );
    expect(fromBody.kind).toBe("rate-limited");
    expect(fromBody.retryAfterSeconds).toBe(240);
    expect(fromBody.message).toBe("Demasiados intentos. Espera 4 minutos e intenta de nuevo.");
    expect(fromApiResponse(429, null, "30").message).toMatch(/Espera 1 minuto e/);
    expect(fromApiResponse(429, null, null).message).toBe(PANEL_MESSAGES.rateLimited);
  });

  it("5xx → unavailable, sin el detalle interno", () => {
    const error = fromApiResponse(503, body("DATABASE_UNAVAILABLE", "No hay conexión con la BD"));
    expect(error.kind).toBe("unavailable");
    expect(error.message).toBe(PANEL_MESSAGES.unavailable);
  });

  it("cuerpo vacío o no JSON no rompe la traducción", () => {
    expect(fromApiResponse(404, null).message).toBe(PANEL_MESSAGES.notFound);
    expect(fromApiResponse(400, "texto").kind).toBe("conflict");
  });
});

describe("mensajes", () => {
  it("rateLimitMessage redondea hacia arriba", () => {
    expect(rateLimitMessage(61)).toMatch(/Espera 2 minutos/);
    expect(rateLimitMessage(900)).toMatch(/Espera 15 minutos/);
  });

  it("panelErrorMessage usa el aviso de caída para errores desconocidos", () => {
    expect(panelErrorMessage(unavailableError())).toBe(PANEL_MESSAGES.unavailable);
    expect(panelErrorMessage(new Error("boom"))).toBe(PANEL_MESSAGES.unavailable);
  });
});

describe("businessFieldErrors", () => {
  it("422 y 409 vuelven como errores por campo o como mensaje general", () => {
    const validation = fromApiResponse(
      422,
      body("VALIDATION_ERROR", "x", { issues: [{ path: "amount", message: "Máximo $5.000" }] }),
    );
    expect(businessFieldErrors(validation)).toEqual({ amount: "Máximo $5.000" });
    expect(businessFieldErrors(fromApiResponse(409, body("CONFLICT", "Ya resuelto")))).toEqual({
      form: "Ya resuelto",
    });
    expect(businessFieldErrors(fromApiResponse(404, null), "Ya no existe.")).toEqual({
      form: "Ya no existe.",
    });
  });

  it("403, caída y errores ajenos se relanzan", () => {
    expect(() => businessFieldErrors(fromApiResponse(403, null))).toThrow(PANEL_MESSAGES.forbidden);
    expect(() => businessFieldErrors(unavailableError())).toThrow(PANEL_MESSAGES.unavailable);
    expect(() => businessFieldErrors(new Error("otro"))).toThrow("otro");
  });
});

describe("attemptPanel", () => {
  it("devuelve el valor o el mensaje del error", async () => {
    expect(await attemptPanel(async () => 5)).toBe(5);
    const failure = await attemptPanel(async () => {
      throw fromApiResponse(403, null);
    });
    expect(isPanelFailure(failure) && failure.failed).toBe(PANEL_MESSAGES.forbidden);
  });

  it("relanza los errores internos de Next (redirect)", async () => {
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;x" });
    await expect(
      attemptPanel(async () => {
        throw redirect;
      }),
    ).rejects.toBe(redirect);
  });
});
