import { describe, expect, it } from "vitest";

import {
  addEmailEvent,
  canResend,
  EMAIL_EVENT_LABEL,
  EMAIL_EVENTS,
  emailPreview,
  emailQueryString,
  filterEmails,
  parseEmailQuery,
  referenceLabel,
  RESEND_NOT_ALLOWED,
  resendEmail,
  statusAfterAttempt,
  type EmailRecord,
} from "./email-log";

const record = (id: string, overrides: Partial<EmailRecord> = {}): EmailRecord => ({
  id,
  event: "order_shipped",
  recipient: "camila@example.com",
  reference: { kind: "order", id: "TK-1048" },
  eventKey: `order_shipped:TK-1048:${id}`,
  status: "failed",
  attempts: [
    {
      at: "2026-11-13T15:46:00-03:00",
      kind: "automatic",
      result: "failed",
      actor: null,
      detail: "Buzón lleno",
      resendRecordId: null,
    },
  ],
  createdAt: "2026-11-13T15:46:00-03:00",
  resendOf: null,
  ...overrides,
});

const NOW = "2026-11-20T12:00:00-03:00";

describe("eventos y estados", () => {
  it("cubre los 8 eventos de la sección 4.4.3", () => {
    expect(EMAIL_EVENTS.map((e) => EMAIL_EVENT_LABEL[e])).toEqual([
      "Pedido recibido",
      "Compra confirmada",
      "Nueva venta",
      "Pago rechazado o anulado",
      "Pedido despachado",
      "Pedido entregado",
      "Solicitud de servicio",
      "Recuperación de contraseña",
    ]);
  });

  it("un timeout es resultado incierto, no fallo", () => {
    expect(statusAfterAttempt("timeout")).toBe("uncertain");
    expect(statusAfterAttempt("failed")).toBe("failed");
    expect(statusAfterAttempt("sent")).toBe("sent");
  });
});

describe("addEmailEvent", () => {
  it("no duplica un evento con la misma clave", () => {
    const first = addEmailEvent([], record("E-1"));
    expect(first.added).toBe(true);
    const again = addEmailEvent(
      first.log,
      record("E-2", { eventKey: "order_shipped:TK-1048:E-1" }),
    );
    expect(again.added).toBe(false);
    expect(again.log.map((r) => r.id)).toEqual(["E-1"]);
  });
});

describe("resendEmail", () => {
  it("solo se permite sobre fallido o incierto", () => {
    expect(canResend({ status: "failed" })).toBe(true);
    expect(canResend({ status: "uncertain" })).toBe(true);
    expect(canResend({ status: "sent" })).toBe(false);
    expect(canResend({ status: "pending" })).toBe(false);
    expect(resendEmail(record("E-1", { status: "sent" }), "Administrador", NOW, "E-9")).toEqual({
      ok: false,
      error: RESEND_NOT_ALLOWED,
    });
  });

  it("suma un intento manual auditado al original y crea un registro vinculado", () => {
    const original = record("E-1");
    const result = resendEmail(original, "Administrador", NOW, "E-9");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.original.attempts).toHaveLength(2);
    expect(result.original.attempts.at(-1)).toMatchObject({
      at: NOW,
      kind: "manual",
      result: "sent",
      actor: "Administrador",
      resendRecordId: "E-9",
    });
    expect(result.original.status).toBe("sent");
    expect(result.original.reference).toEqual(original.reference);

    expect(result.resend).toMatchObject({
      id: "E-9",
      resendOf: "E-1",
      event: "order_shipped",
      recipient: "camila@example.com",
      reference: { kind: "order", id: "TK-1048" },
      eventKey: `${original.eventKey}:reenvio-1`,
      status: "sent",
    });
    expect(result.resend.attempts).toHaveLength(1);

    // El registro recibido no cambia.
    expect(original.attempts).toHaveLength(1);
    expect(original.status).toBe("failed");
  });

  it("la clave del reenvío es distinta en cada reenvío manual", () => {
    const once = resendEmail(record("E-1", { status: "uncertain" }), "Administrador", NOW, "E-9");
    if (!once.ok) throw new Error("debía reenviar");
    const again = resendEmail({ ...once.original, status: "failed" }, "Administrador", NOW, "E-10");
    expect(again.ok && again.resend.eventKey).toMatch(/:reenvio-2$/);
  });
});

describe("listado", () => {
  const log = [
    record("E-1", { createdAt: "2026-11-10T00:00:00Z", status: "sent" }),
    record("E-2", {
      createdAt: "2026-11-12T00:00:00Z",
      event: "service_request",
      reference: { kind: "request", id: "SOL-1001" },
    }),
    record("E-3", {
      createdAt: "2026-11-11T00:00:00Z",
      reference: { kind: "order", id: "TK-1051" },
      status: "uncertain",
    }),
  ];

  it("lee los filtros de la URL e ignora valores desconocidos", () => {
    expect(
      parseEmailQuery({ evento: "new_sale", estado: "failed", pedido: "tk-1048", id: "e-3" }),
    ).toEqual({ event: "new_sale", status: "failed", order: "TK-1048", id: "E-3" });
    expect(parseEmailQuery({ evento: "x", estado: "y", pedido: "1048", id: "z" })).toEqual({
      event: null,
      status: null,
      order: null,
      id: null,
    });
  });

  it("filtra por evento, estado y pedido", () => {
    const none = { event: null, status: null, order: null };
    expect(filterEmails(log, none).map((r) => r.id)).toEqual(["E-2", "E-3", "E-1"]);
    expect(filterEmails(log, { ...none, order: "TK-1048" }).map((r) => r.id)).toEqual(["E-1"]);
    expect(filterEmails(log, { ...none, status: "uncertain" }).map((r) => r.id)).toEqual(["E-3"]);
    expect(filterEmails(log, { ...none, event: "service_request" }).map((r) => r.id)).toEqual([
      "E-2",
    ]);
  });

  it("arma la query string y la referencia", () => {
    expect(emailQueryString({ order: "TK-1048", id: "E-1" })).toBe("?pedido=TK-1048&id=E-1");
    expect(emailQueryString({})).toBe("");
    expect(referenceLabel({ kind: "request", id: "SOL-1001" })).toBe("Solicitud #SOL-1001");
    expect(referenceLabel(null)).toBe("Sin referencia");
  });
});

describe("emailPreview", () => {
  it("tiene contenido para cada evento", () => {
    for (const event of EMAIL_EVENTS) {
      const preview = emailPreview({ event, reference: { kind: "order", id: "TK-1048" } });
      expect(preview.subject.length).toBeGreaterThan(0);
      expect(preview.body.length).toBeGreaterThan(0);
    }
  });

  it("pedido recibido dice claramente pendiente de pago", () => {
    expect(
      emailPreview({ event: "order_received", reference: { kind: "order", id: "TK-1051" } }).body,
    ).toMatch(/pendiente de pago/);
  });

  it("la recuperación no incluye la contraseña", () => {
    expect(emailPreview({ event: "password_recovery", reference: null }).body).toMatch(
      /nunca te enviaremos tu contraseña/,
    );
  });
});
