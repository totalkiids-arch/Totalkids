import { describe, expect, it } from "vitest";

import {
  availableStock,
  canRemoveVariant,
  findDuplicateSkus,
  IMAGE_MAX_BYTES,
  inventoryStatus,
  requestedStatus,
  slugify,
  stockStatus,
  validateCategoryName,
  validateClp,
  validateCompareAt,
  validateImageAlt,
  validateImageFile,
  validatePhysicalStock,
  validateProductDraft,
  validateSkuFormat,
  validateStockAdjustment,
  type ProductDraft,
  type ProductDraftContext,
} from "./admin-product";

describe("importes CLP (RN-01)", () => {
  it("acepta enteros desde 0", () => {
    expect(validateClp(0)).toBeNull();
    expect(validateClp(129990)).toBeNull();
  });

  it("rechaza negativos, decimales y valores vacíos", () => {
    expect(validateClp(-1, "El precio")).toBe("El precio no puede ser negativo.");
    expect(validateClp(12.99, "El precio")).toMatch(/enteros/);
    expect(validateClp(Number.NaN, "El precio")).toMatch(/monto en pesos/);
  });

  it("el precio anterior es opcional y debe ser ≥ precio", () => {
    expect(validateCompareAt(100, null)).toBeNull();
    expect(validateCompareAt(100, 100)).toBeNull();
    expect(validateCompareAt(100, 150)).toBeNull();
    expect(validateCompareAt(100, 99)).toMatch(/igual o mayor/);
    expect(validateCompareAt(100, -5)).toMatch(/negativo/);
  });
});

describe("SKU único (RF-26)", () => {
  it("valida el formato", () => {
    expect(validateSkuFormat("TK-6534")).toBeNull();
    expect(validateSkuFormat("  ")).toBe("Escribe el SKU.");
    expect(validateSkuFormat("TK 1")).toMatch(/espacios/);
    expect(validateSkuFormat("X".repeat(41))).toMatch(/máximo/);
  });

  it("detecta repetidos dentro del producto sin distinguir mayúsculas (entre productos, la API)", () => {
    expect(findDuplicateSkus(["TK-2", " tk-2 "])).toEqual([1]);
    expect(findDuplicateSkus(["TK-3", "TK-4"])).toEqual([]);
    expect(findDuplicateSkus(["", ""])).toEqual([]);
  });
});

describe("stock (RN-03)", () => {
  it("disponible = físico − reservado, sin negativos", () => {
    expect(availableStock({ physical: 10, reserved: 3 })).toBe(7);
    expect(availableStock({ physical: 2, reserved: 3 })).toBe(0);
  });

  it("marca stock bajo con el umbral de la ficha", () => {
    expect(inventoryStatus({ physical: 3, reserved: 3 })).toBe("out");
    expect(inventoryStatus({ physical: 4, reserved: 1 })).toBe("low");
    expect(inventoryStatus({ physical: 10, reserved: 1 })).toBe("ok");
    expect(stockStatus(0)).toBe("out");
    expect(stockStatus(2)).toBe("low");
  });

  it("el físico es entero y no menor que las reservas", () => {
    expect(validatePhysicalStock(5, 5)).toBeNull();
    expect(validatePhysicalStock(4, 5)).toMatch(/5 unidades reservadas/);
    expect(validatePhysicalStock(2.5, 0)).toMatch(/entero/);
    expect(validatePhysicalStock(-1, 0)).toMatch(/negativo/);
  });

  it("un ajuste exige motivo y un valor distinto del actual", () => {
    expect(
      validateStockAdjustment({ physical: 8, current: 5, reserved: 2, reason: "Conteo" }),
    ).toEqual({});
    expect(validateStockAdjustment({ physical: 1, current: 5, reserved: 2, reason: " " })).toEqual({
      physical: expect.stringMatching(/reservadas/),
      reason: "Escribe el motivo del ajuste.",
    });
    expect(
      validateStockAdjustment({ physical: 5, current: 5, reserved: 0, reason: "Conteo" }).physical,
    ).toMatch(/ya es 5/);
  });

  it("no se quita una variante con reservas", () => {
    expect(canRemoveVariant({ reserved: 0 })).toBe(true);
    expect(canRemoveVariant({ reserved: 1 })).toBe(false);
  });
});

describe("imágenes (RF-26)", () => {
  it("permite JPG, PNG y WebP de hasta 2 MB exactos", () => {
    expect(validateImageFile({ type: "image/webp", size: IMAGE_MAX_BYTES })).toBeNull();
    expect(validateImageFile({ type: "image/jpeg", size: 1000 })).toBeNull();
    expect(validateImageFile({ type: "image/png", size: 1000 })).toBeNull();
  });

  it("rechaza otros formatos, archivos vacíos y los de más de 2 MB", () => {
    expect(validateImageFile({ type: "image/gif", size: 1000 })).toMatch(/JPG, PNG o WebP/);
    expect(validateImageFile({ type: "image/svg+xml", size: 1000 })).toMatch(/no permitido/);
    expect(validateImageFile({ type: "image/png", size: 0 })).toMatch(/vacío/);
    expect(validateImageFile({ type: "image/png", size: IMAGE_MAX_BYTES + 1 })).toMatch(/2 MB/);
  });

  it("exige texto alternativo", () => {
    expect(validateImageAlt("Cuna de madera natural")).toBeNull();
    expect(validateImageAlt("  ")).toMatch(/Describe la imagen/);
  });
});

