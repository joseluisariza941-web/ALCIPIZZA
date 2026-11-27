<?php
declare(strict_types=1);

namespace Alci\Core;

/**
 * Sesión en la tabla `sessions` (misma forma que express-mysql-session: session_id, expires en segundos,
 * data en JSON). Cookie httpOnly + SameSite=Strict (+ Secure en producción).
 * - Se cierra tras 30 min sin uso (cada respuesta renueva el vencimiento) y dura máximo 12 h (creadoEn en ms).
 * - Solo se crea cuando se guarda algo (como saveUninitialized: false).
 */
final class Sesion
{
    public const COOKIE = 'alcipizza.sid';
    public const INACTIVIDAD = 1800;              // segundos
    public const DURACION_MS = 12 * 3600 * 1000;  // tope absoluto

    private static ?string $id = null;
    private static array $data = [];
    private static bool $cambio = false;
    private static bool $borrarCookie = false;

    public static function iniciar(): void
    {
        self::$id = null; self::$data = []; self::$cambio = false; self::$borrarCookie = false;
        $id = self::cookieEntrante();
        if (is_string($id) && preg_match('/^[A-Za-z0-9_-]{32,128}$/', $id)) {
            $fila = Db::uno('SELECT data FROM sessions WHERE session_id = ? AND expires > ?', [$id, time()]);
            if ($fila) {
                self::$id = $id;
                $d = json_decode((string) $fila['data'], true);
                self::$data = is_array($d) ? $d : [];
            }
        }
        $creado = self::$data['creadoEn'] ?? null;
        if (is_numeric($creado) && Fmt::ms() - (int) $creado > self::DURACION_MS) self::regenerar();
    }

    public static function get(string $k, mixed $porDefecto = null): mixed { return self::$data[$k] ?? $porDefecto; }

    public static function set(string $k, mixed $v): void { self::$data[$k] = $v; self::$cambio = true; }

    public static function quitar(string $k): void { unset(self::$data[$k]); self::$cambio = true; }

    /** Id de la sesión actual (lo crea si aún no existe). */
    public static function id(): string
    {
        if (!self::$id) { self::$id = self::nuevoId(); self::$cambio = true; }
        return self::$id;
    }

    /** Nueva sesión vacía con otro id (contra fijación de sesión: usar al iniciar sesión). */
    public static function regenerar(): void
    {
        if (self::$id) Db::ejecutar('DELETE FROM sessions WHERE session_id = ?', [self::$id]);
        self::$id = null; self::$data = []; self::$cambio = true;
    }

    /** Borra la sesión y la cookie. */
    public static function destruir(): void
    {
        if (self::$id) Db::ejecutar('DELETE FROM sessions WHERE session_id = ?', [self::$id]);
        self::$id = null; self::$data = []; self::$cambio = false; self::$borrarCookie = true;
    }

    /** Guarda y manda la cookie. Se llama una vez, justo antes de responder. */
    public static function cerrar(): void
    {
        if (!self::$id && !self::$data) {
            if (self::$borrarCookie) self::cookie('', -1);
            return;
        }
        if (!self::$id) self::$id = self::nuevoId();
        $ttl = self::INACTIVIDAD;
        if (isset(self::$data['creadoEn'])) {
            $restante = intdiv(self::DURACION_MS - (Fmt::ms() - (int) self::$data['creadoEn']), 1000);
            $ttl = max(1, min($ttl, $restante));
        }
        $json = self::$data ? Respuesta::json(self::$data) : '{}';
        Db::ejecutar('INSERT INTO sessions (session_id, expires, data) VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE expires = VALUES(expires), data = VALUES(data)', [self::$id, time() + $ttl, $json]);
        self::cookie(self::$id, $ttl);
    }

    /** Lee la cookie del encabezado (PHP cambia "." por "_" en $_COOKIE: alcipizza.sid → alcipizza_sid). */
    private static function cookieEntrante(): ?string
    {
        foreach (explode(';', (string) ($_SERVER['HTTP_COOKIE'] ?? '')) as $par) {
            [$k, $v] = array_pad(explode('=', $par, 2), 2, '');
            if (trim($k) === self::COOKIE) return rawurldecode(trim($v));
        }
        return null;
    }

    private static function nuevoId(): string { return rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '='); }

    private static function cookie(string $valor, int $ttl): void
    {
        setcookie(self::COOKIE, $valor, [
            'expires' => $ttl > 0 ? time() + $ttl : 1,
            'path' => '/',
            'httponly' => true,
            'samesite' => 'Strict',
            'secure' => env('APP_ENV') === 'production',
        ]);
    }

    /** Borra las sesiones de un usuario en MySQL, salvo la indicada (cambio de clave, desactivar). */
    public static function cerrarDe(int $usuarioId, ?string $exceptoId = null): void
    {
        $sql = "DELETE FROM sessions WHERE JSON_VALID(data) AND JSON_EXTRACT(data, '$.userId') = ?";
        $p = [$usuarioId];
        if ($exceptoId) { $sql .= ' AND session_id <> ?'; $p[] = $exceptoId; }
        Db::ejecutar($sql, $p);
    }

    /** Borra las sesiones vencidas (datos técnicos efímeros). */
    public static function limpiarVencidas(): int
    {
        return Db::ejecutar('DELETE FROM sessions WHERE expires <= ?', [time()]);
    }

    /** Id actual sin crearla (null si no hay). */
    public static function idActual(): ?string { return self::$id; }
}
