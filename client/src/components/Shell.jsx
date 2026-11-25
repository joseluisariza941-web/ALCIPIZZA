// Marco común de todas las pantallas (shell() + foot() + bgInit() + splash de app.js original).
// API estable: <Shell>{contenido}</Shell>. Opcional: staff={true|false} (por defecto se deduce de la ruta).
// Dentro de <Shell> los hijos pueden leer la configuración pública con usePublicConfig().
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, INICIO } from '../auth/AuthContext.jsx';
import { PALETAS, useTheme } from '../theme/useTheme.js';
import { ConfigContext, logoDe, useCargarConfig } from './ConfigContext.jsx';
import { ToastHost } from './toast.jsx';
import { Splash, splashInicial } from './splash.jsx';
import IconoWhatsApp from './IconoWhatsApp.jsx';
import { IconoFacebook, IconoUbicacion } from './IconosRedes.jsx';
import { estaAbierto } from '../cliente/horario.js';

const EMOJIS = ['🍔', '🍟', '🌭', '🍕', '🥤', '🌮', '🫓', '🥓', '🧀', '🍅', '🌶️', '🥬'];
const azar = a => a[Math.floor(Math.random() * a.length)];
const TITULO = { vinotinto: 'Vinotinto / blanco', blanconegro: 'Blanco / negro' };
// Clics sobre estos elementos no lanzan la lluvia de emojis (como el original).
const SIN_CHISPAS = 'button,a,input,select,textarea,label,.card,.tk,.cartel,.mq,.md,.hero h1,.hero p,.st';

let semilla = 0;
function emojiFondo() {
  return {
    k: ++semilla, e: azar(EMOJIS),
    style: {
      left: `${Math.random() * 96}%`, top: `${Math.random() * 92}%`, fontSize: `${1.6 + Math.random() * 2.6}rem`,
      '--d': (Math.random() * 40 - 20) | 0, '--t': `${9 + Math.random() * 10}s`, '--dl': `-${Math.random() * 10}s`, '--r': `${(Math.random() * 60 - 30) | 0}deg`,
    },
  };
}

/** Emojis flotantes de fondo (#bg) con parallax y chispas al hacer clic. */
function Fondo() {
  const [items, setItems] = useState(() => Array.from({ length: 16 }, emojiFondo));
  const [pop, setPop] = useState(/** @type {number|null} */ (null));
  const ref = useRef(/** @type {HTMLDivElement|null} */ (null));

  useEffect(() => {
    const mover = e => {
      ref.current?.style.setProperty('--mx', (e.clientX / innerWidth - 0.5).toFixed(3));
      ref.current?.style.setProperty('--my', (e.clientY / innerHeight - 0.5).toFixed(3));
    };
    const chispas = e => {
      if (!(e.target instanceof Element) || e.target.closest(SIN_CHISPAS)) return;
      for (let i = 0; i < 7; i++) {
        const s = document.createElement('span'), a = Math.random() * 6.28, d = 60 + Math.random() * 90;
        s.className = 'sp2';
        s.textContent = azar(EMOJIS);
        s.style.cssText = `left:${e.clientX}px;top:${e.clientY}px;--x:${Math.cos(a) * d}px;--y:${Math.sin(a) * d - 40}px;--q:${Math.random() * 360}deg`;
        document.body.append(s);
        setTimeout(() => s.remove(), 900);
      }
    };
    addEventListener('pointermove', mover);
    addEventListener('click', chispas);
    return () => { removeEventListener('pointermove', mover); removeEventListener('click', chispas); };
  }, []);

  const reventar = k => {
    setPop(k);
    setTimeout(() => { setItems(l => l.map(x => (x.k === k ? emojiFondo() : x))); setPop(null); }, 450);
  };

  return (
    <div id="bg" aria-hidden="true" ref={ref}>
      {items.map(x => <span key={x.k} className={pop === x.k ? 'pop' : undefined} style={x.style} onClick={() => reventar(x.k)}>{x.e}</span>)}
    </div>
  );
}

/** Reloj con fecha y estado abierto/cerrado (tick original). */
function Reloj({ h, abierto }) {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setAhora(new Date()), 1000); return () => clearInterval(t); }, []);
  const ab = abierto ?? estaAbierto(h, ahora);
  return (
    <div className="clock">
      <b id="clk">{ahora.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</b>
      <small id="cdt">{ahora.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'short' }) + (ab ? ' · 🟢 Abierto' : ' · 🔴 Cerrado')}</small>
    </div>
  );
}

