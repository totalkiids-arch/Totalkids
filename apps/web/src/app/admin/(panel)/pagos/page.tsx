import type { Metadata } from "next";

import { listPaymentAttempts, reconcilePaymentAction } from "@/features/orders";
import { parsePaymentQuery, PaymentsScreen } from "@/features/payments";

export const metadata: Metadata = { title: "Pagos y conciliación" };

/**
 * Compone dos features sin acoplarlas: los intentos y la Server Action de
 * conciliación salen de orders y se entregan a la pantalla de payments.
 */
export default async function Page({ searchParams }: PageProps<"/admin/pagos">) {
  const params = await searchParams;
  const aviso = Array.isArray(params.aviso) ? params.aviso[0] : params.aviso;
  return (
    <PaymentsScreen
      attempts={await listPaymentAttempts()}
      query={parsePaymentQuery(params)}
      notice={aviso}
      reconcileAction={reconcilePaymentAction}
    />
  );
}
