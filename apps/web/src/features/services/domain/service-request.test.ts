import { describe, expect, it } from "vitest";

import {
  MESSAGE_MAX,
  parseServiceRequest,
  pickRequestValues,
  requestServiceTitle,
} from "./service-request";

const TODAY = "2026-11-20";

const valid = {
  servicio: "armado",
  nombre: "  Camila González ",
  correo: "Camila@Correo.CL",
  mensaje: "Queremos armar una cama casita y un librero frontal.",
  privacidad: "on",
};

const parse = (overrides: Record<string, unknown> = {}) =>
  parseServiceRequest({ ...valid, ...overrides }, TODAY);

describe("parseServiceRequest", () => {
  it("normaliza la solicitud y deja en null lo opcional vacío", () => {
    expect(parse({ telefono: "", comuna: "", edades: "", fecha: "" })).toEqual({
      ok: true,
      request: {
        service: "armado",
        name: "Camila González",
        email: "camila@correo.cl",
        phone: null,
        commune: null,
        ages: null,
        preferredDate: null,
        message: "Queremos armar una cama casita y un librero frontal.",
      },
    });
  });

  it("guarda los datos opcionales", () => {
    const result = parse({
      telefono: "9 1234 5678",
      comuna: " Temuco ",
      edades: "3 y 6 años",
      fecha: "2026-12-01",
    });
    expect(result.ok && result.request).toMatchObject({
      phone: "+56912345678",
      commune: "Temuco",
      ages: "3 y 6 años",
      preferredDate: "2026-12-01",
    });
  });

  it("informa un error por campo obligatorio", () => {
    const result = parseServiceRequest({}, TODAY);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual([
      "correo",
      "mensaje",
      "nombre",
      "privacidad",
      "servicio",
    ]);
  });

  it("exige aceptar la privacidad: la casilla no viene marcada", () => {
    for (const privacidad of [undefined, "", "off"]) {
      const result = parse({ privacidad });
      expect(!result.ok && result.errors.privacidad).toBe(
        "Acepta la política de privacidad para enviar la solicitud.",
      );
    }
  });

  it("rechaza un servicio desconocido", () => {
    expect(!parse({ servicio: "magia" }).ok).toBe(true);
  });

  it("acota el largo del mensaje", () => {
    const short = parse({ mensaje: "Hola" });
    expect(!short.ok && short.errors.mensaje).toMatch(/al menos 10/);
    const long = parse({ mensaje: "a".repeat(MESSAGE_MAX + 1) });
    expect(!long.ok && long.errors.mensaje).toMatch(/máximo 2000/);
  });

  it("rechaza correo, teléfono y fechas inválidas o pasadas", () => {
    const result = parse({ correo: "camila@", telefono: "123", fecha: "2026-11-19" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.correo).toMatch(/correo válido/);
    expect(result.errors.telefono).toMatch(/9 dígitos/);
    expect(result.errors.fecha).toBe("Elige una fecha desde hoy en adelante.");
    expect(parse({ fecha: TODAY }).ok).toBe(true);
    const bad = parse({ fecha: "20-11-2026" });
    expect(!bad.ok && bad.errors.fecha).toBe("Elige una fecha válida.");
  });

  it("da el nombre del servicio para la confirmación", () => {
    expect(requestServiceTitle({ service: "instituciones" })).toBe("Jardines y colegios");
  });
});

describe("pickRequestValues", () => {
  it("toma solo campos conocidos con texto y los acota", () => {
    expect(
      pickRequestValues({ nombre: "Camila", clave: "x", correo: "", mensaje: "a".repeat(3000) }),
    ).toEqual({ nombre: "Camila", mensaje: "a".repeat(MESSAGE_MAX) });
  });
});
