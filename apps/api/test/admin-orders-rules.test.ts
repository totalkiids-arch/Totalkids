import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { OrderStatus } from "../src/generated/prisma/enums.js";
import {
  ALLOWED_TRANSITIONS,
  availableTransitions,
  blockedByUnresolvedPayment,
  canRecordRestock,
  committedRefunds,
  invoiceAllowed,
  invoicePending,
  MESSAGES,
  needsTracking,
  normalizeFolio,
  ORDER_STATUS_LABEL,
  orderPaymentStatus,
  orderRef,
  processedRefunds,
  REASON_MAX,
  REFERENCE_MAX,
  refundableAmount,
  refundOverMessage,
  refundState,
  TRACKING_MAX,
  transitionBlock,
  type WorkflowOrder,
  type WorkflowPayment,
} from "../src/services/admin-orders/rules.js";
import { invoiceBody, parseOrderRef, refundBody } from "../src/services/admin-orders/schemas.js";

// Reglas puras del panel de pedidos (LN-13). La tabla y los textos deben ser los
// del dominio del panel (apps/web/src/features/orders/domain): se comparan con
// el texto de esos archivos, sin importarlos, para no acoplar los paquetes.
const webDir = new URL("../../web/src/features/orders/domain/", import.meta.url);
const webWorkflow = readFileSync(new URL("order-workflow.ts", webDir), "utf8");
const webOrder = readFileSync(new URL("order.ts", webDir), "utf8");

/** Mensajes que solo existen en la API (corrección de folio y folio repetido). */
const API_ONLY = new Set<keyof typeof MESSAGES>([
  "invoiceDuplicate",
  "invoiceSame",
  "invoiceReplaceReason",
  "invoiceReplaceForbidden",
]);

const STATUSES = Object.keys(ALLOWED_TRANSITIONS) as OrderStatus[];

const payment = (status: WorkflowPayment["status"], attempt = 1, amount = 30_000) => ({
  attempt,
  status,
  amount,
  paidAt: status === "paid" ? new Date("2026-11-20T15:00:00Z") : null,
});

function order(spec: Partial<WorkflowOrder> = {}): WorkflowOrder {
  return {
    status: "pending_payment",
    deliveryMethod: "shipping",
    taxDocument: "boleta",
    invoiceFolio: null,
    restockRecordedAt: null,
    payments: [],
    refunds: [],
    unsettled: false,
    ...spec,
  };
}

const paid = (status: OrderStatus, extra: Partial<WorkflowOrder> = {}) =>
  order({ status, payments: [payment("paid")], ...extra });

describe("tabla de transiciones (SRS, RF-27)", () => {
  it("es la de la SRS; entregado, cancelado y vencido son terminales", () => {
    expect(ALLOWED_TRANSITIONS).toEqual({
      pending_payment: ["confirmed", "cancelled", "expired"],
      in_review: ["confirmed", "cancelled"],
      confirmed: ["preparing", "cancelled"],
      preparing: ["shipped", "cancelled"],
      shipped: ["delivered"],
      delivered: [],
      cancelled: [],
      expired: [],
    });
  });

  it("coincide con la del panel (order-workflow.ts)", () => {
    const block = /ALLOWED_TRANSITIONS[^=]*=\s*\{([\s\S]*?)\};/.exec(webWorkflow)?.[1] ?? "";
    const web = Object.fromEntries(
      [...block.matchAll(/(\w+):\s*\[([^\]]*)\]/g)].map(([, from, list]) => [
        from,
        [...(list ?? "").matchAll(/"(\w+)"/g)].map((m) => m[1]),
      ]),
    );
    expect(web).toEqual(ALLOWED_TRANSITIONS);
  });

  it('fuera de la tabla: «Un pedido "X" no puede pasar a "Y".»', () => {
    for (const from of STATUSES) {
      for (const to of STATUSES) {
        if (ALLOWED_TRANSITIONS[from].includes(to)) continue;
        expect(transitionBlock(paid(from), to), `${from} → ${to}`).toEqual({
          field: "to",
          message: `Un pedido "${ORDER_STATUS_LABEL[from]}" no puede pasar a "${ORDER_STATUS_LABEL[to]}".`,
        });
      }
    }
  });

  it("todas las transiciones de la tabla se permiten con el pago confirmado y asentado", () => {
    for (const from of STATUSES) {
      for (const to of ALLOWED_TRANSITIONS[from]) {
        expect(transitionBlock(paid(from), to), `${from} → ${to}`).toBeNull();
      }
    }
  });
});

