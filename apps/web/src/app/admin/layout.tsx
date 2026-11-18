import type { Metadata } from "next";
import type { ReactNode } from "react";

// Todo el panel administrativo queda fuera de los buscadores.
export const metadata: Metadata = {
  title: { default: "Admin", template: "%s | Admin Total Kids" },
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return children;
}
