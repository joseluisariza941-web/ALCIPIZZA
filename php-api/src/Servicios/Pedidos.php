<?php
declare(strict_types=1);

namespace Alci\Servicios;

use Alci\Core\Db;
use Alci\Core\Fmt;
use Alci\Core\HttpError;
use Alci\Core\V;

/** Igual que services/pedidos.js: validación, cotización en el servidor, guardado, lectura y descuento de inventario. */
final class Pedidos
{
    // ---------------------------------------------------------------- validación (equivale a los esquemas zod)

    /** typeof de JS para los mensajes de zod ("received ..."). */
    private static function tipo(mixed $v, bool $presente = true): string
    {
        if (!$presente) return 'undefined';
        return match (true) {
            $v === null => 'null',
            is_bool($v) => 'boolean',
            is_int($v), is_float($v) => 'number',
            is_string($v) => 'string',
            is_array($v) && array_is_list($v) && $v !== [] => 'array',
            default => 'object',
        };
    }

    /** .trim() de JS (también espacios Unicode). */
    public static function trim(string $s): string
    {
        return preg_replace('/^[\s\x{00A0}\x{FEFF}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}]+|[\s\x{00A0}\x{FEFF}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}]+$/u', '', $s) ?? trim($s);
    }

    /** Largo como .length de JS (unidades UTF-16). */
    private static function largo(string $s): int
    {
        return intdiv(strlen(mb_convert_encoding($s, 'UTF-16LE', 'UTF-8')), 2);
    }

    /** z.string().trim().max(max) (+ opcional min/regex). */
    private static function texto(mixed $v, bool $presente, array $path, int $max, ?string $msgMin = null, ?array $regex = null): string
    {
        if (!is_string($v)) V::fallo('Invalid input: expected string, received ' . self::tipo($v, $presente), $path);
        $v = self::trim($v);
        if (self::largo($v) > $max) V::fallo("Too big: expected string to have <=$max characters", $path);
        if ($msgMin !== null && self::largo($v) < 1) V::fallo($msgMin, $path);
        if ($regex && !preg_match($regex[0], $v)) V::fallo($regex[1], $path);
        return $v;
    }

    /** z.number(...).int().positive() con mensaje propio opcional (el `error` del esquema aplica a todo). */
    private static function enteroPositivo(mixed $v, bool $presente, array $path, ?string $msg = null): int
    {
        if (is_float($v) && is_finite($v) && floor($v) == $v && abs($v) < 2 ** 53) $v = (int) $v;
        if (!is_int($v) && !is_float($v)) V::fallo($msg ?? 'Invalid input: expected number, received ' . self::tipo($v, $presente), $path);
        if (is_float($v)) V::fallo($msg ?? 'Invalid input: expected int, received number', $path);
        if ($v <= 0) V::fallo($msg ?? 'Too small: expected number to be >0', $path);
        return $v;
    }

    /** Number(v) de JS para z.coerce.number() (NaN → null). */
    public static function aNumero(mixed $v): int|float|null
    {
        if (is_int($v) || is_float($v)) return $v;
        if ($v === null || $v === false) return 0;
        if ($v === true) return 1;
        if (is_string($v)) {
            $t = self::trim($v);
            if ($t === '') return 0;
            if (preg_match('/^0[xX][0-9a-fA-F]+$/', $t)) return hexdec(substr($t, 2));
            if (preg_match('/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/', $t)) {
                $f = (float) $t;
                return floor($f) == $f && abs($f) < 2 ** 53 ? (int) $f : $f;
            }
            return null;
        }
        if (is_array($v)) {
            if ($v === []) return 0;
            if (array_is_list($v) && count($v) === 1 && !is_array($v[0])) return self::aNumero(is_string($v[0]) ? $v[0] : (string) $v[0]);
        }
        return null;
    }

