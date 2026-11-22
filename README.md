# 🍕 Alcipizza · Sistema de comidas rápidas

Aplicación web para el local **Alcipizza** (Güepsa, Santander, Colombia): menú en línea para clientes, pedidos por mesera, cocina con inventario y reportes, y un panel de desarrollador para la suscripción anual.

Hecha con **HTML, CSS y JavaScript puro** (sin frameworks ni instalación).

## Archivos

| Archivo | Para qué sirve |
|---|---|
| `index.html` | Página principal. Carga los estilos y el programa. |
| `styles.css` | Todo el diseño: paletas, modo claro/oscuro, tirilla, cartel de horarios, etc. |
| `app.js` | Toda la lógica: menú, pedidos, inventario, surtidores, reportes, PDF, accesos. |
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

## ⚠️ Antes de usarla en producción

1. **Cambia los accesos iniciales.** Los usuarios y contraseñas de ejemplo están en la sección `seed` de `app.js`; cámbialos desde el panel de desarrollador y Ajustes de cocina en cuanto entres.
2. **Los datos viven en cada navegador** (`localStorage`). No hay servidor ni base de datos: un pedido hecho desde el celular de un cliente **no llega** a la pantalla de la cocina de otro dispositivo, y la suscripción solo afecta al navegador donde se configura.
3. **La seguridad de los accesos es solo visual.** Como todo el código es público, cualquiera puede leer las claves en `app.js`. Para uso real con varios dispositivos hace falta un servidor o una base de datos (por ejemplo Firebase o Supabase) con inicio de sesión de verdad.
4. Borrar los datos del navegador borra el inventario, los pedidos y los reportes.

## Personalización rápida

- Textos de bienvenida, horarios, teléfono, métodos de pago, logo y fondo de pantalla: **Cocina → Ajustes**.
- Platos, bebidas, fotos, salsas y extras: **Cocina → Comidas**.
- Paletas de color: botón 🎨 **Colores** (incluye vinotinto/blanco y blanco/negro).

## Soporte técnico

ING. José Luis Ariza  

---

© 2026 **ING. JOSÉ LUIS ARIZA**. Todos los derechos reservados.
