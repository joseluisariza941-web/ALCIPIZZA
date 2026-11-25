<?php
declare(strict_types=1);

namespace Alci\Rutas;

use Alci\Core\{Auth, Db, Fmt, HttpError, Request, Respuesta, Router};
use Alci\Servicios\{Bitacora, Esquema as Z, Rango, Unidades};

/** Insumos, surtidores y compras (rol cocina). Igual que routes/inventario.js (montado en /api). */
final class Inventario
{
    private static function unidad(): \Closure
    {
        return Z::enumeracion(Unidades::LISTA, 'Unidad no válida (' . implode(', ', Unidades::LISTA) . ')');
    }

    private static function tipo(): \Closure { return Z::enumeracion(['insumo', 'salsa'], 'Tipo no válido'); }

    private static function noNeg(): \Closure { return Z::numero(min: [0, 'No puede ser negativo']); }

    private static function insumoSchema(): \Closure
    {
        return Z::objeto([
            'nombre' => Z::texto(trim: true, min: [1, 'Escribe el nombre'], max: [120, null]),
            'tipo' => Z::porDefecto(self::tipo(), 'insumo'),
            'unidad' => self::unidad(),
            'stock' => Z::porDefecto(self::noNeg(), 0),
            'stockReferencia' => Z::porDefecto(self::noNeg(), 0),
            'costo' => Z::porDefecto(self::noNeg(), 0),
            'surtidorId' => Z::porDefecto(Z::nulable(Z::numero(entero: true, positivo: true)), null),
        ]);
    }

    private static function surtidorSchema(): \Closure
    {
        $opc = fn(int $max) => Z::porDefecto(Z::nulable(Z::texto(trim: true, max: [$max, null])), null);
        return Z::objeto([
            'nombre' => Z::texto(trim: true, min: [1, 'Escribe el nombre del surtidor'], max: [120, null]),
            'empresa' => $opc(120),
            'correo' => $opc(120),
            'telefono' => $opc(40),
        ]);
    }

    private static function compraSchema(): \Closure
    {
        return Z::objeto([
            'insumoId' => Z::opcional(Z::numero(entero: true, positivo: true)),
            'nuevoInsumo' => Z::opcional(Z::objeto([
                'nombre' => Z::texto(trim: true, min: [1, 'Escribe el producto'], max: [120, null]),
                'tipo' => Z::porDefecto(self::tipo(), 'insumo'),
                'unidad' => Z::opcional(self::unidad()),
            ])),
            'cantidad' => Z::numero('Escribe la cantidad', positivo: 'Escribe la cantidad'),
            'unidad' => self::unidad(),
            'costo' => Z::porDefecto(self::noNeg(), 0),
            'surtidorId' => Z::porDefecto(Z::nulable(Z::numero(entero: true, positivo: true)), null),
        ]);
    }

    /** CompraSchema con su .refine(): o insumoId o nuevoInsumo. */
    private static function validarCompra(mixed $body): array
    {
        $issues = [];
        $b = self::compraSchema()($body ?? [], [], $issues);
        if (is_array($b) && !empty($b['insumoId']) === array_key_exists('nuevoInsumo', $b)) {
            Z::issue($issues, 'Elige un insumo o escribe uno nuevo', ['insumoId']);
        }
        if ($issues) throw new HttpError(400, $issues[0]['message'], 'VALIDACION', $issues);
        return $b;
    }

    public static function aInsumo(array $i, ?array $ult = null): array
    {
        return [
            'id' => (int) $i['id'], 'nombre' => $i['nombre'], 'tipo' => $i['tipo'], 'unidad' => $i['unidad'],
            'stock' => Fmt::num($i['stock']), 'stockReferencia' => Fmt::num($i['stock_referencia']),
            'costo' => Fmt::num($i['costo']), 'surtidorId' => isset($i['surtidor_id']) ? (int) $i['surtidor_id'] : null,
            'ultimaCompra' => $ult ? [
                'fecha' => Fmt::iso($ult['fecha']), 'cantidad' => Fmt::num($ult['cantidad']), 'unidad' => $ult['unidad'],
                'usuario' => $ult['usuario'] ?? null,
            ] : null,
        ];
    }

