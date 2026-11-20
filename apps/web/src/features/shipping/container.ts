// Raíz de composición de "shipping": conecta los puertos con sus adaptadores actuales.
import type { ShippingAdmin } from "./application/ports";
import { demoShippingAdmin } from "./infrastructure/demo-shipping-admin";

// DEMO (ver infrastructure/demo-shipping-admin.ts). En LN-12 se cambia solo esta línea.
export const shippingAdmin: ShippingAdmin = demoShippingAdmin;
