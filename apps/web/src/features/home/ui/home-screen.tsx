import { FeaturedProducts, listFeaturedProducts } from "@/features/catalog";

import { Clients } from "./sections/clients";
import { Hero } from "./sections/hero";
import { Ideas } from "./sections/ideas";
import { Institutions } from "./sections/institutions";
import { NewsletterSignup } from "./sections/newsletter-signup";
import { Philosophy } from "./sections/philosophy";
import { ShopByLevel } from "./sections/shop-by-level";
import { TrustStrip } from "./sections/trust-strip";

/** Tienda y compra · Inicio. Réplica de la portada de la maqueta aprobada. */
export async function HomeScreen() {
  const featured = await listFeaturedProducts();
  return (
    <>
      <Hero />
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
