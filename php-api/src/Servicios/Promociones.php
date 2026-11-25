<?php
declare(strict_types=1);

namespace Alci\Servicios;

use Alci\Core\Db;
use Alci\Core\Fmt;
use Alci\Core\V;

/** Promociones (descuentos por plato, categoría o total). El servidor es quien calcula siempre el descuento. */
final class Promociones
{
    private const SELECT = 'SELECT pr.*, c.nombre AS categoria_nombre FROM promociones pr LEFT JOIN categorias c ON c.id = pr.categoria_id';
    private const VIGENTES = 'pr.eliminado_en IS NULL';

    public static function etiqueta(array $p): string
    {
        $v = $p['valor'];
        $txt = $p['tipo'] === 'porcentaje' ? "$v% de descuento" : Pedidos::pesos($v) . ' de descuento';
        if ($p['alcance'] === 'total' && $p['montoMinimo']) $txt .= ' desde ' . Pedidos::pesos($p['montoMinimo']);
        return $txt;
    }

    /** ¿Aplica ahora (activa, dentro de fechas, día y franja horaria, hora de Bogotá)? */
    public static function vigente(array $p, ?\DateTimeInterface $ahora = null): bool
    {
        if (!$p['activa']) return false;
        $hoy = Horario::fecha($ahora);
        if ($hoy < $p['inicio'] || $hoy > $p['fin']) return false;
        ['dia' => $dia, 'hora' => $hora] = Horario::ahoraBogota($ahora);
        if ($p['dias'] !== null && !in_array($dia, $p['dias'], true)) return false;
        if ($p['horaDesde'] !== null) {
            $d = self::minutos($p['horaDesde']) / 60;
            $h = self::minutos($p['horaHasta']) / 60;
            $dentro = $d <= $h ? ($hora >= $d && $hora < $h) : ($hora >= $d || $hora < $h);
            if (!$dentro) return false;
        }
        return true;
    }

    private static function minutos(string $hhmm): int
    {
        [$h, $m] = explode(':', $hhmm);
        return (int) $h * 60 + (int) $m;
    }

    public static function aApi(array $f): array
    {
        $p = [
            'id' => (int) $f['id'], 'nombre' => $f['nombre'], 'tipo' => $f['tipo'], 'alcance' => $f['alcance'],
            'platoId' => $f['plato_id'] !== null ? (int) $f['plato_id'] : null,
            'categoria' => $f['categoria_nombre'] ?? null,
            'valor' => Fmt::num($f['valor']), 'montoMinimo' => Fmt::num($f['monto_minimo']),
            'inicio' => substr((string) $f['inicio'], 0, 10), 'fin' => substr((string) $f['fin'], 0, 10),
            'dias' => ($f['dias'] ?? '') !== '' ? array_map('intval', explode(',', $f['dias'])) : null,
            'horaDesde' => $f['hora_desde'] ?: null, 'horaHasta' => $f['hora_hasta'] ?: null,
            'activa' => (bool) (int) $f['activa'],
        ];
        $p['vigente'] = self::vigente($p);
        $p['etiqueta'] = self::etiqueta($p);
        return Archivo::marcar($p, $f);
    }

    /** @return list<array> todas, en formato de la API. */
    public static function todas(bool $soloEliminados = false): array
    {
        $where = $soloEliminados ? 'pr.eliminado_en IS NOT NULL' : self::VIGENTES;
        return array_map([self::class, 'aApi'], Db::todos(self::SELECT . " WHERE $where ORDER BY pr.id DESC"));
    }

    public static function vigentes(): array
    {
        return array_values(array_filter(self::todas(), fn($p) => $p['vigente']));
    }

    public static function una(int $id, bool $incluirEliminados = false): ?array
    {
        $where = 'pr.id = ?' . ($incluirEliminados ? '' : ' AND ' . self::VIGENTES);
        $f = Db::uno(self::SELECT . " WHERE $where", [$id]);
        return $f ? self::aApi($f) : null;
    }

    /** Descuento de una promoción sobre una base (entero en pesos, sin pasar de la base). */
    private static function monto(array $p, int|float $base, int $unidades): int|float
    {
        $d = $p['tipo'] === 'porcentaje' ? round($base * $p['valor'] / 100) : $p['valor'] * $unidades;
        return min($base, $d);
    }

    /** Descuento de una promoción sobre un pedido. $items: filas cotizadas (plato_id, categoria, precio_unitario). */
    public static function descuentoDe(array $p, array $items, int|float $subtotal): int|float
    {
        if ($p['alcance'] === 'total') {
            if ($p['montoMinimo'] && $subtotal < $p['montoMinimo']) return 0;
            return $p['tipo'] === 'porcentaje' ? min($subtotal, round($subtotal * $p['valor'] / 100)) : min($subtotal, $p['valor']);
        }
        $base = 0;
        $n = 0;
        foreach ($items as $it) {
            $coincide = $p['alcance'] === 'plato' ? $it['plato_id'] === $p['platoId'] : ($it['categoria'] ?? null) === $p['categoria'];
            if ($coincide) { $base += $it['precio_unitario']; $n++; }
        }
        return $n ? self::monto($p, $base, $n) : 0;
    }

