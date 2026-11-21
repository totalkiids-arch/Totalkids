import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Valida en tiempo de compilación los href de <Link> contra las rutas existentes.
  typedRoutes: true,
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
};

export default nextConfig;
