import { Router } from "express";
import { z } from "zod";

import { passwordSchema } from "../lib/passwords.js";
import type { PrismaClient } from "../lib/prisma.js";
import { OPAQUE_TOKEN_PATTERN } from "../lib/secrets.js";
import { validated } from "../lib/validation.js";
import { methodNotAllowed } from "../middleware/method-not-allowed.js";
import {
  clearPanelCookie,
  panelToken,
  requirePanel,
  setPanelCookie,
} from "../middleware/panel-auth.js";
import {
  createRateLimiter,
  loginAccountLimiter,
  loginIpLimiter,
  publicFormLimiter,
} from "../middleware/rate-limit.js";
import { login, logout, requestPasswordReset, resetPassword } from "../services/auth.js";

const MINUTE = 60_000;

const email = z.email("Ingresa un correo válido").max(254);

const loginBody = z.object({
  email,
  // Sin la política de largo: una contraseña antigua más corta igual debe poder
  // fallar con 401 y no con 422 (no se revela la política al atacante).
  password: z.string().min(1, "Ingresa tu contraseña").max(1024),
});

const resetRequestBody = z.object({ email });

const resetConfirmBody = z.object({
  token: z.string().regex(OPAQUE_TOKEN_PATTERN, "El enlace no es válido o ya venció"),
  password: passwordSchema,
});

export interface AuthRouterOptions {
  prisma: PrismaClient;
  isProduction: boolean;
}

/**
 * Sesión del panel (LN-04): ingreso, cierre, sesión actual y recuperación de
 * contraseña con token de un solo uso. Solo para el equipo del taller.
 * Los limitadores se crean por router: cada app tiene sus propios contadores.
 */
export function authRouter({ prisma, isProduction }: AuthRouterOptions): Router {
  const router = Router();

  router
    .route("/auth/login")
    .post(
      loginIpLimiter(),
      loginAccountLimiter(),
      validated({ body: loginBody }, async ({ body }, req, res) => {
        const { token, session } = await login(prisma, body, {
          previousToken: panelToken(req, isProduction),
          userAgent: req.get("user-agent"),
          requestId: String(req.id),
        });
        req.log.info({ userId: session.user.id }, "ingreso al panel");
        setPanelCookie(res, token, isProduction);
        res.status(204).end();
      }),
    )
    .all(methodNotAllowed("POST"));

  router
    .route("/auth/logout")
    .post(async (req, res) => {
      const token = panelToken(req, isProduction);
      if (token) await logout(prisma, token);
      clearPanelCookie(res, isProduction);
      res.status(204).end();
    })
    .all(methodNotAllowed("POST"));

  router
    .route("/auth/session")
    .get(requirePanel(prisma, isProduction), (req, res) => {
      const session = req.panel;
      res.json({ user: session?.user, expiresAt: session?.expiresAt.toISOString() });
    })
    .all(methodNotAllowed("GET"));

  router
    .route("/auth/password-reset/request")
    .post(
      publicFormLimiter({ name: "password-reset-ip", limit: 5 }),
      createRateLimiter({
        name: "password-reset-account",
        windowMs: 60 * MINUTE,
        limit: 3,
        keyGenerator: (req) => {
          const value: unknown = (req.body as { email?: unknown } | undefined)?.email;
          return typeof value === "string" ? `cuenta:${value.trim().toLowerCase()}` : "sin-correo";
        },
        message: "Ya pediste varios enlaces para esta cuenta, intenta en una hora",
      }),
      validated({ body: resetRequestBody }, async ({ body }, _req, res) => {
        await requestPasswordReset(prisma, body.email);
        res.status(202).end();
      }),
    )
    .all(methodNotAllowed("POST"));

  router
    .route("/auth/password-reset/confirm")
    .post(
      publicFormLimiter({ name: "password-reset-confirm" }),
      validated({ body: resetConfirmBody }, async ({ body }, req, res) => {
        await resetPassword(prisma, body, { requestId: String(req.id) });
        clearPanelCookie(res, isProduction);
        res.status(204).end();
      }),
    )
    .all(methodNotAllowed("POST"));

  return router;
}
