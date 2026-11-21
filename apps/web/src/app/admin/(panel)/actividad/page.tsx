import type { Metadata } from "next";

import { ActivityLogScreen, buildActivityPage, parseActivityQuery } from "@/features/activity";
import { AdminSectionGate } from "@/features/auth";
import { listInventoryActivity } from "@/features/catalog";
import { listEmailActivity } from "@/features/emails";
import { listSubscriberActivity } from "@/features/newsletter";
import { listOrderActivity } from "@/features/orders";
import { listRequestActivity } from "@/features/services";
import { listUserActivity } from "@/features/users";

export const metadata: Metadata = { title: "Historial de actividad" };

/**
 * Junta el historial de cada feature sin acoplarlas: cada una entrega sus
 * cambios en el formato de activity y aquí se ordenan, filtran y paginan.
 */
export default async function Page({ searchParams }: PageProps<"/admin/actividad">) {
  const query = parseActivityQuery(await searchParams);
  const sources = await Promise.all([
    listOrderActivity(),
    listInventoryActivity(),
    listRequestActivity(),
    listEmailActivity(),
    listSubscriberActivity(),
    listUserActivity(),
  ]);
  return (
    <AdminSectionGate section="actividad">
      <ActivityLogScreen page={buildActivityPage(sources, query)} query={query} />
    </AdminSectionGate>
  );
}
