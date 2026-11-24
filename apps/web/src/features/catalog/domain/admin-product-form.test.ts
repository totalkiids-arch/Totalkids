import { describe, expect, it } from "vitest";

import type { AdminProduct, ExtraOption } from "./admin-product";
import {
  emptyProductFormValues,
  fieldId,
  isNewVariantId,
  parseAmount,
  productToFormValues,
  toProductDraft,
} from "./admin-product-form";

const extraOptions: ExtraOption[] = [
  { code: "armado", name: "Armado", requiresText: false, price: null, textMaxLength: null },
  { code: "nombre", name: "Nombre", requiresText: true, price: 4000, textMaxLength: 20 },
];

const product: AdminProduct = {
  id: "p1",
  slug: "mesa",
  name: "Mesa",
  category: "c-mesas",
  categories: ["c-mesas", "c-junji"],
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
  extras: [{ code: "nombre", price: 5000, textMaxLength: null }],
  status: "active",
  images: [{ id: "i1", src: "/a.webp", width: 10, height: 10, alt: "Mesa" }],
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
    const draft = toProductDraft(productToFormValues(product, extraOptions), null);
    expect(draft).toMatchObject({
      name: "Mesa",
      category: "c-mesas",
      categories: ["c-mesas", "c-junji"],
      optionName: "",
      variants: [
        { id: "v1", sku: "TK-1", option: null, price: 1000, compareAtPrice: 1200, physical: 4 },
      ],
      extras: [
        { code: "armado", offered: false, price: null, textMaxLength: null },
        { code: "nombre", offered: true, price: 5000, textMaxLength: null },
      ],
      publish: true,
      imageAlts: ["Mesa"],
      newImage: null,
    });
  });

  it("muestra todos los extras de la tienda y marca los ofrecidos", () => {
    const values = productToFormValues(product, extraOptions);
    expect(values.extras.map((e) => [e.code, e.offered, e.price])).toEqual([
      ["armado", false, ""],
      ["nombre", true, "5000"],
    ]);
    expect(values.extras[1]?.defaultTextMaxLength).toBe(20);
  });

  it("un producto no publicado se muestra sin marcar «visible»", () => {
    expect(productToFormValues({ ...product, status: "draft" }, []).publish).toBe(false);
    expect(productToFormValues({ ...product, status: "inactive" }, []).status).toBe("inactive");
  });

  it("la categoría principal va primera y sin duplicarse", () => {
    const values = {
      ...productToFormValues(product, extraOptions),
      category: "c-junji",
      categories: ["c-mesas", "c-junji"],
    };
    expect(toProductDraft(values, null).categories).toEqual(["c-junji", "c-mesas"]);
  });

  it("precio anterior vacío o 0 significa sin oferta; descarta niveles desconocidos", () => {
    const values = productToFormValues(product, extraOptions);
    values.variants = values.variants.map((v) => ({ ...v, compareAtPrice: "0" }));
    values.levels = ["transicion", "inventado"];
    const draft = toProductDraft(values, null);
    expect(draft.variants.map((v) => v.compareAtPrice)).toEqual([null]);
    expect(draft.levels).toEqual(["transicion"]);
  });

  it("una variante nueva no lleva id y una guardada sí", () => {
    const values = productToFormValues(product, extraOptions);
    values.variants.push({
      id: "nueva-abc",
      sku: "TK-2",
      option: "",
      price: "2000",
      compareAtPrice: "",
      physical: "3",
      reserved: 0,
    });
    const draft = toProductDraft(values, null);
    expect(draft.variants.map((v) => [v.id, v.physical])).toEqual([
      ["v1", 4],
      [null, 3],
    ]);
    expect(isNewVariantId("nueva-abc")).toBe(true);
    expect(isNewVariantId("v1")).toBe(false);
  });

  it("la imagen nueva lleva el tipo, el tamaño y su descripción", () => {
    const values = { ...productToFormValues(product, extraOptions), newImageAlt: " Mesa azul " };
    expect(toProductDraft(values, { type: "image/png", size: 10 }).newImage).toEqual({
      type: "image/png",
      size: 10,
      alt: "Mesa azul",
    });
  });

  it("el formulario nuevo trae una variante vacía y parte como borrador", () => {
    const values = emptyProductFormValues("c-cunas", "nueva-1", extraOptions);
    expect(values.variants).toHaveLength(1);
    expect(values.category).toBe("c-cunas");
    expect(values.publish).toBe(false);
    expect(values.extras.every((e) => !e.offered)).toBe(true);
  });

  it("arma ids HTML a partir de la ruta del campo", () => {
    expect(fieldId("variants.0.sku")).toBe("campo-variants-0-sku");
  });
});