describe("categorías", () => {
  const existing = [
    { id: "c1", slug: "mesas", name: "Mesas", active: true },
    { id: "c2", slug: "montessori-pikler", name: "Montessori y Pikler", active: true },
  ];

  it("arma el slug sin tildes ni símbolos", () => {
    expect(slugify("  Línea JUNJI ")).toBe("linea-junji");
    expect(slugify("Cunas & camas")).toBe("cunas-camas");
  });

  it("exige nombre y slug únicos", () => {
    expect(validateCategoryName("Repisas", existing, null)).toBeNull();
    expect(validateCategoryName("", existing, null)).toMatch(/Escribe/);
    expect(validateCategoryName("mesas", existing, null)).toMatch(/ese nombre/);
    expect(validateCategoryName("Mésas", existing, null)).toMatch(/ese nombre/);
    expect(validateCategoryName("¡¡!!", existing, null)).toMatch(/letra/);
  });

  it("al editar se compara solo con las demás", () => {
    expect(validateCategoryName("Mesas", existing, "c1")).toBeNull();
    expect(validateCategoryName("Mesas", existing, "c2")).toMatch(/ese nombre/);
  });
});

describe("validateProductDraft", () => {
  const variant = {
    id: "v1" as string | null,
    sku: "TK-10",
    option: null,
    price: 49990,
    compareAtPrice: null,
    physical: 5,
  };
  const base: ProductDraft = {
    name: "Mesa Montessori",
    category: "mesas",
    categories: ["mesas"],
    levels: ["nivel-medio"],
    materials: ["madera"],
    description: "Mesa de madera a la altura de los niños.",
    dimensions: "",
    optionName: "",
    variants: [variant],
    extras: [
      { code: "armado", offered: true, price: null, textMaxLength: null },
      { code: "nombre", offered: true, price: 5000, textMaxLength: 12 },
    ],
    publish: true,
    imageAlts: ["Mesa de madera"],
    newImage: null,
  };
  const context: ProductDraftContext = {
    currentVariants: [{ id: "v1", sku: "TK-10", reserved: 2 }],
    allowedCategories: ["mesas", "junji"],
    extraOptions: [
      { code: "armado", name: "Armado", requiresText: false, price: null, textMaxLength: null },
      { code: "nombre", name: "Nombre", requiresText: true, price: 4000, textMaxLength: 20 },
    ],
  };

  it("acepta un producto válido", () => {
    expect(validateProductDraft(base, context)).toEqual({});
  });

  it("informa cada error en su campo", () => {
    const errors = validateProductDraft(
      {
        ...base,
        name: "",
        category: "inexistente",
        variants: [
          { id: null, sku: "TK 20", option: null, price: 100, compareAtPrice: 50, physical: -1 },
        ],
        extras: [
          { code: "armado", offered: true, price: -1, textMaxLength: null },
          { code: "nombre", offered: true, price: null, textMaxLength: 0 },
          { code: "fantasma", offered: true, price: null, textMaxLength: null },
        ],
        imageAlts: [""],
        newImage: { type: "image/gif", size: 10, alt: "" },
      },
      context,
    );
    expect(Object.keys(errors).sort()).toEqual(
      [
        "category",
        "extras.0.price",
        "extras.1.textMaxLength",
        "extras.2.code",
        "images.0.alt",
        "name",
        "newImage",
        "newImage.alt",
        "variants",
        "variants.0.compareAtPrice",
        "variants.0.physical",
        "variants.0.sku",
      ].sort(),
    );
    expect(errors["variants.0.sku"]).toMatch(/espacios/);
    // La variante v1 (con reservas) no viene en el borrador.
    expect(errors.variants).toMatch(/TK-10 tiene unidades reservadas/);
  });

  it("el stock de una variante guardada no se valida (se ajusta en Inventario)", () => {
    const errors = validateProductDraft(
      { ...base, variants: [{ ...variant, physical: Number.NaN }] },
      context,
    );
    expect(errors).toEqual({});
  });

  it("un extra no ofrecido no se valida", () => {
    const errors = validateProductDraft(
      { ...base, extras: [{ code: "armado", offered: false, price: -5, textMaxLength: null }] },
      context,
    );
    expect(errors).toEqual({});
  });

  it("exige al menos una variante y no quitar las que tienen reservas", () => {
    const errors = validateProductDraft({ ...base, variants: [] }, context);
    expect(errors.variants).toBe("Agrega al menos una variante.");
    const removed = validateProductDraft(
      { ...base, variants: [{ ...variant, id: null, sku: "TK-11" }] },
      context,
    );
    expect(removed.variants).toMatch(/TK-10 tiene unidades reservadas/);
  });

  it("con varias variantes pide qué se elige y opciones distintas", () => {
    const errors = validateProductDraft(
      {
        ...base,
        variants: [
          { ...variant, option: "Azul" },
          { ...variant, id: null, sku: "TK-11", option: "azul", physical: 0 },
        ],
      },
      context,
    );
    expect(errors.optionName).toMatch(/qué se elige/);
    expect(errors["variants.1.option"]).toMatch(/otra variante/);
  });
});

describe("requestedStatus", () => {
  it("visible = publicado", () => {
    expect(requestedStatus(true, null)).toBe("active");
    expect(requestedStatus(true, "inactive")).toBe("active");
  });

  it("sin publicar: un borrador o un producto nuevo sigue en borrador; uno publicado pasa a inactivo", () => {
    expect(requestedStatus(false, null)).toBe("draft");
    expect(requestedStatus(false, "draft")).toBe("draft");
    expect(requestedStatus(false, "active")).toBe("inactive");
    expect(requestedStatus(false, "inactive")).toBe("inactive");
  });
});
