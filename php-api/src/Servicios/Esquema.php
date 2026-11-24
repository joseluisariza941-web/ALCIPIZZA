<?php
declare(strict_types=1);

namespace Alci\Servicios;

use Alci\Core\Fmt;
use Alci\Core\HttpError;

/**
 * Mini-zod para portar esquemas z.object(...) con los mismos mensajes (zod 4) y el mismo orden de errores.
 * Cada esquema es un Closure fn(mixed $v, array $path, array &$issues): mixed que devuelve el valor ya
 * limpio (trim, defaults). Un campo ausente (undefined en JS) se representa con Esquema::falta().
 *
 * Mensajes: si la regla trae mensaje propio se usa ese; si no, el `error` del esquema (como
 * z.string({ error })); si no, el mensaje por defecto de zod 4.
 */
final class Esquema
{
    private static ?\stdClass $falta = null;

    /** Valor "undefined": la clave no vino. */
    public static function falta(): \stdClass { return self::$falta ??= new \stdClass(); }

    /** validar() de middleware/validar.js: 400 VALIDACION con el primer mensaje y los issues. */
    public static function validar(\Closure $esquema, mixed $datos): array
    {
        $issues = [];
        $r = $esquema($datos ?? [], [], $issues);
        if ($issues) throw new HttpError(400, $issues[0]['message'] ?: 'Datos no válidos', 'VALIDACION', $issues);
        return $r;
    }

    public static function issue(array &$issues, string $msg, array $path): void
    {
        $issues[] = ['message' => $msg, 'path' => $path];
    }

    /** Nombre del tipo como lo muestra zod ("received ..."). */
    public static function tipo(mixed $v): string
    {
        return match (true) {
            $v === self::falta() => 'undefined',
            $v === null => 'null',
            is_bool($v) => 'boolean',
            is_int($v), is_float($v) => is_float($v) && is_nan($v) ? 'NaN' : (is_float($v) && is_infinite($v) ? 'Infinity' : 'number'),
            is_string($v) => 'string',
            is_array($v) => self::esLista($v) ? 'array' : 'object',
            default => 'object',
        };
    }

    private static function esLista(array $v): bool { return $v !== [] && array_is_list($v); }

    /** Largo como String.length de JS (unidades UTF-16). */
    public static function largo(string $s): int { return intdiv(strlen(mb_convert_encoding($s, 'UTF-16LE', 'UTF-8')), 2); }

    /** String.prototype.trim de JS. */
    public static function trim(string $s): string
    {
        return preg_replace('/^[\s\p{Z}\x{FEFF}]+|[\s\p{Z}\x{FEFF}]+$/u', '', $s) ?? trim($s);
    }

    /** Número como lo imprime JS (String(n)). */
    public static function jsNum(int|float $x): string
    {
        if (is_int($x)) return (string) $x;
        if (floor($x) == $x && abs($x) < 1e21) return number_format($x, 0, '.', '');
        return str_replace(['E+', 'E-'], ['e+', 'e-'], (string) $x);
    }

    /* ---------- tipos ---------- */

    /** z.string(): $trim, min/max como [n, mensaje|null]. */
    public static function texto(?string $error = null, bool $trim = false, ?array $min = null, ?array $max = null): \Closure
    {
        return function (mixed $v, array $path, array &$is) use ($error, $trim, $min, $max) {
            if (!is_string($v)) { self::issue($is, $error ?? 'Invalid input: expected string, received ' . self::tipo($v), $path); return $v; }
            if ($trim) $v = self::trim($v);
            $l = self::largo($v);
            if ($min && $l < $min[0]) self::issue($is, $min[1] ?? $error ?? "Too small: expected string to have >={$min[0]} characters", $path);
            if ($max && $l > $max[0]) self::issue($is, $max[1] ?? $error ?? "Too big: expected string to have <={$max[0]} characters", $path);
            return $v;
        };
    }

    /**
     * z.number(): $entero = mensaje|true para .int(); $min/$max = [n, msg|null]; $positivo = msg|true para .positive().
     */
    public static function numero(?string $error = null, string|bool $entero = false, ?array $min = null, ?array $max = null, string|bool $positivo = false): \Closure
    {
        return function (mixed $v, array $path, array &$is) use ($error, $entero, $min, $max, $positivo) {
            if (!(is_int($v) || is_float($v)) || is_nan((float) $v) || is_infinite((float) $v)) {
                self::issue($is, $error ?? 'Invalid input: expected number, received ' . self::tipo($v), $path);
                return $v;
            }
            if ($entero !== false) {
                if (floor((float) $v) != $v) {
                    self::issue($is, is_string($entero) ? $entero : ($error ?? 'Invalid input: expected int, received number'), $path);
                    return $v;
                }
                if (abs((float) $v) > 9007199254740991) {
                    self::issue($is, $error ?? ($v > 0 ? 'Too big: expected int to be <=9007199254740991' : 'Too small: expected int to be >=-9007199254740991'), $path);
                    return $v;
                }
            }
            if ($positivo !== false && $v <= 0) self::issue($is, is_string($positivo) ? $positivo : ($error ?? 'Too small: expected number to be >0'), $path);
            if ($min && $v < $min[0]) self::issue($is, $min[1] ?? $error ?? 'Too small: expected number to be >=' . self::jsNum($min[0]), $path);
            if ($max && $v > $max[0]) self::issue($is, $max[1] ?? $error ?? 'Too big: expected number to be <=' . self::jsNum($max[0]), $path);
            return Fmt::num($v);
        };
    }

