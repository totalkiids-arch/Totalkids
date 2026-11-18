import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Valida en tiempo de compilación los href de <Link> contra las rutas existentes.
  typedRoutes: true,
};

export default nextConfig;
