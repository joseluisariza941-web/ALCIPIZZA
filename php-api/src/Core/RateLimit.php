<?php
declare(strict_types=1);

namespace Alci\Core;

/**
 * Límite de peticiones por IP guardado en MySQL (tabla `limites`), equivalente a express-rate-limit
 * con ventana fija. El nombre incluye el máximo, así servidores con límites distintos no se mezclan.
 */
final class RateLimit
{
    /** Cuenta una petición. Devuelve false si ya se pasó del máximo en la ventana. */
    public static function consumir(string $nombre, int $max, int $ventanaSeg, string $ip): bool
    {
        $clave = substr("$nombre:$max:$ip", 0, 190);
        $ahora = time();
        Db::ejecutar('INSERT INTO limites (clave, conteo, reinicia_en) VALUES (?, 1, ?)
            ON DUPLICATE KEY UPDATE
              conteo = IF(reinicia_en <= ?, 1, conteo + 1),
              reinicia_en = IF(reinicia_en <= ?, VALUES(reinicia_en), reinicia_en)',
            [$clave, $ahora + $ventanaSeg, $ahora, $ahora]);
        $n = (int) Db::valor('SELECT conteo FROM limites WHERE clave = ?', [$clave]);
        return $n <= $max;
    }

    /** Devuelve una petición contada (skipSuccessfulRequests: el login correcto no cuenta). */
    public static function devolver(string $nombre, int $max, string $ip): void
    {
        $clave = substr("$nombre:$max:$ip", 0, 190);
        Db::ejecutar('UPDATE limites SET conteo = GREATEST(conteo - 1, 0) WHERE clave = ?', [$clave]);
    }

    /** Lanza 429 LIMITE si se pasó. */
    public static function exigir(string $nombre, int $max, int $ventanaSeg, string $ip, string $mensaje): void
    {
        if (!self::consumir($nombre, $max, $ventanaSeg, $ip)) throw new HttpError(429, $mensaje, 'LIMITE');
    }
}
