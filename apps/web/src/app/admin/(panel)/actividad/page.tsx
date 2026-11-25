import type { Metadata } from "next";

import { ActivityLogScreen, listActivity, parseActivityQuery } from "@/features/activity";
import { AdminSectionGate } from "@/features/auth";

export const metadata: Metadata = { title: "Historial de actividad" };

/** Historial de actividad (RF-27, RF-34) desde la API. Solo Administrador. */
export default async function Page({ searchParams }: PageProps<"/admin/actividad">) {
  const query = parseActivityQuery(await searchParams);
  return (
    <AdminSectionGate section="actividad">
      <ActivityLog query={query} />
    </AdminSectionGate>
  );
}

/** Dentro de la compuerta: el Operador no llega a pedir el historial a la API. */
async function ActivityLog({ query }: { query: ReturnType<typeof parseActivityQuery> }) {
  return <ActivityLogScreen page={await listActivity(query)} query={query} />;
}
