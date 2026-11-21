import { describe, expect, it } from "vitest";

import { ADMIN_NAV_GROUPS, adminNav, isActiveAdminHref } from "./routes";

describe("adminNav", () => {
  it("tiene las 16 secciones agrupadas en el orden de la maqueta", () => {
    expect(adminNav).toHaveLength(16);
    const groups = [...new Set(adminNav.map((item) => item.group))];
    expect(groups).toEqual([...ADMIN_NAV_GROUPS]);
  });
});

describe("isActiveAdminHref", () => {
  it("marca el resumen solo en /admin", () => {
    expect(isActiveAdminHref("/admin", "/admin")).toBe(true);
    expect(isActiveAdminHref("/admin/pedidos", "/admin")).toBe(false);
  });

  it("marca la sección también en sus subrutas", () => {
    expect(isActiveAdminHref("/admin/pedidos/1042", "/admin/pedidos")).toBe(true);
    expect(isActiveAdminHref("/admin/productos/nuevo", "/admin/productos")).toBe(true);
    expect(isActiveAdminHref("/admin/productos/15", "/admin/productos")).toBe(true);
  });

  it("no confunde secciones con prefijo común", () => {
    expect(isActiveAdminHref("/admin/pagos", "/admin/pedidos")).toBe(false);
    expect(isActiveAdminHref("/admin/pedidosx", "/admin/pedidos")).toBe(false);
  });
});
