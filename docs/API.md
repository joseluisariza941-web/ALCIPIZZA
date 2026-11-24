# Contrato de la API · Alcipizza v2

Fuente única de verdad entre `php-api/` (PHP + MySQL/MariaDB) y `client/` (React).
Solo el agente de **backend** puede modificar este archivo; si un agente de frontend necesita un cambio, lo pide en su reporte final.

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

## Tipos

```ts
Usuario   = { id, usuario, nombre, rol: 'dev'|'cocina'|'mesera', activo, debeCambiarClave }
Variante  = { id, nombre, precio }                                // admin además trae multiplicador
Extra     = { id, nombre, precio, grupo: string|null }            // mismo grupo = excluyentes
Plato     = { id, nombre, emoji, imagenUrl, categoria, variantes: Variante[],
              ingredientes: string[], salsas: string[], extras: Extra[] }
ItemPedido= { id, platoId, varianteId: number|null, nombre, emoji, variante, precioUnitario, nota,
              extras: {id, nombre, precio}[], salsas: string[], sin: string[] }
              // precioUnitario = precio de la variante + suma de sus extras (precio completo de la línea; cantidad 1)
              // varianteId es null solo si esa variante se borró después
              // para editar: items.map(i => ({ platoId, varianteId, extras: i.extras.map(e => e.id), salsas, sin, nota }))
Pedido    = { id, creadoEn, origen: 'web'|'mesera', mesera: {id, nombre}|null, destino, cliente,
              direccion, telefono, total, estado: 'nuevo'|'preparando'|'listo'|'entregado'|'cancelado',
              pagoEstado: 'pendiente'|'pagado', metodoPago: {codigo, nombre}|null, pagadoEn,
              cobradoPor: {id, nombre}|null, items: ItemPedido[] }
Insumo    = { id, nombre, tipo: 'insumo'|'salsa', unidad, stock, stockReferencia, costo, surtidorId: number|null,
              ultimaCompra: { fecha, cantidad, unidad, usuario /* nombre de quien la registró */ } | null }
Surtidor  = { id, nombre, empresa, correo, telefono }
Compra    = { id, fecha, insumo: {id, nombre}, cantidad, unidad, costo, surtidor: {id, nombre}|null, registradoPor: {id, nombre}|null }
Config    = { n, w1, w2, w3, w4, tel, mesas, h: ([abre, cierra]|null)[7] /* lunes..domingo */, logo, bg }
MetodoPago= { codigo, nombre, numero, activo }
```

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
| `GET /api/public/config` | `{ config: Config, pagos: MetodoPago[] /* solo activos */, abierto: boolean, suscripcionActiva: boolean }` |
| `GET /api/menu` | `Plato[]` (solo activos, ordenados por categoría y orden). `ingredientes` y `salsas` son nombres (los mismos que van en `sin`/`salsas` del pedido) |
| `POST /api/pedidos` | ver **Pedidos** |
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
- Respuesta `201 { pedido: Pedido, token?: string }`. `token` (solo web) es el código privado para ver la tirilla: `/tirilla/:id?token=...`. En la base se guarda su SHA-256.
- Web con suscripción inactiva: `403 SUSPENDIDO`; local cerrado según `config.h` (hora de Bogotá): `403 CERRADO`. Límite: 10 pedidos web por IP cada 10 min (`429 LIMITE`; no aplica con sesión).

| Método y ruta | Quién | Cuerpo / query | Respuesta |
|---|---|---|---|
| `GET /api/pedidos` | cocina, mesera | `?desde=ISO&hasta=ISO&estado=` (por defecto: hoy) | `Pedido[]` (más recientes primero). La mesera ve todos los del día. |
| `PUT /api/pedidos/:id` | mesera (solo los suyos, si no `403`), cocina (cualquiera, también web) | igual que el POST con las reglas de mesera | `Pedido` · solo si `estado='nuevo'`; si no, `409`. Conserva `origen` y el token de la tirilla. |
| `PATCH /api/pedidos/:id/estado` | cocina: cualquier transición; mesera: `nuevo→cancelado` (solo los suyos) y `listo→entregado` (cualquiera); otra → `403 PROHIBIDO` | `{ estado }` | `Pedido`. Al pasar a `preparando`, `listo` o `entregado` **descuenta el inventario** una sola vez por pedido. Cancelar o volver a `nuevo` **no** devuelve inventario. `409` si el estado cambió mientras tanto. |
| `POST /api/pedidos/:id/pago` | mesera, cocina | `{ metodoPago }` (código existente) | `Pedido` con `pagoEstado='pagado'`, `metodoPago`, `pagadoEn` y `cobradoPor` · `400` método no válido · `409` si ya estaba pagado |

Descuento de inventario (igual que `descontar()` en la app original): por cada ítem, los ingredientes del plato que no están en `sin` × `multiplicador` de la variante, convertidos a la unidad del insumo (g↔kg↔lb, und); 15 g por cada salsa; y la cantidad de cada extra. El stock nunca queda negativo.

## Administración (rol `cocina`)

