import { describe, expect, it } from "vitest";

import { PANEL_MESSAGES } from "@/shared/lib/panel-errors";

import { toChangedUser, toCreatedUser, toUserList } from "./admin-users-api";

const user = {
  id: "0195f3a0-7c1e-7d2a-9b44-2f1c3a5d6e70",
  name: "Paula Rojas",
  email: "paula@totalkids.cl",
  role: "operator",
  roleLabel: "Operador",
  status: "active",
  active: true,
  lastLoginAt: null,
  createdAt: "2026-11-20T12:00:00.000Z",
  updatedAt: "2026-11-20T12:00:00.000Z",
  isSelf: false,
};

describe("admin-users-api", () => {
  it("traduce las cuentas y cuántos Administradores activos hay", () => {
    expect(toUserList({ items: [user], activeAdmins: 1 })).toEqual({
      users: [
        {
          id: user.id,
          name: "Paula Rojas",
          email: "paula@totalkids.cl",
          role: "operator",
          active: true,
          lastLoginAt: null,
          isSelf: false,
        },
      ],
      activeAdmins: 1,
    });
  });

  it("lee si se envió la invitación y cuántas sesiones se cerraron", () => {
    expect(toCreatedUser({ ...user, invitationSent: true }).invitationSent).toBe(true);
    expect(toChangedUser({ ...user, sessionsRevoked: 2 }).sessionsRevoked).toBe(2);
  });

  it("un rol desconocido cuenta como API no disponible", () => {
    expect(() => toUserList({ items: [{ ...user, role: "jefe" }], activeAdmins: 1 })).toThrow(
      PANEL_MESSAGES.unavailable,
    );
  });
});
