# Contrato de la API · Alcipizza v3

Fuente única de verdad entre `php-api/` (PHP + MySQL/MariaDB) y `client/` (React).
Este archivo es el contrato entre la API y el frontend: toda ruta nueva o cambiada se documenta aquí antes de usarla.

## Convenciones

- JSON en **camelCase**. Dinero en pesos colombianos como **número entero** (`28000`). Fechas en ISO 8601.
- Errores: `{ "error": "mensaje para mostrar", "code"?: "CODIGO", "detalles"?: [...] }`.
  - `400` validación (`code: "VALIDACION"`, `detalles` = issues de zod; otros 400 de reglas de negocio no traen `code`) · `401` sin sesión o sesión vencida · `403` sin permiso (`code: "PROHIBIDO"`), CSRF inválido (`code: "CSRF"`), servicio suspendido (`code: "SUSPENDIDO"`), cambio de clave pendiente (`code: "CAMBIAR_CLAVE"`) o local cerrado (`code: "CERRADO"`) · `404` · `409` conflicto · `413` cuerpo > 5 MB · `423` usuario bloqueado (`code: "BLOQUEADO"`) · `429` demasiados intentos (`code: "LIMITE"`) · `500` `"Error interno"`.
  - Mostrar siempre `error` al usuario; decidir el flujo con `status` + `code`.
- **Sesión**: cookie `alcipizza.sid` (httpOnly, SameSite=Strict, Secure en producción), guardada en la tabla `sessions`. Dura 12 h; se cierra tras 30 min sin uso.
- **CSRF**: todo `POST/PUT/PATCH/DELETE` lleva la cabecera `X-CSRF-Token` obtenida de `GET /api/auth/csrf`. Incluye `POST /api/auth/login` y `POST /api/pedidos` públicos. El token vive en la sesión: **cambia al iniciar sesión** (pedir de nuevo `GET /csrf` tras login y tras logout) y se pierde si la sesión anónima vence (30 min). Si una petición responde `403 CSRF`, pedir un token nuevo y reintentar **una** vez.
- Roles: `cocina` (administración), `mesera`, `dev` (desarrollador). El cliente web no inicia sesión.
- Actualización: por ahora las pantallas consultan cada 5 s (la fase 6 añade tiempo real).
- **Rangos de fechas** (`?desde&hasta` en `/api/pedidos`, `/api/compras`, `/api/reportes/ventas`): formato `AAAA-MM-DD`, interpretado como día de Bogotá; `hasta` es **inclusivo** (todo ese día). `?desde=2026-11-01&hasta=2026-11-30` = noviembre completo. También se acepta un instante ISO 8601 completo (`2026-11-23T05:00:00Z`); en ese caso `hasta` es exclusivo. Fecha inválida → `400 VALIDACION`.
- **Archivo (nada se borra)**: `DELETE` marca `eliminado_en` y oculta la fila; `POST /:id/restaurar` la devuelve. Las listas aceptan `?eliminados=1` para ver **solo** eliminados (`0`/ausente = excluirlos; otro valor → `400`). Los reportes, facturas, pedidos, compras y bitácora aceptan `?archivados=activos` (por defecto), `incluir` o `solo` (otro valor → `400`). Una fila archivada sigue existiendo para la historia, pero no cuenta en los reportes normales.

## Tipos

