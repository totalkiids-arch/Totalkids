import { describe, expect, it } from "vitest";

import type { Order, OrderStatus } from "./order";
import {
  applyReconciliation,
  applyRefund,
  applyStatusChange,
  availableTransitions,
  blockedByUnresolvedPayment,
  canRecordRestock,
  chargedAmount,
  committedRefunds,
  ordersOverview,
  orderPaymentStatus,
  refundableAmount,
  refundState,
  resolveRefund,
  UNPAID_CONFIRM_MESSAGE,
  UNPAID_SHIP_MESSAGE,
  UNRESOLVED_PAYMENT_MESSAGE,
  validateRefund,
  validateStatusChange,
  type AdminOrderRecord,
  type PaymentAttempt,
  type RefundInput,
  type StatusChangeInput,
} from "./order-workflow";

const ctx = { actor: "Operador", at: "2026-11-20T12:00:00.000Z" };
const TODAY = "2026-11-20";

function attempt(status: PaymentAttempt["status"], amount = 100000): PaymentAttempt {
  return {
    commerceOrder: "TK-1-1",
    flowOrder: null,
    amount,
    status,
    createdAt: "2026-11-18T10:00:00-03:00",
    lastCheckedAt: null,
  };
}

function record(
  status: OrderStatus,
  attempts: PaymentAttempt[] = [],
  extra: Partial<AdminOrderRecord> = {},
): AdminOrderRecord {
  const order: Order = {
    id: "TK-1",
    createdAt: "2026-11-18T10:00:00-03:00",
    email: "a@example.com",
    buyerName: "Ana",
    status,
    lines: [{ name: "Cama", sku: "TK-9", detail: null, quantity: 2, unitPrice: 47500 }],
    shipping: 5000,
    discount: 0,
    delivery: { method: "domicilio", address: "Calle 1" },
    document: "boleta",
    tracking: null,
    history: [{ at: "2026-11-18T10:00:00-03:00", label: "Pedido recibido" }],
  };
  return { order, attempts, refunds: [], audit: [], restockRecordedAt: null, ...extra };
}

const change = (to: string, more: Partial<StatusChangeInput> = {}): StatusChangeInput => ({
  to,
  reason: "Cambio de prueba",
  carrier: "",
  code: "",
  restock: false,
  ...more,
});

