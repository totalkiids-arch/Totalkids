# Verificación y base de datos

Guía para comprobar que la tienda, el panel y los pagos funcionan, y cómo está armada la base de datos.

## 1. Pruebas automáticas

Desde la raíz del repo:

```bash
docker compose up -d --wait   # PostgreSQL (puerto 5434 del host)
pnpm db:migrate:deploy        # migraciones en totalkids_dev
pnpm db:migrate:test          # migraciones en totalkids_test
pnpm typecheck
pnpm lint                     # ESLint + Prettier
pnpm test                     # tests de la API y de la web
```

- Los tests `apps/api/test/*.db.test.ts` corren contra `totalkids_test` real (dentro de transacciones que se deshacen). Cubren pedidos, pago con Flow simulado, stock, cupones, correos y panel. Sin `TEST_DATABASE_URL` se omiten.
- Los demás tests de la API y todos los de la web no necesitan base de datos.

## 2. Prueba manual de la tienda

```bash
pnpm db:seed   # catálogo importado (88 productos) y configuración inicial; idempotente
pnpm dev       # web + API
```

Recorrido sugerido:

1. **Catálogo y ficha**: búsqueda, filtros, orden y detalle del producto.
2. **Carrito**: agregar, cambiar cantidad (máximo 9 por producto), quitar, aplicar y quitar un cupón.
3. **`/checkout`**: datos del comprador, entrega (retiro o despacho) y documento (boleta o factura).
4. **`/checkout/pago`**: el despacho y el total vienen cotizados por la API (`GET /shipping/quote`); ese total es el que se cobra.
5. **"Continuar con Flow"**: crea el pedido y abre el pago.
   - Sin claves de Flow, el mensaje "El pago no está disponible por ahora" es lo esperado.
   - Con claves del sandbox, ver la sección 3.
6. **`/checkout/resultado?pedido=TK-…`**: muestra el estado real del pedido (pagado, pendiente, rechazado con reintento, en revisión o vencido). El estado nunca se lee de la URL.
7. **`/seguimiento`**: consultar el pedido con número y correo.
8. **`/admin`**: el pedido, su pago y el stock aparecen en el panel.
9. **Formularios**: solicitud de servicio y newsletter (alta y baja desde `/suscripcion/baja`).

## 3. Pagos con Flow sandbox

Flow tiene que poder llamar a la API para confirmar el pago, así que en local hace falta un túnel.

1. En `apps/api/.env`:
   ```
   FLOW_API_KEY=<api key del sandbox>
   FLOW_SECRET_KEY=<secret key del sandbox>
   FLOW_API_BASE=https://sandbox.flow.cl/api
   FLOW_CALLBACK_BASE=https://<tu-túnel>/api/v1
   PUBLIC_SITE_URL=http://localhost:3000
   ```
2. Abre un túnel hacia el puerto de la API, por ejemplo `cloudflared tunnel --url http://localhost:4000` o `ngrok http 4000`.
3. Reinicia la API y compra desde la tienda. Paga en Flow con los medios de prueba que publica Flow para el sandbox.
4. Al volver, Flow llama a `/payments/flow/return` y la API redirige a `/checkout/resultado?pedido=TK-…`. La confirmación (`/payments/flow/confirm`) es la que acredita el pago.

Qué revisar:

| Caso                                 | Resultado esperado                                                                                                      |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Pago aprobado                        | Pedido `confirmed`, pago `paid`, stock descontado, carrito vacío, correos "compra confirmada" y "nueva venta" encolados |
| Pago rechazado                       | Pago `rejected`, reservas liberadas, el resultado ofrece reintentar; el reintento usa el mismo pedido                   |
| Doble clic o volver atrás desde Flow | Mismo pedido y mismo intento de pago (no cobra dos veces)                                                               |
| Volver sin pagar                     | "Estamos verificando tu pago" hasta que Flow confirme                                                                   |

## 4. Ver la base de datos