```ts
Usuario   = { id, usuario, nombre, rol: 'dev'|'cocina'|'mesera', activo, debeCambiarClave }
Variante  = { id, nombre, precio, precioPromo: number|null /* solo en /api/menu: precio con la mejor promocion de plato o categoria */ } // admin además trae multiplicador y no trae precioPromo
Extra     = { id, nombre, precio, grupo: string|null }            // mismo grupo = excluyentes
Promocion = { id, nombre, tipo: 'porcentaje'|'monto', alcance: 'plato'|'categoria'|'total', platoId: number|null,
              categoria: string|null /* nombre */, valor, montoMinimo: number|null /* solo alcance total */,
              inicio, fin /* 'AAAA-MM-DD' */, dias: number[]|null /* 0 lunes..6 domingo; null = todos */,
              horaDesde, horaHasta /* 'HH:MM' o null; si horaDesde > horaHasta cruza la medianoche */,
              activa, vigente /* calculado ahora, hora de Bogota */, etiqueta /* '10% de descuento', '$2.000 de descuento', '5% de descuento desde $50.000' */ }
Plato     = { id, nombre, emoji, imagenUrl, categoria, promocion: {id, nombre, etiqueta}|null, variantes: Variante[],
              ingredientes: string[], salsas: string[], extras: Extra[] }
ItemPedido= { id, platoId, varianteId: number|null, nombre, emoji, variante, precioUnitario, nota,
              extras: {id, nombre, precio}[], salsas: string[], sin: string[] }
              // precioUnitario = precio de la variante + suma de sus extras (precio completo de la línea; cantidad 1)
              // varianteId es null solo si esa variante se borró después
              // para editar: items.map(i => ({ platoId, varianteId, extras: i.extras.map(e => e.id), salsas, sin, nota }))
Pedido    = { id, creadoEn, origen: 'web'|'mesera', mesera: {id, nombre}|null, destino, cliente,
              direccion, telefono, celular: string|null /* 10 digitos */,
              subtotal /* suma de items antes de descuentos */, descuentoPromo, promocion: {id, nombre}|null,
              puntosCanjeados, descuentoPuntos, puntosGanados, editadoEn: string|null, canceladoPorCliente: boolean,
              total /* = subtotal - descuentoPromo - descuentoPuntos */, estado: 'nuevo'|'preparando'|'listo'|'entregado'|'cancelado',
              pagoEstado: 'pendiente'|'pagado', metodoPago: {codigo, nombre}|null, pagadoEn,
              cobradoPor: {id, nombre}|null, items: ItemPedido[] }
Insumo    = { id, nombre, tipo: 'insumo'|'salsa', unidad, stock, stockReferencia, costo, surtidorId: number|null,
              ultimaCompra: { fecha, cantidad, unidad, usuario /* nombre de quien la registró */ } | null }
Surtidor  = { id, nombre, empresa, correo, telefono }
Compra    = { id, fecha, insumo: {id, nombre}, cantidad, unidad, costo, surtidor: {id, nombre}|null, registradoPor: {id, nombre}|null }
Config    = { n, w1, w2, w3, w4, tel, mesas, h: ([abre, cierra]|null)[7] /* lunes..domingo */, logo, bg,
              sonido?: 'campana'|'timbre'|'pulso'|'arpegio'|'alarma' /* sin valor = 'campana' */,
              domiciliosActivos?: boolean /* sin valor = true */, ...ajustes de puntos (ver Puntos) }
MetodoPago= { codigo, nombre, numero, activo, qrUrl: string|null /* URL https o data URL png/jpeg/webp/gif, máx. 700.000 caracteres */ }
```

Los DTO solo añaden `eliminadoEn` y `archivadoEn` (ISO) cuando la fila está eliminada o archivada; si no, no aparecen. El cliente debe tratarlos como opcionales.

## Autenticación — `/api/auth`

