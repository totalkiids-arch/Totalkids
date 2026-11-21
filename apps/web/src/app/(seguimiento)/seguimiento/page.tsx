import type { Metadata } from "next";

import { GuestOrderLookup } from "@/features/orders";

export const metadata: Metadata = { title: "Consulta tu pedido" };

/** Los compradores no tienen cuenta: consultan su pedido con número y correo. */
export default function Page() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-10 sm:px-6">
      <GuestOrderLookup />
    </div>
  );
}
