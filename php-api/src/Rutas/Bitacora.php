<?php
declare(strict_types=1);

namespace Alci\Rutas;

use Alci\Core\Auth;
use Alci\Core\Db;
use Alci\Core\Fmt;
use Alci\Core\Request;
use Alci\Core\Router;
use Alci\Servicios\Zod;

/** Igual que server/src/routes/bitacora.js (montado en /api/bitacora). */
final class Bitacora
{
    public static function registrar(Router $r): void
    {
        $r->get('/api/bitacora', function (Request $req) {
            Auth::rol($req, 'cocina', 'dev');
            $z = new Zod($req->query);
            $limit = $z->enteroCoaccion('limit', ['min' => 1, 'max' => 1000, 'defecto' => 200]);
            $z->fin();
            $filas = Db::todos('SELECT id, fecha, usuario, nombre, accion, ip FROM bitacora ORDER BY id DESC LIMIT ' . (int) $limit);
            return array_map(fn($f) => [
                'id' => (int) $f['id'], 'fecha' => Fmt::iso($f['fecha']), 'usuario' => $f['usuario'],
                'nombre' => $f['nombre'], 'accion' => $f['accion'], 'ip' => $f['ip'],
            ], $filas);
        });
    }
}
