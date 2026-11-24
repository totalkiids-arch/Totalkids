import { describe, expect, it } from "vitest";

import { PANEL_MESSAGES } from "@/shared/lib/panel-errors";

import type { ProductDraft } from "../domain/admin-product";
import {
  panelImageSrc,
  toAdminProduct,
  toApiProductBody,
  toCategories,
  toFormErrors,
  toInventoryActivity,
  toInventoryPage,
  toProductPage,
} from "./admin-catalog-api";

const API = "http://localhost:4000";

const ref = (id: string, name: string) => ({ id, slug: id, name });

const apiProduct = {
  id: "p1",
  slug: "mesa",
  name: "Mesa",
  summary: null,
  description: "Texto",
  dimensions: null,
  ageGroups: ["transicion"],
  materials: ["madera"],
  specs: [],
  optionName: "Tamaño",
  leadTime: null,
  status: "draft",
  featured: false,
  publishedAt: null,
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
  category: ref("c1", "Mesas"),
  additionalCategories: [ref("c2", "JUNJI")],
  variants: [
    {
      id: "v1",
      sku: "TK-1",
      optionLabel: "Chica",
      color: null,
      size: null,
      price: null,
      compareAtPrice: null,
      stockPhysical: 3,
      stockReserved: 1,
      available: 2,
      active: true,
      sortOrder: 0,
    },
    {
      id: "v0",
      sku: "TK-0",
      optionLabel: "Vieja",
      color: null,
      size: null,
      price: 100,
      compareAtPrice: null,
      stockPhysical: 0,
      stockReserved: 0,
      available: 0,
      active: false,
      sortOrder: 1,
    },
  ],
  images: [
    {
      id: "i1",
      url: `${API}/uploads/abc.webp`,
      alt: "Mesa",
      width: 800,
      height: 600,
      sortOrder: 0,
      variantId: null,
    },
    {
      id: "i2",
      url: "/productos/mesa/1.webp",
      alt: "Mesa 2",
      width: null,
      height: null,
      sortOrder: 1,
      variantId: null,
    },
  ],
  extras: [
    {
      code: "armado",
      name: "Armado",
      requiresText: false,
      textLabel: null,
      price: null,
      textMaxLength: null,
      effectivePrice: null,
      effectiveTextMaxLength: null,
      available: true,
      sortOrder: 0,
    },
  ],
};

describe("toAdminProduct", () => {
  it("traduce el producto de la API al del panel (solo variantes activas)", () => {
    const product = toAdminProduct(apiProduct, API);
    expect(product).toMatchObject({
      id: "p1",
      category: "c1",
      categories: ["c1", "c2"],
      levels: ["transicion"],
      dimensions: "",
      status: "draft",
      extras: [{ code: "armado", price: null, textMaxLength: null }],
    });
    expect(product.variants).toEqual([
      {
        id: "v1",
        sku: "TK-1",
        option: "Chica",
        price: null,
        compareAtPrice: null,
        physical: 3,
        reserved: 1,
      },
    ]);
  });

  it("las imágenes subidas se piden a /uploads de Next; las locales quedan igual", () => {
    const product = toAdminProduct(apiProduct, API);
    expect(product.images.map((i) => i.src)).toEqual([
      "/uploads/abc.webp",
      "/productos/mesa/1.webp",
    ]);
    expect(panelImageSrc("https://cdn.example.com/x.webp", API)).toBe(
      "https://cdn.example.com/x.webp",
    );
  });

  it("un cuerpo inesperado cuenta como API no disponible", () => {
    expect(() => toAdminProduct({ id: "p1" }, API)).toThrow(PANEL_MESSAGES.unavailable);
  });
});

