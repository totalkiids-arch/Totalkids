import { describe, expect, it } from "vitest";

import { PANEL_MESSAGES } from "@/shared/lib/panel-errors";

import { toApiCouponBody, toCouponList } from "./admin-coupons-api";

const item = {
  id: "0195f3a0-7c1e-7d2a-9b44-2f1c3a5d6e70",
  code: "APRENDER10",
  kind: "percent",
  value: 10,
  startsOn: "2026-12-01",
  endsOn: "2026-12-31",
  maxUses: 100,
  uses: 3,
  reservedUses: 1,
  consumedUses: 2,
  active: true,
  status: "scheduled",
  statusLabel: "Programado",
  termsLocked: true,
  canDelete: false,
  createdAt: "2026-11-20T12:00:00.000Z",
  updatedAt: "2026-11-20T12:00:00.000Z",
};

const draft = {
  code: "APRENDER10",
  kind: "percent" as const,
  value: 10,
  startsOn: "2026-12-01",
  endsOn: "2026-12-31",
  maxUses: 100,
  active: true,
};

describe("toCouponList", () => {
  it("traduce los cupones con el estado y los permisos que calcula la API", () => {
    const list = toCouponList({ today: "2026-11-25", items: [item] });
    expect(list.today).toBe("2026-11-25");
    expect(list.coupons[0]).toMatchObject({
      code: "APRENDER10",
      uses: 3,
      status: "scheduled",
      statusLabel: "Programado",
      termsLocked: true,
      canDelete: false,
    });
  });

  it("un estado desconocido cuenta como API no disponible", () => {
    expect(() =>
      toCouponList({ today: "2026-11-25", items: [{ ...item, status: "otro" }] }),
    ).toThrow(PANEL_MESSAGES.unavailable);
  });
});

describe("toApiCouponBody", () => {
  it("con términos bloqueados no envía código, tipo ni valor", () => {
    expect(toApiCouponBody(draft, true)).toEqual({
      startsOn: "2026-12-01",
      endsOn: "2026-12-31",
      maxUses: 100,
      active: true,
    });
  });

  it("sin usos envía todo", () => {
    expect(toApiCouponBody(draft, false)).toEqual(draft);
  });
});
