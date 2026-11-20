import { describe, expect, it } from "vitest";

import {
  applyFollowUp,
  canChangeRequestStatus,
  filterRequests,
  NO_CHANGES,
  NOTE_MAX,
  parseRequestQuery,
  receiveRequest,
  requestQueryString,
  requestsCsvTable,
  requestStatusOptions,
  type AdminServiceRequest,
} from "./service-request-admin";

const base = (overrides: Partial<AdminServiceRequest> = {}): AdminServiceRequest => ({
  ...receiveRequest(
    "SOL-1001",
    {
      service: "armado",
      name: "Ana Pérez",
      email: "ana@example.com",
      phone: "+56912345678",
      commune: "Temuco",
      ages: "3 años",
      preferredDate: null,
      message: "Necesito armar una cama Montessori.",
    },
    "2026-11-18T10:00:00-03:00",
  ),
  ...overrides,
});

const NOW = "2026-11-20T12:00:00-03:00";

describe("transiciones de estado", () => {
  it("permite avanzar, resolver directo y reabrir", () => {
    expect(canChangeRequestStatus("new", "in_progress")).toBe(true);
    expect(canChangeRequestStatus("new", "resolved")).toBe(true);
    expect(canChangeRequestStatus("in_progress", "resolved")).toBe(true);
    expect(canChangeRequestStatus("resolved", "in_progress")).toBe(true);
  });

  it("nunca vuelve a Nueva", () => {
    expect(canChangeRequestStatus("in_progress", "new")).toBe(false);
    expect(canChangeRequestStatus("resolved", "new")).toBe(false);
  });

  it("mantener el estado siempre está permitido", () => {
    expect(canChangeRequestStatus("resolved", "resolved")).toBe(true);
  });

  it("las opciones del selector parten por el estado actual", () => {
    expect(requestStatusOptions("new")).toEqual(["new", "in_progress", "resolved"]);
    expect(requestStatusOptions("resolved")).toEqual(["resolved", "in_progress"]);
  });
});

describe("receiveRequest", () => {
  it("parte como Nueva, sin nota y con el evento de recepción", () => {
    const request = base();
    expect(request.status).toBe("new");
    expect(request.note).toBe("");
    expect(request.history).toEqual([
      { at: "2026-11-18T10:00:00-03:00", actor: "Solicitante", change: "Solicitud recibida" },
    ]);
  });
});

describe("applyFollowUp", () => {
  it("cambia el estado y registra actor, fecha y cambio", () => {
    const original = base();
    const result = applyFollowUp(original, { status: "in_progress", note: "" }, "Operador", NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.status).toBe("in_progress");
    expect(result.request.history.at(-1)).toEqual({
      at: NOW,
      actor: "Operador",
      change: "Estado: Nueva → En gestión",
    });
    expect(original.status).toBe("new");
    expect(original.history).toHaveLength(1);
  });

  it("guarda solo la nota sin cambiar el estado", () => {
    const result = applyFollowUp(
      base(),
      { status: "new", note: "  Llamar el lunes  " },
      "Administrador",
      NOW,
    );
    expect(result.ok && result.request.note).toBe("Llamar el lunes");
    expect(result.ok && result.request.history.at(-1)?.change).toBe("Nota interna actualizada");
  });

  it("combina estado y nota en una sola entrada", () => {
    const result = applyFollowUp(base(), { status: "resolved", note: "Listo" }, "Operador", NOW);
    expect(result.ok && result.request.history.at(-1)?.change).toBe(
      "Estado: Nueva → Resuelta · Nota interna actualizada",
    );
  });

  it("registra cuando se borra la nota", () => {
    const result = applyFollowUp(base({ note: "x" }), { status: "new", note: "" }, "Operador", NOW);
    expect(result.ok && result.request.history.at(-1)?.change).toBe("Nota interna borrada");
  });

  it("rechaza volver a Nueva", () => {
    const result = applyFollowUp(
      base({ status: "resolved" }),
      { status: "new", note: "" },
      "Operador",
      NOW,
    );
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.status).toMatch(/no puede pasar a «Nueva»/);
  });

  it("rechaza un estado desconocido", () => {
    const result = applyFollowUp(base(), { status: "borrada", note: "" }, "Operador", NOW);
    expect(!result.ok && result.errors.status).toBe("Elige un estado de la lista.");
  });

  it("limita la nota a NOTE_MAX caracteres", () => {
    expect(
      applyFollowUp(base(), { status: "new", note: "a".repeat(NOTE_MAX) }, "Operador", NOW).ok,
    ).toBe(true);
    const result = applyFollowUp(
      base(),
      { status: "new", note: "a".repeat(NOTE_MAX + 1) },
      "Operador",
      NOW,
    );
    expect(!result.ok && result.errors.note).toBe(`Usa como máximo ${NOTE_MAX} caracteres.`);
  });

  it("avisa cuando no hay cambios", () => {
    const result = applyFollowUp(base(), { status: "new", note: "  " }, "Operador", NOW);
    expect(!result.ok && result.errors.form).toBe(NO_CHANGES);
  });
});

describe("listado", () => {
  const list = [
    base({ id: "SOL-1001", createdAt: "2026-11-10T10:00:00-03:00" }),
    base({ id: "SOL-1002", service: "diseno", createdAt: "2026-11-12T10:00:00-03:00" }),
    base({ id: "SOL-1003", status: "resolved", createdAt: "2026-11-11T10:00:00-03:00" }),
  ];

  it("lee los filtros de la URL e ignora valores desconocidos", () => {
    expect(parseRequestQuery({ servicio: "diseno", estado: "resolved", id: "sol-1002" })).toEqual({
      service: "diseno",
      status: "resolved",
      id: "SOL-1002",
    });
    expect(parseRequestQuery({ servicio: "x", estado: ["nada"], id: "<script>" })).toEqual({
      service: null,
      status: null,
      id: null,
    });
  });

  it("filtra por servicio y estado y ordena de la más reciente", () => {
    expect(filterRequests(list, { service: null, status: null }).map((r) => r.id)).toEqual([
      "SOL-1002",
      "SOL-1003",
      "SOL-1001",
    ]);
    expect(filterRequests(list, { service: "armado", status: "new" }).map((r) => r.id)).toEqual([
      "SOL-1001",
    ]);
  });

  it("arma la query string solo con filtros activos", () => {
    expect(requestQueryString({ service: null, status: null })).toBe("");
    expect(requestQueryString({ service: "armado", status: "new" })).toBe(
      "?servicio=armado&estado=new",
    );
  });

  it("el CSV minimiza datos personales (sin teléfono, mensaje ni nota)", () => {
    const table = requestsCsvTable([base({ note: "secreto" })], () => "2026-11-18 10:00");
    expect(table.header).toEqual(["Referencia", "Fecha", "Servicio", "Estado", "Nombre", "Correo"]);
    expect(table.rows[0]).toEqual([
      "SOL-1001",
      "2026-11-18 10:00",
      "Armado e instalación",
      "Nueva",
      "Ana Pérez",
      "ana@example.com",
    ]);
    expect(JSON.stringify(table)).not.toMatch(/56912345678|secreto|Montessori/);
  });
});
