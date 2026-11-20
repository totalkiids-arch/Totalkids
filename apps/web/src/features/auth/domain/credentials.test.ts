import { describe, expect, it } from "vitest";

import {
  parseLogin,
  parsePasswordReset,
  parseRecovery,
  parseRegistration,
  pickSafeValues,
} from "./credentials";

describe("parseLogin", () => {
  it("normaliza el correo y no toca la contraseña", () => {
    expect(parseLogin({ correo: " Camila@Example.com ", clave: " secreta " })).toEqual({
      ok: true,
      data: { email: "camila@example.com", password: " secreta " },
    });
  });

  it("pide correo y contraseña", () => {
    expect(parseLogin({})).toEqual({
      ok: false,
      errors: { correo: "Ingresa tu correo.", clave: "Ingresa tu contraseña." },
    });
  });
});

describe("parseRegistration", () => {
  const valid = {
    nombre: " Camila González ",
    correo: "camila@example.com",
    clave: "jugar-aprender",
    privacidad: "on",
  };

  it("crea la cuenta con los datos normalizados", () => {
    expect(parseRegistration(valid)).toEqual({
      ok: true,
      data: { name: "Camila González", email: "camila@example.com", password: "jugar-aprender" },
    });
  });

  it("exige una contraseña de al menos 8 caracteres sin espacios en los bordes", () => {
    const short = parseRegistration({ ...valid, clave: "corta" });
    expect(!short.ok && short.errors.clave).toBe("Usa al menos 8 caracteres.");
    const spaced = parseRegistration({ ...valid, clave: " con-espacio" });
    expect(!spaced.ok && spaced.errors.clave).toBe("No empieces ni termines con espacios.");
    const long = parseRegistration({ ...valid, clave: "a".repeat(129) });
    expect(!long.ok && long.errors.clave).toMatch(/máximo 128/);
  });

  it("exige aceptar la privacidad: la casilla no viene marcada", () => {
    const result = parseRegistration({ ...valid, privacidad: undefined });
    expect(!result.ok && result.errors.privacidad).toMatch(/política de privacidad/);
  });
});

describe("parseRecovery", () => {
  it("solo pide el correo", () => {
    expect(parseRecovery({ correo: "Camila@example.com" })).toEqual({
      ok: true,
      data: { email: "camila@example.com" },
    });
    expect(parseRecovery({ correo: "camila@" }).ok).toBe(false);
  });
});

describe("parsePasswordReset", () => {
  const valid = { token: "abc123", clave: "nueva-clave", confirmacion: "nueva-clave" };

  it("acepta contraseñas iguales con enlace", () => {
    expect(parsePasswordReset(valid)).toEqual({
      ok: true,
      data: { token: "abc123", password: "nueva-clave" },
    });
  });

  it("avisa si las contraseñas no coinciden", () => {
    const result = parsePasswordReset({ ...valid, confirmacion: "otra-clave" });
    expect(!result.ok && result.errors.confirmacion).toBe("Las contraseñas no coinciden.");
  });

  it("sin enlace no se puede restablecer", () => {
    const result = parsePasswordReset({ ...valid, token: "" });
    expect(!result.ok && result.errors.token).toMatch(/Pide uno nuevo/);
  });
});

describe("pickSafeValues", () => {
  it("nunca devuelve contraseñas", () => {
    expect(
      pickSafeValues({ nombre: "Camila", correo: "c@e.cl", clave: "x", confirmacion: "x" }),
    ).toEqual({ nombre: "Camila", correo: "c@e.cl" });
  });
});
