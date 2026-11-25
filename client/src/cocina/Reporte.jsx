import { useState } from 'react';
import { useCarga } from './hooks.js';
import { fd, money, rangoSemana } from './util.js';
import { ARCHIVADOS, diasDelRango, estrellas, filtrarVentas, kpis, qsReporte } from './reporte.js';
import { HistorialCompras } from './Inventario.jsx';
import Facturas from './Facturas.jsx';

const VACIO = { total: 0, pedidos: 0, compras: 0, porPlato: [], porMetodo: [], porDia: [] };

/** Tarjeta de plato/bebida estrella (star original). */
function Estrella({ e, bebida, titulo }) {
  return (
    <div className="card star">
      <span className="bd">⭐ {titulo}</span>
      {!e
        ? <><div style={{ fontSize: '5rem', margin: '1rem 0' }}>{bebida ? '🥤' : '🍽️'}</div><h3>Aún sin ventas</h3></>
        : <>
          {e.imagenUrl
            ? <img className="pim" src={e.imagenUrl} alt={e.nombre} style={{ marginTop: '.8rem' }} />
            : <div style={{ fontSize: '6.5rem', margin: '.5rem 0' }}>{e.emoji}</div>}
          <h3>{e.nombre}</h3>
          <p className="sm">{e.cantidad} vendido(s) en el periodo</p>
        </>}
    </div>
  );
}

