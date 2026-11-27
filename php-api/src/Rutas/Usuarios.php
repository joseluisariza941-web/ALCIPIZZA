<?php
declare(strict_types=1);

namespace Alci\Rutas;

use Alci\Core\Auth;
use Alci\Core\Db;
use Alci\Core\HttpError;
use Alci\Core\Request;
use Alci\Core\Respuesta;
use Alci\Core\Router;
use Alci\Core\Sesion;
use Alci\Servicios\{Archivo, Bitacora};
use Alci\Servicios\Suscripcion;
use Alci\Servicios\Usuarios as Servicio;
use Alci\Servicios\Zod;

/** Igual que server/src/routes/usuarios.js: personal (cocina gestiona meseras; dev gestiona cocina y meseras) y suscripción (dev). */
final class Usuarios
{
    /** Roles que puede gestionar cada rol. */
    private const GESTIONA = [
        'cocina' => ['mesera'],
        'dev' => ['cocina', 'mesera'],
        'superadmin' => ['superadmin', 'dev', 'cocina', 'mesera'],
    ];

    private static function puedeTocar(array $yo, array $t): bool
    {
        return in_array($t['rol'], self::GESTIONA[$yo['rol']] ?? [], true)
            || (in_array($yo['rol'], ['dev', 'superadmin'], true) && (int) $t['id'] === (int) $yo['id']);
    }

    /** Impide dejar el sistema sin ningún superadmin activo al borrar o desactivar a $t. */
    private static function noDejarSinSuperadmin(array $t): void
    {
        if ($t['rol'] !== 'superadmin') return;
        $otros = (int) Db::valor("SELECT COUNT(*) FROM usuarios WHERE rol = 'superadmin' AND activo = 1 AND eliminado_en IS NULL AND id <> ?", [(int) $t['id']]);
        if ($otros === 0) throw new HttpError(400, 'Debe quedar al menos un superadmin activo');
    }

    private static function objetivo(Request $req, array $params): array
    {
        $z = new Zod($params);
        $id = $z->enteroCoaccion('id', ['positivo' => true]);
        $z->fin();
        $t = Servicio::porId($id);
        if (!$t) throw new HttpError(404, 'Usuario no encontrado');
        if (!self::puedeTocar($req->user, $t)) throw new HttpError(403, 'No tienes permiso sobre este usuario', 'PROHIBIDO');
        return $t;
    }

    private static function libre(string $usuario, int $exceptoId = 0): void
    {
        if (Db::valor('SELECT id FROM usuarios WHERE usuario = ? AND id <> ? LIMIT 1', [$usuario, $exceptoId]) !== null) {
            throw new HttpError(409, 'Ese usuario ya existe');
        }
    }

    /** Campos usuario, nombre y clave como en el esquema zod (opcionales en el PUT). */
    private static function campos(Zod $z, bool $opcional): array
    {
        return [
            'usuario' => $z->cadena('usuario', ['opcional' => $opcional, 'trim' => true, 'lowerAntes' => true,
                'regex' => '/^[a-z0-9._-]{3,30}$/D', 'msgRegex' => 'Usuario: 3 a 30 caracteres (letras, números, punto, guion)']),
            'nombre' => $z->cadena('nombre', ['opcional' => $opcional, 'trim' => true, 'min' => 1, 'msgMin' => 'Escribe el nombre', 'max' => 80]),
            'clave' => $z->cadena('clave', ['opcional' => $opcional, 'min' => 8, 'msgMin' => 'La contraseña debe tener mínimo 8 caracteres', 'max' => 200]),
        ];
    }

