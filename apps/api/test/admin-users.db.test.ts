import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPrismaClient, type PrismaClient } from "../src/lib/prisma.js";
import { updateUser, USER_MESSAGES } from "../src/services/admin-users.js";
import { buildTestApp } from "./helpers.js";
import { inRollback, panelHeaders, panelSession } from "./panel-helpers.js";

// Usuarios y roles del panel (LN-16, RF-31, RNF-01) contra totalkids_test. Cada
// caso corre en una transacción que se deshace (inRollback): otros tests crean
// cuentas del equipo con panelSession y no deben verse afectados.
const url = process.env.TEST_DATABASE_URL;
const api = (path: string) => `/api/v1/admin${path}`;

type Issue = { path: string; message: string };
const issueAt = (body: { details?: { issues?: Issue[] } }, path: string) =>
  body.details?.issues?.find((i) => i.path === path)?.message;

describe.skipIf(!url)("/admin/users (PostgreSQL real)", () => {
  const prisma = createPrismaClient(url ?? "");
  let admin = { token: "", id: "" };
  let operator = { token: "", id: "" };

  beforeAll(async () => {
    const a = await panelSession(prisma, "admin");
    const o = await panelSession(prisma, "operator");
    admin = { token: a.token, id: a.user.id };
    operator = { token: o.token, id: o.user.id };
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const inTx = (fn: (db: PrismaClient, app: ReturnType<typeof buildTestApp>) => Promise<void>) =>
    inRollback(prisma, async (db) => fn(db, buildTestApp({ prisma: db })));

  const asAdmin = (app: ReturnType<typeof buildTestApp>) => ({
    get: () => request(app).get(api("/users")).set(panelHeaders(admin.token)),
    post: (body: object) =>
      request(app).post(api("/users")).set(panelHeaders(admin.token)).send(body),
    patch: (id: string, body: object) =>
      request(app)
        .patch(api(`/users/${id}`))
        .set(panelHeaders(admin.token))
        .send(body),
    role: (id: string, role: string) =>
      request(app)
        .patch(api(`/users/${id}/role`))
        .set(panelHeaders(admin.token))
        .send({ role }),
  });

  it("permisos: sin sesión 401, Operador 403, sin CSRF 403", async () => {
    const app = buildTestApp({ prisma });
    expect((await request(app).get(api("/users"))).status).toBe(401);
    expect((await request(app).get(api("/users")).set(panelHeaders(operator.token))).status).toBe(
      403,
    );
    expect(
      (
        await request(app)
          .patch(api(`/users/${operator.id}/role`))
          .set(panelHeaders(operator.token))
          .send({ role: "admin" })
      ).status,
    ).toBe(403);
    const noCsrf = await request(app)
      .patch(api(`/users/${operator.id}/role`))
      .set(panelHeaders(admin.token, false))
      .send({ role: "admin" });
    expect(noCsrf.status).toBe(403);
  });

  it("lista sin datos sensibles y marca la cuenta propia", async () => {
    await inTx(async (_db, app) => {
      const res = await asAdmin(app).get();
      expect(res.status).toBe(200);
      const me = (res.body.items as { id: string; isSelf: boolean }[]).find(
        (u) => u.id === admin.id,
      );
      expect(me?.isSelf).toBe(true);
      expect(res.body.activeAdmins).toBeGreaterThan(0);
      expect(JSON.stringify(res.body)).not.toContain("passwordHash");
      expect(JSON.stringify(res.body)).not.toContain("argon2");
    });
  });

  it("alta con contraseña aleatoria y correo para definirla (password_recovery)", async () => {
    await inTx(async (db, app) => {
      const email = `Nueva-${randomUUID().slice(0, 8)}@TotalKids.cl`;
      const res = await asAdmin(app).post({ name: "  Paula Rojas ", email, role: "operator" });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        name: "Paula Rojas",
        email: email.toLowerCase(),
        role: "operator",
        roleLabel: "Operador",
        active: true,
        invitationSent: true,
      });
      const id = res.body.id as string;
      const log = await db.emailLog.findFirst({
        where: { event: "password_recovery", recipient: email.toLowerCase() },
      });
      expect(log).not.toBeNull();
      const job = await db.outboxJob.findUniqueOrThrow({ where: { id: log?.outboxJobId ?? "" } });
      expect(job.payload).toEqual({ userId: id });
      const stored = await db.user.findUniqueOrThrow({ where: { id } });
      expect(stored.passwordHash.startsWith("$argon2id$")).toBe(true);
      const audit = await db.auditLog.findFirst({ where: { resourceId: id } });
      expect(audit).toMatchObject({ action: "user.created", actorUserId: admin.id });
      expect(JSON.stringify(audit?.details)).not.toContain("argon2");

      // Inactiva: no se le envía nada.
      const inactive = await asAdmin(app).post({
        name: "Pedro",
        email: `inactiva-${randomUUID().slice(0, 8)}@totalkids.cl`,
        role: "admin",
        active: false,
      });
      expect(inactive.body).toMatchObject({ active: false, invitationSent: false });
    });
  });

  it("valida con los textos del panel y el correo es único", async () => {
    await inTx(async (_db, app) => {
      const bad = await asAdmin(app).post({ name: " ", email: "no-es-correo", role: "operator" });
      expect(bad.status).toBe(422);
      expect(issueAt(bad.body, "name")).toBe("Ingresa el nombre.");
      expect(issueAt(bad.body, "email")).toBe(
        "Escribe un correo válido, por ejemplo nombre@totalkids.cl.",
      );
      const noRole = await asAdmin(app).post({
        name: "Ana",
        email: "ana@totalkids.cl",
        role: "dueño",
      });
      expect(issueAt(noRole.body, "role")).toBe("Elige un rol.");
      const operatorEmail = (await prisma.user.findUniqueOrThrow({ where: { id: operator.id } }))
        .email;
      const dup = await asAdmin(app).post({
        name: "Otra",
        email: operatorEmail.toUpperCase(),
        role: "operator",
      });
      expect(dup.status).toBe(422);
      expect(issueAt(dup.body, "email")).toBe("Ya existe una cuenta con ese correo.");
    });
  });

  it("cambiar el rol revoca las sesiones y el permiso nuevo rige de inmediato (RNF-01)", async () => {
    const target = await panelSession(prisma, "operator");
    await inTx(async (db, app) => {
      const before = await request(app).get(api("/orders")).set(panelHeaders(target.token));
      expect(before.status).toBe(200);
      const res = await asAdmin(app).role(target.user.id, "admin");
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ role: "admin", sessionsRevoked: 1 });
      const after = await request(app).get(api("/orders")).set(panelHeaders(target.token));
      expect(after.status).toBe(401);
      const audit = await db.auditLog.findFirst({
        where: { resourceId: target.user.id, action: { startsWith: "user." } },
      });
      expect(audit).toMatchObject({ action: "user.role_changed" });
      expect(audit?.details).toMatchObject({
        changes: { role: { before: "operator", after: "admin" } },
        summary: "Cuenta de Equipo: rol Operador → Administrador.",
      });
    });
  });

  it("desactivar revoca las sesiones; editar nombre o correo no", async () => {
    const target = await panelSession(prisma, "operator");
    await inTx(async (db, app) => {
      const renamed = await asAdmin(app).patch(target.user.id, { name: "Equipo Temuco" });
      expect(renamed.body).toMatchObject({ name: "Equipo Temuco", sessionsRevoked: 0 });
      const off = await asAdmin(app).patch(target.user.id, { active: false });
      expect(off.body).toMatchObject({ active: false, status: "inactive", sessionsRevoked: 1 });
      expect(await db.session.count({ where: { userId: target.user.id, revokedAt: null } })).toBe(
        0,
      );
      const actions = await db.auditLog.findMany({
        where: { resourceId: target.user.id, action: { startsWith: "user." } },
        orderBy: { createdAt: "asc" },
      });
      expect(actions.map((a) => a.action)).toEqual(["user.updated", "user.deactivated"]);
      expect((await asAdmin(app).patch(randomUUID(), { active: true })).status).toBe(404);
    });
  });

  it("nadie se quita el rol de Administrador ni se desactiva a sí mismo", async () => {
    await inTx(async (_db, app) => {
      const role = await asAdmin(app).role(admin.id, "operator");
      expect(role.status).toBe(409);
      expect(role.body.message).toBe(USER_MESSAGES.selfRole);
      const off = await asAdmin(app).patch(admin.id, { active: false });
      expect(off.status).toBe(409);
      expect(off.body.message).toBe(USER_MESSAGES.selfDeactivate);
    });
  });

  it("el último Administrador activo no se puede degradar ni desactivar", async () => {
    // Dos Administradores, A y B, se degradan entre sí al mismo tiempo: el
    // candado los aplica uno tras otro y el segundo (con la sesión de B ya
    // desactualizada) ve que dejaría el panel sin Administradores.
    const a = await panelSession(prisma, "admin");
    const b = await panelSession(prisma, "admin");
    await inRollback(prisma, async (db) => {
      await db.user.updateMany({
        where: { role: "admin", status: "active", id: { notIn: [a.user.id, b.user.id] } },
        data: { status: "inactive" },
      });
      const actorA = { actorUserId: a.user.id, actorLabel: "Administrador" };
      const actorB = { actorUserId: b.user.id, actorLabel: "Administrador" };
      await updateUser(db, b.user.id, { role: "operator" }, actorA);
      await expect(updateUser(db, a.user.id, { role: "operator" }, actorB)).rejects.toMatchObject({
        status: 409,
        message: USER_MESSAGES.lastAdmin,
      });
      await expect(updateUser(db, a.user.id, { active: false }, actorB)).rejects.toMatchObject({
        status: 409,
        message: USER_MESSAGES.lastAdmin,
      });
      expect(await db.user.count({ where: { role: "admin", status: "active" } })).toBe(1);

      // Con otro Administrador activo, sí se puede.
      await updateUser(db, b.user.id, { role: "admin" }, actorA);
      const done = await updateUser(db, a.user.id, { role: "operator" }, actorB);
      expect(done.role).toBe("operator");
    });
  });
});
