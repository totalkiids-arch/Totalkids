import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";

import { ERROR_CODES } from "../src/lib/errors.js";
import { FLOW_CALLBACK_PATHS } from "../src/middleware/body.js";

type Json = Record<string, unknown>;

const spec = parse(readFileSync(new URL("../openapi.yaml", import.meta.url), "utf8")) as Json;
const paths = spec.paths as Record<string, Json>;
const HTTP_METHODS = ["get", "post", "put", "patch", "delete"] as const;
const MUTATING = new Set(["post", "put", "patch", "delete"]);
/** Catálogo e inventario del panel (LN-12): solo Administrador. */
const LN12_PATHS = [
  "/admin/products",
  "/admin/products/{id}",
  "/admin/products/{id}/images",
  "/admin/products/{id}/images/order",
  "/admin/products/{id}/images/{imageId}",
  "/admin/products/{id}/stock-adjustments",
  "/admin/products/{id}/stock-movements",
  "/admin/inventory",
  "/admin/categories",
  "/admin/categories/{id}",
  "/admin/extras",
];
/** Carrito, cupón y cotización de entrega (LN-06). */
const LN06_PATHS = ["/cart", "/cart/items", "/cart/items/{id}", "/cart/coupon", "/shipping/quote"];
/** Pedidos del panel (LN-13): rol por path (reembolsos, solo Administrador). */
const LN13_ROLES: Record<string, string[]> = {
  "/admin/orders": ["admin", "operator"],
  "/admin/orders/{id}": ["admin", "operator"],
  "/admin/orders/{id}/status": ["admin", "operator"],
  "/admin/orders/{id}/invoice": ["admin", "operator"],
  "/admin/orders/{id}/refund-records": ["admin"],
  "/admin/orders/{id}/refund-records/{refundId}": ["admin"],
};
const LN13_PATHS = Object.keys(LN13_ROLES);
/**
 * Panel admin (LN-16): rol por path. Configuración, suscriptores, reportes,
 * exportaciones, usuarios y actividad: solo Administrador (tabla de la API de la
 * SRS). Solicitudes, correos, resumen y pagos: ambos roles.
 */
const LN16_ROLES: Record<string, string[]> = {
  "/admin/coupons": ["admin"],
  "/admin/coupons/{id}": ["admin"],
  "/admin/banners": ["admin"],
  "/admin/banners/{id}": ["admin"],
  "/admin/shipping-zones": ["admin"],
  "/admin/shipping-zones/{id}": ["admin"],
  "/admin/shipping-settings": ["admin"],
  "/admin/store-theme": ["admin"],
  "/admin/service-requests": ["admin", "operator"],
  "/admin/service-requests/{id}": ["admin", "operator"],
  "/admin/newsletter": ["admin"],
  "/admin/newsletter/{id}/unsubscribe": ["admin"],
  "/admin/reports/sales": ["admin"],
  "/admin/exports/{resource}": ["admin"],
  "/admin/summary": ["admin", "operator"],
  "/admin/payments": ["admin", "operator"],
  "/admin/activity": ["admin"],
  "/admin/users": ["admin"],
  "/admin/users/{id}": ["admin"],
  "/admin/users/{id}/role": ["admin"],
  "/admin/emails": ["admin", "operator"],
  "/admin/emails/{id}": ["admin", "operator"],
};
const LN16_PATHS = Object.keys(LN16_ROLES);
/** Lecturas públicas de la tienda que se configuran en el panel (LN-16). */
const LN16_PUBLIC_PATHS = ["/store-theme", "/banners"];
/** Paths ya implementados; todo lo demás debe estar marcado como pendiente. */
const IMPLEMENTED = new Set([
  // LN-02
  "/health",
  "/csrf",
  // LN-04
  "/auth/login",
  "/auth/logout",
  "/auth/session",
  "/auth/password-reset/request",
  "/auth/password-reset/confirm",
  // LN-05
  "/products",
  "/products/{slug}",
  "/categories",
  // LN-14
  "/admin/emails/{id}/resend",
  // LN-12
  ...LN12_PATHS,
  // LN-06
  ...LN06_PATHS,
  // LN-08
  "/service-requests",
  "/newsletter",
  "/newsletter/unsubscribe-link",
  "/newsletter/unsubscribe",
  // LN-09
  "/orders",
  "/orders/lookup",
  "/orders/{orderNumber}",
  // LN-10
  "/payments/flow/create",
  "/payments/flow/confirm",
  "/payments/flow/return",
  // LN-13
  ...LN13_PATHS,
  // LN-16
  ...LN16_PATHS,
  ...LN16_PUBLIC_PATHS,
]);

