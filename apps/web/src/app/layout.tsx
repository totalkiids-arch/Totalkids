import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { baloo, nunito } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Total Kids", template: "%s | Total Kids" },
  description: "Tienda online de mobiliario infantil",
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
