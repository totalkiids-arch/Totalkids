import type { ReactNode } from "react";

export default function AdminAccessLayout({ children }: { children: ReactNode }) {
  return <main className="flex min-h-dvh items-center justify-center p-6">{children}</main>;
}
