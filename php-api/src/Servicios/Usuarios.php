<?php
declare(strict_types=1);

namespace Alci\Servicios;

use Alci\Core\Db;

final class Usuarios
{
    public static function rondas(): int { return max(4, (int) env('BCRYPT_ROUNDS', '12')); }

    public static function hash(string $clave): string
    {
        return password_hash($clave, PASSWORD_BCRYPT, ['cost' => self::rondas()]);
    }

    /** Hash falso para comparar cuando el usuario no existe (mismo tiempo de respuesta). */
    public static function hashFalso(): string
    {
        static $h = null;
        return $h ??= self::hash(bin2hex(random_bytes(16)));
    }

    /** Usuario público (sin datos sensibles). */
    public static function publico(array $u): array
    {
        return [
            'id' => (int) $u['id'], 'usuario' => $u['usuario'], 'nombre' => $u['nombre'], 'rol' => $u['rol'],
            'activo' => (bool) (int) $u['activo'], 'debeCambiarClave' => (bool) (int) $u['debe_cambiar_clave'],
        ];
    }

    public static function porId(int $id): ?array { return Db::uno('SELECT * FROM usuarios WHERE id = ?', [$id]); }

    /** Incluye `bloqueado` (0/1) calculado en MySQL. */
    public static function porUsuario(string $usuario): ?array
    {
        return Db::uno('SELECT *, (bloqueado_hasta IS NOT NULL AND bloqueado_hasta > NOW()) AS bloqueado
            FROM usuarios WHERE usuario = ?', [$usuario]);
    }
}
