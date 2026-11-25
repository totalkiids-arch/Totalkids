import { describe, expect, it } from "vitest";

import {
  chileDateTimeForCsv,
  chileLocalInput,
  chileLocalToIso,
  formatChileDateTime,
} from "./chile-time";

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

  it("lee una fecha y hora de Chile (input datetime-local) y la pasa a ISO", () => {
    // Noviembre: horario de verano (UTC-3). Julio: UTC-4.
    expect(chileLocalToIso("2026-11-19T16:20")).toBe("2026-11-19T19:20:00.000Z");
    expect(chileLocalToIso("2026-07-01T09:00")).toBe("2026-07-01T13:00:00.000Z");
    expect(chileLocalInput("2026-11-19T19:20:00.000Z")).toBe("2026-11-19T16:20");
  });

  it("rechaza fechas que no existen o con otro formato", () => {
    for (const text of ["", "2026-02-30T10:00", "2026-11-19 16:20", "2026-11-19T25:00"]) {
      expect(chileLocalToIso(text), text).toBeNull();
    }
  });
});
