// Ventana para elegir tamaño, extras, quitar ingredientes, salsas y nota (pick() + addM() originales).
// Uso: <PersonalizarPlato plato={p} onAgregar={item => ...} onCerrar={() => ...} />  (item = crearItem(...))
import { useState } from 'react';
import Modal from './Modal.jsx';
import { pesos } from '../cliente/formato.js';
import { alternarExtra, crearItem, esBebida } from '../cliente/carrito.js';

/**
 * @param {{ plato: import('../cliente/carrito.js').Plato,
 *   onAgregar: (item: import('../cliente/carrito.js').ItemCarrito) => void, onCerrar: () => void }} p
 */
export default function PersonalizarPlato({ plato: p, onAgregar, onCerrar }) {
  const b = esBebida(p.categoria);
  const [varianteId, setVariante] = useState(p.variantes[0]?.id);
  const [extras, setExtras] = useState(/** @type {number[]} */ ([]));
  const [sin, setSin] = useState(/** @type {string[]} */ ([]));
  const [salsas, setSalsas] = useState(() => [...(p.salsas || [])]);
  const [nota, setNota] = useState('');
  const alterna = (lista, set, k) => set(lista.includes(k) ? lista.filter(x => x !== k) : [...lista, k]);
  const agregar = conTodo => onAgregar(crearItem(p, { varianteId, extras, sin, salsas, nota, conTodo }));

  return (
    <Modal>
      <div className="card" style={{ maxWidth: 440, width: '92%', maxHeight: '92vh', overflow: 'auto' }}>
        {p.imagenUrl && <img className="pim" style={{ height: 200 }} src={p.imagenUrl} alt={p.nombre} />}
        <h2>{p.emoji} {p.nombre}</h2>
        <label>Tamaño / tipo</label>
        <div className="row">
          {p.variantes.map(v => (
            <button key={v.id} className={'chip vr' + (v.id === varianteId ? ' on' : '')} aria-pressed={v.id === varianteId}
              onClick={() => setVariante(v.id)}>{v.nombre} · {v.precioPromo != null ? <><s>{pesos(v.precio)}</s> {pesos(v.precioPromo)}</> : pesos(v.precio)}</button>
          ))}
        </div>
        {p.extras?.length > 0 && <>
          <label>Extras <small>(con costo adicional)</small></label>
          <div className="row">
            {p.extras.map(x => (
              <button key={x.id} className={'chip px' + (extras.includes(x.id) ? ' on' : '')} aria-pressed={extras.includes(x.id)}
                data-g={x.grupo || ''} onClick={() => setExtras(s => alternarExtra(s, x.id, p.extras))}>{x.nombre} · +{pesos(x.precio)}</button>
            ))}
          </div>
        </>}
        {!b && <>
          <label>Toca lo que quieras quitar (no cuesta nada)</label>
          <div className="row">
            {p.ingredientes.map(k => (
              <button key={k} className={'chip ig' + (sin.includes(k) ? ' off' : '')} aria-pressed={!sin.includes(k)}
                onClick={() => alterna(sin, setSin, k)}>{k}</button>
            ))}
          </div>
        </>}
        {!b && p.salsas?.length > 0 && <>
          <label>Salsas <small>(las de este plato ya vienen encendidas)</small></label>
          <div className="row">
            {p.salsas.map(k => (
              <button key={k} className={'chip sa' + (salsas.includes(k) ? ' on' : '')} aria-pressed={salsas.includes(k)}
                onClick={() => alterna(salsas, setSalsas, k)}>{k}</button>
            ))}
          </div>
        </>}
        <input id="nt" placeholder="Nota (ej: bien asada)" style={{ marginTop: '.8rem' }} value={nota} onChange={e => setNota(e.target.value)} />
        <div className="row" style={{ marginTop: '.8rem' }}>
          <button className="btn" onClick={() => agregar(false)}>Agregar</button>
          {!b && <button className="btn y" onClick={() => agregar(true)}>Pedir con todo</button>}
          <button className="btn s" onClick={onCerrar}>Cerrar</button>
        </div>
      </div>
    </Modal>
  );
}
