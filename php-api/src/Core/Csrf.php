<?php
declare(strict_types=1);

namespace Alci\Core;

final class Csrf
{
    public static function nuevoToken(): string { return rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '='); }

    /** Exige X-CSRF-Token igual al de la sesión en POST/PUT/PATCH/DELETE. */
    public static function revisar(Request $req): void
    {
        if (in_array($req->method, ['GET', 'HEAD', 'OPTIONS'], true)) return;
        $esperado = Sesion::get('csrfToken');
        $recibido = $req->header('x-csrf-token');
        if (!is_string($esperado) || !$recibido || !hash_equals($esperado, $recibido)) {
            throw new HttpError(403, 'La sesión de seguridad venció. Recarga la página e intenta de nuevo.', 'CSRF');
        }
    }
}
