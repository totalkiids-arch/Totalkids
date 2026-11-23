/**
 * Reglas del carrito (LN-06, RF-05, RF-06, RN-01). Funciones puras: no tocan la
 * base ni HTTP. Siguen el mismo comportamiento que el carrito de la web
 * (apps/web/src/features/cart), para que la tienda no cambie al conectarse.
 *
 * - Todo se fabrica a pedido (UI-11): el stock no limita la compra; una línea
 *   con más unidades que las disponibles se marca "a pedido" con su plazo.
 * - Precios, extras y vigencia se recalculan siempre contra el catálogo: el
 *   carrito guardado solo tiene lo que eligió el comprador.
 */

/** Unidades máximas de un mismo SKU en el carrito (sumando sus líneas). */
export const MAX_QUANTITY_PER_SKU = 9;
/** Líneas máximas por carrito. */
export const MAX_LINES = 30;
/** Largo máximo de un texto de personalización si el extra no define uno. */
export const DEFAULT_TEXT_MAX_LENGTH = 40;
/** Plazo de fabricación a pedido para productos sin plazo propio. */
export const DEFAULT_LEAD_TIME = "3 a 5 días hábiles";

// ─── Catálogo vigente (lo que el repositorio lee de la base) ────────────────

export interface OfferedExtra {
  extraId: string;
  code: string;
  name: string;
  /** Precio por unidad en CLP; null = por confirmar (no suma al total). */
  price: number | null;
  /** Si pide un texto (p. ej. el nombre del niño), su etiqueta y largo máximo. */
  personalization: { label: string; maxLength: number } | null;
}

/** Variante tal como está hoy en el catálogo. */
export interface CatalogVariant {
  variantId: string;
  sku: string;
  productSlug: string;
  productName: string;
  optionLabel: string | null;
  imageUrl: string | null;
  /** Precio en CLP; null = el cliente aún no lo define: no se puede comprar. */
  price: number | null;
  compareAtPrice: number | null;
  /** Unidades terminadas (físico − reservado). */
  available: number;
  /** Plazo de fabricación a pedido del producto; null = el general. */
  leadTime: string | null;
  /** Extras que ofrece hoy el producto. */
  extras: readonly OfferedExtra[];
}

// ─── Carrito guardado ───────────────────────────────────────────────────────

export interface StoredExtra {
  extraId: string;
  text: string | null;
}

export interface StoredLine {
  id: string;
  variantId: string;
  quantity: number;
  extras: readonly StoredExtra[];
}

/**
 * Identifica una combinación de variante + extras + textos. Una misma variante
 * con otro armado o con otro nombre grabado es otra línea (RF-05).
 */
export function lineKey(sku: string, extras: readonly { code: string; text: string | null }[]) {
  const parts = [...extras]
    .map((e) => (e.text === null ? e.code : `${e.code}=${e.text.trim()}`))
    .sort();
  return [sku, ...parts].join("|");
}

// ─── Agregar una línea ──────────────────────────────────────────────────────

export interface AddRequest {
  quantity: number;
  extras: readonly { code: string; text?: string | null | undefined }[];
}

export type AddError =
  | { code: "NOT_FOUND"; message: string }
  | { code: "VALIDATION_ERROR"; message: string; field: "quantity" | "extras" }
  | { code: "CONFLICT"; message: string };

export type AddResult =
  | { ok: true; key: string; quantity: number; extras: StoredExtra[] }
  | { ok: false; error: AddError };

/**
 * Valida lo que se agrega (RF-04, RF-06): la variante se vende, la cantidad
 * respeta el máximo por SKU contando lo que ya está en el carrito, los extras
 * se ofrecen y los textos cumplen su largo. `inCart` son las líneas actuales
 * del carrito (SKU, combinación y cantidad). Si la combinación ya existe, la
 * cantidad se suma a esa línea (lo resuelve el repositorio con `key`).
 */
