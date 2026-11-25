// Raíz de composición de "themes": conecta los puertos con sus adaptadores.
import type { StoreThemeAdmin, StoreThemeSource } from "./application/ports";
import { apiStoreThemeAdmin } from "./infrastructure/api-store-theme-admin";
import { apiStoreThemeSource, STORE_THEME_TAG } from "./infrastructure/api-store-theme-source";

export const storeThemeAdmin: StoreThemeAdmin = apiStoreThemeAdmin;

const storeThemeSource: StoreThemeSource = apiStoreThemeSource;

/** Etiqueta de la caché de la plantilla pública (la invalida el panel al cambiarla). */
export { STORE_THEME_TAG };

/** Caso de uso: plantilla que ve el público. La por defecto si la API no responde. */
export function getStoreTheme() {
  return storeThemeSource.current();
}
