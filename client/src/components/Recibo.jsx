// Tirilla / recibo de un pedido (recibo() original), en ventana .md para que imprima solo ella.
// Uso: <Recibo pedido={o} onCerrar={() => ...} />  (o = Pedido de la API). Debe ir dentro de <Shell>.
import Modal from './Modal.jsx';
import DetalleItem from './DetalleItem.jsx';
import IconoWhatsApp from './IconoWhatsApp.jsx';
import { logoDe, usePublicConfig } from './ConfigContext.jsx';
import { fechaCorta, pesos, precioItem } from '../cliente/formato.js';
import { waLink } from '../cliente/whatsapp.js';
import { descargarPdf, pdfRecibo } from '../cliente/pdf.js';

const PASOS = ['Recibido', 'Preparando', 'Listo', 'Entregado'];
const ESTADOS = ['nuevo', 'preparando', 'listo', 'entregado'];

/** @param {{ pedido: any, onCerrar: () => void, conWhatsApp?: boolean, onCancelar?: () => void, onEditar?: () => void, cancelando?: boolean }} p  conWhatsApp: solo para el personal (el cliente no envía el pedido por WhatsApp). onCancelar/onEditar: solo la tirilla del cliente. */
export default function Recibo({ pedido: o, onCerrar, conWhatsApp = false, onCancelar, onEditar, cancelando = false }) {
  const { config: c, pagos } = usePublicConfig();
  const mp = o.metodoPago?.nombre || '';
  const pm = pagos.find(x => x.codigo === o.metodoPago?.codigo);
  const pagado = o.pagoEstado === 'pagado';
  const si = Math.max(0, ESTADOS.indexOf(o.estado));
  return (
    <Modal>
      <div className="rc">
        <div className="rh"><img className="lg2" style={{ height: 72 }} src={logoDe(c)} alt="" /><h3>{c.n}</h3><small>Güepsa, Santander · {c.tel}</small></div>
        <p className="r"><b>PEDIDO #{o.id}</b><small>{fechaCorta(o.creadoEn)}</small></p>
        <p>{o.destino}{o.mesa ? ' · Mesa ' + o.mesa : ''}{o.cliente ? ' · ' + o.cliente : ''}{o.telefono && <><br />📞 {o.telefono}</>}</p>
        <hr />
        {o.items.map((it, i) => (
          <p className="r" key={it.id ?? i}>
            <span>{it.emoji} {it.nombre} <small>({it.variante})</small>
              <DetalleItem sin={it.sin} extras={(it.extras || []).map(e => e.nombre)} salsas={it.salsas} prefijoSalsas="+ " mostrarNota={false} /></span>
            <span>{pesos(precioItem(it))}</span>
          </p>
        ))}
        <hr />
        <p className="r" style={{ fontSize: '1.4rem' }}><b>TOTAL</b><b>{pesos(o.total)}</b></p>
        <p className="sm">{pagado ? '✅ Pagado con ' + mp : '⏳ Pago pendiente' + (mp ? ' · ' + mp : '')}</p>
        {pm?.numero && !pagado && <p className="sm">Transfiere a {pm.nombre}: <b>{pm.numero}</b></p>}
        {pm?.qrUrl && !pagado && <p className="sm"><img src={pm.qrUrl} alt={`QR de pago ${pm.nombre}`} style={{ width: 160, maxWidth: '100%', display: 'block', margin: '.3rem auto' }} /></p>}
        {o.puntosGanados > 0 && <p className="sm">Ganaste {o.puntosGanados} puntos</p>}
        {o.estado === 'cancelado'
          ? <p className="sm">❌ Pedido cancelado</p>
          : <div className="stp">{PASOS.map((s, i) => <b key={s} className={i <= si ? 'on' : ''}>{i <= si ? '●' : '○'} {s}</b>)}</div>}
        <hr />
        <p style={{ textAlign: 'center' }}><b>{c.w4} 💛</b><br /><small>{c.w2}</small></p>
        <div className="row no" style={{ marginTop: '.8rem' }}>
          <button className="btn s" onClick={() => window.print()}>🖨️ Imprimir</button>
          <button className="btn s" onClick={() => descargarPdf(pdfRecibo(o, c), `pedido-${o.id}.pdf`)}>⬇️ Descargar PDF</button>
          {conWhatsApp && <a className="btn s wa" target="_blank" rel="noopener noreferrer" href={waLink(o, c)}><IconoWhatsApp /> Enviar al WhatsApp</a>}
          <button className="btn s y" onClick={onCerrar}>Cerrar</button>
        </div>
        {o.estado === 'nuevo' && (onCancelar || onEditar) && (
          <div className="row no" style={{ marginTop: '.4rem' }}>
            {onCancelar && <button className="btn s" disabled={cancelando} onClick={onCancelar}>Cancelar pedido</button>}
            {onEditar && !pagado && <button className="btn s y" onClick={onEditar}>Editar pedido</button>}
          </div>
        )}
      </div>
    </Modal>
  );
}
