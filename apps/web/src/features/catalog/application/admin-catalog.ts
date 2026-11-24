import type {
  AdminCategory,
  AdminProduct,
  ExtraOption,
  FieldErrors,
  InventoryActivity,
  ProductDraft,
  ProductStatus,
} from "../domain/admin-product";
import type { AdminProductPage, AdminProductQuery } from "../domain/admin-product-query";

export type AdminResult<T> = { ok: true; value: T } | { ok: false; errors: FieldErrors };

/** Fila del inventario: una por variante. */
export interface InventoryRow {
  productId: string;
  productName: string;
  productSlug: string;
  variantId: string;
  sku: string;
  option: string | null;
  /** Variante activa (las inactivas se quitaron del producto pero tienen historial). */
  active: boolean;
  physical: number;
  reserved: number;
}

/** Archivo de imagen nueva, tal como llega del formulario. */
export interface ImageUpload {
  file: Blob;
  name: string;
  alt: string;
}

export type SaveProductResult =
  | {
      ok: true;
      id: string;
      created: boolean;
      /**
       * El producto quedó guardado, pero falló un paso posterior (subir la imagen
       * o publicar): el mensaje explica qué falta.
       */
      pending: { errors: FieldErrors } | null;
    }
  | { ok: false; errors: FieldErrors };

/**
 * Puerto: catálogo administrable del panel (RF-26, RF-34). Lo implementa la API
 * (LN-12). Los errores de la API (403, caída…) se lanzan como PanelApiError; un
 * 401 lleva al ingreso. Las reglas de negocio vuelven como errores por campo.
 */
export interface AdminCatalog {
  listProducts(query: AdminProductQuery): Promise<AdminProductPage>;
  /** null si no existe. */
  getProduct(id: string): Promise<AdminProduct | null>;
  /** Extras que se pueden ofrecer en un producto. */
  listExtraOptions(): Promise<ExtraOption[]>;
  /**
   * Crea (id null) o actualiza; luego actualiza los textos alternativos, sube la
   * imagen nueva y publica si se pidió. Editar no toca pedidos anteriores (RN-02).
   */
  saveProduct(
    id: string | null,
    draft: ProductDraft,
    image: ImageUpload | null,
  ): Promise<SaveProductResult>;
  /** Publica o retira de la tienda. Retirar no borra el producto ni sus pedidos (RF-26). */
  setProductPublished(id: string, publish: boolean): Promise<AdminResult<ProductStatus>>;

  /** Categorías con la cantidad de productos que las usan (principal o adicional). */
  listCategories(): Promise<(AdminCategory & { productCount: number })[]>;
  /** Crea (id null; el slug sale del nombre) o edita. */
  saveCategory(
    id: string | null,
    input: { name: string; active: boolean },
  ): Promise<AdminResult<AdminCategory>>;
  /** null si la categoría ya no existe. */
  setCategoryActive(id: string, active: boolean): Promise<AdminCategory | null>;

  /** Todas las variantes del catálogo. */
  listInventory(): Promise<InventoryRow[]>;
  /** Fija el stock físico de una variante con motivo; queda registrado (RN-03, RF-34). */
  adjustStock(input: {
    sku: string;
    physical: number;
    reason: string;
  }): Promise<AdminResult<{ sku: string }>>;
  /** Ajustes de inventario más recientes primero (historial de la API). */
  listInventoryActivity(limit: number): Promise<InventoryActivity[]>;
}
