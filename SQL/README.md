# 🍕 Alcipizza · Sistema de comidas rápidas

Aplicación web para el local **Alcipizza** (Güepsa, Santander, Colombia): menú en línea para clientes, pedidos por mesera, cocina con inventario y reportes, y un panel de desarrollador para la suscripción anual.

Hecha con **HTML, CSS y JavaScript puro** (sin frameworks ni instalación).

## Archivos

| Archivo | Para qué sirve |
|---|---|
| `index.html` | Página principal. Carga los estilos y el programa. |
| `styles.css` | Todo el diseño: paletas, modo claro/oscuro, tirilla, cartel de horarios, etc. |
| `app.js` | Toda la lógica de la página: menú, pedidos, inventario, surtidores, reportes, PDF, accesos. |
| `config.js` | Define si la página trabaja sola (modo local) o con el servidor y SQL Server. |
| `server/` | Servidor Node.js + API + conexión a **SQL Server** (ver sección más abajo). |
| `docker-compose.yml` | SQL Server listo para desarrollo con Docker (opcional). |
| `assets/logo.png` | Logo de Alcipizza (se puede cambiar desde Ajustes sin tocar el código). |
| `LICENSE` | Aviso de derechos de autor. |
| `.nojekyll` | Evita que GitHub Pages procese los archivos. |

## Cómo usarla

