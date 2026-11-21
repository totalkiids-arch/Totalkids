import { describe, expect, it } from "vitest";

import {
  buildSalesReport,
  chileDay,
  parseReportPeriod,
  reportCsvRows,
  type SaleRecord,
} from "./sales-report";

const sale = (overrides: Partial<SaleRecord>): SaleRecord => ({
  orderId: "TK-1",
  buyerName: "Camila",
  method: "Flow",
  paidAt: "2026-11-10T14:00:00.000Z",
  charged: 100_000,
  lines: [{ name: "Cuna alta", sku: "TK-6536", quantity: 1, amount: 95_010 }],
  refunds: [],
  ...overrides,
});

const NOV = { from: "2026-11-01", to: "2026-11-30" };

describe("chileDay", () => {
  it("usa el día de Chile, no el de UTC", () => {
    // 02:00 UTC del 1 de diciembre es todavía 30 de noviembre en Chile (UTC-3).
    expect(chileDay("2026-12-01T02:00:00.000Z")).toBe("2026-11-30");
  });
});

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

describe("buildSalesReport", () => {
  it("suma cobros del período por fecha de cobro", () => {
    const report = buildSalesReport(
      [
        sale({ orderId: "TK-1", charged: 100_000 }),
        sale({ orderId: "TK-2", charged: 50_000, paidAt: "2026-11-25T15:00:00.000Z" }),
        sale({ orderId: "TK-3", charged: 70_000, paidAt: "2026-10-31T15:00:00.000Z" }),
      ],
      NOV,
    );
    expect(report.charged).toBe(150_000);
    expect(report.paidOrders).toBe(2);
    expect(report.averageTicket).toBe(75_000);
    expect(report.sales.map((s) => s.orderId)).toEqual(["TK-2", "TK-1"]);
  });

  it("informa los reembolsos aparte, según su propia fecha", () => {
    const report = buildSalesReport(
      [
        sale({ orderId: "TK-1", refunds: [{ date: "2026-11-15", amount: 20_000 }] }),
        // Cobro de octubre reembolsado en noviembre: cuenta como reembolso de noviembre.
        sale({
          orderId: "TK-3",
          paidAt: "2026-10-20T15:00:00.000Z",
          refunds: [{ date: "2026-11-02", amount: 30_000 }],
        }),
        // Reembolso de diciembre: no cuenta en noviembre.
        sale({ orderId: "TK-4", refunds: [{ date: "2026-12-01", amount: 5_000 }] }),
      ],
      NOV,
    );
    expect(report.charged).toBe(200_000);
    expect(report.refunded).toBe(50_000);
    expect(report.net).toBe(150_000);
    expect(report.byMethod).toEqual([
      { method: "Flow", orders: 2, charged: 200_000, refunded: 50_000 },
    ]);
  });

  it("agrupa ventas por producto, de mayor a menor monto", () => {
    const report = buildSalesReport(
      [
        sale({
          orderId: "TK-1",
          lines: [
            { name: "Cuna alta", sku: "TK-6536", quantity: 1, amount: 245_990 },
            { name: "Librero", sku: "TK-7845", quantity: 2, amount: 99_980 },
          ],
        }),
        sale({
          orderId: "TK-2",
          lines: [{ name: "Librero", sku: "TK-7845", quantity: 1, amount: 49_990 }],
        }),
      ],
      NOV,
    );
    expect(report.byProduct).toEqual([
      { name: "Cuna alta", sku: "TK-6536", units: 1, amount: 245_990 },
      { name: "Librero", sku: "TK-7845", units: 3, amount: 149_970 },
    ]);
  });

  it("sin ventas, todo en cero", () => {
    const report = buildSalesReport([], NOV);
    expect(report).toMatchObject({ charged: 0, refunded: 0, net: 0, paidOrders: 0 });
    expect(report.averageTicket).toBe(0);
    expect(report.byProduct).toEqual([]);
  });

  it("arma las filas del CSV, una por venta", () => {
    const report = buildSalesReport(
      [sale({ refunds: [{ date: "2026-11-15", amount: 20_000 }] })],
      NOV,
    );
    expect(reportCsvRows(report, () => "2026-11-10 11:00")).toEqual([
      ["TK-1", "2026-11-10 11:00", "Camila", "Flow", 100_000, 20_000],
    ]);
  });
});
