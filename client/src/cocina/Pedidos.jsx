import { api } from '../api.js';
import { usePublicConfig } from '../components/ConfigContext.jsx';
import { botonEstado, hora, money, siguienteEstado, waLink } from './util.js';
import { toastError } from './toast.js';
import WaIcon from './WaIcon.jsx';

/** Estado de pago (pgb original). */
const Pago = ({ o }) => (o.pagoEstado === 'pagado'
  ? <span className="bd">✅ Pagado · {o.metodoPago?.nombre || ''}</span>
  : <span className="bd">⏳ Cobro pendiente</span>);

/** Ítem del pedido con sin, extras, salsas y nota. */
function Item({ c }) {
  return (
    <p>
      1× {c.emoji} {c.nombre} ({c.variante})
      {c.sin?.length > 0 && <><br /><small>SIN {c.sin.join(', ')}</small></>}
      {c.extras?.length > 0 && <><br /><small>+ {c.extras.map(e => e.nombre).join(', ')}</small></>}
      {c.salsas?.length > 0 && <><br /><small>SALSAS: {c.salsas.join(', ')}</small></>}
      {c.nota && <><br /><small>“{c.nota}”</small></>}
    </p>
  );
}

/** Tarjeta de pedido (kp original). */
function Ticket({ o, onEstado, onWa }) {
  const sig = siguienteEstado(o.estado);
  return (
    <div className="tk">
      <div className="r"><h3>#{o.id}</h3><span className="bd">{o.origen === 'web' ? '🌐 Web' : '🧑‍🍳 ' + (o.mesera?.nombre || '')}</span></div>
      <p>
        <b>{o.destino}</b>{o.cliente ? ' · ' + o.cliente : ''}
        {o.direccion && <><br />{o.direccion}</>}
        {o.telefono && <><br />📞 {o.telefono}</>}
      </p>
      <hr />
      {o.items.map((c, i) => <Item key={c.id ?? i} c={c} />)}
      <hr />
      <p className="r"><small>{hora(o.creadoEn)}</small><b>{money(o.total)}</b></p>
      <p><Pago o={o} /></p>
      {sig && <button className="btn" style={{ width: '100%', marginTop: '.5rem' }} onClick={() => onEstado(o, sig)}>{botonEstado(o.estado)}</button>}
      <button className="btn s wa" style={{ width: '100%', marginTop: '.5rem' }} onClick={() => onWa(o)}><WaIcon /> Enviar al WhatsApp</button>
      {(o.estado === 'nuevo' || o.estado === 'preparando') && (
        <button className="btn s y" style={{ width: '100%', marginTop: '.5rem' }} onClick={() => onEstado(o, 'cancelado')}>Cancelar pedido</button>
      )}
    </div>
  );
}

/**
 * Pestaña Pedidos: tablero del día.
 * @param {{ pedidos: any[], recargar: () => Promise<void> }} p
 */
export default function Pedidos({ pedidos, recargar }) {
  const { config: cfg } = usePublicConfig();
  const act = pedidos.filter(o => o.estado === 'nuevo' || o.estado === 'preparando');
  const listos = pedidos.filter(o => o.estado === 'listo');

  async function onEstado(o, estado) {
    if (estado === 'cancelado' && !confirm(`¿Cancelar el pedido #${o.id}?`)) return;
    try { await api.patch(`/api/pedidos/${o.id}/estado`, { estado }); } catch (e) { toastError(e); }
    await recargar();
  }
  const onWa = o => open(waLink(o, cfg), '_blank');

  return (
    <>
      <h2>En cocina</h2>
      <p className="sm" style={{ margin: '.5rem 0 1.2rem' }}>{listos.length} pedido(s) listo(s) esperando entrega.</p>
      {act.length
        ? <div className="tks">{act.map(o => <Ticket key={o.id} o={o} onEstado={onEstado} onWa={onWa} />)}</div>
        : <div className="card">Sin pedidos por ahora. Cuando llegue uno, suena la campana.</div>}
      {listos.length > 0 && (
        <>
          <h2 style={{ marginTop: '1.5rem' }}>Listos para entregar</h2>
          <div className="tks">{listos.map(o => <Ticket key={o.id} o={o} onEstado={onEstado} onWa={onWa} />)}</div>
        </>
      )}
    </>
  );
}
