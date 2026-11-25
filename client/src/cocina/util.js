// Lógica pura del panel de cocina (portada de app.js original).

/** @param {number} n @returns {string} Pesos como en el original: $28.000 */
export const money = n => '$' + Math.round(Number(n) || 0).toLocaleString('es-CO');

const F = { g: 1, kg: 1000, lb: 453.592, und: 1 };
/** Convierte una cantidad entre unidades (g↔kg↔lb); `und` no se convierte. */
export const cv = (q, a, b) => (a === b || a === 'und' || b === 'und' ? q : (q * F[a]) / F[b]);

/** @param {{stock:number, stockReferencia:number}} x @returns {number} fracción 0..n del stock de referencia */
export const nivel = x => (Number(x.stockReferencia) > 0 ? Number(x.stock) / Number(x.stockReferencia) : 0);
/** Stock bajo: menos del 20 % de la referencia (⚠️ en el original). */
export const stockBajo = x => nivel(x) < 0.2;
export const fmtStock = s => +(+s).toFixed(2);

export const DN = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
/** La API guarda horarios de lunes (0) a domingo (6). */
export const diaApi = i => DN[(i + 1) % 7];

export const isBebida = c => /^bebidas?$/i.test(String(c || '').trim());

const SIG = { nuevo: 'preparando', preparando: 'listo', listo: 'entregado' };
/** @param {string} e @returns {string|null} */
export const siguienteEstado = e => SIG[e] || null;
const BOT = { nuevo: 'Preparar', preparando: 'Finalizar y avisar', listo: 'Entregado' };
export const botonEstado = e => BOT[e] || '';

/** Pedidos en estado `nuevo` que no estaban en `conocidos`. */
export const pedidosNuevos = (conocidos, lista) => lista.filter(p => p.estado === 'nuevo' && !conocidos.has(p.id));

export const fd = t => new Date(t).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
export const hora = t => new Date(t).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

/** Enlace de WhatsApp con el ticket del pedido (waLink original). */
export function waLink(o, cfg) {
  const mp = o.metodoPago?.nombre || '';
  const t = [
    `*${cfg.n}* · Pedido #${o.id}`,
    fd(o.creadoEn),
    `${o.destino}${o.cliente ? ' · ' + o.cliente : ''}${o.telefono ? ' · Tel ' + o.telefono : ''}${o.direccion ? ' · ' + o.direccion : ''}`,
    '',
    ...o.items.map(c => `• ${c.nombre} (${c.variante}) ${money(itemTotal(c))}${c.sin?.length ? ' · sin ' + c.sin.join(', ') : ''}${c.salsas?.length ? ' · salsas: ' + c.salsas.join(', ') : ''}${c.extras?.length ? ' · + ' + c.extras.map(e => e.nombre).join(', ') : ''}${c.nota ? ' · "' + c.nota + '"' : ''}`),
    '',
    `*TOTAL ${money(o.total)}*`,
    o.pagoEstado === 'pagado' ? 'Pagado con ' + mp : 'Pago pendiente' + (mp ? ' (' + mp + ')' : ''),
    o.mesera ? 'Mesera: ' + o.mesera.nombre : 'Compra web',
  ];
  return `https://wa.me/57${cfg.tel}?text=${encodeURIComponent(t.join('\n'))}`;
}

/** Precio del ítem: unitario (ya incluye extras según la API). */
const itemTotal = c => c.precioUnitario;

const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** Últimos 7 días (hoy incluido) como fechas AAAA-MM-DD. */
export function rangoSemana(hoy = new Date()) {
  const d = new Date(hoy); d.setDate(d.getDate() - 6);
  return { desde: iso(d), hasta: iso(hoy) };
}
export { iso as fechaIso };
