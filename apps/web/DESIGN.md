# Identidad visual · Total Kids

Los tokens viven en `src/app/globals.css` (bloque `@theme`). Cada uno genera utilidades de Tailwind: `bg-brand-blue`, `text-text-secondary`, `border-border`, `bg-soft-yellow`, `font-heading`, etc. **No uses colores sueltos** (`#…`, `gray-*`, `blue-*`): si falta un color, se agrega como token.

## Colores

| Token            | Hex       | Uso                                         |
| ---------------- | --------- | ------------------------------------------- |
| `brand-navy`     | `#1F2A44` | Texto principal, botones oscuros            |
| `brand-blue`     | `#1A5299` | Enlaces, acciones principales, foco         |
| `brand-yellow`   | `#FFC21F` | Botón destacado (carrito, comprar), acentos |
| `brand-red`      | `#D0352A` | Errores, ofertas                            |
| `brand-green`    | `#2F7A1F` | Éxito, disponibilidad                       |
| `brand-purple`   | `#8447B0` | Acentos secundarios                         |
| `background`     | `#FFF9EE` | Fondo general de la página                  |
| `surface`        | `#FFFFFF` | Tarjetas, cabecera, paneles                 |
| `soft-*`         | —         | Fondos suaves de chips, avisos y hover      |
| `text-primary`   | `#1F2A44` | Texto principal                             |
| `text-secondary` | `#5B6478` | Texto de apoyo                              |
| `border`         | `#F0E6D2` | Bordes de tarjetas y separadores            |

### Tonos de apoyo (de la maqueta)

| Token                                              | Hex                   | Uso                                                         |
| -------------------------------------------------- | --------------------- | ----------------------------------------------------------- |
| `brand-blue-deep` / `brand-red-deep`               | `#103B70` / `#98271F` | Sombra 3D de botones azul/rojo; texto rojo sobre `soft-red` |
| `ochre`                                            | `#E3C877`             | Sombra 3D de botones y chips blancos                        |
| `text-body`                                        | `#3D4660`             | Párrafos destacados (hero, tarjetas)                        |
| `cream`                                            | `#FFF3CC`             | Fondo de ilustraciones y chips                              |
| `input` / `input-border`                           | `#FFF4DE` / `#F3DFB5` | Buscador                                                    |
| `chip-border`                                      | `#E5D9BF`             | Botones de filtro no seleccionados                          |
| `dots`                                             | `#F3DDAE`             | Color del patrón de puntos (`pattern-dots`)                 |
| `offer` / `offer-ink`                              | `#FFE3D6` / `#8A2A12` | Píldora "Ofertas"                                           |
| `yellow-ink`                                       | `#8A6100`             | Íconos/texto "amarillo" legible sobre crema                 |
| `on-yellow`, `on-blue`, `on-dark`, `on-dark-muted` | —                     | Texto secundario sobre amarillo, azul y navy                |
| `navy-line`                                        | `#36415E`             | Separadores en el pie                                       |

Todas las combinaciones de texto con estos tonos pasan AA (≥ 5:1).

> Ojo: no nombres una utilidad propia igual que un color (`bg-dots`): Tailwind genera `bg-<color>` para cada token y la pisa. Por eso el patrón se llama `pattern-dots`.

## Contraste (WCAG 2.1 AA)

AA exige **4.5:1** para texto normal y **3:1** para texto grande (≥ 24 px, o ≥ 18,7 px en negrita).

| Combinación                                                | Ratio                 | Resultado            |
| ---------------------------------------------------------- | --------------------- | -------------------- |
| `text-primary` sobre `background` / `surface`              | 13.6 / 14.3           | ✅                   |
| `text-secondary` sobre `background` / `surface`            | 5.7 / 5.9             | ✅                   |
| `brand-blue` sobre `background` / `surface`                | 7.4 / 7.8             | ✅                   |
| `brand-red`, `brand-green`, `brand-purple` sobre `surface` | 5.0 / 5.4 / 6.0       | ✅                   |
| Blanco sobre `brand-blue` / `red` / `green` / `purple`     | 7.8 / 5.0 / 5.4 / 6.0 | ✅                   |
| `brand-navy` sobre `brand-yellow`                          | 8.8                   | ✅                   |
| `brand-red` sobre `soft-yellow`                            | 4.1                   | ⚠️ solo texto grande |
| `brand-yellow` sobre fondos claros                         | 1.5                   | ❌ nunca como texto  |
| Blanco sobre `brand-yellow`                                | 1.6                   | ❌ nunca             |

Reglas prácticas:

- **El amarillo es fondo, no texto.** Un botón amarillo lleva texto `brand-navy`.
- Los botones de color (azul, rojo, verde, morado) llevan texto blanco.
- No transmitas información solo con color (p. ej. estados de pago): acompaña siempre con texto o ícono.