- **En el computador:** abre `index.html` con el navegador (doble clic).
- **Con servidor local (opcional):** `python3 -m http.server 8000` y entra a `http://localhost:8000`.
- **Gratis en internet:**
  - *GitHub Pages:* sube los archivos al repositorio → `Settings` → `Pages` → rama `main` y carpeta `/ (root)`.
  - *Netlify:* arrastra la carpeta completa a [app.netlify.com/drop](https://app.netlify.com/drop).

## Roles

- **Cliente:** ve el menú, personaliza su plato (quita ingredientes, elige salsas y extras), confirma el pedido y ve **solo su propia tirilla**.
- **Mesera:** toma pedidos por mesa o domicilio, cobra los pedidos web y envía el ticket por WhatsApp.
- **Cocina (administración):** pedidos, inventario, surtidores, comidas y extras, reportes, registro del personal y ajustes (textos, horarios, pagos, logo, fondo).
- **Desarrollador:** activa o desactiva la suscripción anual y cambia los accesos de cocina y meseras.

El acceso del personal está detrás del icono 🔒 de la esquina inferior derecha (o con `#personal` al final de la dirección).

## 🗄️ Base de datos SQL Server (modo servidor)

La página puede trabajar de dos formas:

| Modo | Cuándo | Dónde se guardan los datos |
|---|---|---|
| **Local** (`config.js` con `API: ''`) | Demo o pruebas, GitHub Pages | En el navegador de cada persona |
| **Servidor** (carpeta `server/`) | Uso real con varios dispositivos | **SQL Server**, compartido por clientes, meseras, cocina y desarrollador |

En modo servidor un pedido hecho desde el celular de un cliente aparece en la cocina en unos segundos, el inventario y el reporte son únicos, y las contraseñas viven en la base de datos (con hash, nunca en el código).

```
Navegador  ──►  Servidor Node.js (server/server.js)  ──►  SQL Server
 (página)        API REST · sesiones · permisos            tablas Pedidos, Platos, Insumos…
```

### Puesta en marcha

1. **Requisitos:** Node.js 18 o superior y un SQL Server (2012+; sirve la edición Express gratis, Azure SQL o Docker).
   - Con Docker: `docker compose up -d` (usa `docker-compose.yml`).
2. **Configura:** entra a `server/`, copia `.env.example` como `.env` y llena tus datos (servidor SQL, usuario, clave, `TOKEN_SECRET`, y los usuarios iniciales `DEV_USER`, `DEV_PASS`, `ADMIN_USER`, `ADMIN_PASS`).
3. **Instala y arranca:**
   ```bash
   cd server
   npm install
   npm start
   ```
4. Abre `http://localhost:3000`. La primera vez el servidor **crea la base de datos y las tablas** (`schema.sql`), carga el menú de ejemplo y crea los dos usuarios iniciales. Después puedes borrar las contraseñas de `.env`.
5. **Prueba sin SQL Server:** `npm run demo` (los datos quedan en memoria y se pierden al apagar).

### Tablas

`Platos`, `Extras`, `Insumos`, `Surtidores`, `Compras`, `Pedidos`, `Bitacora`, `Config`, `Usuarios` y `Eliminados`. Cada una tiene columnas para consultar en SQL Server Management Studio (fecha, total, estado, producto, costo…) y la fila completa en la columna `Datos` (JSON).

```sql
SELECT TOP 20 Id, Fecha, Destino, Cliente, Total, Estado, PagoEstado FROM dbo.Pedidos ORDER BY Id DESC;
```

### Publicarlo en internet

- El servidor debe estar en una máquina encendida (un PC del local, un VPS o un servicio como Azure/Render) con acceso al SQL Server. **GitHub Pages por sí solo no sirve**: solo aloja archivos, no ejecuta el servidor.
- Usa HTTPS (por ejemplo con Caddy, Nginx o el proxy del proveedor) y pon `TRUST_PROXY=1` en `.env`.
- Si la página está en otro dominio que el servidor, pon su dirección en `CORS_ORIGIN` y en `config.js` la dirección de la API (`https://tu-servidor.com/api`).
- Haz copias de seguridad de la base de datos con las herramientas normales de SQL Server.

### Seguridad que incluye

- Contraseñas con `scrypt` y sesiones firmadas que vencen a las 12 horas; al cambiar una contraseña se cierran las sesiones de esa persona.
- Límite de intentos de ingreso y de pedidos por IP.
- Permisos por rol: el cliente solo ve menú, extras, ajustes y salsas; la mesera ve pedidos; cocina ve todo; el desarrollador solo maneja suscripción y accesos.
- El servidor **recalcula los precios** de cada pedido con el catálogo (el navegador no puede cambiar el total).
- Cada cliente solo puede abrir su propia tirilla (con un código privado de su pedido).
- La bitácora registra al usuario real autenticado; no se puede falsificar desde el navegador.
- Contraseñas nuevas: mínimo 6 caracteres. Si alguien olvida la suya, el desarrollador escribe una nueva (no se pueden ver).

### Límites a tener en cuenta

- Si dos personas editan **la misma fila** al mismo tiempo (por ejemplo el stock de un insumo desde dos pantallas), gana el último cambio.
- La página consulta al servidor cada 3 a 6 segundos; no usa conexión en tiempo real.
- El servidor se escribió y probó con un almacén en memoria y un simulador del controlador; **conviene hacer una prueba en tu propio SQL Server** antes de abrirlo al público.

## ⚠️ Modo local (sin servidor)

1. **Cambia los accesos iniciales.** En modo local los usuarios y contraseñas de ejemplo están en la sección `seed` de `app.js`; cámbialos desde el panel de desarrollador y Ajustes de cocina en cuanto entres.
2. **Los datos viven en cada navegador** (`localStorage`): un pedido hecho desde otro dispositivo **no llega** a la cocina. Para eso usa el modo servidor.
3. **La seguridad de los accesos es solo visual**, porque el código es público.
4. Borrar los datos del navegador borra el inventario, los pedidos y los reportes.

## Personalización rápida

- Textos de bienvenida, horarios, teléfono, métodos de pago, logo y fondo de pantalla: **Cocina → Ajustes**.
- Platos, bebidas, fotos, salsas y extras: **Cocina → Comidas**.
- Paletas de color: botón 🎨 **Colores** (incluye vinotinto/blanco y blanco/negro).

## Soporte técnico

ING. José Luis Ariza  


---

© 2026 **ING. JOSÉ LUIS ARIZA**. Todos los derechos reservados.
