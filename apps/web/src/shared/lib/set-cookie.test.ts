import { describe, expect, it } from "vitest";

import { parseSetCookie } from "./set-cookie";

describe("parseSetCookie", () => {
  it("lee la cookie de sesión del panel con sus atributos", () => {
    expect(
      parseSetCookie("tk_panel=abc_123-XYZ; Max-Age=43200; Path=/; HttpOnly; SameSite=Lax"),
    ).toEqual({
      name: "tk_panel",
      value: "abc_123-XYZ",
      options: { maxAge: 43200, path: "/", httpOnly: true, sameSite: "lax" },
    });
  });

  it("lee el borrado de una cookie (Expires en el pasado) y Secure", () => {
    const parsed = parseSetCookie(
      "__Host-tk_panel=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax",
    );
    expect(parsed?.name).toBe("__Host-tk_panel");
    expect(parsed?.value).toBe("");
    expect(parsed?.options.expires?.getTime()).toBe(0);
    expect(parsed?.options.secure).toBe(true);
  });

  it("conserva el punto del token CSRF y decodifica valores codificados", () => {
    expect(parseSetCookie("tk_csrf=aaa.bbb; Path=/")?.value).toBe("aaa.bbb");
    expect(parseSetCookie("x=a%20b")?.value).toBe("a b");
  });

  it("ignora atributos desconocidos o inválidos", () => {
    expect(parseSetCookie("a=1; Max-Age=nope; SameSite=raro; Priority=High")?.options).toEqual({});
  });

  it("rechaza un par mal formado", () => {
    expect(parseSetCookie("sin-igual")).toBeNull();
    expect(parseSetCookie("=valor")).toBeNull();
  });
});
