<?php
declare(strict_types=1);

namespace Alci\Servicios;

use Alci\Core\Db;

final class Suscripcion
{
    /** ['activa' => bool, 'hasta' => 'YYYY-MM-DD'|null] */
    public static function leer(): array
    {
        $s = Db::uno("SELECT activa, DATE_FORMAT(hasta, '%Y-%m-%d') AS hasta FROM suscripcion WHERE id = 1");
        return $s ? ['activa' => (bool) (int) $s['activa'], 'hasta' => $s['hasta']] : ['activa' => false, 'hasta' => null];
    }

    /** Activa si está marcada y la fecha "hasta" (incluida) no ha pasado en hora de Bogotá. */
    public static function activa(): bool
    {
        $s = self::leer();
        return $s['activa'] && $s['hasta'] && $s['hasta'] >= Horario::fecha();
    }
}
