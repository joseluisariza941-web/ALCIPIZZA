<?php
declare(strict_types=1);

namespace Alci\Core;

final class Request
{
    /** Usuario de la sesión (fila de `usuarios`) una vez cargado por Auth; null si no hay. */
    public ?array $user = null;
    public bool $userCargado = false;

    /**
     * @param array<string,string> $query  parámetros ?a=b
     * @param mixed $body JSON decodificado (arrays asociativos) o null
     * @param array<string,string> $headers nombres en minúscula
     */
    public function __construct(
        public readonly string $method,
        public readonly string $path,
        public readonly array $query,
        public readonly mixed $body,
        public readonly array $headers,
        public readonly string $ip,
    ) {}

    public static function desdeGlobales(): self
    {
        $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
        $path = rawurldecode(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/');
        $path = rtrim($path, '/') ?: '/';

        $headers = [];
        foreach ($_SERVER as $k => $v) {
            if (str_starts_with($k, 'HTTP_')) $headers[strtolower(str_replace('_', '-', substr($k, 5)))] = (string) $v;
        }
        if (isset($_SERVER['CONTENT_TYPE'])) $headers['content-type'] = $_SERVER['CONTENT_TYPE'];
        if (isset($_SERVER['CONTENT_LENGTH'])) $headers['content-length'] = $_SERVER['CONTENT_LENGTH'];

        $body = null;
        if (!in_array($method, ['GET', 'HEAD', 'OPTIONS'], true)) {
            if ((int) ($headers['content-length'] ?? 0) > 5 * 1024 * 1024) {
                throw new HttpError(413, 'La solicitud es demasiado grande');
            }
            $crudo = file_get_contents('php://input') ?: '';
            if (strlen($crudo) > 5 * 1024 * 1024) throw new HttpError(413, 'La solicitud es demasiado grande');
            if (trim($crudo) !== '' && str_contains($headers['content-type'] ?? '', 'json')) {
                try {
                    $body = json_decode($crudo, true, 64, JSON_THROW_ON_ERROR);
                } catch (\JsonException) {
                    throw new HttpError(400, 'Solicitud mal formada');
                }
            }
        }

        $query = [];
        foreach ($_GET as $k => $v) $query[$k] = is_array($v) ? (string) reset($v) : (string) $v;

        return new self($method, $path, $query, $body, $headers, (string) ($_SERVER['REMOTE_ADDR'] ?? ''));
    }

    public function header(string $nombre): ?string
    {
        return $this->headers[strtolower($nombre)] ?? null;
    }

    /** Cuerpo como array (objeto JSON); [] si no vino o no es objeto. */
    public function datos(): array
    {
        return is_array($this->body) ? $this->body : [];
    }
}