describe("listados", () => {
  it("página de productos con estado, precio y disponible", () => {
    const page = toProductPage({
      items: [
        {
          id: "p1",
          slug: "mesa",
          name: "Mesa",
          status: "active",
          featured: false,
          category: ref("c1", "Mesas"),
          price: 1000,
          variantCount: 2,
          available: 3,
          image: null,
          updatedAt: "2026-11-01T00:00:00.000Z",
        },
      ],
      meta: { page: 1, pageSize: 20, total: 1, totalPages: 0 },
    });
    expect(page).toEqual({
      items: [
        {
          id: "p1",
          name: "Mesa",
          categoryName: "Mesas",
          status: "active",
          variantCount: 2,
          price: 1000,
          available: 3,
        },
      ],
      total: 1,
      page: 1,
      pageCount: 1,
    });
  });

  it("categorías, inventario e historial", () => {
    expect(
      toCategories({
        items: [
          {
            id: "c1",
            slug: "mesas",
            name: "Mesas",
            description: null,
            sortOrder: 0,
            active: true,
            productCount: 4,
            createdAt: "x",
            updatedAt: "x",
          },
        ],
      }),
    ).toEqual([{ id: "c1", slug: "mesas", name: "Mesas", active: true, productCount: 4 }]);

    expect(
      toInventoryPage({
        items: [
          {
            variantId: "v1",
            sku: "TK-1",
            optionLabel: null,
            variantActive: true,
            productId: "p1",
            productName: "Mesa",
            productSlug: "mesa",
            productStatus: "active",
            stockPhysical: 5,
            stockReserved: 2,
            available: 3,
          },
        ],
        meta: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
      }).rows,
    ).toEqual([
      {
        productId: "p1",
        productName: "Mesa",
        productSlug: "mesa",
        variantId: "v1",
        sku: "TK-1",
        option: null,
        active: true,
        physical: 5,
        reserved: 2,
      },
    ]);

    expect(
      toInventoryActivity({
        items: [
          {
            id: "a1",
            at: "2026-11-20T10:00:00.000Z",
            area: "inventario",
            areaLabel: "Inventario",
            action: "inventory.adjusted",
            description: "Ajuste de stock TK-1: 0 → 5",
            reason: "Conteo",
            actorUserId: "u1",
            actorName: null,
            actorLabel: "Administrador",
            resourceType: "product_variant",
            resourceId: "v1",
            reference: null,
            requestId: null,
          },
        ],
      }),
    ).toEqual([
      {
        id: "a1",
        at: "2026-11-20T10:00:00.000Z",
        actor: "Administrador",
        description: "Ajuste de stock TK-1: 0 → 5",
        reason: "Conteo",
      },
    ]);
  });
});

const draft: ProductDraft = {
  name: "Mesa",
  category: "c1",
  categories: ["c1", "c2"],
  levels: ["transicion"],
  materials: [],
  description: "Texto",
  dimensions: "",
  optionName: "Tamaño",
  variants: [
    { id: "v1", sku: "TK-1", option: "Chica", price: 1000, compareAtPrice: null, physical: 3 },
    { id: null, sku: "TK-2", option: "Grande", price: 2000, compareAtPrice: 2500, physical: 4 },
  ],
  extras: [
    { code: "armado", offered: false, price: null, textMaxLength: null },
    { code: "nombre", offered: true, price: null, textMaxLength: 12 },
  ],
  publish: true,
  imageAlts: [],
  newImage: null,
};

describe("toApiProductBody", () => {
  it("arma el cuerpo de POST/PATCH: stock solo en variantes nuevas, solo extras ofrecidos", () => {
    expect(toApiProductBody(draft, "active")).toEqual({
      name: "Mesa",
      description: "Texto",
      dimensions: null,
      ageGroups: ["transicion"],
      materials: [],
      optionName: "Tamaño",
      categoryId: "c1",
      additionalCategoryIds: ["c2"],
      variants: [
        { id: "v1", sku: "TK-1", optionLabel: "Chica", price: 1000, compareAtPrice: null },
        { stockPhysical: 4, sku: "TK-2", optionLabel: "Grande", price: 2000, compareAtPrice: 2500 },
      ],
      extras: [{ code: "nombre", price: null, textMaxLength: 12 }],
      status: "active",
    });
  });

  it("con una sola variante no manda qué se elige ni la opción", () => {
    const single = { ...draft, variants: draft.variants.slice(0, 1) };
    const body = toApiProductBody(single, "draft");
    expect(body.optionName).toBeNull();
    expect(body.variants[0]?.optionLabel).toBeNull();
  });
});

describe("toFormErrors", () => {
  it("traduce las rutas de la API a las del formulario", () => {
    expect(
      toFormErrors(
        {
          categoryId: "Elige una categoría activa.",
          "variants.1.optionLabel": "Esa opción ya está en otra variante.",
          "variants.0.stockPhysical": "x",
          "extras.0.textMaxLength": "Fuera de rango",
          images: "Sube al menos una imagen con texto alternativo antes de publicar.",
          name: "Escribe el nombre",
        },
        draft,
      ),
    ).toEqual({
      category: "Elige una categoría activa.",
      "variants.1.option": "Esa opción ya está en otra variante.",
      "variants.0.physical": "x",
      // El extra 0 de la API es el primero ofrecido: el 1 del formulario.
      "extras.1.textMaxLength": "Fuera de rango",
      newImage: "Sube al menos una imagen con texto alternativo antes de publicar.",
      name: "Escribe el nombre",
    });
  });
});
