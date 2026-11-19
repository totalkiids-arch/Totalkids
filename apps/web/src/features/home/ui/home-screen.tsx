import { FeaturedProducts, listFeaturedProducts } from "@/features/catalog";

import { Clients } from "./sections/clients";
import { Hero } from "./sections/hero";
import { Ideas } from "./sections/ideas";
import { Institutions } from "./sections/institutions";
import { NewsletterSignup } from "./sections/newsletter-signup";
import { Philosophy } from "./sections/philosophy";
import { ShopByAge } from "./sections/shop-by-age";
import { TrustStrip } from "./sections/trust-strip";

/** Tienda y compra · Inicio. Réplica de la portada de la maqueta aprobada. */
export async function HomeScreen() {
  const featured = await listFeaturedProducts();
  return (
    <>
      <Hero />
      <TrustStrip />
      <ShopByAge />
      <FeaturedProducts products={featured} />
      <Philosophy />
      <Institutions />
      <Clients />
      <Ideas />
      <NewsletterSignup />
    </>
  );
}
