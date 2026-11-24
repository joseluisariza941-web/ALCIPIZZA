<?php
declare(strict_types=1);

namespace Alci\Core;

/** Conversión de valores de MySQL al JSON que daba Express/knex. */
final class Fmt
{
    /** Número como Number() de JS: '28000.00' → 28000 (int, sin ".0"), '2.5' → 2.5; null queda null. */
    public static function num(mixed $x): int|float|null
    {
        if ($x === null || $x === '') return $x === null ? null : 0;
        $f = (float) $x;
        return (floor($f) == $f && abs($f) < 9.0e15) ? (int) $f : $f;
    }

    public static function bool(mixed $x): bool { return (bool) (int) $x; }

    /** JSON guardado como texto → array (o el valor si ya viene decodificado). */
    public static function json(mixed $x): mixed
    {
        return is_string($x) ? json_decode($x, true) : $x;
    }

    /**
     * DATETIME/TIMESTAMP de MySQL (hora de Bogotá) → ISO UTC como JSON.stringify(new Date()):
     * '2026-11-23 15:04:05' → '2026-11-23T20:04:05.000Z'.
     */
    public static function iso(?string $dt): ?string
    {
        if ($dt === null || $dt === '') return null;
        $d = new \DateTimeImmutable($dt, new \DateTimeZone('America/Bogota'));
        return $d->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d\TH:i:s.v\Z');
    }

    /** Fecha/instante → texto para comparar con DATETIME en SQL (hora de Bogotá). */
    public static function sql(\DateTimeInterface $d): string
    {
        return \DateTimeImmutable::createFromInterface($d)->setTimezone(new \DateTimeZone('America/Bogota'))->format('Y-m-d H:i:s');
    }

    /** Milisegundos actuales (como Date.now()). */
    public static function ms(): int { return (int) floor(microtime(true) * 1000); }
}
