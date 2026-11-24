<?php
declare(strict_types=1);

namespace Alci\Servicios;

/** Conversión de unidades igual que cv() de la app original. */
final class Unidades
{
    public const F = ['g' => 1, 'kg' => 1000, 'lb' => 453.592, 'und' => 1];
    public const LISTA = ['g', 'kg', 'lb', 'und'];

    /** Convierte q de la unidad a a la b. Sin unidad, "und" o desconocidas: no convierte. */
    public static function cv(mixed $q, ?string $a, ?string $b): float
    {
        $q = (float) $q;
        if (!$a || !$b || $a === $b || $a === 'und' || $b === 'und' || !isset(self::F[$a], self::F[$b])) return $q;
        return ($q * self::F[$a]) / self::F[$b];
    }

    /** ¿Se puede pasar de a a b? (und solo con und). */
    public static function compatibles(?string $a, ?string $b): bool { return ($a === 'und') === ($b === 'und'); }
}
