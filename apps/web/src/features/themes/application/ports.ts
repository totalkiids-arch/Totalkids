import type { StoreThemeId } from "../domain/store-theme";

/** Persistencia de la plantilla activa; la API reemplazará el adaptador demo. */
export interface StoreThemeAdmin {
  getActive(): Promise<StoreThemeId>;
  setActive(theme: StoreThemeId): Promise<StoreThemeId>;
}
