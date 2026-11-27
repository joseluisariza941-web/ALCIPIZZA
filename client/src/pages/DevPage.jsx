// Panel del desarrollador (dev(), cred(), subs() y addMes() de la app original):
// suscripción anual y accesos de cocina y meseras. Las contraseñas nunca se muestran: solo se escribe una nueva.
import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import Shell from '../components/Shell.jsx';
import { fechaLarga } from '../personal/formato.js';
import { MIN_CLAVE } from '../personal/login.js';
import { renovarHasta, suscripcionActiva, validarNuevoUsuario } from '../personal/usuarios.js';
import { useToast } from '../personal/useToast.jsx';

/** @typedef {import('../auth/AuthContext.jsx').Usuario & { activo:boolean }} Usuario */

/** ISO → "aaaa-mm-dd" en hora local (para el <input type="date">). @param {string|null} iso */
const aFechaInput = iso => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function DevPage() {
  const { user } = useAuth();
  const { toast, aviso } = useToast();
  const [sub, setSub] = useState(/** @type {{activa:boolean, hasta:string|null}|null} */ (null));
  const [fecha, setFecha] = useState('');
  const [usuarios, setUsuarios] = useState(/** @type {Usuario[]} */ ([]));

  const cargarSub = useCallback(async () => {
    try { const s = await api.get('/api/suscripcion'); setSub(s); setFecha(aFechaInput(s.hasta)); } catch (e) { aviso(e.message); }
  }, [aviso]);
  const cargarUsuarios = useCallback(async () => {
    try { setUsuarios(await api.get('/api/usuarios')); } catch (e) { aviso(e.message); }
  }, [aviso]);
  useEffect(() => { if (user && !user.debeCambiarClave) { cargarSub(); cargarUsuarios(); } }, [user, cargarSub, cargarUsuarios]);

  if (!user) return null;
  if (user.debeCambiarClave) return <Navigate to="/personal" replace />;

  const guardarSub = async (body, ok) => {
    try { await api.put('/api/suscripcion', body); if (ok) aviso(ok); } catch (e) { aviso(e.message); }
    cargarSub();
  };
  const guardarFecha = () => {
    if (!fecha) return aviso('Elige la fecha de vencimiento');
    const [y, m, d] = fecha.split('-').map(Number);
    guardarSub({ hasta: new Date(y, m - 1, d, 23, 59, 59).toISOString() }, 'Guardado');
  };

  const a = suscripcionActiva(sub);
  const existentes = usuarios.map(u => u.usuario);
  const fila = u => <FilaUsuario key={u.id} u={u} aviso={aviso} onCambio={cargarUsuarios} />;

  return (
    <Shell>
      <div data-testid="pagina-dev">
        <h2>Opciones de desarrollador</h2>
        {user.rol === 'superadmin' && <a className="btn s" href="/cocina">Ir al panel de cocina</a>}
        <div className="card" style={{ margin: '1rem 0' }}>
          <h3>Suscripción anual</h3>
          {sub && <p style={{ margin: '.7rem 0' }}>
            Estado: <span className="bd">{a ? '🟢 ACTIVA' : '🔴 INACTIVA'}</span><br />
            <small>Vence: {sub.hasta ? fechaLarga(sub.hasta) : '—'}</small>
          </p>}
          <div className="fg">
            <label>Vence el<input type="date" value={fecha} onChange={e => setFecha(e.target.value)} /></label>
            <button className="btn s" onClick={guardarFecha}>Guardar fecha</button>
          </div>
          <div className="row" style={{ marginTop: '.6rem' }}>
            <button className="btn" onClick={() => guardarSub({ activa: true, hasta: renovarHasta(sub?.hasta ?? null) })}>Activar / renovar 1 año</button>
            <button className="btn y" onClick={() => guardarSub({ activa: false })}>Desactivar</button>
          </div>
        </div>

        <div className="card" style={{ marginBottom: '1rem' }}>
          <h3>Administración de cocina</h3>
          <p className="sm">Accesos de la cocina. Cambia nombre, usuario o contraseña si alguien los olvida.</p>
          {usuarios.filter(u => u.rol === 'cocina').map(fila)}
          <Agregar rol="cocina" texto="Agregar acceso de cocina" existentes={existentes} aviso={aviso} onCambio={cargarUsuarios} />
        </div>

        <div className="card">
          <h3>Meseras</h3>
          <p className="sm">Cambia nombre, usuario o contraseña si alguien los olvida.</p>
          {usuarios.filter(u => u.rol === 'mesera').map(fila)}
          <Agregar rol="mesera" texto="Agregar mesera" existentes={existentes} aviso={aviso} onCambio={cargarUsuarios} />
        </div>

        {user.rol === 'superadmin' && [['dev', 'Desarrolladores', 'Agregar desarrollador'], ['superadmin', 'Superadministradores', 'Agregar superadministrador']].map(([rol, titulo, texto]) => (
          <div className="card" style={{ marginTop: '1rem' }} key={rol}>
            <h3>{titulo}</h3>
            {usuarios.filter(u => u.rol === rol).map(fila)}
            <Agregar rol={rol} texto={texto} existentes={existentes} aviso={aviso} onCambio={cargarUsuarios} />
          </div>
        ))}
      </div>
      {toast}
    </Shell>
  );
}

