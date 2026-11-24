<?php
declare(strict_types=1);

namespace Alci\Servicios;

/** Hora de Bogotá (UTC-5, sin horario de verano). Igual que horario.js. */
final class Horario
{
    public static function zona(): \DateTimeZone { return new \DateTimeZone('America/Bogota'); }

    public static function ahora(): \DateTimeImmutable { return new \DateTimeImmutable('now', self::zona()); }

    /** 'YYYY-MM-DD' en Bogotá. */
    public static function fecha(?\DateTimeInterface $d = null): string
    {
        return \DateTimeImmutable::createFromInterface($d ?? self::ahora())->setTimezone(self::zona())->format('Y-m-d');
    }

    /** Inicio del día (Bogotá). */
    public static function inicioDia(?\DateTimeInterface $d = null): \DateTimeImmutable
    {
        return new \DateTimeImmutable(self::fecha($d) . ' 00:00:00', self::zona());
    }

    /** ['dia' => lunes=0..domingo=6, 'hora' => decimal] en Bogotá. */
    public static function ahoraBogota(?\DateTimeInterface $d = null): array
    {
        $b = \DateTimeImmutable::createFromInterface($d ?? self::ahora())->setTimezone(self::zona());
        return ['dia' => ((int) $b->format('w') + 6) % 7, 'hora' => (int) $b->format('G') + (int) $b->format('i') / 60];
    }

    /** ¿Abierto según h (lunes..domingo, [abre, cierra] o null)? */
    public static function estaAbierto(mixed $h, ?\DateTimeInterface $d = null): bool
    {
        ['dia' => $dia, 'hora' => $hora] = self::ahoraBogota($d);
        $x = is_array($h) ? ($h[$dia] ?? null) : null;
        return is_array($x) && count($x) >= 2 && $hora >= (float) $x[0] && $hora < (float) $x[1];
    }
}
