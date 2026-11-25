# Manual del panel de Total Kids

Guía para el equipo que atiende la tienda. Los nombres entre «comillas» son los que aparecen en pantalla.

## Lo que hay que saber primero

1. **Solo Flow confirma un pago.** No despaches porque el cliente mandó un comprobante: espera a ver el pedido «Confirmado».
2. **El panel no mueve dinero.** Cancelar un pedido o registrar un reembolso no devuelve plata; la devolución se hace por fuera y aquí se anota.
3. **Casi todo se fabrica a pedido.** Un producto sin stock igual se vende, como «A pedido».
4. **Los pedidos hechos no cambian.** Editar precios, cupones o tarifas solo afecta a compras nuevas.
5. **Los cambios importantes quedan registrados** con responsable y fecha. Usa siempre tu propia cuenta.

## 1. Entrar y salir

- Entra en `/admin` con tu correo y contraseña. La contraseña tiene al menos 12 caracteres; puede ser una frase.
- **Cuenta nueva:** te llega un correo para definir la contraseña. El enlace vence a los 30 minutos.
- **Olvidaste la contraseña o venció el enlace:** usa «¿Olvidaste tu contraseña?» en el ingreso.
- **Demasiados intentos fallidos:** espera 15 minutos.
- La sesión se cierra tras 2 horas sin uso, o a las 12 horas. En un computador compartido, usa «Cerrar sesión».

## 2. Quién puede hacer qué

| Sección                                                                    | Administrador |               Operador               |
| -------------------------------------------------------------------------- | :-----------: | :----------------------------------: |
| Resumen                                                                    |      Sí       | Sí, sin montos del mes ni stock bajo |
| Pedidos: ver y cambiar estado, registrar factura                           |      Sí       |                  Sí                  |
| Pagos: ver y «Consultar en Flow»                                           |      Sí       |                  Sí                  |
| Solicitudes                                                                |      Sí       |                  Sí                  |
| Correos: ver                                                               |      Sí       | Sí, salvo los de contraseñas y bajas |
| Resolver pagos a mano, reembolsos, corregir folio, reenviar correos        |      Sí       |                  No                  |
| Productos, categorías, inventario, cupones, despacho, banners y apariencia |      Sí       |                  No                  |
| Suscriptores, reportes, exportar CSV, usuarios e historial de actividad    |      Sí       |                  No                  |

## 3. Revisión diaria

1. Abre **Resumen**. Si hay «Alertas abiertas» o pagos por conciliar, atiéndelos primero (sección 5).
2. En **Pedidos**, filtra por «Confirmado»: son los que toca preparar.
3. Revisa los que digan «Factura pendiente».
4. En **Solicitudes**, responde las nuevas.
5. En **Correos**, revisa los fallidos o inciertos.

## 4. Pedidos

### Estados

| Estado                         | Qué significa                                     | Qué hacer                             |
| ------------------------------ | ------------------------------------------------- | ------------------------------------- |
| Pendiente de pago              | El comprador aún no paga. El stock está apartado. | Nada: se confirma o vence solo.       |
| Pago en revisión               | No se sabe si hubo cobro, o algo no calza.        | Revisar el pago (sección 5).          |
| Confirmado                     | Pagado y verificado con Flow.                     | Pasar a «En preparación».             |
| En preparación                 | Se está fabricando o embalando.                   | Despachar, o dejar listo para retiro. |
| Despachado / Listo para retiro | Salió del taller, o espera al comprador.          | Marcar «Entregado» al completarse.    |
| Entregado                      | Terminado.                                        | —                                     |
| Cancelado / Vencido            | Cerrado. No admite más cambios de estado.         | —                                     |

### Cambiar el estado

1. Abre el pedido y ve a «Gestionar pedido».
2. Elige el «Nuevo estado» y escribe el «Motivo del cambio» (obligatorio).
3. Si despachas a domicilio, completa «Transportista» y «Código o referencia de seguimiento».
4. «Guardar cambio».

Al despachar, dejar listo para retiro o entregar, el comprador recibe un correo.

### Cancelar

- Con un pago pendiente o en revisión no se puede cancelar: primero resuelve el pago.
- Un pedido despachado no se cancela cambiando el estado; la devolución se gestiona aparte.
- Si el pedido estaba pagado, **devuelve el dinero por fuera** y regístralo como reembolso.
- Marca la reposición de stock solo si las unidades se pueden volver a vender. Se registra una sola vez.

### Boleta y factura

- **Boleta:** el comprobante de Flow la reemplaza. No hay que emitir nada.
- **Factura:** emítela en el SII o en tu sistema, envíala al correo para facturas y registra el folio en el pedido. Corregir un folio pide motivo y solo lo hace el Administrador.

### Reembolsos (Administrador)

1. Haz la devolución por fuera (transferencia o Flow).
2. En el pedido, «Registrar reembolso manual»: monto, fecha y referencia del comprobante.
3. Elige «Procesado» si ya se hizo, o «Solicitado» si está en trámite. Luego márcalo como procesado o fallido.

No se puede registrar más de lo cobrado.

## 5. Pagos y conciliación

El sistema consulta a Flow automáticamente cada pocos minutos. «Consultar en Flow» lo hace en el momento, no mueve dinero y se puede repetir.

