<?php
declare(strict_types=1);

namespace Alci\Servicios;

use Alci\Core\Db;
use Alci\Core\HttpError;
use Alci\Core\V;

/** Puntos de fidelidad por celular: se ganan al cobrar y se canjean como descuento. Todo se calcula en el servidor. */
final class Puntos
{
    /** Ajustes con sus valores por defecto. @return array{activo: bool, porMil: int, canje: int, descuento: int} */
    public static function ajustes(?array $cfg = null): array
    {
        $cfg ??= Config::leer();
        return [
            'activo' => ($cfg['puntosActivos'] ?? false) === true,
            'porMil' => max(0, (int) ($cfg['puntosPorMil'] ?? 1)),
            'canje' => max(1, (int) ($cfg['puntosCanje'] ?? 100)),
            'descuento' => max(0, (int) ($cfg['descuentoCanje'] ?? 1000)),
        ];
    }

    /** Celular colombiano de 10 dígitos que empieza por 3 (acepta +57, espacios y guiones). Lanza 400 si no es válido. */
    public static function normalizar(mixed $v, string $campo = 'celular'): string
    {
        $s = is_string($v) ? preg_replace('/[\s\-().]/', '', $v) : '';
        if (str_starts_with($s, '+57')) $s = substr($s, 3);
        elseif (strlen($s) === 12 && str_starts_with($s, '57')) $s = substr($s, 2);
        if (!preg_match('/^3\d{9}$/', $s)) V::fallo('Celular no válido (10 dígitos, empieza por 3)', $campo);
        return $s;
    }

    public static function saldo(string $celular): int
    {
        return (int) Db::valor('SELECT saldo FROM puntos_clientes WHERE celular = ?', [$celular]);
    }

    /**
     * Valida un canje y calcula su descuento sobre $base (total tras promoción).
     * @return array{0: int, 1: int|float} [puntos, descuento]
     */
    public static function canje(int $puntos, ?string $celular, int|float $base): array
    {
        $a = self::ajustes();
        if (!$a['activo'] || $a['descuento'] <= 0) throw new HttpError(400, 'El canje de puntos no está disponible', 'PUNTOS_INACTIVOS');
        if ($celular === null) V::fallo('Escribe tu celular para canjear puntos', 'celular');
        if ($puntos % $a['canje'] !== 0) throw new HttpError(400, "Los puntos se canjean de a {$a['canje']}", 'PUNTOS_INVALIDOS');
        if ($puntos > self::saldo($celular)) throw new HttpError(409, 'No tienes puntos suficientes', 'PUNTOS_INSUFICIENTES');
        $desc = intdiv($puntos, $a['canje']) * $a['descuento'];
        if ($desc > $base) throw new HttpError(400, 'Esos puntos valen más que tu pedido; canjea menos', 'PUNTOS_EXCEDEN');
        return [$puntos, $desc];
    }

    private static function mover(string $celular, ?int $pedidoId, string $tipo, int $puntos, ?string $nombre = null): void
    {
        if ($puntos === 0) return;
        Db::ejecutar('INSERT INTO puntos_clientes (celular, nombre, saldo) VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE saldo = GREATEST(0, saldo + VALUES(saldo)), nombre = COALESCE(VALUES(nombre), nombre)',
            [$celular, $nombre, max(0, $puntos)]);
        if ($puntos < 0) Db::ejecutar('UPDATE puntos_clientes SET saldo = GREATEST(0, saldo + ?) WHERE celular = ?', [$puntos, $celular]);
        Db::insertar('puntos_movimientos', ['celular' => $celular, 'pedido_id' => $pedidoId, 'tipo' => $tipo, 'puntos' => $puntos]);
    }

    /** Descuenta los puntos canjeados al crear el pedido (atómico: falla si el saldo ya no alcanza). Dentro de Db::tx. */
    public static function debitar(string $celular, int $puntos, int $pedidoId): void
    {
        if ($puntos <= 0) return;
        $n = Db::ejecutar('UPDATE puntos_clientes SET saldo = saldo - ? WHERE celular = ? AND saldo >= ?', [$puntos, $celular, $puntos]);
        if (!$n) throw new HttpError(409, 'No tienes puntos suficientes', 'PUNTOS_INSUFICIENTES');
        Db::insertar('puntos_movimientos', ['celular' => $celular, 'pedido_id' => $pedidoId, 'tipo' => 'canjeado', 'puntos' => -$puntos]);
    }

    /** Suma los puntos del pedido recién cobrado. Dentro de Db::tx. */
    public static function ganar(array $pedido): void
    {
        $a = self::ajustes();
        if (!$a['activo'] || empty($pedido['celular'])) return;
        $pts = intdiv((int) floor((float) $pedido['total']), 1000) * $a['porMil'];
        if ($pts <= 0) return;
        self::mover($pedido['celular'], (int) $pedido['id'], 'ganado', $pts, $pedido['cliente'] ?? null);
        Db::ejecutar('UPDATE pedidos SET puntos_ganados = ? WHERE id = ?', [$pts, $pedido['id']]);
    }

    /** Al cancelar: devuelve lo canjeado y quita lo ganado. Dentro de Db::tx, una sola vez por cancelación. */
    public static function alCancelar(array $pedido): void
    {
        if (empty($pedido['celular'])) return;
        $id = (int) $pedido['id'];
        $canjeados = (int) $pedido['puntos_canjeados'];
        $ganados = (int) $pedido['puntos_ganados'];
        if ($canjeados > 0) self::mover($pedido['celular'], $id, 'devuelto', $canjeados);
        if ($ganados > 0) {
            self::mover($pedido['celular'], $id, 'revertido', -$ganados);
            Db::ejecutar('UPDATE pedidos SET puntos_ganados = 0 WHERE id = ?', [$id]);
        }
    }

    /** Devuelve los puntos canjeados de un pedido que se va a re-liquidar (edición). Dentro de Db::tx. */
    public static function devolverCanje(array $pedido): void
    {
        if (!empty($pedido['celular']) && (int) $pedido['puntos_canjeados'] > 0) {
            self::mover($pedido['celular'], (int) $pedido['id'], 'devuelto', (int) $pedido['puntos_canjeados']);
        }
    }
}
