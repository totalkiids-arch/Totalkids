import { Router } from "express";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { parseCookies } from "../src/lib/cookies.js";
import { CSRF_COOKIE_DEV, issueCsrfToken } from "../src/lib/csrf.js";
import { createPrismaClient } from "../src/lib/prisma.js";
import { hashToken } from "../src/lib/secrets.js";
import { PANEL_COOKIE_DEV, requireRole } from "../src/middleware/panel-auth.js";
import { createStaffUser, issuePasswordResetToken, SESSION_IDLE_MS } from "../src/services/auth.js";
import { buildTestApp, testEnv } from "./helpers.js";

// Autenticación del panel (LN-04) contra totalkids_test. Requiere docker compose
// up y pnpm db:migrate:test; se omite sin TEST_DATABASE_URL.
const url = process.env.TEST_DATABASE_URL;

const PASSWORD = "contraseña-segura-del-taller";

describe.skipIf(!url)("autenticación del panel (PostgreSQL real)", () => {
  const prisma = createPrismaClient(url ?? "");

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** Rutas de prueba bajo /admin para comprobar permisos. */
  function adminRoutes(v1: Router) {
    const router = Router();
    router.get("/admin/solo-admin", requireRole("admin"), (_req, res) => {
      res.json({ ok: true });
    });
    router.get("/admin/equipo", requireRole("admin", "operator"), (req, res) => {
      res.json({ role: req.panel?.user.role });
    });
    v1.use(router);
  }

  const newApp = () => buildTestApp({ prisma, registerRoutes: adminRoutes });

  let counter = 0;
  async function staff(role: "admin" | "operator" = "operator") {
    counter += 1;
    const email = `equipo-${String(counter)}-${Date.now().toString(36)}@totalkids.cl`;
    const user = await createStaffUser(prisma, { email, name: "Equipo", role, password: PASSWORD });
    return { ...user, email };
  }

  /** Cookies y cabecera CSRF de una petición, con o sin sesión del panel. */
  function headers(panelToken?: string): Record<string, string> {
    const csrf = issueCsrfToken(testEnv.CSRF_SECRET ?? "", panelToken ? hashToken(panelToken) : "");
    const cookies = [`${CSRF_COOKIE_DEV}=${csrf}`];
    if (panelToken) cookies.push(`${PANEL_COOKIE_DEV}=${panelToken}`);
    return { cookie: cookies.join("; "), "x-csrf-token": csrf };
  }

  function sessionCookie(res: request.Response): string | undefined {
    const raw = res.headers["set-cookie"] as unknown as string[] | undefined;
    const line = raw?.find((c) => c.startsWith(`${PANEL_COOKIE_DEV}=`));
    return line ? parseCookies(line.split(";")[0])[PANEL_COOKIE_DEV] : undefined;
  }

  async function loginAs(app: ReturnType<typeof newApp>, email: string, password = PASSWORD) {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .set(headers())
      .send({ email, password });
    return { res, token: sessionCookie(res) };
  }

  // ── Ingreso ────────────────────────────────────────────────────────────────

  it("ingresa con correo y contraseña, y la sesión queda en una cookie HttpOnly", async () => {
    const app = newApp();
    const user = await staff("admin");
    const { res, token } = await loginAs(app, user.email.toUpperCase());

    expect(res.status).toBe(204);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const cookie = (res.headers["set-cookie"] as unknown as string[]).join(";");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");

    // En la base solo queda el hash del token.
    const sessions = await prisma.session.findMany({ where: { userId: user.id } });
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.tokenHash).toBe(hashToken(token ?? ""));

    const me = await request(app).get("/api/v1/auth/session").set(headers(token));
    expect(me.status).toBe(200);
    expect(me.body.user).toEqual({ id: user.id, email: user.email, name: "Equipo", role: "admin" });

    const audit = await prisma.auditLog.findMany({ where: { resourceId: user.id } });
    expect(audit.map((a) => a.action)).toContain("auth.login");
  });

  it("correo inexistente, contraseña errónea y cuenta inactiva responden igual (401)", async () => {
    const app = newApp();
    const user = await staff();
    const inactive = await staff();
    await prisma.user.update({ where: { id: inactive.id }, data: { status: "inactive" } });

    const answers = await Promise.all([
      loginAs(app, "nadie@totalkids.cl"),
      loginAs(app, user.email, "otra-contraseña-cualquiera"),
      loginAs(app, inactive.email),
    ]);
    for (const { res, token } of answers) {
      expect(res.status).toBe(401);
      expect(res.body.message).toBe("Correo o contraseña incorrectos");
      expect(token).toBeUndefined();
    }
  });

  it("exige CSRF para ingresar", async () => {
    const user = await staff();
    const res = await request(newApp())
      .post("/api/v1/auth/login")
      .send({ email: user.email, password: PASSWORD });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("CSRF_FAILED");
  });

  it("bloquea la cuenta tras 5 fallos en 15 minutos, aunque luego acierte (RNF-04)", async () => {
    const app = newApp();
    const user = await staff();
    for (let i = 0; i < 5; i += 1) {
      expect((await loginAs(app, user.email, "contraseña-equivocada")).res.status).toBe(401);
    }
    const blocked = await loginAs(app, user.email);
    expect(blocked.res.status).toBe(429);
    expect(blocked.res.body.code).toBe("RATE_LIMITED");
    // Otra cuenta desde la misma IP sigue pudiendo ingresar.
    const other = await staff();
    expect((await loginAs(app, other.email)).res.status).toBe(204);
  });

  it("ingresar de nuevo revoca la sesión anterior del mismo navegador", async () => {
    const app = newApp();
    const user = await staff();
    const first = await loginAs(app, user.email);
    const second = await request(app)
      .post("/api/v1/auth/login")
      .set(headers(first.token))
      .send({ email: user.email, password: PASSWORD });
    expect(second.status).toBe(204);
    expect(sessionCookie(second)).not.toBe(first.token);

    const old = await request(app).get("/api/v1/auth/session").set(headers(first.token));
    expect(old.status).toBe(401);
  });

  // ── Sesiones revocables ────────────────────────────────────────────────────

  it("cerrar sesión la revoca en la base y borra la cookie", async () => {
    const app = newApp();
    const user = await staff();
    const { token } = await loginAs(app, user.email);

    const out = await request(app).post("/api/v1/auth/logout").set(headers(token));
    expect(out.status).toBe(204);
    expect((out.headers["set-cookie"] as unknown as string[]).join(";")).toContain(
      `${PANEL_COOKIE_DEV}=;`,
    );
    const row = await prisma.session.findUnique({ where: { tokenHash: hashToken(token ?? "") } });
    expect(row?.revokedAt).not.toBeNull();

    const me = await request(app).get("/api/v1/auth/session").set(headers(token));
    expect(me.status).toBe(401);
  });

  it("la sesión vence por inactividad, por tiempo absoluto y al desactivar la cuenta", async () => {
    const app = newApp();
    const check = (token?: string) => request(app).get("/api/v1/auth/session").set(headers(token));

    const idle = await staff();
    const idleLogin = await loginAs(app, idle.email);
    await prisma.session.updateMany({
      where: { userId: idle.id },
      data: { lastSeenAt: new Date(Date.now() - SESSION_IDLE_MS - 1000) },
    });
    expect((await check(idleLogin.token)).status).toBe(401);

    const expired = await staff();
    const expiredLogin = await loginAs(app, expired.email);
    await prisma.session.updateMany({
      where: { userId: expired.id },
      // Usada hace poco, pero ya pasó su vida máxima.
      data: {
        createdAt: new Date(Date.now() - 13 * 60 * 60_000),
        expiresAt: new Date(Date.now() - 1000),
        lastSeenAt: new Date(),
      },
    });
    expect((await check(expiredLogin.token)).status).toBe(401);

    const disabled = await staff();
    const disabledLogin = await loginAs(app, disabled.email);
    expect((await check(disabledLogin.token)).status).toBe(200);
    await prisma.user.update({ where: { id: disabled.id }, data: { status: "inactive" } });
    expect((await check(disabledLogin.token)).status).toBe(401);
  });

  // ── Permisos en backend (RF-31) ────────────────────────────────────────────

  it("/admin exige sesión y cada ruta su rol", async () => {
    const app = newApp();
    const admin = await loginAs(app, (await staff("admin")).email);
    const operator = await loginAs(app, (await staff("operator")).email);

    expect((await request(app).get("/api/v1/admin/equipo")).status).toBe(401);
    expect((await request(app).get("/api/v1/admin/no-existe")).status).toBe(401);
    expect(
      (
        await request(app)
          .get("/api/v1/admin/solo-admin")
          .set(headers("x".repeat(43)))
      ).status,
    ).toBe(401);

    const asOperator = await request(app)
      .get("/api/v1/admin/solo-admin")
      .set(headers(operator.token));
    expect(asOperator.status).toBe(403);
    expect(asOperator.body.code).toBe("FORBIDDEN");

    expect(
      (await request(app).get("/api/v1/admin/solo-admin").set(headers(admin.token))).status,
    ).toBe(200);
    const team = await request(app).get("/api/v1/admin/equipo").set(headers(operator.token));
    expect(team.body).toEqual({ role: "operator" });
  });

  it("un cambio de rol rige de inmediato, sin volver a ingresar", async () => {
    const app = newApp();
    const user = await staff("admin");
    const { token } = await loginAs(app, user.email);
    expect((await request(app).get("/api/v1/admin/solo-admin").set(headers(token))).status).toBe(
      200,
    );
    await prisma.user.update({ where: { id: user.id }, data: { role: "operator" } });
    expect((await request(app).get("/api/v1/admin/solo-admin").set(headers(token))).status).toBe(
      403,
    );
  });

  // ── Recuperación con token de un solo uso ──────────────────────────────────

  it("pedir recuperación responde 202 exista o no la cuenta, y encola el correo sin el token", async () => {
    const app = newApp();
    const user = await staff();
    const ask = (email: string) =>
      request(app).post("/api/v1/auth/password-reset/request").set(headers()).send({ email });

    expect((await ask(user.email)).status).toBe(202);
    expect((await ask("nadie@totalkids.cl")).status).toBe(202);

    const jobs = await prisma.outboxJob.findMany({ where: { type: "email.password_recovery" } });
    const mine = jobs.filter((job) => (job.payload as { userId?: string }).userId === user.id);
    expect(mine).toHaveLength(1);
    expect(mine[0]?.payload).toEqual({ userId: user.id });
  });

  it("restablecer cambia la contraseña, consume el token y revoca las sesiones", async () => {
    const app = newApp();
    const user = await staff();
    const { token: session } = await loginAs(app, user.email);
    const { token } = await issuePasswordResetToken(prisma, user.id);

    const NEW_PASSWORD = "otra-contraseña-más-segura";
    const confirm = (body: object) =>
      request(app).post("/api/v1/auth/password-reset/confirm").set(headers()).send(body);

    expect((await confirm({ token, password: NEW_PASSWORD })).status).toBe(204);
    expect((await request(app).get("/api/v1/auth/session").set(headers(session))).status).toBe(401);
    expect((await loginAs(app, user.email)).res.status).toBe(401);
    expect((await loginAs(app, user.email, NEW_PASSWORD)).res.status).toBe(204);

    // Un solo uso.
    const reused = await confirm({ token, password: "y-otra-contraseña-más" });
    expect(reused.status).toBe(422);
    expect(reused.body.details.issues[0].path).toBe("token");

    const audit = await prisma.auditLog.findMany({ where: { resourceId: user.id } });
    expect(audit.map((a) => a.action)).toContain("auth.password_reset");
  });

  it("solo vale el último enlace, vence a los 30 minutos y exige la política de contraseña", async () => {
    const app = newApp();
    const user = await staff();
    const confirm = (body: object) =>
      request(app).post("/api/v1/auth/password-reset/confirm").set(headers()).send(body);

    const first = await issuePasswordResetToken(prisma, user.id);
    const second = await issuePasswordResetToken(prisma, user.id);
    expect((await confirm({ token: first.token, password: "contraseña-nueva-1" })).status).toBe(
      422,
    );

    const short = await confirm({ token: second.token, password: "corta" });
    expect(short.status).toBe(422);
    expect(short.body.details.issues[0].path).toBe("password");

    const old = await issuePasswordResetToken(prisma, user.id, new Date(Date.now() - 31 * 60_000));
    expect((await confirm({ token: old.token, password: "contraseña-nueva-2" })).status).toBe(422);
    expect(await prisma.authToken.count({ where: { userId: user.id, usedAt: null } })).toBe(1);
  });

  // ── Alta de cuentas ────────────────────────────────────────────────────────

  it("el alta guarda el hash argon2id, normaliza el correo y no duplica cuentas", async () => {
    const user = await staff();
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.passwordHash).toMatch(/^\$argon2id\$/);
    expect(row.passwordHash).not.toContain(PASSWORD);

    await expect(
      createStaffUser(prisma, {
        email: `  ${user.email.toUpperCase()} `,
        name: "Otra",
        role: "admin",
        password: PASSWORD,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      createStaffUser(prisma, {
        email: "corta@totalkids.cl",
        name: "X",
        role: "admin",
        password: "123",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});
