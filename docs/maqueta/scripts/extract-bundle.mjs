import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const SOURCE_FILE = 'Total Kids – Web Mobiliario Infantil.html';

const pages = [
  { id: 'baaee5f3-da49-4f55-9954-38bdb29c8a44', output: 'index.html', title: 'Inicio' },
  { id: 'c01d5348-3ae2-4acd-9f37-0b19e7316a3b', output: 'pages/catalogo.html', title: 'Catálogo' },
  { id: '20be2730-337d-4164-b925-695032e2a56d', output: 'pages/producto.html', title: 'Producto' },
  { id: '97efa6e6-a107-4a12-8db8-af73ec2d0cd2', output: 'pages/carrito.html', title: 'Carrito' },
  { id: '0b49e0fe-cd89-46cb-9c38-5676e2b963b3', output: 'pages/facturacion.html', title: 'Datos y facturación' },
  { id: 'a38c99f0-0cdd-4bde-a8c3-7d9836253314', output: 'pages/pago.html', title: 'Pago' },
  { id: 'e0289551-d688-4d6d-81e8-a38888fd5187', output: 'pages/servicios.html', title: 'Servicios especiales' },
];

const legacyRoutes = {
  'Main.dc.html': 'index.html',
  'Productos.dc.html': 'catalogo.html',
  'Producto.dc.html': 'producto.html',
  'Carrito.dc.html': 'carrito.html',
  'Facturacion.dc.html': 'facturacion.html',
  'Pago.dc.html': 'pago.html',
  'Servicios.dc.html': 'servicios.html',
};

let sharedFontCss = null;

function embeddedScript(document, type) {
  const expression = new RegExp(
    `<script type=["']__bundler/${type}["']>\\s*([\\s\\S]*?)\\s*<\\/script>`,
  );
  const match = document.match(expression);
  if (!match) throw new Error(`No se encontró __bundler/${type}`);
  return match[1];
}

function unpack(entry) {
  const bytes = Buffer.from(entry.data, 'base64');
  return entry.compressed ? gunzipSync(bytes) : bytes;
}

