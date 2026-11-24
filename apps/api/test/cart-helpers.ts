import { randomUUID } from "node:crypto";

import type { Express } from "express";
import request, { type Response } from "supertest";

import { CSRF_COOKIE_DEV, issueCsrfToken } from "../src/lib/csrf.js";
import type { PrismaClient } from "../src/lib/prisma.js";
import { CART_COOKIE_DEV } from "../src/middleware/cart-session.js";
import { testEnv } from "./helpers.js";

/**
 * Navegador de prueba para el carrito (LN-06): guarda la cookie del carrito y el
 * par CSRF que devuelve la API, y los reenvía como lo hace Next.js.
 */
export class CartClient {
  csrf = issueCsrfToken(testEnv.CSRF_SECRET ?? "", "");
  cart: string | undefined;

  constructor(private readonly app: Express) {}

  headers(extraCookies: string[] = []): Record<string, string> {
    const cookies = [`${CSRF_COOKIE_DEV}=${this.csrf}`, ...extraCookies];
    if (this.cart) cookies.push(`${CART_COOKIE_DEV}=${this.cart}`);
    return { cookie: cookies.join("; "), "x-csrf-token": this.csrf };
  }

  /** Toma los Set-Cookie y el X-CSRF-Token de la respuesta. */
  absorb(res: Response): Response {
    const setCookie = res.headers["set-cookie"] as unknown as string[] | undefined;
    for (const cookie of setCookie ?? []) {
      const [pair = ""] = cookie.split(";");
      const [name, value = ""] = pair.split("=");
      if (name === CART_COOKIE_DEV) this.cart = value;
      if (name === CSRF_COOKIE_DEV) this.csrf = value;
    }
    const header = res.headers["x-csrf-token"] as string | undefined;
    if (header) this.csrf = header;
    return res;
  }

  async get(path: string) {
    return this.absorb(await request(this.app).get(`/api/v1${path}`).set(this.headers()));
  }

  async post(path: string, body: object) {
    return this.absorb(
      await request(this.app).post(`/api/v1${path}`).set(this.headers()).send(body),
    );
  }

  async patch(path: string, body: object) {
    return this.absorb(
      await request(this.app).patch(`/api/v1${path}`).set(this.headers()).send(body),
    );
  }

  async delete(path: string) {
    return this.absorb(await request(this.app).delete(`/api/v1${path}`).set(this.headers()));
  }
}

export interface ShopFixture {
  productId: string;
  slug: string;
  /** Variante con 5 en stock a $10.000. */
  skuA: string;
  variantA: string;
  /** Variante sin stock (a pedido) a $20.000. */
  skuB: string;
  variantB: string;
  /** Armado: $5.000 (precio propio del producto), sin texto. */
  armado: string;
  /** Nombre grabado: pide texto (máx. 12 en este producto), precio por confirmar. */
  nombre: string;
  /** Extra existente que este producto NO ofrece. */
  barniz: string;
  extraIds: Record<"armado" | "nombre" | "barniz", string>;
}

/** Producto publicado y visible con dos variantes y extras (dentro de una transacción). */
export async function shopFixture(db: PrismaClient): Promise<ShopFixture> {
  const tag = randomUUID().slice(0, 8);
  const category = await db.category.create({
    data: { slug: `carrito-${tag}`, name: `Carrito ${tag}`, active: true },
  });
  const product = await db.product.create({
    data: {
      categoryId: category.id,
      name: `Silla ${tag}`,
      slug: `silla-${tag}`,
      status: "active",
      publishedAt: new Date(Date.now() - 60_000),
      optionName: "Color",
      leadTime: "10 días hábiles",
      variants: {
        create: [
          {
            sku: `TK-${tag}-A`.toUpperCase(),
            optionLabel: "Azul",
            price: 10_000,
            stockPhysical: 5,
          },
          {
            sku: `TK-${tag}-B`.toUpperCase(),
            optionLabel: "Rojo",
            price: 20_000,
            stockPhysical: 0,
            sortOrder: 1,
          },
        ],
      },
    },
    include: { variants: { orderBy: { sortOrder: "asc" } } },
  });
  const [a, b] = product.variants;
  const armado = await db.extra.create({
    data: { code: `armado-${tag}`, name: "Armado", price: 4_000 },
  });
  const nombre = await db.extra.create({
    data: {
      code: `nombre-${tag}`,
      name: "Nombre grabado",
      requiresText: true,
      textLabel: "Nombre del niño",
      textMaxLength: 40,
    },
  });
  const barniz = await db.extra.create({
    data: { code: `barniz-${tag}`, name: "Barniz", price: 2_000 },
  });
  await db.productExtra.createMany({
    data: [
      { productId: product.id, extraId: armado.id, price: 5_000 },
      { productId: product.id, extraId: nombre.id, textMaxLength: 12, sortOrder: 1 },
    ],
  });
  if (!a || !b) throw new Error("fixture sin variantes");
  return {
    productId: product.id,
    slug: product.slug,
    skuA: a.sku,
    variantA: a.id,
    skuB: b.sku,
    variantB: b.id,
    armado: armado.code,
    nombre: nombre.code,
    barniz: barniz.code,
    extraIds: { armado: armado.id, nombre: nombre.id, barniz: barniz.id },
  };
}

/** Fila única de configuración (id = 1) con los valores dados. */
export async function setSettings(
  db: PrismaClient,
  data: { freeShippingThreshold?: number | null; pickupEnabled?: boolean; pickupDetails?: string },
) {
  const values = { pickupDetails: "Taller Total Kids, Maipú. Lun a vie 9–18 h.", ...data };
  await db.setting.upsert({ where: { id: 1 }, create: { id: 1, ...values }, update: values });
}

/** Fecha DATE (medianoche UTC) a `days` días de hoy en Chile. */
export function chileDay(days: number): Date {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(
    new Date(),
  );
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

export async function createCoupon(
  db: PrismaClient,
  data: {
    kind?: "percent" | "amount";
    value?: number;
    startsOn?: Date;
    endsOn?: Date;
    maxUses?: number;
    usesCount?: number;
    active?: boolean;
  } = {},
) {
  const code = `KIDS${randomUUID().slice(0, 8).toUpperCase()}`;
  return db.coupon.create({
    data: {
      code,
      kind: data.kind ?? "percent",
      value: data.value ?? 10,
      startsOn: data.startsOn ?? chileDay(-1),
      endsOn: data.endsOn ?? chileDay(1),
      maxUses: data.maxUses ?? 10,
      usesCount: data.usesCount ?? 0,
      active: data.active ?? true,
    },
  });
}
