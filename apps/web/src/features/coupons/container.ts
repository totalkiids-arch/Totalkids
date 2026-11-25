// Raíz de composición de "coupons": conecta el puerto con su adaptador.
import type { CouponAdmin } from "./application/ports";
import { apiCouponAdmin } from "./infrastructure/api-coupon-admin";

export const couponAdmin: CouponAdmin = apiCouponAdmin;
