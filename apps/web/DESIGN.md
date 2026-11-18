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

Portados de la maqueta aprobada (`Maqueta web total kids/index.html`) como componentes SVG en `src/shared/ui/brand/`:

| Componente   | Qué es                                                                                                 |
| ------------ | ------------------------------------------------------------------------------------------------------ |
| `<LogoMark>` | Isotipo **en bloques**: cubos T (azul), K (rojo) y cubo amarillo con check                             |
| `<Logo>`     | Isotipo + logotipo "TOTAL KIDS" (cada letra con el color del logo ilustrado) + lema "Aprender jugando" |
| `<Tito>`     | Mascota: cubo amarillo con bloque "A" en la cabeza                                                     |

```tsx
<Logo />                         // cabecera de la tienda (md, con lema)
<Logo size="sm" withTagline={false} /> // panel
<Logo markOnly />                // solo el isotipo TK
<Tito label="Tito, la mascota de Total Kids, saludando" animated />
<Tito className="w-10" />        // decorativo (aria-hidden)
```

- `<Logo>` se anuncia como "Total Kids"; sus piezas son decorativas.
- `<Tito animated>` flota con `motion-safe:animate-float`: se detiene si el usuario pidió reducir movimiento.
- Las letras del logotipo usan tokens propios (`logo-orange`, `logo-sky`, `logo-green`, `logo-yellow`, más `brand-purple` y `brand-red`). **Son solo para el logo**: varios no tienen contraste suficiente para texto, y los logotipos están exentos de ese requisito en WCAG.
- Pendiente del cliente: el archivo original del logo ilustrado con animales (`total kids.png`) en alta resolución o SVG, para usos impresos o redes. La web no lo necesita.

## Accesibilidad base ya incluida

- Foco visible en todos los elementos interactivos (`:focus-visible` con contorno `brand-blue`).
- Enlace "Saltar al contenido" en la tienda.
- `nav` con `aria-label` y `main#contenido` en tienda y panel.
- Responsive: probar en **360, 768 y 1440 px** (criterio de UI-01).
