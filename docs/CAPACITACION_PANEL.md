# Capacitación del panel

Pauta para quien dicta la sesión al equipo de Total Kids. Duración estimada: 90 minutos. Material: [manual del panel](MANUAL_PANEL.md).

## Antes de la sesión

- [ ] Staging funcionando con Flow **sandbox** y correos de prueba. Nunca con pagos reales.
- [ ] API **y worker** encendidos: sin el worker no salen los correos ni se concilian los pagos.
- [ ] Una cuenta por persona, con su rol, y la contraseña ya definida.
- [ ] Un producto con stock, uno a pedido y un cupón vigente.
- [ ] Pedidos de prueba: confirmado con boleta, confirmado con factura y uno con pago en revisión.
- [ ] Manual enviado a los asistentes.

## Agenda

| Min   | Tema                                                       | Manual |
| ----- | ---------------------------------------------------------- | ------ |
| 0–10  | Ingreso, roles y las cinco ideas clave                     | 1, 2   |
| 10–20 | Compra de prueba en la tienda y cómo aparece en el panel   | 3      |
| 20–40 | Pedidos: preparar, despachar, retiro, factura y cancelar   | 4      |
| 40–55 | Pagos: alertas, «Consultar en Flow», resolver y reembolsos | 5      |
| 55–70 | Productos, fotos e inventario                              | 6      |
| 70–80 | Cupones, despacho, banners, solicitudes y correos          | 7, 8   |
| 80–90 | Reportes, usuarios, preguntas y cierre                     | 9, 10  |

## Ejercicios

Cada persona los hace con su cuenta. Los marcados (A) son del Administrador.

| N.º | Ejercicio                                                    | Está logrado cuando…                                  | Listo |
| --- | ------------------------------------------------------------ | ----------------------------------------------------- | ----- |
| 1   | Llevar un pedido a «Despachado» con seguimiento              | El correo de despacho aparece en Correos              |       |
| 2   | Dejar un retiro como «Listo para retiro» y luego «Entregado» | Ambos cambios están en el historial                   |       |
| 3   | Registrar el folio de una factura                            | Desaparece «Factura pendiente»                        |       |
| 4   | Consultar un pago pendiente en Flow                          | Explica el resultado sin despachar por un comprobante |       |
| 5   | Pasar una solicitud a «En gestión» con nota                  | El cambio muestra su nombre                           |       |
| 6   | (A) Cancelar un pedido pagado y registrar el reembolso       | Explica que el dinero se devuelve por fuera           |       |
| 7   | (A) Resolver un pago en revisión                             | Verificó primero en Flow y escribió el motivo         |       |
| 8   | (A) Crear y publicar un producto con foto                    | Se ve en la tienda                                    |       |
| 9   | (A) Ingresar 3 unidades terminadas al inventario             | La tienda muestra «En stock»                          |       |
| 10  | (A) Crear un cupón y usarlo en una compra de prueba          | El descuento aparece en el pedido                     |       |
| 11  | (A) Crear un usuario Operador y luego desactivarlo           | La cuenta ya no puede ingresar                        |       |

## Preguntas de control

1. Un cliente manda el comprobante, pero el pedido sigue pendiente. ¿Despachas? _(No: consultar en Flow.)_
2. Cancelaste un pedido pagado. ¿Se devolvió el dinero? _(No: se devuelve por fuera y se registra.)_
3. Flow no responde. ¿El pago fue rechazado? _(No se sabe: queda en revisión.)_
4. Un producto tiene stock 0. ¿Se puede vender? _(Sí, a pedido.)_
5. Alguien deja el equipo. ¿Qué haces? _(Desactivar su cuenta.)_

## Transferencia de accesos

Las claves se entregan por un gestor de contraseñas o en persona; nunca por correo ni en este documento.

| Acceso                                        | Responsable en Total Kids | Entregado | Fecha |
| --------------------------------------------- | ------------------------- | --------- | ----- |
| Administrador del panel (al menos 2 personas) |                           |           |       |
| Portal de Flow                                |                           |           |       |
| Proveedor de correo (Brevo)                   |                           |           |       |
| Dominio y DNS                                 |                           |           |       |
| Servidor y respaldos                          |                           |           |       |
| Repositorio de código                         |                           |           |       |

Al terminar, desactivar las cuentas de prueba y las del equipo de desarrollo que ya no se usen.

## Cierre

| Dato                   | Registro |
| ---------------------- | -------- |
| Fecha y lugar          |          |
| Quién la dictó         |          |
| Asistentes             |          |
| Dudas pendientes       |          |
| Contacto de soporte    |          |
| Conforme de Total Kids |          |
