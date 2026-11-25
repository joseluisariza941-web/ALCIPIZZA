<?php
declare(strict_types=1);

namespace Alci\Rutas;

use Alci\Core\{Auth, Db, Fmt, HttpError, Request, Respuesta, Router};
use Alci\Servicios\{Archivo, Bitacora, Config, Esquema as Z, Rango};

/** Configuración general, métodos de pago y reportes (rol cocina). Igual que routes/ajustes.js (montado en /api). */
final class Ajustes
{
    private static function configSchema(): \Closure
    {
        $hora = Z::numero(min: [0, 'Hora entre 0 y 24'], max: [24, 'Hora entre 0 y 24']);
        $w = Z::opcional(Z::texto(max: [200, null]));
        return Z::objeto([
            'n' => Z::opcional(Z::texto(trim: true, min: [1, 'Escribe el nombre del negocio'], max: [80, null])),
            'w1' => $w, 'w2' => $w, 'w3' => $w, 'w4' => $w,
            'tel' => Z::opcional(Z::texto(trim: true, max: [30, null])),
            'mesas' => Z::opcional(Z::numero(entero: true, min: [0, 'Número de mesas no válido'], max: [200, null])),
            'h' => Z::opcional(Z::arreglo(Z::nulable(Z::tupla([$hora, $hora])),
                largo: [7, 'Debe haber horario para los 7 días (lunes a domingo)'])),
            'logo' => Z::opcional(Z::texto(max: [3_000_000, null])), // URL o imagen en data URL
            'bg' => Z::opcional(Z::texto(max: [3_000_000, null])),
            'sonido' => Z::opcional(Z::enumeracion(Config::SONIDOS, 'Sonido no válido (' . implode(', ', Config::SONIDOS) . ')')),
            'domiciliosActivos' => Z::opcional(Z::booleano()),
            'puntosActivos' => Z::opcional(Z::booleano()),
            'puntosPorMil' => Z::opcional(Z::numero(entero: true, min: [0, 'Puntos por cada $1.000 no válidos'], max: [1000, null])),
            'puntosCanje' => Z::opcional(Z::numero(entero: true, min: [1, 'Puntos por canje no válidos'], max: [100000, null])),
            'descuentoCanje' => Z::opcional(Z::numero(entero: true, min: [0, 'Descuento por canje no válido'], max: [10000000, null])),
        ], estricto: true);
    }

    /** Imagen del QR: URL https o data URL png/jpeg/webp/gif (máximo 700.000 caracteres, lo valida el esquema). */
    private static function revisarQr(?string $qr): ?string
    {
        if ($qr === null || $qr === '') return null;
        if (!preg_match('#^(https://\S+|data:image/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+=*)$#', $qr)) {
            throw new HttpError(400, 'La imagen del QR no es válida (usa PNG, JPG, WEBP o GIF)', 'VALIDACION',
                [['path' => ['qrUrl'], 'message' => 'La imagen del QR no es válida']]);
        }
        return $qr;
    }

    private static function qrSchema(): \Closure { return Z::opcional(Z::nulable(Z::texto(trim: true, max: [700_000, null]))); }

    private static function metodoSchema(): \Closure
    {
        return Z::objeto([
            'qrUrl' => self::qrSchema(),
            'nombre' => Z::opcional(Z::texto(trim: true, min: [1, 'Escribe el nombre'], max: [60, null])),
            'numero' => Z::opcional(Z::nulable(Z::texto(trim: true, max: [60, null]))),
            'activo' => Z::opcional(Z::booleano()),
        ]);
    }

    private static function metodoNuevoSchema(): \Closure
    {
        return Z::objeto([
            'qrUrl' => self::qrSchema(),
            'nombre' => Z::texto('Escribe el nombre', trim: true, min: [1, 'Escribe el nombre'], max: [60, null]),
            'numero' => Z::opcional(Z::nulable(Z::texto(trim: true, max: [60, null]))),
            'activo' => Z::porDefecto(Z::booleano(), true),
        ]);
    }

    private static function metodo(string $codigo, bool $incluirEliminados = false): ?array
    {
        return Db::uno('SELECT * FROM metodos_pago WHERE codigo = ?' . ($incluirEliminados ? '' : ' AND eliminado_en IS NULL'), [$codigo]);
    }

