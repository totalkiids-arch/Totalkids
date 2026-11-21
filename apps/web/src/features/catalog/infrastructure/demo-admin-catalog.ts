import type { AdminCatalog, AdminResult, InventoryRow } from "../application/admin-catalog";
import {
  countProductsInCategory,
  normalizeSku,
  slugify,
  validateCategoryName,
  validateProductDraft,
  validateStockAdjustment,
  type AdminCategory,
  type AdminProduct,
  type ProductDraft,
  type StockAdjustment,
} from "../domain/admin-product";
import { applyAdminProductQuery } from "../domain/admin-product-query";
import { CATEGORIES } from "../domain/product";
import records from "./totalmuebles/catalogo.json";
import type { CatalogRecord } from "./totalmuebles/transform";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  ALMACÉN DE DEMOSTRACIÓN — NO ES PERSISTENCIA REAL
 * ═══════════════════════════════════════════════════════════════════════════
 *  - Vive en la memoria del proceso de Next.js en el servidor (solo lo usan
 *    Server Components y Server Actions). Se pierde al reiniciar o redesplegar,
 *    y no se comparte entre instancias. No lleva "server-only" porque el índice
 *    de catalog también llega a componentes de cliente (cart-line-item usa
 *    ProductPhoto) y ese import rompería el bundle.
 *  - Se siembra con los productos reales importados de totalmuebles.cl
 *    (catalogo.json). El sitio no informa variantes ni unidades: cada producto
 *    tiene una variante (SKU TK-<id del sitio>) y parte sin stock (a pedido).
 *  - La tienda pública lee fichas y precios de catalogo.json, pero el stock de
 *    cada SKU lo toma de aquí (container.ts): lo que se ajusta en Inventario se
 *    ve en /catalogo y en las fichas.
 *  - Las imágenes nuevas no se suben (el almacenamiento se define en PR-05/LN-12).
 *  - LN-12 lo reemplaza por un adaptador que llama a la API (misma interfaz
 *    AdminCatalog); la API aplica las mismas reglas y la autorización real.
 * ═══════════════════════════════════════════════════════════════════════════
 */

interface DemoState {
  products: AdminProduct[];
  categories: AdminCategory[];
  adjustments: StockAdjustment[];
  sequence: number;
}

/**
 * Todo se fabrica a pedido: el stock parte en 0 y solo el panel (Inventario)
 * registra unidades terminadas. Con 0 la tienda ofrece el producto "a pedido".
 */
function demoStock() {
  return { physical: 0, reserved: 0 };
}

function seedProduct(record: CatalogRecord): AdminProduct {
  return {
    id: String(record.sourceId),
    slug: record.slug,
    name: record.name,
    category: record.category,
    categories: record.categories.includes(record.category)
      ? record.categories
      : [record.category, ...record.categories],
    levels: record.levels,
    materials: record.materials,
    description: record.description.join("\n\n"),
    dimensions: record.dimensions.map((d) => `${d.label} ${d.value}`).join(" · "),
    optionName: null,
    variants: [
      {
        id: `v${record.sourceId}`,
        sku: `TK-${record.sourceId}`,
        option: null,
        price: record.price,
        compareAtPrice: record.compareAtPrice,
        ...demoStock(),
      },
    ],
    assemblyPrice: 0,
    personalizationPrice: 0,
    personalizationMaxLength: 20,
    active: true,
    images: record.images,
  };
}

function seed(): DemoState {
  return {
    products: (records as CatalogRecord[]).map(seedProduct),
    categories: CATEGORIES.map((c) => ({ slug: c.slug, name: c.label, active: true })),
    adjustments: [],
    sequence: 0,
  };
}

// En desarrollo, Next.js recarga módulos al editar: el estado se guarda en
// globalThis para que la demo no se reinicie con cada cambio de código.
const holder = globalThis as typeof globalThis & { __tkDemoAdminCatalog?: DemoState };
const state = (holder.__tkDemoAdminCatalog ??= seed());

function nextId(prefix: string) {
  state.sequence += 1;
  return `${prefix}${state.sequence}`;
}

function uniqueSlug(base: string, takenBy: (slug: string) => boolean) {
  let slug = base || "producto";
  for (let n = 2; takenBy(slug); n += 1) slug = `${base}-${n}`;
  return slug;
}

const clone = <T>(value: T): T => structuredClone(value);

function allowedCategories(current: AdminProduct | null) {
  const active = state.categories.filter((c) => c.active).map((c) => c.slug);
  return [...new Set([...active, ...(current?.categories ?? [])])];
}

