import type { ReactNode } from "react";

import { TitoAssistant } from "@/features/assistant";
import { CartLink } from "@/features/cart";
import {
  getStoreTheme,
  SeasonalGarland,
  SeasonalParticles,
  SeasonalRibbon,
} from "@/features/themes";
import { StoreShell } from "@/shared/ui/layout/store-shell";

export default async function StoreLayout({ children }: { children: ReactNode }) {
  // Plantilla activa desde la API; la por defecto si no responde.
  const theme = await getStoreTheme();
  return (
    <StoreShell
      cartLink={<CartLink />}
      assistant={<TitoAssistant />}
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
