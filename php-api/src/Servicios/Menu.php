<?php
declare(strict_types=1);

namespace Alci\Servicios;

use Alci\Core\Db;
use Alci\Core\Fmt;
use Alci\Servicios\Archivo;

/** Igual que services/menu.js. */
final class Menu
{
    /** Platos con todo su detalle (filas internas: incluyen insumoId, multiplicador, unidadInsumo…). */
    public static function cargarPlatos(bool $soloActivos = false, ?array $ids = null, bool $soloEliminados = false): array
    {
        $sql = 'SELECT p.id, p.nombre, p.emoji, p.imagen_url, p.activo, p.orden, p.eliminado_en, c.nombre AS categoria
            FROM platos p JOIN categorias c ON c.id = p.categoria_id WHERE 1=1';
        $p = [];
        $sql .= $soloEliminados ? ' AND p.eliminado_en IS NOT NULL' : ' AND p.eliminado_en IS NULL';
        if ($soloActivos) $sql .= ' AND p.activo = 1';
        if ($ids !== null) {
            if (!$ids) return [];
            $sql .= ' AND p.id IN (' . Db::marcas($ids) . ')';
            array_push($p, ...array_values($ids));
        }
        $platos = Db::todos($sql . ' ORDER BY c.orden, p.orden, p.id', $p);
        if (!$platos) return [];
        $pid = array_map(fn($x) => (int) $x['id'], $platos);
        $in = Db::marcas($pid);

        $variantes = Db::todos("SELECT * FROM plato_variantes WHERE plato_id IN ($in) ORDER BY orden, id", $pid);
        $ingredientes = Db::todos("SELECT pi.plato_id, pi.insumo_id, pi.cantidad, pi.unidad, i.nombre, i.unidad AS unidadInsumo
            FROM plato_ingredientes pi JOIN insumos i ON i.id = pi.insumo_id
            WHERE i.eliminado_en IS NULL AND pi.plato_id IN ($in) ORDER BY i.id", $pid);
        $salsas = Db::todos("SELECT ps.plato_id, ps.insumo_id, i.nombre
            FROM plato_salsas ps JOIN insumos i ON i.id = ps.insumo_id
            WHERE i.eliminado_en IS NULL AND ps.plato_id IN ($in) ORDER BY i.id", $pid);
        $extras = Db::todos("SELECT pe.plato_id, e.* FROM plato_extras pe JOIN extras e ON e.id = pe.extra_id
            WHERE e.eliminado_en IS NULL AND pe.plato_id IN ($in) ORDER BY e.id", $pid);

        $de = fn(array $filas, int $id) => array_values(array_filter($filas, fn($f) => (int) $f['plato_id'] === $id));
        return array_map(function ($p) use ($variantes, $ingredientes, $salsas, $extras, $de) {
            $id = (int) $p['id'];
            return [
                'id' => $id, 'nombre' => $p['nombre'], 'emoji' => $p['emoji'], 'imagen_url' => $p['imagen_url'],
                'activo' => (bool) (int) $p['activo'], 'orden' => (int) $p['orden'], 'categoria' => $p['categoria'],
                'eliminado_en' => $p['eliminado_en'],
                'variantes' => array_map(fn($v) => [
                    'id' => (int) $v['id'], 'nombre' => $v['nombre'], 'precio' => Fmt::num($v['precio']),
                    'multiplicador' => Fmt::num($v['multiplicador']),
                ], $de($variantes, $id)),
                'ingredientes' => array_map(fn($i) => [
                    'insumoId' => (int) $i['insumo_id'], 'nombre' => $i['nombre'], 'cantidad' => Fmt::num($i['cantidad']),
                    'unidad' => $i['unidad'], 'unidadInsumo' => $i['unidadInsumo'],
                ], $de($ingredientes, $id)),
                'salsas' => array_map(fn($s) => ['insumoId' => (int) $s['insumo_id'], 'nombre' => $s['nombre']], $de($salsas, $id)),
                'extras' => array_map([self::class, 'extraCompleto'], $de($extras, $id)),
            ];
        }, $platos);
    }

    public static function extraCompleto(array $e): array
    {
        $r = [
            'id' => (int) $e['id'], 'nombre' => $e['nombre'],
            'insumoId' => isset($e['insumo_id']) ? (int) $e['insumo_id'] : null,
            'cantidad' => Fmt::num($e['cantidad'] ?? null), 'unidad' => $e['unidad'] ?? null,
            'precio' => Fmt::num($e['precio']), 'grupo' => ($e['grupo'] ?? '') ?: null,
        ];
        return Archivo::marcar($r, $e);
    }

    private static function extraCorto(array $e): array
    {
        return ['id' => $e['id'], 'nombre' => $e['nombre'], 'precio' => $e['precio'], 'grupo' => $e['grupo']];
    }

    /** Plato del menú público. */
    public static function publico(array $p, array $promos = []): array
    {
        // promoción por plato o categoría que más rebaja el primer tamaño (el total se anuncia en la config pública)
        $mejor = null;
        $ref = $p['variantes'][0]['precio'] ?? 0;
        $fila = [['plato_id' => $p['id'], 'categoria' => $p['categoria'], 'precio_unitario' => $ref]];
        $desc = 0;
        foreach ($promos as $pr) {
            if ($pr['alcance'] === 'total') continue;
            $d = Promociones::descuentoDe($pr, $fila, $ref);
            if ($d > $desc) { $desc = $d; $mejor = $pr; }
        }
        $precioPromo = function (array $v) use ($mejor) {
            if (!$mejor) return null;
            $fv = [['plato_id' => $mejor['platoId'], 'categoria' => $mejor['categoria'], 'precio_unitario' => $v['precio']]];
            $fv[0] = ['plato_id' => $mejor['alcance'] === 'plato' ? $mejor['platoId'] : null, 'categoria' => $mejor['categoria']] + ['precio_unitario' => $v['precio']];
            return $v['precio'] - Promociones::descuentoDe($mejor, $fv, $v['precio']);
        };
        return [
            'id' => $p['id'], 'nombre' => $p['nombre'], 'emoji' => $p['emoji'] ?? null, 'imagenUrl' => $p['imagen_url'] ?: null,
            'categoria' => $p['categoria'],
            'promocion' => $mejor ? ['id' => $mejor['id'], 'nombre' => $mejor['nombre'], 'etiqueta' => $mejor['etiqueta']] : null,
            'variantes' => array_map(fn($v) => ['id' => $v['id'], 'nombre' => $v['nombre'], 'precio' => $v['precio'], 'precioPromo' => $precioPromo($v)], $p['variantes']),
            'ingredientes' => array_map(fn($i) => $i['nombre'], $p['ingredientes']),
            'salsas' => array_map(fn($s) => $s['nombre'], $p['salsas']),
            'extras' => array_map([self::class, 'extraCorto'], $p['extras']),
        ];
    }

    /** Plato completo para administración. */
    public static function admin(array $p): array
    {
        $r = [
            'id' => $p['id'], 'nombre' => $p['nombre'], 'emoji' => $p['emoji'] ?? null, 'imagenUrl' => $p['imagen_url'] ?: null,
            'categoria' => $p['categoria'], 'activo' => $p['activo'], 'orden' => $p['orden'],
            'variantes' => $p['variantes'],
            'ingredientes' => array_map(fn($i) => [
                'insumoId' => $i['insumoId'], 'nombre' => $i['nombre'], 'cantidad' => $i['cantidad'], 'unidad' => $i['unidad'],
            ], $p['ingredientes']),
            'salsas' => $p['salsas'],
            'extras' => array_map([self::class, 'extraCorto'], $p['extras']),
        ];
        return Archivo::marcar($r, $p);
    }
}