| Método y ruta | Quién | Cuerpo | Respuesta |
|---|---|---|---|
| `GET /csrf` | todos | — | `{ csrfToken }` |
| `POST /login` | todos | `{ usuario, clave }` | `200 { user: Usuario }` · `401 "Usuario o contraseña incorrectos"` (mismo mensaje si el usuario no existe) · `423 BLOQUEADO` tras 5 fallos (bloqueo 15 min) · `429 LIMITE` límite por IP (20 intentos fallidos / 15 min) · `403 SUSPENDIDO` si la suscripción está inactiva y el rol no es `dev` |
| `POST /logout` | con sesión | — | `{ ok: true }` |
| `GET /me` | con sesión | — | `{ user: Usuario }` · `401` |
| `PUT /perfil` | con sesión (cualquier rol) | `{ usuario?, nombre?, actual }` | `{ user: Usuario }`. Cambia el propio usuario (se guarda en minúsculas) o nombre; la sesión sigue. `401` si `actual` no es correcta · `409` usuario repetido · `400 VALIDACION` |
| `POST /cambiar-clave` | con sesión | `{ actual, nueva }` (nueva ≥ 8, distinta de la actual) | `{ ok: true }` y `debeCambiarClave=false`; cierra las demás sesiones de ese usuario (la actual sigue). Errores: `400 VALIDACION` si `nueva` < 8 o igual a la actual · `401 { error: "La contraseña actual no es correcta" }` si `actual` no coincide (la sesión **no** se cierra; no tratar este 401 como sesión vencida) |

Mientras `debeCambiarClave` sea `true`, el resto de la API para ese usuario responde `403 { code: "CAMBIAR_CLAVE" }` (salvo `/me`, `/logout`, `/cambiar-clave`, `/csrf`).

## Público (sin sesión)

| Método y ruta | Respuesta |
|---|---|
| `GET /api/public/config` | `{ config: Config, pagos: MetodoPago[] /* solo activos */, abierto: boolean, suscripcionActiva: boolean, promociones: {id, nombre, etiqueta, montoMinimo}[] /* vigentes de alcance total, para mostrar el banner */, puntos: { activo, porMil, puntosCanje, descuentoCanje } }` |
| `GET /api/menu` | `Plato[]` (solo activos, ordenados por categoría y orden). `ingredientes` y `salsas` son nombres (los mismos que van en `sin`/`salsas` del pedido) |
| `POST /api/pedidos` | ver **Pedidos** |
| `POST /api/pedidos/cotizar` | mismo cuerpo que `POST /api/pedidos` (basta `items`; `canjearPuntos > 0` → `403 PUNTOS_SOLO_CAJA`) → `{ subtotal, descuentoPromo, promocion: {id, nombre}|null, puntosCanjeados, descuentoPuntos, total }`. No guarda nada; calcula igual que el pedido. Sin sesión: 120 por minuto por IP (`429`). |
| `POST /api/pedidos/:id/cancelar` | cuerpo `{ token }` (el de la tirilla). El cliente cancela su pedido: solo web, solo si `estado='nuevo'`. Devuelve el `Pedido` con `estado='cancelado'` y `canceladoPorCliente=true`. Token malo, ausente, de otro pedido o pedido del personal: `404`. Ya no está en `nuevo`: `409 NO_EDITABLE`. Repone inventario si estaba descontado y ajusta puntos. |
| `PUT /api/pedidos/:id/cliente` | cuerpo = el de `POST /api/pedidos` (web, se reenvían todos los campos) + `token`. El cliente edita su pedido: solo si `estado='nuevo'` y `pagoEstado='pendiente'` (`409 NO_EDITABLE` si no). Reemplaza los ítems, recalcula promoción y puntos, conserva el mismo token y marca `editadoEn`. `canjearPuntos > 0` → `403 PUNTOS_SOLO_CAJA`; si no viene o es 0, conserva los puntos que ya había canjeado. Mismas reglas de validación, domicilios apagados (`409 DOMICILIOS_APAGADOS`) y token (`404`). |
| `GET /api/public/puntos/:celular` | `{ celular, activo, saldo, puntosCanje, descuentoCanje }`. Solo devuelve el saldo del celular consultado (nunca nombre ni movimientos); celular no válido `400`; sin puntos `saldo: 0`. Límite de consultas por IP (`429`). |
| `GET /api/pedidos/:id?token=...` | `Pedido` si el token es el del pedido; si no, `404`. Sin `token`, funciona para una sesión de cocina o mesera. |

