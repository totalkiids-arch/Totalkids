import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { checkNewPassword, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "./password-policy";

const apiFile = (path: string) =>
  readFileSync(fileURLToPath(new URL(`../../../../../api/${path}`, import.meta.url)), "utf8");

describe("política de contraseñas igual a la de la API", () => {
  it("coincide con apps/api/src/lib/passwords.ts", () => {
    const source = apiFile("src/lib/passwords.ts");
    expect(source).toMatch(
      new RegExp(`export const PASSWORD_MIN_LENGTH = ${PASSWORD_MIN_LENGTH};`),
    );
    expect(source).toMatch(
      new RegExp(`export const PASSWORD_MAX_LENGTH = ${PASSWORD_MAX_LENGTH};`),
    );
  });

  it("coincide con el contrato de /auth/password-reset/confirm en openapi.yaml", () => {
    const contract = apiFile("openapi.yaml");
    const start = contract.indexOf("  /auth/password-reset/confirm:");
    expect(start).toBeGreaterThan(-1);
    const operation = contract.slice(start, contract.indexOf("\n  /", start + 1));
    const password = operation.match(/password: \{[^}]*\}/)?.[0] ?? "";
    expect(password).toContain(`minLength: ${PASSWORD_MIN_LENGTH}`);
    expect(password).toContain(`maxLength: ${PASSWORD_MAX_LENGTH}`);
  });
});

describe("checkNewPassword", () => {
  const ok = "a".repeat(PASSWORD_MIN_LENGTH);

  it("acepta el mínimo exacto si coincide la repetición", () => {
    expect(checkNewPassword(ok, ok)).toEqual({});
  });

  it("rechaza una contraseña corta o larga", () => {
    expect(checkNewPassword(ok.slice(1), ok.slice(1)).password).toMatch(
      String(PASSWORD_MIN_LENGTH),
    );
    const long = "a".repeat(PASSWORD_MAX_LENGTH + 1);
    expect(checkNewPassword(long, long).password).toMatch(String(PASSWORD_MAX_LENGTH));
  });

  it("rechaza solo espacios y una repetición distinta", () => {
    const spaces = " ".repeat(PASSWORD_MIN_LENGTH);
    expect(checkNewPassword(spaces, spaces).password).toMatch(/espacios/);
    expect(checkNewPassword(ok, `${ok}x`).confirmation).toMatch(/no coinciden/);
  });
});
