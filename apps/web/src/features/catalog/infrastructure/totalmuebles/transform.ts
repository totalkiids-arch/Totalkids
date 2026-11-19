/**
 * Traduce productos de la Store API de WooCommerce (totalmuebles.cl, el sitio del
 * cliente) al registro de catálogo de Total Kids. Funciones puras: el script
 * `scripts/importar-catalogo.ts` descarga los datos y las usa.
 *
 * Solo importa tipos (se borran al ejecutar con Node), para que el script corra
 * sin compilar.
 */
import type { CategorySlug, LevelId, MaterialSlug } from "../../domain/product";
import type { ProductMeasure } from "../../domain/product-detail";

/** Lo que usamos de un producto de /wp-json/wc/store/v1/products. */
export interface WooProduct {
  id: number;
  name: string;
  slug: string;
  permalink: string;
  description: string;
  on_sale: boolean;
  prices: { price: string; regular_price: string };
  images: { src: string }[];
  categories: { slug: string }[];
  is_in_stock: boolean;
  low_stock_remaining: number | null;
}

/** Registro guardado en `data/catalogo.json`. Las fotos ya están descargadas. */
export interface CatalogRecord {
  sourceId: number;
  sourceUrl: string;
  slug: string;
  name: string;
  category: CategorySlug;
  categories: CategorySlug[];
  levels: LevelId[];
  materials: MaterialSlug[];
  summary: string;
  description: string[];
  specs: ProductMeasure[];
  dimensions: ProductMeasure[];
  price: number;
  compareAtPrice: number | null;
  /** null = el sitio no informa unidades (hay stock sin control de cantidad). */
  available: number | null;
  inStock: boolean;
  popularity: number;
  publishedAt: string;
  featured: boolean;
  images: { src: string; width: number; height: number; alt: string }[];
}

/**
 * Productos del sitio que no son mobiliario infantil ni de aula, o que no son un
 * producto (un servicio sin precio). Decisión del 19-11-2026.
 */
export const EXCLUDED_SLUGS: ReadonlySet<string> = new Set([
  "disenos-de-salas",
  "sillon-ejecutivo",
  "mesa-plegable-180-cm",
  "mesa-abatible-compact",
  "mesa-mayo-bandeja-removible-altura-regulable-45x35-cm",
  "escabel-clinico-antideslizante-2-peldanos-catre-reposa-pies",
  "contenedor-de-panales-tommee-tippee-sangenic-twist-click-xl",
]);

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x?[\da-f]+|\w+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const n =
        code[1]?.toLowerCase() === "x" ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isFinite(n) ? String.fromCodePoint(n) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

/** HTML de WordPress a líneas de texto plano (sin etiquetas, sin vacías). */
export function htmlToLines(html: string): string[] {
  const text = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>|<\/(p|li|h\d|div|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  return decodeEntities(text)
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line !== "" && line !== ".");
}

const strip = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

const isShouting = (text: string) => {
  const letters = text.replace(/[^\p{L}]/gu, "");
  return letters.length > 3 && letters.replace(/\p{Lu}/gu, "").length / letters.length < 0.3;
};

/** Ortografía y nombres propios que se respetan al pasar a minúsculas. */
const WORDS: [RegExp, string][] = [
  [/\bjunji\b/gi, "JUNJI"],
  [/\bmontess?ori\b/gi, "Montessori"],
  [/\bpi[lk]{2}er\b/gi, "Pikler"],
  [/\bintegra\b/gi, "Integra"],
  [/\bkurruf\b/gi, "Kurruf"],
  [/\bpera\b/gi, "Pera"],
  [/\bbebesit\b/gi, "Bebesit"],
  [/\bbaby jumper\b/gi, "Baby Jumper"],
  [/\bac\b/gi, "AC"],
  [/\bcoig(u|ü)e\b/gi, "coigüe"],
  [/\bparvulo(s?)\b/gi, "párvulo$1"],
  [/\bplastic(o|a)\b/gi, "plástic$1"],
  [/\bmetalic(os?|as?)\b/gi, "metálic$1"],
  [/\bcolchon\b/gi, "colchón"],
  [/\bdidactic(o|a)\b/gi, "didáctic$1"],
  [/\bevacuacion\b/gi, "evacuación"],
  [/\btunel\b/gi, "túnel"],
  [/\bbaul\b/gi, "baúl"],
  [/\bresbalin\b/gi, "resbalín"],
  [/\bleon\b/gi, "león"],
  [/\bextraible\b/gi, "extraíble"],
];

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function sentenceCase(text: string): string {
  return text.toLowerCase();
}

function fixWords(text: string): string {
  return WORDS.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), text);
}

