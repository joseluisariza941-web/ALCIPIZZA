<?php
declare(strict_types=1);

namespace Alci\Rutas;

use Alci\Core\{Auth, Db, HttpError, Request, Respuesta, Router};
use Alci\Servicios\{Archivo, Bitacora, Esquema as Z, Menu, Unidades};

/** Administración del catálogo: platos y extras (rol cocina). Igual que routes/catalogo.js (montado en /api/admin). */
final class Catalogo
{
    private static function unidad(): \Closure
    {
        return Z::opcional(Z::nulable(Z::enumeracion(Unidades::LISTA, 'Unidad no válida (' . implode(', ', Unidades::LISTA) . ')')));
    }

    private static function dinero(): \Closure
    {
        return Z::numero('Precio no válido', entero: 'El precio debe ser un número entero', min: [0, 'El precio no puede ser negativo']);
    }

    private static function platoSchema(): \Closure
    {
        $idPos = Z::numero(entero: true, positivo: true);
        return Z::objeto([
            'nombre' => Z::texto(trim: true, min: [1, 'Escribe el nombre del plato'], max: [120, null]),
            'emoji' => Z::opcional(Z::nulable(Z::texto(trim: true, max: [16, null]))),
            'imagenUrl' => Z::opcional(Z::nulable(Z::texto(trim: true, max: [500, null]))),
            'categoria' => Z::texto(trim: true, min: [1, 'Escribe la categoría'], max: [60, null]),
            'activo' => Z::porDefecto(Z::booleano(), true),
            'orden' => Z::opcional(Z::numero(entero: true, min: [0, null])),
            'variantes' => Z::arreglo(Z::objeto([
                'id' => Z::opcional($idPos),
                'nombre' => Z::texto(trim: true, min: [1, 'Escribe el nombre del tamaño'], max: [60, null]),
                'precio' => self::dinero(),
                'multiplicador' => Z::porDefecto(Z::numero(positivo: true, max: [100, null]), 1),
            ]), min: [1, 'Agrega al menos un tamaño con precio'], max: [20, null]),
            'ingredientes' => Z::porDefecto(Z::arreglo(Z::objeto([
                'insumoId' => $idPos,
                'cantidad' => Z::numero(positivo: 'La cantidad debe ser mayor que cero'),
                'unidad' => self::unidad(),
            ]), max: [40, null]), []),
            'salsas' => Z::porDefecto(Z::arreglo($idPos, max: [30, null]), []),
            'extras' => Z::porDefecto(Z::arreglo($idPos, max: [30, null]), []),
        ]);
    }

    private static function extraSchema(): \Closure
    {
        return Z::objeto([
            'nombre' => Z::texto(trim: true, min: [1, 'Escribe el nombre del extra'], max: [120, null]),
            'insumoId' => Z::porDefecto(Z::nulable(Z::numero(entero: true, positivo: true)), null),
            'cantidad' => Z::porDefecto(Z::numero(min: [0, null]), 0),
            'unidad' => self::unidad(),
            'precio' => self::dinero(),
            'grupo' => Z::opcional(Z::nulable(Z::texto(trim: true, max: [40, null]))),
        ]);
    }

    /** `x || null` de JS para textos. */
    private static function oNull(?string $x): ?string { return $x === null || $x === '' ? null : $x; }

    private static function categoriaId(string $nombre): int
    {
        $id = Db::valor('SELECT id FROM categorias WHERE nombre = ? LIMIT 1', [$nombre]);
        if ($id !== null) return (int) $id;
        $max = Db::valor('SELECT MAX(orden) FROM categorias');
        return Db::insertar('categorias', ['nombre' => $nombre, 'orden' => ($max === null ? -1 : (int) $max) + 1]);
    }