## Pedidos

`POST /api/pedidos` — cliente web (sin sesión) o mesera:
```json
{ "destino": "En el local" | "Domicilio" | "Recoger en local" | "Mesa 3",
  "mesa": 3, "cliente": "Juan", "direccion": "Cra 1 #2-3", "telefono": "3001234567",
  "metodoPago": "nq",
  "items": [ { "platoId": 1, "varianteId": 2, "extras": [4], "salsas": ["Ketchup"], "sin": ["Tomate"], "nota": "bien asada" } ] }
```
- El servidor **recalcula** precios (variante + extras) e ignora cualquier precio del cliente. Valida que variante, extras, salsas e ingredientes pertenezcan al plato.
- `precioUnitario` de cada ítem = precio de la variante + extras elegidos; `total` = suma de los `precioUnitario`.
- Web: `cliente` es **obligatorio**; `metodoPago` debe ser un método **activo**. `destino` en `En el local` (exige `mesa` entre 1 y `config.mesas`), `Domicilio` (exige `direccion` y `telefono`) o `Recoger en local` (exige `telefono`). Se guarda como `"En el local · Mesa 3"` cuando aplica.
- Mesera (y cocina): `destino` libre (`"Mesa 3"`, `"Domicilio"`, `"Barra"`…), `origen='mesera'`, se ignora `metodoPago` (se fija al cobrar). `cliente`, `direccion` y `telefono` son opcionales. `mesa` es opcional; si llega, o si `destino` es `"Mesa N"`, se valida que esté entre 1 y `config.mesas` (`400` si no) y que ambos coincidan; con `destino: "Mesa"` + `mesa: 2` se guarda `"Mesa 2"`. `dev` no crea pedidos (`403`).
- `celular` (opcional, web y mesera): se normaliza (acepta `+57`, espacios y guiones) a 10 digitos que empiezan por 3; si no es valido `400`. Identifica al cliente en los puntos. `canjearPuntos` (opcional, entero >= 0, multiplo de `config.puntosCanje`): **solo el personal** (mesera o cocina) puede enviarlo > 0 al crear o editar un pedido; en un pedido web, en `PUT /api/pedidos/:id/cliente` y en `POST /api/pedidos/cotizar` responde `403 PUNTOS_SOLO_CAJA` (el cliente canjea en caja, vía `POST /api/pedidos/:id/pago`). Exige `celular`, programa activo y saldo suficiente. Errores de canje con `code`: `PUNTOS_INACTIVOS` 400, `PUNTOS_INVALIDOS` 400 (no es multiplo), `PUNTOS_INSUFICIENTES` 409, `PUNTOS_EXCEDEN` 400 (el descuento supera el total).
- Descuentos (todo lo calcula el servidor, el cliente no envia montos): `subtotal` = suma de `precioUnitario`; se aplica **una sola promocion** vigente (la que mas rebaja, no se acumulan; por plato/categoria el porcentaje va sobre los ítems que coinciden y el monto en pesos es **por unidad**; al total solo si `subtotal >= montoMinimo`); luego el canje de puntos (`puntosCanjeados / puntosCanje * descuentoCanje`) sobre el total ya rebajado. Ningun descuento deja el total en negativo. Valen para web y mesera.
- Respuesta `201 { pedido: Pedido, token?: string }`. `token` (solo web) es el código privado para ver la tirilla: `/tirilla/:id?token=...`. En la base se guarda su SHA-256.
- Web con suscripción inactiva: `403 SUSPENDIDO`; local cerrado según `config.h` (hora de Bogotá): `403 CERRADO`. Límite: 10 pedidos web por IP cada 10 min (`429 LIMITE`; no aplica con sesión).

