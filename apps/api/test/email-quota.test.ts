import { describe, expect, it } from "vitest";

import { CRITICAL_EMAIL_EVENTS } from "../src/services/email/events.js";
import {
  chileDay,
  chileDayRange,
  CRITICAL_JOB_TYPES,
  decideQuota,
  QUOTA_ALERT_JOB_TYPE,
} from "../src/services/email/quota.js";

// Límite diario de envíos (plan gratis de Brevo): reglas puras.

const QUOTA = { limit: 300, reserve: 30 };
const DAY = "2026-11-26";

describe("límite diario: decisión", () => {
  it("bajo limit − reserve se envía todo, sin pasar a la reserva", () => {
    expect(decideQuota(0, QUOTA, DAY)).toEqual({
      mode: "normal",
      day: DAY,
      used: 0,
      allowance: 270,
      types: null,
    });
    expect(decideQuota(269, QUOTA, DAY)).toMatchObject({ mode: "normal", allowance: 1 });
  });

  it("en la reserva solo los críticos, hasta dejar el último envío para la alerta", () => {
    const reserve = decideQuota(270, QUOTA, DAY);
    expect(reserve).toMatchObject({ mode: "reserve", allowance: 29 });
    expect(reserve.types).toEqual(CRITICAL_JOB_TYPES);
    expect(decideQuota(298, QUOTA, DAY)).toMatchObject({ mode: "reserve", allowance: 1 });
    expect(CRITICAL_JOB_TYPES).toEqual(CRITICAL_EMAIL_EVENTS.map((e) => `email.${e}`));
    expect(CRITICAL_EMAIL_EVENTS).toEqual([
      "order_received",
      "purchase_confirmed",
      "payment_rejected",
      "password_recovery",
      "payment_review_alert",
      "order_shipped",
    ]);
  });

  it("al llegar al límite pausa todo: solo cabe la alerta al equipo, y después nada", () => {
    expect(decideQuota(299, QUOTA, DAY)).toEqual({
      mode: "paused",
      day: DAY,
      used: 299,
      allowance: 1,
      types: [QUOTA_ALERT_JOB_TYPE],
    });
    expect(decideQuota(300, QUOTA, DAY)).toMatchObject({ mode: "paused", allowance: 0 });
    expect(decideQuota(340, QUOTA, DAY)).toMatchObject({ mode: "paused", allowance: 0 });
  });

  it("sin reserva no hay modo reserva", () => {
    expect(decideQuota(298, { limit: 300, reserve: 0 }, DAY)).toMatchObject({ mode: "normal" });
    expect(decideQuota(299, { limit: 300, reserve: 0 }, DAY)).toMatchObject({ mode: "paused" });
  });
});

describe("día de Chile", () => {
  it("el día cambia a la medianoche de Chile, no a la de UTC", () => {
    // 02:30 UTC del 27 = 23:30 del 26 en Chile (UTC−3 en verano).
    expect(chileDay(new Date("2026-11-27T02:30:00Z"))).toBe("2026-11-26");
    expect(chileDay(new Date("2026-11-27T03:00:00Z"))).toBe("2026-11-27");
    const { start, end } = chileDayRange(new Date("2026-11-26T15:00:00Z"));
    expect(start.toISOString()).toBe("2026-11-26T03:00:00.000Z");
    expect(end.toISOString()).toBe("2026-11-27T03:00:00.000Z");
  });

  it.each([
    "2026-11-26T15:00:00Z", // verano (UTC−3)
    "2026-07-10T15:00:00Z", // invierno (UTC−4)
    "2026-04-05T12:00:00Z", // fin del horario de verano (día de 25 h)
    "2026-09-06T12:00:00Z", // inicio del horario de verano (día de 23 h)
  ])("%s: el rango cubre exactamente el día de Chile", (iso) => {
    const at = new Date(iso);
    const { day, start, end } = chileDayRange(at);
    expect(day).toBe(chileDay(at));
    expect(start.getTime()).toBeLessThanOrEqual(at.getTime());
    expect(end.getTime()).toBeGreaterThan(at.getTime());
    expect(chileDay(start)).toBe(day);
    expect(chileDay(new Date(start.getTime() - 1))).not.toBe(day);
    expect(chileDay(new Date(end.getTime() - 1))).toBe(day);
    expect(chileDay(end)).not.toBe(day);
    const hours = (end.getTime() - start.getTime()) / 3_600_000;
    expect([23, 24, 25]).toContain(hours);
  });
});
