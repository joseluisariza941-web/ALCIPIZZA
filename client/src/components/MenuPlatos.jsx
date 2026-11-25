// Menú por categorías (menu() original). Reutilizable por la mesera: <MenuPlatos platos={...} onElegir={p => ...} />
import { useState } from 'react';
import { pesos } from '../cliente/formato.js';
import { esBebida } from '../cliente/carrito.js';

/**
 * @param {{ platos: import('../cliente/carrito.js').Plato[], onElegir: (p: import('../cliente/carrito.js').Plato) => void }} p
 */
export default function MenuPlatos({ platos, onElegir }) {
  const [cat, setCat] = useState('Todo');
  const cats = ['Todo', ...new Set(platos.map(p => p.categoria))];
  const lista = platos.filter(p => cat === 'Todo' || p.categoria === cat);
  return (
    <>
      <div className="row" style={{ marginBottom: '1rem' }}>
        {cats.map(c => <button key={c} className={'chip ct' + (c === cat ? ' on' : '')} onClick={() => setCat(c)}>{c}</button>)}
      </div>
      <div className="grid">
        {lista.length ? lista.map(p => {
          const b = esBebida(p.categoria);
          return (
            <div className="card" key={p.id}>
              {p.imagenUrl ? <img className="pim" src={p.imagenUrl} alt={p.nombre} /> : <div className="em">{p.emoji}</div>}
              <h3>{p.nombre}</h3>
              {p.promocion && <span className="bd on">{p.promocion.nombre}</span>}
              <div className="pills">{p.variantes.map(v => (
                <span key={v.id} className="pl">{v.nombre}
                  {v.precioPromo != null && <> · <s>{pesos(v.precio)}</s> <b>{pesos(v.precioPromo)}</b></>}
                </span>
              ))}</div>
              {!b && <><p className="lv">Lleva</p><div className="pills">{p.ingredientes.map(k => <span key={k} className="pl ig2">{k}</span>)}</div></>}
              {!b && p.salsas?.length > 0 && <><p className="lv">Salsas</p><div className="pills">{p.salsas.map(k => <span key={k} className="pl">{k}</span>)}</div></>}
              <p className="pr">desde {pesos(Math.min(...p.variantes.map(v => v.precioPromo ?? v.precio)))}</p>
              <button className="btn s" onClick={() => onElegir(p)}>Elegir y personalizar</button>
            </div>
          );
        }) : <div className="card">No hay platos en esta categoría.</div>}
      </div>
    </>
  );
}
