import { describe, expect, it } from "vitest";

import { PANEL_MESSAGES } from "@/shared/lib/panel-errors";

import { toEmailDetail, toEmailPage, toResendId } from "./admin-emails-api";

const ORDER_ID = "0195f3a0-1b2c-7d3e-8f40-1a2b3c4d5e6f";

const summary = {
  id: "0195f3a0-7c1e-7d2a-9b44-2f1c3a5d6e70",
  event: "order_shipped",
  eventLabel: "Pedido despachado",
  recipient: "ana@example.com",
  status: "failed",
  statusLabel: "Fallido",
  reference: { kind: "order", id: ORDER_ID, label: "TK-1048" },
  attemptsCount: 4,
  lastAttemptAt: "2026-11-20T12:15:00.000Z",
  resendOfId: null,
  canResend: true,
  createdAt: "2026-11-20T12:00:00.000Z",
  updatedAt: "2026-11-20T12:15:00.000Z",
};

describe("toEmailPage", () => {
  it("traduce el registro con su referencia visible y si se puede reenviar", () => {
    const page = toEmailPage({
      items: [summary],
      meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      counts: { pending: 0, sent: 3, failed: 1, uncertain: 0 },
    });
    expect(page.rows[0]).toMatchObject({
      reference: { kind: "order", label: "TK-1048" },
      attemptsCount: 4,
      canResend: true,
      resendOf: null,
    });
    expect(page.counts.sent).toBe(3);
  });

  it("acepta la alerta de límite diario y las muestras de email:preview", () => {
    const page = toEmailPage({
      items: [
        {
          ...summary,
          event: "email_quota_alert",
          reference: { kind: "sample", id: summary.id, label: "Muestra" },
          canResend: false,
        },
      ],
      meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      counts: { pending: 0, sent: 1, failed: 0, uncertain: 0 },
    });
    expect(page.rows[0]).toMatchObject({
      event: "email_quota_alert",
      reference: { kind: "sample", label: "Muestra" },
      canResend: false,
    });
  });

  it("un evento desconocido cuenta como API no disponible", () => {
    expect(() =>
      toEmailPage({
        items: [{ ...summary, event: "otro" }],
        meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        counts: { pending: 0, sent: 0, failed: 0, uncertain: 0 },
      }),
    ).toThrow(PANEL_MESSAGES.unavailable);
  });
});

describe("toEmailDetail", () => {
  it("trae los intentos con quién reenvió y los reenvíos creados", () => {
    const detail = toEmailDetail({
      ...summary,
      eventKey: "order_shipped:TK-1048",
      providerMessageId: null,
      attempts: [
        {
          id: "a1",
          at: "2026-11-20T12:00:00.000Z",
          kind: "manual",
          result: "timeout",
          resultLabel: "Sin respuesta (incierto)",
          actorUserId: "u1",
          actorLabel: "Administrador",
          actorName: "Paula Rojas",
          detail: null,
        },
      ],
      resends: [{ id: "r1", status: "pending", createdAt: "2026-11-20T13:00:00.000Z" }],
    });
    expect(detail.attempts[0]).toMatchObject({ kind: "manual", actorName: "Paula Rojas" });
    expect(detail.resends).toEqual([
      { id: "r1", status: "pending", createdAt: "2026-11-20T13:00:00.000Z" },
    ]);
  });

  it("lee el id del reenvío encolado", () => {
    expect(toResendId({ id: "r2", status: "pending", resendOf: summary.id })).toBe("r2");
  });
});