describe("transiciones permitidas (RF-27)", () => {
  it("sigue la tabla de la SRS cuando el pago está confirmado", () => {
    const paid = [attempt("paid")];
    expect(availableTransitions(record("confirmed", paid))).toEqual(["preparing", "cancelled"]);
    expect(availableTransitions(record("preparing", paid))).toEqual(["shipped", "cancelled"]);
    expect(availableTransitions(record("shipped", paid))).toEqual(["delivered"]);
    expect(availableTransitions(record("in_review", paid))).toEqual(["confirmed", "cancelled"]);
  });

  it("los estados finales no ofrecen transiciones", () => {
    for (const status of ["delivered", "cancelled", "expired"] as const) {
      expect(availableTransitions(record(status, [attempt("paid")]))).toEqual([]);
    }
  });

  it("un despachado no vuelve a cancelado (requiere gestión de devolución)", () => {
    const errors = validateStatusChange(record("shipped", [attempt("paid")]), change("cancelled"));
    expect(errors.to).toMatch(/no puede pasar/);
  });

  it("sin pago confirmado no se confirma ni se despacha", () => {
    const review = record("in_review", [attempt("in_review")]);
    expect(availableTransitions(review)).not.toContain("confirmed");
    expect(validateStatusChange(review, change("confirmed")).to).toBe(UNPAID_CONFIRM_MESSAGE);

    const unpaidPreparing = record("preparing", [attempt("pending")]);
    expect(validateStatusChange(unpaidPreparing, change("shipped")).to).toBe(UNPAID_SHIP_MESSAGE);
  });

  it("pendiente de pago sin intento abierto puede vencer o cancelarse, no confirmarse", () => {
    expect(availableTransitions(record("pending_payment", [attempt("rejected")]))).toEqual([
      "cancelled",
      "expired",
    ]);
  });

  it("no cancela un pedido pendiente con un pago sin resolver (RN-04/RN-06)", () => {
    for (const status of ["pending", "in_review"] as const) {
      const r = record("pending_payment", [attempt("rejected"), attempt(status)]);
      expect(availableTransitions(r)).not.toContain("cancelled");
      expect(blockedByUnresolvedPayment(r)).toBe(true);
      expect(validateStatusChange(r, change("cancelled")).to).toBe(UNRESOLVED_PAYMENT_MESSAGE);
    }
    expect(blockedByUnresolvedPayment(record("pending_payment", [attempt("rejected")]))).toBe(
      false,
    );
  });

  it("el aviso del pago sin resolver nombra ambas acciones", () => {
    expect(UNRESOLVED_PAYMENT_MESSAGE).toBe(
      "Hay un pago sin resolver: concílialo en Pagos antes de cancelar o marcar como vencido.",
    );
  });

  it("no da por vencido un pedido pendiente con un pago sin resolver (RN-04)", () => {
    for (const status of ["pending", "in_review"] as const) {
      const r = record("pending_payment", [attempt("rejected"), attempt(status)]);
      expect(availableTransitions(r)).not.toContain("expired");
      expect(availableTransitions(r)).toEqual([]);
      expect(validateStatusChange(r, change("expired")).to).toBe(UNRESOLVED_PAYMENT_MESSAGE);
      expect(applyStatusChange(r, change("expired"), ctx).ok).toBe(false);
    }
    // Con el intento ya resuelto (rechazado), vuelve a poder vencer.
    const resolved = record("pending_payment", [attempt("rejected")]);
    expect(availableTransitions(resolved)).toContain("expired");
    expect(validateStatusChange(resolved, change("expired"))).toEqual({});
  });

  it("exige motivo en cada cambio", () => {
    const r = record("confirmed", [attempt("paid")]);
    expect(validateStatusChange(r, change("preparing", { reason: "  " })).reason).toMatch(/motivo/);
    expect(validateStatusChange(r, change("preparing", { reason: "x".repeat(501) })).reason).toBe(
      "El motivo admite hasta 500 caracteres.",
    );
    expect(applyStatusChange(r, change("preparing", { reason: "" }), ctx).ok).toBe(false);
  });

  it("para despachar exige transportista y código de seguimiento", () => {
    const r = record("preparing", [attempt("paid")]);
    const errors = validateStatusChange(r, change("shipped"));
    expect(errors.carrier).toMatch(/transportista/);
    expect(errors.code).toMatch(/seguimiento/);
    expect(validateStatusChange(r, change("shipped", { carrier: "Starken", code: "123" }))).toEqual(
      {},
    );
  });

  it("rechaza un estado desconocido", () => {
    expect(validateStatusChange(record("confirmed", [attempt("paid")]), change("x")).to).toBe(
      "Elige el nuevo estado.",
    );
  });
});

describe("aplicar un cambio de estado (RF-34)", () => {
  it("guarda actor, fecha y motivo, y avisa al comprador sin el motivo interno", () => {
    const r = record("preparing", [attempt("paid")]);
    const result = applyStatusChange(
      r,
      change("shipped", { carrier: " Starken ", code: " 998 ", reason: " Sale hoy " }),
      ctx,
    );
    if (!result.ok) throw new Error("debía aplicarse");
    const entry = result.record.audit.at(-1);
    expect(entry).toMatchObject({
      actor: "Operador",
      at: ctx.at,
      from: "preparing",
      to: "shipped",
      reason: "Sale hoy",
    });
    expect(result.record.order.status).toBe("shipped");
    expect(result.record.order.tracking).toEqual({ carrier: "Starken", code: "998" });
    expect(result.record.order.history.at(-1)).toEqual({
      at: ctx.at,
      label: "Despachado con Starken",
    });
    expect(r.order.status).toBe("preparing"); // no muta el original
  });

  it("cancelar un pedido pagado no marca dinero devuelto (RN-06)", () => {
    const r = record("confirmed", [attempt("paid")]);
    const result = applyStatusChange(r, change("cancelled"), ctx);
    if (!result.ok) throw new Error("debía aplicarse");
    expect(result.record.order.status).toBe("cancelled");
    expect(result.record.attempts).toEqual(r.attempts);
    expect(result.record.refunds).toEqual([]);
    expect(refundState(result.record)).toBe("not_requested");
    expect(orderPaymentStatus(result.record)).toBe("paid");
    expect(result.record.audit.at(-1)?.detail).toMatch(/no devuelve dinero/);
  });

  it("registra la reposición de stock una sola vez (RN-06)", () => {
    const r = record("preparing", [attempt("paid")]);
    expect(canRecordRestock(r, "cancelled")).toBe(true);
    expect(canRecordRestock(r, "shipped")).toBe(false);
    const result = applyStatusChange(r, change("cancelled", { restock: true }), ctx);
    if (!result.ok) throw new Error("debía aplicarse");
    expect(result.record.restockRecordedAt).toBe(ctx.at);
    expect(result.record.audit.filter((e) => e.kind === "restock")).toHaveLength(1);
    expect(result.record.audit.at(-1)?.detail).toMatch(/2 unidades/);

    const already = record("confirmed", [attempt("paid")], { restockRecordedAt: ctx.at });
    expect(canRecordRestock(already, "cancelled")).toBe(false);
    expect(validateStatusChange(already, change("cancelled", { restock: true })).restock).toMatch(
      /ya se registró/,
    );
  });

  it("no ofrece reposición al cancelar un pedido que no consumió stock", () => {
    const r = record("pending_payment", [attempt("rejected")]);
    expect(validateStatusChange(r, change("cancelled", { restock: true })).restock).toMatch(
      /pedido pagado/,
    );
  });
});