export function validateAdd(
  variant: CatalogVariant | null,
  request: AddRequest,
  inCart: readonly { sku: string; key: string; quantity: number }[],
): AddResult {
  if (!variant) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "Este producto ya no está disponible." },
    };
  }
  if (variant.price === null) {
    return {
      ok: false,
      error: {
        code: "CONFLICT",
        message: "Este producto aún no tiene precio. Escríbenos y lo cotizamos.",
      },
    };
  }

  const quantity = request.quantity;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY_PER_SKU) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        field: "quantity",
        message: `Elige entre 1 y ${MAX_QUANTITY_PER_SKU} unidades.`,
      },
    };
  }

  const extras: StoredExtra[] = [];
  const keyParts: { code: string; text: string | null }[] = [];
  const seen = new Set<string>();
  for (const chosen of request.extras) {
    if (seen.has(chosen.code)) continue;
    seen.add(chosen.code);
    const offered = variant.extras.find((e) => e.code === chosen.code);
    if (!offered) {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          field: "extras",
          message: "Uno de los servicios elegidos ya no está disponible.",
        },
      };
    }
    let text: string | null = null;
    if (offered.personalization) {
      text = (chosen.text ?? "").trim();
      if (text === "" || text.length > offered.personalization.maxLength) {
        return {
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            field: "extras",
            message: `Revisa el ${offered.personalization.label.toLowerCase()} (máximo ${offered.personalization.maxLength} caracteres).`,
          },
        };
      }
    }
    extras.push({ extraId: offered.extraId, text });
    keyParts.push({ code: offered.code, text });
  }

  const key = lineKey(variant.sku, keyParts);
  const sameSku = inCart.filter((l) => l.sku === variant.sku).reduce((n, l) => n + l.quantity, 0);
  const left = MAX_QUANTITY_PER_SKU - sameSku;
  if (quantity > left) {
    return {
      ok: false,
      error: {
        code: "CONFLICT",
        message:
          left <= 0
            ? `Ya tienes ${MAX_QUANTITY_PER_SKU} unidades en el carrito. Para más, escríbenos y lo cotizamos.`
            : `Solo puedes agregar ${left} ${left === 1 ? "unidad más" : "unidades más"}.`,
      },
    };
  }
  const isNewLine = !inCart.some((l) => l.key === key);
  if (isNewLine && inCart.length >= MAX_LINES) {
    return {
      ok: false,
      error: {
        code: "CONFLICT",
        message: `El carrito admite hasta ${MAX_LINES} productos distintos.`,
      },
    };
  }
  return { ok: true, key, quantity, extras };
}

/**
 * Nueva cantidad de una línea (0 la quita). El máximo por SKU cuenta las demás
 * líneas del mismo SKU. Devuelve el mensaje de error o null si es válida.
 */
export function quantityError(quantity: number, otherLinesSameSku: number): string | null {
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > MAX_QUANTITY_PER_SKU) {
    return `Elige entre 0 y ${MAX_QUANTITY_PER_SKU} unidades.`;
  }
  if (quantity + otherLinesSameSku > MAX_QUANTITY_PER_SKU) {
    const left = Math.max(0, MAX_QUANTITY_PER_SKU - otherLinesSameSku);
    return `Con tus otras líneas de este producto puedes llevar hasta ${left}.`;
  }
  return null;
}

// ─── Revalidar y valorizar (RF-06, RN-01) ───────────────────────────────────

export interface PricedExtra {
  code: string;
  name: string;
  /** Por unidad; null = por confirmar (no suma). */
  unitPrice: number | null;
  text: string | null;
}

export type LineStatus = "ok" | "adjusted" | "unavailable";

export interface PricedLine {
  id: string;
  sku: string;
  productSlug: string;
  productName: string;
  optionLabel: string | null;
  imageUrl: string | null;
  quantity: number;
  unitPrice: number | null;
  compareAtPrice: number | null;
  extras: PricedExtra[];
  /** Suma por unidad de los extras con precio. */
  extrasUnitPrice: number;
  /** (precio + extras) × cantidad; null si la línea no se puede comprar. */
  lineTotal: number | null;
  /** Hay menos unidades terminadas que las pedidas: se fabrica a pedido (UI-11). */
  madeToOrder: boolean;
  /** Plazo a pedido, cuando corresponde. */
  leadTime: string | null;
  status: LineStatus;
  /** Qué se ajustó o por qué no se puede comprar, para informarlo. */
  note: string | null;
}

export interface PricedCart {
  lines: PricedLine[];
  /** Unidades de las líneas comprables. */
  units: number;
  /** Suma de las líneas comprables (RN-01). */
  subtotal: number;
  /** Extras con precio por confirmar: se listan aparte y no suman. */
  unpriced: string[];
  /** Hay líneas que ya no se pueden comprar: hay que quitarlas antes de pagar. */
  blocked: boolean;
  /** Hubo ajustes o líneas no disponibles respecto de lo guardado. */
  changed: boolean;
  /** Extras guardados que ya no se ofrecen (para limpiarlos), por id de línea. */
  droppedExtras: Map<string, string[]>;
}

