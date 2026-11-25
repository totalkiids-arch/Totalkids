import { describe, expect, it } from "vitest";

import {
  availableResolutions,
  decideAfterFlow,
  decideUncertain,
  FLOW_GRACE_MS,
  flowSaidPaid,
  flowWindowClosed,
  nextCheckDelay,
  RECONCILE_MAX_ATTEMPTS,
} from "../src/services/reconciliation/rules.js";

// Reglas puras de la conciliación y los vencimientos (LN-15).

const MIN = 60_000;
const due = new Date("2026-11-25T12:00:00.000Z");
const at = (ms: number) => new Date(due.getTime() + ms);

describe("backoff de la conciliación", () => {
  it("espera 2, 5, 15, 30 y 60 minutos, y luego cada 60", () => {
    expect([1, 2, 3, 4, 5, 6, 20].map((n) => nextCheckDelay(n) / MIN)).toEqual([
      2, 5, 15, 30, 60, 60, 60,
    ]);
    expect(nextCheckDelay(0)).toBe(2 * MIN);
  });
});

describe("plazo de Flow", () => {
  it("cierra el plazo de pago más el margen", () => {
    expect(flowWindowClosed(due, at(FLOW_GRACE_MS - 1))).toBe(false);
    expect(flowWindowClosed(due, at(FLOW_GRACE_MS))).toBe(true);
  });
});

describe("después de que Flow responde", () => {
  const base = { orderStatus: "pending_payment" as const, paymentDueAt: due };

  it("pagado: lo resolvió settlePayment", () => {
    expect(decideAfterFlow({ ...base, flowStatus: "paid", now: at(-MIN) })).toBe("done");
  });

  it("pendiente: espera dentro del plazo y vence el intento pasado el margen", () => {
    expect(decideAfterFlow({ ...base, flowStatus: "pending", now: at(MIN) })).toBe("wait");
    expect(decideAfterFlow({ ...base, flowStatus: "pending", now: at(FLOW_GRACE_MS) })).toBe(
      "expire_payment",
    );
  });

  it("rechazado: con plazo vigente el comprador puede reintentar; vencido o en revisión, vence", () => {
    expect(decideAfterFlow({ ...base, flowStatus: "rejected", now: at(-MIN) })).toBe("done");
    expect(decideAfterFlow({ ...base, flowStatus: "voided", now: at(MIN) })).toBe("expire");
    expect(
      decideAfterFlow({ ...base, orderStatus: "in_review", flowStatus: "rejected", now: at(-MIN) }),
    ).toBe("expire");
  });
});

describe("consulta incierta (RN-04)", () => {
  const base = { orderStatus: "pending_payment" as const, paymentDueAt: due };

  it("con el plazo vigente reintenta, y a los N intentos pasa a revisión", () => {
    expect(decideUncertain({ ...base, attempts: 1, now: at(-MIN) })).toBe("wait");
    expect(decideUncertain({ ...base, attempts: RECONCILE_MAX_ATTEMPTS, now: at(-MIN) })).toBe(
      "review",
    );
  });

  it("con el plazo vencido no vence: pasa a revisión", () => {
    expect(decideUncertain({ ...base, attempts: 1, now: at(0) })).toBe("review");
  });

  it("un intento abierto de un pedido ya confirmado espera hasta agotar intentos", () => {
    expect(decideUncertain({ ...base, orderStatus: "confirmed", attempts: 2, now: at(MIN) })).toBe(
      "wait",
    );
  });
});

describe("resoluciones manuales", () => {
  it("en revisión sin cobro: liberar; con cobro: reembolso pendiente", () => {
    expect(
      availableResolutions({
        paymentStatus: "in_review",
        flowSaysPaid: false,
        orderStatus: "in_review",
      }),
    ).toEqual(["release"]);
    expect(
      availableResolutions({
        paymentStatus: "in_review",
        flowSaysPaid: true,
        orderStatus: "confirmed",
      }),
    ).toEqual(["refund_pending"]);
  });

  it("pago tardío sin stock: confirmar o reembolso pendiente", () => {
    expect(
      availableResolutions({ paymentStatus: "paid", flowSaysPaid: true, orderStatus: "in_review" }),
    ).toEqual(["confirm", "refund_pending"]);
  });

  it("nada que resolver en un pago pendiente, pagado y aplicado o cerrado", () => {
    for (const paymentStatus of ["pending", "paid", "voided", "refund_pending"] as const) {
      expect(
        availableResolutions({ paymentStatus, flowSaysPaid: false, orderStatus: "confirmed" }),
      ).toEqual([]);
    }
  });

  it("lee el último estado informado por Flow", () => {
    expect(flowSaidPaid({ status: "paid" })).toBe(true);
    expect(flowSaidPaid({ status: "pending" })).toBe(false);
    expect(flowSaidPaid(null)).toBe(false);
  });
});
