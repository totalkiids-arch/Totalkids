import "server-only";

import { cookies } from "next/headers";

import { CSRF_COOKIES, PANEL_API_COOKIES } from "@/shared/config/panel-cookies";
import { fromApiResponse, isPanelApiError, unavailableError } from "@/shared/lib/panel-errors";
import { parseSetCookie, type ParsedSetCookie } from "@/shared/lib/set-cookie";

import { apiFetch } from "./api-client";
import { requestContext } from "./request-context";

/**
 * Cliente BFF del panel: Next.js llama a /api/v1 en nombre del navegador.
 *
 * - Reenvía la cookie de sesión del panel y la de CSRF del navegador (solo esas,
 *   ver shared/config/panel-cookies.ts), X-Request-Id y X-Forwarded-For.
 * - En mutaciones pide GET /csrf (la API devuelve el mismo token si sigue
 *   valiendo para la sesión) y lo manda en la cookie y en X-CSRF-Token.
 * - Devuelve al navegador los Set-Cookie del panel y de CSRF (login, logout,
 *   token nuevo).
 * - Un error de la API se lanza como PanelApiError (shared/lib/panel-errors);
 *   timeout o caída, como PanelApiError("unavailable").
 *
 * panelGet sirve en componentes de servidor (no escriben cookies). panelSend,
 * solo en Server Actions o Route Handlers.
 *
 * El tramo navegador → Next queda protegido por las Server Actions (Next
 * compara Origin con Host) y por SameSite=Lax en las cookies.
 */

export interface PanelResponse {
  status: number;
  /** JSON de la respuesta, o null si no trae cuerpo (204). */
  body: unknown;
}

export interface PanelSendOptions {
  method?: "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /**
   * Pide un token CSRF nuevo después de la llamada, con las cookies que la
   * respuesta dejó. El token está atado a la sesión: tras ingresar, salir o
   * restablecer la contraseña, el anterior deja de valer.
   */
  renewCsrf?: boolean;
}

type CookieJar = Awaited<ReturnType<typeof cookies>>;
type Context = Awaited<ReturnType<typeof requestContext>>;

const isCsrfCookie = (name: string) => (CSRF_COOKIES as readonly string[]).includes(name);

/** Cookies del panel y de CSRF que trae el navegador (nombre → valor). */
function browserCookies(jar: CookieJar): Map<string, string> {
  const found = new Map<string, string>();
  for (const name of PANEL_API_COOKIES) {
    const value = jar.get(name)?.value;
    if (value !== undefined) found.set(name, value);
  }
  return found;
}

const cookieHeader = (values: Map<string, string>) =>
  [...values].map(([name, value]) => `${name}=${value}`).join("; ");

function isRemoval(cookie: ParsedSetCookie): boolean {
  const { maxAge, expires } = cookie.options;
  return (
    cookie.value === "" ||
    (maxAge !== undefined && maxAge <= 0) ||
    (expires !== undefined && expires.getTime() <= Date.now())
  );
}

/** Set-Cookie del panel y de CSRF de una respuesta. Ignora cualquier otro. */
function panelSetCookies(response: Response): ParsedSetCookie[] {
  return response.headers
    .getSetCookie()
    .map(parseSetCookie)
    .filter((cookie): cookie is ParsedSetCookie =>
      Boolean(cookie && PANEL_API_COOKIES.includes(cookie.name)),
    );
}

/** Copia los Set-Cookie al navegador y actualiza el mapa con el que se sigue llamando. */
function applySetCookies(jar: CookieJar, values: Map<string, string>, response: Response) {
  for (const cookie of panelSetCookies(response)) {
    jar.set(cookie.name, cookie.value, cookie.options);
    if (isRemoval(cookie)) values.delete(cookie.name);
    else values.set(cookie.name, cookie.value);
  }
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

async function toResult(response: Response): Promise<PanelResponse> {
  const body = await readBody(response);
  if (response.status >= 400)
    throw fromApiResponse(response.status, body, response.headers.get("retry-after"));
  return { status: response.status, body };
}

/** Ejecuta la llamada y traduce cualquier fallo de red o timeout a "unavailable". */
async function guarded<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (isPanelApiError(error)) throw error;
    throw unavailableError(error);
  }
}

/** GET a /api/v1{path} con la sesión del navegador. Para componentes de servidor. */
export async function panelGet(path: `/${string}`): Promise<unknown> {
  const context = await requestContext();
  const cookie = cookieHeader(browserCookies(await cookies()));
  return guarded(async () => {
    const response = await apiFetch(`/api/v1${path}`, {
      ...context,
      headers: cookie ? { cookie } : {},
    });
    return (await toResult(response)).body;
  });
}

/**
 * GET /csrf con las cookies dadas: deja el token en el navegador y en el mapa,
 * y lo devuelve para mandarlo en X-CSRF-Token.
 */
async function issueCsrf(
  jar: CookieJar,
  values: Map<string, string>,
  context: Context,
): Promise<string> {
  const cookie = cookieHeader(values);
  const response = await apiFetch("/api/v1/csrf", {
    ...context,
    headers: cookie ? { cookie } : {},
  });
  const { body } = await toResult(response);
  const token = (body as { csrfToken?: unknown } | null)?.csrfToken;
  const issued = panelSetCookies(response).find((parsed) => isCsrfCookie(parsed.name));
  if (typeof token !== "string" || issued?.value !== token)
    throw new Error("Respuesta de /csrf inválida");
  // Solo una cookie CSRF a la vez (la de este entorno).
  for (const name of CSRF_COOKIES) values.delete(name);
  applySetCookies(jar, values, response);
  return token;
}

/** POST/PUT/PATCH/DELETE a /api/v1{path} con CSRF. Solo en Server Actions o Route Handlers. */
export async function panelSend(
  path: `/${string}`,
  { method = "POST", body, renewCsrf = false }: PanelSendOptions = {},
): Promise<PanelResponse> {
  const context = await requestContext();
  const jar = await cookies();
  const values = browserCookies(jar);
  return guarded(async () => {
    const token = await issueCsrf(jar, values, context);
    const response = await apiFetch(`/api/v1${path}`, {
      ...context,
      method,
      headers: {
        cookie: cookieHeader(values),
        "x-csrf-token": token,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    applySetCookies(jar, values, response);
    const result = await toResult(response);
    if (renewCsrf) {
      // Sin la cookie anterior, la API emite un token para la sesión nueva.
      for (const name of CSRF_COOKIES) values.delete(name);
      // Si falla no es grave: la siguiente mutación pide uno nuevo.
      await issueCsrf(jar, values, context).catch(() => undefined);
    }
    return result;
  });
}
