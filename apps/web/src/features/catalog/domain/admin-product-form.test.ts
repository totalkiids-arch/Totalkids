import { describe, expect, it } from "vitest";

import type { AdminProduct } from "./admin-product";
import {
  emptyProductFormValues,
  fieldId,
  parseAmount,
  productToFormValues,
  toProductDraft,
} from "./admin-product-form";

const product: AdminProduct = {
  id: "1",
  slug: "mesa",
  name: "Mesa",
  category: "mesas",
  categories: ["mesas", "junji"],
  levels: ["transicion"],
  materials: ["madera"],
  description: "Texto",
  dimensions: "Alto 50 cm",
  optionName: null,
  variants: [
    {
      id: "v1",
      sku: "TK-1",
      option: null,
      price: 1000,
      compareAtPrice: 1200,
      physical: 4,
      reserved: 1,
    },
  ],
  assemblyPrice: 0,
  personalizationPrice: 5000,
  personalizationMaxLength: 20,
  active: true,
  images: [{ src: "/a.webp", width: 10, height: 10, alt: "Mesa" }],
};

describe("parseAmount", () => {
  it("convierte enteros y deja inválidos los textos con separadores", () => {
    expect(parseAmount(" 129990 ")).toBe(129990);
    expect(parseAmount("12.5")).toBe(12.5);
    expect(parseAmount("")).toBeNaN();
    expect(parseAmount("12,990")).toBeNaN();
    expect(parseAmount("1e3")).toBeNaN();
  });
});

describe("formulario de producto", () => {
  it("ida y vuelta conserva el producto", () => {
    const draft = toProductDraft(productToFormValues(product));
    expect(draft).toMatchObject({
      name: "Mesa",
      category: "mesas",
      categories: ["mesas", "junji"],
      optionName: "",
      variants: [
        { id: "v1", sku: "TK-1", option: null, price: 1000, compareAtPrice: 1200, physical: 4 },
      ],
      personalizationPrice: 5000,
      imageAlts: ["Mesa"],
      newImage: null,
    });
  });

  it("la categoría principal va primera y sin duplicarse", () => {
    const values = {
      ...productToFormValues(product),
      category: "junji",
      categories: ["mesas", "junji"],
    };
    expect(toProductDraft(values).categories).toEqual(["junji", "mesas"]);
  });

  it("precio anterior vacío o 0 significa sin oferta; descarta niveles desconocidos", () => {
    const values = productToFormValues(product);
    values.variants = values.variants.map((v) => ({ ...v, compareAtPrice: "0" }));
    values.levels = ["transicion", "inventado"];
    const draft = toProductDraft(values);
    expect(draft.variants.map((v) => v.compareAtPrice)).toEqual([null]);
    expect(draft.levels).toEqual(["transicion"]);
  });

  it("el formulario nuevo trae una variante vacía", () => {
    const values = emptyProductFormValues("cunas", "nueva-1");
    expect(values.variants).toHaveLength(1);
    expect(values.category).toBe("cunas");
  });

  it("arma ids HTML a partir de la ruta del campo", () => {
    expect(fieldId("variants.0.sku")).toBe("campo-variants-0-sku");
  });
});
