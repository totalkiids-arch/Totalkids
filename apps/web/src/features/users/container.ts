// Raíz de composición de "users": conecta los puertos con sus adaptadores actuales.
import type { UserAdmin } from "./application/ports";
import { demoUserAdmin } from "./infrastructure/demo-user-admin";

// DEMO (ver infrastructure/demo-user-admin.ts). En LN-04/LN-16 se cambia solo esta línea.
export const userAdmin: UserAdmin = demoUserAdmin;
