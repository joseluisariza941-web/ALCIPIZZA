import { useState } from 'react';
import { api } from '../api.js';
import { UNIDADES } from './util.js';
import { idsExtras, platoABody, validarExtra } from './platos.js';
import { toast, toastError } from './toast.js';

const nombreInsumo = (x, insumos) => insumos.find(i => i.id === x.insumoId)?.nombre ?? x.insumo?.nombre ?? '';
const aForm = (x, insumos) => ({ nombre: x.nombre, insumo: nombreInsumo(x, insumos), cantidad: String(x.cantidad), unidad: x.unidad,
  precio: String(x.precio), grupo: x.grupo || '' });

/** Una fila editable de extra (xe original): guarda al salir del campo. */
function FilaExtra({ x, insumos, platos, onCambio, onPlato }) {
  const inicial = aForm(x, insumos);
  const [f, setF] = useState(inicial);
  const set = k => e => setF({ ...f, [k]: e.target.value });

  async function guardar(nf = f) {
    if (JSON.stringify(nf) === JSON.stringify(inicial)) return;
    const r = validarExtra(nf, insumos);
    if ('error' in r) { setF(inicial); return toast(r.error); }
    try { await api.put(`/api/admin/extras/${x.id}`, r.body); toast('Guardado'); } catch (e) { toastError(e); setF(inicial); }
    onCambio();
  }
  async function borrar() {
    if (!confirm('¿Eliminar este extra?')) return;
    try { await api.del(`/api/admin/extras/${x.id}`); } catch (e) { toastError(e); }
    onCambio();
  }

  return (
    <>
      <tr>
        <td><input value={f.nombre} aria-label="Nombre" onChange={set('nombre')} onBlur={() => guardar()} /></td>
        <td><input list="il2" value={f.insumo} aria-label="Insumo" onChange={set('insumo')} onBlur={() => guardar()} /></td>
        <td><input type="number" step="any" value={f.cantidad} style={{ width: '6rem' }} aria-label="Cantidad" onChange={set('cantidad')} onBlur={() => guardar()} /></td>
        <td>
          <select aria-label="Unidad" value={f.unidad} onChange={e => { const nf = { ...f, unidad: e.target.value }; setF(nf); guardar(nf); }}>
            {UNIDADES.map(u => <option key={u}>{u}</option>)}
          </select>
        </td>
        <td><input type="number" value={f.precio} style={{ width: '7rem' }} aria-label="Precio" onChange={set('precio')} onBlur={() => guardar()} /></td>
        <td><input value={f.grupo} placeholder="(opcional)" style={{ width: '7rem' }} aria-label="Grupo" onChange={set('grupo')} onBlur={() => guardar()} /></td>
        <td><button className="btn s" aria-label="Eliminar" onClick={borrar}>✕</button></td>
      </tr>
      <tr>
        <td colSpan={7}>
          <small><b>Se ofrece en:</b></small>{' '}
          <button className="btn s y" onClick={() => onPlato(x.id, platos, true)}>Todos</button>{' '}
          <button className="btn s y" onClick={() => onPlato(x.id, platos, false)}>Ninguno</button>
          <div className="row" style={{ marginTop: '.4rem' }}>
            {platos.map(p => {
              const on = idsExtras(p).includes(x.id);
              return <button key={p.id} className={`chip px${on ? ' on' : ''}`} aria-pressed={on} onClick={() => onPlato(x.id, [p], !on)}>{p.emoji} {p.nombre}</button>;
            })}
          </div>
        </td>
      </tr>
    </>
  );
}

const NUEVO = { nombre: '', insumo: '', cantidad: '', unidad: 'g', precio: '', grupo: '' };

/**
 * Sub-pestaña Extras (kx original).
 * @param {{ extras: any[], platos: any[], insumos: any[], recargar: () => void }} p
 */
export default function Extras({ extras, platos, insumos, recargar }) {
  const [f, setF] = useState(NUEVO);
  const [sel, setSel] = useState(/** @type {number[]} */ ([]));
  const set = k => e => setF({ ...f, [k]: e.target.value });

  /** Activa o quita un extra en varios platos (xp / xall originales). */
  async function onPlato(xid, lista, on) {
    try {
      for (const p of lista) {
        const ids = idsExtras(p).filter(z => z !== xid);
        if (on) ids.push(xid);
        if (JSON.stringify(ids) !== JSON.stringify(idsExtras(p))) await api.put(`/api/admin/platos/${p.id}`, platoABody(p, ids));
      }
    } catch (e) { toastError(e); }
    recargar();
  }

  async function agregar() {
    const r = validarExtra(f, insumos);
    if ('error' in r) return toast(r.error);
    try {
      const x = await api.post('/api/admin/extras', r.body);
      if (sel.length && x?.id != null) await onPlato(x.id, platos.filter(p => sel.includes(p.id)), true);
      setF(NUEVO); setSel([]);
    } catch (e) { toastError(e); }
    recargar();
  }

  return (
    <>
      <h2>Extras</h2>
      <p className="sm" style={{ margin: '.5rem 0 1rem' }}>Adicionales con costo (papas, queso, carne…). En cada plato eliges cuáles se ofrecen. Cada extra descuenta su insumo del inventario.</p>
      <datalist id="il2">{insumos.map(k => <option key={k.id}>{k.nombre}</option>)}</datalist>
      <div className="card scr">
        <table>
          <tbody>
            <tr><th>Extra</th><th>Insumo que descuenta</th><th>Cantidad</th><th>Unidad</th><th>Precio</th><th>Grupo</th><th></th></tr>
            {extras.length
              ? extras.map(x => <FilaExtra key={`${x.id}-${x.nombre}-${x.precio}-${x.cantidad}-${x.unidad}-${x.grupo}-${x.insumoId}`} x={x} insumos={insumos} platos={platos} onCambio={recargar} onPlato={onPlato} />)
              : <tr><td colSpan={7}>Aún no hay extras</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="card" style={{ marginTop: '1rem' }}>
        <h3>Nuevo extra</h3>
        <label>¿En qué platos se ofrece?</label>
        <div className="row" id="xnp" style={{ marginBottom: '.6rem' }}>
          {platos.map(p => {
            const on = sel.includes(p.id);
            return <button key={p.id} className={`chip px${on ? ' on' : ''}`} aria-pressed={on}
              onClick={() => setSel(on ? sel.filter(z => z !== p.id) : [...sel, p.id])}>{p.emoji} {p.nombre}</button>;
          })}
        </div>
        <div className="fg">
          <input placeholder="Nombre (ej: Queso extra)" value={f.nombre} onChange={set('nombre')} />
          <input list="il2" placeholder="Insumo que descuenta" value={f.insumo} onChange={set('insumo')} />
          <input type="number" step="any" placeholder="Cantidad" value={f.cantidad} onChange={set('cantidad')} />
          <select aria-label="Unidad" value={f.unidad} onChange={set('unidad')}>{UNIDADES.map(u => <option key={u}>{u}</option>)}</select>
          <input type="number" placeholder="Precio" value={f.precio} onChange={set('precio')} />
          <input placeholder="Grupo (opcional)" value={f.grupo} onChange={set('grupo')} />
          <button className="btn" onClick={agregar}>Agregar extra</button>
        </div>
        <p className="sm" style={{ marginTop: '.5rem' }}>Grupo: los extras del mismo grupo (por ejemplo “papas”) son excluyentes, se elige solo uno.</p>
      </div>
    </>
  );
}
