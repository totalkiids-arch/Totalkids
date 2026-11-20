import type { Metadata } from "next";

import { AdminSectionGate } from "@/features/auth";
import { UsersScreen } from "@/features/users";

export const metadata: Metadata = { title: "Usuarios y roles" };

export default function Page() {
  return (
    <AdminSectionGate section="usuarios">
      <UsersScreen />
    </AdminSectionGate>
  );
}
