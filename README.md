# 🍕 Alcipizza · Sistema de comidas rápidas

Aplicación web para el local **Alcipizza** (Güepsa, Santander, Colombia): menú en línea para clientes, pedidos por mesera, cocina con inventario y reportes, y un panel de desarrollador para la suscripción anual.

**En producción:** https://alcipizza.com · ingreso del personal: https://alcipizza.com/personal

## Estructura

| Carpeta | Para qué sirve |
|---|---|
| `client/` | Interfaz en React (Vite). Se compila a archivos estáticos. |
| `php-api/` | API en PHP 8.2+ sin dependencias: lo que corre en Hostinger. |
| `server/` | Migraciones y datos iniciales de la base (knex) y las pruebas de la API. |
| `docs/API.md` | Contrato de la API. |
| `docs/DESPLIEGUE.md` | **Manual de despliegue en Hostinger.** |
| `docker-compose.yml` | MySQL local para desarrollo (puerto 3310). |

## Desarrollo local

```sh
docker compose up -d                                   # base MySQL en Docker
cd server && npm install && npm run migrate && npm run seed
php -S 127.0.0.1:8080 -t php-api/public php-api/public/dev-router.php   # API (usa php-api/.env)
cd client && npm install && npm run dev                                  # http://localhost:5173
```

## Pruebas

```sh
cd server && npm test           # API PHP contra MySQL (Docker)
cd client && npm test           # interfaz
cd client && npm run e2e        # extremo a extremo contra la API PHP
```

## Despliegue

```sh
node php-api/scripts/build-deploy.mjs    # genera deploy/ (public_html, alcipizza-api, sql)
```

Luego sigue los pasos de [`docs/DESPLIEGUE.md`](docs/DESPLIEGUE.md).

## Roles

- **Cliente:** ve el menú, personaliza su plato, hace el pedido y ve su propia tirilla.
- **Mesera:** toma pedidos por mesa o domicilio y cobra.
- **Cocina (administración):** pedidos, inventario, comidas y extras, reportes, personal y ajustes.
- **Desarrollador:** suscripción anual y accesos de cocina y meseras.

## Soporte técnico

ING. José Luis Ariza

---

© 2026 **ING. JOSÉ LUIS ARIZA**. Todos los derechos reservados.