    /** z.coerce.number().int().positive() */
    public static function coercePositivo(mixed $v, array $path): int
    {
        $n = self::aNumero($v);
        if ($n === null) V::fallo('Invalid input: expected number, received NaN', $path);
        if (is_float($n)) V::fallo('Invalid input: expected int, received number', $path);
        if ($n <= 0) V::fallo('Too small: expected number to be >0', $path);
        return $n;
    }

    /** IdSchema de las rutas: /:id → entero positivo (400 VALIDACION si no). */
    public static function id(array $params): int
    {
        return self::coercePositivo($params['id'] ?? null, ['id']);
    }

    /** Objeto JSON (array asociativo) o error de zod. */
    private static function objeto(mixed $v, bool $presente, array $path): array
    {
        if (!is_array($v) || ($v !== [] && array_is_list($v))) {
            V::fallo('Invalid input: expected object, received ' . self::tipo($v, $presente), $path);
        }
        return $v;
    }

    /** z.array(...).max(max).default([]) */
    private static function lista(array $d, string $k, array $path, int $max): array
    {
        if (!array_key_exists($k, $d)) return [];
        $v = $d[$k];
        if (!is_array($v) || ($v !== [] && !array_is_list($v))) {
            V::fallo('Invalid input: expected array, received ' . self::tipo($v), $path);
        }
        if (count($v) > $max) V::fallo("Too big: expected array to have <=$max items", $path);
        return $v;
    }

    /** ItemSchema */
    private static function validarItem(mixed $c, array $path): array
    {
        $c = self::objeto($c, true, $path);
        $out = [
            'platoId' => self::enteroPositivo($c['platoId'] ?? null, array_key_exists('platoId', $c), [...$path, 'platoId'], 'Falta el plato'),
            'varianteId' => self::enteroPositivo($c['varianteId'] ?? null, array_key_exists('varianteId', $c), [...$path, 'varianteId'], 'Elige el tamaño'),
        ];
        $extras = self::lista($c, 'extras', [...$path, 'extras'], 20);
        foreach ($extras as $i => $e) $extras[$i] = self::enteroPositivo($e, true, [...$path, 'extras', $i]);
        $out['extras'] = $extras;
        foreach (['salsas' => 20, 'sin' => 30] as $k => $max) {
            $l = self::lista($c, $k, [...$path, $k], $max);
            foreach ($l as $i => $s) $l[$i] = self::texto($s, true, [...$path, $k, $i], 120);
            $out[$k] = $l;
        }
        $out['nota'] = array_key_exists('nota', $c) ? self::texto($c['nota'], true, [...$path, 'nota'], 300) : '';
        return $out;
    }

    /** PedidoSchema. Las claves opcionales ausentes quedan fuera del resultado (como undefined). */
    public static function validar(mixed $body): array
    {
        $d = self::objeto($body ?? [], true, []);
        $b = [];
        $b['destino'] = self::texto($d['destino'] ?? null, array_key_exists('destino', $d), ['destino'], 100, 'Elige el destino del pedido');
        if (array_key_exists('mesa', $d)) $b['mesa'] = self::coercePositivo($d['mesa'], ['mesa']);
        foreach (['cliente' => 100, 'direccion' => 200] as $k => $max) {
            if (array_key_exists($k, $d)) $b[$k] = self::texto($d[$k], true, [$k], $max);
        }
        if (array_key_exists('telefono', $d)) {
            $b['telefono'] = self::texto($d['telefono'], true, ['telefono'], 30, null, ['/^[0-9+()\s-]*$/', 'Teléfono no válido']);
        }
        if (array_key_exists('metodoPago', $d)) {
            $m = $d['metodoPago'];
            if (!is_string($m)) V::fallo('Invalid input: expected string, received ' . self::tipo($m), ['metodoPago']);
            if (self::largo($m) > 10) V::fallo('Too big: expected string to have <=10 characters', ['metodoPago']);
            $b['metodoPago'] = $m;
        }
        if (array_key_exists('celular', $d) && $d['celular'] !== null && $d['celular'] !== '') $b['celular'] = Puntos::normalizar($d['celular']);
        if (array_key_exists('canjearPuntos', $d)) {
            $c = $d['canjearPuntos'];
            if (!is_int($c) || $c < 0 || $c > 1000000) V::fallo('Puntos a canjear no válidos', ['canjearPuntos']);
            $b['canjearPuntos'] = $c;
        }
        $items = $d['items'] ?? null;
        if (!is_array($items) || ($items !== [] && !array_is_list($items))) V::fallo('El pedido está vacío', ['items']);
        if (count($items) < 1) V::fallo('El pedido está vacío', ['items']);
        if (count($items) > 40) V::fallo('El pedido es demasiado grande', ['items']);
        $b['items'] = [];
        foreach ($items as $i => $it) $b['items'][] = self::validarItem($it, ['items', $i]);
        return $b;
    }

