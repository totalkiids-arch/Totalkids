import type { ReactNode } from "react";

import { ADMIN_NAV_GROUPS, type AdminNavItem } from "@/shared/config/routes";

import { AdminFrame } from "./admin-frame";

interface AdminShellProps {
  /** Ítems del menú ya filtrados por rol: shared no decide permisos. */
  items: readonly AdminNavItem[];
  /** Rol visible en la barra superior ("Administrador", "Operador"). */
  roleLabel: string;
  /** Botón «Cerrar sesión»; lo entrega la feature auth desde el layout. */
  signOut: ReactNode;
  children: ReactNode;
}

/** Estructura del panel administrativo: menú lateral agrupado, barra superior y contenido. */
export function AdminShell({ items, roleLabel, signOut, children }: AdminShellProps) {
  const groups = ADMIN_NAV_GROUPS.map((group) => ({
    group,
    items: items
      .filter((item) => item.group === group)
      .map(({ href, label, icon }) => ({ href, label, icon })),
  })).filter((group) => group.items.length > 0);

  return (
    <AdminFrame groups={groups} roleLabel={roleLabel} signOut={signOut}>
      {children}
    </AdminFrame>
  );
}
