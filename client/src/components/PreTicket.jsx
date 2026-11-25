// Pre-ticket del cliente web (ticket() original): carrito, destino, pago y botón de envío.
import { useState } from 'react';
import DetalleItem from './DetalleItem.jsx';
import { toast } from './toast.jsx';
import { api } from '../api.js';
import { pesos } from '../cliente/formato.js';
import { DESTINOS, celularValido, normalizarCelular, pideDireccion, pideMesa, pideTelefono, totalCarrito } from '../cliente/carrito.js';

/**
 * Formulario vacío para un destino (chd original: conserva el método de pago).
 * @param {string} destino @param {string} [metodoPago] @returns {import('../cliente/carrito.js').FormPedido}
 */
export const formVacio = (destino = DESTINOS[0], metodoPago = '') =>
  ({ destino, mesa: '', cliente: '', direccion: '', telefono: '', metodoPago, celular: '' });

/**
 * @param {{ items: import('../cliente/carrito.js').ItemCarrito[], onQuitar: (i:number) => void,
 *   form: import('../cliente/carrito.js').FormPedido, onForm: (f: import('../cliente/carrito.js').FormPedido) => void,
 *   pagos: import('./ConfigContext.jsx').MetodoPago[], mesas: number, onEnviar: () => void, enviando?: boolean,
 *   domiciliosActivos?: boolean, puntos?: import('./ConfigContext.jsx').PuntosPublicos|null,
 *   cotizacion?: { subtotal:number, descuentoPromo:number, promocion:{id:number,nombre:string}|null, total:number }|null }} p
 */
export default function PreTicket({
  items, onQuitar, form: f, onForm, pagos, mesas, onEnviar, enviando = false,
  domiciliosActivos = true, puntos = null, cotizacion = null,
}) {
  const campo = k => e => onForm({ ...f, [k]: e.target.value });
  const cu = pagos.find(x => x.codigo === f.metodoPago);
  const destinos = domiciliosActivos ? DESTINOS : DESTINOS.filter(d => d !== 'Domicilio');
  const [saldo, setSaldo] = useState(/** @type {any} */ (null));
  const [consultando, setConsultando] = useState(false);
  const total = cotizacion ? cotizacion.total : totalCarrito(items);

  const consultarPuntos = async () => {
    if (!celularValido(f.celular)) return toast('Escribe un celular válido (10 dígitos que empiezan por 3)');
    setConsultando(true);
    try {
      setSaldo(await api.get(`/api/public/puntos/${normalizarCelular(f.celular)}`));
    } catch (e) {
      toast(e.message);
      setSaldo(null);
    } finally {
      setConsultando(false);
    }
  };

  return (
    <aside className="tk">
      <h3>PRE-TICKET</h3><hr />
      {items.length ? items.map((c, i) => (
        <p className="r" key={i}>
          <span>{c.emoji} {c.nombre} <small>({c.variante})</small>
            <DetalleItem sin={c.sin} extras={c.extrasNombres} salsas={c.salsas} nota={c.nota} /></span>
          <span>{pesos(c.precio)} <button className="x" aria-label="Quitar" onClick={() => onQuitar(i)}>✕</button></span>
        </p>
      )) : <p className="sm">Elige un plato del menú para empezar tu pedido.</p>}
      <hr />
      {cotizacion && (
        <>
          <p className="r"><span>Subtotal</span><span>{pesos(cotizacion.subtotal)}</span></p>
          {cotizacion.descuentoPromo > 0 && (
            <p className="r"><span>Descuento promoción</span><span>-{pesos(cotizacion.descuentoPromo)}</span></p>
          )}
        </>
      )}
      <p className="r"><b>Total</b><b>{pesos(total)}</b></p>
      <label>Destino<select value={f.destino} onChange={e => onForm({ ...formVacio(e.target.value, f.metodoPago), celular: f.celular })}>
        {destinos.map(o => <option key={o}>{o}</option>)}
      </select></label>
      {!domiciliosActivos && <p className="sm">Por ahora no tenemos domicilios.</p>}
      {pideMesa(f.destino) && <label>Tu mesa<select value={f.mesa} onChange={campo('mesa')}>
        <option value="">Elige tu mesa…</option>
        {Array.from({ length: mesas }, (_, i) => <option key={i} value={String(i + 1)}>Mesa {i + 1}</option>)}
      </select></label>}
      <label>Nombre<input value={f.cliente} onChange={campo('cliente')} /></label>
      {pideDireccion(f.destino) && <label>Dirección<input value={f.direccion} onChange={campo('direccion')} /></label>}
      {pideTelefono(f.destino) && <label>Teléfono<input type="tel" inputMode="tel" value={f.telefono} onChange={campo('telefono')}
        placeholder="Para avisarte cuando esté listo" /></label>}
      <label>Celular para acumular puntos<input type="tel" inputMode="numeric" maxLength={10} value={f.celular || ''}
        onChange={e => { setSaldo(null); onForm({ ...f, celular: e.target.value }); }} placeholder="Opcional" /></label>
      {puntos?.activo && (
        <>
          <button className="btn s" type="button" disabled={consultando} onClick={consultarPuntos}>Consultar mis puntos</button>
          {saldo && <p className="sm">Tienes {saldo.saldo} puntos. Canjéalos al pagar en caja: cada {saldo.puntosCanje} puntos = {pesos(saldo.descuentoCanje)} de descuento</p>}
        </>
      )}
      <label>¿Cómo pagarás?<select value={f.metodoPago} onChange={campo('metodoPago')}>
        {pagos.map(x => <option key={x.codigo} value={x.codigo}>{x.nombre}</option>)}
      </select></label>
      {cu?.numero && <p className="sm">Transfiere a {cu.nombre}: <b>{cu.numero}</b></p>}
      {cu?.qrUrl && <p className="sm"><img src={cu.qrUrl} alt={`QR de pago ${cu.nombre}`} style={{ width: 160, maxWidth: '100%', display: 'block', marginTop: '.4rem' }} /></p>}
      <p className="sm">La mesera cobra al entregarte el pedido.</p>
      <button className="btn" style={{ width: '100%', marginTop: '.8rem' }} disabled={enviando} onClick={onEnviar}>Enviar pedido</button>
    </aside>
  );
}