/** "SILLA PÁRVULO (NIVEL MEDIO) COIGUE" → "Silla párvulo (nivel medio) coigüe". */
export function normalizeName(raw: string): string {
  const cleaned = decodeEntities(raw)
    .replace(/\s+/g, " ")
    .replace(/\bc\/\s*/gi, "con ")
    .replace(/\bniv\.\s*/gi, "niveles ")
    .replace(/\bsc\b/gi, "sala cuna")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/n°\s*(\d)/gi, "N° $1")
    .replace(/(\d)\s*x\s*(?=\d)/gi, "$1x")
    .replace(/(\d)\s*(cm|mm)\b/gi, (_, d: string, unit: string) => `${d} ${unit.toLowerCase()}`)
    .trim();
  return capitalize(fixWords(sentenceCase(cleaned))).replace(/n° /g, "N° ");
}

/** Línea en mayúsculas → oración; las demás quedan igual. */
export function normalizeLine(line: string): string {
  const text = line.replace(/^[–•\-*]\s*/, "");
  return isShouting(text) ? capitalize(fixWords(sentenceCase(text))) : capitalize(text);
}

const DIMENSION_LABELS: Record<string, string> = {
  alto: "Alto",
  ancho: "Ancho",
  largo: "Largo",
  profundidad: "Profundidad",
  fondo: "Profundidad",
};

const UNIT = String.raw`([\d]+(?:[.,]\d+)?)\s*(cm|mm|mts?|mtrs?|m)\b\.?`;
/** "ALTO: 46 CM", "Alto Total: 75 cm." */
const LABEL_FIRST = new RegExp(
  String.raw`^(alto|ancho|largo|profundidad|fondo)(?: total)?\s*:?\s*${UNIT}$`,
  "i",
);
/** "49 CM DE ALTO" */
const VALUE_FIRST = new RegExp(String.raw`^${UNIT}\s+de\s+(alto|ancho|largo|profundidad)$`, "i");
const HEADING =
  /^(medidas|dimensiones|caracter[ií]sticas|descripci[oó]n)\b[^:]*:?$|^medidas generales/i;
const SPEC = /^([\p{L} ./()]{3,40}):\s*(.+)$/u;

function formatMeasure(amount: string, unit: string): string {
  const u = unit.toLowerCase().replace(/^mtr?s?$|^mts?$/, "m");
  return `${amount.replace(".", ",")} ${u}`;
}

export interface ParsedDescription {
  description: string[];
  specs: ProductMeasure[];
  dimensions: ProductMeasure[];
}

/**
 * Separa la descripción en párrafos, ficha técnica ("Material: …") y medidas
 * principales (alto, ancho, largo, profundidad). Si una medida se repite (p. ej.
 * las de un compartimiento), la segunda queda como texto.
 */
export function parseDescription(lines: readonly string[]): ParsedDescription {
  const result: ParsedDescription = { description: [], specs: [], dimensions: [] };
  const seen = new Set<string>();

  for (const line of lines) {
    const labelFirst = LABEL_FIRST.exec(line);
    const valueFirst = labelFirst ? null : VALUE_FIRST.exec(line);
    const label = labelFirst?.[1] ?? valueFirst?.[3];
    const amount = labelFirst?.[2] ?? valueFirst?.[1];
    const unit = labelFirst?.[3] ?? valueFirst?.[2];
    if (label && amount && unit) {
      const name = DIMENSION_LABELS[label.toLowerCase()] ?? label;
      if (!seen.has(name)) {
        seen.add(name);
        result.dimensions.push({ label: name, value: formatMeasure(amount, unit) });
      } else {
        result.description.push(normalizeLine(line));
      }
      continue;
    }
    if (HEADING.test(line)) continue;

    const spec = SPEC.exec(line);
    if (spec?.[1] && spec[2] && !/^descripci[oó]n/i.test(spec[1])) {
      result.specs.push({
        label: capitalize(sentenceCase(spec[1].trim())),
        value: normalizeLine(spec[2].trim()),
      });
      continue;
    }
    const text = spec?.[2] ?? line;
    result.description.push(normalizeLine(text.trim()));
  }
  return result;
}

/** Primera oración útil, como bajada de la tarjeta (≤ 140 caracteres). */
export function summarize(parsed: ParsedDescription): string {
  const material = parsed.specs.find((s) => /material|estructura/i.test(s.label));
  const longest = [...parsed.description].sort((a, b) => b.length - a.length)[0];
  // Frase común a casi todo el catálogo JUNJI: no distingue un producto de otro.
  const boilerplate = /calidad certificada|materiales no t[oó]xicos/i;
  const source =
    parsed.description.find((line) => line.length >= 30 && !boilerplate.test(line)) ??
    parsed.description.find((line) => line.length >= 15 && !boilerplate.test(line)) ??
    parsed.description.find((line) => line.length >= 30) ??
    (material ? `${material.label}: ${material.value}` : undefined) ??
    longest ??
    "";
  const sentence = source.split(/(?<=\.)\s/)[0] ?? source;
  if (sentence.length <= 140) return sentence;
  const cut = sentence.slice(0, 140);
  return `${cut.slice(0, cut.lastIndexOf(" "))}…`;
}

