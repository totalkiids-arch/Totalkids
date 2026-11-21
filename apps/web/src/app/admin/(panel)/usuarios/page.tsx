import type { Metadata } from "next";

import { AdminSectionGate, getAdminSession } from "@/features/auth";
import {
  handleSaveUser,
  handleToggleUser,
  UsersScreen,
  type UserFormState,
} from "@/features/users";

export const metadata: Metadata = { title: "Usuarios y roles" };

/*
 * Las Server Actions se arman aquí con el rol de la sesión: auth ya depende de
 * users (roles), así users no importa auth. Cada manejador vuelve a verificar
 * el rol. Sesión de DEMOSTRACIÓN; la autorización real llega con LN-04.
 */
async function saveUserAction(previous: UserFormState, formData: FormData) {
  "use server";
  const session = await getAdminSession();
  return handleSaveUser(session?.role ?? null, previous, formData);
}

async function toggleUserAction(formData: FormData) {
  "use server";
  const session = await getAdminSession();
  await handleToggleUser(session?.role ?? null, formData);
}

export default async function Page({ searchParams }: PageProps<"/admin/usuarios">) {
  return (
    <AdminSectionGate section="usuarios">
      <UsersScreen
        searchParams={await searchParams}
        saveAction={saveUserAction}
        toggleAction={toggleUserAction}
      />
    </AdminSectionGate>
  );
}