    public static function registrar(Router $r): void
    {
        $r->get('/api/usuarios', function (Request $req) {
            $yo = Auth::rol($req, 'cocina', 'dev');
            $cond = Archivo::eliminados($req) === 'eliminados' ? 'eliminado_en IS NOT NULL' : 'eliminado_en IS NULL';
            $filas = $yo['rol'] === 'cocina'
                ? Db::todos("SELECT * FROM usuarios WHERE rol = 'mesera' AND $cond ORDER BY id")
                : Db::todos("SELECT * FROM usuarios WHERE $cond ORDER BY id");
            return array_map([Servicio::class, 'publico'], $filas);
        });

        $r->post('/api/usuarios', function (Request $req) {
            $yo = Auth::rol($req, 'cocina', 'dev');
            $z = new Zod($req->body);
            $b = self::campos($z, false);
            $b['rol'] = $z->enumeracion('rol', ['dev', 'cocina', 'mesera', 'superadmin'], 'Rol no válido');
            $z->fin();
            if (!in_array($b['rol'], self::GESTIONA[$yo['rol']] ?? [], true)) throw new HttpError(403, 'No puedes crear usuarios con ese rol', 'PROHIBIDO');
            self::libre($b['usuario']);
            $id = Db::insertar('usuarios', [
                'usuario' => $b['usuario'], 'nombre' => $b['nombre'], 'rol' => $b['rol'],
                'clave_hash' => Servicio::hash($b['clave']), 'debe_cambiar_clave' => 1,
            ]);
            Bitacora::registrar($req, "Creó el usuario {$b['nombre']} ({$b['usuario']}, {$b['rol']})");
            return Respuesta::con(201, Servicio::publico(Servicio::porId($id)));
        });

        $r->put('/api/usuarios/:id', function (Request $req, array $params) {
            $yo = Auth::rol($req, 'cocina', 'dev');
            $t = self::objetivo($req, $params);
            $tid = (int) $t['id'];
            $z = new Zod($req->body);
            $b = self::campos($z, true);
            $b['activo'] = $z->booleano('activo', true);
            $z->fin();
            $fila = [];
            if ($b['usuario'] !== null && $b['usuario'] !== $t['usuario']) { self::libre($b['usuario'], $tid); $fila['usuario'] = $b['usuario']; }
            if ($b['nombre'] !== null) $fila['nombre'] = $b['nombre'];
            if ($b['activo'] !== null) {
                if (!$b['activo'] && $tid === (int) $yo['id']) throw new HttpError(400, 'No puedes desactivarte a ti mismo');
                if (!$b['activo']) self::noDejarSinSuperadmin($t);
                $fila['activo'] = $b['activo'] ? 1 : 0;
            }
            if ($b['clave'] !== null) {
                $fila['clave_hash'] = Servicio::hash($b['clave']);
                if ($tid !== (int) $yo['id']) $fila['debe_cambiar_clave'] = 1; // la persona la cambiará al entrar
                $fila['intentos_fallidos'] = 0;
                $fila['bloqueado_hasta'] = null;
            }
            if ($fila) Db::actualizar('usuarios', $fila, 'id = ?', [$tid]);
            if ($b['clave'] !== null || $b['activo'] === false) {
                Sesion::cerrarDe($tid, $tid === (int) $yo['id'] ? Sesion::idActual() : null);
            }
            $cambios = implode(', ', array_filter([
                $b['clave'] !== null ? 'la contraseña' : null,
                $b['activo'] !== null ? ($b['activo'] ? 'activó' : 'desactivó') : null,
                ($b['nombre'] !== null || isset($fila['usuario'])) ? 'los datos' : null,
            ]));
            $nombre = $fila['nombre'] ?? $t['nombre'];
            $usuario = $fila['usuario'] ?? $t['usuario'];
            Bitacora::registrar($req, 'Cambió ' . ($cambios ?: 'nada') . " de $nombre ($usuario)");
            return Servicio::publico(Servicio::porId($tid));
        });

        $r->delete('/api/usuarios/:id', function (Request $req, array $params) {
            $yo = Auth::rol($req, 'cocina', 'dev');
            $t = self::objetivo($req, $params);
            if ((int) $t['id'] === (int) $yo['id']) throw new HttpError(400, 'No puedes borrarte a ti mismo');
            self::noDejarSinSuperadmin($t);
            Sesion::cerrarDe((int) $t['id']);
            Db::ejecutar('UPDATE usuarios SET eliminado_en = NOW() WHERE id = ?', [(int) $t['id']]);
            Bitacora::registrar($req, "Eliminó al usuario {$t['nombre']} ({$t['usuario']})");
            return ['ok' => true];
        });

        $r->post('/api/usuarios/:id/restaurar', function (Request $req, array $params) {
            $yo = Auth::rol($req, 'cocina', 'dev');
            $z = new Zod($params);
            $id = $z->enteroCoaccion('id', ['positivo' => true]);
            $z->fin();
            $t = Servicio::porId($id, true);
            if (!$t || empty($t['eliminado_en'])) throw new HttpError(404, 'Usuario no encontrado');
            if (!self::puedeTocar($yo, $t)) throw new HttpError(403, 'No tienes permiso sobre este usuario', 'PROHIBIDO');
            Db::ejecutar('UPDATE usuarios SET eliminado_en = NULL WHERE id = ?', [$id]);
            Bitacora::registrar($req, "Restauró al usuario {$t['nombre']} ({$t['usuario']})");
            return Servicio::publico(Servicio::porId($id));
        });

        $r->get('/api/suscripcion', function (Request $req) {
            Auth::rol($req, 'dev');
            return Suscripcion::leer();
        });

        $r->put('/api/suscripcion', function (Request $req) {
            Auth::rol($req, 'dev');
            $z = new Zod($req->body);
            $activa = $z->booleano('activa', true);
            $hasta = $z->cadena('hasta', ['opcional' => true, 'regex' => '/^\d{4}-\d{2}-\d{2}$/D', 'msgRegex' => 'Fecha no válida (AAAA-MM-DD)',
                'refine' => [self::class, 'fechaValida'], 'msgRefine' => 'Fecha no válida']);
            $z->fin();
            $fila = [];
            if ($activa !== null) $fila['activa'] = $activa ? 1 : 0;
            if ($hasta !== null) $fila['hasta'] = $hasta;
            if ($fila) Db::actualizar('suscripcion', $fila, 'id = 1');
            $s = Suscripcion::leer();
            Bitacora::registrar($req, 'Cambió la suscripción: ' . ($s['activa'] ? 'activa' : 'inactiva') . ' hasta ' . ($s['hasta'] ?? 'null'));
            return $s;
        });
    }

    /** Como !isNaN(Date.parse('AAAA-MM-DD')) en V8: mes 01..12 y día 01..31 (no revisa el largo del mes). */
    public static function fechaValida(string $s): bool
    {
        $m = (int) substr($s, 5, 2);
        $d = (int) substr($s, 8, 2);
        return $m >= 1 && $m <= 12 && $d >= 1 && $d <= 31;
    }
}
