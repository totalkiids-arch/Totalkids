import type {
  AdminCategory,
  AdminProduct,
  FieldErrors,
  ProductDraft,
  StockAdjustment,
} from "../domain/admin-product";
import type { AdminProductPage, AdminProductQuery } from "../domain/admin-product-query";

export type AdminResult<T> = { ok: true; value: T } | { ok: false; errors: FieldErrors };

/** Fila del inventario: una por variante. */
export interface InventoryRow {
  productId: string;
  productName: string;
  variantId: string;
  sku: string;
  option: string | null;
  physical: number;
  reserved: number;
}

/**
 * Puerto: catálogo administrable del panel (RF-26, RF-34). Hoy lo implementa un
 * almacén de demostración en memoria; en LN-12, la API. Cada operación valida
 * con las reglas del dominio: la interfaz no es la única defensa.
 */
export interface AdminCatalog {
  listProducts(query: AdminProductQuery): Promise<AdminProductPage>;
  /** null si no existe. */
  getProduct(id: string): Promise<AdminProduct | null>;
  /** Crea (id null) o actualiza. Editar no toca pedidos anteriores (RN-02). */
  saveProduct(id: string | null, draft: ProductDraft): Promise<AdminResult<AdminProduct>>;
  /** Desactivar no borra el producto ni sus pedidos históricos (RF-26). */
  setProductActive(id: string, active: boolean): Promise<AdminProduct | null>;

  /** Categorías con la cantidad de productos que las usan (principal o adicional). */
  listCategories(): Promise<(AdminCategory & { productCount: number })[]>;
  /** Crea (slug null, el slug sale del nombre) o renombra. */
  saveCategory(
    slug: string | null,
    input: { name: string; active: boolean },
  ): Promise<AdminResult<AdminCategory>>;
  setCategoryActive(slug: string, active: boolean): Promise<AdminCategory | null>;

  listInventory(): Promise<InventoryRow[]>;
  /** Fija el stock físico de una variante y registra el ajuste (RN-03, RF-34). */
  adjustStock(input: {
    sku: string;
    physical: number;
    reason: string;
    actor: string;
  }): Promise<AdminResult<StockAdjustment>>;
  /** Ajustes más recientes primero. */
  listAdjustments(limit: number): Promise<StockAdjustment[]>;
}
