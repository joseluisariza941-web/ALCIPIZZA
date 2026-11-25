import { useState } from 'react';
import { api } from '../api.js';
import { useCarga } from './hooks.js';
import { isBebida, money } from './util.js';
import { pillIngrediente } from './platos.js';
import { toastError } from './toast.js';
import PlatoModal from './PlatoModal.jsx';
import Extras from './Extras.jsx';

/** Lista de platos y bebidas (kc0 original). */
function Platos({ platos, onEditar, onBorrar }) {
  return (
    <>
      <h2>Comidas</h2>
      <div className="card scr" style={{ margin: '1rem 0' }}>
        <table>
          <tbody>
            {platos.map(p => (
              <tr key={p.id}>
                <td>
                  {p.imagenUrl ? <img className="pim2" style={{ width: 44, height: 44, verticalAlign: 'middle' }} src={p.imagenUrl} alt="" /> : p.emoji}{' '}
                  <b>{p.nombre}</b> <span className="bd">{p.categoria}</span>
                  {p.activo === false && <> <span className="bd">Inactivo</span></>}
                  <div className="pills">{(p.variantes ?? []).map(v => <span key={v.id ?? v.nombre} className="pl">{v.nombre} {money(v.precio)}</span>)}</div>
                  {isBebida(p.categoria)
                    ? (p.ingredientes?.[0] && <div className="pills"><span className="pl ig2">📦 {p.ingredientes[0].nombre}</span></div>)
                    : <>
                      <div className="pills">{(p.ingredientes ?? []).map(g => <span key={g.insumoId ?? g.nombre} className="pl ig2">{pillIngrediente(g)}</span>)}</div>
                      <div className="pills">{(p.salsas ?? []).map(k => <span key={k} className="pl">🥫 {k}</span>)}</div>
                    </>}
                </td>
                <td>
                  <button className="btn s y" onClick={() => onEditar(p)}>Editar</button>{' '}
                  <button className="btn s" onClick={() => onBorrar(p)}>Eliminar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="btn" onClick={() => onEditar(null)}>+ Nuevo plato</button>
    </>
  );
}

/** Pestaña Comidas: platos y bebidas, y extras. */
export default function Comidas() {
  const [ct, setCt] = useState('p');
  const [editando, setEditando] = useState(/** @type {undefined|null|any} */ (undefined));
  const pl = useCarga('/api/admin/platos', /** @type {any[]} */ ([]));
  const ex = useCarga('/api/admin/extras', /** @type {any[]} */ ([]));
  const ins = useCarga('/api/insumos', /** @type {any[]} */ ([]));
  const recargar = () => { pl.recargar(); ex.recargar(); };

  async function borrar(p) {
    if (!confirm('¿Eliminar este plato?')) return;
    try { await api.del(`/api/admin/platos/${p.id}`); } catch (e) { toastError(e); }
    pl.recargar();
  }

  return (
    <>
      <div className="row" style={{ marginBottom: '1rem' }}>
        <button className={`btn s ${ct === 'p' ? 'y' : ''}`} onClick={() => setCt('p')}>Platos y bebidas</button>
        <button className={`btn s ${ct === 'x' ? 'y' : ''}`} onClick={() => setCt('x')}>Extras</button>
      </div>
      {ct === 'x'
        ? <Extras extras={ex.data} platos={pl.data} insumos={ins.data} recargar={recargar} />
        : <Platos platos={pl.data} onEditar={setEditando} onBorrar={borrar} />}
      {editando !== undefined && (
        <PlatoModal plato={editando} platos={pl.data} extras={ex.data} insumos={ins.data}
          onCerrar={() => setEditando(undefined)} onGuardado={() => { setEditando(undefined); pl.recargar(); }} />
      )}
    </>
  );
}
