import { describe, expect, it } from "vitest";

import {
  decodeEntities,
  detectLevels,
  detectMaterials,
  htmlToLines,
  mapCategories,
  mapPrices,
  normalizeName,
  parseDescription,
  summarize,
} from "./transform";

describe("normalizeName", () => {
  it.each([
    ["SILLA PÁRVULO (NIVEL MEDIO) COIGUE", "Silla párvulo (nivel medio) coigüe"],
    ["CUNA CAMAROTE JUNJI", "Cuna camarote JUNJI"],
    ["MUEBLE MUDADOR C/LATERAL Y COLCHÓN SC", "Mueble mudador con lateral y colchón sala cuna"],
    [
      "MUEBLE MUDADOR NIV. MEDIOS C/LATERAL Y COLCHÓN",
      "Mueble mudador niveles medios con lateral y colchón",
    ],
    ["Cama Apilable Plastico Metal ( Norma Junji )", "Cama apilable plástico metal (norma JUNJI)"],
    ["Silla Plastica Infantil 30X32X51Cm", "Silla plástica infantil 30x32x51 cm"],
    ["ESTANTE MODULAR N°6", "Estante modular N° 6"],
    ["LIBRERO MONTESORI", "Librero Montessori"],
    ["TRIANGULO PILKER", "Triangulo Pikler"],
    ["CONTENEDOR\tBAUL MADERA", "Contenedor baúl madera"],
    [
      "KIT DE MESA Y 4 SILLAS PARVULOS METALICAS KINDER",
      "Kit de mesa y 4 sillas párvulos metálicas kinder",
    ],
  ])("%s", (raw, expected) => {
    expect(normalizeName(raw)).toBe(expected);
  });
});

describe("htmlToLines", () => {
  it("quita etiquetas, decodifica entidades y separa por párrafo", () => {
    expect(
      htmlToLines("<p>Mesa 45&#215;35 &amp; silla</p>\n<p>  </p><ul><li>Alto: 46 CM</li></ul>"),
    ).toEqual(["Mesa 45×35 & silla", "Alto: 46 CM"]);
  });

  it("descarta scripts", () => {
    expect(htmlToLines("<p>Hola</p><script>alert(1)</script>")).toEqual(["Hola"]);
  });

  it("decodifica entidades con nombre y numéricas", () => {
    expect(decodeEntities("Twist &#038; Click&nbsp;XL &hellip;")).toBe("Twist & Click XL …");
  });
});

describe("parseDescription", () => {
  const parsed = parseDescription([
    "MESA PARVULO CUADRADA",
    "MATERIAS PRIMAS CON CALIDAD CERTIFICADA, SIN FILOS Y BORDES REDONDEADOS.",
    "MEDIDAS:",
    "ALTO: 46 CM",
    "ANCHO: 70 CM",
    "PROFUNDIDAD: 70 CM",
    "Materiales: fabricadas en terciado de 18 mm de espesor.",
    "Alto Total: 21 cm.",
    "30,6 CM DE ANCHO",
  ]);

  it("extrae las medidas principales una sola vez", () => {
    expect(parsed.dimensions).toEqual([
      { label: "Alto", value: "46 cm" },
      { label: "Ancho", value: "70 cm" },
      { label: "Profundidad", value: "70 cm" },
    ]);
  });

  it("separa la ficha técnica y pasa las mayúsculas a oración", () => {
    expect(parsed.specs).toEqual([
      { label: "Materiales", value: "Fabricadas en terciado de 18 mm de espesor." },
    ]);
    expect(parsed.description[0]).toBe("Mesa párvulo cuadrada");
    expect(parsed.description).not.toContain("MEDIDAS:");
  });

  it("deja como texto una medida repetida (p. ej. de un compartimiento)", () => {
    expect(parsed.description).toContain("Alto Total: 21 cm.");
  });

  it("acepta medidas con el valor primero", () => {
    expect(parseDescription(["49 CM DE ALTO"]).dimensions).toEqual([
      { label: "Alto", value: "49 cm" },
    ]);
  });

  it("resume con la primera línea útil que no sea la frase genérica", () => {
    expect(summarize(parsed)).toBe("Mesa párvulo cuadrada");
  });
});