## Tipografías

| Familia | Uso                                         | Pesos   | Utilidad                  |
| ------- | ------------------------------------------- | ------- | ------------------------- |
| Baloo 2 | Títulos, encabezados y elementos destacados | 700–800 | `font-heading`            |
| Nunito  | Textos, botones, formularios y navegación   | 400–800 | `font-body` (por defecto) |

Se cargan con `next/font/google` (`src/app/fonts.ts`): se descargan en el build y se sirven desde el propio sitio, sin peticiones del navegador a Google. `h1`–`h4` usan Baloo 2 automáticamente.

## Logo y mascota

| Componente | Qué es                                                                                                                                                           |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<Logo>`   | **Logo oficial del cliente**: disco con anillo azul, "TOTAL KIDS" formado por animales y el lema "Aprender jugando" (`src/shared/ui/brand/total-kids-logo.png`). |
| `<Tito>`   | Mascota de la maqueta: cubo amarillo con bloque "A" en la cabeza (SVG).                                                                                          |

```tsx
<Logo size="md" preload />   // cabecera de la tienda (64 px móvil, 88 px escritorio)
<Logo size="sm" />           // panel (44 px)
<Logo size="footer" />       // pie de página (96 px)
<Logo size="lg" />           // pantallas de acceso (128 px)
<Tito label="Tito, la mascota de Total Kids, saludando" animated />
```

- El PNG es un **recorte circular con fondo transparente** de la imagen del cliente (`docs/maqueta/total kids.png`, 656 × 656 px), que es una foto de presentación del logo sobre una mesa. Se sirve con `next/image` (formatos y tamaños optimizados automáticamente).
- El favicon (`src/app/icon.png`) y el ícono de iOS (`src/app/apple-icon.png`) salen del mismo recorte.
- Bajo ~56 px el texto del disco deja de leerse: no usar el logo más chico que `sm`.
- **Pendiente del cliente:** el logo en **SVG** (o PNG de alta resolución con fondo transparente). La imagen actual trae textura de papel e iluminación de foto, y no sirve para impresión. Cuando llegue, se reemplaza `total-kids-logo.png` y se regeneran los íconos.
- Los tokens `logo-orange`, `logo-sky` y `logo-green` son acentos del logo usados solo en la franja arcoíris (decorativos, sin contraste para texto).

## Componentes compartidos (`src/shared/ui`)

- `Button` / `ButtonLink`: píldora "de juguete" con sombra sólida. Variantes `primary`, `danger`, `light`, `dark`, `outline`, `ghost`.
- `SectionHeading`: antetítulo de color + título + complemento (texto, filtros o enlace).
- `icons.tsx`: íconos de trazo de la maqueta (decorativos, `aria-hidden`).
- `form.tsx`: `TextField`, `TextareaField`, `SelectField`, `Checkbox` y `RadioGroup` (lista o tarjetas). Etiqueta visible, ayuda y error conectados con `aria-describedby`; `aria-invalid` cuando hay error.
- `modal.tsx`: `Modal` sobre `<dialog>` nativo (foco atrapado y devuelto, Esc, clic en el fondo, sin scroll de fondo). Variante `sheet` para móvil.
- `carousel.tsx`: `Carousel` accesible (patrón APG). Rota cada 7 s; se pausa al pasar el mouse, al enfocar un control o con el botón Pausar. Con `prefers-reduced-motion` no rota ni anima. Las diapositivas inactivas quedan `inert`. Admite deslizar en pantallas táctiles.
- Galería en vivo: `/dev/componentes` (solo en desarrollo).
- `layout/StoreHeader`, `layout/StoreFooter`: cabecera (franja arcoíris, barra superior, buscador, categorías) y pie de la maqueta.
- Contenedor de página: `mx-auto max-w-7xl px-4 sm:px-6` (1280 px).
- Fondos oscuros: agrega la clase `on-dark` para que el foco sea amarillo.

## Accesibilidad base ya incluida

- Foco visible en todos los elementos interactivos (`:focus-visible` con contorno `brand-blue`).
- Enlace "Saltar al contenido" en la tienda.
- `nav` con `aria-label` y `main#contenido` en tienda y panel.
- Responsive: probar en **360, 768 y 1440 px** (criterio de UI-01).

## Banner principal (portada)

Carrusel de 5 diapositivas. En cada una, un animal del logo arma un mueble de la categoría que presenta:
jirafa (libreros), león (camas casita), elefante (mesas y sillas), oso (organizadores) y mono
(jardines y colegios). Las escenas son SVG en línea (`features/home/ui/animal-scenes.tsx`), animadas
con los tokens `--animate-swing`, `sway`, `lift`, `drop-in`, `hit`, `twinkle` y `drip`, siempre bajo
`motion-safe:`. El texto de cada diapositiva es provisional hasta tener banners administrables (UI-13).
