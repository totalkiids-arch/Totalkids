import { describe, expect, it } from "vitest";

import { parsePaymentQuery, toApiPaymentSearch, toPaymentSearch } from "./payment-query";

describe("consulta de pagos en la URL", () => {
  it("lee estado, pedido y página, y descarta valores inválidos", () => {
    expect(parsePaymentQuery({ estado: "in_review", pedido: "tk-1053", pagina: "2" })).toEqual({
      status: "in_review",
      order: "TK-1053",
      page: 2,
    });
    expect(parsePaymentQuery({ estado: "otro", pedido: "<script>", pagina: "-1" })).toEqual({
      status: "todos",
      order: "",
      page: 1,
    });
    expect(parsePaymentQuery({ estado: ["pending", "paid"] }).status).toBe("pending");
    expect(parsePaymentQuery({ estado: "voided" }).status).toBe("voided");
  });

  it("arma la búsqueda omitiendo los valores por defecto", () => {
    expect(toPaymentSearch({ status: "todos", order: "", page: 1 })).toBe("");
    expect(toPaymentSearch({ status: "pending", order: "TK-1051", page: 3 })).toBe(
      "?estado=pending&pedido=TK-1051&pagina=3",
    );
  });

  it("arma los parámetros de la API", () => {
    expect(toApiPaymentSearch({ status: "todos", order: "", page: 1 })).toBe("page=1&pageSize=20");
    expect(toApiPaymentSearch({ status: "in_review", order: "TK-7", page: 2 })).toBe(
      "page=2&pageSize=20&status=in_review&order=TK-7",
    );
  });
});
