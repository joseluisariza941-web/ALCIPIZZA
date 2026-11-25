import { useState } from 'react';
import Recibo from '../components/Recibo.jsx';
import { useCarga } from './hooks.js';
import { fd, money } from './util.js';
import { qsFacturas } from './reporte.js';

const VACIO = { total: 0, pagina: 1, porPagina: 20, paginas: 1, facturas: [] };

/** Historial de todas las tirillas, con buscador, fechas y paginado. @param {{ archivados?: string }} p */
export default function Facturas({ archivados = '' }) {
  const [q, setQ] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [pagina, setPagina] = useState(1);
  const [abierta, setAbierta] = useState(/** @type {any} */ (null));
  const r = useCarga(`/api/facturas?${qsFacturas({ q, desde, hasta, pagina }, archivados)}`, /** @type {any} */ (VACIO));
  const d = { ...VACIO, ...r.data };
  const filtro = set => e => { set(e.target.value); setPagina(1); };

  return (
    <div className="card scr" style={{ marginBottom: '1rem' }}>
      <h3>Facturas</h3>
      <input placeholder="🔎 Buscar por nombre, teléfono o número" aria-label="Buscar factura" value={q} onChange={filtro(setQ)} style={{ margin: '.6rem 0' }} />
      <div className="fg" style={{ margin: '.4rem 0' }}>
        <label style={{ margin: 0 }}>Desde<input type="date" value={desde} max={hasta || undefined} onChange={filtro(setDesde)} /></label>
        <label style={{ margin: 0 }}>Hasta<input type="date" value={hasta} min={desde || undefined} onChange={filtro(setHasta)} /></label>
      </div>
      <table>
        <thead><tr><th>#</th><th>Fecha y hora</th><th>Cliente</th><th>Teléfono</th><th>Pago</th><th>Total</th><th /></tr></thead>
        <tbody>
          {d.facturas.length ? d.facturas.map(o => (
            <tr key={o.id}>
              <td>#{o.id}</td><td>{fd(o.creadoEn)}</td><td>{o.cliente || o.destino}</td><td>{o.telefono || '—'}</td>
              <td>{o.estado === 'cancelado' ? 'Cancelado' : o.pagoEstado === 'pagado' ? '✅ ' + (o.metodoPago?.nombre || 'Pagado') : '⏳ Pendiente'}</td>
              <td>{money(o.total)}</td>
              <td><button className="btn s y" onClick={() => setAbierta(o)}>Ver factura</button></td>
            </tr>
          )) : <tr><td colSpan={7}>Sin facturas</td></tr>}
        </tbody>
      </table>
      <div className="row" style={{ marginTop: '.8rem', alignItems: 'center' }}>
        <button className="btn s y" disabled={d.pagina <= 1} onClick={() => setPagina(d.pagina - 1)}>Anterior</button>
        <span className="sm">Página {d.pagina} de {d.paginas} · {d.total} factura(s)</span>
        <button className="btn s y" disabled={d.pagina >= d.paginas} onClick={() => setPagina(d.pagina + 1)}>Siguiente</button>
      </div>
      {abierta && <Recibo pedido={abierta} onCerrar={() => setAbierta(null)} conWhatsApp />}
    </div>
  );
}