describe("mapCategories", () => {
  it("el nombre manda sobre categorías ruidosas del sitio", () => {
    expect(
      mapCategories("ATRIL GRADUABLE JUNJI", ["almacenamiento", "cunas", "junji", "mesas"]),
    ).toEqual({ category: "mesas", categories: ["mesas", "junji"] });
  });

  it("conserva las líneas JUNJI y Montessori-Pikler del sitio", () => {
    expect(mapCategories("SET DE CUBOS PIKLER – 4 PIEZAS", ["junji", "montessori-pikler"])).toEqual(
      { category: "montessori-pikler", categories: ["montessori-pikler", "junji"] },
    );
  });

  it("usa las del sitio si el nombre no dice el tipo", () => {
    expect(mapCategories("REPISA RADIO JUNJI", ["junji"]).category).toBe("almacenamiento");
    expect(mapCategories("PRODUCTO X", ["lockers", "junji"])).toEqual({
      category: "almacenamiento",
      categories: ["almacenamiento", "junji"],
    });
  });
});

describe("detectLevels", () => {
  it.each([
    ["SILLA SALA CUNA COIGUE", [], ["sala-cuna"]],
    ["SILLA PARVULO NIVEL MEDIO JUNJI", [], ["nivel-medio", "transicion"]],
    ["ESCRITORIO DOCENTE (1.200 MM) JUNJI", [], ["adultos"]],
    ["SILLA ADULTO AULA JUNJI 400", ["para párvulos"], ["adultos"]],
    ["LIBRERO", ["Para sala cuna y niveles medios"], ["sala-cuna", "nivel-medio"]],
    ["LOCKER 9 ESPACIOS JUNJI", [], []],
  ] as const)("%s", (name, description, expected) => {
    expect(detectLevels(name, description)).toEqual(expected);
  });
});

describe("detectMaterials y mapPrices", () => {
  it("detecta materiales por palabras clave", () => {
    expect(detectMaterials("Estructura coihue, cubierta melamina, patas de acero")).toEqual([
      "madera",
      "melamina",
      "metal",
    ]);
  });

  it("solo hay oferta si el precio anterior es mayor", () => {
    expect(
      mapPrices({ on_sale: true, prices: { price: "79990", regular_price: "95000" } }),
    ).toEqual({ price: 79990, compareAtPrice: 95000 });
    expect(
      mapPrices({ on_sale: true, prices: { price: "34990", regular_price: "34990" } }),
    ).toEqual({ price: 34990, compareAtPrice: null });
  });
});

describe("casos detectados en la primera importación", () => {
  it("capitaliza aunque el nombre empiece con una palabra corregida", () => {
    expect(normalizeName("BAUL KURRUF")).toBe("Baúl Kurruf");
    expect(normalizeName("colchon cuna impermeable")).toBe("Colchón cuna impermeable");
  });

  it("'sala cuna' no convierte una silla en cuna", () => {
    expect(mapCategories("SILLA SALA CUNA JUNJI", ["junji"]).category).toBe("sillas");
    expect(mapCategories("MESA SALA CUNA JUNJI", ["junji"]).category).toBe("mesas");
  });

  it("sin oraciones largas, resume con el material", () => {
    const parsed = parseDescription([
      "ALTURA DE BASE AL ASIENTO: 23 cm",
      "MATERIAL DE ESTRUCTURA: Madera Coihue",
    ]);
    expect(summarize(parsed)).toBe("Material de estructura: Madera Coihue");
  });

  it("quita viñetas y encabezados sueltos", () => {
    expect(parseDescription(["Descripción", "– Permite subir sin ayuda."]).description).toEqual([
      "Permite subir sin ayuda.",
    ]);
  });
});

describe("summarize evita la frase genérica del catálogo JUNJI", () => {
  it("prefiere una línea propia del producto", () => {
    const parsed = parseDescription([
      "Materias primas con calidad certificada, contrachapado calidad a/a, sin filos.",
      "No incluye malla",
    ]);
    expect(summarize(parsed)).toBe("No incluye malla");
  });
});
