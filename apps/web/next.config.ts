import type { NextConfig } from "next";

/** URL de la API (solo servidor). Mismo valor por defecto que shared/config/server-env.ts. */
const API_URL = (process.env.API_URL ?? "http://localhost:4000").replace(/\/+$/, "");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Valida en tiempo de compilación los href de <Link> contra las rutas existentes.
  typedRoutes: true,
  experimental: {
    serverActions: {
      // El editor de productos sube una imagen de hasta 2 MB (más el resto del formulario).
      bodySizeLimit: "3mb",
    },
  },
  // Los compradores no tienen cuenta (solo el equipo del taller ingresa al panel).
  // Las rutas de la antigua cuenta llevan a la consulta de pedido.
  async redirects() {
    return [
      ...["/ingresar", "/registro", "/recuperar", "/restablecer", "/cuenta", "/cuenta/pedidos"].map(
        (source) => ({ source, destination: "/seguimiento", permanent: true }),
      ),
      { source: "/cuenta/pedidos/:id", destination: "/seguimiento/:id", permanent: true },
    ];
  },
  // Imágenes subidas desde el panel: las guarda la API en /uploads. El navegador
  // las pide a Next y Next a la API, así nunca habla con la API directamente.
  async rewrites() {
    return [{ source: "/uploads/:path*", destination: `${API_URL}/uploads/:path*` }];
  },
};

export default nextConfig;
