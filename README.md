# Total Kids

Tienda online de mobiliario infantil. Monorepo con pnpm workspaces: sitio público y panel admin en Next.js, API en Express + Prisma sobre PostgreSQL.

> Estado: solo la base técnica. Todavía no hay modelos de negocio, pantallas ni integraciones.

## Estructura

```
apps/
  web/              Next.js 16 (App Router) + React 19 + Tailwind CSS 4 (ver apps/web/ARCHITECTURE.md)
  api/              Express 5 + Prisma 7 (rutas en /api/v1, docs en /api/docs)
packages/
  config/           ESLint, Prettier y tsconfig compartidos
docker/postgres/    Script de init (crea totalkids_test)
docker-compose.yml  PostgreSQL 18 local
```

El navegador **nunca** llama directo a la API. Hace las llamadas a rutas propias de Next.js (`apps/web/src/app/api/*`), y esas rutas llaman a la API desde el servidor usando `API_URL`:

```
Navegador ──> Next.js /api/health ──> Express /api/v1/health ──> PostgreSQL
```

## Requisitos previos

- **Node.js 26 LTS** (ver `.nvmrc`). Con nvm: `nvm install && nvm use`.
- **pnpm 12.17.0**. Node 26 ya no incluye corepack, así que hay que instalarlo aparte:
  ```bash
  npm install -g pnpm@12.17.0
  # sin permisos de root:
  npm install -g --prefix ~/.local pnpm@12.17.0   # y agregar ~/.local/bin al PATH
  ```
- **Docker** con Docker Compose v2.

## Puesta en marcha desde cero

```bash
# 1. Variables de entorno (los valores por defecto sirven para desarrollo local)
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local

# 2. Base de datos (Postgres en localhost:5434, bases totalkids_dev y totalkids_test)
docker compose up -d --wait

# 3. Dependencias (también genera el cliente Prisma)
pnpm install

# 4. Migraciones (desarrollo y tests)
pnpm db:migrate
pnpm db:migrate:test

# 5. Levantar web + API
pnpm dev
```

- Web: http://localhost:3000 (tienda) y http://localhost:3000/admin (panel; el Resumen muestra el estado de la API)
- API health: http://localhost:4000/api/v1/health → `{ "status": "ok" }`
- Swagger UI: http://localhost:4000/api/docs (spec JSON en `/api/docs/openapi.json`)

## Scripts de la raíz

| Script                   | Qué hace                                                           |
| ------------------------ | ------------------------------------------------------------------ |
| `pnpm dev`               | Levanta web y API en paralelo (Next dev + `tsx watch`)             |
| `pnpm build`             | Build de producción de todas las apps                              |
| `pnpm start`             | Ejecuta los builds de producción                                   |
| `pnpm lint`              | ESLint en cada app + `prettier --check`                            |
| `pnpm format`            | Formatea todo con Prettier                                         |
| `pnpm typecheck`         | `tsc --noEmit` en cada app                                         |
| `pnpm test`              | Vitest en cada app (incluye un test contra `totalkids_test`)       |
| `pnpm db:migrate`        | `prisma migrate dev` sobre `totalkids_dev` (crea y aplica cambios) |
| `pnpm db:migrate:deploy` | Aplica las migraciones existentes sin crear nuevas (CI/producción) |
| `pnpm db:migrate:test`   | Aplica las migraciones sobre `totalkids_test`                      |

Para crear una migración nueva: `pnpm db:migrate --name <descripcion>`.

## Convenciones de la API

- Todas las rutas cuelgan de `/api/v1`.
- Formato estándar de error:
  ```json
  { "code": "NOT_FOUND", "message": "…", "details": null, "requestId": "…" }
  ```
- Cada respuesta incluye `X-Request-Id`. Si Next.js envía uno, la API lo reutiliza para poder correlacionar logs.
- La documentación vive en `apps/api/openapi.yaml` (OpenAPI 3.1). Cada endpoint nuevo debe documentarse ahí.

## Variables de entorno

Cada app tiene un `.env.example` con un comentario por variable. Los archivos `.env*` reales están en `.gitignore`.

- Las claves de **Flow** y **Brevo** van **solo** en `apps/api/.env`.
- `apps/web` solo necesita `API_URL`, que se lee en el servidor. No uses el prefijo `NEXT_PUBLIC_` para nada que sea secreto.

## Notas técnicas

- **Puerto 5434**: Postgres de Docker se expone en 5434 para no chocar con un Postgres local en 5432. Se puede cambiar con `POSTGRES_PORT`.
- **`totalkids_test`** se crea con `docker/postgres/init/01-create-test-db.sql`. Ese script solo corre cuando el volumen está vacío. Para recrearla: `docker compose down -v && docker compose up -d --wait`.
- **Scripts de instalación**: pnpm bloquea los scripts postinstall de las dependencias. Los permitidos (`prisma`, `@prisma/engines`, `argon2`, `esbuild`) están en `allowBuilds` dentro de `pnpm-workspace.yaml`.
- **Rate limiting**: la API recibe todo el tráfico a través de Next.js. `TRUST_PROXY` hace que `req.ip` sea la IP real del cliente (usando `X-Forwarded-For`), y eso es requisito para que `express-rate-limit` funcione cuando se configure.