    /** Mejor promoción vigente (no se acumulan). @return array{0: int|float, 1: ?array} */
    public static function mejor(array $items, int|float $subtotal): array
    {
        $mejor = [0, null];
        foreach (self::vigentes() as $p) {
            $d = self::descuentoDe($p, $items, $subtotal);
            if ($d > $mejor[0]) $mejor = [$d, $p];
        }
        return $mejor;
    }

    // ---------------------------------------------------------------- validación

    private static function fechaValida(mixed $v): bool
    {
        if (!is_string($v) || !preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $v, $m)) return false;
        return checkdate((int) $m[2], (int) $m[3], (int) $m[1]);
    }

    private static function horaValida(mixed $v): bool
    {
        return is_string($v) && (bool) preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $v);
    }

    /** Valida el cuerpo completo (ya mezclado con lo existente) y devuelve la fila a guardar. */
    public static function validar(array $d): array
    {
        $nombre = is_string($d['nombre'] ?? null) ? Pedidos::trim($d['nombre']) : '';
        if ($nombre === '' || mb_strlen($nombre) > 80) V::fallo('Escribe el nombre de la promoción (máximo 80 caracteres)', 'nombre');
        $tipo = $d['tipo'] ?? null;
        if (!in_array($tipo, ['porcentaje', 'monto'], true)) V::fallo('Tipo no válido (porcentaje o monto)', 'tipo');
        $alcance = $d['alcance'] ?? null;
        if (!in_array($alcance, ['plato', 'categoria', 'total'], true)) V::fallo('Alcance no válido (plato, categoria o total)', 'alcance');
        $valor = $d['valor'] ?? null;
        if (!(is_int($valor) || is_float($valor)) || $valor <= 0 || $valor > 100000000) V::fallo('El valor debe ser mayor que 0', 'valor');
        if ($tipo === 'porcentaje' && $valor > 100) V::fallo('El porcentaje no puede pasar de 100', 'valor');
        $fila = ['nombre' => $nombre, 'tipo' => $tipo, 'alcance' => $alcance, 'valor' => $valor,
            'plato_id' => null, 'categoria_id' => null, 'monto_minimo' => null];
        if ($alcance === 'plato') {
            $pid = $d['platoId'] ?? null;
            if (!is_int($pid) || Db::valor('SELECT id FROM platos WHERE id = ? AND eliminado_en IS NULL', [$pid]) === null) V::fallo('Elige un plato válido', 'platoId');
            $fila['plato_id'] = $pid;
        } elseif ($alcance === 'categoria') {
            $cat = $d['categoria'] ?? null;
            $cid = is_string($cat) ? Db::valor('SELECT id FROM categorias WHERE nombre = ?', [$cat]) : null;
            if ($cid === null) V::fallo('Elige una categoría válida', 'categoria');
            $fila['categoria_id'] = (int) $cid;
        }
        $min = $d['montoMinimo'] ?? null;
        if ($min !== null) {
            if ($alcance !== 'total') V::fallo('El monto mínimo solo aplica a promociones sobre el total', 'montoMinimo');
            if (!(is_int($min) || is_float($min)) || $min <= 0) V::fallo('El monto mínimo debe ser mayor que 0', 'montoMinimo');
            $fila['monto_minimo'] = $min;
        }
        foreach (['inicio', 'fin'] as $k) if (!self::fechaValida($d[$k] ?? null)) V::fallo('Fecha no válida (AAAA-MM-DD)', $k);
        if ($d['inicio'] > $d['fin']) V::fallo('La fecha de inicio no puede ser posterior a la de fin', 'fin');
        $fila['inicio'] = $d['inicio'];
        $fila['fin'] = $d['fin'];
        $dias = $d['dias'] ?? null;
        if ($dias !== null) {
            if (!is_array($dias) || !array_is_list($dias) || !$dias) V::fallo('Elige al menos un día (0 lunes a 6 domingo) o deja todos', 'dias');
            foreach ($dias as $x) if (!is_int($x) || $x < 0 || $x > 6) V::fallo('Día no válido (0 lunes a 6 domingo)', 'dias');
            $dias = array_values(array_unique($dias));
            sort($dias);
        }
        $fila['dias'] = $dias ? implode(',', $dias) : null;
        $hd = $d['horaDesde'] ?? null;
        $hh = $d['horaHasta'] ?? null;
        if (($hd === null) !== ($hh === null)) V::fallo('Indica la hora de inicio y la de fin', 'horaDesde');
        if ($hd !== null) {
            if (!self::horaValida($hd)) V::fallo('Hora no válida (HH:MM)', 'horaDesde');
            if (!self::horaValida($hh)) V::fallo('Hora no válida (HH:MM)', 'horaHasta');
            if ($hd === $hh) V::fallo('La franja horaria no puede ser de duración cero', 'horaHasta');
        }
        $fila['hora_desde'] = $hd;
        $fila['hora_hasta'] = $hh;
        $act = $d['activa'] ?? true;
        if (!is_bool($act)) V::fallo('"activa" debe ser verdadero o falso', 'activa');
        $fila['activa'] = (int) $act;
        return $fila;
    }
}
