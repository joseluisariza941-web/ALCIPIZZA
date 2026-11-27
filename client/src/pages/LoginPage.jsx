// Acceso del personal (login() y entrar() de la app original) + cambio de contraseña obligatorio.
import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { INICIO, useAuth } from '../auth/AuthContext.jsx';
import Shell from '../components/Shell.jsx';
import { CLAVE_SESION_EXPIRADA, MSG_CAMPOS_VACIOS, MSG_SESION_EXPIRADA, mensajeErrorLogin, validarCambioClave } from '../personal/login.js';
import { useToast } from '../personal/useToast.jsx';

export default function LoginPage() {
  const { user, login, setUser } = useAuth();
  const navigate = useNavigate();
  const { toast, aviso } = useToast();
  // Usuario que acaba de entrar y todavía debe cambiar la contraseña.
  const [pendiente, setPendiente] = useState(/** @type {any} */ (null));

  const porCambiar = pendiente || (user?.debeCambiarClave ? user : null);
  if (user && !user.debeCambiarClave && !pendiente) return <Navigate to={INICIO[user.rol] || '/'} replace />;

  const alPanel = u => navigate(INICIO[u.rol] || '/', { replace: true });

  return (
    <Shell>
      <div data-testid="pagina-login">
        {porCambiar
          ? <CambiarClave aviso={aviso} onListo={() => { const u = { ...porCambiar, debeCambiarClave: false }; setUser(u); alPanel(u); }} />
          : <Acceso onEntrar={async (usuario, clave) => {
            try {
              const u = await login(usuario, clave);
              if (u.debeCambiarClave) setPendiente(u); else alPanel(u);
            } catch (e) { return mensajeErrorLogin(e); }
            return '';
          }} />}
      </div>
      {toast}
    </Shell>
  );
}

/** @param {{ onEntrar:(u:string, c:string)=>Promise<string> }} p  onEntrar devuelve el mensaje de error, o '' si entró. */
function Acceso({ onEntrar }) {
  const [usuario, setUsuario] = useState('');
  const [clave, setClave] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState('');

  // Si api.js mandó al login por una sesión vencida, lo explica una sola vez.
  useEffect(() => {
    try {
      if (sessionStorage.getItem(CLAVE_SESION_EXPIRADA)) {
        sessionStorage.removeItem(CLAVE_SESION_EXPIRADA);
        setMensaje(MSG_SESION_EXPIRADA);
      }
    } catch { /* almacenamiento bloqueado */ }
  }, []);

  const entrar = async () => {
    const u = usuario.trim().toLowerCase();
    if (!u || !clave) return setMensaje(MSG_CAMPOS_VACIOS);
    if (enviando) return;
    setEnviando(true); setMensaje('');
    try { setMensaje(await onEntrar(u, clave)); } finally { setEnviando(false); }
  };

  return (
    <div className="card" style={{ maxWidth: 380, margin: '3rem auto' }}>
      <h2>Acceso del personal</h2>
      <p className="sm" style={{ margin: '.5rem 0 1rem' }}>Meseras, cocina y desarrollador entran por aquí.</p>
      <label>Usuario<input autoComplete="username" value={usuario} onChange={e => setUsuario(e.target.value)} /></label>
      <label>Contraseña<input type="password" autoComplete="current-password" value={clave}
        onChange={e => setClave(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') entrar(); }} /></label>
      <button className="btn" style={{ width: '100%', marginTop: '1rem' }} disabled={enviando} onClick={entrar}>{enviando ? 'Entrando…' : 'Entrar'}</button>
      {mensaje && <p role="alert" className="aviso-login">{mensaje}</p>}
    </div>
  );
}

/** @param {{ aviso:(t:string)=>void, onListo:()=>void }} p */
function CambiarClave({ aviso, onListo }) {
  const [f, setF] = useState({ actual: '', nueva: '', confirma: '' });
  const [enviando, setEnviando] = useState(false);
  const campo = k => e => setF({ ...f, [k]: e.target.value });

  const guardar = async () => {
    const error = validarCambioClave(f);
    if (error) return aviso(error);
    if (enviando) return;
    setEnviando(true);
    try {
      await api.post('/api/auth/cambiar-clave', { actual: f.actual, nueva: f.nueva });
      onListo();
    } catch (e) {
      aviso(e.message || 'No se pudo cambiar la contraseña');
      setEnviando(false);
    }
  };

  return (
    <div className="card" style={{ maxWidth: 380, margin: '3rem auto' }}>
      <h2>Cambia tu contraseña</h2>
      <p className="sm" style={{ margin: '.5rem 0 1rem' }}>Por seguridad, debes cambiar la contraseña antes de continuar. Usa al menos 8 caracteres.</p>
      <label>Contraseña actual<input type="password" autoComplete="current-password" value={f.actual} onChange={campo('actual')} /></label>
      <label>Nueva contraseña<input type="password" autoComplete="new-password" value={f.nueva} onChange={campo('nueva')} /></label>
      <label>Repite la nueva contraseña<input type="password" autoComplete="new-password" value={f.confirma} onChange={campo('confirma')}
        onKeyDown={e => { if (e.key === 'Enter') guardar(); }} /></label>
      <button className="btn" style={{ width: '100%', marginTop: '1rem' }} disabled={enviando} onClick={guardar}>Guardar y entrar</button>
    </div>
  );
}
