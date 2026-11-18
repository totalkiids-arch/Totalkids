import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "Total Kids",
  description: "Tienda online de mobiliario infantil",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="es-CL">
      <body className="bg-white text-gray-900 antialiased">{children}</body>
    </html>
  );
}
