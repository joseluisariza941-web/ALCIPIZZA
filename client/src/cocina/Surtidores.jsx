import { useState } from 'react';
import { api } from '../api.js';
import { useCarga } from './hooks.js';
import { fd, money } from './util.js';
import { filasSurtidores, validarSurtidor } from './surtidores.js';
import { toast, toastError } from './toast.js';
import FiltroEliminados, { textoOcultar } from './FiltroEliminados.jsx';

const VACIO = { nombre: '', empresa: '', correo: '', telefono: '' };
const CAMPOS = [['nombre', 'Nombre', 'text', ''], ['empresa', 'Empresa', 'text', 'Empresa'], ['correo', 'Correo', 'email', 'Correo'],
  ['telefono', 'Teléfono', 'text', 'Teléfono / WhatsApp']];

/** Fila editable de un surtidor (hs original). */
function Fila({ z, onGuardar, onBorrar }) {
  const guardar = (k, v) => { if (v !== (z[k] || '')) onGuardar(z, { [k]: v }); };
  return (
    <tr>
      {CAMPOS.map(([k, aria, type, ph]) => (
        <td key={k}><input key={z[k]} type={type} defaultValue={z[k] || ''} placeholder={ph || undefined} aria-label={aria} onBlur={e => guardar(k, e.target.value)} /></td>
      ))}
      <td>{z.productos}</td>
      <td>{money(z.total)}</td>
      <td>{z.ultima ? fd(z.ultima) : '—'}</td>
      <td><button className="btn s" aria-label="Eliminar" onClick={() => onBorrar(z)}>✕</button></td>
    </tr>
  );
}

/** Pestaña Surtidores (ks original). */
export default function Surtidores() {
  const sur = useCarga('/api/surtidores', /** @type {any[]} */ ([]));
  const com = useCarga('/api/compras', /** @type {any[]} */ ([]));
  const ins = useCarga('/api/insumos', /** @type {any[]} */ ([]));
  const [f, setF] = useState(VACIO);
  const [q, setQ] = useState('');
  const filas = filasSurtidores(sur.data, com.data, ins.data, q);

  async function crear() {
    const r = validarSurtidor(f);
    if (r.error) return toast(r.error);
    try { await api.post('/api/surtidores', r.body); setF(VACIO); sur.recargar(); } catch (e) { toastError(e); }
  }
  async function editar(z, cambio) {
    const { nombre, empresa, correo, telefono } = z;
    const body = { nombre, empresa: empresa || '', correo: correo || '', telefono: telefono || '', ...cambio };
    if (!body.nombre.trim()) { toast('Escribe el nombre del surtidor'); return sur.recargar(); }
    try { await api.put(`/api/surtidores/${z.id}`, body); } catch (e) { toastError(e); }
    sur.recargar();
  }
  async function borrar(z) {
    if (!confirm(textoOcultar('este surtidor'))) return;
    try { await api.del(`/api/surtidores/${z.id}`); } catch (e) { toastError(e); }
    sur.recargar();
  }
  const campo = k => ({ value: f[k], onChange: e => setF({ ...f, [k]: e.target.value }) });

  return (
    <>
      <h2>Surtidores</h2>
      <p className="sm" style={{ margin: '.5rem 0 1rem' }}>Guarda quién te vende cada producto. Al ingresar un producto en Inventario eliges su surtidor o “Compra en tienda”.</p>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3>Nuevo surtidor</h3>
        <div className="fg">
          <input placeholder="Nombre del surtidor" {...campo('nombre')} />
          <input placeholder="Empresa que representa" {...campo('empresa')} />
          <input type="email" placeholder="Correo" {...campo('correo')} />
          <input placeholder="Teléfono / WhatsApp" {...campo('telefono')} />
          <button className="btn" onClick={crear}>Guardar surtidor</button>
        </div>
      </div>
      <FiltroEliminados ruta="/api/surtidores" nombre={z => z.nombre} version={sur.data} onRestaurado={sur.recargar} />
      <div className="card scr">
        <input placeholder="🔎 Buscar surtidor o producto" value={q} onChange={e => setQ(e.target.value)} style={{ marginBottom: '.6rem' }} />
        <table>
          <thead><tr><th>Surtidor</th><th>Empresa</th><th>Correo</th><th>Teléfono / WhatsApp</th><th>Productos</th><th>Total comprado</th><th>Última compra</th><th /></tr></thead>
          <tbody>
            {filas.length
              ? filas.map(z => <Fila key={z.id} z={z} onGuardar={editar} onBorrar={borrar} />)
              : <tr><td colSpan={8}>Sin surtidores</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