function buildProduct(id: string, slug: string, draft: ProductDraft, current: AdminProduct | null) {
  const reserved = new Map(current?.variants.map((v) => [v.id, v.reserved]) ?? []);
  const known = new Set(current?.variants.map((v) => v.id) ?? []);
  const product: AdminProduct = {
    id,
    slug,
    name: draft.name,
    category: draft.category,
    categories: draft.categories,
    levels: draft.levels,
    materials: draft.materials,
    description: draft.description,
    dimensions: draft.dimensions,
    optionName: draft.variants.length > 1 ? draft.optionName : null,
    variants: draft.variants.map((v) => ({
      ...v,
      // Una variante que el producto no tenía es nueva: recibe un id propio y 0 reservas.
      id: known.has(v.id) ? v.id : nextId("v-demo-"),
      sku: v.sku.trim(),
      reserved: reserved.get(v.id) ?? 0,
    })),
    assemblyPrice: draft.assemblyPrice,
    personalizationPrice: draft.personalizationPrice,
    personalizationMaxLength: draft.personalizationMaxLength,
    active: draft.active,
    // Solo cambia el texto alternativo de las fotos actuales; las nuevas no se guardan.
    images: (current?.images ?? []).map((image, index) => ({
      ...image,
      alt: draft.imageAlts[index] ?? image.alt,
    })),
  };
  return product;
}

export const demoAdminCatalog: AdminCatalog = {
  async listProducts(query) {
    return clone(applyAdminProductQuery(state.products, query));
  },

  async getProduct(id) {
    const product = state.products.find((p) => p.id === id);
    return product ? clone(product) : null;
  },

  async saveProduct(id, draft): Promise<AdminResult<AdminProduct>> {
    const current = id === null ? null : (state.products.find((p) => p.id === id) ?? null);
    if (id !== null && !current)
      return { ok: false, errors: { form: "El producto ya no existe." } };

    const errors = validateProductDraft(draft, {
      otherProductSkus: state.products
        .filter((p) => p.id !== id)
        .flatMap((p) => p.variants.map((v) => v.sku)),
      currentVariants: current?.variants ?? [],
      allowedCategories: allowedCategories(current),
    });
    if (Object.keys(errors).length > 0) return { ok: false, errors };

    if (current) {
      const updated = buildProduct(current.id, current.slug, draft, current);
      state.products = state.products.map((p) => (p.id === current.id ? updated : p));
      return { ok: true, value: clone(updated) };
    }
    const slug = uniqueSlug(slugify(draft.name), (s) => state.products.some((p) => p.slug === s));
    const created = buildProduct(nextId("demo-"), slug, draft, null);
    state.products = [created, ...state.products];
    return { ok: true, value: clone(created) };
  },

  async setProductActive(id, active) {
    const product = state.products.find((p) => p.id === id);
    if (!product) return null;
    product.active = active;
    return clone(product);
  },

  async listCategories() {
    return state.categories.map((c) => ({
      ...c,
      productCount: countProductsInCategory(state.products, c.slug),
    }));
  },

  async saveCategory(slug, input): Promise<AdminResult<AdminCategory>> {
    const error = validateCategoryName(input.name, state.categories, slug);
    if (error) return { ok: false, errors: { name: error } };
    const name = input.name.trim();
    if (slug !== null) {
      const category = state.categories.find((c) => c.slug === slug);
      if (!category) return { ok: false, errors: { form: "La categoría ya no existe." } };
      category.name = name;
      category.active = input.active;
      return { ok: true, value: clone(category) };
    }
    const created: AdminCategory = { slug: slugify(name), name, active: input.active };
    state.categories = [...state.categories, created];
    return { ok: true, value: clone(created) };
  },

  async setCategoryActive(slug, active) {
    const category = state.categories.find((c) => c.slug === slug);
    if (!category) return null;
    category.active = active;
    return clone(category);
  },

  async listInventory() {
    return state.products.flatMap((p) =>
      p.variants.map((v): InventoryRow => ({
        productId: p.id,
        productName: p.name,
        productSlug: p.slug,
        variantId: v.id,
        sku: v.sku,
        option: v.option,
        physical: v.physical,
        reserved: v.reserved,
      })),
    );
  },

  async adjustStock({ sku, physical, reason, actor }): Promise<AdminResult<StockAdjustment>> {
    const key = normalizeSku(sku);
    const product = state.products.find((p) => p.variants.some((v) => normalizeSku(v.sku) === key));
    const variant = product?.variants.find((v) => normalizeSku(v.sku) === key);
    if (!product || !variant)
      return { ok: false, errors: { sku: "Elige una variante del listado." } };

    const errors = validateStockAdjustment({ physical, reserved: variant.reserved, reason });
    if (Object.keys(errors).length > 0) return { ok: false, errors };

    const adjustment: StockAdjustment = {
      id: nextId("ajuste-"),
      at: new Date().toISOString(),
      actor,
      productName: product.name,
      sku: variant.sku,
      before: variant.physical,
      after: physical,
      reason: reason.trim(),
    };
    product.variants = product.variants.map((v) => (v.id === variant.id ? { ...v, physical } : v));
    state.adjustments = [adjustment, ...state.adjustments];
    return { ok: true, value: clone(adjustment) };
  },

  async listAdjustments(limit) {
    return clone(state.adjustments.slice(0, limit));
  },
};