describe("reembolso manual (RF-32)", () => {
  const refund = (more: Partial<RefundInput> = {}): RefundInput => ({
    amount: 30000,
    date: "2026-11-19",
    reference: "TRF-001",
    responsible: "Administrador",
    status: "processed",
    ...more,
  });
  const paid = () => record("cancelled", [attempt("paid", 100000)]);

  it("solo sobre pedidos pagados", () => {
    expect(
      validateRefund(record("pending_payment", [attempt("pending")]), refund(), TODAY).form,
    ).toMatch(/pago confirmado/);
  });

  it("exige monto entero mayor que 0, fecha, referencia y responsable", () => {
    const r = paid();
    expect(validateRefund(r, refund({ amount: 0 }), TODAY).amount).toMatch(/mayor que 0/);
    expect(validateRefund(r, refund({ amount: 10.5 }), TODAY).amount).toMatch(/entero/);
    expect(validateRefund(r, refund({ date: "" }), TODAY).date).toMatch(/fecha/);
    expect(validateRefund(r, refund({ date: "2026-02-30" }), TODAY).date).toMatch(/fecha/);
    expect(validateRefund(r, refund({ date: "2026-11-21" }), TODAY).date).toMatch(/futura/);
    expect(validateRefund(r, refund({ date: "2026-11-01" }), TODAY).date).toMatch(/anterior/);
    expect(validateRefund(r, refund({ reference: " " }), TODAY).reference).toMatch(/referencia/);
    expect(validateRefund(r, refund({ responsible: "" }), TODAY).form).toMatch(/responsable/);
    expect(validateRefund(r, refund({ status: "x" }), TODAY).status).toBeDefined();
    expect(validateRefund(r, refund(), TODAY)).toEqual({});
  });

  it("el acumulado no supera lo cobrado (solicitados + procesados)", () => {
    let r = paid();
    const first = applyRefund(r, refund({ amount: 60000, status: "requested" }), {
      ...ctx,
      id: "r1",
      today: TODAY,
    });
    if (!first.ok) throw new Error("debía registrarse");
    r = first.record;
    expect(committedRefunds(r)).toBe(60000);
    expect(refundableAmount(r)).toBe(40000);
    expect(validateRefund(r, refund({ amount: 40001 }), TODAY).amount).toMatch(/supera/);
    expect(validateRefund(r, refund({ amount: 40000 }), TODAY)).toEqual({});
  });

  it("un reembolso fallido libera el tope; no cambia el cobro original", () => {
    const first = applyRefund(paid(), refund({ amount: 100000, status: "requested" }), {
      ...ctx,
      id: "r1",
      today: TODAY,
    });
    if (!first.ok) throw new Error("debía registrarse");
    expect(refundState(first.record)).toBe("requested");
    expect(validateRefund(first.record, refund({ amount: 1 }), TODAY).amount).toMatch(/todo/);

    const failed = resolveRefund(first.record, { refundId: "r1", status: "failed" }, ctx);
    if (!failed.ok) throw new Error("debía resolverse");
    expect(refundState(failed.record)).toBe("failed");
    expect(refundableAmount(failed.record)).toBe(100000);
    expect(chargedAmount(failed.record)).toBe(100000);
    expect(failed.record.attempts).toEqual(first.record.attempts);

    expect(resolveRefund(failed.record, { refundId: "r1", status: "processed" }, ctx).ok).toBe(
      false,
    );
  });

  it("deja registro en el historial con el responsable", () => {
    const result = applyRefund(paid(), refund(), {
      ...ctx,
      actor: "Administrador",
      id: "r1",
      today: TODAY,
    });
    if (!result.ok) throw new Error("debía registrarse");
    expect(result.record.refunds[0]).toMatchObject({
      responsible: "Administrador",
      status: "processed",
    });
    expect(result.record.audit.at(-1)).toMatchObject({ kind: "refund", actor: "Administrador" });
  });
});

