# Alcipizza · Subir a Hostinger (PHP + MySQL/MariaDB)

Generado con `node php-api/scripts/build-deploy.mjs` (desde la raíz del repo). Contenido:

| Carpeta / archivo | Va en el servidor a |
|---|---|
| `public_html/` (React compilado, `index.php`, `.htaccess`) | `~/domains/<dominio>/public_html/` |
| `alcipizza-api/` (`src/`, `scripts/`, `.env.example`) | `~/domains/<dominio>/alcipizza-api/` (**fuera** de public_html) |
| `sql/schema.sql`, `sql/seed.sql` | se importan en la base; no se suben a public_html |

`index.php` busca el código en `../alcipizza-api/src`, así que las dos carpetas deben quedar una al lado de la otra.

## 1. PHP
hPanel → Avanzado → Configuración PHP: **PHP 8.2** (o superior) con `pdo_mysql`, `mbstring`, `json` y `openssl` activos (vienen activos por defecto).

## 2. Base de datos
1. hPanel → Bases de datos → **Bases de datos MySQL** → crear base y usuario (quedan como `u123456789_alcipizza`). Anota la clave.
2. Importar **en este orden** en esa base vacía:
   - phpMyAdmin → seleccionar la base → Importar → `schema.sql` → Continuar; luego lo mismo con `seed.sql`.
   - o por SSH (subiendo antes la carpeta `sql/` a tu home, p. ej. `~/sql`):
     ```sh
     mysql -u u123456789_alcipizza -p u123456789_alcipizza < ~/sql/schema.sql
     mysql -u u123456789_alcipizza -p u123456789_alcipizza < ~/sql/seed.sql
     ```
   Después de importar, borra `~/sql` del servidor.

## 3. Archivos
Con el Administrador de archivos de hPanel (subir un .zip y "Extraer") o por SSH/SFTP:
1. Vacía `~/domains/<dominio>/public_html/` (quita el `default.php` de Hostinger) y sube **el contenido** de `public_html/`, incluido `.htaccess` (archivo oculto: actívalo en "mostrar ocultos").
2. Sube la carpeta `alcipizza-api/` a `~/domains/<dominio>/alcipizza-api/`.

Ejemplo con scp desde la carpeta `deploy/` (puerto SSH de Hostinger: 65002):
```sh
scp -P 65002 -r public_html/. u123456789@IP:domains/<dominio>/public_html/
scp -P 65002 -r alcipizza-api sql u123456789@IP:domains/<dominio>/
```
(si subiste `sql/` así, bórrala al terminar: `rm -r ~/domains/<dominio>/sql`).

## 4. .env
```sh
cd ~/domains/<dominio>/alcipizza-api
cp .env.example .env
nano .env          # DB_NAME, DB_USER, DB_PASSWORD de la base del paso 2; DB_HOST=localhost
chmod 600 .env
```

## 5. Usuarios iniciales
```sh
cd ~/domains/<dominio>/alcipizza-api
php scripts/crear-usuarios.php
```
Crea `dev` (rol dev), `admin` (rol cocina) y `ana` (mesera) con claves aleatorias que se muestran **una sola vez**: guárdalas. Al primer ingreso cada uno debe cambiar su clave.
Opciones: `--admin-pass='…'` para fijar una clave, `--reset` para generar claves nuevas a los que ya existen, `--solo=admin`, `--help`.
Si `php` de SSH no es 8.2, usa la ruta completa, p. ej. `/opt/alt/php82/usr/bin/php scripts/crear-usuarios.php`.

