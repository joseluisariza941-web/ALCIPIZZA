<?php
declare(strict_types=1);

namespace Alci\Core;

/**
 * Respuesta con estado distinto de 200. Un handler puede devolver:
 *  - un array/escalar   → 200 con ese JSON
 *  - Respuesta::con(201, $datos)
 *  - Respuesta::vacia() → 204 sin cuerpo
 */
final class Respuesta
{
    private function __construct(public readonly int $status, public readonly mixed $datos, public readonly bool $sinCuerpo = false) {}

    public static function con(int $status, mixed $datos): self { return new self($status, $datos); }
    public static function vacia(int $status = 204): self { return new self($status, null, true); }

    /** JSON igual al de Express: sin escapar / ni unicode; los objetos vacíos deben pasarse como new \stdClass. */
    public static function json(mixed $datos): string
    {
        return json_encode($datos, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR | JSON_INVALID_UTF8_SUBSTITUTE);
    }

    public static function enviar(int $status, mixed $datos, bool $sinCuerpo = false): void
    {
        http_response_code($status);
        if ($sinCuerpo) return;
        header('Content-Type: application/json; charset=utf-8');
        echo self::json($datos);
    }
}
