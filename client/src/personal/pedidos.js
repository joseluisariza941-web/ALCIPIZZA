// Lógica pura del historial de la mesera (hist() y detect() de la app original).

/** ¿El pedido le interesa a esta mesera? (suyo o compra web) */
const meToca = (o, meseraId) => o.mesera?.id === meseraId || o.origen === 'web';

/**
 * @param {any[]} pedidos Pedido[] (más recientes primero)
 * @param {number} meseraId
 */
export function historial(pedidos, meseraId) {
  return {
    listos: pedidos.filter(o => o.estado === 'listo' && meToca(o, meseraId)),
    web: pedidos.filter(o => o.origen === 'web' && o.estado !== 'cancelado'),
    mios: pedidos.filter(o => o.mesera?.id === meseraId),
  };
}

/**
 * Avisos de pedidos que pasaron a "listo" entre dos consultas.
 * @param {any[]} antes @param {any[]} ahora @param {number} meseraId @returns {string[]}
 */
export function avisosListos(antes, ahora, meseraId) {
  return ahora
    .filter(o => {
      const y = antes.find(z => z.id === o.id);
      return meToca(o, meseraId) && o.estado === 'listo' && y && y.estado !== 'listo';
    })
    .map(o => '✅ Pedido #' + o.id + ' listo para ' + o.destino + (o.origen === 'web' ? ' · COMPRA WEB, cobrar' : ''));
}
