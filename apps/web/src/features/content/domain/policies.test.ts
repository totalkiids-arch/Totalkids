import { describe, expect, it } from "vitest";

import { POLICY_SECTIONS } from "./policies";

describe("políticas", () => {
  const ids = POLICY_SECTIONS.map((s) => s.id);

  it("tiene anclas únicas y aptas para la URL", () => {
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z-]+$/);
  });

  it("incluye las anclas que enlaza el resto del sitio", () => {
    // Pie de página, menú de ayuda, checkout, registro y formularios.
    for (const anchor of ["terminos", "compra", "despacho", "cambios", "privacidad"]) {
      expect(ids).toContain(anchor);
    }
  });

  it("no deja secciones vacías", () => {
    for (const section of POLICY_SECTIONS) {
      expect(section.title.trim()).not.toBe("");
      expect(section.paragraphs.length).toBeGreaterThan(0);
    }
  });
});
