import { describe, expect, it } from "vitest";

import { PANEL_MESSAGES } from "@/shared/lib/panel-errors";

import { toSubscriberPage } from "./admin-subscribers-api";

const subscriber = {
  id: "0195f3a0-7c1e-7d2a-9b44-2f1c3a5d6e70",
  email: "ana@example.com",
  status: "unsubscribed",
  statusLabel: "Dado de baja",
  consentedAt: "2026-11-01T12:00:00.000Z",
  consentVersion: "newsletter-v1",
  unsubscribedAt: "2026-11-20T12:00:00.000Z",
  unsubscribedBy: "Administrador",
};

describe("toSubscriberPage", () => {
  it("traduce suscriptores, conteos y paginación", () => {
    const page = toSubscriberPage({
      items: [subscriber],
      meta: { page: 2, pageSize: 20, total: 21, totalPages: 2 },
      counts: { active: 20, unsubscribed: 1 },
    });
    expect(page.rows[0]).toMatchObject({
      email: "ana@example.com",
      unsubscribedBy: "Administrador",
    });
    expect(page.counts).toEqual({ active: 20, unsubscribed: 1 });
    expect([page.page, page.pageCount, page.total]).toEqual([2, 2, 21]);
  });

  it("un estado desconocido cuenta como API no disponible", () => {
    expect(() =>
      toSubscriberPage({
        items: [{ ...subscriber, status: "pausado" }],
        meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        counts: { active: 0, unsubscribed: 0 },
      }),
    ).toThrow(PANEL_MESSAGES.unavailable);
  });
});