    /** b.nombre.normalize('NFD').replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(0, 8) || 'mp' */
    private static function codigoBase(string $nombre): string
    {
        if (class_exists(\Normalizer::class)) {
            $s = \Normalizer::normalize($nombre, \Normalizer::FORM_D) ?: $nombre;
        } else {
            $s = strtr($nombre, [
                'á' => 'a', 'é' => 'e', 'í' => 'i', 'ó' => 'o', 'ú' => 'u', 'ü' => 'u', 'ñ' => 'n', 'à' => 'a', 'è' => 'e',
                'ì' => 'i', 'ò' => 'o', 'ù' => 'u', 'Á' => 'A', 'É' => 'E', 'Í' => 'I', 'Ó' => 'O', 'Ú' => 'U', 'Ü' => 'U',
                'Ñ' => 'N', 'ç' => 'c', 'Ç' => 'C',
            ]);
        }
        return substr(strtolower(preg_replace('/[^a-zA-Z0-9]/', '', $s)), 0, 8) ?: 'mp';
    }

    private static function n(mixed $x): int|float { return Fmt::num($x ?: 0) ?? 0; }

    public static function registrar(Router $r): void
    {
        $r->get('/api/config', function (Request $req) {
            Auth::rol($req, 'cocina');
            return Config::leer() ?: new \stdClass();
        });

        $r->put('/api/config', function (Request $req) {
            Auth::rol($req, 'cocina');
            $cambios = Z::validar(self::configSchema(), $req->body);
            $cfg = array_replace(Config::leer(), $cambios);
            Config::guardar($cfg);
            Bitacora::registrar($req, 'Cambió los ajustes (' . (implode(', ', array_keys($cambios)) ?: 'sin cambios') . ')');
            return $cfg ?: new \stdClass();
        });

        $r->get('/api/metodos-pago', function (Request $req) {
            Auth::rol($req, 'cocina');
            return Config::metodosPago(false, Archivo::eliminados($req) === 'eliminados');
        });

        $r->post('/api/metodos-pago', function (Request $req) {
            Auth::rol($req, 'cocina');
            $b = Z::validar(self::metodoNuevoSchema(), $req->body);
            $anterior = Db::uno('SELECT * FROM metodos_pago WHERE LOWER(nombre) = ? LIMIT 1', [mb_strtolower($b['nombre'])]);
            if ($anterior && empty($anterior['eliminado_en'])) throw new HttpError(409, 'Ya existe un método de pago con ese nombre');
            $fila = [
                'nombre' => $b['nombre'], 'numero' => ($b['numero'] ?? '') === '' ? null : $b['numero'],
                'qr_url' => self::revisarQr($b['qrUrl'] ?? null), 'activo' => (int) $b['activo'],
            ];
            if ($anterior) {
                $codigo = $anterior['codigo'];
                Db::actualizar('metodos_pago', [...$fila, 'eliminado_en' => null], 'codigo = ?', [$codigo]);
                $accion = 'Restauró';
            } else {
                $base = self::codigoBase($b['nombre']);
                $codigo = $base;
                for ($i = 2; Db::valor('SELECT codigo FROM metodos_pago WHERE codigo = ?', [$codigo]) !== null; $i++) $codigo = substr($base, 0, 8) . $i;
                $orden = Db::valor('SELECT MAX(orden) FROM metodos_pago');
                Db::insertar('metodos_pago', [...$fila, 'codigo' => $codigo, 'orden' => ($orden === null ? -1 : (int) $orden) + 1]);
                $accion = 'Creó';
            }
            Bitacora::registrar($req, "$accion el método de pago {$b['nombre']}");
            return Respuesta::con(201, Config::aMetodo(self::metodo($codigo)));
        });

        $r->delete('/api/metodos-pago/:codigo', function (Request $req, array $p) {
            Auth::rol($req, 'cocina');
            $codigo = mb_substr((string) $p['codigo'], 0, 10);
            $m = self::metodo($codigo);
            if (!$m) throw new HttpError(404, 'Método de pago no encontrado');
            Db::ejecutar('UPDATE metodos_pago SET eliminado_en = NOW() WHERE codigo = ?', [$codigo]);
            Bitacora::registrar($req, "Eliminó el método de pago {$m['nombre']}");
            return ['ok' => true];
        });

        $r->post('/api/metodos-pago/:codigo/restaurar', function (Request $req, array $p) {
            Auth::rol($req, 'cocina');
            $codigo = mb_substr((string) $p['codigo'], 0, 10);
            $m = self::metodo($codigo, true);
            if (!$m || empty($m['eliminado_en'])) throw new HttpError(404, 'Método de pago no encontrado');
            Db::ejecutar('UPDATE metodos_pago SET eliminado_en = NULL WHERE codigo = ?', [$codigo]);
            Bitacora::registrar($req, "Restauró el método de pago {$m['nombre']}");
            return Config::aMetodo(self::metodo($codigo));
        });

        $r->put('/api/metodos-pago/:codigo', function (Request $req, array $p) {
            Auth::rol($req, 'cocina');
            $codigo = mb_substr((string) $p['codigo'], 0, 10);
            if (!self::metodo($codigo)) throw new HttpError(404, 'Método de pago no encontrado');
            $b = Z::validar(self::metodoSchema(), $req->body);
            $fila = [];
            if (array_key_exists('nombre', $b)) $fila['nombre'] = $b['nombre'];
            if (array_key_exists('numero', $b)) $fila['numero'] = ($b['numero'] ?? '') === '' ? null : $b['numero'];
            if (array_key_exists('qrUrl', $b)) $fila['qr_url'] = self::revisarQr($b['qrUrl']);
            if (array_key_exists('activo', $b)) $fila['activo'] = (int) $b['activo'];
            if ($fila) Db::actualizar('metodos_pago', $fila, 'codigo = ?', [$codigo]);
            $m = Config::aMetodo(self::metodo($codigo));
            Bitacora::registrar($req, "Cambió el método de pago {$m['nombre']} (" . ($m['activo'] ? 'activo' : 'inactivo') . ')');
            return $m;
        });

        $r->get('/api/reportes/ventas', function (Request $req) {
            Auth::rol($req, 'cocina');
            $f = Rango::rango(Rango::validar($req->query), true);
            $arch = Archivo::archivados($req);
            $condP = $arch === 'solo' ? ' AND p.archivado_en IS NOT NULL' : ($arch === 'activos' ? ' AND p.archivado_en IS NULL' : '');
            $condC = $arch === 'solo' ? ' AND c.archivado_en IS NOT NULL' : ($arch === 'activos' ? ' AND c.archivado_en IS NULL' : '');
            $d = Fmt::sql($f['desde']);
            $h = Fmt::sql($f['hasta']);
            $ventas = "FROM pedidos p %s WHERE p.creado_en >= ? AND p.creado_en < ? AND p.estado <> 'cancelado'$condP";
            $tot = Db::uno('SELECT COALESCE(SUM(p.total),0) AS total, COUNT(*) AS pedidos,
                COALESCE(SUM(CASE WHEN p.pago_estado = \'pagado\' THEN p.total ELSE 0 END),0) AS cobrado,
                COALESCE(SUM(CASE WHEN p.origen = \'web\' THEN 1 ELSE 0 END),0) AS web ' . sprintf($ventas, ''), [$d, $h]);
            $porPlato = Db::todos('SELECT i.nombre, COUNT(*) AS cantidad, SUM(i.precio_unitario) AS total '
                . sprintf($ventas, 'INNER JOIN pedido_items i ON i.pedido_id = p.id')
                . ' GROUP BY i.nombre ORDER BY `total` DESC, i.nombre ASC', [$d, $h]);
            $porMetodo = Db::todos("SELECT COALESCE(m.nombre, 'Sin método') AS metodo, SUM(p.total) AS total "
                . sprintf($ventas, 'LEFT JOIN metodos_pago m ON m.codigo = p.metodo_pago')
                . ' GROUP BY m.nombre ORDER BY `total` DESC', [$d, $h]);
            $porDia = Db::todos("SELECT DATE_FORMAT(DATE(p.creado_en), '%Y-%m-%d') AS fecha, SUM(p.total) AS total "
                . sprintf($ventas, '') . " GROUP BY DATE_FORMAT(DATE(p.creado_en), '%Y-%m-%d') ORDER BY `fecha` ASC", [$d, $h]);
            $compras = Db::valor('SELECT COALESCE(SUM(costo),0) AS total FROM compras c WHERE c.fecha >= ? AND c.fecha < ? AND c.eliminado_en IS NULL' . $condC, [$d, $h]);
            return [
                'total' => self::n($tot['total']), 'pedidos' => self::n($tot['pedidos']),
                'cobrado' => self::n($tot['cobrado']), 'porCobrar' => Fmt::num(self::n($tot['total']) - self::n($tot['cobrado'])),
                'comprasWeb' => self::n($tot['web']),
                'porPlato' => array_map(fn($x) => ['nombre' => $x['nombre'], 'cantidad' => self::n($x['cantidad']), 'total' => self::n($x['total'])], $porPlato),
                'porMetodo' => array_map(fn($x) => ['metodo' => $x['metodo'], 'total' => self::n($x['total'])], $porMetodo),
                'porDia' => array_map(fn($x) => ['fecha' => $x['fecha'], 'total' => self::n($x['total'])], $porDia),
                'compras' => self::n($compras),
            ];
        });

        // r.use(['/config', '/metodos-pago', '/reportes'], requireRole('cocina')): el resto pide rol antes del 404.
        foreach (['get', 'post', 'put', 'patch', 'delete'] as $m) {
            $r->$m('/api/(config|metodos-pago|reportes)(/.*)?', function (Request $req) {
                Auth::rol($req, 'cocina');
                throw new HttpError(404, 'Ruta no encontrada');
            });
        }
    }
}
