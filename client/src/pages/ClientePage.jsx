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
import { DESTINOS, cuerpoCotizar, cuerpoPedido, formDePedido, itemsDePedido, pideMesa, totalCarrito, validarPedido } from '../cliente/carrito.js';
import { borrarEdicion, guardarTirilla, leerEdicion, leerTirilla, urlTirilla } from '../cliente/tirillaLocal.js';

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
      <button className="btn s" onClick={() => navigate(urlTirilla(t.id, t.token))}>Ver mi tirilla</button>
    </div>
  );
}

function Cliente() {
  const { config: c, pagos: todos, suscripcionActiva, puntos, recargar } = usePublicConfig();
  const navigate = useNavigate();
  const pagos = todos.filter(x => x.activo !== false);
  const [platos, setPlatos] = useState([]);
  const [elegido, setElegido] = useState(null);
  const [edicion, setEdicion] = useState(leerEdicion);
  const [items, setItems] = useState(() => (edicion ? itemsDePedido(edicion.pedido) : []));
  const [form, setForm] = useState(() => (edicion ? formDePedido(edicion.pedido) : formVacio()));
  const [confirmar, setConfirmar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [cotizacion, setCotizacion] = useState(null);
  const domiciliosActivos = c.domiciliosActivos !== false;
  const destinos = domiciliosActivos ? DESTINOS : DESTINOS.filter(d => d !== 'Domicilio');
  // Método de pago vigente: el elegido si sigue activo, si no el primero (como ticket() original).
  const f = {
    ...form, destino: destinos.includes(form.destino) ? form.destino : destinos[0],
    metodoPago: pagos.some(x => x.codigo === form.metodoPago) ? form.metodoPago : pagos[0]?.codigo || '',
  };
  const itemsClave = JSON.stringify(items);

  useEffect(() => {
    let vivo = true;
    api.get('/api/menu').then(m => { if (vivo) setPlatos(Array.isArray(m) ? m : m?.platos || []); })
      .catch(e => toast(e.message, 'error'));
    return () => { vivo = false; };
  }, []);

  useEffect(() => { if (edicion) borrarEdicion(); }, []);

  useEffect(() => {
    setCotizacion(null);
    if (!items.length) return undefined;
    let vivo = true;
    const timer = setTimeout(() => {
      api.post('/api/pedidos/cotizar', cuerpoCotizar(items))
        .then(r => { if (vivo) setCotizacion(r); })
        .catch(() => { if (vivo) setCotizacion(null); });
    }, 300);
    return () => { vivo = false; clearTimeout(timer); };
  }, [itemsClave]);

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
    if (err) return toast(err, 'aviso');
    setConfirmar(true);
  };

  const confirmarEnvio = async () => {
    setConfirmar(false);
    setEnviando(true);
    try {
      if (edicion) {
        const r = await api.put(`/api/pedidos/${edicion.id}/cliente`, { token: edicion.token, ...cuerpoPedido(items, f) });
        guardarTirilla({ id: r.id, token: edicion.token });
        borrarEdicion();
        setEdicion(null);
        setItems([]);
        toast('Pedido actualizado', 'exito');
        navigate(urlTirilla(r.id, edicion.token));
      } else {
        const r = await api.post('/api/pedidos', cuerpoPedido(items, f));
        setItems([]);
        toast('Pedido enviado', 'exito');
        // Con una sesión del personal abierta el pedido queda del personal y no trae tirilla.
        if (r.token) {
          guardarTirilla({ id: r.pedido.id, token: r.token });
          navigate(urlTirilla(r.pedido.id, r.token));
        }
      }
    } catch (e) {
      toast(e.message, 'error');
      if (e.data?.code === 'NO_EDITABLE' && edicion) {
        const t = edicion;
        borrarEdicion();
        setEdicion(null);
        setEnviando(false);
        setTimeout(() => navigate(urlTirilla(t.id, t.token)), 600);
        return;
      }
      if (e.data?.code === 'DOMICILIOS_APAGADOS') recargar?.();
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
          pagos={pagos} mesas={c.mesas} onEnviar={enviar} enviando={enviando}
          domiciliosActivos={domiciliosActivos} puntos={puntos} cotizacion={cotizacion} />
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
            <hr />
            {cotizacion && <>
              <p className="r"><span>Subtotal</span><span>{pesos(cotizacion.subtotal)}</span></p>
              {cotizacion.descuentoPromo > 0 && <p className="r"><span>Descuento promoción</span><span>-{pesos(cotizacion.descuentoPromo)}</span></p>}
            </>}
            <p className="r" style={{ fontSize: '1.3rem' }}><b>Total</b><b>{pesos(cotizacion ? cotizacion.total : totalCarrito(items))}</b></p>
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