    // ---------------------------------------------------------------- lógica

    /** Recalcula precios y valida que todo pertenezca al plato. @return array{items: list<array>, total: int|float} */
    public static function cotizar(array $items): array
    {
        $ids = array_values(array_unique(array_map(fn($i) => $i['platoId'], $items)));
        $platos = [];
        foreach (Menu::cargarPlatos(true, $ids) as $p) $platos[$p['id']] = $p;
        $total = 0;
        $out = [];
        foreach ($items as $c) {
            $p = $platos[$c['platoId']] ?? null;
            if (!$p) throw new HttpError(400, 'Hay un plato que ya no está disponible');
            $v = null;
            foreach ($p['variantes'] as $x) if ($x['id'] === $c['varianteId']) { $v = $x; break; }
            if (!$v) throw new HttpError(400, "El tamaño elegido de {$p['nombre']} ya no está disponible");
            $extras = [];
            foreach (array_values(array_unique($c['extras'])) as $id) {
                $e = null;
                foreach ($p['extras'] as $x) if ($x['id'] === $id) { $e = $x; break; }
                if (!$e) throw new HttpError(400, "Hay un extra de {$p['nombre']} que ya no está disponible");
                $extras[] = $e;
            }
            $grupos = array_values(array_filter(array_map(fn($e) => $e['grupo'], $extras), fn($g) => (bool) $g));
            if (count(array_unique($grupos)) !== count($grupos)) {
                throw new HttpError(400, "Solo puedes elegir una opción de cada grupo de extras en {$p['nombre']}");
            }
            $salsas = array_values(array_unique($c['salsas']));
            $nombresSalsas = array_map(fn($x) => $x['nombre'], $p['salsas']);
            foreach ($salsas as $s) {
                if (!in_array($s, $nombresSalsas, true)) throw new HttpError(400, "Hay una salsa que no aplica para {$p['nombre']}");
            }
            $sin = array_values(array_unique($c['sin']));
            $nombresIng = array_map(fn($x) => $x['nombre'], $p['ingredientes']);
            foreach ($sin as $s) {
                if (!in_array($s, $nombresIng, true)) throw new HttpError(400, "Hay un ingrediente que no pertenece a {$p['nombre']}");
            }
            $precio = $v['precio'];
            foreach ($extras as $e) $precio += $e['precio'];
            $precio = Fmt::num($precio);
            $total += $precio;
            $out[] = [
                'plato_id' => $p['id'], 'categoria' => $p['categoria'], 'variante_id' => $v['id'], 'nombre' => $p['nombre'], 'emoji' => $p['emoji'] ?? null,
                'variante' => $v['nombre'], 'precio_unitario' => $precio, 'nota' => $c['nota'] !== '' ? $c['nota'] : null,
                'extras' => $extras, 'salsas' => $salsas, 'sin' => $sin,
            ];
        }
        return ['items' => $out, 'total' => Fmt::num($total)];
    }

