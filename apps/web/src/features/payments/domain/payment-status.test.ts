import { describe, expect, it } from "vitest";

import { isPaymentStatus, PAYMENT_STATUS_LABEL, PAYMENT_STATUSES } from "./payment-status";

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

  it("reconoce solo valores válidos", () => {
    expect(isPaymentStatus("paid")).toBe(true);
    expect(isPaymentStatus("PAGADO")).toBe(false);
    expect(isPaymentStatus(undefined)).toBe(false);
  });
});
