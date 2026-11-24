import { describe, expect, it } from "vitest";

import { PANEL_MESSAGES } from "@/shared/lib/panel-errors";

import { toPaymentPage } from "./admin-payments-api";

const item = {
  id: "p1",
  orderId: "o1",
  orderRef: "TK-1053",
  buyerName: "Ana",
  attempt: 2,
  commerceOrder: "TK-1053-2",
  flowOrder: null,
  amount: 59990,
  status: "in_review",
  statusLabel: "En revisión",
  paymentMethod: null,
  createdAt: "2026-11-20T12:00:00.000Z",
  paidAt: null,
  lastCheckedAt: null,
  current: true,
  reconcilable: true,
};

describe("toPaymentPage", () => {
  it("traduce los intentos y completa los conteos que faltan con 0", () => {
    const page = toPaymentPage({
      items: [
        item,
        {
          ...item,
          id: "p0",
          commerceOrder: "TK-1053-1",
          status: "voided",
          current: false,
          reconcilable: false,
        },
      ],
      meta: { page: 1, pageSize: 20, total: 2, totalPages: 1 },
      counts: { in_review: 1, voided: 1 },
    });
    expect(page.rows.map((r) => [r.orderId, r.status, r.reconcilable])).toEqual([
      ["TK-1053", "in_review", true],
      ["TK-1053", "voided", false],
    ]);
    expect(page.counts).toEqual({
      paid: 0,
      pending: 0,
      rejected: 0,
      in_review: 1,
      expired: 0,
      voided: 1,
    });
    expect(page.pageCount).toBe(1);
  });

  it("un estado desconocido cuenta como API no disponible", () => {
    expect(() =>
      toPaymentPage({
        items: [{ ...item, status: "otro" }],
        meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        counts: {},
      }),
    ).toThrow(PANEL_MESSAGES.unavailable);
  });
});