| Método y ruta | Quién | Cuerpo / query | Respuesta |
|---|---|---|---|
| `GET /api/pedidos` | cocina, mesera | `?desde=ISO&hasta=ISO&estado=&archivados=` (por defecto: hoy) | `Pedido[]` (más recientes primero). La mesera ve todos los del día. `archivados=incluir\|solo` controla los pedidos archivados; por defecto no salen. La tirilla con token de un pedido archivado sigue funcionando. |
| `PUT /api/pedidos/:id` | mesera (solo los suyos, si no `403`), cocina (cualquiera, también web) | igual que el POST con las reglas de mesera | `Pedido` · solo si `estado='nuevo'`; si no, `409`. Conserva `origen` y el token de la tirilla. |
| `PATCH /api/pedidos/:id/estado` | cocina: cualquier transición; mesera: `nuevo→cancelado` (solo los suyos) y `listo→entregado` (cualquiera); otra → `403 PROHIBIDO` | `{ estado }` | `Pedido`. Al pasar a `preparando`, `listo` o `entregado` **descuenta el inventario** una sola vez por pedido. Cancelar o volver a `nuevo` **no** devuelve inventario. `409` si el estado cambió mientras tanto. Al pasar a `cancelado` se devuelven los puntos canjeados y se quitan los ganados (una vez por cancelacion). |
| `POST /api/pedidos/:id/pago` | mesera, cocina | `{ metodoPago, celular?, canjearPuntos? }` (`metodoPago` = código existente) | `Pedido` con `pagoEstado='pagado'`, `metodoPago`, `pagadoEn`, `cobradoPor`, `celular`, `puntosCanjeados`, `descuentoPuntos` y el `total` final · `400` método no válido o `celular` inválido · `409` si ya estaba pagado. Es el único lugar donde el cliente canjea puntos (en caja). Todo ocurre en una sola transacción: guarda el `celular`, valida y descuenta los puntos (`canjearPuntos` múltiplo de `puntosCanje`; reemplaza cualquier canje previo del pedido), recalcula `descuentoPuntos` y `total` (nunca menor que 0, después de la promoción), marca el pago y suma `floor(total final / 1000) * puntosPorMil` puntos (`puntosGanados`) si hay `celular`, el programa está activo y el pedido no está cancelado. Si algo falla no se mueve ningún punto. Errores de canje: `PUNTOS_INACTIVOS` 400, `PUNTOS_INVALIDOS` 400, `PUNTOS_INSUFICIENTES` 409, `PUNTOS_EXCEDEN` 400. |

Descuento de inventario (igual que `descontar()` en la app original): por cada ítem, los ingredientes del plato que no están en `sin` × `multiplicador` de la variante, convertidos a la unidad del insumo (g↔kg↔lb, ml↔L, und); 15 g por cada salsa; y la cantidad de cada extra. El stock nunca queda negativo.

## Administración (rol `cocina`)

