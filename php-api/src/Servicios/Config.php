<?php
declare(strict_types=1);

namespace Alci\Servicios;

use Alci\Core\Db;
use Alci\Servicios\Archivo;

final class Config
{
    /** Sonidos de notificación de cocina (los sintetiza el navegador). */
    public const SONIDOS = ['campana', 'timbre', 'pulso', 'arpegio', 'alarma'];

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
        $r = ['codigo' => $m['codigo'], 'nombre' => $m['nombre'], 'numero' => $m['numero'] ?? null, 'activo' => (bool) (int) $m['activo'],
            'qrUrl' => ($m['qr_url'] ?? '') !== '' ? $m['qr_url'] : null];
        return Archivo::marcar($r, $m);
    }

    public static function metodosPago(bool $soloActivos = false, bool $soloEliminados = false): array
    {
        $f = [];
        if ($soloActivos) $f[] = 'activo = 1';
        $f[] = $soloEliminados ? 'eliminado_en IS NOT NULL' : 'eliminado_en IS NULL';
        return array_map([self::class, 'aMetodo'], Db::todos('SELECT * FROM metodos_pago WHERE ' . implode(' AND ', $f) . ' ORDER BY orden'));
    }
}
