// Pre-ticket y confirmación del pedido de la mesera (ticket() y conf() de la app original).
import { opcionesDestino, totalCarrito } from './carrito.js';
import { DetalleItem, Modal, Total } from './componentes.jsx';
import { pesos } from './formato.js';

/**
 * @typedef {import('./carrito.js').ItemCarrito} ItemCarrito
 * @typedef {{ destino:string, cliente:string, direccion:string, telefono:string }} Datos
 */

/**
 * @param {{ cart:ItemCarrito[], datos:Datos, mesas:number, edit:number, onDatos:(d:Datos)=>void,
 *   onQuitar:(i:number)=>void, onEnviar:()=>void, onCancelarEdicion:()=>void }} p
 */
export function Ticket({ cart, datos, mesas, edit, onDatos, onQuitar, onEnviar, onCancelarEdicion }) {
  const ops = opcionesDestino(mesas);
  const d = ops.includes(datos.destino) ? datos.destino : '';
  const campo = k => e => onDatos({ ...datos, [k]: e.target.value });
  return (
    <aside className="tk">
      <h3>{edit ? 'Editando #' + edit : 'PRE-TICKET'}</h3>
      <hr />
      {cart.length ? cart.map((c, i) => (
        <p className="r" key={i}>
          <span>{c.emoji} {c.nombre} <small>({c.variante})</small><DetalleItem c={c} /></span>
          <span>{pesos(c.precio)} <button className="x" aria-label="Quitar" onClick={() => onQuitar(i)}>✕</button></span>
        </p>
      )) : <p className="sm">Elige un plato del menú para empezar tu pedido.</p>}
      <hr />
      <Total valor={totalCarrito(cart)} />
      <label>Destino<select value={d} onChange={e => onDatos({ destino: e.target.value, cliente: '', direccion: '', telefono: '' })}>
        <option value="" disabled>Elige la mesa o domicilio…</option>
        {ops.map(o => <option key={o}>{o}</option>)}
      </select></label>
      {d === 'Domicilio' && <>
        <label>Nombre<input value={datos.cliente} onChange={campo('cliente')} /></label>
        <label>Dirección<input value={datos.direccion} onChange={campo('direccion')} /></label>
        <label>Teléfono (opcional)<input type="tel" inputMode="tel" value={datos.telefono} onChange={campo('telefono')} placeholder="Para avisarte cuando esté listo" /></label>
      </>}
      <button className="btn" style={{ width: '100%', marginTop: '.8rem' }} onClick={onEnviar}>{edit ? 'Guardar cambios' : 'Enviar pedido'}</button>
      {edit ? <button className="btn y s" style={{ marginTop: '.5rem' }} onClick={onCancelarEdicion}>Cancelar edición</button> : null}
    </aside>
  );
}

/** @param {{ cart:ItemCarrito[], datos:Datos, enviando:boolean, onConfirmar:()=>void, onVolver:()=>void }} p */
export function Confirmar({ cart, datos, enviando, onConfirmar, onVolver }) {
  return (
    <Modal etiqueta="Confirmar pedido">
      <div className="card" style={{ maxWidth: 430, width: '92%', maxHeight: '92vh', overflow: 'auto' }}>
        <h2>¿Confirmas el pedido?</h2>
        <p className="sm" style={{ margin: '.4rem 0' }}>Revisa que todo esté bien antes de enviarlo a cocina.</p>
        <hr />
        {cart.map((c, i) => (
          <p className="r" key={i}><span>{c.emoji} <b>{c.nombre}</b> ({c.variante})<DetalleItem c={c} /></span><b>{pesos(c.precio)}</b></p>
        ))}
        <hr />
        <Total valor={totalCarrito(cart)} style={{ fontSize: '1.3rem' }} />
        <p className="sm" style={{ margin: '.5rem 0' }}>
          {datos.destino}{datos.cliente ? ' · ' + datos.cliente : ''}{datos.direccion ? ' · ' + datos.direccion : ''}{datos.telefono ? ' · 📞 ' + datos.telefono : ''}
        </p>
        <div className="row">
          <button className="btn" disabled={enviando} onClick={onConfirmar}>✅ Confirmar y enviar</button>
          <button className="btn y" onClick={onVolver}>Volver a revisar</button>
        </div>
      </div>
    </Modal>
  );
}