| Recurso | Rutas |
|---|---|
| Platos | `GET /api/admin/platos?eliminados=1` → `PlatoAdmin[]` (incluye inactivos; por defecto oculta eliminados) · `POST` (`201`) · `PUT /:id` (`404` si está eliminado) · `DELETE /:id` → `{ ok: true }` (marca `eliminado_en`, conserva `activo` y el historial de pedidos) · `POST /:id/restaurar` → `PlatoAdmin` (`404` si no estaba eliminado) |
| Extras | `GET /api/admin/extras?eliminados=1` · `POST` (`201`; si el nombre coincide con uno eliminado lo restaura y actualiza, mismo id) · `PUT /:id` (parcial, `404` si eliminado) · `DELETE /:id` → `{ ok: true }` (soft delete) · `POST /:id/restaurar` → `Extra` — cuerpo y respuesta `{ id, nombre, insumoId, cantidad, unidad, precio, grupo, eliminadoEn? }` |
| Insumos | `GET /api/insumos?eliminados=1` · `POST` (`201`; si el nombre coincide con uno eliminado lo restaura y actualiza, mismo id) · `PUT /:id` (parcial, `404` si eliminado) · `DELETE /:id?forzar=1` → `{ ok: true }` (siempre soft delete: oculta de listas y selectores, no admite compras nuevas ni recetas; conserva compras e historial). Si lo usan platos y no viene `?forzar=1` → `409 { error: "No se puede borrar: lo usan los platos A, B", code: "EN_USO", detalles: [{ platoId, plato }] }`; con `forzar=1` se quitan esos ingredientes de las recetas y se deja bitácora · `POST /:id/restaurar` → `Insumo` · `409` si el nombre existe activo · unidades `und`, `g`, `kg`, `lb`, `L`, `ml` · cada insumo trae `ultimaCompra` (columnas "Ingresó / Registró") |
| Surtidores | `GET /api/surtidores?eliminados=1` · `POST` (`201`; reutiliza por nombre si estaba eliminado) · `PUT /:id` (`404` si eliminado) · `DELETE /:id` → `{ ok: true }` (soft delete) · `POST /:id/restaurar` → `Surtidor` |
| Compras | `GET /api/compras?desde&hasta&eliminados=&archivados=` → `Compra[]` (más recientes primero, máx. 1000; por defecto excluye anuladas y archivadas) · `POST /api/compras { insumoId? , nuevoInsumo?: {nombre, tipo, unidad?}, cantidad > 0, unidad, costo, surtidorId? }` (exactamente uno de `insumoId`/`nuevoInsumo`) → `201 Compra`. Suma la cantidad al stock y al stock de referencia (con conversión g↔kg↔lb), y actualiza `costo` y `surtidorId` del insumo. `400` si la unidad no es compatible (p. ej. `und` con `kg`, o `L` con `g`). Unidades: masa `g`/`kg`/`lb` y volumen `ml`/`L` se convierten dentro de su grupo (1 kg = 1000 g, 1 lb = 453,592 g, 1 L = 1000 ml); `und` solo con `und`. Si `nuevoInsumo.nombre` existe activo lo usa; si estaba eliminado lo restaura. · `DELETE /api/compras/:id` (cocina) → `{ ok: true }`: anula (soft delete) y resta del stock y del stock de referencia lo que sumó (sin bajar de 0); deja bitácora; `404` si ya estaba anulada. · `POST /:id/restaurar` → `Compra`: solo funciona con compras anuladas: vuelve a sumar stock y al stock de referencia; `404` si la compra no está anulada (una compra archivada no se restaura: el archivo no se deshace). |
| Ajustes | `GET /api/config` · `PUT /api/config` (Config parcial; responde la Config completa). Reglas: `mesas` entero 0..200, `h` exactamente 7 entradas (lunes..domingo) de `[abre, cierra]` con horas 0..24 o `null`, `logo`/`bg` texto ≤ 3 MB (URL o data URL); claves desconocidas → `400` · `sonido` (uno de los 5 ids; el navegador lo sintetiza) y `domiciliosActivos` (boolean) se guardan aquí y también salen en `GET /api/public/config` · con `domiciliosActivos=false`, `POST /api/pedidos` **web** con `destino: "Domicilio"` responde `409 { code: "DOMICILIOS_APAGADOS" }` (mesera y cocina no se ven afectadas; el cliente debe ocultar la opción) · `GET /api/metodos-pago?eliminados=1` (todos los activos, también inactivos; por defecto oculta eliminados) · `POST /api/metodos-pago { nombre, numero?, activo? = true, qrUrl? }` → `201 MetodoPago` (el `codigo` lo genera el servidor a partir del nombre; si el nombre coincide con uno eliminado lo restaura; `409` si existe activo) · `PUT /api/metodos-pago/:codigo { nombre?, numero?, activo?, qrUrl? }` (`qrUrl: null` quita la imagen; tipo o tamaño no válido → `400 VALIDACION`; el cliente ve el QR en `GET /api/public/config` → `pagos[].qrUrl`) → `MetodoPago` (`404` si eliminado) · `DELETE /api/metodos-pago/:codigo` → `{ ok: true }` (soft delete; **conserva `activo`** y el historial de pedidos) · `POST /:codigo/restaurar` → `MetodoPago` (`404` si no estaba eliminado) |
| Reportes | `GET /api/reportes/ventas?desde=AAAA-MM-DD&hasta=AAAA-MM-DD&archivados=` (por defecto: hoy; `hasta` inclusivo) → `{ total, pedidos, cobrado, porCobrar, comprasWeb, porPlato: [{nombre, cantidad, total}], porMetodo: [{metodo, total}], porDia: [{fecha: 'AAAA-MM-DD', total}], compras }`. Solo pedidos no cancelados. `archivados=incluir\|solo` incluye lo archivado; por defecto se excluye. `cobrado` = total de los pagados; `porCobrar` = `total - cobrado`; `comprasWeb` = número de pedidos web; `metodo: 'Sin método'` si no tiene método; `compras` = suma de costos de compras **no anuladas** del rango (también respeta `archivados`). Ticket promedio = `total / pedidos` (lo calcula el cliente). |
| Facturas | `GET /api/facturas?desde&hasta&q&pagina=1&porPagina=20&archivados=` (cocina) → `{ total, pagina, porPagina, paginas, facturas: Pedido[] }`. Una factura (tirilla) por pedido, **incluidos cancelados**, más recientes primero; cada una trae todo el detalle para pintar el recibo. Por defecto no salen las archivadas; `archivados=incluir\|solo` las controla. `desde`/`hasta` como en el resto de rangos (sin fechas: todo el historial). `q` busca por número de pedido (`12` o `#12`), cliente, teléfono, celular o destino. `pagina` ≥ 1, `porPagina` 1..100; valores fuera de rango → `400 VALIDACION`. |
| Reiniciar reportes | `POST /api/admin/reiniciar-reportes { confirmar: "BORRAR" }` (solo cocina) → `{ ok: true, pedidos, compras, bitacora }` (cantidades **archivadas**). Archiva los pedidos cerrados (`cancelado` o `entregado` y `pagado`) que no estaban archivados, todas las compras y toda la bitácora pendiente; **no borra nada** (ítems y detalles siguen en la base) ni toca menú, insumos, stock, usuarios, ajustes, promociones ni puntos. Los pedidos en curso y los entregados sin pagar quedan intactos. Después deja una sola fila en bitácora sin archivar: "Reinició los reportes". Sin `confirmar` exacto → `400 VALIDACION`. |
| Promociones | `GET /api/promociones?eliminados=1` → `Promocion[]` · `POST` (`201`) · `PUT /:id` (parcial, `404` si eliminada) · `DELETE /:id` → `{ ok: true }` (soft delete; deja de aplicar y sale de `/api/public/config`) · `POST /:id/restaurar` → `Promocion` (`404` si no estaba eliminada). Cuerpo: `{ nombre (1..80), tipo, alcance, platoId (alcance plato, no eliminado), categoria (nombre, alcance categoria), valor (> 0; porcentaje <= 100), montoMinimo? (solo alcance total), inicio, fin (inicio <= fin), dias?: number[]|null, horaDesde?, horaHasta? (van juntas), activa? = true }`. `400 VALIDACION` si algo no cumple; `404` si no existe. Una promocion solo aplica si `vigente` (activa, dentro de fechas, dia y franja horaria en hora de Bogota). |
| Puntos | `GET /api/puntos/clientes?q=` → `[{ celular, nombre, saldo, actualizadoEn }]` (mayor saldo primero, max. 200) · `GET /api/puntos/clientes/:celular/movimientos` → `{ celular, nombre, saldo, movimientos: [{ id, pedidoId, tipo: 'ganado'|'canjeado'|'devuelto'|'revertido', puntos /* con signo */, creadoEn }] }` (`404` si no hay cliente). Solo cocina. |
| Bitácora | `GET /api/bitacora?limit=200&archivados=` (1..1000) → `[{ id, fecha, usuario, nombre, accion, ip, archivadoEn? }]` más recientes primero (cocina y dev). Por defecto oculta lo archivado por "Reiniciar reportes"; `archivados=incluir\|solo` lo controla. El cliente web aparece como `usuario: 'cliente'`. |

