<?php
declare(strict_types=1);

namespace Alci\Rutas;

use Alci\Core\{Auth, Db, Fmt, HttpError, RateLimit, Request, Router};
use Alci\Servicios\Puntos as Pt;

/** Puntos de fidelidad: saldo público por celular y consulta para cocina. */
final class Puntos
{
    public static function registrar(Router $r): void
    {
        // Público: solo devuelve el saldo del celular consultado (nunca nombre ni movimientos).
        $r->get('/api/public/puntos/:celular', function (Request $req, array $params) {
            RateLimit::exigir('puntos-saldo', max(1, (int) env('PUNTOS_SALDO_MAX', '10')), 600, $req->ip, 'Demasiadas consultas. Espera unos minutos.');
            $cel = Pt::normalizar(urldecode((string) $params['celular']));
            $a = Pt::ajustes();
            return ['celular' => $cel, 'activo' => $a['activo'], 'saldo' => Pt::saldo($cel),
                'puntosCanje' => $a['canje'], 'descuentoCanje' => $a['descuento']];
        });

        $r->get('/api/puntos/clientes', function (Request $req) {
            Auth::rol($req, 'cocina');
            $q = trim((string) ($req->query['q'] ?? ''));
            $where = '1=1';
            $p = [];
            if ($q !== '') {
                $like = '%' . addcslashes(mb_substr($q, 0, 60), '%_\\') . '%';
                $where = '(celular LIKE ? OR nombre LIKE ?)';
                $p = [$like, $like];
            }
            return array_map(fn($c) => [
                'celular' => $c['celular'], 'nombre' => $c['nombre'], 'saldo' => (int) $c['saldo'], 'actualizadoEn' => Fmt::iso($c['actualizado_en']),
            ], Db::todos("SELECT * FROM puntos_clientes WHERE $where ORDER BY saldo DESC, celular LIMIT 200", $p));
        });

        $r->get('/api/puntos/clientes/:celular/movimientos', function (Request $req, array $params) {
            Auth::rol($req, 'cocina');
            $cel = Pt::normalizar(urldecode((string) $params['celular']));
            $c = Db::uno('SELECT * FROM puntos_clientes WHERE celular = ?', [$cel]);
            if (!$c) throw new HttpError(404, 'Cliente sin puntos');
            return [
                'celular' => $cel, 'nombre' => $c['nombre'], 'saldo' => (int) $c['saldo'],
                'movimientos' => array_map(fn($m) => [
                    'id' => (int) $m['id'], 'pedidoId' => $m['pedido_id'] !== null ? (int) $m['pedido_id'] : null,
                    'tipo' => $m['tipo'], 'puntos' => (int) $m['puntos'], 'creadoEn' => Fmt::iso($m['creado_en']),
                ], Db::todos('SELECT * FROM puntos_movimientos WHERE celular = ? ORDER BY id DESC LIMIT 200', [$cel])),
            ];
        });
    }
}
