// Raíz de composición de "users": conecta el puerto con su adaptador.
import type { UserAdmin } from "./application/ports";
import { apiUserAdmin } from "./infrastructure/api-user-admin";

export const userAdmin: UserAdmin = apiUserAdmin;
