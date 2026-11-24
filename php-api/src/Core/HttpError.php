<?php
declare(strict_types=1);

namespace Alci\Core;

/** Error HTTP con mensaje para mostrar, código opcional (MAYUSCULAS) y detalles. Igual que errores.js. */
final class HttpError extends \RuntimeException
{
    public function __construct(
        public readonly int $status,
        string $mensaje,
        public readonly ?string $codigo = null,
        public readonly mixed $detalles = null,
    ) {
        parent::__construct($mensaje);
    }
}
