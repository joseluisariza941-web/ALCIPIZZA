<?php
declare(strict_types=1);

/*
 * Crea (o restablece) los usuarios iniciales de Alcipizza, igual que server/seeds/01_inicial.js:
 *   dev    → rol dev,    nombre "Desarrollador"
 *   admin  → rol cocina, nombre "Administración cocina"
 *   ana    → rol mesera, nombre "Ana"
 * Todos quedan con debe_cambiar_clave = 1 (se pide cambiarla al primer ingreso). Hash bcrypt costo 12.
 *
 * Uso (por SSH, desde ~/domains/<dominio>/alcipizza-api):
 *   php scripts/crear-usuarios.php                         crea los que falten con claves aleatorias (se muestran UNA vez)
 *   php scripts/crear-usuarios.php --admin-pass='Clave…'    usa esa clave (mínimo 8 caracteres)
 *   php scripts/crear-usuarios.php --reset                 a los que ya existen les pone clave nueva aleatoria
 *   php scripts/crear-usuarios.php --solo=admin --reset    solo ese usuario (dev | admin | mesera)
 * Otras opciones: --dev-user= --admin-user= --mesera-user= --mesera-nombre=  (o DEV_USER / ADMIN_USER / MESERA_USER en .env)
 * Un usuario que ya existe solo se toca si se pasa su --X-pass o --reset (clave nueva, activo, desbloqueado, sesiones cerradas).
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

$src = getenv('ALCI_SRC') ?: (is_dir(__DIR__ . '/../src') ? __DIR__ . '/../src' : __DIR__ . '/../../alcipizza-api/src');
require $src . '/bootstrap.php';

use Alci\Core\Db;

$opc = getopt('h', ['dev-pass:', 'admin-pass:', 'mesera-pass:', 'dev-user:', 'admin-user:', 'mesera-user:',
    'mesera-nombre:', 'solo:', 'reset', 'help']);
if (isset($opc['h']) || isset($opc['help'])) {
    preg_match('#/\*(.*?)\*/#s', (string) file_get_contents(__FILE__), $m);
    echo trim(preg_replace('/^\s*\* ?/m', '', $m[1])), "\n";
    exit(0);
}

$iniciales = [
    'dev' => ['rol' => 'dev', 'usuario' => $opc['dev-user'] ?? env('DEV_USER', 'dev'), 'nombre' => 'Desarrollador'],
    'admin' => ['rol' => 'cocina', 'usuario' => $opc['admin-user'] ?? env('ADMIN_USER', 'admin'), 'nombre' => 'Administración cocina'],
    'mesera' => ['rol' => 'mesera', 'usuario' => $opc['mesera-user'] ?? env('MESERA_USER', 'ana'), 'nombre' => $opc['mesera-nombre'] ?? 'Ana'],
];
if (isset($opc['solo'])) {
    if (!isset($iniciales[$opc['solo']])) fallar('--solo debe ser dev, admin o mesera');
    $iniciales = [$opc['solo'] => $iniciales[$opc['solo']]];
}
$reset = isset($opc['reset']);

function fallar(string $msg): never
{
    fwrite(STDERR, "Error: $msg\n");
    exit(1);
}

/** 16 caracteres aleatorios (letras, números, - y _): ~96 bits. */
function claveAleatoria(): string
{
    return rtrim(strtr(base64_encode(random_bytes(12)), '+/', '-_'), '=');
}

try {
    Db::valor('SELECT 1 FROM usuarios LIMIT 1');
} catch (Throwable $e) {
    fallar('no se pudo usar la tabla usuarios (¿.env correcto? ¿importaste schema.sql?): ' . $e->getMessage());
}

// Validar todo antes de escribir nada.
foreach ($iniciales as $clave => &$u) {
    $u['usuario'] = mb_strtolower(trim((string) $u['usuario']));
    if (!preg_match('/^[a-z0-9._-]{3,30}$/', $u['usuario'])) fallar("usuario inválido para $clave: \"{$u['usuario']}\"");
    $dada = $opc["$clave-pass"] ?? null;
    if (is_array($dada)) fallar("--$clave-pass va una sola vez");
    if ($dada !== null && mb_strlen($dada) < 8) fallar("la clave de $clave debe tener al menos 8 caracteres");
}
unset($u);

$hechos = [];
foreach ($iniciales as $clave => $u) {
    $usuario = $u['usuario'];
    $dada = $opc["$clave-pass"] ?? null;
    $existe = Db::uno('SELECT id FROM usuarios WHERE usuario = ?', [$usuario]);
    if ($existe && $dada === null && !$reset) {
        echo "· {$u['rol']}: \"$usuario\" ya existe, no se cambia (usa --$clave-pass=… o --reset)\n";
        continue;
    }
    $pass = $dada ?? claveAleatoria();
    $hash = password_hash($pass, PASSWORD_BCRYPT, ['cost' => 12]);

    if ($existe) {
        Db::ejecutar('UPDATE usuarios SET clave_hash = ?, rol = ?, activo = 1, debe_cambiar_clave = 1, intentos_fallidos = 0,
            bloqueado_hasta = NULL WHERE id = ?', [$hash, $u['rol'], $existe['id']]);
        Db::ejecutar("DELETE FROM sessions WHERE JSON_VALID(data) AND JSON_EXTRACT(data, '$.userId') = ?", [(int) $existe['id']]);
        $accion = 'clave restablecida';
    } else {
        Db::ejecutar('INSERT INTO usuarios (usuario, nombre, rol, clave_hash, activo, debe_cambiar_clave) VALUES (?, ?, ?, ?, 1, 1)',
            [$usuario, $u['nombre'], $u['rol'], $hash]);
        $accion = 'creado';
    }
    $hechos[] = [$u['rol'], $usuario, $dada === null ? $pass : '(la que pasaste)', $accion];
}

if ($hechos) {
    echo "\nGuarda estas claves ahora: no se vuelven a mostrar. Se pedirá cambiarlas al primer ingreso.\n";
    foreach ($hechos as [$rol, $usuario, $pass, $accion]) {
        printf("  %-7s usuario: %-12s clave: %s   (%s)\n", $rol, $usuario, $pass, $accion);
    }
}
