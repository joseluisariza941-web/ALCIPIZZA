<?php
declare(strict_types=1);

namespace Alci\Rutas;

use Alci\Core\Auth as Acceso;
use Alci\Core\Csrf;
use Alci\Core\Db;
use Alci\Core\Fmt;
use Alci\Core\HttpError;
use Alci\Core\RateLimit;
use Alci\Core\Request;
use Alci\Core\Router;
use Alci\Core\Sesion;
use Alci\Servicios\Bitacora;
use Alci\Servicios\Suscripcion;
use Alci\Servicios\Usuarios;
use Alci\Servicios\Zod;

/** Igual que server/src/routes/auth.js (montado en /api/auth). */
final class Auth
{
    private const MAX_FALLOS = 5;
    private const BLOQUEO_MIN = 15;
    private const MSG_MALO = 'Usuario o contraseña incorrectos';
    private const MSG_BLOQUEO = 'Usuario bloqueado por demasiados intentos. Intenta de nuevo en 15 minutos.';
    private const REGEX_USUARIO = '/^[a-z0-9._-]{3,30}$/D';
    private const MSG_USUARIO = 'Usuario: 3 a 30 caracteres (letras, números, punto, guion)';

    public static function registrar(Router $r): void
    {
        $r->get('/api/auth/csrf', function (Request $req) {
            if (!Sesion::get('csrfToken')) {
                // solo cuenta cuando se crea una sesión nueva
                RateLimit::exigir('csrf', max(1, (int) env('CSRF_MAX', '60')), 60, $req->ip, 'Demasiadas peticiones. Espera un momento.');
                Sesion::set('csrfToken', Csrf::nuevoToken());
            }
            return ['csrfToken' => Sesion::get('csrfToken')];
        });

        $r->post('/api/auth/login', [self::class, 'login']);

        $r->post('/api/auth/logout', function (Request $req) {
            Acceso::requerir($req, true);
            Bitacora::registrar($req, 'Cerró sesión');
            Sesion::destruir(); // también borra la cookie
            return ['ok' => true];
        });

        $r->get('/api/auth/me', function (Request $req) {
            return ['user' => Usuarios::publico(Acceso::requerir($req, true))];
        });

        // Cambiar el propio usuario o nombre (la contraseña va por /cambiar-clave).
        $r->put('/api/auth/perfil', function (Request $req) {
            $yo = Acceso::requerir($req);
            $z = new Zod($req->body);
            $usuario = $z->cadena('usuario', ['opcional' => true, 'trim' => true, 'lowerAntes' => true,
                'regex' => self::REGEX_USUARIO, 'msgRegex' => self::MSG_USUARIO]);
            $nombre = $z->cadena('nombre', ['opcional' => true, 'trim' => true, 'min' => 1, 'msgMin' => 'Escribe el nombre', 'max' => 80]);
            $actual = $z->cadena('actual', ['min' => 1, 'max' => 200, 'error' => 'Escribe tu contraseña actual']);
            $z->fin();
            if (!password_verify($actual, (string) $yo['clave_hash'])) throw new HttpError(401, 'La contraseña actual no es correcta');
            $fila = [];
            if ($usuario !== null && $usuario !== $yo['usuario']) {
                if (Db::valor('SELECT id FROM usuarios WHERE usuario = ? LIMIT 1', [$usuario]) !== null) {
                    throw new HttpError(409, 'Ese usuario ya existe');
                }
                $fila['usuario'] = $usuario;
            }
            if ($nombre !== null) $fila['nombre'] = $nombre;
            if ($fila) Db::actualizar('usuarios', $fila, 'id = ?', [(int) $yo['id']]);
            $u = Usuarios::porId((int) $yo['id']);
            Bitacora::registrar($req, "Cambió su perfil ({$u['usuario']} · {$u['nombre']})", $u);
            return ['user' => Usuarios::publico($u)];
        });

        $r->post('/api/auth/cambiar-clave', function (Request $req) {
            $yo = Acceso::requerir($req, true);
            $z = new Zod($req->body);
            $actual = $z->cadena('actual', ['min' => 1, 'max' => 200, 'error' => 'Escribe la contraseña actual']);
            $nueva = $z->cadena('nueva', ['min' => 8, 'msgMin' => 'La nueva contraseña debe tener mínimo 8 caracteres', 'max' => 200,
                'error' => 'Escribe la nueva contraseña']);
            $z->fin();
            if ($actual === $nueva) throw new HttpError(400, 'La nueva contraseña debe ser distinta de la actual', 'VALIDACION');
            if (!password_verify($actual, (string) $yo['clave_hash'])) throw new HttpError(401, 'La contraseña actual no es correcta');
            Db::actualizar('usuarios', ['clave_hash' => Usuarios::hash($nueva), 'debe_cambiar_clave' => 0], 'id = ?', [(int) $yo['id']]);
            Sesion::cerrarDe((int) $yo['id'], Sesion::idActual());
            Bitacora::registrar($req, 'Cambió su contraseña');
            return ['ok' => true];
        });
    }

