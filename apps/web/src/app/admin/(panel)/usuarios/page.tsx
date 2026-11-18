import type { Metadata } from "next";

import { UsersScreen } from "@/features/users";

export const metadata: Metadata = { title: "Usuarios y roles" };

export default function Page() {
  return <UsersScreen />;
}
