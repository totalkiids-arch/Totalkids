import { describe, expect, it } from "vitest";

import {
  FALLBACK_HREF,
  isInternalHref,
  safeBannerHref,
  sortBanners,
  TEXT_MAX,
  TITLE_MAX,
  validateBanner,
  type Banner,
  type BannerInput,
} from "./banner";

const input = (overrides: Partial<BannerInput> = {}): BannerInput => ({
  title: "Pequeños espacios, grandes aventuras",
  text: "Muebles para aprender jugando.",
  href: "/catalogo",
  order: "1",
  active: true,
  ...overrides,
});

const errorsOf = (result: ReturnType<typeof validateBanner>) => (result.ok ? {} : result.errors);

describe("isInternalHref", () => {
  it("acepta rutas internas, con consulta y ancla", () => {
    expect(isInternalHref("/")).toBe(true);
    expect(isInternalHref("/catalogo")).toBe(true);
    expect(isInternalHref("/catalogo?categoria=junji")).toBe(true);
    expect(isInternalHref("/servicios#salas")).toBe(true);
  });

  it("rechaza enlaces externos, protocolos y rutas engañosas", () => {
    for (const href of [
      "",
      "catalogo",
      "http://ejemplo.cl",
      "https://ejemplo.cl/catalogo",
      "javascript:alert(1)",
      " javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "data:text/html,hola",
      "mailto:hola@ejemplo.cl",
      "//ejemplo.cl",
      "/\\ejemplo.cl",
      "/catalogo con espacio",
      "/catalogo\n",
      `/${"a".repeat(200)}`,
    ]) {
      expect(isInternalHref(href), href).toBe(false);
    }
  });
});

describe("safeBannerHref", () => {
  it("devuelve el catálogo si el destino no es seguro", () => {
    expect(safeBannerHref("/servicios")).toBe("/servicios");
    expect(safeBannerHref("javascript:alert(1)")).toBe(FALLBACK_HREF);
  });
});

describe("validateBanner", () => {
  it("acepta un banner válido y limpia espacios", () => {
    const result = validateBanner(input({ title: "  Línea   JUNJI ", order: " 3 " }));
    expect(result).toEqual({
      ok: true,
      draft: {
        title: "Línea JUNJI",
        text: "Muebles para aprender jugando.",
        href: "/catalogo",
        order: 3,
        active: true,
      },
    });
  });

  it("exige título y texto, con largo máximo", () => {
    expect(errorsOf(validateBanner(input({ title: "  " }))).title).toBeDefined();
    expect(errorsOf(validateBanner(input({ text: "" }))).text).toBeDefined();
    expect(errorsOf(validateBanner(input({ title: "a".repeat(TITLE_MAX + 1) }))).title).toMatch(
      /60 caracteres/,
    );
    expect(errorsOf(validateBanner(input({ text: "a".repeat(TEXT_MAX + 1) }))).text).toMatch(
      /140 caracteres/,
    );
    expect(validateBanner(input({ title: "a".repeat(TITLE_MAX) })).ok).toBe(true);
  });

  it("rechaza destinos externos o javascript:", () => {
    expect(errorsOf(validateBanner(input({ href: "https://otro.cl" }))).href).toMatch(
      /No se permiten enlaces externos/,
    );
    expect(errorsOf(validateBanner(input({ href: "javascript:alert(1)" }))).href).toBeDefined();
    expect(errorsOf(validateBanner(input({ href: "//otro.cl" }))).href).toBeDefined();
    expect(errorsOf(validateBanner(input({ href: "" }))).href).toMatch(/Escribe el destino/);
  });

  it("exige un orden entero entre 1 y 99", () => {
    for (const order of ["0", "100", "1.5", "", "-1", "uno"]) {
      expect(errorsOf(validateBanner(input({ order }))).order, order).toMatch(/entre 1 y 99/);
    }
    expect(validateBanner(input({ order: "99" })).ok).toBe(true);
  });
});

describe("sortBanners", () => {
  const banner = (id: string, order: number, title: string): Banner => ({
    id,
    title,
    text: "Texto",
    href: "/",
    order,
    active: true,
  });

  it("ordena por orden y desempata por título", () => {
    const sorted = sortBanners([
      banner("a", 2, "Zeta"),
      banner("b", 1, "Beta"),
      banner("c", 2, "Alfa"),
    ]);
    expect(sorted.map((b) => b.id)).toEqual(["b", "c", "a"]);
  });
});