```ts
PlatoAdmin = { id, nombre, emoji, imagenUrl, categoria, activo, orden,
               variantes: {id, nombre, precio, multiplicador}[],
               ingredientes: {insumoId, nombre, cantidad, unidad|null}[],
               salsas: {insumoId, nombre}[], extras: {id, nombre, precio, grupo}[] }
// Cuerpo de POST/PUT (PUT reemplaza todo el plato):
PlatoBody  = { nombre, emoji?, imagenUrl?, categoria /* se crea si no existe */, activo? = true, orden?,
               variantes: {id? /* para conservarla */, nombre, precio, multiplicador? = 1}[] /* ≥ 1 */,
               ingredientes?: {insumoId, cantidad, unidad?}[],
               salsas?: number[] /* ids de insumos tipo 'salsa' */, extras?: number[] /* ids de extras */ }
```

### Puntos de fidelidad (ajustes en `PUT /api/config`)

`puntosActivos` (boolean, por defecto `false`), `puntosPorMil` (entero 0..1000, puntos por cada $1.000 cobrados, por defecto 1), `puntosCanje` (entero >= 1, puntos que vale un canje, por defecto 100) y `descuentoCanje` (entero >= 0, pesos que descuenta cada canje, por defecto 1.000). Los puntos se suman al **confirmar el pago**, se descuentan del saldo al **crear** el pedido con `canjearPuntos` y se reversan al cancelar. El saldo es por `celular`, sin cuenta ni clave: quien conoce el celular puede consultarlo y canjearlo.

