import { describe, expect, it } from "vitest";

import { PANEL_MESSAGES } from "@/shared/lib/panel-errors";

import { needsZoneNames, toActivityPage, toZoneNames, withZoneNames } from "./activity-api";

const item = {
  id: "0195f3a0-7c1e-7d2a-9b44-2f1c3a5d6e70",
  at: "2026-11-20T12:00:00.000Z",
  area: "pedidos",
  areaLabel: "Pedidos",
  action: "order.status_changed",
  description: "Estado del pedido: Confirmado → En preparación",
  reason: "Taller listo",
  actorUserId: "u1",
  actorName: "Paula Rojas",
  actorLabel: "Operador",
  resourceType: "order",
  resourceId: "o1",
  reference: { type: "order", id: "o1", label: "TK-1048" },
  requestId: "req-1",
};

const page_ = (items: unknown[], byArea: Record<string, number> = {}) => ({
  items,
  meta: { page: 1, pageSize: 20, total: items.length, totalPages: 1 },
  actors: [{ id: "u1", name: "Paula Rojas", role: "Operador", active: true }],
  byArea,
});

describe("toActivityPage", () => {
  it("traduce entradas, responsables y conteos por área (los que faltan, 0)", () => {
    const result = toActivityPage(page_([item], { pedidos: 1 }));
    expect(result.entries[0]).toMatchObject({
      area: "pedidos",
      actorName: "Paula Rojas",
      actorLabel: "Operador",
      reason: "Taller listo",
      reference: { type: "order", label: "TK-1048" },
    });
    expect(result.byArea.pedidos).toBe(1);
    expect(result.byArea.exportaciones).toBe(0);
    expect(result.actors[0]?.name).toBe("Paula Rojas");
  });

  it("un área desconocida se muestra sin etiqueta", () => {
    expect(toActivityPage(page_([{ ...item, area: "otra" }])).entries[0]?.area).toBeNull();
  });

  it("un cuerpo inesperado cuenta como API no disponible", () => {
    expect(() => toActivityPage({ items: "nada" })).toThrow(PANEL_MESSAGES.unavailable);
  });
});

describe("nombres de las zonas de despacho", () => {
  const ZONE = "0195f3a0-1b2c-7d3e-8f40-1a2b3c4d5e6f";
  const zoneEntry = {
    ...item,
    area: "configuracion",
    resourceType: "shipping_zone",
    resourceId: ZONE,
    reference: { type: "shipping_zone", id: ZONE, label: ZONE },
  };

  it("cambia el id por la comuna y la región", () => {
    const page = toActivityPage(page_([zoneEntry, item]));
    expect(needsZoneNames(page)).toBe(true);
    const names = toZoneNames({
      items: [{ id: ZONE, region: "RM", commune: "Ñuñoa", price: null, active: true }],
    });
    const result = withZoneNames(page, names);
    expect(result.entries[0]?.reference?.label).toBe("Ñuñoa (Región Metropolitana)");
    // Las demás referencias no cambian.
    expect(result.entries[1]?.reference?.label).toBe("TK-1048");
  });

  it("si la zona no aparece, un texto genérico y nunca el id", () => {
    const page = toActivityPage(page_([zoneEntry]));
    expect(withZoneNames(page, toZoneNames(null)).entries[0]?.reference?.label).toBe(
      "zona de despacho",
    );
  });

  it("sin zonas nombradas por id no hace falta consultar", () => {
    expect(needsZoneNames(toActivityPage(page_([item])))).toBe(false);
  });
});
