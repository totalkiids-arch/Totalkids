import type { StoreThemeId } from "../domain/store-theme";

/**
 * Puerto: plantilla activa de la tienda en el panel (GET y PUT
 * /admin/store-theme, solo Administrador). Una sola activa a la vez.
 */
export interface StoreThemeAdmin {
  getActive(): Promise<StoreThemeId>;
  setActive(theme: StoreThemeId): Promise<StoreThemeId>;
}

/**
 * Puerto: plantilla que ve el público (GET /store-theme, sin sesión). Si la
 * API no responde devuelve la plantilla por defecto: la tienda nunca se cae.
 */
export interface StoreThemeSource {
  current(): Promise<StoreThemeId>;
}
