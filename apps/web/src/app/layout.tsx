import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { site } from "@/shared/config/site";
import { siteUrl } from "@/shared/config/site-url";

import { baloo, nunito } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  // Base de las URLs canónicas y de Open Graph (RNF-10).
  metadataBase: new URL(siteUrl),
  title: { default: site.name, template: `%s | ${site.name}` },
  description: site.description,
  openGraph: { siteName: site.name, locale: "es_CL", type: "website" },
};

export const viewport: Viewport = {
  themeColor: "#fff9ee",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="es-CL" className={`${baloo.variable} ${nunito.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
