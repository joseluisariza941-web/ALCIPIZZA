<?php
declare(strict_types=1);

namespace Alci\Servicios;

/** Conversión de unidades: masa (g, kg, lb) y volumen (ml, L) se convierten dentro de su grupo; und solo con und. */
final class Unidades
{
    /** Factor a la unidad base de su grupo (g o ml). */
    public const F = ['g' => 1, 'kg' => 1000, 'lb' => 453.592, 'ml' => 1, 'L' => 1000, 'und' => 1];
    public const GRUPO = ['g' => 'masa', 'kg' => 'masa', 'lb' => 'masa', 'ml' => 'volumen', 'L' => 'volumen', 'und' => 'und'];
    public const LISTA = ['und', 'g', 'kg', 'lb', 'L', 'ml'];

    /** Convierte q de la unidad a a la b. Sin unidad, desconocidas o de otro grupo: no convierte. */
    public static function cv(mixed $q, ?string $a, ?string $b): float
    {
        $q = (float) $q;
        if (!$a || !$b || $a === $b || !isset(self::F[$a], self::F[$b]) || self::GRUPO[$a] !== self::GRUPO[$b]) return $q;
        return ($q * self::F[$a]) / self::F[$b];
    }

    /** ¿Se puede pasar de a a b? (mismo grupo). */
    public static function compatibles(?string $a, ?string $b): bool
    {
        return isset(self::GRUPO[$a ?? ''], self::GRUPO[$b ?? '']) && self::GRUPO[$a] === self::GRUPO[$b];
    }
}
