import type { Metadata } from "next";

import { ResetPasswordScreen } from "@/features/auth";

export const metadata: Metadata = { title: "Restablecer contraseña" };

export default async function Page({ searchParams }: PageProps<"/restablecer">) {
  const { token } = await searchParams;
  return <ResetPasswordScreen token={typeof token === "string" ? token : undefined} />;
}