    public static function login(Request $req): array
    {
        // Límite por IP (ventana de 15 min); los ingresos correctos no cuentan.
        $max = (int) env('LOGIN_RATE_MAX', '20');
        RateLimit::exigir('login', $max, 15 * 60, $req->ip, 'Demasiados intentos. Espera unos minutos.');

        $z = new Zod($req->body);
        $usuario = $z->cadena('usuario', ['trim' => true, 'min' => 1, 'max' => 50, 'lower' => true, 'error' => 'Escribe el usuario']);
        $clave = $z->cadena('clave', ['min' => 1, 'max' => 200, 'error' => 'Escribe la contraseña']);
        $z->fin();

        $u = Usuarios::porUsuario($usuario);
        $ok = password_verify($clave, $u['clave_hash'] ?? Usuarios::hashFalso());
        // cuenta bloqueada: con clave incorrecta se responde como cualquier credencial mala (sin delatar el bloqueo)
        $bloqueado = $u && (int) $u['bloqueado'];
        if ($bloqueado && $ok) throw new HttpError(423, self::MSG_BLOQUEO, 'BLOQUEADO');
        if (!$u || !$ok || !(int) $u['activo']) {
            if ($u && !$bloqueado) {
                Db::ejecutar('UPDATE usuarios SET intentos_fallidos = intentos_fallidos + 1 WHERE id = ?', [(int) $u['id']]);
                $n = (int) Db::valor('SELECT intentos_fallidos FROM usuarios WHERE id = ?', [(int) $u['id']]);
                if ($n >= self::MAX_FALLOS) {
                    Db::ejecutar('UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NOW() + INTERVAL '
                        . self::BLOQUEO_MIN . ' MINUTE WHERE id = ?', [(int) $u['id']]);
                    Bitacora::registrar($req, 'Usuario bloqueado ' . self::BLOQUEO_MIN . ' min por ' . self::MAX_FALLOS
                        . ' intentos fallidos', $u);
                }
            }
            throw new HttpError(401, self::MSG_MALO);
        }

        if (!Acceso::tieneRol($u, 'dev') && !Suscripcion::activa()) {
            throw new HttpError(403, 'El servicio está suspendido. Contacta al desarrollador.', 'SUSPENDIDO');
        }

        Db::ejecutar('UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL, ultimo_ingreso = NOW() WHERE id = ?',
            [(int) $u['id']]);
        Sesion::regenerar();
        Sesion::set('userId', (int) $u['id']);
        Sesion::set('rol', $u['rol']);
        Sesion::set('creadoEn', Fmt::ms());
        Sesion::set('csrfToken', Csrf::nuevoToken());
        Bitacora::registrar($req, 'Ingresó al sistema', $u);
        RateLimit::devolver('login', $max, $req->ip);
        return ['user' => Usuarios::publico($u)];
    }
}
