import type { Metadata } from "next";
import type { ReactNode } from "react";

import { CartLink } from "@/features/cart";
import { StoreShell } from "@/shared/ui/layout/store-shell";

// Páginas de cuenta: no se indexan.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function AccountLayout({ children }: { children: ReactNode }) {
  return <StoreShell cartLink={<CartLink />}>{children}</StoreShell>;
}