/** Botón 🎨 con las paletas, y botón claro/oscuro. */
function Colores() {
  const { paleta, modo, setPaleta, setModo } = useTheme();
  const [abierto, setAbierto] = useState(false);
  const ref = useRef(/** @type {HTMLDivElement|null} */ (null));
  useEffect(() => {
    if (!abierto) return undefined;
    const fuera = e => { if (!ref.current?.contains(e.target)) setAbierto(false); };
    document.addEventListener('click', fuera);
    return () => document.removeEventListener('click', fuera);
  }, [abierto]);
  return (
    <>
      <div className="pw" ref={ref}>
        <button className="btn s y" onClick={() => setAbierto(a => !a)}>🎨 Colores</button>
        {abierto && (
          <div className="pal">
            {Object.entries(PALETAS).map(([k, [a, b]]) => (
              <button key={k} className={'sw' + (paleta === k ? ' on' : '')} aria-label={`Paleta ${k}`} title={TITULO[k] || k}
                style={{ background: `linear-gradient(135deg,${a} 50%,${b} 50%)` }}
                onClick={() => { setPaleta(k); setAbierto(false); }} />
            ))}
          </div>
        )}
      </div>
      <button className="btn s y" aria-label="Modo claro u oscuro" onClick={() => setModo(modo === 'l' ? 'd' : 'l')}>{modo === 'l' ? '🌙' : '☀️'}</button>
    </>
  );
}

function Pie({ c }) {
  return (
    <>
      <div className="ft">
        <div className="r" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div><b>📍 Güepsa, Santander</b><br />{c.n} · {c.w2}</div>
          <div>
            <a className="btn y s" href={`tel:${c.tel}`}>📞 {c.tel}</a>{' '}
            <a className="btn s wa" target="_blank" rel="noopener noreferrer" href={`https://wa.me/57${c.tel}`}><IconoWhatsApp /> {c.tel}</a>{' '}
            <a className="btn s" target="_blank" rel="noopener noreferrer" href="https://www.facebook.com/alcipi" aria-label="Facebook de Alcipizza"><IconoFacebook /> Facebook</a>{' '}
            <a className="btn s" target="_blank" rel="noopener noreferrer" href="https://maps.app.goo.gl/RMeGi2dnmzTygJXh7" aria-label="Ver ubicación de Alcipizza en Google Maps"><IconoUbicacion /> Cl. 4, Guepsa, Güepsa, Santander</a>
          </div>
        </div>
        <div className="cp">© {new Date().getFullYear()} {c.n} · Software desarrollado por <b>ING. JOSÉ LUIS ARIZA</b> · Todos los derechos reservados</div>
      </div>
      <Link className="hid" to="/personal" aria-label="Acceso del personal">🔒</Link>
    </>
  );
}

/**
 * @param {{ children?: import('react').ReactNode, staff?: boolean }} p
 */
export default function Shell({ children, staff }) {
  const pub = useCargarConfig();
  const c = pub.config;
  const logo = logoDe(c);
  const { user, logout } = useAuth() || {};
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const esStaff = staff ?? /^\/(cocina|mesera|dev)(\/|$)/.test(pathname);

  useEffect(() => { if (pub.cargado) splashInicial(c.w1); }, [pub.cargado, c.w1]);
  useEffect(() => {
    let l = document.querySelector('link[rel=icon]');
    if (!l) { l = Object.assign(document.createElement('link'), { rel: 'icon' }); document.head.append(l); }
    l.setAttribute('href', logo);
  }, [logo]);

  const salir = async () => { try { await logout?.(); } finally { navigate('/'); } };

  return (
    <ConfigContext.Provider value={pub}>
      <div id="wp" style={{ backgroundImage: c.bg ? `linear-gradient(var(--vl),var(--vl)),url("${c.bg}")` : 'none' }} />
      <Fondo />
      <div className="wrap">
        <div className="top">
          <Link className="logo2" to="/" aria-label="Ir al inicio"><img className="lgw" src={logo} alt={c.n} /></Link>
          <div className="dock">
            <span className="bd">📍 Güepsa, Santander</span>
            <Reloj h={c.h} abierto={pub.abierto} />
            {esStaff && user && <><span className="bd">{user.nombre}</span><button className="btn y s" onClick={salir}>Salir</button></>}
            {!esStaff && user && <Link className="btn s y" to={INICIO[user.rol] || '/'}>↩ Mi panel</Link>}
            <Colores />
          </div>
        </div>
        {children}
        <Pie c={c} />
      </div>
      <Splash logo={logo} />
      <ToastHost />
    </ConfigContext.Provider>
  );
}
