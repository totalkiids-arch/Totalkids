const CLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

/** "$129.990"; sin precio definido, el marcador de la maqueta. */
export function formatPrice(amount: number | null): string {
  return amount === null ? "$[PRECIO]" : CLP.format(amount);
}
