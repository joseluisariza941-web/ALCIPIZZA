<?php
declare(strict_types=1);

namespace Alci\Core;

/**
 * Validación de entradas (reemplaza zod). Cada regla lanza 400 VALIDACION con el mensaje en español
 * que tenía el esquema zod original y `detalles` = [{ message, path }].
 */
final class V
{
    public static function fallo(string $mensaje, string|array $path = []): never
    {
        $path = is_array($path) ? $path : [$path];
        throw new HttpError(400, $mensaje, 'VALIDACION', [['message' => $mensaje, 'path' => $path]]);
    }

    /** Texto obligatorio: recorta (si $trim), exige min..max caracteres. */
    public static function texto(array $d, string $k, string $msgFalta, int $min = 1, int $max = 1000, bool $trim = true, ?string $msgMin = null): string
    {
        $v = $d[$k] ?? null;
        if (!is_string($v)) self::fallo($msgFalta, $k);
        if ($trim) $v = trim($v);
        if (mb_strlen($v) < $min) self::fallo($msgMin ?? $msgFalta, $k);
        if (mb_strlen($v) > $max) self::fallo("Máximo $max caracteres", $k);
        return $v;
    }

    /** Texto opcional: null si no vino (o vino null), si no aplica texto(). */
    public static function textoOpc(array $d, string $k, string $msg, int $min = 0, int $max = 1000, bool $trim = true): ?string
    {
        if (!array_key_exists($k, $d) || $d[$k] === null) return null;
        return self::texto($d, $k, $msg, $min, $max, $trim);
    }

    /** Número (acepta int/float JSON; no acepta texto salvo $coaccionar, como z.coerce). */
    public static function numero(array $d, string $k, string $msg, ?float $min = null, ?float $max = null, bool $entero = false, bool $coaccionar = false): int|float
    {
        $v = $d[$k] ?? null;
        if ($coaccionar && is_string($v) && is_numeric(trim($v))) $v = trim($v) + 0;
        if (!is_int($v) && !is_float($v)) self::fallo($msg, $k);
        if (!is_finite((float) $v)) self::fallo($msg, $k);
        if ($entero && floor((float) $v) != $v) self::fallo($msg, $k);
        if ($min !== null && $v < $min) self::fallo($msg, $k);
        if ($max !== null && $v > $max) self::fallo($msg, $k);
        return $entero ? (int) $v : Fmt::num($v);
    }

    public static function enumeracion(array $d, string $k, array $opciones, string $msg): string
    {
        $v = $d[$k] ?? null;
        if (!is_string($v) || !in_array($v, $opciones, true)) self::fallo($msg, $k);
        return $v;
    }

    public static function booleano(array $d, string $k, string $msg): bool
    {
        $v = $d[$k] ?? null;
        if (!is_bool($v)) self::fallo($msg, $k);
        return $v;
    }

    /** Id numérico de la URL (/:id). 404 si no es entero positivo. */
    public static function id(array $params, string $k = 'id', string $msg = 'No encontrado'): int
    {
        $v = $params[$k] ?? '';
        if (!preg_match('/^[1-9]\d{0,9}$/', $v)) throw new HttpError(404, $msg);
        return (int) $v;
    }
}
