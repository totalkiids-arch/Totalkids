import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AdminLoginScreen, getAdminSession } from "@/features/auth";

export const metadata: Metadata = { title: "Ingresar" };

export default async function Page({ searchParams }: PageProps<"/admin/ingresar">) {
  const { aviso } = await searchParams;
  // Con sesión vigente no tiene sentido volver a ingresar. Si la API no
  // responde, se muestra igual el formulario (al enviarlo verá el aviso).
  const session = await getAdminSession().catch(() => null);
  if (session) redirect("/admin");
  return <AdminLoginScreen notice={aviso === "contrasena" ? "contrasena" : undefined} />;
}
