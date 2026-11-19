/**
 * Importa el catálogo desde totalmuebles.cl (sitio WooCommerce del cliente).
 *
 *   pnpm --filter web catalogo:importar
 *
 * Lee la Store API pública (solo JSON: no ejecuta nada del sitio), descarta los
 * productos excluidos, normaliza textos y descarga las fotos como WebP en
 * public/productos/<slug>/. Escribe infrastructure/totalmuebles/catalogo.json,
 * que el adaptador del catálogo lee y que luego servirá de semilla para la base
 * de datos de la API. Se puede volver a ejecutar para actualizar precios y stock.
 */
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

import {
  EXCLUDED_SLUGS,
  detectLevels,
  detectMaterials,
  htmlToLines,
  mapCategories,
  mapPrices,
  normalizeName,
  parseDescription,
  summarize,
  type CatalogRecord,
  type WooProduct,
} from "../src/features/catalog/infrastructure/totalmuebles/transform.ts";

const SITE = "https://totalmuebles.cl";
const SOURCE_CATEGORIES = ["junji", "infantil", "montessori-pikler"];
const FEATURED_COUNT = 8;
const MAX_IMAGES = 6;
const IMAGE_WIDTH = 1200;
const HEADERS = { "User-Agent": "TotalKidsCatalogImport/1.0", Accept: "application/json" };

const ROOT = path.resolve(import.meta.dirname, "..");
const IMAGES_DIR = path.join(ROOT, "public/productos");
const OUTPUT = path.join(ROOT, "src/features/catalog/infrastructure/totalmuebles/catalogo.json");

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: HEADERS });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return (await response.json()) as T;
}

/** Recorre todas las páginas de un endpoint de WordPress (100 por página). */
async function getAll<T>(endpoint: string): Promise<T[]> {
  const items: T[] = [];
  for (let page = 1; ; page++) {
    const sep = endpoint.includes("?") ? "&" : "?";
    const batch = await getJson<T[]>(`${SITE}${endpoint}${sep}per_page=100&page=${page}`);
    items.push(...batch);
    if (batch.length < 100) return items;
  }
}

async function downloadImage(src: string, file: string) {
  const response = await fetch(src, { headers: { "User-Agent": HEADERS["User-Agent"] } });
  if (!response.ok) throw new Error(`${response.status} al descargar ${src}`);
  const info = await sharp(Buffer.from(await response.arrayBuffer()))
    .rotate()
    .resize({ width: IMAGE_WIDTH, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toFile(file);
  return { width: info.width, height: info.height };
}

/** Ejecuta las tareas de a `limit` en paralelo. */
async function pool<T, R>(items: readonly T[], limit: number, task: (item: T) => Promise<R>) {
  const results: R[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await task(items[index] as T);
      }
    }),
  );
  return results;
}

async function main() {
  const categories = await getJson<{ id: number; slug: string }[]>(
    `${SITE}/wp-json/wc/store/v1/products/categories?per_page=100`,
  );
  const ids = SOURCE_CATEGORIES.map((slug) => {
    const found = categories.find((c) => c.slug === slug);
    if (!found) throw new Error(`No existe la categoría ${slug} en el sitio`);
    return found.id;
  });

  const bySlug = new Map<string, WooProduct>();
  for (const id of ids) {
    for (const p of await getAll<WooProduct>(`/wp-json/wc/store/v1/products?category=${id}`)) {
      if (!EXCLUDED_SLUGS.has(p.slug)) bySlug.set(p.slug, p);
    }
  }
  console.log(`Productos: ${bySlug.size} (${EXCLUDED_SLUGS.size} excluidos por regla)`);

  const ranking = await getAll<{ slug: string }>(
    "/wp-json/wc/store/v1/products?orderby=popularity&order=desc",
  );
  const rank = new Map(ranking.map((p, i) => [p.slug, ranking.length - i]));
  const dates = await getAll<{ slug: string; date: string }>(
    "/wp-json/wp/v2/product?_fields=slug,date",
  );
  const published = new Map(dates.map((p) => [p.slug, p.date.slice(0, 10)]));
  const clientFeatured = new Set(
    (await getJson<{ slug: string }[]>(`${SITE}/wp-json/wc/store/v1/products?featured=true`)).map(
      (p) => p.slug,
    ),
  );

  await rm(IMAGES_DIR, { recursive: true, force: true });
  const products = [...bySlug.values()].sort((a, b) => a.slug.localeCompare(b.slug));

  const records = await pool(products, 6, async (p): Promise<CatalogRecord> => {
    const name = normalizeName(p.name);
    const parsed = parseDescription(htmlToLines(p.description));
    const { category, categories: mapped } = mapCategories(
      p.name,
      p.categories.map((c) => c.slug),
    );
    const allText = [p.name, ...parsed.description, ...parsed.specs.map((s) => s.value)].join(" ");

    const dir = path.join(IMAGES_DIR, p.slug);
    await mkdir(dir, { recursive: true });
    const sources = p.images.slice(0, MAX_IMAGES);
    const images = [];
    for (const [i, image] of sources.entries()) {
      const file = `${i + 1}.webp`;
      const size = await downloadImage(image.src, path.join(dir, file));
      images.push({
        src: `/productos/${p.slug}/${file}`,
        ...size,
        alt: sources.length > 1 ? `${name}, foto ${i + 1} de ${sources.length}` : name,
      });
    }

    return {
      sourceId: p.id,
      sourceUrl: p.permalink,
      slug: p.slug,
      name,
      category,
      categories: mapped,
      levels: detectLevels(p.name, parsed.description),
      materials: detectMaterials(allText),
      summary: summarize(parsed),
      ...parsed,
      ...mapPrices(p),
      available: p.is_in_stock ? p.low_stock_remaining : 0,
      inStock: p.is_in_stock,
      popularity: rank.get(p.slug) ?? 0,
      publishedAt: published.get(p.slug) ?? "2020-01-01",
      featured: clientFeatured.has(p.slug),
      images,
    };
  });

  // Destacados: los que marca el cliente y, hasta completar, los más vendidos con foto,
  // primero uno por categoría para que la portada muestre variedad.
  const candidates = [...records]
    .filter((r) => r.images.length > 0 && r.inStock)
    .sort((a, b) => b.popularity - a.popularity);
  const featured = () => records.filter((r) => r.featured);
  for (const record of candidates) {
    if (featured().length >= FEATURED_COUNT) break;
    if (!featured().some((r) => r.category === record.category)) record.featured = true;
  }
  for (const record of candidates) {
    if (featured().length >= FEATURED_COUNT) break;
    record.featured = true;
  }

  await writeFile(OUTPUT, `${JSON.stringify(records, null, 2)}\n`);
  const imageCount = records.reduce((n, r) => n + r.images.length, 0);
  const dirs = await readdir(IMAGES_DIR);
  console.log(`Escrito ${path.relative(ROOT, OUTPUT)}: ${records.length} productos`);
  console.log(`Fotos: ${imageCount} en ${dirs.length} carpetas de public/productos`);
}

await main();
