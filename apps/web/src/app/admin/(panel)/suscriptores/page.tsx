import type { Metadata } from "next";

import { AdminSectionGate } from "@/features/auth";
import { SubscribersScreen } from "@/features/newsletter";

export const metadata: Metadata = { title: "Suscriptores" };

export default async function Page({ searchParams }: PageProps<"/admin/suscriptores">) {
  return (
    <AdminSectionGate section="suscriptores">
      <SubscribersScreen searchParams={await searchParams} />
    </AdminSectionGate>
  );
}
