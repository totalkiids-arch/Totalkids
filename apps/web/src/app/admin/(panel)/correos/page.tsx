import type { Metadata } from "next";

import { EmailsScreen } from "@/features/emails";

export const metadata: Metadata = { title: "Correos" };

export default async function Page({ searchParams }: PageProps<"/admin/correos">) {
  return <EmailsScreen searchParams={await searchParams} />;
}
