<?php
declare(strict_types=1);

namespace Alci;

use Alci\Core\{Csrf, Db, HttpError, Request, Respuesta, Router, Sesion};

/** Equivalente a server/src/app.js: cabeceras, sesión, CSRF, rutas y manejo de errores. */
final class App
{
    /** Módulos de rutas, en el mismo orden que app.js (la primera coincidencia gana). */
    private const MODULOS = [
        Rutas\Auth::class, Rutas\Bitacora::class, Rutas\Publico::class, Rutas\Pedidos::class, Rutas\Admin::class,
        Rutas\Promociones::class, Rutas\Puntos::class,
        Rutas\Catalogo::class, Rutas\Inventario::class, Rutas\Ajustes::class, Rutas\Usuarios::class,
    ];

    public static function cabeceras(): void
    {
        header("Content-Security-Policy: default-src 'self'; base-uri 'self'; font-src 'self' data: https://fonts.gstatic.com; "
            . "form-action 'self'; frame-ancestors 'self'; img-src 'self' data: blob: https:; object-src 'none'; "
            . "script-src 'self'; script-src-attr 'none'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            . "upgrade-insecure-requests");
        header('Cross-Origin-Opener-Policy: same-origin');
        header('Cross-Origin-Resource-Policy: same-origin');
        header('Origin-Agent-Cluster: ?1');
        header('Referrer-Policy: no-referrer');
        header('X-Content-Type-Options: nosniff');
        header('X-DNS-Prefetch-Control: off');
        header('X-Download-Options: noopen');
        header('X-Frame-Options: SAMEORIGIN');
        header('X-Permitted-Cross-Domain-Policies: none');
        header('X-XSS-Protection: 0');
        if (env('APP_ENV') === 'production') header('Strict-Transport-Security: max-age=31536000; includeSubDomains');
        header_remove('X-Powered-By');
    }

    public static function router(): Router
    {
        $r = new Router();
        $r->get('/api/health', function () {
            try {
                $v = Db::valor('SELECT VERSION()');
                $n = (int) Db::valor('SELECT COUNT(*) FROM platos');
                return Respuesta::con(200, ['ok' => true, 'mysql' => $v, 'platos' => $n]);
            } catch (\Throwable) {
                return Respuesta::con(503, ['ok' => false, 'error' => 'Base de datos no disponible']);
            }
        });
        foreach (self::MODULOS as $m) $m::registrar($r);
        return $r;
    }

    public static function correr(): void
    {
        self::cabeceras();
        header('Cache-Control: no-store');
        $sesionIniciada = false;
        try {
            $req = Request::desdeGlobales();
            Sesion::iniciar();
            $sesionIniciada = true;
            $hit = self::router()->buscar($req->method, $req->path);
            if (!$hit) throw new HttpError(404, 'Ruta no encontrada');
            Csrf::revisar($req);
            [$h, $params] = $hit;
            $res = $h($req, $params);
            if (!$res instanceof Respuesta) $res = Respuesta::con(200, $res);
        } catch (HttpError $e) {
            $cuerpo = ['error' => $e->getMessage()];
            if ($e->codigo !== null) $cuerpo['code'] = $e->codigo;
            if ($e->detalles !== null) $cuerpo['detalles'] = $e->detalles;
            $res = Respuesta::con($e->status, $cuerpo);
        } catch (\PDOException $e) {
            $dup = ($e->errorInfo[1] ?? null) === 1062;
            if (!$dup) error_log('[alcipizza] ' . $e);
            $res = $dup ? Respuesta::con(409, ['error' => 'Ese registro ya existe']) : Respuesta::con(500, ['error' => 'Error interno']);
        } catch (\Throwable $e) {
            error_log('[alcipizza] ' . $e);
            $res = Respuesta::con(500, ['error' => 'Error interno']);
        }
        try {
            if ($sesionIniciada) Sesion::cerrar();
        } catch (\Throwable $e) {
            error_log('[alcipizza] sesión: ' . $e);
        }
        Respuesta::enviar($res->status, $res->datos, $res->sinCuerpo);
    }
}
