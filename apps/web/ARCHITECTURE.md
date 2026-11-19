# Arquitectura de apps/web

El frontend sigue una arquitectura limpia organizada por **features** (dominios del negocio). Las reglas de dependencia se verifican con ESLint (`eslint.config.js`), así que `pnpm lint` falla si alguien las rompe.

## Estructura

```
src/
  app/                 Enrutamiento de Next.js. Solo páginas, layouts y rutas BFF.
    (tienda)/          Tienda y compra (route group: no aparece en la URL)
    (cuenta)/          Cuenta del comprador
    admin/(acceso)/    Ingreso al panel (sin menú lateral)
    admin/(panel)/     Panel administrativo (con menú lateral)
    api/               Rutas BFF: el navegador llama aquí y Next.js llama a la API
  features/<nombre>/   Un dominio del negocio
    domain/            Tipos, entidades y reglas. TypeScript puro.
    application/       Casos de uso y puertos (interfaces). TypeScript puro.
    infrastructure/    Adaptadores que implementan los puertos (HTTP, storage…)
    ui/                Componentes React y pantallas (*-screen.tsx)
    container.ts       Raíz de composición: conecta puertos con adaptadores
    index.ts           API pública de la feature
  shared/              Código transversal sin conocimiento de negocio
    config/            Rutas de navegación y variables de entorno de servidor
    infrastructure/    Cliente HTTP de servidor hacia la API (apiFetch)
    ui/                Componentes genéricos y layouts (StoreShell, AdminShell)
```

Las capas se crean **cuando se necesitan**: una feature que hoy solo tiene `ui/` no lleva carpetas vacías. `features/system` (estado de la API) es el ejemplo de referencia con las cuatro capas.

## Reglas de dependencia

```
app ──> features/<f>/index.ts ──> ui ──> container ──> infrastructure
                                   │                        │
                                   └──> application <──────┘
                                            │
                                            └──> domain
```

| Desde                   | Puede importar                                    | No puede importar                      |
| ----------------------- | ------------------------------------------------- | -------------------------------------- |
| `domain/`               | Nada propio de la app (solo TS y librerías puras) | React, Next.js, otras capas            |
| `application/`          | `domain/`                                         | React, Next.js, infrastructure, ui     |
| `infrastructure/`       | `application/`, `domain/`, `shared/`              | `ui/`                                  |
| `ui/`                   | `container`, `application/`, `domain/`, `shared/` | `infrastructure/`                      |
| `app/` y otras features | `@/features/<f>` (su `index.ts`)                  | Capas internas (`@/features/<f>/ui/…`) |
| `shared/`               | `shared/`                                         | `features/`                            |

## Datos y la API

- El navegador **nunca** llama a la API Express. Los componentes de cliente llaman a rutas BFF en `src/app/api/*`.
- Las rutas BFF y los Server Components usan `apiFetch` (`shared/infrastructure/api-client.ts`), que es `server-only`, propaga `X-Request-Id` y `X-Forwarded-For`.
- Los secretos solo existen en el servidor. Ninguna variable secreta lleva el prefijo `NEXT_PUBLIC_`.

## Cómo agregar una pantalla

1. Crea `features/<f>/ui/<nombre>-screen.tsx` y expórtalo en `features/<f>/index.ts`.
2. Crea `app/<grupo>/<ruta>/page.tsx` que solo lea `params`/`searchParams` y renderice la pantalla.
3. Si la ruta va en un menú, agrégala en `shared/config/routes.ts` (`typedRoutes` valida que exista).

## Mapa de pantallas

