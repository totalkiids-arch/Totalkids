import type { Route } from "next";

import { FeaturedProducts, listFeaturedProducts } from "@/features/catalog";
import { campaignFor, SeasonalHeroScene, storeThemeAdmin } from "@/features/themes";

import { Clients } from "./sections/clients";
import { Hero, type HeroSlideData } from "./sections/hero";
import { Ideas } from "./sections/ideas";
import { Institutions } from "./sections/institutions";
import { NewsletterSignup } from "./sections/newsletter-signup";
import { Philosophy } from "./sections/philosophy";
import { ShopByLevel } from "./sections/shop-by-level";
import { TrustStrip } from "./sections/trust-strip";

/** Tienda y compra · Inicio. Réplica de la portada de la maqueta aprobada. */
export async function HomeScreen() {
  const [featured, theme] = await Promise.all([
    listFeaturedProducts(),
    storeThemeAdmin.getActive(),
  ]);
  return (
    <>
      <Hero campaignSlide={campaignSlide(theme)} />
      <TrustStrip />
      <ShopByLevel />
      <FeaturedProducts products={featured} />
      <Philosophy />
      <Institutions />
      <Clients />
      <Ideas />
      <NewsletterSignup />
    </>
  );
}

/** Diapositiva de la campaña vigente, ilustrada con el animalito disfrazado. */
function campaignSlide(theme: Parameters<typeof campaignFor>[0]): HeroSlideData | undefined {
  const campaign = campaignFor(theme);
  if (!campaign) return undefined;
  const id = campaign.id;
  return {
    id: `campana-${id}`,
    animal: "Nuestro amigo",
    background: "seasonal-hero",
    eyebrow: campaign.eyebrow,
    title: campaign.heroTitle,
    highlight: campaign.heroHighlight,
    highlightClass: "text-brand-red",
    body: campaign.heroBody,
    primary: { href: campaign.cta.href as Route, label: campaign.cta.label },
    bubble: campaign.bubble,
    sceneLabel: campaign.sceneLabel,
    Scene: ({ className, label }) => (
      <SeasonalHeroScene theme={id} label={label} className={className} />
    ),
  };
}
