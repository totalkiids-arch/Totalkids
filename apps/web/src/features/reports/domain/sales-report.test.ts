import { describe, expect, it } from "vitest";

import { parseReportPeriod, reportPeriodSearch, toApiPeriodSearch } from "./sales-report";

describe("parseReportPeriod", () => {
  it("sin fechas usa el mes en curso hasta hoy", () => {
    expect(parseReportPeriod({}, "2026-11-20")).toEqual({
      ok: true,
      period: { from: "2026-11-01", to: "2026-11-20" },
    });
  });

  it("lee el período de la URL", () => {
    expect(parseReportPeriod({ desde: "2026-10-01", hasta: "2026-10-31" }, "2026-11-20")).toEqual({
      ok: true,
      period: { from: "2026-10-01", to: "2026-10-31" },
    });
  });

  it("rechaza fechas inválidas, invertidas o un período de más de un año", () => {
    const today = "2026-11-20";
    const invalid = parseReportPeriod({ desde: "2026-02-30", hasta: "2026-03-01" }, today);
    expect(!invalid.ok && invalid.error).toMatch(/fechas válidas/);
    const reversed = parseReportPeriod({ desde: "2026-11-10", hasta: "2026-11-01" }, today);
    expect(!reversed.ok && reversed.error).toMatch(/anterior o igual/);
    const long = parseReportPeriod({ desde: "2025-01-01", hasta: "2026-11-20" }, today);
    expect(!long.ok && long.error).toMatch(/hasta un año/);
    // Con error, vuelve al período por defecto.
    expect(reversed.period).toEqual({ from: "2026-11-01", to: "2026-11-20" });
  });
});

describe("período en la URL y en la API", () => {
  it("arma los parámetros del panel y de la API", () => {
    const period = { from: "2026-10-01", to: "2026-10-31" };
    expect(reportPeriodSearch(period)).toBe("?desde=2026-10-01&hasta=2026-10-31");
    expect(toApiPeriodSearch(period).toString()).toBe("from=2026-10-01&to=2026-10-31");
  });
});
