<?php
declare(strict_types=1);

namespace Alci\Rutas;

use Alci\Core\Db;
use Alci\Core\Request;
use Alci\Core\Router;
use Alci\Servicios\{Config, Horario, Menu, Suscripcion};

/** Igual que routes/publico.js: config pública y menú. */
final class Publico
{
    public static function registrar(Router $r): void
    {
        $r->get('/api/public/config', function (Request $req) {
            // La config se devuelve tal como está guardada (objetos JSON como objetos, aunque estén vacíos).
            $v = Db::valor("SELECT valor FROM config WHERE clave = 'general'");
            $config = is_string($v) ? json_decode($v) : null;
            if (!is_object($config)) $config = new \stdClass();
            $cfg = Config::leer();
            return [
                'config' => $config,
                'pagos' => Config::metodosPago(true),
                'abierto' => Horario::estaAbierto($cfg['h'] ?? null),
                'suscripcionActiva' => Suscripcion::activa(),
            ];
        });

        $r->get('/api/menu', fn(Request $req) => array_map([Menu::class, 'publico'], Menu::cargarPlatos(true)));
    }
}