## Usuarios y suscripción

| Método y ruta | Quién | Notas |
|---|---|---|
| `GET /api/usuarios?eliminados=1` | cocina (solo meseras), dev (todos) | `Usuario[]` (por defecto oculta eliminados; `?eliminados=1` muestra solo esos) |
| `POST /api/usuarios` | cocina (crea meseras), dev (crea cocina/mesera) | `{ usuario, nombre, clave, rol }` · clave ≥ 8 · el usuario se guarda en minúsculas · `409` si ya existe (aunque esté eliminado) · queda con `debeCambiarClave=true` |
| `PUT /api/usuarios/:id` | igual que arriba (dev también se edita a sí mismo) | `{ nombre?, usuario?, clave?, activo? }` → `Usuario`. Cambiar la clave de otro deja `debeCambiarClave=true`; cambiar la clave o desactivar cierra las sesiones de ese usuario. `403 PROHIBIDO` sobre un rol que no gestiona · `404` · `409` usuario repetido |
| `DELETE /api/usuarios/:id` | igual que arriba | `{ ok: true }` (soft delete: cierra sesiones, oculta de listas y bloquea el login; no se puede borrar a sí mismo → `400`) · `POST /:id/restaurar` → `Usuario` (`404` si no estaba eliminado; el usuario queda con `debeCambiarClave=true` si no la había cambiado) |
| `GET /api/suscripcion` | dev | `{ activa, hasta: 'AAAA-MM-DD' }` |
| `PUT /api/suscripcion` | dev | `{ activa?, hasta?: 'AAAA-MM-DD' }` → `{ activa, hasta }` (`400` si la fecha no es válida). Se considera inactiva si `activa=false` o `hasta` ya pasó (hora de Bogotá). |

Todas las acciones que cambian datos dejan registro en `bitacora` (usuario real de la sesión + IP).
