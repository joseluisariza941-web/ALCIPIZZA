<?php
declare(strict_types=1);

namespace Alci\Core;

use PDO;

/**
 * Acceso a MySQL/MariaDB con PDO. Siempre con parámetros (?) — nunca concatenar datos del usuario.
 * La conexión usa la hora de Bogotá (-05:00) igual que knex, así DATETIME se guarda y lee en hora local.
 * Ojo: DECIMAL llega como texto, JSON como texto y TINYINT como int: convertir con Fmt.
 */
final class Db
{
    private static ?PDO $pdo = null;

    public static function pdo(): PDO
    {
        if (!self::$pdo) {
            $dsn = sprintf('mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4',
                env('DB_HOST', '127.0.0.1'), env('DB_PORT', '3306'), env('DB_NAME', 'alcipizza'));
            self::$pdo = new PDO($dsn, env('DB_USER', 'alcipizza'), env('DB_PASSWORD', ''), [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
                PDO::ATTR_STRINGIFY_FETCHES => false,
                // filas encontradas (no solo cambiadas) en UPDATE, igual que mysql2/knex
                (\defined('Pdo\Mysql::ATTR_FOUND_ROWS') ? \constant('Pdo\Mysql::ATTR_FOUND_ROWS') : PDO::MYSQL_ATTR_FOUND_ROWS) => true,
            ]);
            self::$pdo->exec("SET time_zone = '-05:00'");
        }
        return self::$pdo;
    }

    private static function params(array $p): array
    {
        return array_map(fn($v) => is_bool($v) ? (int) $v : $v, $p);
    }

    public static function consulta(string $sql, array $p = []): \PDOStatement
    {
        $st = self::pdo()->prepare($sql);
        // bindValue con tipo: execute([...]) manda todo como texto y, p. ej., JSON_EXTRACT(...) = '7' no iguala al número 7.
        $i = 0;
        foreach (self::params($p) as $k => $v) {
            $tipo = match (true) { is_int($v) => PDO::PARAM_INT, $v === null => PDO::PARAM_NULL, default => PDO::PARAM_STR };
            $st->bindValue(is_int($k) ? ++$i : $k, is_float($v) ? (string) $v : $v, $tipo);
        }
        $st->execute();
        return $st;
    }

    /** @return list<array<string,mixed>> */
    public static function todos(string $sql, array $p = []): array { return self::consulta($sql, $p)->fetchAll(); }

    /** @return array<string,mixed>|null */
    public static function uno(string $sql, array $p = []): ?array { return self::consulta($sql, $p)->fetch() ?: null; }

    public static function valor(string $sql, array $p = []): mixed
    {
        $v = self::consulta($sql, $p)->fetchColumn();
        return $v === false ? null : $v;
    }

    /** Ejecuta y devuelve filas afectadas. */
    public static function ejecutar(string $sql, array $p = []): int { return self::consulta($sql, $p)->rowCount(); }

    /** INSERT con columnas => valores; devuelve el id nuevo. */
    public static function insertar(string $tabla, array $datos): int
    {
        $cols = array_keys($datos);
        $sql = sprintf('INSERT INTO `%s` (%s) VALUES (%s)', $tabla,
            implode(',', array_map(fn($c) => "`$c`", $cols)), implode(',', array_fill(0, count($cols), '?')));
        self::consulta($sql, array_values($datos));
        return (int) self::pdo()->lastInsertId();
    }

    /** UPDATE tabla SET datos WHERE $where (con ? y $p). Devuelve filas afectadas. */
    public static function actualizar(string $tabla, array $datos, string $where, array $p = []): int
    {
        if (!$datos) return 0;
        $set = implode(',', array_map(fn($c) => "`$c` = ?", array_keys($datos)));
        return self::ejecutar("UPDATE `$tabla` SET $set WHERE $where", [...array_values($datos), ...$p]);
    }

    /** "?,?,?" para IN (...) */
    public static function marcas(array $valores): string { return implode(',', array_fill(0, max(1, count($valores)), '?')); }

    /** Ejecuta $fn dentro de una transacción (anidar no abre otra). */
    public static function tx(callable $fn): mixed
    {
        $pdo = self::pdo();
        if ($pdo->inTransaction()) return $fn();
        $pdo->beginTransaction();
        try {
            $r = $fn();
            $pdo->commit();
            return $r;
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $e;
        }
    }
}
