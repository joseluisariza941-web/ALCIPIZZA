<?php
declare(strict_types=1);

namespace Alci\Servicios;

use Alci\Core\Db;

final class Config
{
    /** Config general como array asociativo ([] si no existe). */
    public static function leer(): array
    {
        $v = Db::valor("SELECT valor FROM config WHERE clave = 'general'");
        $d = is_string($v) ? json_decode($v, true) : null;
        return is_array($d) ? $d : [];
    }

    public static function guardar(array $cfg): void
    {
        $json = json_encode($cfg ?: new \stdClass(), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        Db::ejecutar("INSERT INTO config (clave, valor) VALUES ('general', ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)", [$json]);
    }

    public static function aMetodo(array $m): array
    {
        return ['codigo' => $m['codigo'], 'nombre' => $m['nombre'], 'numero' => $m['numero'] ?? null, 'activo' => (bool) (int) $m['activo']];
    }

    public static function metodosPago(bool $soloActivos = false): array
    {
        $sql = 'SELECT * FROM metodos_pago' . ($soloActivos ? ' WHERE activo = 1' : '') . ' ORDER BY orden';
        return array_map([self::class, 'aMetodo'], Db::todos($sql));
    }
}
