// Raíz de composición de "users": conecta los puertos con sus adaptadores actuales.
import type { ActivityEntry } from "@/features/activity";
import type { UserAdmin } from "./application/ports";
import { demoUserAdmin } from "./infrastructure/demo-user-admin";

// DEMO (ver infrastructure/demo-user-admin.ts). En LN-04/LN-16 se cambia solo esta línea.
export const userAdmin: UserAdmin = demoUserAdmin;

/** Caso de uso: altas y cambios de cuentas internas, para el historial (RF-31, RF-34). */
export async function listActivity(): Promise<ActivityEntry[]> {
  return (await userAdmin.listChanges()).map((change, index) => ({
    id: `usuario-${change.userId}-${change.at}-${index}`,
    at: change.at,
    actor: change.actor,
    area: "usuarios" as const,
    action: change.detail,
    reason: null,
    reference: {
      label: "Usuarios",
      href: `/admin/usuarios?editar=${encodeURIComponent(change.userId)}#editor`,
    },
  }));
}