/**
 * Revalida cada línea contra el catálogo vigente (RF-06): un producto retirado
 * o sin precio deja la línea "unavailable" (bloquea el pago hasta quitarla), un
 * extra que ya no se ofrece se descarta, y se marca "a pedido" lo que supera
 * las unidades terminadas. Calcula el subtotal con precios de hoy (RN-01).
 *
 * @param defaultLeadTime Plazo general para productos sin plazo propio.
 */
export function priceCart(
  lines: readonly StoredLine[],
  catalog: ReadonlyMap<string, CatalogVariant | null>,
  defaultLeadTime: string,
): PricedCart {
  const priced: PricedLine[] = [];
  const unpriced = new Set<string>();
  const droppedExtras = new Map<string, string[]>();

  for (const line of lines) {
    const variant = catalog.get(line.variantId) ?? null;
    if (!variant || variant.price === null) {
      priced.push({
        id: line.id,
        sku: variant?.sku ?? "",
        productSlug: variant?.productSlug ?? "",
        productName: variant?.productName ?? "Producto no disponible",
        optionLabel: variant?.optionLabel ?? null,
        imageUrl: variant?.imageUrl ?? null,
        quantity: line.quantity,
        unitPrice: null,
        compareAtPrice: null,
        extras: [],
        extrasUnitPrice: 0,
        lineTotal: null,
        madeToOrder: false,
        leadTime: null,
        status: "unavailable",
        note: variant
          ? "Este producto quedó sin precio. Quítalo para continuar o escríbenos."
          : "Este producto ya no está a la venta. Quítalo para continuar.",
      });
      continue;
    }

    const notes: string[] = [];
    const extras: PricedExtra[] = [];
    const dropped: string[] = [];
    for (const stored of line.extras) {
      const offered = variant.extras.find((e) => e.extraId === stored.extraId);
      if (!offered) {
        dropped.push(stored.extraId);
        continue;
      }
      extras.push({
        code: offered.code,
        name: offered.name,
        unitPrice: offered.price,
        text: stored.text,
      });
      if (offered.price === null) unpriced.add(offered.name);
    }
    if (dropped.length > 0) {
      droppedExtras.set(line.id, dropped);
      notes.push("Quitamos un servicio que ya no está disponible.");
    }

    const extrasUnitPrice = extras.reduce((sum, e) => sum + (e.unitPrice ?? 0), 0);
    const madeToOrder = variant.available < line.quantity;
    priced.push({
      id: line.id,
      sku: variant.sku,
      productSlug: variant.productSlug,
      productName: variant.productName,
      optionLabel: variant.optionLabel,
      imageUrl: variant.imageUrl,
      quantity: line.quantity,
      unitPrice: variant.price,
      compareAtPrice: variant.compareAtPrice,
      extras,
      extrasUnitPrice,
      lineTotal: (variant.price + extrasUnitPrice) * line.quantity,
      madeToOrder,
      leadTime: madeToOrder ? (variant.leadTime ?? defaultLeadTime) : null,
      status: notes.length > 0 ? "adjusted" : "ok",
      note: notes.join(" ") || null,
    });
  }

  const buyable = priced.filter((l) => l.status !== "unavailable");
  return {
    lines: priced,
    units: buyable.reduce((sum, l) => sum + l.quantity, 0),
    subtotal: buyable.reduce((sum, l) => sum + (l.lineTotal ?? 0), 0),
    unpriced: [...unpriced],
    blocked: buyable.length !== priced.length,
    changed: priced.some((l) => l.status !== "ok"),
    droppedExtras,
  };
}

// ─── Totales (RN-01) ────────────────────────────────────────────────────────

export interface CartTotals {
  subtotal: number;
  discount: number;
  /** null = despacho por confirmar (no suma al total). */
  shipping: number | null;
  total: number;
}

/** Total = subtotal − descuento + despacho (el despacho por confirmar no suma). */
export function cartTotals(
  subtotal: number,
  discount: number,
  shipping: number | null,
): CartTotals {
  const safeDiscount = Math.min(Math.max(0, discount), subtotal);
  return {
    subtotal,
    discount: safeDiscount,
    shipping,
    total: subtotal - safeDiscount + (shipping ?? 0),
  };
}
