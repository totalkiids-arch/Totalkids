import { describe, expect, it } from "vitest";

import {
  describeUserChange,
  LAST_ADMIN,
  removesLastAdmin,
  sortUsers,
  validateUser,
  type InternalUser,
} from "./internal-user";

const admin: InternalUser = {
  id: "u1",
  name: "Administración Total Kids",
  email: "admin@example.com",
  role: "admin",
  active: true,
};
const operator: InternalUser = {
  id: "u2",
  name: "Equipo de operaciones",
  email: "operador@example.com",
  role: "operator",
  active: true,
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

  it("no deja al panel sin Administradores activos", () => {
    const demote = validateUser(
      { name: admin.name, email: admin.email, role: "operator", active: true },
      users,
      admin,
    );
    expect(demote).toEqual({ ok: false, errors: { form: LAST_ADMIN } });
    const deactivate = validateUser(
      { name: admin.name, email: admin.email, role: "admin", active: false },
      users,
      admin,
    );
    expect(deactivate.ok).toBe(false);
  });

  it("con otro Administrador activo, sí se puede cambiar", () => {
    const second: InternalUser = {
      ...operator,
      id: "u3",
      email: "otra@example.com",
      role: "admin",
    };
    const result = validateUser(
      { name: admin.name, email: admin.email, role: "operator", active: true },
      [...users, second],
      admin,
    );
    expect(result.ok).toBe(true);
  });
});

describe("removesLastAdmin", () => {
  it("solo afecta a un Administrador activo que deja de serlo", () => {
    expect(removesLastAdmin(users, operator, { role: "operator", active: false })).toBe(false);
    expect(removesLastAdmin(users, admin, { role: "admin", active: true })).toBe(false);
    expect(removesLastAdmin(users, admin, { role: "admin", active: false })).toBe(true);
    expect(removesLastAdmin(users, null, { role: "operator", active: true })).toBe(false);
  });
});

describe("sortUsers", () => {
  it("Administradores primero, luego activos y por nombre", () => {
    const inactive: InternalUser = { ...operator, id: "u4", name: "Aaron", active: false };
    expect(sortUsers([inactive, operator, admin]).map((u) => u.id)).toEqual(["u1", "u2", "u4"]);
  });
});

describe("describeUserChange", () => {
  it("describe altas y cambios para el historial", () => {
    expect(describeUserChange(null, operator)).toBe(
      "Cuenta creada: Equipo de operaciones (operador@example.com), Operador.",
    );
    expect(describeUserChange(operator, { ...operator, role: "admin", active: false })).toBe(
      "Cuenta de Equipo de operaciones: rol Operador → Administrador, desactivada.",
    );
    expect(describeUserChange(operator, operator)).toBe(
      "Cuenta de Equipo de operaciones guardada sin cambios.",
    );
  });
});