/** Categorías del sitio → categorías de Total Kids. */
const SOURCE_CATEGORY: Record<string, CategorySlug> = {
  cunas: "cunas",
  mesas: "mesas",
  "mesas-reunion": "mesas",
  escritorios: "mesas",
  "silla-junji": "sillas",
  sillas: "sillas",
  mudadores: "mudadores",
  almacenamiento: "almacenamiento",
  lockers: "almacenamiento",
  cajoneras: "almacenamiento",
  bibliotecas: "almacenamiento",
  archiveros: "almacenamiento",
  "montessori-pikler": "montessori-pikler",
  junji: "junji",
};

/** El nombre dice qué es el mueble con más precisión que las categorías del sitio. */
const NAME_CATEGORY: [RegExp, CategorySlug][] = [
  [/pikler|montessori|resbalin|tunel|rampa|triangulo|barra|escalera puente/, "montessori-pikler"],
  [/\b(set|kit)\b.*\bmesa\b/, "mesas"],
  [/\bmudador|escabel|escalera didactica/, "mudadores"],
  [/\bcuna|\bcama|colchon|malla/, "cunas"],
  [/\bsilla|\bpiso\b|banca/, "sillas"],
  [/\bmesa|escritorio|atril/, "mesas"],
  [
    /estant|librero|repis|baul|contenedor|locker|cajonera|ropero|perchero|arrimo|organizador/,
    "almacenamiento",
  ],
];

export function mapCategories(
  name: string,
  sourceSlugs: readonly string[],
): { category: CategorySlug; categories: CategorySlug[] } {
  // "sala cuna" es un nivel, no dice que el mueble sea una cuna.
  const plain = strip(name).replace(/sala cuna/g, "");
  const fromName = NAME_CATEGORY.filter(([re]) => re.test(plain)).map(([, slug]) => slug);
  const fromSource = sourceSlugs
    .map((s) => SOURCE_CATEGORY[s])
    .filter((s): s is CategorySlug => s !== undefined);
  // Las categorías del sitio tienen ruido (un atril en "cunas"): el nombre manda,
  // y del sitio solo se agregan las líneas JUNJI y Montessori-Pikler.
  const kinds = fromName.length > 0 ? fromName : fromSource.filter((s) => s !== "junji");
  const lines = fromSource.filter((s) => s === "junji" || s === "montessori-pikler");
  const categories = [...new Set([...kinds, ...lines])];
  const category = categories.find((c) => c !== "junji") ?? "junji";
  return { category, categories: categories.length > 0 ? categories : ["junji"] };
}

/** Niveles por el nombre; "sala cuna" y "nivel medio" también por la descripción. */
export function detectLevels(name: string, description: readonly string[]): LevelId[] {
  const n = strip(name);
  const d = strip(description.join(" "));
  const levels: LevelId[] = [];
  if (/adulto|docente|educador/.test(n)) return ["adultos"];
  if (
    /sala cuna|lactante|\bcuna|bebe|baby|bebesit|mudador|bacinica|ingesta/.test(n) ||
    /sala cuna/.test(d)
  ) {
    levels.push("sala-cuna");
  }
  if (/nivel(es)? medio|parvulo|pikler|montessori/.test(n) || /nivel(es)? medio/.test(d)) {
    levels.push("nivel-medio");
  }
  if (/kinder|transicion|escolar|parvulo|infantil/.test(n)) levels.push("transicion");
  return levels;
}

export function detectMaterials(text: string): MaterialSlug[] {
  const t = strip(text);
  const found: MaterialSlug[] = [];
  if (/madera|terciad|contrachapad|coigue|coihue|lenga|pino/.test(t)) found.push("madera");
  if (/melamina/.test(t)) found.push("melamina");
  if (/plastic|polipropileno|polietileno/.test(t)) found.push("plastico");
  if (/metal|acero|fierro/.test(t)) found.push("metal");
  return found;
}

/** Precio y precio anterior: solo hay oferta si el anterior es mayor. */
export function mapPrices(product: Pick<WooProduct, "on_sale" | "prices">) {
  const price = Number(product.prices.price);
  const regular = Number(product.prices.regular_price);
  return {
    price,
    compareAtPrice: product.on_sale && regular > price ? regular : null,
  };
}