    public static function booleano(?string $error = null): \Closure
    {
        return function (mixed $v, array $path, array &$is) use ($error) {
            if (!is_bool($v)) self::issue($is, $error ?? 'Invalid input: expected boolean, received ' . self::tipo($v), $path);
            return $v;
        };
    }

    public static function enumeracion(array $opciones, ?string $error = null): \Closure
    {
        return function (mixed $v, array $path, array &$is) use ($opciones, $error) {
            if (!is_string($v) || !in_array($v, $opciones, true)) {
                self::issue($is, $error ?? 'Invalid option: expected one of ' . implode('|', array_map(fn($o) => "\"$o\"", $opciones)), $path);
            }
            return $v;
        };
    }

    /** z.array(item) con min/max/length = [n, msg|null]. */
    public static function arreglo(\Closure $item, ?array $min = null, ?array $max = null, ?array $largo = null): \Closure
    {
        return function (mixed $v, array $path, array &$is) use ($item, $min, $max, $largo) {
            if (!is_array($v) || ($v !== [] && !array_is_list($v))) {
                self::issue($is, 'Invalid input: expected array, received ' . self::tipo($v), $path);
                return $v;
            }
            $out = [];
            foreach ($v as $i => $x) $out[] = $item($x, [...$path, $i], $is);
            $n = count($v);
            if ($min && $n < $min[0]) self::issue($is, $min[1] ?? "Too small: expected array to have >={$min[0]} items", $path);
            if ($max && $n > $max[0]) self::issue($is, $max[1] ?? "Too big: expected array to have <={$max[0]} items", $path);
            if ($largo && $n !== $largo[0]) {
                self::issue($is, $largo[1] ?? ($n < $largo[0] ? "Too small: expected array to have >={$largo[0]} items" : "Too big: expected array to have <={$largo[0]} items"), $path);
            }
            return $out;
        };
    }

    /** z.tuple([...]). */
    public static function tupla(array $items): \Closure
    {
        return function (mixed $v, array $path, array &$is) use ($items) {
            if (!is_array($v) || ($v !== [] && !array_is_list($v))) {
                self::issue($is, 'Invalid input: expected tuple, received ' . self::tipo($v), $path);
                return $v;
            }
            $n = count($items);
            if (count($v) < $n) { self::issue($is, "Too small: expected array to have >=$n items", $path); return $v; }
            if (count($v) > $n) { self::issue($is, "Too big: expected array to have <=$n items", $path); return $v; }
            $out = [];
            foreach ($items as $i => $s) $out[] = $s($v[$i], [...$path, $i], $is);
            return $out;
        };
    }

    /** z.object(shape) (.strict() con $estricto). Las claves ausentes que siguen ausentes no salen. */
    public static function objeto(array $forma, bool $estricto = false): \Closure
    {
        return function (mixed $v, array $path, array &$is) use ($forma, $estricto) {
            if (!is_array($v) || self::esLista($v)) {
                self::issue($is, 'Invalid input: expected object, received ' . self::tipo($v), $path);
                return $v;
            }
            $out = [];
            foreach ($forma as $k => $s) {
                $r = $s(array_key_exists($k, $v) ? $v[$k] : self::falta(), [...$path, $k], $is);
                if ($r !== self::falta()) $out[$k] = $r;
            }
            if ($estricto) {
                $sobran = array_values(array_filter(array_keys($v), fn($k) => !array_key_exists($k, $forma)));
                if ($sobran) {
                    $lista = implode(', ', array_map(fn($k) => "\"$k\"", $sobran));
                    self::issue($is, (count($sobran) > 1 ? 'Unrecognized keys: ' : 'Unrecognized key: ') . $lista, $path);
                }
            }
            return $out;
        };
    }

    /* ---------- modificadores ---------- */

    public static function opcional(\Closure $s): \Closure
    {
        return fn(mixed $v, array $path, array &$is) => $v === self::falta() ? $v : $s($v, $path, $is);
    }

    public static function nulable(\Closure $s): \Closure
    {
        return fn(mixed $v, array $path, array &$is) => $v === null ? null : $s($v, $path, $is);
    }

    public static function porDefecto(\Closure $s, mixed $def): \Closure
    {
        return fn(mixed $v, array $path, array &$is) => $v === self::falta() ? $def : $s($v, $path, $is);
    }

    /**
     * Id de la URL como z.object({ id: z.coerce.number().int().positive() }) (400 VALIDACION si no sirve).
     */
    public static function idUrl(array $params, string $k = 'id'): int
    {
        $s = self::trim((string) ($params[$k] ?? ''));
        $n = match (true) {
            $s === '' => 0,
            (bool) preg_match('/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i', $s) => (float) $s,
            (bool) preg_match('/^0x[0-9a-f]+$/i', $s) => (float) hexdec(substr($s, 2)),
            (bool) preg_match('/^0b[01]+$/i', $s) => (float) bindec(substr($s, 2)),
            (bool) preg_match('/^0o[0-7]+$/i', $s) => (float) octdec(substr($s, 2)),
            (bool) preg_match('/^[+-]?Infinity$/', $s) => str_starts_with($s, '-') ? -INF : INF,
            default => NAN,
        };
        $esquema = self::objeto([$k => self::numero(entero: true, positivo: true)]);
        $issues = [];
        if (is_nan((float) $n) || is_infinite((float) $n)) {
            self::issue($issues, 'Invalid input: expected number, received ' . (is_nan($n) ? 'NaN' : 'Infinity'), [$k]);
        } else {
            $esquema([$k => $n], [], $issues);
        }
        if ($issues) throw new HttpError(400, $issues[0]['message'], 'VALIDACION', $issues);
        return (int) $n;
    }
}
