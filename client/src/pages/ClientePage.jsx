// Página pública "/": bienvenida, horarios, menú, personalización, pre-ticket y envío del pedido (cliente() original).
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import Shell from '../components/Shell.jsx';
import Modal from '../components/Modal.jsx';
import MenuPlatos from '../components/MenuPlatos.jsx';
import PersonalizarPlato from '../components/PersonalizarPlato.jsx';
import PreTicket, { formVacio } from '../components/PreTicket.jsx';
import DetalleItem from '../components/DetalleItem.jsx';
import IconoWhatsApp from '../components/IconoWhatsApp.jsx';
import { toast } from '../components/toast.jsx';
import { logoDe, usePublicConfig } from '../components/ConfigContext.jsx';
import { pesos } from '../cliente/formato.js';
import { estaAbierto, filasHorario } from '../cliente/horario.js';
import { cuerpoPedido, pideMesa, totalCarrito, validarPedido } from '../cliente/carrito.js';
import { borrarTirilla, guardarTirilla, leerTirilla, urlTirilla } from '../cliente/tirillaLocal.js';

export default function ClientePage() {
  return <Shell><Cliente /></Shell>;
}

function Cartel() {
  const { config: c, abierto } = usePublicConfig();
  const ab = typeof abierto === 'boolean' ? abierto : estaAbierto(c.h);
  return (
    <div className="info">
      <div className="cartel">
        <div className="cr"><h3>🕒 Horarios</h3><span className={'bd ' + (ab ? 'on' : 'of')}>{ab ? '● Abierto ahora' : '● Cerrado ahora'}</span></div>
        {filasHorario(c.h).map(f => (
          <div key={f.dia} className={'dr' + (f.hoy ? ' hoy' : '') + (f.cerrado ? ' cer' : '')}><span>{f.dia}</span><span>{f.texto}</span></div>
        ))}
      </div>
      <div className="card loc">
        <h3>📍 Estamos en Güepsa</h3><p>Santander, Colombia</p>
        <p className="sm">Pide aquí o escríbenos para resolver cualquier duda:</p>
        <a className="bigtel" href={`tel:${c.tel}`}><span>📞</span><span><small>Llámanos</small><b>{c.tel}</b></span></a>
        <a className="bigtel wa" target="_blank" rel="noopener noreferrer" href={`https://wa.me/57${c.tel}`}>
          <span><IconoWhatsApp /></span><span><small>Escríbenos por WhatsApp</small><b>{c.tel}</b></span></a>
      </div>
    </div>
  );
}

function Hero() {
  const { config: c } = usePublicConfig();
  const stk = [['🍔', '-12deg', '2%', 0, 0], ['🌭', '10deg', '20%', 90, -1], ['🍕', '-6deg', '6%', 170, -2], ['🥤', '14deg', '30%', 18, -3], ['🌮', '-16deg', '36%', 140, -1.5]];
  return (
    <>
      <section className="hero">
        {stk.map(([e, r, right, top, dl]) => (
          <span key={e} className="stk" style={{ '--r': r, right, top, ...(dl ? { animationDelay: `${dl}s` } : {}) }}>{e}</span>
        ))}
        <div className="hl"><img className="hlogo" src={logoDe(c)} alt={c.n} /><h1>{c.w1}</h1></div>
        <p>{c.w2}</p><span className="st">{c.w3}</span><span className="st y">{c.w4}</span>
      </section>
      <div className="mq"><span>🍔 Hamburguesas ✦ 🍕 Pizzas ✦ 🌭 Perros ✦ 🌮 Tacos ✦ 🫓 Arepas ✦ 🍟 Salchipapas ✦ 🥤 Bebidas frías ✦ {c.w4} ✦ </span></div>
    </>
  );
}

/** Aviso del último pedido hecho desde este navegador (SS.last original). */
function MiPedido() {
  const navigate = useNavigate();
  const [o, setO] = useState(null);
  const [t] = useState(leerTirilla);
  useEffect(() => {
    if (!t) return;
    let vivo = true;
    api.get(`/api/pedidos/${t.id}?token=${encodeURIComponent(t.token)}`)
      .then(p => { if (vivo && p && !['entregado', 'cancelado'].includes(p.estado)) setO(p); })
      .catch(() => {});
    return () => { vivo = false; };
  }, [t]);
  if (!o) return null;
  return (
    <div className="card" style={{ background: 'var(--a2)', color: '#1c120a', marginBottom: '1rem' }}>
      <b>📦 Tu pedido #{o.id}: {o.estado === 'listo' ? '¡listo!' : o.estado}</b>{' '}
      <button className="btn s" onClick={() => navigate(urlTirilla(t.id, t.token))}>Ver mi tirilla</button>{' '}
      <button className="btn s y" onClick={() => { borrarTirilla(); setO(null); }}>Ocultar</button>
    </div>
  );
}

