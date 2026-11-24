<?php
// Router para `php -S` (desarrollo y pruebas): /api → index.php; archivos que existan → tal cual; resto → SPA.
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
if ($path === '/api' || str_starts_with($path, '/api/')) { require __DIR__ . '/index.php'; return true; }
$dist = getenv('ALCI_DIST') ?: __DIR__;
$archivo = realpath($dist . $path);
if ($archivo && is_file($archivo) && str_starts_with($archivo, realpath($dist))) {
    if ($dist === __DIR__) return false;
    $tipos = ['js' => 'text/javascript', 'css' => 'text/css', 'svg' => 'image/svg+xml', 'png' => 'image/png',
        'jpg' => 'image/jpeg', 'webp' => 'image/webp', 'ico' => 'image/x-icon', 'json' => 'application/json',
        'woff2' => 'font/woff2', 'html' => 'text/html; charset=utf-8', 'webmanifest' => 'application/manifest+json'];
    header('Content-Type: ' . ($tipos[pathinfo($archivo, PATHINFO_EXTENSION)] ?? 'application/octet-stream'));
    readfile($archivo);
    return true;
}
$index = $dist . '/index.html';
if (is_file($index)) {
    require_once dirname(__DIR__) . '/src/bootstrap.php';
    \Alci\App::cabeceras();
    header('Cache-Control: no-cache');
    header('Content-Type: text/html; charset=utf-8');
    readfile($index);
    return true;
}
http_response_code(404);
return true;