/** Historial de ventas con búsqueda (hv original). */
function HistorialVentas({ pedidos }) {
  const [q, setQ] = useState('');
  const l = filtrarVentas(pedidos, q);
  return (
    <div className="card scr" style={{ marginBottom: '1rem' }}>
      <h3>Historial de ventas</h3>
      <input placeholder="🔎 Buscar venta (plato, mesera, método, fecha…)" value={q} onChange={e => setQ(e.target.value)} style={{ margin: '.6rem 0' }} />
      <table>
        <thead><tr><th>#</th><th>Fecha y hora</th><th>Origen</th><th>Destino</th><th>Pago</th><th>Total</th><th /></tr></thead>
        <tbody>
          {l.length ? l.map(o => (
            <tr key={o.id}>
              <td>#{o.id}</td><td>{fd(o.creadoEn)}</td><td>{o.origen === 'web' ? 'Compra web' : 'Mesera ' + (o.mesera?.nombre || '')}</td>
              <td>{o.destino}</td><td>{o.metodoPago?.nombre || '—'}</td><td>{money(o.total)}</td><td>{o.pagoEstado === 'pagado' ? '✅' : '⏳'}</td>
            </tr>
          )) : <tr><td colSpan={7}>Sin ventas</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

/** Pestaña Reporte (kr original) con rango de fechas. */
export default function Reporte() {
  const semana = rangoSemana();
  const [r, setR] = useState(semana);
  const [arch, setArch] = useState('');
  const [vista, setVista] = useState('resumen');
  const qs = qsReporte(r, arch);
  const rep = useCarga(`/api/reportes/ventas?${qs}`, /** @type {any} */ (VACIO));
  const ped = useCarga(`/api/pedidos?${qs}`, /** @type {any[]} */ ([]));
  const com = useCarga(`/api/compras?${qs}`, /** @type {any[]} */ ([]));
  const pl = useCarga('/api/admin/platos', /** @type {any[]} */ ([]));
  const d = { ...VACIO, ...rep.data };
  const k = kpis(d, ped.data);
  const est = estrellas(d.porPlato, pl.data);
  const ds = diasDelRango(d.porDia, r.desde, r.hasta);
  const mx = Math.max(1, ...ds.map(x => x.v));
  const mxb = Math.max(1, k.vendido, k.invertido);
  const esSemana = r.desde === semana.desde && r.hasta === semana.hasta;
  const gan = <span className={k.ganancia >= 0 ? 'ok' : 'ko'}>{money(k.ganancia)}</span>;
  const K2 = [['Invertido', money(k.invertido)], ['Vendido', money(k.vendido)], ['Ganancia', gan], ['Margen', k.margen + '%'],
    ['Pedidos', k.pedidos], ['Ticket promedio', money(k.ticket)], ['Cobrado', money(k.cobrado)], ['Por cobrar', money(k.porCobrar)], ['Compras web', k.web]];
  const fecha = c => e => e.target.value && setR({ ...r, [c]: e.target.value });

  return (
    <>
      <h2>{esSemana ? 'Reporte de la semana' : 'Reporte del periodo'}</h2>
      <div className="row" style={{ marginBottom: '.6rem' }}>
        <button className={`btn s ${vista === 'resumen' ? 'y' : ''}`} onClick={() => setVista('resumen')}>Resumen</button>
        <button className={`btn s ${vista === 'facturas' ? 'y' : ''}`} onClick={() => setVista('facturas')}>Facturas</button>
      </div>
      <div className="fg" style={{ margin: '.6rem 0' }}>
        {vista === 'resumen' && <>
          <label style={{ margin: 0 }}>Desde<input type="date" value={r.desde} max={r.hasta} onChange={fecha('desde')} /></label>
          <label style={{ margin: 0 }}>Hasta<input type="date" value={r.hasta} min={r.desde} onChange={fecha('hasta')} /></label>
        </>}
        <label style={{ margin: 0 }}>Mostrar
          <select aria-label="Archivados" value={arch} onChange={e => setArch(e.target.value)}>
            {ARCHIVADOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
      </div>
      {vista === 'facturas' && <Facturas archivados={arch} />}
      {vista === 'resumen' && <>
      <div className="stars">
        <Estrella e={est.plato} bebida={false} titulo="Plato estrella" />
        <Estrella e={est.bebida} bebida titulo="Bebida estrella" />
      </div>
      <div className="grid" style={{ margin: '1rem 0', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))' }}>
        {K2.map(([l, v]) => <div key={l} className="card kpi"><p className="sm">{l}</p><h3 className="pr">{v}</h3></div>)}
      </div>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3>Inversión vs. ganancia</h3>
        <p className="sm" style={{ marginTop: '.8rem' }}>Invertido {money(k.invertido)}</p>
        <div className="bar" style={{ height: 22 }}><i style={{ width: `${(k.invertido / mxb) * 100}%`, background: '#c4161c' }} /></div>
        <p className="sm" style={{ marginTop: '.6rem' }}>Vendido {money(k.vendido)}</p>
        <div className="bar" style={{ height: 22 }}><i style={{ width: `${(k.vendido / mxb) * 100}%`, background: '#168a2e' }} /></div>
        <p style={{ marginTop: '.8rem' }}><b>Ganancia: {gan}</b> ({k.margen}% de lo vendido)</p>
      </div>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3>Ventas por día</h3>
        <div style={{ display: 'flex', gap: '.6rem', alignItems: 'flex-end', height: 160, marginTop: '1rem', overflowX: 'auto' }}>
          {ds.map(x => (
            <div key={x.fecha} style={{ flex: 1, textAlign: 'center' }}>
              <small>{x.v ? money(x.v) : ''}</small>
              <div style={{ height: (x.v / mx) * 110, minHeight: 4, background: 'var(--a)', border: '2px solid var(--ln)', borderRadius: '8px 8px 0 0' }} />
              <small>{x.l}</small>
            </div>
          ))}
        </div>
      </div>
      <div className="card scr" style={{ marginBottom: '1rem' }}>
        <h3>Ventas por plato</h3>
        <table>
          <thead><tr><th>Plato</th><th>Cantidad</th><th>Total</th></tr></thead>
          <tbody>
            {d.porPlato.length
              ? d.porPlato.map(p => <tr key={p.nombre}><td>{p.nombre}</td><td>{p.cantidad}</td><td>{money(p.total)}</td></tr>)
              : <tr><td colSpan={3}>Sin ventas</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="card scr" style={{ marginBottom: '1rem' }}>
        <h3>Ventas por método de pago</h3>
        <table>
          <thead><tr><th>Método</th><th>Total</th></tr></thead>
          <tbody>
            {d.porMetodo.length
              ? d.porMetodo.map(m => <tr key={m.metodo}><td>{m.metodo}</td><td>{money(m.total)}</td></tr>)
              : <tr><td colSpan={2}>Sin ventas</td></tr>}
          </tbody>
        </table>
      </div>
      <HistorialVentas pedidos={ped.data} />
      <div className="card scr">
        <h3>Historial de compra de insumos</h3>
        <HistorialCompras compras={com.data} />
      </div>
    </>}
    </>
  );
}
