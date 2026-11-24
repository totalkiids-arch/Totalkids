import { NextResponse, type NextRequest } from "next/server";

import { PANEL_SESSION_COOKIES } from "@/shared/config/panel-cookies";

/**
 * Proxy de Next.js, solo para /admin (la tienda no pasa por aquí).
 *
 * - Sin cookie de sesión del panel, lleva al ingreso sin llamar a la API. Es
 *   solo un atajo: el layout del panel valida la sesión en la API y cada
 *   operación la vuelve a autorizar el backend.
 * - /admin/restablecer lleva un token secreto en la URL: no se manda como
 *   Referer ni se guarda en cachés.
 */
const PUBLIC_PATHS = ["/admin/ingresar", "/admin/restablecer"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/admin/restablecer") {
    const response = NextResponse.next();
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next();

  const hasSession = PANEL_SESSION_COOKIES.some((name) => request.cookies.has(name));
  if (!hasSession) return NextResponse.redirect(new URL("/admin/ingresar", request.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
