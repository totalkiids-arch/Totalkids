import { describe, expect, it } from "vitest";

import {
  EMAIL_EVENT_LABEL,
  EMAIL_EVENTS,
  emailPreview,
  emailQueryString,
  parseEmailQuery,
  referenceLabel,
  toApiEmailSearch,
} from "./email-log";

const ID = "0195f3a0-7c1e-7d2a-9b44-2f1c3a5d6e70";

describe("eventos", () => {
  it("cubre los eventos de la sección 4.4.3 y los del panel", () => {
    expect(EMAIL_EVENTS.map((e) => EMAIL_EVENT_LABEL[e])).toEqual([
      "Pedido recibido",
      "Compra confirmada",
      "Nueva venta",
      "Pago rechazado o anulado",
      "Pedido despachado",
      "Pedido entregado",
      "Solicitud de servicio",
      "Recuperación de contraseña",
      "Baja del newsletter",
    ]);
  });
});

describe("listado", () => {
  it("lee los filtros de la URL e ignora valores desconocidos", () => {
    expect(
      parseEmailQuery({
        evento: "new_sale",
        estado: "failed",
        pedido: "tk-1048",
        solicitud: "sol-1002",
        pagina: "2",
        id: ID.toUpperCase(),
      }),
    ).toEqual({
      event: "new_sale",
      status: "failed",
      order: "TK-1048",
      request: "SOL-1002",
      page: 2,
      id: ID,
    });
    expect(
      parseEmailQuery({ evento: "x", estado: "y", pedido: "1048", solicitud: "1", id: "E-1" }),
    ).toEqual({ event: null, status: null, order: null, request: null, page: 1, id: null });
  });

  it("arma la URL del panel y la consulta a la API", () => {
    expect(emailQueryString({ order: "TK-1048", id: ID })).toBe(`?pedido=TK-1048&id=${ID}`);
    expect(emailQueryString({})).toBe("");
    const query = parseEmailQuery({ estado: "uncertain", solicitud: "SOL-1002", pagina: "3" });
    expect(toApiEmailSearch(query)).toBe("page=3&pageSize=20&status=uncertain&request=SOL-1002");
  });

  it("muestra la referencia con su número visible", () => {
    expect(referenceLabel({ kind: "request", id: ID, label: "SOL-1001" })).toBe(
      "Solicitud #SOL-1001",
    );
    expect(referenceLabel(null)).toBe("Sin referencia");
  });
});

describe("emailPreview", () => {
  it("tiene contenido para cada evento", () => {
    for (const event of EMAIL_EVENTS) {
      const preview = emailPreview({
        event,
        reference: { kind: "order", id: ID, label: "TK-1048" },
      });
      expect(preview.subject.length).toBeGreaterThan(0);
      expect(preview.body.length).toBeGreaterThan(0);
    }
  });

  it("pedido recibido dice claramente pendiente de pago", () => {
    expect(
      emailPreview({
        event: "order_received",
        reference: { kind: "order", id: ID, label: "TK-1051" },
      }).body,
    ).toMatch(/pendiente de pago/);
  });

  it("la recuperación nunca muestra la contraseña ni el enlace real", () => {
    const preview = emailPreview({ event: "password_recovery", reference: null });
    expect(preview.body).not.toMatch(/https?:|token/i);
  });
});
