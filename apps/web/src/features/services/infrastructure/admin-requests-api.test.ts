import { describe, expect, it } from "vitest";

import { PANEL_MESSAGES } from "@/shared/lib/panel-errors";

import { toRequestDetail, toRequestPage } from "./admin-requests-api";

const summary = {
  id: "0195f3a0-7c1e-7d2a-9b44-2f1c3a5d6e70",
  number: 1002,
  reference: "SOL-1002",
  service: "armado",
  serviceLabel: "Armado e instalación",
  name: "Ana Pérez",
  email: "ana@example.com",
  commune: "Temuco",
  preferredDate: null,
  status: "new",
  statusLabel: "Nueva",
  hasNote: false,
  createdAt: "2026-11-20T12:00:00.000Z",
  updatedAt: "2026-11-20T12:00:00.000Z",
};

describe("toRequestPage", () => {
  it("traduce filas, conteos y paginación", () => {
    const page = toRequestPage({
      items: [summary],
      meta: { page: 1, pageSize: 20, total: 1, totalPages: 0 },
      counts: { new: 1, in_progress: 0, resolved: 3 },
    });
    expect(page.rows[0]).toMatchObject({
      reference: "SOL-1002",
      serviceLabel: "Armado e instalación",
    });
    expect(page.counts).toEqual({ new: 1, in_progress: 0, resolved: 3 });
    expect(page.pageCount).toBe(1);
  });

  it("un servicio desconocido cuenta como API no disponible", () => {
    expect(() =>
      toRequestPage({
        items: [{ ...summary, service: "otro" }],
        meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        counts: { new: 1, in_progress: 0, resolved: 0 },
      }),
    ).toThrow(PANEL_MESSAGES.unavailable);
  });
});

describe("toRequestDetail", () => {
  it("trae historial con nombre, opciones de estado y correos", () => {
    const detail = toRequestDetail({
      ...summary,
      phone: null,
      childrenAges: "3 años",
      message: "Necesito armar una cama.",
      privacyAcceptedAt: "2026-11-20T12:00:00.000Z",
      privacyVersion: "v1",
      note: "",
      statusOptions: ["new", "in_progress", "resolved"],
      history: [
        {
          at: "2026-11-20T12:00:00.000Z",
          actor: "Solicitante",
          actorName: null,
          actorUserId: null,
          change: "Solicitud recibida",
        },
      ],
      emails: [
        {
          id: "0195f3a0-1b2c-7d3e-8f40-1a2b3c4d5e6f",
          event: "service_request",
          recipient: "ana@example.com",
          status: "sent",
          resendOfId: null,
          createdAt: "2026-11-20T12:00:00.000Z",
        },
      ],
    });
    expect(detail.ages).toBe("3 años");
    expect(detail.statusOptions).toEqual(["new", "in_progress", "resolved"]);
    expect(detail.history[0]).toEqual({
      at: "2026-11-20T12:00:00.000Z",
      actor: "Solicitante",
      actorName: null,
      change: "Solicitud recibida",
    });
    expect(detail.emails[0]?.status).toBe("sent");
  });
});
