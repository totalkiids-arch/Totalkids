import type { StoreThemeAdmin } from "./application/ports";
import { demoStoreThemeAdmin } from "./infrastructure/demo-store-theme-admin";

export const storeThemeAdmin: StoreThemeAdmin = demoStoreThemeAdmin;
