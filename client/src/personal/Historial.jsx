// Historial de la mesera, cobro y tirilla (hist(), card(), cobrar() y recibo() de la app original).
import { DetalleItem, Modal, WaIcon } from './componentes.jsx';
import { fechaHora, pesos } from './formato.js';
import EtiquetasPedido from './EtiquetasPedido.jsx';
import { historial } from './pedidos.js';
import { waLink } from './whatsapp.js';

/**
 * @typedef {{ onCobrar:(o:any)=>void, onEditar:(o:any)=>void, onEntregado:(o:any)=>void, onTirilla:(o:any)=>void }} Acciones
 */

/** @param {{ o:any } & Acciones} p */
export function PedidoCard({ o, onCobrar, onEditar, onEntregado, onTirilla }) {
  const web = o.origen === 'web';
  const mp = o.metodoPago?.nombre;
  return (
    <div className="card">
      <div className="r"><h3>#{o.id}</h3><span className="bd">{web ? '🌐 Compra web' : o.estado}</span></div>
      <p><b>{o.destino}</b>{o.cliente ? ' · ' + o.cliente : ''} · {pesos(o.total)}</p>
      <p className="sm">{o.items.map(c => c.nombre + ' (' + c.variante + ')').join(', ')}</p>
      <p className="sm">{o.telefono ? '📞 ' + o.telefono + ' · ' : ''}{web ? 'Estado: ' + o.estado + (mp ? ' · pagará: ' + mp : '') : ''}</p>
      <EtiquetasPedido o={o} />
      <div className="row" style={{ marginTop: '.7rem' }}>
        {o.pagoEstado === 'pagado'
          ? <span className="bd">Pagado ✓ {mp}</span>
          : o.estado === 'listo' || o.estado === 'entregado'
            ? <button className="btn s" onClick={() => onCobrar(o)}>Confirmar pago</button>
            : web ? <span className="bd">En cocina…</span> : <span className="bd">En deuda</span>}
        {o.estado === 'nuevo' && !web && <button className="btn s y" onClick={() => onEditar(o)}>Editar</button>}
        {o.estado === 'listo' && <button className="btn s y" onClick={() => onEntregado(o)}>Ya lo entregué</button>}
        {o.estado !== 'cancelado' && <button className="btn s y" onClick={() => onTirilla(o)}>Tirilla</button>}
      </div>
    </div>
  );
}

/** @param {{ pedidos:any[], meseraId:number } & Acciones} p */
export function Historial({ pedidos, meseraId, ...acc }) {
  const { listos, web, mios } = historial(pedidos, meseraId);
  return (
    <>
      {listos.map(o => (
        <div className="card" key={o.id} style={{ background: 'var(--a2)', color: '#1c120a', marginBottom: '1rem' }}>
          <h3>✅ #{o.id} listo para {o.destino}{o.origen === 'web' ? ' · COMPRA WEB' : ''}</h3>
        </div>
      ))}
      <h2 style={{ margin: '1rem 0' }}>Compras web</h2>
      <div className="grid">
        {web.length ? web.map(o => <PedidoCard key={o.id} o={o} {...acc} />) : <div className="card">No hay compras web.</div>}
      </div>
      <h2 style={{ margin: '1.5rem 0 1rem' }}>Mis pedidos</h2>
      <div className="grid">
        {mios.length ? mios.map(o => <PedidoCard key={o.id} o={o} {...acc} />) : <div className="card">Aún no has enviado pedidos.</div>}
      </div>
    </>
  );
}

const PASOS = ['Recibido', 'Preparando', 'Listo', 'Entregado'];

/** Tirilla del pedido con envío por WhatsApp. @param {{ o:any, config:any, pagos:any[], onCerrar:()=>void }} p */
export function Recibo({ o, config, pagos, onCerrar }) {
  const pm = pagos.find(x => x.codigo === o.metodoPago?.codigo);
  const si = Math.max(0, ['nuevo', 'preparando', 'listo', 'entregado'].indexOf(o.estado));
  const mp = o.metodoPago?.nombre;
  return (
    <Modal etiqueta={'Tirilla del pedido #' + o.id}>
      <div className="rc">
        <div className="rh">
          <img className="lg2" style={{ height: 72 }} src={config.logo || '/assets/logo.png'} alt="" />
          <h3>{config.n}</h3>
          <small>Güepsa, Santander · {config.tel}</small>
        </div>
        <p className="r"><b>PEDIDO #{o.id}</b><small>{fechaHora(o.creadoEn)}</small></p>
        <p>{o.destino}{o.cliente ? ' · ' + o.cliente : ''}{o.telefono ? <><br />📞 {o.telefono}</> : null}</p>
        <hr />
        {o.items.map((c, i) => (
          <p className="r" key={c.id ?? i}>
            <span>{c.emoji} {c.nombre} <small>({c.variante})</small><DetalleItem c={c} salsas="+ " nota={false} /></span>
            <span>{pesos(c.precioUnitario)}</span>
          </p>
        ))}
        <hr />
        <p className="r" style={{ fontSize: '1.4rem' }}><b>TOTAL</b><b>{pesos(o.total)}</b></p>
        <p className="sm">{o.pagoEstado === 'pagado' ? '✅ Pagado con ' + mp : '⏳ Pago pendiente' + (mp ? ' · ' + mp : '')}</p>
        {pm?.numero && o.pagoEstado !== 'pagado' ? <p className="sm">Transfiere a {pm.nombre}: <b>{pm.numero}</b></p> : null}
        <div className="stp">{PASOS.map((s, i) => <b key={s} className={i <= si ? 'on' : ''}>{i <= si ? '●' : '○'} {s}</b>)}</div>
        <hr />
        <p style={{ textAlign: 'center' }}><b>{config.w4} 💛</b><br /><small>{config.w2}</small></p>
        <div className="row no" style={{ marginTop: '.8rem' }}>
          <button className="btn s" onClick={() => window.print()}>🖨️ Imprimir</button>
          <a className="btn s wa" target="_blank" rel="noopener noreferrer" href={waLink(o, config)}><WaIcon /> Enviar al WhatsApp</a>
          <button className="btn s y" onClick={onCerrar}>Cerrar</button>
        </div>
      </div>
    </Modal>
  );
}