| Sección              | Pantalla                      | Ruta                                              | Feature      |
| -------------------- | ----------------------------- | ------------------------------------------------- | ------------ |
| Tienda y compra      | Inicio                        | `/`                                               | `home`       |
|                      | Catálogo y búsqueda           | `/catalogo`                                       | `catalog`    |
|                      | Ficha de producto             | `/producto/[slug]`                                | `catalog`    |
|                      | Carrito                       | `/carrito`                                        | `cart`       |
|                      | Datos y facturación           | `/checkout`                                       | `checkout`   |
|                      | Pago Flow                     | `/checkout/pago`                                  | `checkout`   |
|                      | Resultado de pago             | `/checkout/resultado`                             | `checkout`   |
|                      | Servicios                     | `/servicios`                                      | `services`   |
|                      | Solicitar servicio            | `/servicios/solicitar`                            | `services`   |
|                      | Suscripción y baja            | `/suscripcion`                                    | `newsletter` |
|                      | Políticas                     | `/politicas`                                      | `content`    |
| Cuenta del comprador | Iniciar sesión                | `/ingresar`                                       | `auth`       |
|                      | Crear cuenta                  | `/registro`                                       | `auth`       |
|                      | Recuperar acceso              | `/recuperar`                                      | `auth`       |
|                      | Restablecer contraseña        | `/restablecer`                                    | `auth`       |
|                      | Historial de pedidos          | `/cuenta/pedidos`                                 | `orders`     |
|                      | Detalle y seguimiento         | `/cuenta/pedidos/[id]`                            | `orders`     |
| Panel administrativo | Acceso por rol                | `/admin/ingresar`                                 | `auth`       |
|                      | Resumen                       | `/admin`                                          | `dashboard`  |
|                      | Pedidos                       | `/admin/pedidos`                                  | `orders`     |
|                      | Detalle de pedido y reembolso | `/admin/pedidos/[id]`                             | `orders`     |
|                      | Pagos y conciliación          | `/admin/pagos`                                    | `payments`   |
|                      | Productos                     | `/admin/productos`                                | `catalog`    |
|                      | Crear / editar producto       | `/admin/productos/nuevo`, `/admin/productos/[id]` | `catalog`    |
|                      | Categorías                    | `/admin/categorias`                               | `catalog`    |
|                      | Inventario                    | `/admin/inventario`                               | `catalog`    |
|                      | Cupones                       | `/admin/cupones`                                  | `coupons`    |
|                      | Despacho y retiro             | `/admin/despacho`                                 | `shipping`   |
|                      | Banners                       | `/admin/banners`                                  | `content`    |
|                      | Solicitudes                   | `/admin/solicitudes`                              | `services`   |
|                      | Suscriptores                  | `/admin/suscriptores`                             | `newsletter` |
|                      | Correos                       | `/admin/correos`                                  | `emails`     |
|                      | Reportes                      | `/admin/reportes`                                 | `reports`    |
|                      | Usuarios y roles              | `/admin/usuarios`                                 | `users`      |
|                      | Historial de actividad        | `/admin/actividad`                                | `activity`   |

**Estados de pago** (Pagado, Pendiente, Rechazado, En revisión, Vencido) no son pantallas: son `PaymentStatus` en `features/payments/domain`, y los muestra la pantalla Resultado de pago. Mientras tanto se pueden previsualizar con `/checkout/resultado?estado=paid|pending|rejected|in_review|expired`.

## Catálogo (UI-02)

- Todo el estado vive en la URL: `/catalogo?q=&categoria=&edad=&color=&material=&precio_min=&precio_max=&ofertas=1&orden=&pagina=`. Se puede compartir, funciona con atrás/adelante y sin JavaScript.
- `features/catalog/domain/catalog-query.ts`: leer la consulta (`parseCatalogQuery`), armar enlaces (`toQueryString`) y aplicar búsqueda, filtros, orden y paginación (`applyCatalogQuery`). Funciones puras con tests.
- El adaptador `demo-product-catalog.ts` aplica esas reglas sobre los 12 productos de la maqueta. Al existir la API, el adaptador traduce `CatalogQuery` a la consulta del endpoint y el filtrado pasa al servidor.
- Búsquedas y combinaciones de filtros llevan `noindex`; el catálogo y sus categorías sí se indexan.
