// Semilla de la base (pnpm db:seed): categorías, catálogo importado de
// totalmuebles.cl y la fila única de configuración.
//
// Idempotente: se puede correr varias veces. Al repetirse actualiza nombres,
// textos, precios, categorías e imágenes, pero NO pisa el stock, el plazo, los
// precios de extras ni la configuración que el equipo ya haya editado en el
// panel. El stock parte en 0: todo se fabrica a pedido (UI-11). No crea
// usuarios ni contraseñas (para eso: pnpm --filter @totalkids/api users:create).
import "dotenv/config";

import { readFileSync } from "node:fs";

import { parseCatalog, SEED_CATEGORIES, SEED_EXTRAS } from "../src/db/seed/catalog-seed.js";
import { createPrismaClient } from "../src/lib/prisma.js";

const CATALOG_URL = new URL(
  "../../web/src/features/catalog/infrastructure/totalmuebles/catalogo.json",
  import.meta.url,
);

const url = process.env.DATABASE_URL;
if (!url) throw new Error("Falta DATABASE_URL (copia apps/api/.env.example a .env).");

const prisma = createPrismaClient(url);

async function main() {
  const products = parseCatalog(JSON.parse(readFileSync(CATALOG_URL, "utf8")));

  const categoryIds = new Map<string, string>();
  for (const [index, category] of SEED_CATEGORIES.entries()) {
    const row = await prisma.category.upsert({
      where: { slug: category.slug },
      create: { slug: category.slug, name: category.name, sortOrder: index },
      update: { name: category.name, sortOrder: index },
    });
    categoryIds.set(category.slug, row.id);
  }

  // Extras: se crean si faltan; su precio lo administra el panel.
  const extraIds: string[] = [];
  for (const extra of SEED_EXTRAS) {
    const row = await prisma.extra.upsert({
      where: { code: extra.code },
      create: {
        code: extra.code,
        name: extra.name,
        price: extra.price,
        requiresText: extra.requiresText,
      },
      update: { name: extra.name },
    });
    extraIds.push(row.id);
  }

  for (const p of products) {
    const categoryId = categoryIds.get(p.categorySlug);
    if (!categoryId) throw new Error(`Sin categoría para ${p.slug}`);
    const additionalIds = p.additionalCategorySlugs.map((slug) => {
      const id = categoryIds.get(slug);
      if (!id) throw new Error(`Sin categoría ${slug} para ${p.slug}`);
      return id;
    });

    await prisma.$transaction(async (tx) => {
      const fields = {
        categoryId,
        name: p.name,
        summary: p.summary,
        description: p.description,
        ageGroups: p.ageGroups,
        materials: p.materials,
        dimensions: p.dimensions,
        specs: p.specs,
        featured: p.featured,
        status: "active" as const,
        publishedAt: p.publishedAt,
      };
      const product = await tx.product.upsert({
        where: { slug: p.slug },
        // El plazo se define una vez; después lo edita el panel.
        create: { slug: p.slug, leadTime: p.leadTime, ...fields },
        update: fields,
      });

      // Categorías adicionales (p. ej. "Línea JUNJI"): se reemplazan por las del catálogo.
      await tx.productCategory.deleteMany({ where: { productId: product.id } });
      await tx.productCategory.createMany({
        data: additionalIds.map((id) => ({ productId: product.id, categoryId: id })),
      });

      // Extras ofrecidos: se agregan si faltan, sin pisar precios por producto.
      await tx.productExtra.createMany({
        data: extraIds.map((extraId, sortOrder) => ({ productId: product.id, extraId, sortOrder })),
        skipDuplicates: true,
      });

      const prices = { price: p.variant.price, compareAtPrice: p.variant.compareAtPrice };
      await tx.productVariant.upsert({
        where: { sku: p.variant.sku },
        create: {
          productId: product.id,
          sku: p.variant.sku,
          stockPhysical: p.variant.stockPhysical,
          ...prices,
        },
        // El stock se administra en el panel: al repetir la semilla no se pisa.
        update: prices,
      });

      // Las imágenes dependen por completo del producto: se reemplazan.
      await tx.productImage.deleteMany({ where: { productId: product.id } });
      await tx.productImage.createMany({
        data: p.images.map((image) => ({ productId: product.id, ...image })),
      });
    });
  }

  // Configuración: valores de la maqueta hasta que el cliente los entregue (CL-02).
  await prisma.setting.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      pickupDetails: "[TU DIRECCIÓN], [COMUNA] · [HORARIO DE RETIRO]",
      pickupEnabled: true,
      freeShippingThreshold: null,
      reservationMinutes: 30,
    },
    update: {},
  });

  const withAdditional = products.filter((p) => p.additionalCategorySlugs.length > 0).length;
  console.log(
    `Semilla lista: ${SEED_CATEGORIES.length} categorías, ${products.length} productos ` +
      `(${withAdditional} con categorías adicionales, stock inicial 0), ` +
      `${SEED_EXTRAS.length} extra(s) y configuración.`,
  );
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