```bash
cd apps/api && npx prisma studio   # interfaz web para ver y editar tablas
```

O con `psql`, usando la URL de `DATABASE_URL` sin `?schema=public`:

```sql
select number, status, total, cart_id from orders order by number desc limit 5;
select attempt, status, amount, payment_method from payments order by created_at desc limit 5;
select sku, stock_physical, stock_reserved from product_variants order by updated_at desc limit 5;
select event, recipient, status from email_log order by created_at desc limit 5;
```

## 5. Cómo está armada la base de datos

- **Motor**: PostgreSQL 18 en Docker (`docker-compose.yml`), puerto 5434 del host (`POSTGRES_PORT` lo cambia).
- **Bases**: `totalkids_dev` (desarrollo) y `totalkids_test` (tests; la crea `docker/postgres/init/01-create-test-db.sql` en el primer arranque).
- **Esquema**: Prisma, en `apps/api/prisma/schema.prisma`. Los cambios se hacen solo con migraciones SQL en `apps/api/prisma/migrations/` (`pnpm db:migrate` crea una nueva en desarrollo).
- **Datos iniciales**: `apps/api/prisma/seed.ts` (`pnpm db:seed`).

### Tablas por área

| Área                  | Tablas                                                                                                                                                     |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Equipo del panel      | `users`, `sessions`, `auth_tokens`                                                                                                                         |
| Catálogo              | `categories`, `products`, `product_variants` (SKU, precio, stock físico y reservado), `product_images`, `extras`, `product_categories`, `product_extras`   |
| Carrito del invitado  | `carts` (la cookie solo guarda el hash del identificador), `cart_items`, `cart_item_extras`                                                                |
| Promociones y entrega | `coupons`, `coupon_redemptions`, `shipping_zones`, `settings`, `banners`                                                                                   |
| Pedidos               | `orders` (copia del comprador, entrega, documento e importes; `cart_id` del carrito de origen), `order_items`, `order_item_extras`, `order_status_history` |
| Pagos                 | `payments` (un intento en Flow por fila; token solo como hash y URL de pago cifrada), `refund_records`                                                     |
| Stock                 | `stock_reservations` (al crear el pedido), `inventory_movements` (cada cambio de stock)                                                                    |
| Formularios           | `service_requests`, `newsletter_subscribers`                                                                                                               |
| Correos               | `outbox_jobs` (cola del worker), `email_log`, `email_attempts`                                                                                             |
| Control               | `audit_log` (acciones del equipo y del sistema), `idempotency_records` (evita pedidos duplicados)                                                          |

### Una compra, paso a paso

1. **Carrito**: `carts` + `cart_items`. Los precios no se guardan en el carrito; se calculan en cada lectura.
2. **`POST /orders`**: con el carrito bloqueado y revalidado, crea el pedido en `pending_payment` con su copia de datos e importes, reserva el stock (`stock_reservations`, `stock_reserved` sube), registra la clave idempotente y encola el correo "pedido recibido". Si el total no coincide con el que vio el comprador, responde 409 y no crea nada.
3. **`POST /payments/flow/create`**: crea el intento en `payments` (`pending`) y pide la URL de pago a Flow.
4. **Confirmación de Flow** (la API consulta el estado a Flow con sus credenciales; nunca confía en el retorno del navegador):
   - **Pagado**: pago `paid`, pedido `confirmed`, reservas consumidas (`stock_physical` baja), cupón consumido, correos encolados y el carrito de origen eliminado.
   - **Rechazado**: pago `rejected`, reservas liberadas, correo de pago rechazado. Un reintento vuelve a reservar.
   - **Monto o datos distintos, pago tardío sin stock o doble cobro**: queda en revisión (`in_review`) para el panel.

## Pendientes conocidos

- No hay todavía un proceso que venza los pedidos `pending_payment` pasado `payment_due_at`: sus reservas quedan tomadas hasta que se resuelvan a mano.
- La integración con Flow solo se probó con un Flow simulado; falta probarla con las claves del sandbox.
