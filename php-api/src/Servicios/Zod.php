<?php
declare(strict_types=1);

namespace Alci\Servicios;

use Alci\Core\HttpError;

/**
 * Validador que reproduce los mensajes y el orden de issues de zod 4 (como middleware/validar.js):
 * junta todos los issues de los campos (en el orden del esquema) y al final lanza 400 VALIDACION
 * con el mensaje del primero y `detalles` = issues.
 *
 *   $z = new Zod($req->body);
 *   $usuario = $z->cadena('usuario', ['trim' => true, 'min' => 1, 'error' => 'Escribe el usuario']);
 *   $z->fin();
 */
final class Zod
{
    /** @var list<array<string,mixed>> */
    private array $issues = [];
    private array $d;

    public function __construct(mixed $datos)
    {
        $datos ??= [];
        if (!is_array($datos) || ($datos !== [] && array_is_list($datos))) {
            $this->issues[] = ['expected' => 'object', 'code' => 'invalid_type', 'path' => [],
                'message' => 'Invalid input: expected object, received ' . self::tipo($datos, true)];
            $datos = [];
        }
        $this->d = $datos;
    }

    /** Nombre del tipo recibido como lo escribe zod. */
    public static function tipo(mixed $v, bool $presente = true): string
    {
        if (!$presente) return 'undefined';
        return match (true) {
            $v === null => 'null',
            is_bool($v) => 'boolean',
            is_int($v), is_float($v) => 'number',
            is_string($v) => 'string',
            is_array($v) => ($v !== [] && array_is_list($v)) ? 'array' : 'object',
            default => 'object',
        };
    }

    /** Largo como String.length de JS (unidades UTF-16). */
    public static function largo(string $s): int
    {
        return intdiv(strlen(mb_convert_encoding($s, 'UTF-16LE', 'UTF-8')), 2);
    }

    /** trim() de JS (espacios Unicode incluidos). */
    public static function recortar(string $s): string
    {
        return preg_replace('/^[\s\p{Z}\x{FEFF}]+|[\s\p{Z}\x{FEFF}]+$/u', '', $s) ?? trim($s);
    }

    private function issue(array $i): void { $this->issues[] = $i; }

    private function tipoMal(string $k, string $esperado, ?string $msg): void
    {
        $presente = array_key_exists($k, $this->d);
        $this->issue(['expected' => $esperado, 'code' => 'invalid_type', 'path' => [$k],
            'message' => $msg ?? "Invalid input: expected $esperado, received " . self::tipo($this->d[$k] ?? null, $presente)]);
    }

    /** ¿Falta el campo (para .optional() / .partial())? */
    private function falta(string $k): bool { return !array_key_exists($k, $this->d); }

    /**
     * z.string() con opciones, en el orden en que se aplican:
     *  trim, lower (antes de las reglas si 'lowerAntes'), min/msgMin, max/msgMax, regex/msgRegex, lower (después).
     *  'error' = mensaje personalizado para cualquier issue sin mensaje propio; 'opcional' = .optional().
     */
    public function cadena(string $k, array $o = []): ?string
    {
        if (($o['opcional'] ?? false) && $this->falta($k)) return null;
        $v = $this->d[$k] ?? null;
        $err = $o['error'] ?? null;
        if (!is_string($v)) { $this->tipoMal($k, 'string', $err); return null; }
        if ($o['trim'] ?? false) $v = self::recortar($v);
        if ($o['lowerAntes'] ?? false) $v = mb_strtolower($v);
        $n = self::largo($v);
        $ok = true;
        if (isset($o['min']) && $n < $o['min']) {
            $ok = false;
            $this->issue(['origin' => 'string', 'code' => 'too_small', 'minimum' => $o['min'], 'inclusive' => true, 'path' => [$k],
                'message' => $o['msgMin'] ?? $err ?? "Too small: expected string to have >={$o['min']} characters"]);
        }
        if (isset($o['max']) && $n > $o['max']) {
            $ok = false;
            $this->issue(['origin' => 'string', 'code' => 'too_big', 'maximum' => $o['max'], 'inclusive' => true, 'path' => [$k],
                'message' => $o['msgMax'] ?? $err ?? "Too big: expected string to have <={$o['max']} characters"]);
        }
        if (isset($o['regex']) && !preg_match($o['regex'], $v)) {
            $ok = false;
            $this->issue(['origin' => 'string', 'code' => 'invalid_format', 'format' => 'regex', 'pattern' => $o['regex'], 'path' => [$k],
                'message' => $o['msgRegex'] ?? $err ?? 'Invalid string: must match pattern ' . $o['regex']]);
        }
        if (isset($o['refine']) && $ok && !($o['refine'])($v)) {
            $this->issue(['code' => 'custom', 'path' => [$k], 'message' => $o['msgRefine'] ?? 'Invalid input']);
        }
        if ($o['lower'] ?? false) $v = mb_strtolower($v);
        return $v;
    }

