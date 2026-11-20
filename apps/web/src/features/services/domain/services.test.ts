import { describe, expect, it } from "vitest";

import { findService, isServiceId, SERVICES } from "./services";

describe("servicios especiales", () => {
  it("tiene ids únicos y aptos para la URL", () => {
    const ids = SERVICES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z-]+$/);
  });

  it("reconoce solo ids conocidos", () => {
    expect(isServiceId("armado")).toBe(true);
    expect(isServiceId("Armado")).toBe(false);
    expect(isServiceId("")).toBe(false);
    expect(isServiceId(undefined)).toBe(false);
  });

  it("busca un servicio por id", () => {
    expect(findService("instituciones").title).toBe("Jardines y colegios");
  });
});