describe("guardas de pago", () => {
  it("no se confirma sin pago confirmado ni con el pago sin asentar (reservas o cupón)", () => {
    const unpaid = { field: "to", message: MESSAGES.unpaidConfirm };
    expect(transitionBlock(order(), "confirmed")).toEqual(unpaid);
    expect(transitionBlock(order({ payments: [payment("rejected")] }), "confirmed")).toEqual(
      unpaid,
    );
    expect(transitionBlock(paid("pending_payment", { unsettled: true }), "confirmed")).toEqual(
      unpaid,
    );
    expect(transitionBlock(paid("in_review"), "confirmed")).toBeNull();
  });

  it("no se despacha sin pago confirmado", () => {
    expect(transitionBlock(order({ status: "preparing" }), "shipped")).toEqual({
      field: "to",
      message: MESSAGES.unpaidShip,
    });
  });

  it("RN-04: con el último intento pendiente o en revisión no se cancela ni vence", () => {
    const blocked = { field: "to", message: MESSAGES.unresolvedPayment };
    for (const status of ["pending", "in_review"] as const) {
      const o = order({ payments: [payment("rejected", 1), payment(status, 2)] });
      expect(orderPaymentStatus(o)).toBe(status);
      expect(transitionBlock(o, "cancelled")).toEqual(blocked);
      expect(transitionBlock(o, "expired")).toEqual(blocked);
      expect(blockedByUnresolvedPayment(o)).toBe(true);
      expect(availableTransitions(o)).toEqual([]);
    }
    // Un intento viejo pendiente no cuenta si el último ya se resolvió.
    const resolved = order({ payments: [payment("pending", 1), payment("rejected", 2)] });
    expect(orderPaymentStatus(resolved)).toBe("rejected");
    expect(availableTransitions(resolved)).toEqual(["cancelled", "expired"]);
    expect(blockedByUnresolvedPayment(resolved)).toBe(false);
  });

  it("sin intentos de pago el estado es none y se puede cancelar o vencer", () => {
    expect(orderPaymentStatus(order())).toBe("none");
    expect(availableTransitions(order())).toEqual(["cancelled", "expired"]);
  });
});

describe("reposición (RN-06) y despacho", () => {
  it("solo al cancelar un pedido pagado (confirmado o en preparación), una vez", () => {
    expect(canRecordRestock(paid("confirmed"), "cancelled")).toBe(true);
    expect(canRecordRestock(paid("preparing"), "cancelled")).toBe(true);
    expect(canRecordRestock(paid("preparing"), "shipped")).toBe(false);
    expect(canRecordRestock(order(), "cancelled")).toBe(false);
    expect(canRecordRestock(paid("in_review"), "cancelled")).toBe(false);
    expect(
      canRecordRestock(paid("confirmed", { restockRecordedAt: new Date() }), "cancelled"),
    ).toBe(false);
  });

  it("transportista y código solo al despachar a domicilio (retiro = listo para retiro)", () => {
    expect(needsTracking({ deliveryMethod: "shipping" }, "shipped")).toBe(true);
    expect(needsTracking({ deliveryMethod: "pickup" }, "shipped")).toBe(false);
    expect(needsTracking({ deliveryMethod: "shipping" }, "delivered")).toBe(false);
  });
});

describe("reembolsos (RF-32)", () => {
  const refunds = [
    { status: "processed", amount: 5_000 },
    { status: "requested", amount: 7_000 },
    { status: "failed", amount: 30_000 },
  ] as const;

  it("el tope cuenta solicitados y procesados, no los fallidos", () => {
    expect(committedRefunds(refunds)).toBe(12_000);
    expect(processedRefunds(refunds)).toBe(5_000);
    expect(refundableAmount(paid("confirmed", { refunds }))).toBe(18_000);
    expect(refundableAmount(order({ refunds }))).toBe(0);
  });

  it("estado del reembolso del pedido", () => {
    expect(refundState([])).toBe("not_requested");
    expect(refundState(refunds)).toBe("requested");
    expect(refundState([refunds[0], refunds[2]])).toBe("processed");
    expect(refundState([refunds[2]])).toBe("failed");
  });

  it("mensaje del tope con lo que queda, en pesos chilenos", () => {
    expect(refundOverMessage(10_000)).toBe(
      "El monto supera lo cobrado: quedan $10.000 por registrar.",
    );
    expect(refundOverMessage(0)).toBe(MESSAGES.refundFull);
  });

  it("forma del cuerpo: entero > 0, fecha real, referencia de 3 a 120", () => {
    const ok = refundBody.safeParse({
      amount: 1,
      date: "2026-11-20",
      reference: "  TRX-1  ",
      status: "requested",
    });
    expect(ok.success && ok.data.reference).toBe("TRX-1");
    const bad = refundBody.safeParse({
      amount: -3,
      date: "2026-13-01",
      reference: "x".repeat(REFERENCE_MAX + 1),
      status: "failed",
    });
    expect(bad.success).toBe(false);
    const messages = Object.fromEntries(
      (bad.error?.issues ?? []).map((i) => [i.path.join("."), i.message]),
    );
    expect(messages).toEqual({
      amount: MESSAGES.refundAmount,
      date: MESSAGES.refundDate,
      reference: MESSAGES.refundReferenceLong,
      status: MESSAGES.refundStatus,
    });
  });
});

