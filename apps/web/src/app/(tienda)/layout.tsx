import type { ReactNode } from "react";

import { CartLink } from "@/features/cart";
import {
  SeasonalGarland,
  SeasonalParticles,
  SeasonalRibbon,
  storeThemeAdmin,
} from "@/features/themes";
import { StoreShell } from "@/shared/ui/layout/store-shell";

export default async function StoreLayout({ children }: { children: ReactNode }) {
  const theme = await storeThemeAdmin.getActive();
  return (
    <StoreShell
      cartLink={<CartLink />}
      seasonalBanner={<SeasonalRibbon theme={theme} />}
      seasonalDecor={{
        afterHeader: <SeasonalGarland theme={theme} />,
        beforeFooter: <SeasonalGarland theme={theme} placement="footer" />,
        overlay: <SeasonalParticles theme={theme} />,
      }}
      theme={theme}
    >
      {children}
    </StoreShell>
  );
}
