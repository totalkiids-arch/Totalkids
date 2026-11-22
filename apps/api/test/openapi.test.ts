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
