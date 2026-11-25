import { useState } from 'react';
import Modal from '../components/Modal.jsx';
import { useCarga } from './hooks.js';
import { fd } from './util.js';
import { TIPOS_MOV, puntosTxt } from './puntos.js';

/** Movimientos de puntos de un cliente. */
function Movimientos({ celular, onCerrar }) {
  const r = useCarga(`/api/puntos/clientes/${celular}/movimientos`, /** @type {any} */ (null));
  const d = r.data;
  return (
    <Modal>
      <div className="card scr" role="dialog" aria-label="Movimientos de puntos">
        <h3>{d?.nombre || celular}</h3>
        {d && <p className="sm">Celular {d.celular} · Saldo: <b>{d.saldo}</b> puntos</p>}
        <table>
          <thead><tr><th>Fecha</th><th>Tipo</th><th>Pedido</th><th>Puntos</th></tr></thead>
          <tbody>
            {d?.movimientos?.length ? d.movimientos.map(m => (
              <tr key={m.id}><td>{fd(m.creadoEn)}</td><td>{TIPOS_MOV[m.tipo] || m.tipo}</td><td>{m.pedidoId ? '#' + m.pedidoId : '—'}</td><td>{puntosTxt(m.puntos)}</td></tr>
            )) : <tr><td colSpan={4}>{r.cargando ? 'Cargando…' : 'Sin movimientos'}</td></tr>}
          </tbody>
        </table>
        <button className="btn s y" style={{ marginTop: '.8rem' }} onClick={onCerrar}>Cerrar</button>
      </div>
    </Modal>
  );
}

/** Pestaña Clientes: saldo de puntos por celular o nombre. */
export default function Clientes() {
  const [q, setQ] = useState('');
  const [abierto, setAbierto] = useState(/** @type {string|null} */ (null));
  const r = useCarga(`/api/puntos/clientes?q=${encodeURIComponent(q.trim())}`, /** @type {any[]} */ ([]));
  return (
    <>
      <h2>Clientes</h2>
      <div className="card scr" style={{ margin: '1rem 0' }}>
        <input placeholder="🔎 Buscar por celular o nombre" aria-label="Buscar cliente" value={q} onChange={e => setQ(e.target.value)} style={{ margin: '.6rem 0' }} />
        <table>
          <thead><tr><th>Cliente</th><th>Celular</th><th>Saldo</th><th /></tr></thead>
          <tbody>
            {r.data.length ? r.data.map(c => (
              <tr key={c.celular}>
                <td>{c.nombre || '—'}</td><td>{c.celular}</td><td><b>{c.saldo}</b> pts</td>
                <td><button className="btn s y" onClick={() => setAbierto(c.celular)}>Ver movimientos</button></td>
              </tr>
            )) : <tr><td colSpan={4}>Sin clientes</td></tr>}
          </tbody>
        </table>
      </div>
      {abierto && <Movimientos celular={abierto} onCerrar={() => setAbierto(null)} />}
    </>
  );
}
