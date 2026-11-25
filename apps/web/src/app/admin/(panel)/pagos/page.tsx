import type { Metadata } from "next";

import { parsePaymentQuery, PaymentsScreen } from "@/features/payments";

export const metadata: Metadata = { title: "Pagos y conciliación" };

/** Intentos de pago y conciliación con Flow (LN-15). Filtro, página y aviso en la URL. */
export default async function Page({ searchParams }: PageProps<"/admin/pagos">) {
  const params = await searchParams;
  const aviso = Array.isArray(params.aviso) ? params.aviso[0] : params.aviso;
  return <PaymentsScreen query={parsePaymentQuery(params)} aviso={aviso ?? ""} />;
}