function fingerprint(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function outputRoute(legacyName, currentOutput) {
  const target = legacyRoutes[legacyName];
  const currentIsHome = currentOutput === 'index.html';

  if (target === 'index.html') return currentIsHome ? 'index.html' : '../index.html';
  return currentIsHome ? `pages/${target}` : target;
}

function assetName(entry, bytes) {
  const hash = fingerprint(bytes);
  if (entry.mime === 'text/javascript') {
    const contents = bytes.toString('utf8');
    if (contents.includes('GENERATED from dc-runtime')) return 'js/dc-runtime.js';
    if (contents.includes('react-dom.production.min.js')) return 'js/react-dom.production.min.js';
    if (contents.includes('@license React')) return 'js/react.production.min.js';
  }

  if (entry.mime === 'font/woff2') {
    if (hash.startsWith('26fb4610d4bc')) return 'fonts/baloo-2-latin.woff2';
    if (hash.startsWith('ba344451eab2')) return 'fonts/nunito-latin.woff2';
  }

  throw new Error(`Recurso desconocido: ${entry.mime} ${hash.slice(0, 12)}`);
}

function preparePage(template, manifest, page) {
  const isHome = page.output === 'index.html';
  const assetPrefix = isHome ? 'assets' : '../assets';
  let html = template;
  let runtimeId = null;

  for (const [resourceId, entry] of Object.entries(manifest)) {
    const bytes = unpack(entry);
    const name = assetName(entry, bytes);
    const target = `${assetPrefix}/${name}`;
    html = html.replaceAll(resourceId, target);
    if (name === 'js/dc-runtime.js') runtimeId = target;
  }

  if (!runtimeId) throw new Error(`La página ${page.title} no incluye el runtime`);

  const embeddedFonts = html.match(/<style>(\/\* devanagari \*\/[\s\S]*?)<\/style>/);
  if (!embeddedFonts) throw new Error(`La página ${page.title} no incluye sus tipografías`);
  const localFontRules = [...embeddedFonts[1].matchAll(/@font-face\s*\{[\s\S]*?\}/g)]
    .map((match) => match[0])
    .filter((rule) => rule.includes(`${assetPrefix}/fonts/`))
    .map((rule) => rule.replaceAll(`${assetPrefix}/fonts/`, '../fonts/'));
  if (localFontRules.length !== 7) {
    throw new Error(`Se esperaban siete variantes tipográficas locales en ${page.title}`);
  }
  const fontCss = `/* Tipografías locales incluidas en la maqueta original. */\n${localFontRules.join('\n\n')}\n`;
  if (sharedFontCss && sharedFontCss !== fontCss) {
    throw new Error(`Las tipografías de ${page.title} no coinciden con las compartidas`);
  }
  sharedFontCss = fontCss;
  html = html.replace(embeddedFonts[0], `<link rel="stylesheet" href="${assetPrefix}/css/fonts.css">`);

  const scriptStack = [
    `<script defer src="${assetPrefix}/js/react.production.min.js"></script>`,
    `<script defer src="${assetPrefix}/js/react-dom.production.min.js"></script>`,
    `<script defer src="${assetPrefix}/js/dc-runtime.js"></script>`,
  ].join('\n');

  html = html.replace(
    new RegExp(`<script src=["']${runtimeId.replaceAll('.', '\\.')}["']><\\/script>`),
    scriptStack,
  );

  for (const legacyName of Object.keys(legacyRoutes)) {
    html = html.replaceAll(legacyName, outputRoute(legacyName, page.output));
  }

  html = html
    .replace(/\n?<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">/g, '')
    .replace(/\n?<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin="">/g, '')
    .replace(
      `<link rel="stylesheet" href="${assetPrefix}/css/fonts.css">`,
      `<link rel="stylesheet" href="${assetPrefix}/css/fonts.css">\n<link rel="stylesheet" href="${assetPrefix}/css/responsive.css">`,
    )
    .replace(
      '<meta charset="utf-8">',
      '<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
    );

  html = html
    .replace('<!-- BARRA SUPERIOR -->\n<div style=', '<!-- BARRA SUPERIOR -->\n<div class="tk-topbar" style=')
    .replace('<!-- HERO -->\n<section style=', '<!-- HERO -->\n<section class="tk-home-hero-section" style=')
    .replace('<header style=', '<header class="tk-site-header" style=')
    .replace(
      '<div style="max-width: 1280px; margin: 0 auto; padding: 16px 24px; display: flex; flex-wrap: wrap; align-items: center; gap: 16px 32px">',
      '<div class="tk-header-inner tk-home-header" style="max-width: 1280px; margin: 0 auto; padding: 16px 24px; display: flex; flex-wrap: wrap; align-items: center; gap: 16px 32px">',
    )
    .replace(
      '<div style="max-width: 1280px; margin: 0 auto; padding: 14px 24px; display: flex; flex-wrap: wrap; align-items: center; gap: 12px 28px">',
      '<div class="tk-header-inner tk-compact-header" style="max-width: 1280px; margin: 0 auto; padding: 14px 24px; display: flex; flex-wrap: wrap; align-items: center; gap: 12px 28px">',
    )
    .replace(/<a (href="[^"]+" aria-label="Total Kids, inicio")/, '<a class="tk-brand" $1')
    .replace('<form role="search"', '<form class="tk-search" role="search"')
    .replace('<nav aria-label="Categorías"', '<nav class="tk-categories" aria-label="Categorías"')
    .replace('<nav aria-label="Principal"', '<nav class="tk-primary-nav" aria-label="Principal"')
    .replace(
      /<a href="([^"]*carrito\.html)" style="display: flex; align-items: center; gap: 8px; font-weight: 800; color: #FFFFFF; background: #C9304A;/,
      '<a class="tk-cart-link" href="$1" style="display: flex; align-items: center; gap: 8px; font-weight: 800; color: #FFFFFF; background: #C9304A;',
    )
    .replace(
      '</form>\n<div style="display: flex; align-items: center; gap: 12px; flex-shrink: 0">',
      '</form>\n<div class="tk-header-actions" style="display: flex; align-items: center; gap: 12px; flex-shrink: 0">',
    )
    .replace(
      '<span style="display: flex; align-items: center; gap: 8px; font-weight: 800; color: #18794E">',
      '<span class="tk-secure-label" style="display: flex; align-items: center; gap: 8px; font-weight: 800; color: #18794E">',
    );

  return html;
}

if (!existsSync(SOURCE_FILE)) {
  throw new Error(`No se encontró el archivo fuente: ${SOURCE_FILE}`);
}

const source = readFileSync(SOURCE_FILE, 'utf8');
const outerManifest = JSON.parse(embeddedScript(source, 'manifest'));
const writtenAssets = new Map();

mkdirSync('pages', { recursive: true });
mkdirSync('assets/css', { recursive: true });
mkdirSync('assets/js', { recursive: true });
mkdirSync('assets/fonts', { recursive: true });

for (const page of pages) {
  const outerEntry = outerManifest[page.id];
  if (!outerEntry) throw new Error(`Falta la página ${page.title} (${page.id})`);

  const packedPage = unpack(outerEntry).toString('utf8');
  const innerManifest = JSON.parse(embeddedScript(packedPage, 'manifest'));
  const template = JSON.parse(embeddedScript(packedPage, 'template'));

  for (const entry of Object.values(innerManifest)) {
    const bytes = unpack(entry);
    const name = assetName(entry, bytes);
    const previousHash = writtenAssets.get(name);
    const currentHash = fingerprint(bytes);
    if (previousHash && previousHash !== currentHash) {
      throw new Error(`Dos recursos distintos intentan usar assets/${name}`);
    }
    if (!previousHash) {
      writeFileSync(`assets/${name}`, bytes);
      writtenAssets.set(name, currentHash);
    }
  }

  writeFileSync(page.output, preparePage(template, innerManifest, page));
  console.log(`✓ ${page.output}`);
}

const license = source.match(/<!--\s*([\s\S]*?SIL OPEN FONT LICENSE[\s\S]*?)\s*-->/);
if (license) writeFileSync('assets/fonts/LICENSE.txt', `${license[1].trim()}\n`);
if (sharedFontCss) writeFileSync('assets/css/fonts.css', sharedFontCss);

console.log(`✓ ${writtenAssets.size} recursos compartidos deduplicados`);
