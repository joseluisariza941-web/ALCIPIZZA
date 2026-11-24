// Menú y personalización del plato para la mesera (menu() y pick() de la app original).
import { useState } from 'react';
import { esBebida, itemDesdeSeleccion } from './carrito.js';
import { Modal } from './componentes.jsx';
import { pesos } from './formato.js';

/** @typedef {import('./carrito.js').Plato} Plato */

/** @param {{ platos:Plato[], onElegir:(p:Plato)=>void }} p */
export function Menu({ platos, onElegir }) {
  const [cat, setCat] = useState('Todo');
  const cats = ['Todo', ...new Set(platos.map(p => p.categoria))];
  const vis = platos.filter(p => cat === 'Todo' || p.categoria === cat);
  return (
    <>
      <div className="row" style={{ marginBottom: '1rem' }}>
        {cats.map(c => <button key={c} className={'chip ct' + (c === cat ? ' on' : '')} onClick={() => setCat(c)}>{c}</button>)}
      </div>
      <div className="grid">
        {vis.map(p => (
          <div className="card" key={p.id}>
            {p.imagenUrl ? <img className="pim" src={p.imagenUrl} alt={p.nombre} /> : <div className="em">{p.emoji}</div>}
            <h3>{p.nombre}</h3>
            <div className="pills">{p.variantes.map(v => <span className="pl" key={v.id}>{v.nombre}</span>)}</div>
            {!esBebida(p) && <>
              <p className="lv">Lleva</p>
              <div className="pills">{p.ingredientes.map(k => <span className="pl ig2" key={k}>{k}</span>)}</div>
            </>}
            {p.salsas?.length && !esBebida(p) ? <>
              <p className="lv">Salsas</p>
              <div className="pills">{p.salsas.map(k => <span className="pl" key={k}>{k}</span>)}</div>
            </> : null}
            <p className="pr">desde {pesos(Math.min(...p.variantes.map(v => v.precio)))}</p>
            <button className="btn s" onClick={() => onElegir(p)}>Elegir y personalizar</button>
          </div>
        ))}
        {!vis.length && <div className="card">No hay platos en esta categoría.</div>}
      </div>
    </>
  );
}

const alternar = (lista, v) => lista.includes(v) ? lista.filter(x => x !== v) : [...lista, v];

/**
 * Modal de personalización. Los extras del mismo grupo son excluyentes (xtog() original).
 * @param {{ plato:Plato, onAgregar:(item:import('./carrito.js').ItemCarrito)=>void, onCerrar:()=>void }} p
 */
export function Personalizar({ plato: p, onAgregar, onCerrar }) {
  const b = esBebida(p);
  const [varianteId, setVariante] = useState(p.variantes[0]?.id);
  const [extras, setExtras] = useState(/** @type {number[]} */ ([]));
  const [sin, setSin] = useState(/** @type {string[]} */ ([]));
  const [salsas, setSalsas] = useState(/** @type {string[]} */ ([...(p.salsas || [])]));
  const [nota, setNota] = useState('');

  const tocarExtra = x => {
    if (extras.includes(x.id)) return setExtras(extras.filter(id => id !== x.id));
    const mismoGrupo = x.grupo ? p.extras.filter(e => e.grupo === x.grupo).map(e => e.id) : [];
    setExtras([...extras.filter(id => !mismoGrupo.includes(id)), x.id]);
  };
  const agregar = todo => onAgregar(itemDesdeSeleccion(p, { varianteId, extras, sin, salsas, nota }, todo));

  return (
    <Modal etiqueta={p.nombre}>
      <div className="card" style={{ maxWidth: 440, width: '92%', maxHeight: '92vh', overflow: 'auto' }}>
        {p.imagenUrl && <img className="pim" style={{ height: 200 }} src={p.imagenUrl} alt={p.nombre} />}
        <h2>{p.emoji} {p.nombre}</h2>
        <label>Tamaño / tipo</label>
        <div className="row">
          {p.variantes.map(v => (
            <button key={v.id} className={'chip vr' + (v.id === varianteId ? ' on' : '')} onClick={() => setVariante(v.id)}>{v.nombre} · {pesos(v.precio)}</button>
          ))}
        </div>
        {p.extras?.length ? <>
          <label>Extras <small>(con costo adicional)</small></label>
          <div className="row">
            {p.extras.map(x => (
              <button key={x.id} className={'chip px' + (extras.includes(x.id) ? ' on' : '')} data-g={x.grupo || ''} onClick={() => tocarExtra(x)}>{x.nombre} · +{pesos(x.precio)}</button>
            ))}
          </div>
        </> : null}
        {!b && <>
          <label>Toca lo que quieras quitar (no cuesta nada)</label>
          <div className="row">
            {p.ingredientes.map(k => <button key={k} className={'chip ig' + (sin.includes(k) ? ' off' : '')} onClick={() => setSin(alternar(sin, k))}>{k}</button>)}
          </div>
        </>}
        {p.salsas?.length && !b ? <>
          <label>Salsas <small>(las de este plato ya vienen encendidas)</small></label>
          <div className="row">
            {p.salsas.map(k => <button key={k} className={'chip sa' + (salsas.includes(k) ? ' on' : '')} onClick={() => setSalsas(alternar(salsas, k))}>{k}</button>)}
          </div>
        </> : null}
        <input placeholder="Nota (ej: bien asada)" style={{ marginTop: '.8rem' }} value={nota} onChange={e => setNota(e.target.value)} />
        <div className="row" style={{ marginTop: '.8rem' }}>
          <button className="btn" onClick={() => agregar(false)}>Agregar</button>
          {!b && <button className="btn y" onClick={() => agregar(true)}>Pedir con todo</button>}
          <button className="btn s" onClick={onCerrar}>Cerrar</button>
        </div>
      </div>
    </Modal>
  );
}
