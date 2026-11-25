// Raíz de composición de "shipping": conecta el puerto con su adaptador.
import type { ShippingAdmin } from "./application/ports";
import { apiShippingAdmin } from "./infrastructure/api-shipping-admin";

export const shippingAdmin: ShippingAdmin = apiShippingAdmin;
