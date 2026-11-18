import type { Metadata } from "next";

import { BannersScreen } from "@/features/content";

export const metadata: Metadata = { title: "Banners" };

export default function Page() {
  return <BannersScreen />;
}