| Recurso | Rutas |
|---|---|
| Platos | `GET /api/admin/platos` → `PlatoAdmin[]` (incluye inactivos) · `POST` (`201`) · `PUT /:id` · `DELETE /:id` → `{ ok: true, desactivado: boolean }` (lo desactiva en vez de borrarlo si tiene pedidos) |
| Extras | `GET/POST /api/admin/extras` · `PUT/DELETE /api/admin/extras/:id` — cuerpo y respuesta `{ id, nombre, insumoId, cantidad, unidad, precio, grupo }` (`PUT` parcial) |
| Insumos | `GET/POST /api/insumos` · `PUT /api/insumos/:id` (parcial) · `DELETE /api/insumos/:id` (`409` si un plato lo usa o si tiene compras: **las compras nunca se borran**) · `409` si el nombre ya existe · unidades `g`, `kg`, `lb`, `und` · cada insumo trae `ultimaCompra` (columnas "Ingresó / Registró") |
| Surtidores | `GET/POST /api/surtidores` · `PUT/DELETE /api/surtidores/:id` |
| Compras | `GET /api/compras?desde&hasta` → `Compra[]` (más recientes primero, máx. 1000) · `POST /api/compras { insumoId? , nuevoInsumo?: {nombre, tipo, unidad?}, cantidad > 0, unidad, costo, surtidorId? }` (exactamente uno de `insumoId`/`nuevoInsumo`) → `201 Compra`. Suma la cantidad al stock y al stock de referencia (con conversión g↔kg↔lb), y actualiza `costo` y `surtidorId` del insumo. `400` si la unidad no es compatible (p. ej. `und` con `kg`). Si `nuevoInsumo.nombre` ya existe, usa ese insumo. |
| Ajustes | `GET /api/config` · `PUT /api/config` (Config parcial; responde la Config completa). Reglas: `mesas` entero 0..200, `h` exactamente 7 entradas (lunes..domingo) de `[abre, cierra]` con horas 0..24 o `null`, `logo`/`bg` texto ≤ 3 MB (URL o data URL); claves desconocidas → `400` · `GET /api/metodos-pago` (todos, también inactivos) · `POST /api/metodos-pago { nombre, numero?, activo? = true }` → `201 MetodoPago` (el `codigo` lo genera el servidor a partir del nombre; `409` si el nombre ya existe) · `PUT /api/metodos-pago/:codigo { nombre?, numero?, activo? }` → `MetodoPago` (`404` si no existe) · `DELETE /api/metodos-pago/:codigo` → `{ ok: true, desactivado: boolean }` (si algún pedido lo usó, solo se desactiva) |
| Reportes | `GET /api/reportes/ventas?desde=AAAA-MM-DD&hasta=AAAA-MM-DD` (por defecto: hoy; `hasta` inclusivo) → `{ total, pedidos, cobrado, porCobrar, comprasWeb, porPlato: [{nombre, cantidad, total}], porMetodo: [{metodo, total}], porDia: [{fecha: 'AAAA-MM-DD', total}], compras }`. Solo pedidos no cancelados. `cobrado` = total de los pagados; `porCobrar` = `total - cobrado`; `comprasWeb` = número de pedidos web; `metodo: 'Sin método'` si no tiene método; `compras` = suma de costos de compras de insumos del rango. Ticket promedio = `total / pedidos` (lo calcula el cliente). |
| Bitácora | `GET /api/bitacora?limit=200` (1..1000) → `[{ id, fecha, usuario, nombre, accion, ip }]` más recientes primero (cocina y dev). El cliente web aparece como `usuario: 'cliente'`. |

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

## Usuarios y suscripción

| Método y ruta | Quién | Notas |
|---|---|---|
| `GET /api/usuarios` | cocina (solo meseras), dev (todos) | `Usuario[]` |
| `POST /api/usuarios` | cocina (crea meseras), dev (crea cocina/mesera) | `{ usuario, nombre, clave, rol }` · clave ≥ 8 · el usuario se guarda en minúsculas · `409` si ya existe · queda con `debeCambiarClave=true` |
| `PUT /api/usuarios/:id` | igual que arriba (dev también se edita a sí mismo) | `{ nombre?, usuario?, clave?, activo? }` → `Usuario`. Cambiar la clave de otro deja `debeCambiarClave=true`; cambiar la clave o desactivar cierra las sesiones de ese usuario. `403 PROHIBIDO` sobre un rol que no gestiona · `404` · `409` usuario repetido |
| `DELETE /api/usuarios/:id` | igual que arriba | `{ ok: true }` · no se puede borrar a sí mismo (`400`) |
| `GET /api/suscripcion` | dev | `{ activa, hasta: 'AAAA-MM-DD' }` |
| `PUT /api/suscripcion` | dev | `{ activa?, hasta?: 'AAAA-MM-DD' }` → `{ activa, hasta }` (`400` si la fecha no es válida). Se considera inactiva si `activa=false` o `hasta` ya pasó (hora de Bogotá). |

Todas las acciones que cambian datos dejan registro en `bitacora` (usuario real de la sesión + IP).
