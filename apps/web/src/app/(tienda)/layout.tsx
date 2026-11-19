import type { ReactNode } from "react";

import { CartLink } from "@/features/cart";
import { StoreShell } from "@/shared/ui/layout/store-shell";

export default function StoreLayout({ children }: { children: ReactNode }) {
  return <StoreShell cartLink={<CartLink />}>{children}</StoreShell>;
}
