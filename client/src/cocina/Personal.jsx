import { useState } from 'react';
import { api } from '../api.js';
import { useCarga } from './hooks.js';
import { fd } from './util.js';
import { validarCambioMesera, validarMesera } from './personal.js';
import { toast, toastError } from './toast.js';
import FiltroEliminados, { textoOcultar } from './FiltroEliminados.jsx';

const VACIA = { nombre: '', usuario: '', clave: '' };

/** Fila de una mesera: nombre y usuario editables, clave nueva opcional (nunca se muestra la actual). */
function Fila({ m, onCambio, onQuitar }) {
  const [clave, setClave] = useState('');
  const cambiar = (campo, v) => { if (campo === 'clave' ? v : v !== m[campo]) onCambio(m, campo, v, () => setClave('')); };
  return (
    <tr>
      <td><input key={m.nombre} defaultValue={m.nombre} aria-label="Nombre" onBlur={e => cambiar('nombre', e.target.value)} /></td>
      <td><input key={m.usuario} defaultValue={m.usuario} aria-label="Usuario" onBlur={e => cambiar('usuario', e.target.value)} /></td>
      <td>
        <input type="password" autoComplete="new-password" value={clave} placeholder="Nueva contraseña" aria-label={`Nueva contraseña de ${m.nombre}`}
          onChange={e => setClave(e.target.value)} onBlur={e => cambiar('clave', e.target.value)} />
      </td>
      <td><button className="btn s" onClick={() => onQuitar(m)}>Quitar</button></td>
    </tr>
  );
}

/** Pestaña Personal: meseras (/api/usuarios) y bitácora (ku original). */
export default function Personal() {
  const us = useCarga('/api/usuarios', /** @type {any[]} */ ([]));
  const bi = useCarga('/api/bitacora?limit=200', /** @type {any[]} */ ([]));
  const meseras = us.data.filter(u => u.rol === 'mesera');
  const [f, setF] = useState(VACIA);
  const recargar = () => { us.recargar(); bi.recargar(); };

  async function crear() {
    const r = validarMesera(f, us.data);
    if (r.error) return toast(r.error);
    try { await api.post('/api/usuarios', r.body); setF(VACIA); } catch (e) { toastError(e); }
    recargar();
  }
  async function cambiar(m, campo, v, limpiar) {
    const r = validarCambioMesera(m, campo, v, us.data);
    if (r.error) { toast(r.error); return us.recargar(); }
    try { await api.put(`/api/usuarios/${m.id}`, r.body); toast('Guardado'); limpiar(); } catch (e) { toastError(e); }
    recargar();
  }
  async function quitar(m) {
    if (!confirm(textoOcultar(`a ${m.nombre}`))) return;
    try { await api.del(`/api/usuarios/${m.id}`); } catch (e) { toastError(e); }
    recargar();
  }
  const campo = k => ({ value: f[k], onChange: e => setF({ ...f, [k]: e.target.value }) });

  return (
    <>
      <div className="card" style={{ margin: '1rem 0' }}>
        <h3>Meseras</h3>
        <table>
          <tbody>{meseras.map(m => <Fila key={m.id} m={m} onCambio={cambiar} onQuitar={quitar} />)}</tbody>
        </table>
        <FiltroEliminados ruta="/api/usuarios" nombre={u => `${u.nombre} (${u.usuario})`} version={us.data} filtrar={u => u.rol === 'mesera'} onRestaurado={recargar} />
        <div className="fg">
          <input placeholder="Nombre" {...campo('nombre')} />
          <input placeholder="Usuario" {...campo('usuario')} />
          <input type="password" autoComplete="new-password" placeholder="Contraseña" {...campo('clave')} />
          <button className="btn" onClick={crear}>Agregar mesera</button>
        </div>
      </div>
      <h2>Ingresos y acciones del personal</h2>
      <div className="card scr" style={{ marginTop: '1rem' }}>
        <table>
          <thead><tr><th>Fecha y hora</th><th>Persona</th><th>Acción</th></tr></thead>
          <tbody>
            {bi.data.length
              ? bi.data.map(l => <tr key={l.id}><td>{fd(l.fecha)}</td><td>{l.nombre}</td><td>{l.accion}</td></tr>)
              : <tr><td colSpan={3}>Aún no hay registros</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
