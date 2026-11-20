import { describe, expect, it } from "vitest";

import { chileDateTimeForCsv, formatChileDateTime } from "./chile-time";

describe("chile-time", () => {
  it("convierte a la hora de Chile sin importar la zona del servidor", () => {
    // 19:20 UTC = 16:20 en Chile (UTC-3 en noviembre).
    expect(chileDateTimeForCsv("2026-11-19T19:20:00Z")).toBe("2026-11-19 16:20");
    expect(chileDateTimeForCsv("2026-11-19T16:20:00-03:00")).toBe("2026-11-19 16:20");
  });

  it("formatea para pantalla con día, mes, año y hora", () => {
    const text = formatChileDateTime("2026-11-19T16:20:00-03:00");
    expect(text).toContain("19");
    expect(text).toContain("2026");
    expect(text).toContain("16:20");
  });
});
