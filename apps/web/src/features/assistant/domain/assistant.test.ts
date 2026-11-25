import { describe, expect, it } from "vitest";

import { answerTo, QUICK_TOPICS, searchTerms, topicAnswer, typingDelay } from "./assistant";
import { definedOrNull, type ContactInfo } from "./contact";

const none: ContactInfo = { phone: null, email: null, address: null, hours: null, whatsapp: null };
const contact: ContactInfo = {
  phone: "+56 9 1234 5678",
  email: "hola@totalkids.cl",
  address: "Calle 1, Temuco",
  hours: "Lunes a viernes",
  whatsapp: "56912345678",
};
const hrefs = (text: string, info = contact) => answerTo(text, info).links.map((l) => l.href);

describe("Tito", () => {
  it("entrega los datos de contacto definidos", () => {
    const { text } = answerTo("¿Cuál es su TELÉFONO?", contact);
    expect(text).toContain("+56 9 1234 5678");
    expect(text).toContain("hola@totalkids.cl");
    expect(hrefs("correo")).toEqual([
      "https://wa.me/56912345678",
      "tel:+56912345678",
      "mailto:hola@totalkids.cl",
    ]);
  });

  it("sin datos definidos no muestra marcadores: ofrece el formulario", () => {
    expect(definedOrNull("+56 9 [TU NÚMERO]")).toBeNull();
    expect(definedOrNull("[TU CORREO]")).toBeNull();
    expect(definedOrNull("hola@totalkids.cl")).toBe("hola@totalkids.cl");
    expect(hrefs("whatsapp", none)).toEqual(["/servicios/solicitar"]);
    for (const { id } of QUICK_TOPICS) expect(topicAnswer(id, none).text).not.toMatch(/[[\]]/);
  });

  it("distingue el seguimiento del pedido de la ubicación del taller", () => {
    expect(hrefs("¿Dónde está mi pedido?")).toContain("/seguimiento");
    expect(answerTo("¿dónde están ubicados?", contact).text).toContain("Calle 1");
  });

  it("no confunde «silla de comedor» con el correo ni «mesa» con «mes»", () => {
    expect(hrefs("sillas")[0]).toBe("/catalogo?categoria=sillas");
    expect(hrefs("quiero una mesa")[0]).toBe("/catalogo?categoria=mesas");
  });

  it("lo que no entiende lo busca en el catálogo, codificado", () => {
    expect(searchTerms("Busco un rincón & luz")).toBe("rincon luz");
    expect(hrefs("busco un velador")).toEqual(["/catalogo?q=velador", "/servicios/solicitar"]);
    expect(hrefs("¿¿??")).toEqual(["/catalogo", "/servicios/solicitar"]);
  });

  it("los botones rápidos siempre responden", () => {
    for (const { id } of QUICK_TOPICS) expect(topicAnswer(id, contact).text).not.toBe("");
  });
});

describe("typingDelay", () => {
  it("Tito tarda más en escribir una respuesta larga, con un tope", () => {
    const short = typingDelay("¡Hola!");
    const long = typingDelay("x".repeat(80));
    expect(short).toBeGreaterThanOrEqual(700);
    expect(long).toBeGreaterThan(short);
    expect(typingDelay("x".repeat(5_000))).toBe(2_200);
  });
});
