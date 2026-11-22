import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Prisma } from "../src/generated/prisma/client.js";
import { createPrismaClient } from "../src/lib/prisma.js";
import { buildTestApp, csrfHeaders } from "./helpers.js";

// API del catálogo (LN-05) contra totalkids_test. Requiere docker compose up y
// pnpm db:migrate:test; se omite sin TEST_DATABASE_URL. Crea su propio catálogo
// y lo borra al terminar.
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("catálogo público (PostgreSQL real)", () => {
  const prisma = createPrismaClient(url ?? "");
  const app = buildTestApp({ prisma });
  const created = {
    orders: [] as string[],
    products: [] as string[],
    categories: [] as string[],
    extras: [] as string[],
  };

  const get = (path: string) => request(app).get(`/api/v1${path}`);
  const slugs = (res: request.Response) =>
    (res.body.items as { slug: string }[]).map((item) => item.slug);

  async function category(slug: string, name: string, sortOrder: number, active = true) {
    const row = await prisma.category.create({ data: { slug, name, sortOrder, active } });
    created.categories.push(row.id);
    return row.id;
  }

  async function product(
    data: Omit<Prisma.ProductUncheckedCreateInput, "name"> & { name: string },
    variants: Partial<Prisma.ProductVariantUncheckedCreateInput>[],
  ) {
    const row = await prisma.product.create({
      data: { status: "active", publishedAt: new Date("2026-01-01"), ...data },
    });
    created.products.push(row.id);
    const rows = [];
    for (const [index, variant] of variants.entries()) {
      rows.push(
        await prisma.productVariant.create({
          data: { productId: row.id, sku: `${data.slug}-${String(index)}`, ...variant },
        }),
      );
    }
    return { ...row, variants: rows };
  }

  async function sell(
    variantId: string,
    quantity: number,
    status: "confirmed" | "delivered" | "pending_payment",
  ) {
    const total = 1000 * quantity;
    const order = await prisma.order.create({
      data: {
        idempotencyKey: `cat-${variantId}-${status}`,
        buyerName: "Compra",
        buyerRut: "12.345.678-5",
        buyerEmail: "compra@correo.cl",
        buyerPhone: "+56912345678",
        deliveryMethod: "pickup",
        pickupDetails: "Taller",
        taxDocument: "boleta",
        subtotal: total,
        shippingCost: 0,
        total,
        status,
        paidAt: status === "pending_payment" ? null : new Date(),
        termsAcceptedAt: new Date(),
        termsVersion: "v1",
        paymentDueAt: new Date(Date.now() + 60_000),
        items: {
          create: {
            variantId,
            productName: "x",
            sku: "x",
            quantity,
            unitPrice: 1000,
            lineTotal: total,
          },
        },
      },
    });
    created.orders.push(order.id);
  }

  beforeAll(async () => {
    const cunas = await category("cat-cunas", "Cunas y camas", 0);
    const almacenamiento = await category("cat-almacenamiento", "Almacenamiento", 1);
    const oculta = await category("cat-oculta", "Oculta", 2, false);

    const baul = await product(
      {
        slug: "baul-montessori",
        name: "Baúl Montessori",
        summary: "Para guardar juguetes",
        categoryId: almacenamiento,
        ageGroups: ["sala-cuna"],
        materials: ["madera"],
        publishedAt: new Date("2026-01-01"),
      },
      [{ price: 50_000, compareAtPrice: 60_000, stockPhysical: 0 }],
    );
    const cuna = await product(
      {
        slug: "cuna-alta-junji",
        name: "Cuna alta JUNJI",
        summary: "Cuna de madera con barandas",
        categoryId: cunas,
        ageGroups: ["sala-cuna", "nivel-medio"],
        materials: ["madera", "metal"],
        description: "Cuna resistente.",
        publishedAt: new Date("2026-03-01"),
      },
      [
        { price: 150_000, stockPhysical: 0, optionLabel: "2 plazas", sortOrder: 2 },
        {
          price: 120_000,
          stockPhysical: 3,
          stockReserved: 1,
          optionLabel: "1 plaza",
          sortOrder: 1,
        },
        { price: 99_000, active: false, optionLabel: "Descontinuada", sortOrder: 3 },
      ],
    );
    await product(
      {
        slug: "mesa-redonda",
        name: "Mesa redonda",
        categoryId: almacenamiento,
        materials: ["melamina"],
        featured: true,
        publishedAt: new Date("2026-02-01"),
      },
      [{ price: null }],
    );
    const cojin = await product(
      {
        slug: "cojin-algodon",
        name: "Cojín 100% algodón",
        categoryId: cunas,
        publishedAt: new Date("2026-04-01"),
      },
      [{ price: 9_990, stockPhysical: 5 }],
    );
    // No visibles: borrador, publicación futura, categoría inactiva, sin variantes activas.
    await product(
      { slug: "borrador", name: "Borrador", categoryId: cunas, status: "draft", publishedAt: null },
      [{ price: 1000 }],
    );
    await product(
      {
        slug: "futuro",
        name: "Futuro",
        categoryId: cunas,
        publishedAt: new Date(Date.now() + 86_400_000),
      },
      [{ price: 1000 }],
    );
    await product({ slug: "en-oculta", name: "En oculta", categoryId: oculta }, [{ price: 1000 }]);
    await product({ slug: "sin-variantes", name: "Sin variantes", categoryId: cunas }, [
      { price: 1000, active: false },
    ]);

    await prisma.productImage.createMany({
      data: [
        { productId: cuna.id, url: "/productos/cuna/2.webp", alt: "Detalle", sortOrder: 2 },
        {
          productId: cuna.id,
          url: "/productos/cuna/1.webp",
          alt: "Cuna alta",
          sortOrder: 1,
          width: 800,
          height: 600,
        },
        {
          productId: cuna.id,
          variantId: cuna.variants[0]?.id ?? null,
          url: "/productos/cuna/doble.webp",
          alt: "Cuna 2 plazas",
          sortOrder: 3,
        },
      ],
    });
    const extras = await Promise.all([
      prisma.extra.create({ data: { code: "cat-armado", name: "Armado", price: 15_000 } }),
      prisma.extra.create({
        data: {
          code: "cat-nombre",
          name: "Nombre grabado",
          requiresText: true,
          textLabel: "Nombre",
          textMaxLength: 12,
        },
      }),
      prisma.extra.create({
        data: { code: "cat-pintura", name: "Pintura", price: 5000, available: false },
      }),
    ]);
    created.extras.push(...extras.map((e) => e.id));
    await prisma.productExtra.createMany({
      data: extras.map((extra, sortOrder) => ({
        productId: cuna.id,
        extraId: extra.id,
        sortOrder,
      })),
    });

    // Más vendidos: el baúl (5) supera a la cuna (2); el pedido sin pagar del cojín no cuenta.
    await sell(baul.variants[0]?.id ?? "", 5, "confirmed");
    await sell(cuna.variants[1]?.id ?? "", 2, "delivered");
    await sell(cojin.variants[0]?.id ?? "", 10, "pending_payment");
  });

  afterAll(async () => {
    await prisma.orderItem.deleteMany({ where: { orderId: { in: created.orders } } });
    await prisma.order.deleteMany({ where: { id: { in: created.orders } } });
    await prisma.productExtra.deleteMany({ where: { productId: { in: created.products } } });
    await prisma.extra.deleteMany({ where: { id: { in: created.extras } } });
    await prisma.productImage.deleteMany({ where: { productId: { in: created.products } } });
    await prisma.productVariant.deleteMany({ where: { productId: { in: created.products } } });
    await prisma.product.deleteMany({ where: { id: { in: created.products } } });
    await prisma.category.deleteMany({ where: { id: { in: created.categories } } });
    await prisma.$disconnect();
  });

  // ── Categorías ─────────────────────────────────────────────────────────────

  it("GET /categories: activas, en orden, con la cantidad de productos visibles", async () => {
    const res = await get("/categories");
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([
      { slug: "cat-cunas", name: "Cunas y camas", description: null, productCount: 2 },
      { slug: "cat-almacenamiento", name: "Almacenamiento", description: null, productCount: 2 },
    ]);
  });

  // ── Listado ────────────────────────────────────────────────────────────────

  it("GET /products: solo visibles, ordenados por más vendidos", async () => {
    const res = await get("/products");
    expect(res.status).toBe(200);
    // Baúl (5 vendidos), cuna (2), mesa (destacada), cojín.
    expect(slugs(res)).toEqual([
      "baul-montessori",
      "cuna-alta-junji",
      "mesa-redonda",
      "cojin-algodon",
    ]);
    expect(res.body.meta).toEqual({ page: 1, pageSize: 20, total: 4, totalPages: 1 });
  });

  it("cada producto trae precio desde, oferta, disponibilidad y foto principal", async () => {
    const res = await get("/products?category=cat-cunas");
    const cuna = (res.body.items as Record<string, unknown>[]).find(
      (p) => p.slug === "cuna-alta-junji",
    );
    expect(cuna).toEqual({
      slug: "cuna-alta-junji",
      name: "Cuna alta JUNJI",
      summary: "Cuna de madera con barandas",
      category: { slug: "cat-cunas", name: "Cunas y camas" },
      ageGroups: ["sala-cuna", "nivel-medio"],
      materials: ["madera", "metal"],
      price: 120_000,
      compareAtPrice: null,
      onSale: false,
      featured: false,
      availability: "en_stock",
      publishedAt: "2026-03-01T00:00:00.000Z",
      image: { url: "/productos/cuna/1.webp", alt: "Cuna alta", width: 800, height: 600 },
    });
    const baul = (await get("/products?q=baul")).body.items[0] as Record<string, unknown>;
    expect(baul).toMatchObject({
      price: 50_000,
      compareAtPrice: 60_000,
      onSale: true,
      availability: "a_pedido",
      image: null,
    });
  });

  it("busca sin tildes ni mayúsculas, por palabras, en nombre, resumen y categoría", async () => {
    expect(slugs(await get("/products?q=baul"))).toEqual(["baul-montessori"]);
    expect(slugs(await get("/products?q=BAÚL"))).toEqual(["baul-montessori"]);
    expect(slugs(await get(`/products?q=${encodeURIComponent("cuna JUNJI")}`))).toEqual([
      "cuna-alta-junji",
    ]);
    expect(slugs(await get("/products?q=juguetes"))).toEqual(["baul-montessori"]);
    expect(slugs(await get("/products?q=almacenamiento")).sort()).toEqual([
      "baul-montessori",
      "mesa-redonda",
    ]);
    expect(slugs(await get("/products?q=cojin%20mesa"))).toEqual([]);
    expect(slugs(await get("/products?q=inexistente"))).toEqual([]);
  });

  it("los comodines de la búsqueda se toman literales", async () => {
    expect(slugs(await get(`/products?q=${encodeURIComponent("100%")}`))).toEqual([
      "cojin-algodon",
    ]);
    expect(slugs(await get(`/products?q=${encodeURIComponent("%")}`))).toEqual(["cojin-algodon"]);
    expect(slugs(await get("/products?q=_"))).toEqual([]);
  });

  it("filtra por categoría, nivel, material, precio, oferta y disponibilidad", async () => {
    const sorted = async (query: string) => slugs(await get(`/products?${query}`)).sort();
    expect(await sorted("category=cat-cunas")).toEqual(["cojin-algodon", "cuna-alta-junji"]);
    expect(await sorted("ageGroup=nivel-medio")).toEqual(["cuna-alta-junji"]);
    expect(await sorted("material=madera&material=melamina")).toEqual([
      "baul-montessori",
      "cuna-alta-junji",
      "mesa-redonda",
    ]);
    expect(await sorted("material=metal,melamina")).toEqual(["cuna-alta-junji", "mesa-redonda"]);
    // Sin precio definido no entra en un rango de precio.
    expect(await sorted("priceMin=10000&priceMax=100000")).toEqual(["baul-montessori"]);
    expect(await sorted("priceMax=60000")).toEqual(["baul-montessori", "cojin-algodon"]);
    expect(await sorted("onSale=true")).toEqual(["baul-montessori"]);
    expect(await sorted("availability=a_pedido")).toEqual(["baul-montessori", "mesa-redonda"]);
    expect(await sorted("availability=en_stock")).toEqual(["cojin-algodon", "cuna-alta-junji"]);
    expect(await sorted("category=cat-cunas&availability=en_stock&q=cojin")).toEqual([
      "cojin-algodon",
    ]);
    expect(await sorted("category=cat-oculta")).toEqual([]);
  });

  it("ordena por precio (sin precio al final) y por novedades", async () => {
    expect(slugs(await get("/products?sort=price_asc"))).toEqual([
      "cojin-algodon",
      "baul-montessori",
      "cuna-alta-junji",
      "mesa-redonda",
    ]);
    expect(slugs(await get("/products?sort=price_desc"))).toEqual([
      "cuna-alta-junji",
      "baul-montessori",
      "cojin-algodon",
      "mesa-redonda",
    ]);
    expect(slugs(await get("/products?sort=newest"))).toEqual([
      "cojin-algodon",
      "cuna-alta-junji",
      "mesa-redonda",
      "baul-montessori",
    ]);
  });

  it("pagina con meta; una página fuera de rango viene vacía con el total real", async () => {
    const second = await get("/products?pageSize=3&page=2");
    expect(slugs(second)).toEqual(["cojin-algodon"]);
    expect(second.body.meta).toEqual({ page: 2, pageSize: 3, total: 4, totalPages: 2 });
    const beyond = await get("/products?pageSize=3&page=9");
    expect(beyond.body.items).toEqual([]);
    expect(beyond.body.meta.total).toBe(4);
  });

  it("valida la consulta (422)", async () => {
    for (const query of [
      "priceMin=5000&priceMax=1000",
      "sort=popular",
      "pageSize=500",
      "category=Cunas!",
      "availability=agotado",
      "onSale=quizas",
      `q=${"a".repeat(101)}`,
    ]) {
      const res = await get(`/products?${query}`);
      expect(res.status, query).toBe(422);
      expect(res.body.code).toBe("VALIDATION_ERROR");
    }
  });

  // ── Ficha ──────────────────────────────────────────────────────────────────

  it("GET /products/{slug}: variantes activas con disponibilidad, fotos y extras disponibles", async () => {
    const res = await get("/products/cuna-alta-junji");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      slug: "cuna-alta-junji",
      description: "Cuna resistente.",
      price: 120_000,
      availability: "en_stock",
      image: { url: "/productos/cuna/1.webp" },
    });
    expect(res.body.variants).toEqual([
      {
        sku: "cuna-alta-junji-1",
        optionLabel: "1 plaza",
        color: null,
        size: null,
        price: 120_000,
        compareAtPrice: null,
        available: 2,
        availability: "en_stock",
      },
      {
        sku: "cuna-alta-junji-0",
        optionLabel: "2 plazas",
        color: null,
        size: null,
        price: 150_000,
        compareAtPrice: null,
        available: 0,
        availability: "a_pedido",
      },
    ]);
    expect(
      (res.body.images as { url: string; variantSku: string | null }[]).map((i) => [
        i.url,
        i.variantSku,
      ]),
    ).toEqual([
      ["/productos/cuna/1.webp", null],
      ["/productos/cuna/2.webp", null],
      ["/productos/cuna/doble.webp", "cuna-alta-junji-0"],
    ]);
    expect(res.body.extras).toEqual([
      { code: "cat-armado", name: "Armado", price: 15_000, personalization: null },
      {
        code: "cat-nombre",
        name: "Nombre grabado",
        price: null,
        personalization: { label: "Nombre", maxLength: 12 },
      },
    ]);
  });

  it("GET /products/{slug}: 404 si no existe o no está visible", async () => {
    for (const slug of [
      "no-existe",
      "borrador",
      "futuro",
      "en-oculta",
      "sin-variantes",
      "Mal%20Formado",
    ]) {
      const res = await get(`/products/${slug}`);
      expect(res.status, slug).toBe(404);
      expect(res.body.code).toBe("NOT_FOUND");
    }
  });

  it("las rutas del catálogo solo admiten GET", async () => {
    const res = await request(app).delete("/api/v1/products/cuna-alta-junji").set(csrfHeaders());
    expect(res.status).toBe(405);
    expect(res.headers.allow).toBe("GET, HEAD");
    const head = await request(app).head("/api/v1/categories");
    expect(head.status).toBe(200);
  });
});
