// Raíz de composición de "coupons": conecta los puertos con sus adaptadores actuales.
import type { CouponAdmin } from "./application/ports";
import { demoCouponAdmin } from "./infrastructure/demo-coupon-admin";

// DEMO (ver infrastructure/demo-coupon-admin.ts). En LN-12/LN-13 se cambia solo esta línea.
export const couponAdmin: CouponAdmin = demoCouponAdmin;
