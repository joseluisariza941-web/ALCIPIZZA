<?php
declare(strict_types=1);

namespace Alci\Servicios;

use Alci\Core\Db;
use Alci\Core\Request;

final class Bitacora
{
    /**
     * Registra una acción con el usuario real de la sesión y la IP.
     * @param array|null|false $quien false = el usuario de la sesión ($req->user); null = cliente web
     */
    public static function registrar(Request $req, string $accion, array|null|false $quien = false): void
    {
        if ($quien === false) $quien = $req->user;
        Db::insertar('bitacora', [
            'usuario_id' => $quien['id'] ?? null,
            'usuario' => $quien['usuario'] ?? 'cliente',
            'nombre' => $quien['nombre'] ?? 'Cliente web',
            'accion' => mb_substr($accion, 0, 400),
            'ip' => substr($req->ip, 0, 45) ?: null,
        ]);
    }
}
