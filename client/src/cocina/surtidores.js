// Lógica pura de la pestaña Surtidores.

/**
 * Valida el formulario de nuevo surtidor (addSur original).
 * @param {{nombre?:string, empresa?:string, correo?:string, telefono?:string}} f
 */
export function validarSurtidor(f) {
  const nombre = (f.nombre || '').trim();
  if (!nombre) return { error: 'Escribe el nombre del surtidor' };
  return { body: { nombre, empresa: (f.empresa || '').trim(), correo: (f.correo || '').trim(), telefono: (f.telefono || '').trim() } };
}

/**
 * Surtidores con sus productos, total comprado y última compra, filtrados por texto.
 * @param {any[]} surtidores
 * @param {any[]} compras
 * @param {any[]} insumos
 * @param {string} q
 */
export function filasSurtidores(surtidores, compras, insumos, q) {
  const b = (q || '').toLowerCase();
  return surtidores.map(z => {
    const cs = compras.filter(c => c.surtidor?.id === z.id);
    const nombres = [...new Set([...cs.map(c => c.insumo?.nombre), ...insumos.filter(i => i.surtidorId === z.id).map(i => i.nombre)])].filter(Boolean);
    const ultima = cs.map(c => c.fecha).sort((a, c) => +new Date(c) - +new Date(a))[0] || null;
    return { ...z, productos: nombres.join(', ') || '—', total: cs.reduce((a, c) => a + (Number(c.costo) || 0), 0), ultima };
  }).filter(z => `${z.nombre} ${z.empresa || ''} ${z.correo || ''} ${z.telefono || ''} ${z.productos}`.toLowerCase().includes(b));
}