    /** z.boolean() */
    public function booleano(string $k, bool $opcional = false, ?string $msg = null): ?bool
    {
        if ($opcional && $this->falta($k)) return null;
        $v = $this->d[$k] ?? null;
        if (!is_bool($v)) { $this->tipoMal($k, 'boolean', $msg); return null; }
        return $v;
    }

    /** z.enum([...], { error }) */
    public function enumeracion(string $k, array $opciones, ?string $msg = null): ?string
    {
        $v = $this->d[$k] ?? null;
        if (!is_string($v) || !in_array($v, $opciones, true)) {
            $this->issue(['code' => 'invalid_value', 'values' => $opciones, 'path' => [$k],
                'message' => $msg ?? 'Invalid option: expected one of ' . implode('|', array_map(fn($x) => "\"$x\"", $opciones))]);
            return null;
        }
        return $v;
    }

    /** Number(x) de JS para texto (z.coerce.number()). */
    public static function numeroJs(mixed $v): float
    {
        if ($v === null) return 0.0;
        if (is_bool($v)) return $v ? 1.0 : 0.0;
        if (is_int($v) || is_float($v)) return (float) $v;
        if (!is_string($v)) return NAN;
        $s = self::recortar($v);
        if ($s === '') return 0.0;
        if (preg_match('/^0x([0-9a-f]+)$/iD', $s, $m)) return (float) hexdec($m[1]);
        if (preg_match('/^0o([0-7]+)$/iD', $s, $m)) return (float) octdec($m[1]);
        if (preg_match('/^0b([01]+)$/iD', $s, $m)) return (float) bindec($m[1]);
        if (preg_match('/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/iD', $s)) return (float) $s;
        if (preg_match('/^([+-]?)Infinity$/D', $s, $m)) return $m[1] === '-' ? -INF : INF;
        return NAN;
    }

    /**
     * z.coerce.number().int() con min/max/positive y .default().
     * @param array{min?:int,max?:int,positivo?:bool,defecto?:int} $o
     */
    public function enteroCoaccion(string $k, array $o = []): ?int
    {
        if ($this->falta($k) && array_key_exists('defecto', $o)) return $o['defecto'];
        $n = self::numeroJs($this->d[$k] ?? null);
        if ($this->falta($k)) $n = NAN; // Number(undefined)
        if (is_nan($n)) {
            $this->issue(['expected' => 'number', 'code' => 'invalid_type', 'received' => 'NaN', 'path' => [$k],
                'message' => 'Invalid input: expected number, received NaN']);
            return null;
        }
        $ok = true;
        if (!is_finite($n) || floor($n) != $n || abs($n) > 9007199254740991) {
            $ok = false;
            $this->issue(['expected' => 'int', 'format' => 'safeint', 'code' => 'invalid_type', 'path' => [$k],
                'message' => 'Invalid input: expected int, received number']);
        }
        if (($o['positivo'] ?? false) && $n <= 0) {
            $ok = false;
            $this->issue(['origin' => 'number', 'code' => 'too_small', 'minimum' => 0, 'inclusive' => false, 'path' => [$k],
                'message' => 'Too small: expected number to be >0']);
        }
        if (isset($o['min']) && $n < $o['min']) {
            $ok = false;
            $this->issue(['origin' => 'number', 'code' => 'too_small', 'minimum' => $o['min'], 'inclusive' => true, 'path' => [$k],
                'message' => "Too small: expected number to be >={$o['min']}"]);
        }
        if (isset($o['max']) && $n > $o['max']) {
            $ok = false;
            $this->issue(['origin' => 'number', 'code' => 'too_big', 'maximum' => $o['max'], 'inclusive' => true, 'path' => [$k],
                'message' => "Too big: expected number to be <={$o['max']}"]);
        }
        return $ok ? (int) $n : null;
    }

    /** Lanza 400 VALIDACION si hubo issues. */
    public function fin(): void
    {
        if ($this->issues) {
            throw new HttpError(400, (string) ($this->issues[0]['message'] ?? 'Datos no válidos'), 'VALIDACION', $this->issues);
        }
    }
}
