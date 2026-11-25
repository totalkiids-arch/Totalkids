import "server-only";

import { panelGet, panelSend } from "@/shared/infrastructure/panel-api";

import type { StoreThemeAdmin } from "../application/ports";
import { toAdminTheme } from "./store-theme-api";

/** Plantilla de la tienda en la API (/admin/store-theme, solo Administrador). */
export const apiStoreThemeAdmin: StoreThemeAdmin = {
  async getActive() {
    return toAdminTheme(await panelGet("/admin/store-theme"));
  },
  async setActive(theme) {
    const response = await panelSend("/admin/store-theme", { method: "PUT", body: { theme } });
    return toAdminTheme(response.body);
  },
};
