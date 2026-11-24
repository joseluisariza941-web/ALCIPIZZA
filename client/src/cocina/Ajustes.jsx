import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { logoDe, usePublicConfig } from '../components/ConfigContext.jsx';
import { useCarga } from './hooks.js';
import { diaApi } from './util.js';
import { fijarHora, mesasValidas, metodoBody } from './ajustes.js';
import { leerImagen } from './imagen.js';
import { toast, toastError } from './toast.js';

const TEXTOS = [['n', 'Nombre del negocio'], ['w1', 'Título principal'], ['w2', 'Subtítulo'], ['w3', 'Mensaje destacado'], ['w4', 'Sello (Todo a tu gusto)']];

/** Fila de un método de pago (checkbox + número; efectivo sin número). */
function Metodo({ m, onCambio }) {
  return (
    <div className="fg">
      <label style={{ margin: 0, minWidth: 140 }}>
        <input type="checkbox" style={{ width: 'auto' }} checked={!!m.activo} onChange={e => onCambio(m, { activo: e.target.checked })} /> {m.nombre}
      </label>
      {m.codigo !== 'ef' && (
        <input key={m.numero} defaultValue={m.numero || ''} placeholder="Número de cuenta/celular"
          onBlur={e => e.target.value !== (m.numero || '') && onCambio(m, { numero: e.target.value.trim() })} />
      )}
    </div>
  );
}

/** Pestaña Ajustes (ka original). */
export default function Ajustes() {
  const pub = usePublicConfig();
  const cfg = useCarga('/api/config', /** @type {any} */ (null));
  const mp = useCarga('/api/metodos-pago', /** @type {any[]} */ ([]));
  const [f, setF] = useState(/** @type {any} */ (null));
  useEffect(() => { if (cfg.data) setF(cfg.data); }, [cfg.data]);
  if (!f) return <h2>Ajustes</h2>;

  const campo = (k, v) => setF({ ...f, [k]: v });
  const refrescar = () => { cfg.recargar(); pub.recargar?.(); };

  async function guardar() {
    const { logo, bg, ...resto } = f;
    try {
      await api.put('/api/config', { ...resto, mesas: mesasValidas(f.mesas) });
      toast('✅ Cambios guardados');
      refrescar();
    } catch (e) { toastError(e); }
  }

  async function imagen(k, valor, aviso) {
    try { await api.put('/api/config', { [k]: valor }); if (aviso) toast(aviso); refrescar(); } catch (e) { toastError(e); }
  }
  async function subir(e, k, max, tipo, aviso) {
    const file = e.target.files?.[0];
    if (!file) return;
    try { await imagen(k, await leerImagen(file, max, tipo, 0.8), aviso); } catch (err) { toastError(err); }
  }

  async function cambiarMetodo(m, cambio) {
    try { await api.put(`/api/metodos-pago/${m.codigo}`, metodoBody(m, cambio)); } catch (e) { toastError(e); }
    mp.recargar(); pub.recargar?.();
  }

  return (
    <>
      <h2>Ajustes</h2>
      <div className="card" style={{ margin: '1rem 0' }}>
        <h3>Nombre y mensajes</h3>
        {TEXTOS.map(([k, l]) => <label key={k}>{l}<input value={f[k] ?? ''} onChange={e => campo(k, e.target.value)} /></label>)}
      </div>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3>Contacto</h3>
        <label>Teléfono y WhatsApp<input value={f.tel ?? ''} onChange={e => campo('tel', e.target.value)} /></label>
      </div>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3>Logo del local</h3>
        <div className="r" style={{ justifyContent: 'flex-start', gap: '1rem', marginTop: '.6rem' }}>
          <img className="lg2" src={logoDe(cfg.data)} alt="Logo actual" />
          <div>
            <input type="file" accept="image/*" aria-label="Subir logo" onChange={e => subir(e, 'logo', 320, 'image/png', 'Logo actualizado')} />
            <button className="btn s y" style={{ marginTop: '.5rem' }} onClick={() => imagen('logo', '')}>Usar el logo original</button>
          </div>
        </div>
      </div>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3>Fondo de pantalla</h3>
        <p className="sm">Se muestra detrás de toda la página. Mejor una imagen horizontal.</p>
        <input type="file" accept="image/*" aria-label="Subir fondo" style={{ margin: '.6rem 0' }} onChange={e => subir(e, 'bg', 1600, 'image/jpeg', 'Fondo actualizado')} />
        <button className="btn s y" onClick={() => imagen('bg', '')}>Quitar fondo</button>
      </div>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3>Horarios</h3>
        <p className="sm">Hora de abrir y cerrar (0-24). Deja vacío para cerrado.</p>
        {f.h.map((x, i) => (
          <div className="fg" key={i}>
            <b style={{ width: '6rem' }}>{diaApi(i)}</b>
            <input type="number" step=".5" aria-label="Abre" value={x?.[0] ?? ''} onChange={e => campo('h', fijarHora(f.h, i, 0, e.target.value))} />
            <input type="number" step=".5" aria-label="Cierra" value={x?.[1] ?? ''} onChange={e => campo('h', fijarHora(f.h, i, 1, e.target.value))} />
          </div>
        ))}
      </div>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3>Métodos de pago</h3>
        {mp.data.map(m => <Metodo key={m.codigo} m={m} onCambio={cambiarMetodo} />)}
      </div>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3>Mesas</h3>
        <label>Cantidad de mesas<input type="number" min={1} value={f.mesas ?? ''} onChange={e => campo('mesas', e.target.value)} /></label>
      </div>
      <div className="svb"><button className="btn" onClick={guardar}>💾 Guardar cambios</button></div>
    </>
  );
}
