import { describe, expect, it } from "vitest";

import {
  filterSubscribers,
  parseSubscriberQuery,
  registerUnsubscribe,
  subscribersCsvTable,
  subscribeWithConsent,
  type Subscriber,
} from "./subscriber";
import { CONSENT_VERSION } from "./subscription";

const consent = (acceptedAt: string) => ({ version: CONSENT_VERSION, acceptedAt });

const sub = (id: string, overrides: Partial<Subscriber> = {}): Subscriber => ({
  ...subscribeWithConsent(null, id, `${id}@example.com`, consent("2026-11-01T10:00:00-03:00")),
  ...overrides,
});

describe("subscribeWithConsent", () => {
  it("guarda correo, fecha y versión del texto, activo", () => {
    expect(sub("s1")).toEqual({
      id: "s1",
      email: "s1@example.com",
      consentedAt: "2026-11-01T10:00:00-03:00",
      consentVersion: CONSENT_VERSION,
      status: "active",
      unsubscribedAt: null,
      unsubscribedBy: null,
    });
  });

  it("reactiva el mismo registro con el consentimiento nuevo", () => {
    const old = sub("s1", {
      status: "unsubscribed",
      unsubscribedAt: "2026-11-05T10:00:00-03:00",
      unsubscribedBy: "Suscriptor",
      consentVersion: "v0",
    });
    const again = subscribeWithConsent(
      old,
      "s9",
      "s1@example.com",
      consent("2026-11-20T09:00:00-03:00"),
    );
    expect(again).toMatchObject({
      id: "s1",
      status: "active",
      consentedAt: "2026-11-20T09:00:00-03:00",
      consentVersion: CONSENT_VERSION,
      unsubscribedAt: null,
    });
  });
});

describe("registerUnsubscribe", () => {
  it("no borra: cambia el estado y deja fecha y actor", () => {
    const original = sub("s1");
    const result = registerUnsubscribe(original, "Administrador", "2026-11-20T12:00:00-03:00");
    expect(result).toEqual({
      ok: true,
      subscriber: {
        ...original,
        status: "unsubscribed",
        unsubscribedAt: "2026-11-20T12:00:00-03:00",
        unsubscribedBy: "Administrador",
      },
    });
    expect(original.status).toBe("active");
  });

  it("una baja repetida no cambia la fecha original", () => {
    const gone = sub("s1", { status: "unsubscribed", unsubscribedAt: "2026-11-02T00:00:00Z" });
    expect(registerUnsubscribe(gone, "Administrador", "2026-11-20T00:00:00Z")).toEqual({
      ok: false,
      reason: "already-unsubscribed",
    });
  });
});

describe("listado", () => {
  const list = [
    sub("a", { consentedAt: "2026-11-01T00:00:00Z" }),
    sub("b", { consentedAt: "2026-11-03T00:00:00Z", status: "unsubscribed" }),
    sub("c", { consentedAt: "2026-11-02T00:00:00Z" }),
  ];

  it("lee el filtro y la confirmación de la URL", () => {
    expect(parseSubscriberQuery({ estado: "bajas", baja: "s1" })).toEqual({
      filter: "bajas",
      confirm: "s1",
    });
    expect(parseSubscriberQuery({ estado: "toString", baja: "<x>" })).toEqual({
      filter: null,
      confirm: null,
    });
  });

  it("filtra activos y bajas, del más reciente al más antiguo", () => {
    expect(filterSubscribers(list, null).map((s) => s.id)).toEqual(["b", "c", "a"]);
    expect(filterSubscribers(list, "activos").map((s) => s.id)).toEqual(["c", "a"]);
    expect(filterSubscribers(list, "bajas").map((s) => s.id)).toEqual(["b"]);
  });

  it("el CSV lleva solo los datos del consentimiento", () => {
    const table = subscribersCsvTable(
      [sub("a", { status: "unsubscribed", unsubscribedAt: "2026-11-05T00:00:00Z" })],
      (iso) => iso.slice(0, 10),
    );
    expect(table.header).toEqual([
      "Correo",
      "Fecha de consentimiento",
      "Versión del texto",
      "Estado",
      "Fecha de baja",
    ]);
    expect(table.rows[0]).toEqual([
      "a@example.com",
      "2026-11-01",
      CONSENT_VERSION,
      "Dado de baja",
      "2026-11-05",
    ]);
  });
});