function operations() {
  return Object.entries(paths).flatMap(([path, item]) =>
    HTTP_METHODS.filter((method) => method in item).map((method) => ({
      path,
      method,
      item,
      op: item[method] as Json,
    })),
  );
}

function collectRefs(node: unknown, refs: string[] = []): string[] {
  if (Array.isArray(node)) node.forEach((child) => collectRefs(child, refs));
  else if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      if (key === "$ref" && typeof value === "string") refs.push(value);
      else collectRefs(value, refs);
    }
  }
  return refs;
}

function resolve(ref: string): unknown {
  return ref
    .replace(/^#\//, "")
    .split("/")
    .reduce<unknown>((node, key) => (node as Json | undefined)?.[key], spec);
}

function refsOf(op: Json, item: Json): string[] {
  return collectRefs([item.parameters, op.parameters]);
}

describe("contrato OpenAPI", () => {
  it("es OpenAPI 3 con base /api/v1", () => {
    expect(spec.openapi).toMatch(/^3\./);
    expect(JSON.stringify(spec.servers)).toContain("/api/v1");
  });

  it("todos los $ref resuelven", () => {
    const missing = collectRefs(spec).filter((ref) => resolve(ref) === undefined);
    expect(missing).toEqual([]);
  });

  it("cada operación tiene operationId único y tags", () => {
    const ids = operations().map(({ op }) => op.operationId);
    expect(ids.every((id) => typeof id === "string")).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    expect(operations().every(({ op }) => Array.isArray(op.tags))).toBe(true);
  });

  it("lo no implementado está marcado [Pendiente LN-xx] con x-pending-task", () => {
    for (const { path, op } of operations()) {
      if (IMPLEMENTED.has(path)) {
        expect(op["x-pending-task"], path).toBeUndefined();
        continue;
      }
      const task = op["x-pending-task"];
      expect(task, `${path} sin x-pending-task`).toMatch(/^LN-\d{2}$/);
      expect(op.summary, path).toContain(`[Pendiente ${String(task)}]`);
    }
  });

  it("no incluye las rutas de cuentas de comprador eliminadas por el cliente", () => {
    for (const removed of ["/auth/register", "/auth/forgot", "/auth/reset", "/me/orders"]) {
      expect(paths[removed], removed).toBeUndefined();
    }
  });

  it("los métodos que modifican exigen X-CSRF-Token, salvo los callbacks de Flow", () => {
    for (const { path, method, item, op } of operations()) {
      if (!MUTATING.has(method)) continue;
      const hasCsrf = refsOf(op, item).includes("#/components/parameters/CsrfTokenHeader");
      const isFlow = (FLOW_CALLBACK_PATHS as readonly string[]).includes(path);
      expect(hasCsrf, `${method.toUpperCase()} ${path}`).toBe(!isFlow);
    }
  });

  it("los callbacks de Flow aceptan solo formularios", () => {
    for (const path of FLOW_CALLBACK_PATHS) {
      const op = paths[path]?.post as Json | undefined;
      expect(op, path).toBeDefined();
      expect(collectRefs(op?.requestBody)).toEqual(["#/components/requestBodies/FlowCallback"]);
    }
  });

  it("solo la subida de imágenes del panel acepta multipart/form-data", () => {
    const multipart = operations()
      .filter(({ op }) => JSON.stringify(op.requestBody ?? {}).includes("multipart/form-data"))
      .map(({ path, method }) => `${method.toUpperCase()} ${path}`);
    expect(multipart).toEqual(["POST /admin/products/{id}/images"]);
  });

  it("el catálogo del panel (LN-12) es solo para Administrador y declara sus cuerpos", () => {
    for (const path of LN12_PATHS) {
      const item = paths[path];
      expect(item, path).toBeDefined();
      for (const { method, op } of operations().filter((o) => o.path === path)) {
        expect(op["x-roles"], `${method} ${path}`).toEqual(["admin"]);
        expect(JSON.stringify(op.requestBody ?? {}), `${method} ${path}`).not.toContain(
          "PendingJson",
        );
      }
    }
  });

  it("los pedidos del panel (LN-13) declaran roles, cuerpos y respuestas reales", () => {
    const declared = Object.keys(paths).filter((p) => p.startsWith("/admin/orders"));
    expect(declared.sort()).toEqual([...LN13_PATHS].sort());
    for (const path of LN13_PATHS) {
      const ops = operations().filter((o) => o.path === path);
      expect(ops.length, path).toBeGreaterThan(0);
      for (const { method, op } of ops) {
        const where = `${method.toUpperCase()} ${path}`;
        expect(op["x-roles"], where).toEqual(LN13_ROLES[path]);
        expect(op.summary, where).not.toContain("Pendiente");
        expect(JSON.stringify(op.requestBody ?? {}), where).not.toContain("PendingJson");
        if (MUTATING.has(method)) expect(op.requestBody, where).toBeDefined();
        const responses = op.responses as Json;
        const ok = (responses["200"] ?? responses["201"]) as Json | undefined;
        expect(JSON.stringify(ok?.content ?? null), where).toContain("#/components/schemas/");
        if (MUTATING.has(method)) {
          expect(Object.keys(responses), where).toEqual(expect.arrayContaining(["409", "422"]));
        }
      }
    }
  });

  it("el panel admin (LN-16) declara roles, cuerpos y respuestas reales", () => {
    for (const path of LN16_PATHS) {
      const ops = operations().filter((o) => o.path === path);
      expect(ops.length, path).toBeGreaterThan(0);
      for (const { method, op } of ops) {
        const where = `${method.toUpperCase()} ${path}`;
        expect(op["x-roles"], where).toEqual(LN16_ROLES[path]);
        expect(op["x-pending-task"], where).toBeUndefined();
        expect(op.summary, where).not.toContain("Pendiente");
        expect(op.security, where).toEqual(
          MUTATING.has(method) ? [{ panelSession: [], csrfCookie: [] }] : [{ panelSession: [] }],
        );
        expect(JSON.stringify(op.requestBody ?? {}), where).not.toContain("PendingJson");
        const responses = op.responses as Json;
        expect(Object.keys(responses), where).toEqual(expect.arrayContaining(["401", "403"]));
        const ok = (responses["200"] ?? responses["201"]) as Json | undefined;
        if (path === "/admin/exports/{resource}") {
          expect(Object.keys((ok?.content ?? {}) as Json), where).toEqual(["text/csv"]);
        } else if (ok) {
          expect(JSON.stringify(ok.content ?? null), where).toContain("#/components/schemas/");
        } else {
          expect(Object.keys(responses), where).toContain("204");
        }
        if (MUTATING.has(method)) expect(Object.keys(responses), where).toContain("422");
        if (MUTATING.has(method) && method !== "delete" && !path.endsWith("/unsubscribe")) {
          expect(op.requestBody, where).toBeDefined();
        }
      }
    }
  });

  it("ya no queda nada pendiente de LN-16", () => {
    for (const { path, method, op } of operations()) {
      expect(op["x-pending-task"], `${method.toUpperCase()} ${path}`).not.toBe("LN-16");
    }
    for (const path of LN16_PUBLIC_PATHS) {
      const op = paths[path]?.get as Json | undefined;
      expect(op?.security, path).toEqual([]);
      expect(op?.["x-roles"], path).toBeUndefined();
    }
  });

  it("el carrito (LN-06) declara sus cuerpos y responde el esquema Cart", () => {
    for (const path of LN06_PATHS) {
      for (const { method, op } of operations().filter((o) => o.path === path)) {
        expect(JSON.stringify(op.requestBody ?? {}), `${method} ${path}`).not.toContain(
          "PendingJson",
        );
        const ok = JSON.stringify((op.responses as Json)["200"] ?? (op.responses as Json)["201"]);
        const schema = path === "/shipping/quote" ? "ShippingQuote" : "Cart";
        expect(ok, `${method} ${path}`).toContain(`#/components/schemas/${schema}`);
      }
    }
  });

  it("el enum de ErrorBody.code coincide con el catálogo ERROR_CODES", () => {
    const schemas = (spec.components as Record<string, Json>).schemas as Record<string, Json>;
    const code = (schemas.ErrorBody?.properties as Record<string, Json>).code;
    expect([...(code?.enum as string[])].sort()).toEqual(Object.keys(ERROR_CODES).sort());
  });

  it("declara los componentes comunes", () => {
    const components = spec.components as Record<string, Json>;
    expect(Object.keys(components.responses ?? {})).toEqual(
      expect.arrayContaining([
        "BadRequest",
        "Unauthorized",
        "Forbidden",
        "NotFound",
        "Conflict",
        "PayloadTooLarge",
        "UnsupportedMediaType",
        "ValidationFailed",
        "TooManyRequests",
        "InternalError",
      ]),
    );
    expect(Object.keys(components.securitySchemes ?? {})).toEqual(
      expect.arrayContaining(["panelSession", "cartSession", "orderAccess", "csrfCookie"]),
    );
    expect(Object.keys(components.parameters ?? {})).toEqual(
      expect.arrayContaining(["Page", "PageSize", "IdempotencyKey", "CsrfTokenHeader"]),
    );
    expect(Object.keys(components.schemas ?? {})).toEqual(
      expect.arrayContaining(["ErrorBody", "ValidationIssue", "PageMeta"]),
    );
  });
});
