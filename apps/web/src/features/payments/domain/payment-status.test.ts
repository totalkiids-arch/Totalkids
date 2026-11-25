import { describe, expect, it } from "vitest";

import {
  ATTEMPT_STATUS_LABEL,
  ATTEMPT_STATUSES,
  isAttemptStatus,
  isPaymentStatus,
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUSES,
} from "./payment-status";

describe("PaymentStatus", () => {
  it("cubre los cinco estados del inventario con su etiqueta", () => {
    expect(PAYMENT_STATUSES.map((status) => PAYMENT_STATUS_LABEL[status])).toEqual([
      "Pagado",
      "Pendiente",
      "Rechazado",
      "En revisión",
      "Vencido",
    ]);
  });

  it("los intentos del panel suman «Anulado» y «Reembolso pendiente», como la API", () => {
    expect(ATTEMPT_STATUSES.map((status) => ATTEMPT_STATUS_LABEL[status]).slice(-2)).toEqual([
      "Anulado",
      "Reembolso pendiente",
    ]);
    expect(isAttemptStatus("voided")).toBe(true);
    expect(isAttemptStatus("refund_pending")).toBe(true);
    expect(isPaymentStatus("voided")).toBe(false);
  });

  it("reconoce solo valores válidos", () => {
    expect(isPaymentStatus("paid")).toBe(true);
    expect(isPaymentStatus("PAGADO")).toBe(false);
    expect(isPaymentStatus(undefined)).toBe(false);
  });
});
