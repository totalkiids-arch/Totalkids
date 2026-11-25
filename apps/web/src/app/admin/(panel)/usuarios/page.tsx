import type { Metadata } from "next";
import { redirect } from "next/navigation";

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
 * el rol, y la API autoriza cada operación. Sin sesión, al ingreso.
 */
async function saveUserAction(previous: UserFormState, formData: FormData) {
  "use server";
  const session = await getAdminSession();
  if (!session) redirect("/admin/ingresar");
  return handleSaveUser(session.role, previous, formData);
}

async function toggleUserAction(formData: FormData) {
  "use server";
  const session = await getAdminSession();
  if (!session) redirect("/admin/ingresar");
  await handleToggleUser(session.role, formData);
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
