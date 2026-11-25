<?php
declare(strict_types=1);

namespace Alci\Rutas;

use Alci\Core\{Auth, Db, Fmt, HttpError, Request, Router, V};
use Alci\Servicios\{Bitacora, Rango};
use Alci\Servicios\Pedidos as P;

/** Facturas (historial de tirillas) y reinicio de reportes (rol cocina). */
final class Admin
{
    /** Entero de la query con límites; $def si no viene. */
    private static function entero(array $q, string $k, int $def, int $min, int $max): int
    {
        if (!isset($q[$k])) return $def;
        $v = trim($q[$k]);
        if (!preg_match('/^\d+$/', $v) || (int) $v < $min || (int) $v > $max) V::fallo("\"$k\" debe ser un entero entre $min y $max", $k);
        return (int) $v;
    }

    public static function registrar(Router $r): void
    {
        $r->get('/api/facturas', function (Request $req) {
            Auth::rol($req, 'cocina');
            $f = Rango::rango(Rango::validar($req->query));
            $pagina = self::entero($req->query, 'pagina', 1, 1, 100000);
            $porPagina = self::entero($req->query, 'porPagina', 20, 1, 100);
            $where = '1=1';
            $p = [];
            if ($f['desde']) { $where .= ' AND p.creado_en >= ?'; $p[] = Fmt::sql($f['desde']); }
            if ($f['hasta']) { $where .= ' AND p.creado_en < ?'; $p[] = Fmt::sql($f['hasta']); }
            $q = trim((string) ($req->query['q'] ?? ''));
            if ($q !== '') {
                $like = '%' . addcslashes(mb_substr($q, 0, 60), '%_\\') . '%';
                $where .= ' AND (p.cliente LIKE ? OR p.telefono LIKE ? OR p.celular LIKE ? OR p.destino LIKE ?';
                array_push($p, $like, $like, $like, $like);
                if (preg_match('/^#?(\d{1,9})$/', $q, $m)) { $where .= ' OR p.id = ?'; $p[] = (int) $m[1]; }
                $where .= ')';
            }
            $total = (int) Db::valor("SELECT COUNT(*) FROM pedidos p WHERE $where", $p);
            $ids = array_map(fn($x) => (int) $x['id'], Db::todos(
                "SELECT p.id FROM pedidos p WHERE $where ORDER BY p.id DESC LIMIT $porPagina OFFSET " . (($pagina - 1) * $porPagina), $p));
            return [
                'total' => $total, 'pagina' => $pagina, 'porPagina' => $porPagina, 'paginas' => (int) ceil($total / $porPagina),
                'facturas' => $ids ? P::cargarPedidos('p.id IN (' . Db::marcas($ids) . ')', $ids) : [],
            ];
        });

        $r->post('/api/admin/reiniciar-reportes', function (Request $req) {
            Auth::rol($req, 'cocina');
            if (($req->datos()['confirmar'] ?? null) !== 'BORRAR') V::fallo('Escribe BORRAR para confirmar', 'confirmar');
            $n = Db::tx(function () {
                $pedidos = Db::ejecutar('DELETE FROM pedidos'); // los ítems y sus detalles caen en cascada
                $compras = Db::ejecutar('DELETE FROM compras');
                $bitacora = Db::ejecutar('DELETE FROM bitacora');
                return ['pedidos' => $pedidos, 'compras' => $compras, 'bitacora' => $bitacora];
            });
            Bitacora::registrar($req, 'Reinició los reportes');
            return ['ok' => true, ...$n];
        });
    }
}
