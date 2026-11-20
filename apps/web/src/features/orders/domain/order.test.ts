import { describe, expect, it } from "vitest";

import {
  ORDER_STATUSES,
  orderSubtotal,
  orderTone,
  orderTotal,
  orderUnits,
  sortByNewest,
  TRACKING_STEPS,
  trackingProgress,
} from "./order";

const lines = [
  { name: "Cama", sku: "TK-1", detail: null, quantity: 1, unitPrice: 90000 },
  { name: "Librero", sku: "TK-2", detail: null, quantity: 2, unitPrice: 49990 },
];

describe("totales del pedido", () => {
  it("suma líneas, despacho y descuento", () => {
    expect(orderSubtotal({ lines })).toBe(189980);
    expect(orderTotal({ lines, shipping: 4990, discount: 10000 })).toBe(184970);
    expect(orderUnits({ lines })).toBe(3);
  });
});

describe("seguimiento", () => {
  it("cada estado tiene un avance o se marca como detenido", () => {
    for (const status of ORDER_STATUSES) {
      const done = trackingProgress(status);
      if (done !== null) expect(done).toBeGreaterThanOrEqual(1);
      if (done !== null) expect(done).toBeLessThanOrEqual(TRACKING_STEPS.length);
    }
  });

  it("avanza en orden hasta entregado", () => {
    expect(trackingProgress("pending_payment")).toBe(1);
    expect(trackingProgress("confirmed")).toBe(2);
    expect(trackingProgress("shipped")).toBe(4);
    expect(trackingProgress("delivered")).toBe(5);
  });

  it("cancelados y vencidos no avanzan", () => {
    expect(trackingProgress("cancelled")).toBeNull();
    expect(trackingProgress("expired")).toBeNull();
    expect(orderTone("cancelled")).toBe("closed");
  });
});

describe("sortByNewest", () => {
  it("ordena del más reciente al más antiguo", () => {
    const orders = [
      { createdAt: "2026-10-02" },
      { createdAt: "2026-11-19" },
      { createdAt: "2026-11-10" },
    ];
    expect(
      sortByNewest(orders as never).map((o) => (o as { createdAt: string }).createdAt),
    ).toEqual(["2026-11-19", "2026-11-10", "2026-10-02"]);
  });
});
