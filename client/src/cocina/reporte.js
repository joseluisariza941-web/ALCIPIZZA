// Lógica pura de la pestaña Reporte (kr original).
import { DN, fd, isBebida } from './util.js';

const activos = pedidos => pedidos.filter(o => o.estado !== 'cancelado');

/**
 * Indicadores del periodo. Vendido/pedidos/invertido vienen del reporte; cobrado, por cobrar y web de los pedidos.
 * @param {{total:number, pedidos:number, compras:number}} rep
 * @param {any[]} pedidos
 */
export function kpis(rep, pedidos) {
  const ok = activos(pedidos);
  const vendido = Number(rep.total) || 0, invertido = Number(rep.compras) || 0, n = Number(rep.pedidos) || 0;
  const ganancia = vendido - invertido;
  const cobrado = ok.filter(o => o.pagoEstado === 'pagado').reduce((a, o) => a + (Number(o.total) || 0), 0);
  return { invertido, vendido, ganancia, margen: vendido ? Math.round((ganancia / vendido) * 100) : 0, pedidos: n,
    ticket: n ? vendido / n : 0, cobrado, porCobrar: vendido - cobrado, web: ok.filter(o => o.origen === 'web').length };
}

/**
 * Plato y bebida más vendidos (star original).
 * @param {{nombre:string, cantidad:number}[]} porPlato
 * @param {any[]} platos
 */
export function estrellas(porPlato, platos) {
  const una = bebida => {
    const r = porPlato.filter(x => isBebida(platos.find(p => p.nombre === x.nombre)?.categoria) === bebida)
      .sort((a, b) => b.cantidad - a.cantidad)[0];
    if (!r) return null;
    const p = platos.find(x => x.nombre === r.nombre);
    return { ...r, emoji: p?.emoji || '🍽️', imagenUrl: p?.imagenUrl || '' };
  };
  return { plato: una(false), bebida: una(true) };
}

const local = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Un registro por día del rango con su total (0 si no hubo ventas).
 * @param {{fecha:string, total:number}[]} porDia
 * @param {string} desde AAAA-MM-DD
 * @param {string} hasta AAAA-MM-DD
 */
export function diasDelRango(porDia, desde, hasta) {
  const r = [];
  for (let d = local(desde), fin = local(hasta); d <= fin && r.length < 366; d.setDate(d.getDate() + 1)) {
    const f = iso(d);
    r.push({ fecha: f, l: DN[d.getDay()].slice(0, 3), v: porDia.filter(x => String(x.fecha).slice(0, 10) === f).reduce((a, x) => a + (Number(x.total) || 0), 0) });
  }
  return r;
}

/**
 * Ventas (no canceladas) que coinciden con la búsqueda.
 * @param {any[]} pedidos
 * @param {string} q
 */
export function filtrarVentas(pedidos, q) {
  const b = (q || '').toLowerCase();
  return activos(pedidos).filter(o => `#${o.id} ${o.destino} ${o.cliente || ''} ${o.metodoPago?.nombre || ''} ${o.origen} ${o.mesera?.nombre || ''} ${fd(o.creadoEn)} ${o.items.map(c => c.nombre).join(' ')}`
    .toLowerCase().includes(b));
}

/** Opciones del filtro de archivados: valor de `archivados` ('' = periodo actual) y etiqueta. */
export const ARCHIVADOS = [['', 'Periodo actual'], ['incluir', 'Todo el histórico'], ['solo', 'Solo archivado']];

/**
 * Query string de los reportes.
 * @param {{desde?:string, hasta?:string}} r
 * @param {string} [arch] '', 'incluir' o 'solo'
 */
export function qsReporte(r, arch = '') {
  const p = new URLSearchParams();
  if (r.desde) p.set('desde', r.desde);
  if (r.hasta) p.set('hasta', r.hasta);
  if (arch) p.set('archivados', arch);
  return p.toString();
}

/** Query string de /api/facturas. @param {{q?:string, desde?:string, hasta?:string, pagina?:number, porPagina?:number}} f @param {string} [arch] */
export function qsFacturas({ q = '', desde = '', hasta = '', pagina = 1, porPagina = 20 }, arch = '') {
  const p = new URLSearchParams({ pagina: String(pagina), porPagina: String(porPagina) });
  if (q.trim()) p.set('q', q.trim());
  if (desde) p.set('desde', desde);
  if (hasta) p.set('hasta', hasta);
  if (arch) p.set('archivados', arch);
  return p.toString();
}
