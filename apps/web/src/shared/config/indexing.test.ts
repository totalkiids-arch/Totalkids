import { describe, expect, it } from "vitest";

import robots from "@/app/robots";

import { categoryPaths, NOINDEX_PATHS, PUBLIC_PAGES } from "./indexing";

describe("indexación (RNF-10)", () => {
  it("el sitemap fijo no incluye carrito, checkout, cuenta ni panel", () => {
    const paths = PUBLIC_PAGES.map((page) => page.path as string);
    for (const hidden of NOINDEX_PATHS) {
      expect(
        paths.some((path) => path.startsWith(hidden)),
        hidden,
      ).toBe(false);
    }
  });

  it("las categorías del encabezado entran como catálogo filtrado por categoría", () => {
    const paths = categoryPaths();
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.every((path) => /^\/catalogo\?categoria=[a-z0-9-]+$/.test(path))).toBe(true);
    // Servicios y ofertas no son categorías.
    expect(paths).not.toContain("/servicios");
  });

  it("robots.txt bloquea las rutas privadas y apunta al sitemap absoluto", () => {
    const result = robots();
    expect(result.sitemap).toBe("http://localhost:3000/sitemap.xml");
    const rules = Array.isArray(result.rules) ? result.rules[0] : result.rules;
    expect(rules?.disallow).toEqual(
      expect.arrayContaining([
        "/carrito",
        "/checkout",
        "/seguimiento",
        "/admin",
        "/suscripcion/baja",
      ]),
    );
  });
});
