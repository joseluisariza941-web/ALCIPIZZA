// Enlace de WhatsApp con el texto del pedido (waLink original, adaptado al Pedido de la API).
import { fechaCorta, pesos, precioItem } from './formato.js';

/**
 * @param {any} o Pedido de la API
 * @param {{ n:string, tel:string }} cfg
 * @returns {string}
 */
export function waLink(o, cfg) {
  const mp = o.metodoPago?.nombre || '';
  const t = [
    `*${cfg.n}* · Pedido #${o.id}`,
    fechaCorta(o.creadoEn),
    `${o.destino}${o.cliente ? ' · ' + o.cliente : ''}${o.telefono ? ' · Tel ' + o.telefono : ''}${o.direccion ? ' · ' + o.direccion : ''}`,
    '',
    ...o.items.map(c => `• ${c.nombre} (${c.variante}) ${pesos(precioItem(c))}`
      + (c.sin?.length ? ' · sin ' + c.sin.join(', ') : '')
      + (c.salsas?.length ? ' · salsas: ' + c.salsas.join(', ') : '')
      + (c.extras?.length ? ' · + ' + c.extras.map(e => e.nombre).join(', ') : '')
      + (c.nota ? ' · "' + c.nota + '"' : '')),
    '',
    `*TOTAL ${pesos(o.total)}*`,
    o.pagoEstado === 'pagado' ? 'Pagado con ' + mp : 'Pago pendiente' + (mp ? ' (' + mp + ')' : ''),
    o.mesera ? 'Mesera: ' + o.mesera.nombre : 'Compra web',
  ];
  return `https://wa.me/57${cfg.tel}?text=${encodeURIComponent(t.join('\n'))}`;
}
