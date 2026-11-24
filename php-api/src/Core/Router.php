<?php
declare(strict_types=1);

namespace Alci\Core;

/** Router mínimo: rutas tipo '/api/pedidos/:id'. El handler recibe (Request $req, array $params). */
final class Router
{
    /** @var list<array{string,string,callable}> */
    private array $rutas = [];

    public function get(string $p, callable $h): void { $this->agregar('GET', $p, $h); }
    public function post(string $p, callable $h): void { $this->agregar('POST', $p, $h); }
    public function put(string $p, callable $h): void { $this->agregar('PUT', $p, $h); }
    public function patch(string $p, callable $h): void { $this->agregar('PATCH', $p, $h); }
    public function delete(string $p, callable $h): void { $this->agregar('DELETE', $p, $h); }

    public function agregar(string $metodo, string $patron, callable $h): void
    {
        $re = preg_replace_callback('#:([a-zA-Z_]\w*)#', fn($m) => '(?P<' . $m[1] . '>[^/]+)', rtrim($patron, '/'));
        $this->rutas[] = [$metodo, '#^' . $re . '$#', $h];
    }

    /** @return array{callable,array<string,string>}|null  la primera ruta que coincide (como Express). */
    public function buscar(string $metodo, string $path): ?array
    {
        if ($metodo === 'HEAD') $metodo = 'GET';
        foreach ($this->rutas as [$m, $re, $h]) {
            if ($m === $metodo && preg_match($re, $path, $mm)) {
                return [$h, array_filter($mm, 'is_string', ARRAY_FILTER_USE_KEY)];
            }
        }
        return null;
    }
}
