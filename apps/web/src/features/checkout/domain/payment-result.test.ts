import { describe, expect, it } from "vitest";

import type { GuestPaymentStatus } from "@/features/orders";
import { PAYMENT_STATUSES } from "@/features/payments";

import {
  canRetryPayment,
  linkToOrder,
  orderPaymentStatus,
  paymentResultView,
} from "./payment-result";

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

describe("orderPaymentStatus", () => {
  const now = new Date("2026-11-24T12:00:00Z");
  const due = (minutes: number) => new Date(now.getTime() + minutes * 60_000).toISOString();
  const pending = (status: GuestPaymentStatus | null, minutes = 20) => ({
    status: "pending_payment",
    payment: { status, dueAt: due(minutes) },
  });

  it("el pedido manda: confirmado o más adelante es pagado", () => {
    for (const status of ["confirmed", "preparing", "shipped", "delivered"]) {
      expect(orderPaymentStatus({ status }, now)).toBe("paid");
    }
    // Flow informó el cobro pero la API aún no lo aplica: sigue pendiente.
    expect(orderPaymentStatus(pending("paid"), now)).toBe("pending");
  });

  it("rechazado permite reintentar mientras quede plazo", () => {
    expect(orderPaymentStatus(pending("rejected"), now)).toBe("rejected");
    expect(orderPaymentStatus(pending("voided"), now)).toBe("rejected");
    expect(orderPaymentStatus(pending("rejected", -1), now)).toBe("expired");
  });

  it("sin intento o pendiente: pendiente; vencido el plazo: vencido", () => {
    expect(orderPaymentStatus(pending(null), now)).toBe("pending");
    expect(orderPaymentStatus(pending("pending"), now)).toBe("pending");
    expect(orderPaymentStatus(pending("pending", -1), now)).toBe("expired");
  });

  it("en revisión, vencido o cancelado", () => {
    expect(orderPaymentStatus(pending("in_review"), now)).toBe("in_review");
    expect(orderPaymentStatus({ status: "in_review" }, now)).toBe("in_review");
    expect(orderPaymentStatus({ status: "expired" }, now)).toBe("expired");
    expect(orderPaymentStatus({ status: "cancelled" }, now)).toBe("expired");
  });
});

describe("linkToOrder", () => {
  it("apunta el seguimiento y la nueva consulta al pedido", () => {
    expect(linkToOrder({ label: "x", href: "/seguimiento" }, "TK-1001").href).toBe(
      "/seguimiento/TK-1001",
    );
    expect(linkToOrder({ label: "x", href: "/checkout/resultado" }, "TK-1001").href).toBe(
      "/checkout/resultado?pedido=TK-1001",
    );
    expect(linkToOrder({ label: "x", href: "/carrito" }, "TK-1001").href).toBe("/carrito");
  });
});
