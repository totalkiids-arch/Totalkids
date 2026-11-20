import { describe, expect, it } from "vitest";

import {
  countPaymentAttempts,
  filterPaymentAttempts,
  isReconcilable,
  parsePaymentQuery,
  toPaymentSearch,
  type PaymentAttemptRow,
} from "./payment-query";

const row = (more: Partial<PaymentAttemptRow>): PaymentAttemptRow => ({
  orderId: "TK-1",
  buyerName: "Ana",
  commerceOrder: "TK-1-1",
  amount: 1000,
  status: "paid",
  createdAt: "2026-11-18T10:00:00-03:00",
  lastCheckedAt: null,
  current: true,
  ...more,
});

describe("consulta de pagos en la URL", () => {
  it("lee estado y pedido, y descarta valores inválidos", () => {
    expect(parsePaymentQuery({ estado: "in_review", pedido: "tk-1053" })).toEqual({
      status: "in_review",
      order: "TK-1053",
    });
    expect(parsePaymentQuery({ estado: "otro", pedido: "<script>" })).toEqual({
      status: "todos",
      order: "",
    });
    expect(parsePaymentQuery({ estado: ["pending", "paid"] }).status).toBe("pending");
  });

  it("arma la búsqueda omitiendo los valores por defecto", () => {
    expect(toPaymentSearch({ status: "todos", order: "" })).toBe("");
    expect(toPaymentSearch({ status: "pending", order: "TK-1051" })).toBe(
      "?estado=pending&pedido=TK-1051",
    );
  });
});

describe("intentos de pago", () => {
  const rows = [
    row({ commerceOrder: "a", status: "paid", createdAt: "2026-11-10T10:00:00-03:00" }),
    row({ commerceOrder: "b", status: "pending", createdAt: "2026-11-19T10:00:00-03:00" }),
    row({ commerceOrder: "c", status: "in_review", createdAt: "2026-11-17T10:00:00-03:00" }),
  ];

  it("filtra por estado, más recientes primero", () => {
    expect(filterPaymentAttempts(rows, "todos").map((r) => r.commerceOrder)).toEqual([
      "b",
      "c",
      "a",
    ]);
    expect(filterPaymentAttempts(rows, "pending").map((r) => r.commerceOrder)).toEqual(["b"]);
  });

  it("cuenta por estado", () => {
    expect(countPaymentAttempts(rows)).toEqual({
      paid: 1,
      pending: 1,
      in_review: 1,
      rejected: 0,
      expired: 0,
    });
  });

  it("solo se concilia el intento vigente pendiente o en revisión", () => {
    expect(isReconcilable(row({ status: "pending" }))).toBe(true);
    expect(isReconcilable(row({ status: "in_review" }))).toBe(true);
    expect(isReconcilable(row({ status: "paid" }))).toBe(false);
    expect(isReconcilable(row({ status: "pending", current: false }))).toBe(false);
  });
});