describe("factura (UI-12)", () => {
  it("pendiente = factura + pagado + sin folio", () => {
    const base = { taxDocument: "factura", invoiceFolio: null } as const;
    expect(invoicePending({ ...base, status: "confirmed" })).toBe(true);
    expect(invoicePending({ ...base, status: "delivered" })).toBe(true);
    expect(invoicePending({ ...base, status: "pending_payment" })).toBe(false);
    expect(invoicePending({ ...base, status: "cancelled" })).toBe(false);
    expect(invoicePending({ ...base, status: "confirmed", invoiceFolio: "12" })).toBe(false);
    expect(invoicePending({ ...base, status: "confirmed", taxDocument: "boleta" })).toBe(false);
    expect(invoiceAllowed({ status: "shipped" })).toBe(true);
    expect(invoiceAllowed({ status: "in_review" })).toBe(false);
  });

  it("folio: solo dígitos (hasta 10), sin espacios ni ceros a la izquierda", () => {
    expect(normalizeFolio("000123")).toBe("123");
    expect(normalizeFolio("  4567 ")).toBe("4567");
    expect(normalizeFolio("0")).toBe("0");
    expect(normalizeFolio("000")).toBe("0");
    expect(normalizeFolio("0001234567890")).toBe("1234567890");
    for (const bad of ["", "  ", "12a", "1.234", "-5", "12345678901"]) {
      expect(normalizeFolio(bad), bad).toBeNull();
    }
    const parsed = invoiceBody.safeParse({ number: "00987" });
    expect(parsed.success && parsed.data).toEqual({ number: "987", replace: false });
    expect(invoiceBody.safeParse({ number: "9x" }).error?.issues[0]?.message).toBe(
      MESSAGES.invoiceNumber,
    );
  });
});

describe("referencia del pedido en la ruta", () => {
  it("uuid o número visible", () => {
    expect(parseOrderRef("TK-1048")).toEqual({ number: 1048 });
    expect(parseOrderRef("tk1048")).toEqual({ number: 1048 });
    expect(parseOrderRef("1048")).toEqual({ number: 1048 });
    expect(parseOrderRef("0193A8F2-1C3D-7E4F-8A9B-0C1D2E3F4A5B")).toEqual({
      id: "0193a8f2-1c3d-7e4f-8a9b-0c1d2e3f4a5b",
    });
    expect(parseOrderRef("TK-")).toBeNull();
    expect(parseOrderRef("1'; DROP")).toBeNull();
    expect(orderRef(1048)).toBe("TK-1048");
  });
});

describe("textos del panel", () => {
  it("las etiquetas de estado son las del panel", () => {
    for (const label of Object.values(ORDER_STATUS_LABEL)) {
      expect(webOrder, label).toContain(`"${label}"`);
    }
  });

  it("cada mensaje de la API es literal el del panel (salvo los de corrección de folio)", () => {
    const limits: Record<string, number> = { REASON_MAX, TRACKING_MAX, REFERENCE_MAX };
    // En el panel los topes van interpolados: "${REASON_MAX}" → 500.
    const web = webWorkflow.replace(/\$\{(\w+)\}/g, (all, name: string) =>
      name in limits ? String(limits[name]) : all,
    );
    for (const [key, text] of Object.entries(MESSAGES)) {
      if (API_ONLY.has(key as keyof typeof MESSAGES)) continue;
      expect(web, key).toContain(text);
    }
    for (const key of API_ONLY) expect(web, key).not.toContain(MESSAGES[key]);
  });
});
