import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import type { Express } from "express";
import request, { type Response } from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parse } from "yaml";

import { createPrismaClient } from "../src/lib/prisma.js";
import { buildTestApp, csrfHeaders } from "./helpers.js";
import { inRollback, panelHeaders, panelSession } from "./panel-helpers.js";

// Permisos del panel recorridos desde el contrato (LN-17, CA-07; RF-31).
// Cada operación de openapi.yaml con `x-roles` (o bajo /admin) se prueba sin
// sesión, como Operador, como Administrador y sin CSRF. Una ruta nueva en el
// contrato entra sola en la tabla; una ruta nueva en Express que no esté en el
// contrato hace fallar «Express y el contrato declaran las mismas operaciones».
//
// Las sesiones se abren una vez (con conexiones reales) y al final las cuentas
// se desactivan: no se pueden borrar porque el login queda en audit_log, que
// solo admite inserciones. Cada caso corre en una transacción que se deshace,
// así que un Administrador u Operador que llegue al handler no deja nada.
const url = process.env.TEST_DATABASE_URL;

type Json = Record<string, unknown>;
type Role = "admin" | "operator";

const spec = parse(readFileSync(new URL("../openapi.yaml", import.meta.url), "utf8")) as Json;
const paths = spec.paths as Record<string, Json>;
const METHODS = ["get", "post", "put", "patch", "delete"] as const;
const MUTATING = new Set<string>(["post", "put", "patch", "delete"]);

interface Operation {
  method: (typeof METHODS)[number];
  path: string;
  roles: Role[] | undefined;
}

const operations: Operation[] = Object.entries(paths).flatMap(([path, item]) =>
  METHODS.filter((method) => method in item).map((method) => ({
    method,
    path,
    roles: (item[method] as Json)["x-roles"] as Role[] | undefined,
  })),
);

/** Lo que exige sesión del panel: todo /admin y lo que declara roles (p. ej. /auth/session). */
const guarded = operations.filter((op) => op.path.startsWith("/admin") || op.roles !== undefined);
const label = (op: Operation) => `${op.method.toUpperCase()} ${op.path}`;

/** Path concreto: {resource} → orders; cualquier otro parámetro → un uuid que no existe. */
function concrete(path: string): string {
  return path.replace(/\{(\w+)\}/g, (_m, name: string) =>
    name === "resource" ? "orders" : randomUUID(),
  );
}

/** Un 429 nunca es un resultado válido: el caso no probó lo que dice. */
function expectNotRateLimited(res: Response, where: string) {
  expect(res.status, `${where}: 429 por límite de peticiones, el caso no es válido`).not.toBe(429);
}

describe("contrato y rutas de Express", () => {
  it("toda operación /admin del contrato declara x-roles", () => {
    const missing = operations.filter((op) => op.path.startsWith("/admin") && !op.roles);
    expect(missing.map(label)).toEqual([]);
  });

  it("Express y el contrato declaran las mismas operaciones (una ruta nueva sin contrato se nota)", () => {
    const app = buildTestApp() as unknown as { router: { stack: Layer[] } };
    interface Layer {
      route?: { path: string; methods: Record<string, boolean> };
      handle?: { stack?: Layer[] };
    }
    // El router de /api/v1 es el primero con sub-rutas; /api/docs y /uploads quedan fuera.
    const v1 = app.router.stack.find((layer) => layer.handle?.stack)?.handle?.stack ?? [];
    const registered: string[] = [];
    const walk = (stack: Layer[]) => {
      for (const layer of stack) {
        if (layer.route) {
          const path = layer.route.path.replace(/:(\w+)/g, "{$1}");
          for (const method of Object.keys(layer.route.methods)) {
            if (method !== "_all") registered.push(`${method.toUpperCase()} ${path}`);
          }
        } else if (layer.handle?.stack) {
          walk(layer.handle.stack);
        }
      }
    };
    walk(v1);
    expect(registered.length).toBeGreaterThan(50);
    expect([...registered].sort()).toEqual(operations.map(label).sort());
  });
});

describe.skipIf(!url)("permisos del panel según x-roles (PostgreSQL real)", () => {
  const prisma = createPrismaClient(url ?? "");
  const sessions = {} as Record<Role, { userId: string; token: string }>;

  beforeAll(async () => {
    for (const role of ["admin", "operator"] as const) {
      const { user, token } = await panelSession(prisma, role);
      sessions[role] = { userId: user.id, token };
    }
  });

  afterAll(async () => {
    const ids = Object.values(sessions).map((s) => s.userId);
    await prisma.session.deleteMany({ where: { userId: { in: ids } } });
    // Inactivas no cuentan como «último Administrador activo» en otros archivos.
    await prisma.user.updateMany({ where: { id: { in: ids } }, data: { status: "inactive" } });
    await prisma.$disconnect();
  });

  /** Petición de la operación con las cabeceras dadas (sin cuerpo: no hace falta para permisos). */
  function send(app: Express, op: Operation, headers: Record<string, string>) {
    return request(app)
      [op.method](`/api/v1${concrete(op.path)}`)
      .set(headers);
  }

  it("la tabla cubre el panel completo", () => {
    expect(guarded.length).toBeGreaterThan(50);
    expect(guarded.some((op) => op.roles?.length === 1)).toBe(true);
    expect(guarded.some((op) => op.roles?.length === 2)).toBe(true);
  });

  it.each(guarded.map((op) => [label(op), op] as const))("%s", async (where, op) => {
    await inRollback(prisma, async (db) => {
      // App propia por caso: contador de límites propio (y muy alto en testEnv).
      const app = buildTestApp({ prisma: db });
      const mutating = MUTATING.has(op.method);

      // Sin sesión: 401 (con un CSRF válido sin sesión, para que no lo frene el CSRF).
      const anonymous = await send(app, op, mutating ? csrfHeaders() : {});
      expectNotRateLimited(anonymous, `${where} sin sesión`);
      expect(anonymous.status, `${where} sin sesión`).toBe(401);
      expect(anonymous.body.code).toBe("UNAUTHORIZED");

      for (const role of ["operator", "admin"] as const) {
        const res = await send(app, op, panelHeaders(sessions[role].token));
        const who = `${where} como ${role}`;
        expectNotRateLimited(res, who);
        if (op.roles?.includes(role)) {
          // Permitido: puede ser 404 o 422 (ids inventados, sin cuerpo), nunca 401 ni 403.
          expect([401, 403], `${who}: ${JSON.stringify(res.body)}`).not.toContain(res.status);
          expect(res.status, `${who}: ${JSON.stringify(res.body)}`).toBeLessThan(500);
        } else {
          expect(res.status, who).toBe(403);
          expect(res.body.code, who).toBe("FORBIDDEN");
        }
      }

      if (mutating) {
        // Con sesión válida pero sin el par CSRF: 403 antes de llegar al handler.
        const res = await send(app, op, panelHeaders(sessions.admin.token, false));
        expectNotRateLimited(res, `${where} sin CSRF`);
        expect(res.status, `${where} sin CSRF`).toBe(403);
        expect(res.body.code).toBe("CSRF_FAILED");
      }
    });
  });
});
