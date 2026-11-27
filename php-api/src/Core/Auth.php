<?php
declare(strict_types=1);

namespace Alci\Core;

use Alci\Servicios\Suscripcion;
use Alci\Servicios\Usuarios;

/** Igual que middleware/auth.js. */
final class Auth
{
    /** Carga $req->user desde la sesión (o null). Si el usuario ya no existe o está inactivo, cierra la sesión. */
    public static function cargar(Request $req): ?array
    {
        if ($req->userCargado) return $req->user;
        $id = Sesion::get('userId');
        $u = $id ? Usuarios::porId((int) $id) : null;
        if ($id && (!$u || !(int) $u['activo'] || !empty($u['eliminado_en']))) { Sesion::destruir(); $u = null; }
        $req->user = $u;
        $req->userCargado = true;
        return $u;
    }

    public static function revisar(Request $req, bool $permitirCambioPendiente = false): void
    {
        $u = $req->user;
        if (!$u) throw new HttpError(401, 'Inicia sesión para continuar');
        if (!self::tieneRol($u, 'dev') && !Suscripcion::activa()) {
            throw new HttpError(403, 'El servicio está suspendido. Contacta al desarrollador.', 'SUSPENDIDO');
        }
        if ((int) $u['debe_cambiar_clave'] && !$permitirCambioPendiente) {
            throw new HttpError(403, 'Debes cambiar tu contraseña antes de continuar', 'CAMBIAR_CLAVE');
        }
    }

    /** Exige sesión válida; devuelve el usuario. */
    public static function requerir(Request $req, bool $permitirCambioPendiente = false): array
    {
        self::cargar($req);
        self::revisar($req, $permitirCambioPendiente);
        return $req->user;
    }

    /** El superadmin suma dev y cocina: pasa cualquier revisión de rol. */
    public static function tieneRol(array $u, string ...$roles): bool
    {
        return $u['rol'] === 'superadmin' || in_array($u['rol'], $roles, true);
    }

    /** Exige sesión y uno de los roles ('dev', 'cocina', 'mesera'; 'superadmin' pasa siempre); devuelve el usuario. */
    public static function rol(Request $req, string ...$roles): array
    {
        $u = self::requerir($req);
        if (!self::tieneRol($u, ...$roles)) throw new HttpError(403, 'No tienes permiso para esto', 'PROHIBIDO');
        return $u;
    }
}
