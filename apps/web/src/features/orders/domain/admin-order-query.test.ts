import { describe, expect, it } from "vitest";

import {
  applyAdminOrderQuery,
  ordersToCsv,
  parseAdminOrderQuery,
  paymentStatus,
  toAdminOrderSearch,
} from "./admin-order-query";
import { ORDER_STATUSES, type Order, type OrderStatus } from "./order";

const order = (id: string, overrides: Partial<Order> = {}): Order => ({
  id,
  createdAt: "2026-11-10T10:00:00-03:00",
  email: "camila@example.com",
  buyerName: "Camila González",
  status: "confirmed",
  lines: [{ name: "Cama", sku: "TK-1", detail: null, quantity: 1, unitPrice: 90000 }],
  shipping: 4990,
  discount: 0,
  delivery: { method: "retiro", address: "Tienda" },
  document: "boleta",
  tracking: null,
  history: [],
  ...overrides,
});

const ORDERS = [
  order("TK-1001", { createdAt: "2026-11-01T10:00:00-03:00", status: "delivered" }),
  order("TK-1002", {
    createdAt: "2026-11-05T10:00:00-03:00",
    buyerName: "Javier Muñoz",
    email: "javier@example.com",
    status: "pending_payment",
  }),
  order("TK-1003", { createdAt: "2026-11-09T10:00:00-03:00", status: "shipped" }),
];

describe("consulta del listado de pedidos", () => {
  it("lee la URL y descarta valores inválidos", () => {
    expect(parseAdminOrderQuery({})).toEqual({ q: "", status: "todos", page: 1 });
    expect(parseAdminOrderQuery({ q: "  camila ", estado: "shipped", pagina: "2" })).toEqual({
      q: "camila",
      status: "shipped",
      page: 2,
    });
    expect(parseAdminOrderQuery({ estado: "inventado", pagina: "-3" })).toEqual({
      q: "",
      status: "todos",
      page: 1,
    });
    expect(parseAdminOrderQuery({ q: ["a", "b"], pagina: "1.5" })).toMatchObject({
      q: "a",
      page: 1,
    });
    expect(parseAdminOrderQuery({ q: "x".repeat(200) }).q).toHaveLength(80);
  });

  it("arma la URL omitiendo los valores por defecto", () => {
    expect(toAdminOrderSearch({ q: "", status: "todos", page: 1 })).toBe("");
    expect(toAdminOrderSearch({ q: "tk 10", status: "shipped", page: 3 })).toBe(
      "?q=tk+10&estado=shipped&pagina=3",
    );
  });

  it("ordena de más reciente a más antiguo", () => {
    const result = applyAdminOrderQuery(ORDERS, { q: "", status: "todos", page: 1 });
    expect(result.items.map((o) => o.id)).toEqual(["TK-1003", "TK-1002", "TK-1001"]);
  });

  it("busca por número, nombre (sin tildes) o correo", () => {
    const ids = (q: string) =>
      applyAdminOrderQuery(ORDERS, { q, status: "todos", page: 1 }).items.map((o) => o.id);
    expect(ids("tk-1002")).toEqual(["TK-1002"]);
    expect(ids("munoz")).toEqual(["TK-1002"]);
    expect(ids("GONZALEZ")).toEqual(["TK-1003", "TK-1001"]);
    expect(ids("javier@")).toEqual(["TK-1002"]);
    expect(ids("nadie")).toEqual([]);
  });

  it("filtra por estado", () => {
    const result = applyAdminOrderQuery(ORDERS, { q: "", status: "shipped", page: 1 });
    expect(result.items.map((o) => o.id)).toEqual(["TK-1003"]);
  });

  it("pagina y ajusta una página fuera de rango", () => {
    const result = applyAdminOrderQuery(ORDERS, { q: "", status: "todos", page: 9 }, 2);
    expect(result).toMatchObject({ total: 3, page: 2, pageCount: 2 });
    expect(result.items.map((o) => o.id)).toEqual(["TK-1001"]);
  });

  it("con cero resultados queda en la página 1 de 1", () => {
    const result = applyAdminOrderQuery(ORDERS, { q: "nadie", status: "todos", page: 4 });
    expect(result).toMatchObject({ items: [], total: 0, page: 1, pageCount: 1 });
  });
});

describe("estado del pago", () => {
  it("tiene un estado para cada estado de pedido", () => {
    const expected: Record<OrderStatus, string> = {
      pending_payment: "pending",
      in_review: "uncertain",
      confirmed: "paid",
      preparing: "paid",
      shipped: "paid",
      delivered: "paid",
      cancelled: "unpaid",
      expired: "unpaid",
    };
    for (const status of ORDER_STATUSES) expect(paymentStatus(status)).toBe(expected[status]);
  });
});

describe("exportación CSV", () => {
  it("incluye encabezado, totales y etiquetas en español", () => {
    const lines = ordersToCsv(ORDERS.slice(0, 1)).split("\r\n");
    expect(lines[0]).toBe('"Pedido";"Fecha";"Cliente";"Correo";"Estado";"Pago";"Total CLP"');
    expect(lines[1]).toBe(
      '"TK-1001";"2026-11-01T10:00:00-03:00";"Camila González";"camila@example.com";"Entregado";"Pagado";"94990"',
    );
  });

  it("escapa comillas y neutraliza fórmulas", () => {
    const csv = ordersToCsv([order("TK-9", { buyerName: '=HYPERLINK("x")' })]);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
  });
});
