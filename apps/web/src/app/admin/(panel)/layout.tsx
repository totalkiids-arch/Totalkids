import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AdminSignOutButton, getAdminSession } from "@/features/auth";
import { ADMIN_ROLE_LABEL, canAccessSection } from "@/features/users";
import { adminNav } from "@/shared/config/routes";
import { AdminShell } from "@/shared/ui/layout/admin-shell";

// Sesión de DEMOSTRACIÓN (ver features/auth). La autenticación real llega en LN-04.
export default async function AdminPanelLayout({ children }: { children: ReactNode }) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/ingresar");

  const items = adminNav.filter((item) => canAccessSection(session.role, item.section));

  return (
    <AdminShell
      items={items}
      roleLabel={ADMIN_ROLE_LABEL[session.role]}
      signOut={<AdminSignOutButton />}
    >
      {children}
    </AdminShell>
  );
}
