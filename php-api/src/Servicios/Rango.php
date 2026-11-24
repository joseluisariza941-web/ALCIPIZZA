<?php
declare(strict_types=1);

namespace Alci\Servicios;

use Alci\Core\V;

/**
 * Rango de fechas de listados y reportes: ?desde&hasta. AAAA-MM-DD es el día en Bogotá ("hasta" incluye
 * el día completo). También acepta un instante ISO 8601 completo; en ese caso "hasta" es exclusivo.
 */
final class Rango
{
    private const DIA = '/^\d{4}-\d{2}-\d{2}$/';

    private static function inicio(string $s): ?\DateTimeImmutable
    {
        try {
            if (preg_match(self::DIA, $s)) {
                $d = \DateTimeImmutable::createFromFormat('!Y-m-d', $s, Horario::zona());
                return $d && $d->format('Y-m-d') === $s ? $d : null;
            }
            if (!preg_match('/^\d{4}-\d{2}-\d{2}T/', $s)) return null;
            return new \DateTimeImmutable($s);
        } catch (\Exception) {
            return null;
        }
    }

    /** Valida ?desde y ?hasta (400 VALIDACION si no son fechas). */
    public static function validar(array $query): array
    {
        $r = [];
        foreach (['desde', 'hasta'] as $k) {
            if (!isset($query[$k])) continue;
            $s = trim($query[$k]);
            if (!self::inicio($s)) V::fallo("Fecha \"$k\" no válida (usa AAAA-MM-DD)", $k);
            $r[$k] = $s;
        }
        return $r;
    }

    /**
     * {desde, hasta} validados → instantes [desde, hasta) (DateTimeImmutable o null).
     * Para SQL usar Fmt::sql($d).
     */
    public static function rango(array $q, bool $hoyPorDefecto = false): array
    {
        $hoy = Horario::inicioDia();
        $desde = isset($q['desde']) ? self::inicio($q['desde']) : ($hoyPorDefecto ? $hoy : null);
        $hasta = null;
        if (isset($q['hasta'])) {
            $hasta = preg_match(self::DIA, $q['hasta']) ? self::inicio($q['hasta'])->modify('+1 day') : self::inicio($q['hasta']);
        } elseif ($hoyPorDefecto) {
            $hasta = $hoy->modify('+1 day');
        }
        return ['desde' => $desde, 'hasta' => $hasta];
    }
}
