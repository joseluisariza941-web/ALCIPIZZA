<?php
declare(strict_types=1);

// Arranque común: autoload (sin Composer, para el hosting compartido), .env y zona horaria.

spl_autoload_register(function (string $clase): void {
    if (!str_starts_with($clase, 'Alci\\')) return;
    $ruta = __DIR__ . '/' . str_replace('\\', '/', substr($clase, 5)) . '.php';
    if (is_file($ruta)) require $ruta;
});

/** Carga KEY=valor de un .env sin pisar variables que ya existan en el entorno. */
(function (): void {
    $archivo = getenv('ALCI_ENV_FILE') ?: dirname(__DIR__) . '/.env';
    if (!is_file($archivo)) return;
    foreach (file($archivo, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $linea) {
        $linea = trim(preg_replace('/^\xEF\xBB\xBF/', '', $linea));
        if ($linea === '' || $linea[0] === '#' || !str_contains($linea, '=')) continue;
        [$k, $v] = array_map('trim', explode('=', $linea, 2));
        if (preg_match('/^(["\'])(.*)\1$/', $v, $m)) $v = $m[2];
        if (getenv($k) === false) putenv("$k=$v");
    }
})();

date_default_timezone_set('America/Bogota');
mb_internal_encoding('UTF-8');

/** Variable de entorno con valor por defecto. */
function env(string $k, ?string $porDefecto = null): ?string
{
    $v = getenv($k);
    return $v === false || $v === '' ? $porDefecto : $v;
}