    /**
     * Descuentos sobre el subtotal cotizado: mejor promoción vigente y, si se pide, canje de puntos.
     * @return array{subtotal: int|float, descuentoPromo: int|float, promo: ?array, puntosCanjeados: int, descuentoPuntos: int|float, total: int|float}
     */
    public static function liquidar(array $items, int|float $subtotal, int $canjear = 0, ?string $celular = null, bool $staff = false): array
    {
        [$descPromo, $promo] = Promociones::mejor($items, $subtotal);
        $tras = $subtotal - $descPromo;
        $puntos = 0;
        $descPuntos = 0;
        if ($canjear > 0) [$puntos, $descPuntos] = Puntos::canje($canjear, $celular, $tras);
        return ['subtotal' => $subtotal, 'descuentoPromo' => $descPromo, 'promo' => $promo,
            'puntosCanjeados' => $puntos, 'descuentoPuntos' => $descPuntos, 'total' => Fmt::num($tras - $descPuntos)];
    }

    /** Columnas de pedidos que deja una liquidación. */
    public static function columnasLiquidacion(array $l): array
    {
        return ['subtotal' => $l['subtotal'], 'descuento_promo' => $l['descuentoPromo'],
            'promocion_id' => $l['promo']['id'] ?? null, 'promocion_nombre' => $l['promo']['nombre'] ?? null,
            'puntos_canjeados' => $l['puntosCanjeados'], 'descuento_puntos' => $l['descuentoPuntos'], 'total' => $l['total']];
    }

    /**
     * Reglas de destino. Devuelve los campos de la fila del pedido.
     * @param list<array>|null $metodos métodos de pago (Config::metodosPago) para pedidos web
     */
    public static function datosDestino(array $b, bool $staff, int $mesas, ?array $metodos = null): array
    {
        $cliente = ($b['cliente'] ?? '') !== '' ? $b['cliente'] : null;
        $direccion = ($b['direccion'] ?? '') !== '' ? $b['direccion'] : null;
        $telefono = ($b['telefono'] ?? '') !== '' ? $b['telefono'] : null;
        if ($staff) {
            // Destino libre ("Mesa 3", "Domicilio", "Barra"…). Si trae mesa, o el destino es "Mesa N", se valida la mesa.
            $destino = $b['destino'];
            $enTexto = preg_match('/^mesa\s+(\d+)$/i', $destino, $m) ? $m : null;
            if (array_key_exists('mesa', $b) || $enTexto) {
                $mesa = $b['mesa'] ?? (int) $enTexto[1];
                if ($enTexto && (int) $enTexto[1] !== $mesa) throw new HttpError(400, 'La mesa no coincide con el destino');
                if ($mesa < 1 || $mesa > $mesas) throw new HttpError(400, 'Elige una mesa válida');
                if ($enTexto || preg_match('/^mesa$/i', $destino)) $destino = "Mesa $mesa";
            }
            return ['destino' => $destino, 'cliente' => $cliente, 'direccion' => $direccion, 'telefono' => $telefono];
        }
        if (!$cliente) throw new HttpError(400, 'Escribe tu nombre');
        $out = ['cliente' => $cliente, 'direccion' => null, 'telefono' => null];
        $mesa = $b['mesa'] ?? null;
        if ($b['destino'] === 'En el local') {
            if (!$mesa || $mesa > $mesas) throw new HttpError(400, 'Elige una mesa válida');
            $out['destino'] = "En el local · Mesa $mesa";
        } elseif ($b['destino'] === 'Domicilio') {
            if (!$direccion) throw new HttpError(400, 'Escribe la dirección');
            if (!$telefono) throw new HttpError(400, 'Escribe el teléfono');
            $out = [...$out, 'destino' => 'Domicilio', 'direccion' => $direccion, 'telefono' => $telefono];
        } elseif ($b['destino'] === 'Recoger en local') {
            if (!$telefono) throw new HttpError(400, 'Escribe el teléfono');
            $out = [...$out, 'destino' => 'Recoger en local', 'telefono' => $telefono];
        } else {
            throw new HttpError(400, 'Destino no válido');
        }
        $met = null;
        foreach ($metodos ?? [] as $x) {
            if ($x['codigo'] === ($b['metodoPago'] ?? null) && $x['activo']) { $met = $x; break; }
        }
        if (!$met) throw new HttpError(400, 'Método de pago no disponible');
        $out['metodo_pago'] = $met['codigo'];
        return $out;
    }

