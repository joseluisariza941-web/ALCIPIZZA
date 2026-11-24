// Ticket por WhatsApp, igual que waLink() original.
import { fechaHora, pesos } from './formato.js';

/** @param {any} o Pedido de la API @param {{n:string, tel:string}} cfg */
export function textoWhatsApp(o, cfg) {
  const linea = c => `• ${c.nombre} (${c.variante}) ${pesos(c.precioUnitario)}`
    + (c.sin?.length ? ' · sin ' + c.sin.join(', ') : '')
    + (c.salsas?.length ? ' · salsas: ' + c.salsas.join(', ') : '')
    + (c.extras?.length ? ' · + ' + c.extras.map(e => e.nombre).join(', ') : '')
    + (c.nota ? ' · "' + c.nota + '"' : '');
  const mp = o.metodoPago?.nombre;
  return [
    `*${cfg.n}* · Pedido #${o.id}`,
    fechaHora(o.creadoEn),
    `${o.destino}${o.cliente ? ' · ' + o.cliente : ''}${o.telefono ? ' · Tel ' + o.telefono : ''}${o.direccion ? ' · ' + o.direccion : ''}`,
    '',
    ...o.items.map(linea),
    '',
    `*TOTAL ${pesos(o.total)}*`,
    o.pagoEstado === 'pagado' ? 'Pagado con ' + mp : 'Pago pendiente' + (mp ? ' (' + mp + ')' : ''),
    o.mesera ? 'Mesera: ' + o.mesera.nombre : 'Compra web',
  ].join('\n');
}

/** @param {any} o @param {{n:string, tel:string}} cfg */
export const waLink = (o, cfg) => `https://wa.me/57${cfg.tel}?text=${encodeURIComponent(textoWhatsApp(o, cfg))}`;