function Cliente() {
  const { config: c, pagos: todos, suscripcionActiva } = usePublicConfig();
  const navigate = useNavigate();
  const pagos = todos.filter(x => x.activo !== false);
  const [platos, setPlatos] = useState([]);
  const [elegido, setElegido] = useState(null);
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(() => formVacio());
  const [confirmar, setConfirmar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  // Método de pago vigente: el elegido si sigue activo, si no el primero (como ticket() original).
  const f = { ...form, metodoPago: pagos.some(x => x.codigo === form.metodoPago) ? form.metodoPago : pagos[0]?.codigo || '' };

  useEffect(() => {
    let vivo = true;
    api.get('/api/menu').then(m => { if (vivo) setPlatos(Array.isArray(m) ? m : m?.platos || []); })
      .catch(e => toast(e.message));
    return () => { vivo = false; };
  }, []);

  if (!suscripcionActiva) {
    return (
      <div className="card" style={{ maxWidth: 480, margin: '3rem auto', textAlign: 'center' }}>
        <div className="em" style={{ margin: '0 auto .6rem' }}>⏸️</div><h2>Servicio en pausa</h2>
        <p className="sm" style={{ marginTop: '.6rem' }}>Estamos renovando el servicio. Escríbenos por WhatsApp al {c.tel}.</p>
      </div>
    );
  }

  const enviar = () => {
    const err = validarPedido(items, f);
    if (err) return toast(err);
    setConfirmar(true);
  };

  const confirmarEnvio = async () => {
    setConfirmar(false);
    setEnviando(true);
    try {
      const r = await api.post('/api/pedidos', cuerpoPedido(items, f));
      guardarTirilla({ id: r.pedido.id, token: r.token });
      setItems([]);
      navigate(urlTirilla(r.pedido.id, r.token));
    } catch (e) {
      toast(e.message);
      setEnviando(false);
    }
  };

  const mp = pagos.find(x => x.codigo === f.metodoPago);
  const resumen = f.destino + (pideMesa(f.destino) ? ' · Mesa ' + f.mesa : '') + (f.cliente ? ' · ' + f.cliente : '')
    + (f.direccion ? ' · ' + f.direccion : '') + (f.telefono ? ' · 📞 ' + f.telefono : '') + ' · Pago: ' + (mp?.nombre || '');

  return (
    <>
      <Hero />
      <Cartel />
      <MiPedido />
      <div className="cols">
        <div><MenuPlatos platos={platos} onElegir={setElegido} /></div>
        <PreTicket items={items} onQuitar={i => setItems(l => l.filter((_, j) => j !== i))} form={f} onForm={setForm}
          pagos={pagos} mesas={c.mesas} onEnviar={enviar} enviando={enviando} />
      </div>
      {elegido && <PersonalizarPlato plato={elegido} onCerrar={() => setElegido(null)}
        onAgregar={it => { setItems(l => [...l, it]); setElegido(null); }} />}
      {confirmar && (
        <Modal>
          <div className="card" style={{ maxWidth: 430, width: '92%', maxHeight: '92vh', overflow: 'auto' }}>
            <h2>¿Confirmas el pedido?</h2>
            <p className="sm" style={{ margin: '.4rem 0' }}>Revisa que todo esté bien antes de enviarlo a cocina.</p><hr />
            {items.map((it, i) => (
              <p className="r" key={i}>
                <span>{it.emoji} <b>{it.nombre}</b> ({it.variante})
                  <DetalleItem sin={it.sin} extras={it.extrasNombres} salsas={it.salsas} nota={it.nota} /></span>
                <b>{pesos(it.precio)}</b>
              </p>
            ))}
            <hr /><p className="r" style={{ fontSize: '1.3rem' }}><b>Total</b><b>{pesos(totalCarrito(items))}</b></p>
            <p className="sm" style={{ margin: '.5rem 0' }}>{resumen}</p>
            <div className="row">
              <button className="btn" onClick={confirmarEnvio}>✅ Confirmar y enviar</button>
              <button className="btn y" onClick={() => setConfirmar(false)}>Volver a revisar</button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