## 6. SSL
hPanel → Seguridad → **SSL** → instalar el certificado gratuito (Let's Encrypt) del dominio y esperar a que quede *Activo*. El `.htaccess` ya redirige todo a HTTPS y manda HSTS.

## 7. Comprobar
- `https://<dominio>/api/health` → `{"ok":true,"mysql":"…","platos":N}` (si sale 503: revisa `.env`).
- `https://<dominio>/` carga la tienda; `https://<dominio>/cocina` (ruta de React) también.
- `https://<dominio>/.env` y `https://<dominio>/alcipizza-api/` → 403/404.
- Entra con `admin`, cambia la clave y revisa horarios / métodos de pago en Ajustes (el seed trae los del menú original y una suscripción activa por 1 año desde la fecha en que se generó `seed.sql`).

## Actualizar a una versión nueva
1. `node php-api/scripts/build-deploy.mjs --no-sql` (o sin `--no-sql` si cambió el esquema; en ese caso aplica a mano solo los cambios nuevos, **no** reimportes `schema.sql` sobre la base con datos).
2. Reemplaza `public_html/` (conserva tu `.htaccess` si lo cambiaste) y `alcipizza-api/src/`. No toques `alcipizza-api/.env`.

## Despliegue automático con GitHub Actions

Los workflows están en `.github/workflows/`:

- `ci.yml`: corre en todo `push` y `pull_request`; prueba la API (Vitest contra MySQL), React, el build de Vite y después los E2E de Playwright con Chromium.
- `deploy.yml`: corre cuando `CI` termina con éxito en `main`, o a mano desde Actions → **Deploy** → *Run workflow*. Si falta alguno de los secretos, escribe un aviso en el resumen del job y termina en verde sin desplegar.

### Secretos

Créalos en GitHub → Settings → Secrets and variables → Actions → **New repository secret**:

| Secreto | Valor |
|---|---|
| `SSH_HOST` | IP o dominio del servidor de Hostinger. |
| `SSH_PORT` | `65002` (el puerto SSH de Hostinger; el plan Premium incluye SSH). |
| `SSH_USER` | Tu usuario de hosting, p. ej. `u123456789`. |
| `SSH_KEY` | Contenido completo de la llave privada `alcipizza_deploy` (líneas `BEGIN`/`END` incluidas). |
| `DEPLOY_PATH` | `domains/<dominio>` (ruta relativa a tu home; sin `~/` ni barra final). |
| `SITE_URL` | `https://<dominio>` (sin barra final). |

### Llave SSH

Genera la llave en tu equipo, **sin passphrase** (el runner la usa sin intervención):

```sh
ssh-keygen -t ed25519 -C deploy-alcipizza -f alcipizza_deploy
```

- Privada (`alcipizza_deploy`): va en el secreto `SSH_KEY`. Nunca la subas al repo.
- Pública (`alcipizza_deploy.pub`): se pega en hPanel → Avanzado → Acceso SSH → **Llaves SSH**.

El workflow guarda la privada en `~/.ssh` con permisos `600` y registra la huella del host con `ssh-keyscan -p "$SSH_PORT" "$SSH_HOST"`.

### Qué sube

`node php-api/scripts/build-deploy.mjs --no-sql` genera `deploy/` con el build de React ya compilado (el workflow hace antes `npm ci` en `client/`). Luego:

- `deploy/public_html/` → `$DEPLOY_PATH/public_html/` con `rsync -az --delete`: se sube el `.htaccess` del paquete (si lo habías cambiado a mano en el servidor, se reemplaza).
- `deploy/alcipizza-api/` → `$DEPLOY_PATH/alcipizza-api/` con `--exclude .env`: **nunca** borra ni sobrescribe `alcipizza-api/.env`.
- `deploy/alcipizza-api/src/` → `$DEPLOY_PATH/alcipizza-api/src/` con `--delete`: el borrado solo afecta a `src/`.
- Al terminar comprueba `$SITE_URL/api/health` hasta 5 veces con 5 s entre intentos y falla si no devuelve `ok: true`.

### Migraciones

El despliegue automático usa `--no-sql` y no toca la base de datos. Cuando haya migraciones nuevas en `server/migrations/`, aplícalas **a mano** en la base de producción (con los permisos de tu usuario de hPanel). No reimportes `schema.sql` sobre una base con datos: solo aplica los cambios nuevos, como se indica en «Actualizar a una versión nueva».
