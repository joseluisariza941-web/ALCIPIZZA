// Pre-ticket del cliente web (ticket() original): carrito, destino, pago y botón de envío.
import DetalleItem from './DetalleItem.jsx';
import { pesos } from '../cliente/formato.js';
import { DESTINOS, pideDireccion, pideMesa, pideTelefono, totalCarrito } from '../cliente/carrito.js';

/**
 * Formulario vacío para un destino (chd original: conserva el método de pago).
 * @param {string} destino @param {string} [metodoPago] @returns {import('../cliente/carrito.js').FormPedido}
 */
export const formVacio = (destino = DESTINOS[0], metodoPago = '') =>
  ({ destino, mesa: '', cliente: '', direccion: '', telefono: '', metodoPago });

/**
 * @param {{ items: import('../cliente/carrito.js').ItemCarrito[], onQuitar: (i:number) => void,
 *   form: import('../cliente/carrito.js').FormPedido, onForm: (f: import('../cliente/carrito.js').FormPedido) => void,
 *   pagos: import('./ConfigContext.jsx').MetodoPago[], mesas: number, onEnviar: () => void, enviando?: boolean }} p
 */
export default function PreTicket({ items, onQuitar, form: f, onForm, pagos, mesas, onEnviar, enviando = false }) {
  const campo = k => e => onForm({ ...f, [k]: e.target.value });
  const cu = pagos.find(x => x.codigo === f.metodoPago);
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
      <hr /><p className="r"><b>Total</b><b>{pesos(totalCarrito(items))}</b></p>
      <label>Destino<select value={f.destino} onChange={e => onForm(formVacio(e.target.value, f.metodoPago))}>
        {DESTINOS.map(o => <option key={o}>{o}</option>)}
      </select></label>
      {pideMesa(f.destino) && <label>Tu mesa<select value={f.mesa} onChange={campo('mesa')}>
        <option value="">Elige tu mesa…</option>
        {Array.from({ length: mesas }, (_, i) => <option key={i} value={String(i + 1)}>Mesa {i + 1}</option>)}
      </select></label>}
      <label>Nombre<input value={f.cliente} onChange={campo('cliente')} /></label>
      {pideDireccion(f.destino) && <label>Dirección<input value={f.direccion} onChange={campo('direccion')} /></label>}
      {pideTelefono(f.destino) && <label>Teléfono<input type="tel" inputMode="tel" value={f.telefono} onChange={campo('telefono')}
        placeholder="Para avisarte cuando esté listo" /></label>}
      <label>¿Cómo pagarás?<select value={f.metodoPago} onChange={campo('metodoPago')}>
        {pagos.map(x => <option key={x.codigo} value={x.codigo}>{x.nombre}</option>)}
      </select></label>
      {cu?.numero && <p className="sm">Transfiere a {cu.nombre}: <b>{cu.numero}</b></p>}
      <p className="sm">La mesera cobra al entregarte el pedido.</p>
      <button className="btn" style={{ width: '100%', marginTop: '.8rem' }} disabled={enviando} onClick={onEnviar}>Enviar pedido</button>
    </aside>
  );
}