    /** Guarda los ítems cotizados de un pedido (reemplaza los anteriores). Llamar dentro de Db::tx. */
    public static function guardarItems(int $pedidoId, array $items): void
    {
        Db::ejecutar('DELETE FROM pedido_items WHERE pedido_id = ?', [$pedidoId]);
        foreach ($items as $it) {
            $itemId = Db::insertar('pedido_items', [
                'pedido_id' => $pedidoId, 'plato_id' => $it['plato_id'], 'variante_id' => $it['variante_id'],
                'nombre' => $it['nombre'], 'emoji' => $it['emoji'], 'variante' => $it['variante'],
                'precio_unitario' => $it['precio_unitario'], 'nota' => $it['nota'],
            ]);
            foreach ($it['extras'] as $e) {
                Db::insertar('pedido_item_extras', ['item_id' => $itemId, 'extra_id' => $e['id'], 'nombre' => $e['nombre'], 'precio' => $e['precio']]);
            }
            foreach ($it['salsas'] as $s) Db::insertar('pedido_item_salsas', ['item_id' => $itemId, 'salsa' => $s]);
            foreach ($it['sin'] as $s) Db::insertar('pedido_item_sin', ['item_id' => $itemId, 'ingrediente' => $s]);
        }
    }

    private static function intOrNull(mixed $x): ?int { return $x === null ? null : (int) $x; }

