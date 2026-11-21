import { describe, expect, it } from "vitest";

import { PAYMENT_STATUSES } from "@/features/payments";

import { canRetryPayment, paymentResultView } from "./payment-result";

describe("paymentResultView", () => {
  it("tiene título, mensaje y dos acciones para cada estado", () => {
    for (const status of PAYMENT_STATUSES) {
      const view = paymentResultView(status);
      expect(view.status).toBe(status);
      expect(view.title).not.toBe("");
      expect(view.message).not.toBe("");
      expect(view.primary.href).not.toBe(view.secondary.href);
    }
  });

  it("un estado desconocido se muestra como pendiente, nunca como pagado", () => {
    const view = paymentResultView(null);
    expect(view.status).toBe("pending");
    expect(view.retry).toBe("wait");
  });

  it("el pago confirmado lleva a los pedidos", () => {
    const view = paymentResultView("paid");
    expect(view.tone).toBe("success");
    expect(view.retry).toBe("none");
    expect(view.primary.href).toBe("/seguimiento");
  });

  it("el vencido vuelve al carrito para revalidar precio y stock", () => {
    const view = paymentResultView("expired");
    expect(view.retry).toBe("restart");
    expect(view.primary.href).toBe("/carrito");
  });
});

describe("reintento seguro", () => {
  it("solo se puede volver a pagar un intento rechazado", () => {
    expect(canRetryPayment("rejected")).toBe(true);
    expect(paymentResultView("rejected").primary.href).toBe("/checkout/pago");
  });

  it("no ofrece pagar de nuevo si el cobro podría estar en curso", () => {
    for (const status of ["pending", "in_review", null] as const) {
      expect(canRetryPayment(status)).toBe(false);
      const view = paymentResultView(status);
      expect([view.primary.href, view.secondary.href]).not.toContain("/checkout/pago");
    }
  });

  it("tampoco con pagos confirmados o vencidos", () => {
    expect(canRetryPayment("paid")).toBe(false);
    expect(canRetryPayment("expired")).toBe(false);
  });
});