    /** Insumos con su última compra (fecha, cantidad, unidad y quién la registró). */
    private static function cargarInsumos(?int $id = null): array
    {
        $filas = $id ? Db::todos('SELECT * FROM insumos WHERE id = ? AND activo = 1 ORDER BY id', [$id]) : Db::todos('SELECT * FROM insumos WHERE activo = 1 ORDER BY id');
        $sql = 'SELECT c.insumo_id, c.fecha, c.cantidad, c.unidad, u.nombre AS usuario
            FROM compras c LEFT JOIN usuarios u ON u.id = c.registrado_por
            WHERE c.id IN (SELECT MAX(id) FROM compras GROUP BY insumo_id)';
        $ult = $id ? Db::todos($sql . ' AND c.insumo_id = ?', [$id]) : Db::todos($sql);
        $porInsumo = [];
        foreach ($ult as $u) $porInsumo[(int) $u['insumo_id']] = $u;
        return array_map(fn($i) => self::aInsumo($i, $porInsumo[(int) $i['id']] ?? null), $filas);
    }

    private static function unInsumo(int $id): ?array { return self::cargarInsumos($id)[0] ?? null; }

    private static function filaInsumo(array $b): array
    {
        return [
            'nombre' => $b['nombre'], 'tipo' => $b['tipo'], 'unidad' => $b['unidad'], 'stock' => $b['stock'],
            'stock_referencia' => $b['stockReferencia'], 'costo' => $b['costo'], 'surtidor_id' => $b['surtidorId'],
        ];
    }

    private static function aSurtidor(array $s): array
    {
        return [
            'id' => (int) $s['id'], 'nombre' => $s['nombre'], 'empresa' => $s['empresa'] ?? null,
            'correo' => $s['correo'] ?? null, 'telefono' => $s['telefono'] ?? null,
        ];
    }

    private static function surtidor(int $id): ?array { return Db::uno('SELECT * FROM surtidores WHERE id = ?', [$id]); }

    private static function revisarSurtidor(?int $id): void
    {
        if ($id && Db::valor('SELECT id FROM surtidores WHERE id = ?', [$id]) === null) throw new HttpError(400, 'El surtidor no existe');
    }

    private const COMPRAS = 'SELECT c.*, i.nombre AS insumo_nombre, s.nombre AS surtidor_nombre, u.nombre AS usuario_nombre
        FROM compras c JOIN insumos i ON i.id = c.insumo_id
        LEFT JOIN surtidores s ON s.id = c.surtidor_id
        LEFT JOIN usuarios u ON u.id = c.registrado_por';

    private static function aCompra(array $c): array
    {
        return [
            'id' => (int) $c['id'], 'fecha' => Fmt::iso($c['fecha']),
            'insumo' => ['id' => (int) $c['insumo_id'], 'nombre' => $c['insumo_nombre']],
            'cantidad' => Fmt::num($c['cantidad']), 'unidad' => $c['unidad'], 'costo' => Fmt::num($c['costo']),
            'surtidor' => $c['surtidor_id'] ? ['id' => (int) $c['surtidor_id'], 'nombre' => $c['surtidor_nombre']] : null,
            'registradoPor' => $c['registrado_por'] ? ['id' => (int) $c['registrado_por'], 'nombre' => $c['usuario_nombre']] : null,
        ];
    }