describe("conciliación con Flow (RF-33)", () => {
  const input = (result: string) => ({ result, reason: "Consulta de prueba" });

  it("pagado confirma el pedido", () => {
    const result = applyReconciliation(
      record("in_review", [attempt("in_review")]),
      input("paid"),
      ctx,
    );
    if (!result.ok) throw new Error("debía aplicarse");
    expect(result.record.order.status).toBe("confirmed");
    expect(orderPaymentStatus(result.record)).toBe("paid");
    expect(result.record.attempts[0]?.lastCheckedAt).toBe(ctx.at);
    expect(result.record.audit.at(-1)).toMatchObject({
      kind: "payment",
      from: "in_review",
      to: "confirmed",
    });
  });

  it("rechazado deja el pedido pendiente para reintentar", () => {
    const fromReview = applyReconciliation(
      record("in_review", [attempt("in_review")]),
      input("rejected"),
      ctx,
    );
    if (!fromReview.ok) throw new Error("debía aplicarse");
    expect(fromReview.record.order.status).toBe("pending_payment");
    expect(orderPaymentStatus(fromReview.record)).toBe("rejected");

    const fromPending = applyReconciliation(
      record("pending_payment", [attempt("pending")]),
      input("rejected"),
      ctx,
    );
    if (!fromPending.ok) throw new Error("debía aplicarse");
    expect(fromPending.record.order.status).toBe("pending_payment");
  });

  it("sin respuesta queda en revisión, sin asumir rechazo (RN-04)", () => {
    const result = applyReconciliation(
      record("pending_payment", [attempt("pending")]),
      input("uncertain"),
      ctx,
    );
    if (!result.ok) throw new Error("debía aplicarse");
    expect(result.record.order.status).toBe("in_review");
    expect(orderPaymentStatus(result.record)).toBe("in_review");
  });

  it("un pago tardío sobre un pedido vencido queda en revisión (RN-05)", () => {
    const result = applyReconciliation(record("expired", [attempt("pending")]), input("paid"), ctx);
    if (!result.ok) throw new Error("debía aplicarse");
    expect(result.record.order.status).toBe("in_review");
    expect(result.record.audit.at(-1)?.detail).toMatch(/Pago tardío/);
  });

  it("solo concilia pagos pendientes o en revisión, con motivo", () => {
    expect(applyReconciliation(record("confirmed", [attempt("paid")]), input("paid"), ctx).ok).toBe(
      false,
    );
    const r = record("pending_payment", [attempt("pending")]);
    const bad = applyReconciliation(r, { result: "x", reason: "" }, ctx);
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.errors.result).toBeDefined();
      expect(bad.errors.reason).toBeDefined();
    }
  });
});

describe("resumen del panel", () => {
  it("separa cobros y reembolsos procesados y cuenta pagos abiertos", () => {
    const refunded = record("cancelled", [attempt("paid", 80000)], {
      refunds: [
        {
          id: "r1",
          amount: 30000,
          date: TODAY,
          reference: "x",
          responsible: "A",
          status: "processed",
          registeredAt: ctx.at,
          resolvedAt: ctx.at,
          resolvedBy: "A",
        },
        {
          id: "r2",
          amount: 10000,
          date: TODAY,
          reference: "y",
          responsible: "A",
          status: "requested",
          registeredAt: ctx.at,
          resolvedAt: null,
          resolvedBy: null,
        },
      ],
    });
    const overview = ordersOverview([
      record("confirmed", [attempt("paid", 100000)]),
      refunded,
      record("in_review", [attempt("in_review")]),
      record("pending_payment", [attempt("pending")]),
    ]);
    expect(overview.charged).toBe(180000);
    expect(overview.refunded).toBe(30000);
    expect(overview.paymentsInReview).toBe(1);
    expect(overview.paymentsPending).toBe(1);
    expect(overview.byStatus.confirmed).toBe(1);
    expect(overview.byStatus.delivered).toBe(0);
  });
});
