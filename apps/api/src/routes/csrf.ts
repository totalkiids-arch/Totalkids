import { Router } from "express";

import { parseCookies } from "../lib/cookies.js";
import { csrfCookieName, issueCsrfToken, verifyCsrfToken } from "../lib/csrf.js";
import type { CsrfSessionKey } from "../middleware/csrf.js";
import { methodNotAllowed } from "../middleware/method-not-allowed.js";

export interface CsrfRouterOptions {
  secret: string;
  isProduction: boolean;
  sessionKey: CsrfSessionKey;
}

/**
 * GET /csrf: entrega el token CSRF y lo fija en la cookie (HttpOnly, SameSite=Lax).
 * Next.js reenvía el Set-Cookie al navegador y pinta el token en un campo oculto
 * del formulario; al enviarlo, la Server Action lo manda en X-CSRF-Token.
 * Si la cookie actual sigue siendo válida para la sesión, se reutiliza.
 */
export function csrfRouter({ secret, isProduction, sessionKey }: CsrfRouterOptions): Router {
  const router = Router();
  const cookieName = csrfCookieName(isProduction);

  router
    .route("/csrf")
    .get((req, res) => {
      const key = sessionKey(req);
      const current = parseCookies(req.headers.cookie)[cookieName];
      const csrfToken =
        current && verifyCsrfToken(secret, current, key) ? current : issueCsrfToken(secret, key);
      res.cookie(cookieName, csrfToken, {
        httpOnly: true,
        sameSite: "lax",
        secure: isProduction,
        path: "/",
      });
      res.json({ csrfToken });
    })
    .all(methodNotAllowed("GET"));

  return router;
}