    public static function registrar(Router $r): void
    {
        /* ---------- Insumos ---------- */
        $r->get('/api/insumos', function (Request $req) {
            Auth::rol($req, 'cocina');
            return self::cargarInsumos();
        });

        $r->post('/api/insumos', function (Request $req) {
            Auth::rol($req, 'cocina');
            $b = Z::validar(self::insumoSchema(), $req->body);
            self::revisarSurtidor($b['surtidorId']);
            if (Db::valor('SELECT id FROM insumos WHERE nombre = ? LIMIT 1', [$b['nombre']]) !== null) {
                throw new HttpError(409, 'Ya existe un insumo con ese nombre');
            }
            $id = Db::insertar('insumos', self::filaInsumo($b));
            Bitacora::registrar($req, "Creó el insumo {$b['nombre']}");
            return Respuesta::con(201, self::unInsumo($id));
        });

        $r->put('/api/insumos/:id', function (Request $req, array $p) {
            Auth::rol($req, 'cocina');
            $id = Z::idUrl($p);
            $actual = Db::uno('SELECT * FROM insumos WHERE id = ? AND activo = 1', [$id]);
            if (!$actual) throw new HttpError(404, 'Insumo no encontrado');
            $b = Z::validar(self::insumoSchema(), array_replace(self::aInsumo($actual), $req->datos()));
            self::revisarSurtidor($b['surtidorId']);
            if (Db::valor('SELECT id FROM insumos WHERE nombre = ? AND id <> ? LIMIT 1', [$b['nombre'], $id]) !== null) {
                throw new HttpError(409, 'Ya existe un insumo con ese nombre');
            }
            Db::actualizar('insumos', self::filaInsumo($b), 'id = ?', [$id]);
            Bitacora::registrar($req, "Editó el insumo {$b['nombre']}");
            return self::unInsumo($id);
        });

        $r->delete('/api/insumos/:id', function (Request $req, array $p) {
            Auth::rol($req, 'cocina');
            $id = Z::idUrl($p);
            $actual = Db::uno('SELECT * FROM insumos WHERE id = ?', [$id]);
            if (!$actual) throw new HttpError(404, 'Insumo no encontrado');
            $platos = Db::todos('SELECT DISTINCT p.id, p.nombre FROM plato_ingredientes pi JOIN platos p ON p.id = pi.plato_id
                WHERE pi.insumo_id = ? ORDER BY p.nombre', [$id]);
            if ($platos) {
                $nombres = implode(', ', array_map(fn($p) => $p['nombre'], $platos));
                throw new HttpError(409, (count($platos) > 1 ? "No se puede borrar: lo usan los platos $nombres" : "No se puede borrar: lo usa el plato $nombres"),
                    'EN_USO', array_map(fn($p) => ['platoId' => (int) $p['id'], 'plato' => $p['nombre']], $platos));
            }
            // con compras no se borra (se pierde el historial): se desactiva y se oculta
            $desactivar = Db::valor('SELECT id FROM compras WHERE insumo_id = ? LIMIT 1', [$id]) !== null;
            if ($desactivar) Db::ejecutar('UPDATE insumos SET activo = 0 WHERE id = ?', [$id]);
            else Db::ejecutar('DELETE FROM insumos WHERE id = ?', [$id]);
            Bitacora::registrar($req, ($desactivar ? 'Desactivó' : 'Eliminó') . " el insumo {$actual['nombre']}");
            return ['ok' => true, 'desactivado' => $desactivar];
        });

        /* ---------- Surtidores ---------- */
        $r->get('/api/surtidores', function (Request $req) {
            Auth::rol($req, 'cocina');
            return array_map([self::class, 'aSurtidor'], Db::todos('SELECT * FROM surtidores ORDER BY nombre'));
        });

        $r->post('/api/surtidores', function (Request $req) {
            Auth::rol($req, 'cocina');
            $b = Z::validar(self::surtidorSchema(), $req->body);
            $id = Db::insertar('surtidores', $b);
            Bitacora::registrar($req, "Creó el surtidor {$b['nombre']}");
            return Respuesta::con(201, self::aSurtidor(self::surtidor($id)));
        });

        $r->put('/api/surtidores/:id', function (Request $req, array $p) {
            Auth::rol($req, 'cocina');
            $id = Z::idUrl($p);
            $actual = self::surtidor($id);
            if (!$actual) throw new HttpError(404, 'Surtidor no encontrado');
            $b = Z::validar(self::surtidorSchema(), array_replace(self::aSurtidor($actual), $req->datos()));
            Db::actualizar('surtidores', $b, 'id = ?', [$id]);
            Bitacora::registrar($req, "Editó el surtidor {$b['nombre']}");
            return self::aSurtidor(self::surtidor($id));
        });

        $r->delete('/api/surtidores/:id', function (Request $req, array $p) {
            Auth::rol($req, 'cocina');
            $id = Z::idUrl($p);
            $actual = self::surtidor($id);
            if (!$actual) throw new HttpError(404, 'Surtidor no encontrado');
            Db::ejecutar('DELETE FROM surtidores WHERE id = ?', [$id]);
            Bitacora::registrar($req, "Eliminó el surtidor {$actual['nombre']}");
            return ['ok' => true];
        });

        /* ---------- Compras ---------- */
        $r->get('/api/compras', function (Request $req) {
            Auth::rol($req, 'cocina');
            $f = Rango::rango(Rango::validar($req->query));
            $sql = self::COMPRAS . ' WHERE 1=1';
            $p = [];
            if ($f['desde']) { $sql .= ' AND c.fecha >= ?'; $p[] = Fmt::sql($f['desde']); }
            if ($f['hasta']) { $sql .= ' AND c.fecha < ?'; $p[] = Fmt::sql($f['hasta']); }
            return array_map([self::class, 'aCompra'], Db::todos($sql . ' ORDER BY c.id DESC LIMIT 1000', $p));
        });

        $r->post('/api/compras', function (Request $req) {
            $u = Auth::rol($req, 'cocina');
            $b = self::validarCompra($req->body);
            $id = Db::tx(function () use ($req, $b, $u) {
                self::revisarSurtidor($b['surtidorId']);
                $nuevo = false;
                if (!empty($b['insumoId'])) {
                    $ins = Db::uno('SELECT * FROM insumos WHERE id = ? AND activo = 1 LIMIT 1 FOR UPDATE', [$b['insumoId']]);
                    if (!$ins) throw new HttpError(400, 'El insumo no existe');
                } else {
                    $n = $b['nuevoInsumo'];
                    $ins = Db::uno('SELECT * FROM insumos WHERE nombre = ? LIMIT 1 FOR UPDATE', [$n['nombre']]);
                    if ($ins && !(int) $ins['activo']) {
                        Db::ejecutar('UPDATE insumos SET activo = 1 WHERE id = ?', [$ins['id']]);
                        $ins['activo'] = 1;
                    }
                    if (!$ins) {
                        $nid = Db::insertar('insumos', [
                            'nombre' => $n['nombre'], 'tipo' => $n['tipo'], 'unidad' => ($n['unidad'] ?? '') ?: $b['unidad'],
                            'stock' => 0, 'stock_referencia' => 0,
                        ]);
                        $ins = Db::uno('SELECT * FROM insumos WHERE id = ?', [$nid]);
                        $nuevo = true;
                    }
                }
                if (!Unidades::compatibles($b['unidad'], $ins['unidad'])) {
                    throw new HttpError(400, "Unidad incompatible: {$ins['nombre']} se mide en {$ins['unidad']}");
                }
                $suma = Unidades::cv($b['cantidad'], $b['unidad'], $ins['unidad']);
                Db::ejecutar('UPDATE insumos SET stock = ROUND(stock + ?, 3), stock_referencia = ROUND(stock_referencia + ?, 3),
                    costo = ?, surtidor_id = ? WHERE id = ?', [$suma, $suma, $b['costo'], $b['surtidorId'], $ins['id']]);
                $cid = Db::insertar('compras', [
                    'insumo_id' => $ins['id'], 'cantidad' => $b['cantidad'], 'unidad' => $b['unidad'], 'costo' => $b['costo'],
                    'surtidor_id' => $b['surtidorId'], 'registrado_por' => $u['id'],
                ]);
                $accion = ($nuevo ? 'Creó e ingresó' : 'Ingresó') . ' ' . Z::jsNum($b['cantidad']) . " {$b['unidad']} de {$ins['nombre']} ($"
                    . Z::jsNum($b['costo']) . ')';
                Bitacora::registrar($req, $accion);
                return $cid;
            });
            return Respuesta::con(201, self::aCompra(Db::uno(self::COMPRAS . ' WHERE c.id = ? LIMIT 1', [$id])));
        });

        $r->delete('/api/compras/:id', function (Request $req, array $p) {
            Auth::rol($req, 'cocina');
            $id = Z::idUrl($p);
            Db::tx(function () use ($req, $id) {
                $c = Db::uno(self::COMPRAS . ' WHERE c.id = ? LIMIT 1 FOR UPDATE', [$id]);
                if (!$c) throw new HttpError(404, 'Compra no encontrada');
                $ins = Db::uno('SELECT * FROM insumos WHERE id = ? FOR UPDATE', [$c['insumo_id']]);
                $resta = Unidades::cv($c['cantidad'], $c['unidad'], $ins['unidad']);
                Db::ejecutar('UPDATE insumos SET stock = GREATEST(0, ROUND(stock - ?, 3)),
                    stock_referencia = GREATEST(0, ROUND(stock_referencia - ?, 3)) WHERE id = ?', [$resta, $resta, $ins['id']]);
                Db::ejecutar('DELETE FROM compras WHERE id = ?', [$id]);
                Bitacora::registrar($req, 'Borró la compra de ' . Z::jsNum(Fmt::num($c['cantidad'])) . " {$c['unidad']} de {$c['insumo_nombre']} (#$id)");
            });
            return ['ok' => true];
        });

        // r.use(['/insumos', '/surtidores', '/compras'], requireRole('cocina')): el resto de esas rutas pide rol antes del 404.
        foreach (['get', 'post', 'put', 'patch', 'delete'] as $m) {
            $r->$m('/api/(insumos|surtidores|compras)(/.*)?', function (Request $req) {
                Auth::rol($req, 'cocina');
                throw new HttpError(404, 'Ruta no encontrada');
            });
        }
    }
}
