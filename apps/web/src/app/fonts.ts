import { Baloo_2, Nunito } from "next/font/google";

// next/font descarga las fuentes en el build y las sirve desde el propio sitio:
// el navegador no hace peticiones a Google (mejor privacidad y rendimiento).

/** Títulos, encabezados y elementos destacados (700–800). */
export const baloo = Baloo_2({
  subsets: ["latin"],
  weight: ["700", "800"],
  variable: "--font-baloo",
  display: "swap",
});

/** Textos, botones, formularios y navegación (400–800, fuente variable). */
export const nunito = Nunito({
  subsets: ["latin"],
  variable: "--font-nunito",
  display: "swap",
});
