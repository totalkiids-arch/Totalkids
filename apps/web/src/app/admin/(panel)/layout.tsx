import type { ReactNode } from "react";

import { AdminShell } from "@/shared/ui/layout/admin-shell";

// TODO(auth): proteger por rol con proxy.ts cuando exista la autenticación.
export default function AdminPanelLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