| Alerta                   | Qué pasó                                        | Qué hacer                                                           |
| ------------------------ | ----------------------------------------------- | ------------------------------------------------------------------- |
| Flow sin respuesta       | No se pudo confirmar ni descartar el cobro.     | Espera y usa «Consultar en Flow». Si sigue, mira el portal de Flow. |
| Pago tardío sin stock    | Pagó después del plazo y ya no quedan unidades. | Conversa con el comprador: fabricar o devolver.                     |
| Doble cobro              | Flow informa un segundo pago del mismo pedido.  | Verifica en Flow y devuelve el que sobra.                           |
| Datos del pago distintos | El monto o el número no calzan.                 | Compara con Flow antes de decidir. No despaches.                    |

**Resolver a mano (Administrador)**, en el «Resumen de pago» del pedido. Primero verifica en el portal de Flow. Solo aparecen las opciones que corresponden al caso:

- **«Liberar: Flow no cobró»:** solo si comprobaste que no hubo cobro. El pedido vence y se libera el stock.
- **«Reembolso pendiente»:** hubo cobro y se va a devolver. Si era el pago del pedido, este se cancela. El dinero lo devuelves tú.
- **«Confirmar con stock disponible»:** el pago llegó tarde, pero ya hay unidades.

La resolución pide motivo y queda en el historial.

## 6. Productos, categorías e inventario (Administrador)

**Crear un producto**

1. Productos → «Nuevo producto». Completa nombre, categoría, descripción, material y nivel.
2. Agrega las variantes, cada una con SKU único y precio en pesos, sin puntos. El «Precio anterior» es opcional y muestra la oferta.
3. Sube las fotos: JPG, PNG o WebP de hasta 2 MB, cada una con su descripción.
4. Marca «Visible en el catálogo» y guarda.

Para publicarse necesita una categoría activa, precio en cada variante y al menos una foto con descripción. Retirar un producto lo saca de la tienda, pero no borra nada.

**Categorías:** si desactivas una, los productos que la tienen como principal dejan de verse hasta que la reactives o los cambies de categoría.

**Inventario:** Disponible = físico − reservado.

1. Al terminar unidades en el taller, usa «Ajustar stock».
2. Escribe el **total** físico (no la diferencia) y el motivo.

Con al menos 1 disponible la tienda dice «En stock»; con 0, «A pedido»; con 1 a 3 unidades, el panel avisa «Stock bajo». El físico no puede quedar bajo lo reservado.

## 7. Cupones, despacho, banners y apariencia (Administrador)

- **Cupones:** porcentaje o monto fijo, con fechas y máximo de usos. Uno por pedido; no descuenta despacho. Con usos no se elimina ni cambia su descuento: desactívalo y crea otro.
- **Despacho y retiro:** una zona por comuna. Tarifa vacía significa «a coordinar» con el comprador; 0, sin costo. Una comuna sin zona activa queda «a coordinar». Aquí también se configuran el retiro, el despacho gratis y los minutos de reserva.
- **Banners:** título, texto y una página de la tienda que empiece con `/` (por ejemplo, `/catalogo`). Las fechas son opcionales, en hora de Chile. No se eliminan: se desactivan.
- **Apariencia:** una sola plantilla activa a la vez (clásica o de temporada). El cambio se ve de inmediato en la tienda.

## 8. Solicitudes, suscriptores y correos

- **Solicitudes:** Nueva → En gestión → Resuelta. Una resuelta se puede reabrir. La «Nota interna» solo la ve el equipo. Al cliente se le responde por fuera del panel.
- **Suscriptores (Administrador):** si alguien pide no recibir más correos, usa «Registrar baja». El registro se conserva.
- **Correos:** cada uno se reintenta solo hasta 3 veces. Un correo fallido no cambia el pedido. «Incierto» significa que quizás llegó: pregunta al cliente antes de reenviar.

## 9. Reportes, exportaciones, usuarios e historial (Administrador)

- **Reportes:** cobros confirmados del período y reembolsos aparte. Neto = cobros − reembolsos.
- **«Exportar CSV»:** descarga lo que muestran los filtros. Contiene datos personales: no lo compartas fuera del equipo y bórralo cuando no lo uses.
- **Usuarios:** una cuenta por persona. Si alguien deja el equipo, desactiva su cuenta: se cierran sus sesiones al instante. Siempre debe quedar un Administrador activo.
- **Historial de actividad:** quién hizo qué y cuándo, con filtros por área, responsable y fecha.

## 10. Problemas frecuentes

| Problema                          | Qué hacer                                                                                     |
| --------------------------------- | --------------------------------------------------------------------------------------------- |
| «Pagué y dice pendiente»          | Abre el pedido y usa «Consultar en Flow».                                                     |
| No puedo cancelar un pedido       | Tiene un pago sin resolver, o ya fue despachado.                                              |
| No puedo publicar un producto     | Revisa categoría activa, precio en cada variante y foto con descripción.                      |
| El comprador no recibió el correo | Revisa Correos. Pídele mirar spam; puede ver su pedido en `/seguimiento` con número y correo. |
| «Sin permiso para esta sección»   | Es del Administrador.                                                                         |
| «No pudimos completar el cambio»  | Espera unos minutos y reintenta. Si sigue, avisa a soporte con la hora y lo que hacías.       |

Nunca pidas ni guardes datos de tarjetas, ni compartas contraseñas por chat o correo.
