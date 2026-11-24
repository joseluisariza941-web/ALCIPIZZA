import { useState } from 'react';
import { api } from '../api.js';
import { useCarga } from './hooks.js';
import { fd, fmtStock, money, nivel, stockBajo, UNIDADES } from './util.js';
import { filtrarCompras, nombreSurtidor, surtidorCompra, totalInvertido, ultimaCompra, validarCompra } from './inventario.js';
import { toast, toastError } from './toast.js';

const VACIO = { nombre: '', tipo: 'insumo', cantidad: '', unidad: 'und', costo: '', surtidor: 'tienda' };

/** Historial de compras con buscador (hc original). Se reutiliza en Reporte. */
export function HistorialCompras({ compras }) {
  const [q, setQ] = useState('');
  const l = filtrarCompras(compras, q);
  return (
    <>
      <input placeholder="🔎 Buscar compra" value={q} onChange={e => setQ(e.target.value)} style={{ margin: '.6rem 0' }} />
      <table>
        <tbody>
          <tr><th>Fecha y hora</th><th>Insumo</th><th>Cantidad</th><th>Costo</th><th>Surtidor</th><th>Registró</th></tr>
          {l.length ? l.map(c => (
            <tr key={c.id}><td>{fd(c.fecha)}</td><td>{c.insumo?.nombre}</td><td>{c.cantidad} {c.unidad}</td><td>{money(c.costo)}</td>
              <td>{surtidorCompra(c)}</td><td>{c.registradoPor?.nombre || ''}</td></tr>
          )) : <tr><td colSpan={6}>Sin compras registradas</td></tr>}
        </tbody>
      </table>
    </>
  );
}

/** Tabla de insumos o salsas (it original). */
function TablaInsumos({ lista, compras, surtidores, onCantidad, onBorrar }) {
  return (
    <table>
      <tbody>
        <tr><th>Producto</th><th>Ingresó</th><th>Cantidad</th><th>Surtidor</th><th>Costo</th><th>Registró</th><th>Nivel</th><th></th></tr>
        {lista.length ? lista.map(x => {
          const u = ultimaCompra(compras, x.id), r = nivel(x);
          return (
            <tr key={x.id}>
              <td><b>{x.nombre}</b></td>
              <td>{u ? fd(u.fecha) : '—'}</td>
              <td>
                <input key={x.stock} type="number" step="any" min="0" defaultValue={fmtStock(x.stock)} style={{ width: '6.5rem' }}
                  aria-label={`Cantidad de ${x.nombre}`} onBlur={e => onCantidad(x, e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} /> {x.unidad}{stockBajo(x) ? ' ⚠️' : ''}
              </td>
              <td>{nombreSurtidor(x.surtidorId, surtidores)}</td>
              <td>{x.costo ? money(x.costo) : '—'}</td>
              <td>{u?.registradoPor?.nombre || '—'}</td>
              <td style={{ minWidth: 80 }}><div className="bar"><i style={{ width: `${Math.min(100, r * 100)}%` }} /></div></td>
              <td><button className="btn s" aria-label="Eliminar" onClick={() => onBorrar(x)}>✕</button></td>
            </tr>
          );
        }) : <tr><td colSpan={8}>Sin productos</td></tr>}
      </tbody>
    </table>
  );
}

/** Pestaña Inventario: insumos, salsas, ingreso de compras e historial. */
export default function Inventario() {
  const ins = useCarga('/api/insumos', /** @type {any[]} */ ([]));
  const com = useCarga('/api/compras', /** @type {any[]} */ ([]));
  const sur = useCarga('/api/surtidores', /** @type {any[]} */ ([]));
  const [f, setF] = useState(VACIO);
  const set = k => e => setF({ ...f, [k]: e.target.value });

  async function onCantidad(x, v) {
    if (v === '' || !(+v >= 0) || +v === fmtStock(x.stock)) return;
    const { id, ...resto } = x;
    try {
      await api.put(`/api/insumos/${id}`, { ...resto, stock: +v, stockReferencia: Math.max(+x.stockReferencia || 0, +v) });
    } catch (e) { toastError(e); }
    ins.recargar();
  }

  async function onBorrar(x) {
    if (!confirm(`¿Eliminar "${x.nombre}" del inventario?`)) return;
    try { await api.del(`/api/insumos/${x.id}`); } catch (e) { toastError(e); }
    ins.recargar(); com.recargar();
  }

  async function compra() {
    const r = validarCompra(f, ins.data);
    if ('error' in r) return toast(r.error);
    try {
      await api.post('/api/compras', r.body);
      setF(VACIO);
      toast(r.nuevo ? 'Producto creado y guardado' : 'Ingreso guardado');
    } catch (e) { toastError(e); }
    ins.recargar(); com.recargar();
  }

  const props = { compras: com.data, surtidores: sur.data, onCantidad, onBorrar };
  return (
    <>
      <h2>Inventario</h2>
      <p className="sm" style={{ margin: '.5rem 0 1rem' }}>La cantidad baja sola con cada plato que preparas, en la misma unidad del inventario. Invertido en total: <b>{money(totalInvertido(com.data))}</b></p>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3>Ingresar producto</h3>
        <p className="sm">Si el producto no existe, se crea al guardar.</p>
        <div className="fg">
          <input list="ls" placeholder="Producto (nuevo o existente)" value={f.nombre} onChange={set('nombre')} />
          <datalist id="ls">{ins.data.map(x => <option key={x.id}>{x.nombre}</option>)}</datalist>
          <select aria-label="Tipo" value={f.tipo} onChange={set('tipo')}><option value="insumo">Insumo</option><option value="salsa">Salsa</option></select>
          <input type="number" step="any" placeholder="Cantidad" value={f.cantidad} onChange={set('cantidad')} />
          <select aria-label="Unidad" value={f.unidad} onChange={set('unidad')}>{['und', 'g', 'kg', 'lb'].map(u => <option key={u}>{u}</option>)}</select>
          <input type="number" placeholder="Costo total COP" value={f.costo} onChange={set('costo')} />
          <select aria-label="Surtidor" value={f.surtidor} onChange={set('surtidor')}>
            <option value="tienda">🏪 Compra en tienda</option>
            {sur.data.map(z => <option key={z.id} value={String(z.id)}>🚚 {z.nombre}</option>)}
          </select>
          <button className="btn" onClick={compra}>Guardar en inventario</button>
        </div>
      </div>
      <div className="card scr" style={{ marginBottom: '1rem' }}><h3>Insumos</h3><TablaInsumos lista={ins.data.filter(x => x.tipo !== 'salsa')} {...props} /></div>
      <div className="card scr" style={{ marginBottom: '1rem' }}><h3>Salsas</h3><TablaInsumos lista={ins.data.filter(x => x.tipo === 'salsa')} {...props} /></div>
      <div className="card scr"><h3>Historial de compras</h3><HistorialCompras compras={com.data} /></div>
    </>
  );
}

export { UNIDADES };
