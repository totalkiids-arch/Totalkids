import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AdminSignOutButton, getAdminSession } from "@/features/auth";
import { ADMIN_ROLE_LABEL, canAccessSection } from "@/features/users";
import { adminNav } from "@/shared/config/routes";
import { isPanelApiError } from "@/shared/lib/panel-errors";
import { PanelUnavailable } from "@/shared/ui/admin/panel-unavailable";
import { AdminShell } from "@/shared/ui/layout/admin-shell";

/** La sesión, o "unavailable" si la API no responde (no es lo mismo que no tener sesión). */
async function loadSession() {
  try {
    return await getAdminSession();
  } catch (error) {
    if (isPanelApiError(error) && error.kind === "unavailable") return "unavailable" as const;
    throw error;
  }
}

// Sesión real del panel (API, LN-04). El menú se filtra por el rol de la sesión;
// la autorización de cada operación la aplica la API.
export default async function AdminPanelLayout({ children }: { children: ReactNode }) {
  const session = await loadSession();
  // API caída: un aviso claro, no el ingreso (la sesión puede seguir vigente).
  if (session === "unavailable") return <PanelUnavailable />;
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
