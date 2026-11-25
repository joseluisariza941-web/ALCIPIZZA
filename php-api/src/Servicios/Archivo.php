<?php
declare(strict_types=1);

namespace Alci\Servicios;

use Alci\Core\Fmt;
use Alci\Core\Request;
use Alci\Core\V;

/** Filtros comunes de eliminación lógica y archivado, y campos que se exponen en las respuestas. */
final class Archivo
{
    /** 'activos' (por defecto) o 'eliminados'; cualquier otro valor es 400. */
    public static function eliminados(Request $req): string
    {
        $v = $req->query['eliminados'] ?? '0';
        if ($v === '0') return 'activos';
        if ($v === '1') return 'eliminados';
        V::fallo('El filtro "eliminados" debe ser 0 o 1', 'eliminados');
    }

    /** 'activos' (por defecto), 'incluir' o 'solo'; cualquier otro valor es 400. */
    public static function archivados(Request $req): string
    {
        $v = $req->query['archivados'] ?? 'activos';
        if (in_array($v, ['activos', 'incluir', 'solo'], true)) return $v;
        V::fallo('El filtro "archivados" debe ser incluir o solo', 'archivados');
    }

    /**
     * Fragmento SQL para añadir a un WHERE (sin '?' ni parámetros). El alias es interno, del código.
     * @param string $alias p. ej. 'p.' o 'c.'
     */
    public static function condicion(Request $req, bool $eliminados = false, bool $archivados = false, string $alias = ''): string
    {
        $partes = [];
        if ($eliminados) {
            $partes[] = $alias . 'eliminado_en IS ' . (self::eliminados($req) === 'eliminados' ? 'NOT ' : '') . 'NULL';
        }
        if ($archivados) {
            $v = self::archivados($req);
            if ($v === 'solo') $partes[] = $alias . 'archivado_en IS NOT NULL';
            elseif ($v === 'activos') $partes[] = $alias . 'archivado_en IS NULL';
        }
        return $partes ? ' AND ' . implode(' AND ', $partes) : '';
    }

    /** Añade eliminadoEn/archivadoEn solo cuando la fila los tiene (no rompe las respuestas antiguas). */
    public static function marcar(array $dto, array $fila, bool $archivado = false): array
    {
        if (!empty($fila['eliminado_en'])) $dto['eliminadoEn'] = Fmt::iso($fila['eliminado_en']);
        if ($archivado && !empty($fila['archivado_en'])) $dto['archivadoEn'] = Fmt::iso($fila['archivado_en']);
        return $dto;
    }
}