    /**
     * Lee pedidos con todo su detalle. $where/$p filtran sobre `pedidos p` (p. ej. 'p.id = ?').
     * @return list<array>
     */
    public static function cargarPedidos(string $where = '1=1', array $p = []): array
    {
        $pedidos = Db::todos("SELECT p.*, m.nombre AS mesera_nombre, c.nombre AS cobrador_nombre, mp.nombre AS metodo_nombre
            FROM pedidos p
            LEFT JOIN usuarios m ON m.id = p.mesera_id
            LEFT JOIN usuarios c ON c.id = p.cobrado_por
            LEFT JOIN metodos_pago mp ON mp.codigo = p.metodo_pago
            WHERE $where ORDER BY p.id DESC", $p);
        if (!$pedidos) return [];
        $pid = array_map(fn($x) => (int) $x['id'], $pedidos);
        $items = Db::todos('SELECT * FROM pedido_items WHERE pedido_id IN (' . Db::marcas($pid) . ') ORDER BY id', $pid);
        $extras = $salsas = $sin = [];
        if ($items) {
            $iid = array_map(fn($x) => (int) $x['id'], $items);
            $in = Db::marcas($iid);
            $extras = Db::todos("SELECT * FROM pedido_item_extras WHERE item_id IN ($in) ORDER BY id", $iid);
            $salsas = Db::todos("SELECT * FROM pedido_item_salsas WHERE item_id IN ($in)", $iid);
            $sin = Db::todos("SELECT * FROM pedido_item_sin WHERE item_id IN ($in)", $iid);
        }
        $porItem = function (array $filas): array {
            $r = [];
            foreach ($filas as $f) $r[(int) $f['item_id']][] = $f;
            return $r;
        };
        $extras = $porItem($extras);
        $salsas = $porItem($salsas);
        $sin = $porItem($sin);
        $itemsDe = [];
        foreach ($items as $i) {
            $id = (int) $i['id'];
            $itemsDe[(int) $i['pedido_id']][] = [
                'id' => $id, 'platoId' => self::intOrNull($i['plato_id']), 'nombre' => $i['nombre'], 'emoji' => $i['emoji'] ?? null,
                'variante' => $i['variante'], 'varianteId' => self::intOrNull($i['variante_id'] ?? null),
                'precioUnitario' => Fmt::num($i['precio_unitario']), 'nota' => $i['nota'] ?? '',
                'extras' => array_map(fn($e) => [
                    'id' => self::intOrNull($e['extra_id']), 'nombre' => $e['nombre'], 'precio' => Fmt::num($e['precio']),
                ], $extras[$id] ?? []),
                'salsas' => array_map(fn($s) => $s['salsa'], $salsas[$id] ?? []),
                'sin' => array_map(fn($s) => $s['ingrediente'], $sin[$id] ?? []),
            ];
        }
        return array_map(fn($p) => Archivo::marcar([
            'id' => (int) $p['id'],
            'creadoEn' => Fmt::iso($p['creado_en']),
            'origen' => $p['origen'],
            'mesera' => $p['mesera_id'] ? ['id' => (int) $p['mesera_id'], 'nombre' => $p['mesera_nombre']] : null,
            'destino' => $p['destino'],
            'cliente' => $p['cliente'] ?? null,
            'direccion' => $p['direccion'] ?? null,
            'telefono' => $p['telefono'] ?? null,
            'celular' => $p['celular'] ?? null,
            'subtotal' => Fmt::num($p['subtotal'] ?? $p['total']),
            'descuentoPromo' => Fmt::num($p['descuento_promo']),
            'promocion' => $p['promocion_id'] || $p['promocion_nombre'] ? ['id' => self::intOrNull($p['promocion_id']), 'nombre' => $p['promocion_nombre']] : null,
            'puntosCanjeados' => (int) $p['puntos_canjeados'],
            'descuentoPuntos' => Fmt::num($p['descuento_puntos']),
            'puntosGanados' => (int) $p['puntos_ganados'],
            'editadoEn' => Fmt::iso($p['editado_en'] ?? null),
            'canceladoPorCliente' => (bool) (int) $p['cancelado_por_cliente'],
            'total' => Fmt::num($p['total']),
            'estado' => $p['estado'],
            'pagoEstado' => $p['pago_estado'],
            'metodoPago' => $p['metodo_pago'] ? ['codigo' => $p['metodo_pago'], 'nombre' => $p['metodo_nombre']] : null,
            'pagadoEn' => Fmt::iso($p['pagado_en'] ?? null),
            'cobradoPor' => $p['cobrado_por'] ? ['id' => (int) $p['cobrado_por'], 'nombre' => $p['cobrador_nombre']] : null,
            'items' => $itemsDe[(int) $p['id']] ?? [],
        ], $p, true), $pedidos);
    }

    public static function cargarPedido(int $id): ?array
    {
        return self::cargarPedidos('p.id = ?', [$id])[0] ?? null;
    }

    /**
     * Descuenta el inventario del pedido si aún no se ha hecho (llamar dentro de Db::tx):
     * ingredientes no quitados × multiplicador de la variante, 15 g por salsa y la cantidad de cada extra.
     */
    public static function descontarInventario(int $pedidoId): bool
    {
        $marcado = Db::ejecutar('UPDATE pedidos SET inventario_descontado = 1 WHERE id = ? AND inventario_descontado = 0', [$pedidoId]);
        if (!$marcado) return false;
        foreach (self::consumo($pedidoId) as $id => $q) {
            Db::ejecutar('UPDATE insumos SET stock = GREATEST(0, ROUND(stock - ?, 3)) WHERE id = ?', [$q, $id]);
        }
        return true;
    }

    /** Repone el inventario descontado de un pedido (cancelación o edición). Dentro de Db::tx. */
    public static function devolverInventario(int $pedidoId): bool
    {
        $marcado = Db::ejecutar('UPDATE pedidos SET inventario_descontado = 0 WHERE id = ? AND inventario_descontado = 1', [$pedidoId]);
        if (!$marcado) return false;
        foreach (self::consumo($pedidoId) as $id => $q) {
            Db::ejecutar('UPDATE insumos SET stock = ROUND(stock + ?, 3) WHERE id = ?', [$q, $id]);
        }
        return true;
    }

    /** Consumo de insumos de un pedido: insumoId → cantidad en la unidad del insumo. */
    private static function consumo(int $pedidoId): array
    {
        $items = Db::todos('SELECT * FROM pedido_items WHERE pedido_id = ?', [$pedidoId]);
        if (!$items) return [];
        $iid = array_map(fn($x) => (int) $x['id'], $items);
        $in = Db::marcas($iid);
        $salsas = Db::todos("SELECT * FROM pedido_item_salsas WHERE item_id IN ($in)", $iid);
        $sin = Db::todos("SELECT * FROM pedido_item_sin WHERE item_id IN ($in)", $iid);
        $extras = Db::todos("SELECT pe.item_id, e.insumo_id, e.cantidad, e.unidad
            FROM pedido_item_extras pe JOIN extras e ON e.id = pe.extra_id WHERE pe.item_id IN ($in)", $iid);
        $platoIds = array_values(array_unique(array_filter(array_map(fn($i) => self::intOrNull($i['plato_id']), $items))));
        $platos = [];
        foreach (Menu::cargarPlatos(false, $platoIds) as $p) $platos[$p['id']] = $p;
        $insumos = Db::todos('SELECT id, nombre, unidad FROM insumos FOR UPDATE');
        $porId = $porNombre = [];
        foreach ($insumos as $i) {
            $i['id'] = (int) $i['id'];
            $porId[$i['id']] = $i;
            $porNombre[$i['nombre']] = $i; // como new Map(...): con nombres repetidos gana el último
        }

        $total = []; // insumoId → cantidad en la unidad del insumo
        $dec = function (?array $ins, mixed $q, ?string $u) use (&$total): void {
            if (!$ins) return;
            $total[$ins['id']] = ($total[$ins['id']] ?? 0) + Unidades::cv($q, $u ?: $ins['unidad'], $ins['unidad']);
        };

        foreach ($items as $it) {
            $itId = (int) $it['id'];
            $p = $it['plato_id'] !== null ? ($platos[(int) $it['plato_id']] ?? null) : null;
            if ($p) {
                $v = null;
                foreach ($p['variantes'] as $x) if ($it['variante_id'] !== null && $x['id'] === (int) $it['variante_id']) { $v = $x; break; }
                if (!$v) foreach ($p['variantes'] as $x) if ($x['nombre'] === $it['variante']) { $v = $x; break; }
                $m = $v['multiplicador'] ?? 1;
                $quitados = [];
                foreach ($sin as $s) if ((int) $s['item_id'] === $itId) $quitados[$s['ingrediente']] = true;
                foreach ($p['ingredientes'] as $ing) {
                    if (!isset($quitados[$ing['nombre']])) $dec($porId[$ing['insumoId']] ?? null, $ing['cantidad'] * $m, $ing['unidad']);
                }
            }
            foreach ($salsas as $s) if ((int) $s['item_id'] === $itId) $dec($porNombre[$s['salsa']] ?? null, 15, 'g');
            foreach ($extras as $e) {
                if ((int) $e['item_id'] === $itId) $dec($e['insumo_id'] !== null ? ($porId[(int) $e['insumo_id']] ?? null) : null, (float) $e['cantidad'], $e['unidad']);
            }
        }
        return $total;
    }

    /** '$' + Number(v).toLocaleString('es-CO'): 27000 → "$27.000", 1234.5 → "$1.234,5". */
    public static function pesos(mixed $v): string
    {
        $f = round((float) $v, 3);
        $txt = number_format($f, 3, ',', '.');
        $txt = rtrim(rtrim($txt, '0'), ',');
        return '$' . ($txt === '-0' ? '0' : $txt);
    }
}
