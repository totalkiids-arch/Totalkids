// Raíz de composición de "content": conecta los puertos con sus adaptadores actuales.
import type { BannerAdmin } from "./application/ports";
import { demoBannerAdmin } from "./infrastructure/demo-banner-admin";

// DEMO (ver infrastructure/demo-banner-admin.ts). En LN-12/LN-13 se cambia solo esta línea.
export const bannerAdmin: BannerAdmin = demoBannerAdmin;
