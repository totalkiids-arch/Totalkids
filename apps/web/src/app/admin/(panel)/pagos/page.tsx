import type { Metadata } from "next";

import { parsePaymentQuery, PaymentsScreen } from "@/features/payments";

export const metadata: Metadata = { title: "Pagos y conciliación" };

/** Intentos de pago de la API (solo lectura). Filtro y página en la URL. */
export default async function Page({ searchParams }: PageProps<"/admin/pagos">) {
  return <PaymentsScreen query={parsePaymentQuery(await searchParams)} />;
}
