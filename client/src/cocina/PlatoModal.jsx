import { useState } from 'react';
import { api } from '../api.js';
import { isBebida, money } from './util.js';
import SelectUnidad from './SelectUnidad.jsx';
import { platoAForm, validarPlato } from './platos.js';
import { leerImagen } from './imagen.js';
import { aviso, exito, toastError } from './toast.js';

/**
 * Formulario de plato nuevo o existente (editP / saveP originales).
 * @param {{ plato: any|null, platos: any[], extras: any[], insumos: any[], onCerrar: () => void, onGuardado: () => void }} p
 */
export default function PlatoModal({ plato, platos, extras, insumos, onCerrar, onGuardado }) {
  const [f, setF] = useState(() => platoAForm(plato));
  const beb = isBebida(f.categoria);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const fila = (k, i, campo, v) => setF(s => ({ ...s, [k]: s[k].map((r, j) => (j === i ? { ...r, [campo]: v } : r)) }));
  const quitar = (k, i) => setF(s => ({ ...s, [k]: s[k].filter((_, j) => j !== i) }));
  const alternar = (k, v) => setF(s => ({ ...s, [k]: s[k].includes(v) ? s[k].filter(x => x !== v) : [...s[k], v] }));
  const noSalsas = insumos.filter(x => x.tipo !== 'salsa');
  const bebOpc = noSalsas.filter(x => x.unidad === 'und' || x.nombre === f.bebidaInsumo);

  async function foto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try { set('imagenUrl', await leerImagen(file, 520, 'image/jpeg', 0.78)); } catch (err) { toastError(err); }
  }

  async function guardar() {
    const r = validarPlato(f, insumos);
    if ('error' in r) return aviso(r.error);
    try {
      if (plato) await api.put(`/api/admin/platos/${plato.id}`, r.body);
      else await api.post('/api/admin/platos', r.body);
      exito(plato ? 'Plato actualizado' : 'Plato creado');
      onGuardado();
    } catch (err) { toastError(err); }
  }

  return (
    <div className="md">
      <div className="card" style={{ maxWidth: 520, width: '92%', maxHeight: '92vh', overflow: 'auto' }}>
        <h2>{plato ? 'Editar' : 'Nuevo'} plato</h2>
        <label>Nombre<input value={f.nombre} onChange={e => set('nombre', e.target.value)} /></label>
        <div className="fg">
          <input value={f.emoji} style={{ maxWidth: 90 }} aria-label="Emoji" onChange={e => set('emoji', e.target.value)} />
          <input list="cl" value={f.categoria} placeholder="Categoría" onChange={e => set('categoria', e.target.value)} />
          <datalist id="cl">{[...new Set(platos.map(x => x.categoria))].map(c => <option key={c}>{c}</option>)}</datalist>
        </div>

        <label>Tamaños y precios <small>(consumo: 1 = normal, 0.5 = mitad)</small></label>
        <div id="vl">
          {f.variantes.map((v, i) => (
            <div className="fg vrow" key={i}>
              <input placeholder="Tamaño (ej: Mediana)" value={v.nombre} onChange={e => fila('variantes', i, 'nombre', e.target.value)} />
              <input type="number" placeholder="Precio" value={v.precio} onChange={e => fila('variantes', i, 'precio', e.target.value)} />
              <input type="number" step=".05" placeholder="Consumo" value={v.multiplicador} title="Factor de consumo de ingredientes (1 = normal)" style={{ maxWidth: 90 }}
                onChange={e => fila('variantes', i, 'multiplicador', e.target.value)} />
              <button className="btn s" aria-label="Quitar" onClick={() => quitar('variantes', i)}>✕</button>
            </div>
          ))}
        </div>
        <button className="btn s y" style={{ marginTop: '.5rem' }} onClick={() => set('variantes', [...f.variantes, { nombre: '', precio: '', multiplicador: '1' }])}>+ Tamaño</button>

        {!beb && (
          <div id="isec">
            <label>¿Qué lleva? <small>(cantidad por unidad, en la unidad del insumo)</small></label>
            <datalist id="il">{noSalsas.map(x => <option key={x.id}>{x.nombre}</option>)}</datalist>
            <div id="ig">
              {f.ingredientes.map((g, i) => (
                <div className="fg irow" key={i}>
                  <input list="il" placeholder="Insumo" value={g.insumo} onChange={e => fila('ingredientes', i, 'insumo', e.target.value)} />
                  <input type="number" step="any" placeholder="Cantidad" value={g.cantidad} style={{ maxWidth: 110 }} onChange={e => fila('ingredientes', i, 'cantidad', e.target.value)} />
                  <SelectUnidad style={{ maxWidth: 90 }} value={g.unidad} onChange={e => fila('ingredientes', i, 'unidad', e.target.value)} />
                  <button className="btn s" aria-label="Quitar" onClick={() => quitar('ingredientes', i)}>✕</button>
                </div>
              ))}
            </div>
            <button className="btn s y" style={{ marginTop: '.5rem' }} onClick={() => set('ingredientes', [...f.ingredientes, { insumo: '', cantidad: '', unidad: 'g' }])}>+ Ingrediente</button>
          </div>
        )}
        {beb && (
          <div id="bsec">
            <label htmlFor="bi">Producto del inventario <small>(se descuenta 1 unidad por cada venta)</small></label>
            <select id="bi" value={f.bebidaInsumo} onChange={e => set('bebidaInsumo', e.target.value)}>
              <option value="">— Ninguno —</option>
              {bebOpc.map(x => <option key={x.id}>{x.nombre}</option>)}
            </select>
          </div>
        )}

        <label>Extras que se ofrecen en este plato</label>
        <div className="row" id="xl">
          {extras.length ? extras.map(x => (
            <button key={x.id} className={`chip px${f.extras.includes(x.id) ? ' on' : ''}`} onClick={() => alternar('extras', x.id)}>
              {x.nombre} · +{money(x.precio)}
            </button>
          )) : <span className="sm">Aún no hay extras (créalos en Comidas → Extras)</span>}
        </div>

        <label>Foto del plato o bebida <small>(se ve en el menú)</small></label>
        <div className="r" style={{ justifyContent: 'flex-start', gap: '1rem' }}>
          <div id="pvw">{f.imagenUrl ? <img className="pim2" src={f.imagenUrl} alt="" /> : <span className="sm">Sin foto</span>}</div>
          <div>
            <input type="file" accept="image/*" aria-label="Foto del plato o bebida" onChange={foto} />
            <button className="btn s y" style={{ marginTop: '.4rem' }} onClick={() => set('imagenUrl', '')}>Quitar foto</button>
          </div>
        </div>

        {!beb && (
          <div id="ssec">
            <label>Salsas que lleva <small>(vienen encendidas al pedir)</small></label>
            <div className="row" id="sl">
              {insumos.filter(x => x.tipo === 'salsa').map(x => (
                <button key={x.id} className={`chip sa${f.salsas.includes(x.nombre) ? ' on' : ''}`} onClick={() => alternar('salsas', x.nombre)}>{x.nombre}</button>
              ))}
            </div>
          </div>
        )}
        <div className="row" style={{ marginTop: '1rem' }}>
          <button className="btn" onClick={guardar}>Guardar</button>
          <button className="btn y" onClick={onCerrar}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}
