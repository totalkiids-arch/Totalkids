import { describe, expect, it } from "vitest";

import {
  ADMIN_ROLE_LABEL,
  ADMIN_ROLES,
  ADMIN_SECTIONS,
  canAccessSection,
  isAdminRole,
} from "./admin-role";

const visibleFor = (role: (typeof ADMIN_ROLES)[number]) =>
  ADMIN_SECTIONS.filter((section) => canAccessSection(role, section));

describe("AdminRole", () => {
  it("tiene los dos roles internos con su etiqueta", () => {
    expect(ADMIN_ROLES.map((role) => ADMIN_ROLE_LABEL[role])).toEqual([
      "Administrador",
      "Operador",
    ]);
  });

  it("reconoce solo valores válidos", () => {
    expect(isAdminRole("admin")).toBe(true);
    expect(isAdminRole("operator")).toBe(true);
    expect(isAdminRole("Administrador")).toBe(false);
    expect(isAdminRole("")).toBe(false);
    expect(isAdminRole(undefined)).toBe(false);
  });
});

describe("canAccessSection", () => {
  it("el administrador ve las 15 secciones", () => {
    expect(ADMIN_SECTIONS).toHaveLength(15);
    expect(visibleFor("admin")).toEqual([...ADMIN_SECTIONS]);
  });

  it("el operador ve solo resumen, pedidos, pagos, solicitudes, correos y reportes", () => {
    expect(visibleFor("operator")).toEqual([
      "resumen",
      "pedidos",
      "pagos",
      "solicitudes",
      "correos",
      "reportes",
    ]);
  });

  it("el operador no accede a catálogo, configuración ni usuarios (CA-07)", () => {
    for (const section of [
      "productos",
      "categorias",
      "cupones",
      "usuarios",
      "actividad",
    ] as const) {
      expect(canAccessSection("operator", section)).toBe(false);
    }
  });
});
