<?php
declare(strict_types=1);

// Controlador frontal de la API. En Hostinger el código vive fuera de public_html:
// ~/domains/<dominio>/public_html/index.php → ~/domains/<dominio>/alcipizza-api/src (o lo que diga ALCI_SRC).
$src = getenv('ALCI_SRC') ?: (is_dir(__DIR__ . '/../src') ? __DIR__ . '/../src' : __DIR__ . '/../alcipizza-api/src');
require $src . '/bootstrap.php';
\Alci\App::correr();
