/**
 * Cookies que la API fija para el panel y que Next.js reenvía en ambos sentidos
 * (navegador ⇄ Next ⇄ API). La API usa el prefijo __Host- en producción.
 *
 * El carrito NO está en la lista: la tienda guarda su propio carrito en la
 * cookie tk_carrito (JSON de Next.js), con el mismo nombre que la cookie opaca
 * del carrito de la API. Reenviarla haría que la API la tomara por un token.
 */
export const PANEL_SESSION_COOKIES = ["tk_panel", "__Host-tk_panel"] as const;
export const CSRF_COOKIES = ["tk_csrf", "__Host-tk_csrf"] as const;
export const PANEL_API_COOKIES: readonly string[] = [...PANEL_SESSION_COOKIES, ...CSRF_COOKIES];
