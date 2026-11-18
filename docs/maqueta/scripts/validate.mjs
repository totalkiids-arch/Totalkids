import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, normalize, resolve } from "node:path";

const pages = [
  "index.html",
  ...["pages", "admin"].flatMap((dir) =>
    readdirSync(dir)
      .filter((file) => file.endsWith(".html"))
      .map((file) => `${dir}/${file}`),
  ),
];

const errors = [];

for (const page of pages) {
  if (!existsSync(page)) {
    errors.push(`${page}: no existe`);
    continue;
  }

  const html = readFileSync(page, "utf8");
  if (!/<html lang="es">/.test(html)) errors.push(`${page}: falta lang="es"`);
  if (!/<meta name="viewport"/.test(html))
    errors.push(`${page}: falta viewport`);
  const sharedPanel = /panel\.js/.test(html);
  if (sharedPanel && !/panel\.css/.test(html))
    errors.push(`${page}: falta el estilo compartido`);
  if (sharedPanel && !/<div id="app">/.test(html))
    errors.push(`${page}: falta el contenedor de la pantalla`);
  if (!sharedPanel && !/responsive\.css/.test(html))
    errors.push(`${page}: falta la adaptación responsive`);
  if (!sharedPanel && !/class="tk-site-header"/.test(html))
    errors.push(`${page}: falta el encabezado responsive`);
  if (!sharedPanel && !/class="tk-header-inner/.test(html))
    errors.push(`${page}: falta la estructura del encabezado`);
  if (/\.dc\.html/.test(html))
    errors.push(`${page}: conserva rutas internas del prototipo`);

  const references = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(
    (match) => match[1],
  );
  for (const reference of references) {
    if (/^(?:#|https?:|mailto:|tel:|data:|blob:)/.test(reference)) continue;
    const path = reference.split(/[?#]/)[0];
    if (!path) continue;
    const target = normalize(resolve(dirname(page), path));
    if (!existsSync(target))
      errors.push(`${page}: referencia rota ${reference}`);
  }
}

if (errors.length) {
  console.error(errors.map((error) => `✗ ${error}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `✓ ${pages.length} páginas verificadas; rutas y recursos locales correctos`,
  );
}
