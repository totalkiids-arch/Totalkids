import "server-only";

import { DEFAULT_STORE_THEME, type StoreThemeId } from "../domain/store-theme";

/** Estado demo de proceso. En producción este adaptador se reemplaza por la API. */
const holder = globalThis as typeof globalThis & { __tkDemoStoreTheme?: StoreThemeId };

export const demoStoreThemeAdmin = {
  async getActive() {
    return holder.__tkDemoStoreTheme ?? DEFAULT_STORE_THEME;
  },
  async setActive(theme: StoreThemeId) {
    holder.__tkDemoStoreTheme = theme;
    return theme;
  },
};