    private static function revisarReferencias(array $b): void
    {
        $ingIds = array_map(fn($i) => $i['insumoId'], $b['ingredientes']);
        $ins = array_values(array_unique([...$ingIds, ...$b['salsas']]));
        if ($ins) {
            $filas = Db::todos('SELECT id, tipo FROM insumos WHERE eliminado_en IS NULL AND id IN (' . Db::marcas($ins) . ')', $ins);
            if (count($filas) !== count($ins)) throw new HttpError(400, 'Hay un insumo que no existe');
            $tipos = array_column($filas, 'tipo', 'id');
            foreach ($b['salsas'] as $id) {
                if (($tipos[$id] ?? null) !== 'salsa') throw new HttpError(400, 'Hay una salsa que no es de tipo salsa');
            }
        }
        if (count(array_unique($ingIds)) !== count($ingIds)) throw new HttpError(400, 'Hay un ingrediente repetido');
        $nombres = array_map(fn($v) => mb_strtolower($v['nombre']), $b['variantes']);
        if (count(array_unique($nombres)) !== count($nombres)) throw new HttpError(400, 'Hay un tamaño repetido');
        $ex = array_values(array_unique($b['extras']));
        if ($ex && (int) Db::valor('SELECT COUNT(*) FROM extras WHERE eliminado_en IS NULL AND id IN (' . Db::marcas($ex) . ')', $ex) !== count($ex)) {
            throw new HttpError(400, 'Hay un extra que no existe');
        }
    }

    private static function guardarPlato(?int $id, array $b): int
    {
        $fila = [
            'categoria_id' => self::categoriaId($b['categoria']), 'nombre' => $b['nombre'], 'emoji' => self::oNull($b['emoji'] ?? null),
            'imagen_url' => self::oNull($b['imagenUrl'] ?? null), 'activo' => (int) $b['activo'],
        ];
        if (array_key_exists('orden', $b)) $fila['orden'] = $b['orden'];
        if ($id) {
            Db::actualizar('platos', $fila, 'id = ?', [$id]);
        } else {
            if (!array_key_exists('orden', $fila)) {
                $m = Db::valor('SELECT MAX(orden) FROM platos');
                $fila['orden'] = ($m === null ? -1 : (int) $m) + 1;
            }
            $id = Db::insertar('platos', $fila);
        }

        // Variantes: conserva el id de las que se mantienen (los carritos abiertos siguen sirviendo).
        $actuales = array_map('intval', array_column(Db::todos('SELECT id FROM plato_variantes WHERE plato_id = ?', [$id]), 'id'));
        $mantener = [];
        foreach ($b['variantes'] as $v) {
            if (!empty($v['id']) && in_array($v['id'], $actuales, true)) $mantener[] = $v['id'];
        }
        $no = $mantener ?: [0];
        Db::ejecutar('DELETE FROM plato_variantes WHERE plato_id = ? AND id NOT IN (' . Db::marcas($no) . ')', [$id, ...$no]);
        // nombres temporales para no chocar con el índice único (plato, nombre) al renombrar
        foreach ($mantener as $vid) Db::actualizar('plato_variantes', ['nombre' => "__tmp_$vid"], 'id = ?', [$vid]);
        foreach ($b['variantes'] as $orden => $v) {
            $datos = ['nombre' => $v['nombre'], 'precio' => $v['precio'], 'multiplicador' => $v['multiplicador'], 'orden' => $orden];
            if (!empty($v['id']) && in_array($v['id'], $mantener, true)) Db::actualizar('plato_variantes', $datos, 'id = ?', [$v['id']]);
            else Db::insertar('plato_variantes', ['plato_id' => $id, ...$datos]);
        }

        Db::ejecutar('DELETE FROM plato_ingredientes WHERE plato_id = ?', [$id]);
        foreach ($b['ingredientes'] as $i) {
            Db::insertar('plato_ingredientes', [
                'plato_id' => $id, 'insumo_id' => $i['insumoId'], 'cantidad' => $i['cantidad'], 'unidad' => self::oNull($i['unidad'] ?? null),
            ]);
        }
        Db::ejecutar('DELETE FROM plato_salsas WHERE plato_id = ?', [$id]);
        foreach (array_unique($b['salsas']) as $s) Db::insertar('plato_salsas', ['plato_id' => $id, 'insumo_id' => $s]);
        Db::ejecutar('DELETE FROM plato_extras WHERE plato_id = ?', [$id]);
        foreach (array_unique($b['extras']) as $e) Db::insertar('plato_extras', ['plato_id' => $id, 'extra_id' => $e]);
        return $id;
    }

