import { describe, expect, it } from "vitest";

import { fromApiResponse, PANEL_MESSAGES, unavailableError } from "@/shared/lib/panel-errors";

import { INVALID_RESET_LINK, toAdminSession, toAuthFailure } from "./auth-api-results";

const error = (code: string, message: string, details: unknown = null) => ({
  code,
  message,
  details,
  requestId: "r",
});

describe("toAdminSession", () => {
  it("lee el usuario y el rol de GET /auth/session", () => {
    expect(
      toAdminSession({
        user: { id: "u1", email: "ana@totalkids.cl", name: "Ana", role: "operator" },
        expiresAt: "2026-12-04T22:00:00.000Z",
      }),
    ).toEqual({
      user: { id: "u1", email: "ana@totalkids.cl", name: "Ana" },
      role: "operator",
      expiresAt: "2026-12-04T22:00:00.000Z",
    });
  });

  it("un cuerpo inesperado (rol desconocido) cuenta como API no disponible", () => {
    expect(() =>
      toAdminSession({ user: { id: "u", email: "e", name: "n", role: "root" }, expiresAt: "x" }),
    ).toThrow(PANEL_MESSAGES.unavailable);
  });
});

describe("toAuthFailure", () => {
  it("401 del login muestra el mensaje único de la API", () => {
    const failure = toAuthFailure(
      fromApiResponse(401, error("UNAUTHORIZED", "Correo o contraseña incorrectos")),
    );
    expect(failure).toEqual({
      ok: false,
      message: "Correo o contraseña incorrectos",
      fieldErrors: {},
    });
  });

  it("429 del login muestra cuánto esperar", () => {
    const failure = toAuthFailure(
      fromApiResponse(429, error("RATE_LIMITED", "x", { retryAfterSeconds: 900 })),
    );
    expect(failure.message).toBe("Demasiados intentos. Espera 15 minutos e intenta de nuevo.");
  });

  it("422 deja los errores por campo", () => {
    const failure = toAuthFailure(
      fromApiResponse(
        422,
        error("VALIDATION_ERROR", "Los datos enviados no son válidos", {
          issues: [{ location: "body", path: "email", message: "Ingresa un correo válido" }],
        }),
      ),
    );
    expect(failure.fieldErrors).toEqual({ email: "Ingresa un correo válido" });
    expect(failure.invalidToken).toBeUndefined();
  });

  it("un 422 en token es un enlace inválido o vencido", () => {
    const failure = toAuthFailure(
      fromApiResponse(
        422,
        error("VALIDATION_ERROR", "x", {
          issues: [{ location: "body", path: "token", message: "El enlace no es válido" }],
        }),
      ),
    );
    expect(failure).toEqual({
      ok: false,
      message: INVALID_RESET_LINK,
      fieldErrors: {},
      invalidToken: true,
    });
  });

  it("caída de la API o error desconocido → aviso de servidor no disponible", () => {
    expect(toAuthFailure(unavailableError()).message).toBe(PANEL_MESSAGES.unavailable);
    expect(toAuthFailure(new Error("x")).message).toBe(PANEL_MESSAGES.unavailable);
  });
});
