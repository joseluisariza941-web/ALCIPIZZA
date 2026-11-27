import { useState } from 'react';
import { api } from '../api.js';
import Modal from '../components/Modal.jsx';
import { useCarga } from './hooks.js';
import { DIAS, aForm, errorPromo, promoBody, promoVacia, resumenPromo } from './promociones.js';
import { aviso, exito, toastError } from './toast.js';

/** Formulario de una promoción (nueva o existente). */
function Formulario({ promo, platos, categorias, onCerrar, onGuardado }) {
  const [f, setF] = useState(() => (promo ? aForm(promo) : promoVacia()));
  const campo = (k, v) => setF({ ...f, [k]: v });
  const error = errorPromo(f);
  const alternar = i => campo('dias', f.dias.includes(i) ? f.dias.filter(x => x !== i) : [...f.dias, i]);

  async function guardar() {
    if (error) return aviso(error);
    try {
      if (promo) await api.put(`/api/promociones/${promo.id}`, promoBody(f));
      else await api.post('/api/promociones', promoBody(f));
      exito('✅ Promoción guardada');
      onGuardado();
    } catch (e) { toastError(e); }
  }

  return (
    <Modal>
      <div className="card scr" role="dialog" aria-label={promo ? 'Editar promoción' : 'Nueva promoción'}>
        <h3>{promo ? 'Editar promoción' : 'Nueva promoción'}</h3>
        <label>Nombre<input value={f.nombre} maxLength={80} onChange={e => campo('nombre', e.target.value)} /></label>
        <div className="fg">
          <label>Tipo
            <select value={f.tipo} onChange={e => campo('tipo', e.target.value)}>
              <option value="porcentaje">Porcentaje (%)</option><option value="monto">Monto en pesos ($)</option>
            </select>
          </label>
          <label>{f.tipo === 'porcentaje' ? 'Porcentaje' : 'Monto'}<input type="number" min={0} value={f.valor} onChange={e => campo('valor', e.target.value)} /></label>
        </div>
        <label>Aplica a
          <select value={f.alcance} onChange={e => campo('alcance', e.target.value)}>
            <option value="total">El total del pedido</option><option value="plato">Un plato</option><option value="categoria">Una categoría</option>
          </select>
        </label>
        {f.alcance === 'plato' && (
          <label>Plato
            <select value={f.platoId} onChange={e => campo('platoId', e.target.value)}>
              <option value="">Elige un plato</option>
              {platos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </label>
        )}
        {f.alcance === 'categoria' && (
          <label>Categoría
            <select value={f.categoria} onChange={e => campo('categoria', e.target.value)}>
              <option value="">Elige una categoría</option>
              {categorias.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        )}
        {f.alcance === 'total' && (
          <label>Monto mínimo del pedido ($)<input type="number" min={0} value={f.montoMinimo} onChange={e => campo('montoMinimo', e.target.value)} /></label>
        )}
        <div className="fg">
          <label>Fecha de inicio<input type="date" value={f.inicio} onChange={e => campo('inicio', e.target.value)} /></label>
          <label>Fecha de fin<input type="date" value={f.fin} onChange={e => campo('fin', e.target.value)} /></label>
        </div>
        <p className="sm" style={{ marginTop: '.6rem' }}>Días de la semana (sin marcar ninguno vale todos los días)</p>
        <div className="row">
          {DIAS.map((d, i) => (
            <label key={d} style={{ margin: 0 }}>
              <input type="checkbox" style={{ width: 'auto' }} checked={f.dias.includes(i)} onChange={() => alternar(i)} /> {d.slice(0, 3)}
            </label>
          ))}
        </div>
        <div className="fg">
          <label>Hora desde<input type="time" value={f.horaDesde} onChange={e => campo('horaDesde', e.target.value)} /></label>
          <label>Hora hasta<input type="time" value={f.horaHasta} onChange={e => campo('horaHasta', e.target.value)} /></label>
        </div>
        <label style={{ margin: '.6rem 0' }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={f.activa} onChange={e => campo('activa', e.target.checked)} /> Activa
        </label>
        {error && <p className="sm">{error}</p>}
        <div className="row">
          <button className="btn s y" onClick={onCerrar}>Cancelar</button>
          <button className="btn s" onClick={guardar}>Guardar</button>
        </div>
      </div>
    </Modal>
  );
}

const fechas = p => `${p.inicio} al ${p.fin}`;
const cuando = p => [p.dias ? p.dias.map(i => DIAS[i].slice(0, 3)).join(', ') : 'Todos los días', p.horaDesde ? `${p.horaDesde} a ${p.horaHasta}` : ''].filter(Boolean).join(' · ');

/** Pestaña Promociones: lista, formulario, eliminar y restaurar. */
export default function Promociones() {
  const [elim, setElim] = useState(false);
  const [editando, setEditando] = useState(/** @type {undefined|null|any} */ (undefined));
  const r = useCarga(elim ? '/api/promociones?eliminados=1' : '/api/promociones', /** @type {any[]} */ ([]));
  const pl = useCarga('/api/admin/platos', /** @type {any[]} */ ([]));
  const categorias = [...new Set(pl.data.map(p => p.categoria).filter(Boolean))];

  async function eliminar(p) {
    if (!confirm(`¿Eliminar la promoción ${p.nombre}?`)) return;
    try { await api.del(`/api/promociones/${p.id}`); exito('Promoción eliminada'); } catch (e) { toastError(e); }
    r.recargar();
  }
  async function restaurar(p) {
    try { await api.post(`/api/promociones/${p.id}/restaurar`, {}); exito('Promoción restaurada'); } catch (e) { toastError(e); }
    r.recargar();
  }

  return (
    <>
      <h2>Promociones</h2>
      <label style={{ margin: '.6rem 0' }}>
        <input type="checkbox" style={{ width: 'auto' }} checked={elim} onChange={e => setElim(e.target.checked)} /> Ver eliminadas
      </label>
      <div className="card scr" style={{ margin: '1rem 0' }}>
        <table>
          <tbody>
            {r.data.length ? r.data.map(p => (
              <tr key={p.id}>
                <td>
                  <b>{p.nombre}</b> {!elim && <span className="bd">{p.activa ? 'Activa' : 'Inactiva'}</span>}
                  <div className="sm">{resumenPromo(p)}</div>
                  <div className="sm">{fechas(p)} · {cuando(p)}</div>
                </td>
                <td>
                  {elim
                    ? <button className="btn s y" onClick={() => restaurar(p)}>Restaurar</button>
                    : <><button className="btn s y" onClick={() => setEditando(p)}>Editar</button>{' '}
                      <button className="btn s" onClick={() => eliminar(p)}>Eliminar</button></>}
                </td>
              </tr>
            )) : <tr><td>{elim ? 'No hay promociones eliminadas' : 'Aún no hay promociones'}</td></tr>}
          </tbody>
        </table>
      </div>
      {!elim && <button className="btn" onClick={() => setEditando(null)}>+ Nueva promoción</button>}
      {editando !== undefined && (
        <Formulario promo={editando} platos={pl.data} categorias={categorias}
          onCerrar={() => setEditando(undefined)} onGuardado={() => { setEditando(undefined); r.recargar(); }} />
      )}
    </>
  );
}