    private static function platoAdmin(int $id): array
    {
        return Menu::admin(Menu::cargarPlatos(false, [$id])[0]);
    }

    private static function filaExtra(array $b): array
    {
        return [
            'nombre' => $b['nombre'], 'insumo_id' => $b['insumoId'] ?? null, 'cantidad' => $b['cantidad'] ?? 0,
            'unidad' => self::oNull($b['unidad'] ?? null), 'precio' => $b['precio'], 'grupo' => self::oNull($b['grupo'] ?? null),
        ];
    }

    private static function revisarInsumo(?int $insumoId): void
    {
        if ($insumoId && Db::valor('SELECT id FROM insumos WHERE id = ? AND eliminado_en IS NULL', [$insumoId]) === null) {
            throw new HttpError(400, 'El insumo no existe');
        }
    }

    private static function extra(int $id, bool $incluirEliminados = false): ?array
    {
        return Db::uno('SELECT * FROM extras WHERE id = ?' . ($incluirEliminados ? '' : ' AND eliminado_en IS NULL'), [$id]);
    }

    public static function registrar(Router $r): void
    {
        $r->get('/api/admin/platos', function (Request $req) {
            Auth::rol($req, 'cocina');
            return array_map([Menu::class, 'admin'], Menu::cargarPlatos(false, null, Archivo::eliminados($req) === 'eliminados'));
        });

        $r->post('/api/admin/platos', function (Request $req) {
            Auth::rol($req, 'cocina');
            $b = Z::validar(self::platoSchema(), $req->body);
            $id = Db::tx(function () use ($req, $b) {
                self::revisarReferencias($b);
                $nuevo = self::guardarPlato(null, $b);
                Bitacora::registrar($req, "Creó el plato {$b['nombre']}");
                return $nuevo;
            });
            return Respuesta::con(201, self::platoAdmin($id));
        });

        $r->put('/api/admin/platos/:id', function (Request $req, array $p) {
            Auth::rol($req, 'cocina');
            $id = Z::idUrl($p);
            if (Db::valor('SELECT id FROM platos WHERE id = ? AND eliminado_en IS NULL', [$id]) === null) throw new HttpError(404, 'Plato no encontrado');
            $b = Z::validar(self::platoSchema(), $req->body);
            Db::tx(function () use ($req, $b, $id) {
                self::revisarReferencias($b);
                self::guardarPlato($id, $b);
                Bitacora::registrar($req, "Editó el plato {$b['nombre']}");
            });
            return self::platoAdmin($id);
        });

        $r->delete('/api/admin/platos/:id', function (Request $req, array $p) {
            Auth::rol($req, 'cocina');
            $id = Z::idUrl($p);
            $pl = Db::uno('SELECT * FROM platos WHERE id = ? AND eliminado_en IS NULL', [$id]);
            if (!$pl) throw new HttpError(404, 'Plato no encontrado');
            Db::ejecutar('UPDATE platos SET eliminado_en = NOW() WHERE id = ?', [$id]);
            Bitacora::registrar($req, "Eliminó el plato {$pl['nombre']}");
            return ['ok' => true];
        });

        $r->post('/api/admin/platos/:id/restaurar', function (Request $req, array $p) {
            Auth::rol($req, 'cocina');
            $id = Z::idUrl($p);
            $pl = Db::uno('SELECT * FROM platos WHERE id = ? AND eliminado_en IS NOT NULL', [$id]);
            if (!$pl) throw new HttpError(404, 'Plato no encontrado');
            Db::ejecutar('UPDATE platos SET eliminado_en = NULL WHERE id = ?', [$id]);
            Bitacora::registrar($req, "Restauró el plato {$pl['nombre']}");
            return self::platoAdmin($id);
        });

        $r->get('/api/admin/extras', function (Request $req) {
            Auth::rol($req, 'cocina');
            $where = Archivo::eliminados($req) === 'eliminados' ? 'eliminado_en IS NOT NULL' : 'eliminado_en IS NULL';
            return array_map([Menu::class, 'extraCompleto'], Db::todos("SELECT * FROM extras WHERE $where ORDER BY id"));
        });

        $r->post('/api/admin/extras', function (Request $req) {
            Auth::rol($req, 'cocina');
            $b = Z::validar(self::extraSchema(), $req->body);
            self::revisarInsumo($b['insumoId']);
            $anterior = Db::uno('SELECT id, eliminado_en FROM extras WHERE nombre = ? LIMIT 1', [$b['nombre']]);
            if ($anterior) {
                if (empty($anterior['eliminado_en'])) throw new HttpError(409, 'Ya existe un extra con ese nombre');
                $id = (int) $anterior['id'];
                Db::actualizar('extras', [...self::filaExtra($b), 'eliminado_en' => null], 'id = ?', [$id]);
                $accion = 'Restauró';
            } else {
                $id = Db::insertar('extras', self::filaExtra($b));
                $accion = 'Creó';
            }
            Bitacora::registrar($req, "$accion el extra {$b['nombre']}");
            return Respuesta::con(201, Menu::extraCompleto(self::extra($id)));
        });

        $r->put('/api/admin/extras/:id', function (Request $req, array $p) {
            Auth::rol($req, 'cocina');
            $id = Z::idUrl($p);
            $actual = self::extra($id);
            if (!$actual) throw new HttpError(404, 'Extra no encontrado');
            $b = Z::validar(self::extraSchema(), array_replace(Menu::extraCompleto($actual), $req->datos()));
            self::revisarInsumo($b['insumoId']);
            Db::actualizar('extras', self::filaExtra($b), 'id = ?', [$id]);
            Bitacora::registrar($req, "Editó el extra {$b['nombre']}");
            return Menu::extraCompleto(self::extra($id));
        });

        $r->delete('/api/admin/extras/:id', function (Request $req, array $p) {
            Auth::rol($req, 'cocina');
            $id = Z::idUrl($p);
            $actual = self::extra($id);
            if (!$actual) throw new HttpError(404, 'Extra no encontrado');
            Db::ejecutar('UPDATE extras SET eliminado_en = NOW() WHERE id = ?', [$id]);
            Bitacora::registrar($req, "Eliminó el extra {$actual['nombre']}");
            return ['ok' => true];
        });

        $r->post('/api/admin/extras/:id/restaurar', function (Request $req, array $p) {
            Auth::rol($req, 'cocina');
            $id = Z::idUrl($p);
            $actual = self::extra($id, true);
            if (!$actual || empty($actual['eliminado_en'])) throw new HttpError(404, 'Extra no encontrado');
            Db::ejecutar('UPDATE extras SET eliminado_en = NULL WHERE id = ?', [$id]);
            Bitacora::registrar($req, "Restauró el extra {$actual['nombre']}");
            return Menu::extraCompleto(self::extra($id));
        });

        // r.use(requireRole('cocina')) en /api/admin: cualquier otra ruta bajo /api/admin pide rol cocina antes del 404.
        // (El Router no escapa el patrón: acepta este regex; sin "?:" porque ":x" lo toma como parámetro.)
        foreach (['get', 'post', 'put', 'patch', 'delete'] as $m) {
            $r->$m('/api/admin(/.*)?', function (Request $req) {
                Auth::rol($req, 'cocina');
                throw new HttpError(404, 'Ruta no encontrada');
            });
        }
    }
}
