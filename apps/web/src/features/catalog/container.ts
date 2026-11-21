// Raíz de composición de "catalog": conecta el puerto con su adaptador actual.
import type { ActivityEntry } from "@/features/activity";
import type { AdminCatalog } from "./application/admin-catalog";
import { withInventoryStock } from "./application/inventory-stock";
import type { ProductCatalog } from "./application/product-catalog";
import { inventoryStatus } from "./domain/admin-product";
import type { CatalogQuery } from "./domain/catalog-query";
import { demoAdminCatalog } from "./infrastructure/demo-admin-catalog";
import { importedProductCatalog } from "./infrastructure/imported-product-catalog";

/** Caso de uso: productos destacados de la portada. */
export function listFeaturedProducts() {
  return productCatalog.listFeatured();
}

/** Caso de uso: búsqueda del catálogo (RF-01, RF-02). */
export function searchCatalog(query: CatalogQuery) {
  return productCatalog.search(query);
}

/** Caso de uso: ficha de producto (RF-03, RF-04). */
export function getProductDetail(slug: string) {
  return productCatalog.getBySlug(slug);
}

/** Caso de uso: "Completa su pieza" en la ficha. */
export function listRelatedProducts(slug: string, limit = 4) {
  return productCatalog.listRelated(slug, limit);
}

/** Caso de uso: slugs publicados (prerender de fichas y sitemap). */
export function listProductSlugs() {
  return productCatalog.listSlugs();
}

// ── Panel administrativo (UI-11) ─────────────────────────────────────────────
// DEMO (ver infrastructure/demo-admin-catalog.ts). En LN-12 se cambia solo esta línea.
export const adminCatalog: AdminCatalog = demoAdminCatalog;

/** Fichas y precios publicados + unidades terminadas del inventario del panel. */
export const productCatalog: ProductCatalog = withInventoryStock(importedProductCatalog, () =>
  adminCatalog.listInventory(),
);

/**
 * Caso de uso (resumen del panel): variantes con pocas unidades terminadas, con
 * el mismo criterio que la pantalla de inventario.
 */
export async function countLowStockVariants(): Promise<number> {
  // Sin stock no es alerta: el producto se vende a pedido.
  return (await adminCatalog.listInventory()).filter((row) => inventoryStatus(row) === "low")
    .length;
}

/** Caso de uso: ajustes de stock con responsable y motivo, para el historial (RF-34). */
export async function listActivity(): Promise<ActivityEntry[]> {
  return (await adminCatalog.listAdjustments(500)).map((a) => ({
    id: `stock-${a.id}`,
    at: a.at,
    actor: a.actor,
    area: "inventario" as const,
    action: `Stock de ${a.productName}: ${a.before} → ${a.after} unidades.`,
    reason: a.reason,
    reference: { label: a.sku, href: `/admin/inventario?sku=${encodeURIComponent(a.sku)}#ajuste` },
  }));
}
