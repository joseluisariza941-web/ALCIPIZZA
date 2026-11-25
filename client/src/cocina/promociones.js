// Lógica pura de la pestaña Promociones.
export const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

const hoy = () => new Date().toISOString().slice(0, 10);

/** Formulario vacío de una promoción. */
export const promoVacia = () => ({ nombre: '', tipo: 'porcentaje', alcance: 'total', platoId: '', categoria: '', valor: '', montoMinimo: '',
  inicio: hoy(), fin: hoy(), dias: /** @type {number[]} */ ([]), horaDesde: '', horaHasta: '', activa: true });

/** Promoción de la API a formulario. @param {any} p */
export const aForm = p => ({ ...promoVacia(), ...p, platoId: p.platoId ?? '', categoria: p.categoria ?? '', montoMinimo: p.montoMinimo ?? '',
  dias: p.dias ?? [], horaDesde: p.horaDesde ?? '', horaHasta: p.horaHasta ?? '' });

/** Formulario a cuerpo de la API. @param {any} f */
export function promoBody(f) {
  const b = /** @type {any} */ ({ nombre: f.nombre.trim(), tipo: f.tipo, alcance: f.alcance, valor: Number(f.valor), inicio: f.inicio, fin: f.fin,
    dias: f.dias.length && f.dias.length < 7 ? [...f.dias].sort() : null,
    horaDesde: f.horaDesde || null, horaHasta: f.horaDesde ? (f.horaHasta || null) : null, activa: !!f.activa });
  if (f.alcance === 'plato') b.platoId = Number(f.platoId);
  if (f.alcance === 'categoria') b.categoria = f.categoria;
  if (f.alcance === 'total' && f.montoMinimo !== '') b.montoMinimo = Number(f.montoMinimo);
  return b;
}

/** Mensaje de lo que falta o está mal (o ''). @param {any} f */
export function errorPromo(f) {
  if (!f.nombre.trim()) return 'Escribe el nombre';
  const v = Number(f.valor);
  if (!(v > 0)) return 'El valor debe ser mayor que 0';
  if (f.tipo === 'porcentaje' && v > 100) return 'El porcentaje no puede pasar de 100';
  if (f.alcance === 'plato' && !f.platoId) return 'Elige el plato';
  if (f.alcance === 'categoria' && !f.categoria) return 'Elige la categoría';
  if (!f.inicio || !f.fin) return 'Indica las fechas de inicio y fin';
  if (f.inicio > f.fin) return 'La fecha de inicio no puede ser posterior a la de fin';
  if (!f.horaDesde !== !f.horaHasta) return 'Indica la hora de inicio y la de fin';
  return '';
}

const pesos = n => '$' + Number(n).toLocaleString('es-CO');

/** Resumen corto de la rebaja. @param {any} p */
export const resumenPromo = p => {
  const v = p.tipo === 'porcentaje' ? `${p.valor}%` : pesos(p.valor);
  const a = p.alcance === 'plato' ? 'en un plato' : p.alcance === 'categoria' ? `en ${p.categoria}`
    : `sobre el total${p.montoMinimo ? ` desde ${pesos(p.montoMinimo)}` : ''}`;
  return `${v} ${a}`;
};