/**
 * Fila editable de un acceso. Cada campo se guarda al salir de él (onchange del original).
 * @param {{ u:Usuario, aviso:(t:string)=>void, onCambio:()=>void }} p
 */
function FilaUsuario({ u, aviso, onCambio }) {
  const [f, setF] = useState({ nombre: u.nombre, usuario: u.usuario, clave: '' });
  useEffect(() => setF(x => ({ ...x, nombre: u.nombre, usuario: u.usuario })), [u.nombre, u.usuario]);
  const restaurar = k => setF(x => ({ ...x, [k]: k === 'clave' ? '' : u[k] }));

  const enviar = async (body, campo) => {
    try {
      await api.put(`/api/usuarios/${u.id}`, body);
      aviso('Guardado');
      if (campo === 'clave') restaurar('clave');
      onCambio();
    } catch (e) {
      aviso(e.status === 409 ? 'Ese usuario ya existe' : e.message);
      restaurar(campo);
    }
  };

  const alSalir = campo => () => {
    let v = f[campo].trim();
    if (campo === 'clave') {
      if (!f.clave) return;
      if (f.clave.length < MIN_CLAVE) return aviso(`La contraseña debe tener al menos ${MIN_CLAVE} caracteres`);
      return enviar({ clave: f.clave }, 'clave');
    }
    if (campo === 'usuario') v = v.toLowerCase();
    if (v === u[campo]) return restaurar(campo);
    if (!v) { restaurar(campo); return aviso('No puede quedar vacío'); }
    setF(x => ({ ...x, [campo]: v }));
    enviar({ [campo]: v }, campo);
  };
  const cambiar = campo => e => setF({ ...f, [campo]: e.target.value });

  const quitar = async () => {
    if (!window.confirm(`¿Quitar a ${u.nombre}?`)) return;
    try { await api.del(`/api/usuarios/${u.id}`); } catch (e) { aviso(e.message); }
    onCambio();
  };

  return (
    <div className="fg" role="group" aria-label={u.nombre}>
      <input value={f.nombre} placeholder="Nombre" aria-label="Nombre" onChange={cambiar('nombre')} onBlur={alSalir('nombre')} />
      <input value={f.usuario} placeholder="Usuario" aria-label="Usuario" onChange={cambiar('usuario')} onBlur={alSalir('usuario')} />
      <input type="password" autoComplete="new-password" value={f.clave} placeholder="Nueva contraseña" aria-label="Nueva contraseña"
        onChange={cambiar('clave')} onBlur={alSalir('clave')} />
      <button className="btn s y" onClick={() => enviar({ activo: !u.activo }, 'activo')}>{u.activo ? 'Suspender acceso' : 'Activar acceso'}</button>
      <button className="btn s" onClick={quitar}>Quitar</button>
    </div>
  );
}

/**
 * Formulario para crear un acceso (queda con cambio de contraseña obligatorio al entrar).
 * @param {{ rol:'cocina'|'mesera', texto:string, existentes:string[], aviso:(t:string)=>void, onCambio:()=>void }} p
 */
function Agregar({ rol, texto, existentes, aviso, onCambio }) {
  const vacio = { nombre: '', usuario: '', clave: '' };
  const [f, setF] = useState(vacio);
  const cambiar = campo => e => setF({ ...f, [campo]: e.target.value });

  const agregar = async () => {
    const error = validarNuevoUsuario(f, existentes);
    if (error) return aviso(error);
    try {
      await api.post('/api/usuarios', { nombre: f.nombre.trim(), usuario: f.usuario.trim().toLowerCase(), clave: f.clave, rol });
      setF(vacio);
      aviso('Guardado. Deberá cambiar la contraseña al entrar.');
      onCambio();
    } catch (e) { aviso(e.status === 409 ? 'Ese usuario ya existe' : e.message); }
  };

  return (
    <div className="fg" style={{ borderTop: '2px dashed var(--ln)', paddingTop: '.6rem' }}>
      <input placeholder="Nombre" value={f.nombre} onChange={cambiar('nombre')} />
      <input placeholder="Usuario" value={f.usuario} onChange={cambiar('usuario')} />
      <input placeholder="Contraseña" type="password" autoComplete="new-password" value={f.clave} onChange={cambiar('clave')} />
      <button className="btn" onClick={agregar}>{texto}</button>
    </div>
  );
}
