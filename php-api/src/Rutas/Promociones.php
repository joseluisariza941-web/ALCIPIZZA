<?php
declare(strict_types=1);

namespace Alci\Rutas;

use Alci\Core\{Auth, Db, HttpError, Request, Respuesta, Router};
use Alci\Servicios\{Archivo, Bitacora, Promociones as Pr};
use Alci\Servicios\Pedidos as P;

/** CRUD de promociones (rol cocina). */
final class Promociones
{
    private const CLAVES = ['nombre', 'tipo', 'alcance', 'platoId', 'categoria', 'valor', 'montoMinimo', 'inicio', 'fin', 'dias', 'horaDesde', 'horaHasta', 'activa'];

    private static function existente(int $id): array
    {
        return Pr::una($id) ?? throw new HttpError(404, 'Promoción no encontrada');
    }

    public static function registrar(Router $r): void
    {
        $r->get('/api/promociones', function (Request $req) {
            Auth::rol($req, 'cocina');
            return Pr::todas(Archivo::eliminados($req) === 'eliminados');
        });

        $r->post('/api/promociones', function (Request $req) {
            Auth::rol($req, 'cocina');
            $d = array_intersect_key($req->datos(), array_flip(self::CLAVES));
            $id = Db::insertar('promociones', Pr::validar($d));
            Bitacora::registrar($req, "Creó la promoción {$d['nombre']}");
            return Respuesta::con(201, Pr::una($id));
        });

        $r->put('/api/promociones/:id', function (Request $req, array $params) {
            Auth::rol($req, 'cocina');
            $id = P::id($params);
            $actual = self::existente($id);
            $d = array_replace(array_intersect_key($actual, array_flip(self::CLAVES)), array_intersect_key($req->datos(), array_flip(self::CLAVES)));
            Db::actualizar('promociones', Pr::validar($d), 'id = ?', [$id]);
            $nueva = Pr::una($id);
            Bitacora::registrar($req, "Editó la promoción {$nueva['nombre']}");
            return $nueva;
        });

        $r->delete('/api/promociones/:id', function (Request $req, array $params) {
            Auth::rol($req, 'cocina');
            $id = P::id($params);
            $p = self::existente($id);
            Db::ejecutar('UPDATE promociones SET eliminado_en = NOW() WHERE id = ?', [$id]);
            Bitacora::registrar($req, "Eliminó la promoción {$p['nombre']}");
            return ['ok' => true];
        });

        $r->post('/api/promociones/:id/restaurar', function (Request $req, array $params) {
            Auth::rol($req, 'cocina');
            $id = P::id($params);
            $p = Pr::una($id, true);
            if (!$p || empty($p['eliminadoEn'])) throw new HttpError(404, 'Promoción no encontrada');
            Db::ejecutar('UPDATE promociones SET eliminado_en = NULL WHERE id = ?', [$id]);
            Bitacora::registrar($req, "Restauró la promoción {$p['nombre']}");
            return Pr::una($id);
        });
    }
}
