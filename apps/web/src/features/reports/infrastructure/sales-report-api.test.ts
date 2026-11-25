import { describe, expect, it } from "vitest";

import { PANEL_MESSAGES } from "@/shared/lib/panel-errors";

import { toSalesReport } from "./sales-report-api";

const report = {
  period: { from: "2026-11-01", to: "2026-11-25" },
  currency: "CLP",
  timeZone: "America/Santiago",
  criteria: "Cobros por fecha de pago y reembolsos por su propia fecha (días de Chile).",
  charged: 200_000,
  refunded: 30_000,
  net: 170_000,
  paidOrders: 2,
  averageTicket: 100_000,
  refundsCount: 1,
  sales: [
    {
      orderId: "o1",
      orderRef: "TK-1048",
      buyerName: "Ana",
      method: "Flow",
      paidAt: "2026-11-10T14:00:00.000Z",
      charged: 100_000,
      refundedInPeriod: 30_000,
    },
  ],
  byProduct: [{ name: "Cuna alta", sku: "TK-6536", units: 2, amount: 190_000 }],
  byMethod: [{ method: "Flow", orders: 2, charged: 200_000, refunded: 30_000 }],
  refunds: [
    {
      id: "r1",
      orderId: "o1",
      orderRef: "TK-1048",
      date: "2026-11-15",
      amount: 30_000,
      method: "Transferencia",
      reference: "TRX-1",
    },
  ],
};

describe("toSalesReport", () => {
  it("traduce el reporte con los reembolsos aparte", () => {
    const result = toSalesReport(report);
    expect(result).toMatchObject({ charged: 200_000, refunded: 30_000, net: 170_000 });
    expect(result.sales[0]?.orderRef).toBe("TK-1048");
    expect(result.refunds[0]).toEqual({
      id: "r1",
      orderRef: "TK-1048",
      date: "2026-11-15",
      amount: 30_000,
      method: "Transferencia",
      reference: "TRX-1",
    });
  });

  it("un cuerpo inesperado cuenta como API no disponible", () => {
    expect(() => toSalesReport({ ...report, charged: "mucho" })).toThrow(
      PANEL_MESSAGES.unavailable,
    );
  });
});
