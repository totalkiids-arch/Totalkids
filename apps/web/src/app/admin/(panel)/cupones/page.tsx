import type { Metadata } from "next";

import { CouponsScreen } from "@/features/coupons";

export const metadata: Metadata = { title: "Cupones" };

export default function Page() {
  return <CouponsScreen />;
}
