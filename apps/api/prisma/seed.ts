// Semilla de la base (pnpm db:seed): categorías, catálogo importado de
// totalmuebles.cl y la fila única de configuración.
//
// Idempotente: se puede correr varias veces. Al repetirse actualiza nombres,
// textos, precios e imágenes, pero NO pisa el stock ni la configuración que el
// equipo ya haya editado en el panel. No crea usuarios ni contraseñas.
import "dotenv/config";

import { readFileSync } from "node:fs";

import { parseCatalog, SEED_CATEGORIES } from "../src/db/seed/catalog-seed.js";
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

  for (const p of products) {
    const categoryId = categoryIds.get(p.categorySlug);
    if (!categoryId) throw new Error(`Sin categoría para ${p.slug}`);

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
        create: { slug: p.slug, ...fields },
        update: fields,
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

  console.log(
    `Semilla lista: ${SEED_CATEGORIES.length} categorías, ${products.length} productos y configuración.`,
  );
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
