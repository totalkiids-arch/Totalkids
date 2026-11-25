import { describe, expect, it } from "vitest";

import { validateUser, type InternalUser } from "./internal-user";

const admin: InternalUser = {
  id: "u1",
  name: "Administración Total Kids",
  email: "admin@example.com",
  role: "admin",
  active: true,
  lastLoginAt: null,
  isSelf: true,
};
const operator: InternalUser = {
  id: "u2",
  name: "Equipo de operaciones",
  email: "operador@example.com",
  role: "operator",
  active: true,
  lastLoginAt: null,
  isSelf: false,
};
const users = [admin, operator];

const input = (overrides: Partial<Parameters<typeof validateUser>[0]> = {}) => ({
  name: " Ana Pérez ",
  email: " Ana@TotalKids.cl ",
  role: "operator",
  active: true,
  ...overrides,
});

describe("validateUser", () => {
  it("crea una cuenta normalizando nombre y correo", () => {
    expect(validateUser(input(), users, null)).toEqual({
      ok: true,
      draft: { name: "Ana Pérez", email: "ana@totalkids.cl", role: "operator", active: true },
    });
  });

  it("informa nombre, correo y rol inválidos", () => {
    const result = validateUser(input({ name: "", email: "ana@", role: "jefe" }), users, null);
    expect(result).toEqual({
      ok: false,
      errors: {
        name: "Ingresa el nombre.",
        email: "Escribe un correo válido, por ejemplo nombre@totalkids.cl.",
        role: "Elige un rol.",
      },
    });
  });

  it("no permite repetir un correo, sin importar mayúsculas", () => {
    const result = validateUser(input({ email: "OPERADOR@example.com" }), users, null);
    expect(!result.ok && result.errors.email).toBe("Ya existe una cuenta con ese correo.");
    // Al editar, conservar el propio correo no es un duplicado.
    const own = validateUser(input({ email: operator.email }), users, operator);
    expect(own.ok).toBe(true);
  });
});
