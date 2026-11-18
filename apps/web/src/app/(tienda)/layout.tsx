import type { ReactNode } from "react";

import { StoreShell } from "@/shared/ui/layout/store-shell";

export default function StoreLayout({ children }: { children: ReactNode }) {
  return <StoreShell>{children}</StoreShell>;
}
