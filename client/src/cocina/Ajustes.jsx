import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { logoDe, usePublicConfig } from '../components/ConfigContext.jsx';
import Modal from '../components/Modal.jsx';
import { useCarga } from './hooks.js';
import { diaApi } from './util.js';
import { configBody, fijarHora, metodoBody, qrCabe } from './ajustes.js';
import { leerImagen } from './imagen.js';
import { SONIDOS, beep, fijarSonido } from './sonido.js';
import { exito, toastError } from './toast.js';

const TEXTOS = [['n', 'Nombre del negocio'], ['w1', 'Título principal'], ['w2', 'Subtítulo'], ['w3', 'Mensaje destacado'], ['w4', 'Sello (Todo a tu gusto)']];
const PELIGRO = { background: '#c4161c', color: '#fff' };

/** Fila de un método de pago (checkbox + número + QR; efectivo sin número). */
function Metodo({ m, onCambio, onQr, onEliminar }) {
  return (
    <div className="fg" style={{ flexWrap: 'wrap' }}>
      <label style={{ margin: 0, minWidth: 140 }}>
        <input type="checkbox" style={{ width: 'auto' }} checked={!!m.activo} onChange={e => onCambio(m, { activo: e.target.checked })} /> {m.nombre}
      </label>
      {m.codigo !== 'ef' && (
        <>
          <input key={m.numero} defaultValue={m.numero || ''} placeholder="Número de cuenta/celular"
            onBlur={e => e.target.value !== (m.numero || '') && onCambio(m, { numero: e.target.value.trim() })} />
          <div>
            {m.qrUrl && <img src={m.qrUrl} alt={`QR de ${m.nombre}`} style={{ width: 72, height: 72, objectFit: 'contain', display: 'block' }} />}
            <input type="file" accept="image/*" aria-label={`Subir QR de ${m.nombre}`} onChange={e => onQr(m, e)} />
            {m.qrUrl && <button className="btn s y" onClick={() => onCambio(m, { qrUrl: null })}>Quitar QR</button>}
          </div>
          <button className="btn s" onClick={() => onEliminar(m)}>Eliminar</button>
        </>
      )}
    </div>
  );
}

/** Aviso para reiniciar reportes: archiva el periodo actual sin borrar nada. */
function ReiniciarReportes({ onCerrar, onListo }) {
  const [txt, setTxt] = useState('');
  const [res, setRes] = useState(/** @type {any} */ (null));
  async function enviar() {
    try { setRes(await api.post('/api/admin/reiniciar-reportes', { confirmar: 'BORRAR' })); exito('Reportes reiniciados'); onListo?.(); } catch (e) { toastError(e); }
  }
  return (
    <Modal>
      <div className="card" role="dialog" aria-label="Reiniciar reportes">
        <h3>Reiniciar reportes</h3>
        {res ? (
          <>
            <p>✅ Reportes reiniciados. Se archivaron {res.pedidos} pedido(s), {res.compras} compra(s) y {res.bitacora} registro(s) de la bitácora.</p>
            <button className="btn s y" onClick={onCerrar}>Cerrar</button>
          </>
        ) : (
          <>
            <p className="sm">Se archivan y vuelven a empezar en cero: ventas por método de pago, historial de ventas, compras de insumos,
              ventas por plato, por día, facturas, inversión vs. ganancia, y los ingresos y acciones del personal.</p>
            <p><b>No se pierde nada:</b> todo queda en el histórico y lo ves con el filtro "Todo el histórico" o "Solo archivado" en Reporte.
              Los pedidos en curso no se tocan.</p>
            <label>Escribe BORRAR para confirmar<input value={txt} onChange={e => setTxt(e.target.value)} /></label>
            <div className="row" style={{ marginTop: '.8rem' }}>
              <button className="btn s y" onClick={onCerrar}>Cancelar</button>
              <button className="btn s" style={PELIGRO} disabled={txt !== 'BORRAR'} onClick={enviar}>Reiniciar reportes</button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

/** Pestaña Ajustes (ka original). */
export default function Ajustes() {
  const pub = usePublicConfig();
  const cfg = useCarga('/api/config', /** @type {any} */ (null));
  const [verEliminados, setVerEliminados] = useState(false);
  const [reiniciando, setReiniciando] = useState(false);
  const mp = useCarga(verEliminados ? '/api/metodos-pago?eliminados=1' : '/api/metodos-pago', /** @type {any[]} */ ([]));
  const [f, setF] = useState(/** @type {any} */ (null));
  useEffect(() => { if (cfg.data) setF(cfg.data); }, [cfg.data]);
  if (!f) return <h2>Ajustes</h2>;

  const campo = (k, v) => setF({ ...f, [k]: v });
  const refrescar = () => { cfg.recargar(); pub.recargar?.(); };

  async function guardar() {
    try {
      await api.put('/api/config', configBody(f));
      fijarSonido(f.sonido);
      exito('✅ Cambios guardados');
      refrescar();
    } catch (e) { toastError(e); }
  }

  async function imagen(k, valor, aviso) {
    try { await api.put('/api/config', { [k]: valor }); if (aviso) exito(aviso); refrescar(); } catch (e) { toastError(e); }
  }
  async function subir(e, k, max, tipo, aviso) {
    const file = e.target.files?.[0];
    if (!file) return;
    try { await imagen(k, await leerImagen(file, max, tipo, 0.8), aviso); } catch (err) { toastError(err); }
  }

  async function cambiarMetodo(m, cambio) {
    try { await api.put(`/api/metodos-pago/${m.codigo}`, metodoBody(m, cambio)); exito('Método de pago actualizado'); } catch (e) { toastError(e); }
    mp.recargar(); pub.recargar?.();
  }
  async function subirQr(m, e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const url = await leerImagen(file, 400, 'image/png', 0.9);
      if (!qrCabe(url)) throw new Error('La imagen del QR es muy pesada');
      await cambiarMetodo(m, { qrUrl: url });
    } catch (err) { toastError(err); }
  }
  async function eliminarMetodo(m) {
    if (!confirm(`¿Eliminar el método de pago ${m.nombre}?`)) return;
    try { await api.del(`/api/metodos-pago/${m.codigo}`); exito('Método de pago eliminado'); } catch (e) { toastError(e); }
    mp.recargar(); pub.recargar?.();
  }
  async function restaurarMetodo(m) {
    try { await api.post(`/api/metodos-pago/${m.codigo}/restaurar`, {}); exito('Método restaurado'); } catch (e) { toastError(e); }
    mp.recargar(); pub.recargar?.();
  }
  const puntos = !!f.puntosActivos;

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
        <label style={{ margin: '.4rem 0' }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={verEliminados} onChange={e => setVerEliminados(e.target.checked)} /> Ver eliminados
        </label>
        {verEliminados
          ? (mp.data.length ? mp.data.map(m => (
            <div className="fg" key={m.codigo}>
              <b style={{ minWidth: 140 }}>{m.nombre}</b>
              <button className="btn s y" onClick={() => restaurarMetodo(m)}>Restaurar</button>
            </div>
          )) : <p className="sm">No hay métodos eliminados</p>)
          : mp.data.map(m => <Metodo key={m.codigo} m={m} onCambio={cambiarMetodo} onQr={subirQr} onEliminar={eliminarMetodo} />)}
      </div>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3>Domicilios</h3>
        <label style={{ margin: 0 }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={f.domiciliosActivos !== false} onChange={e => campo('domiciliosActivos', e.target.checked)} /> Domicilios activos
        </label>
        <p className="sm">Si lo apagas, los clientes no podrán pedir a domicilio desde la web.</p>
      </div>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3>Sonido de pedidos nuevos</h3>
        <label>Sonido
          <select value={f.sonido || 'campana'} onChange={e => campo('sonido', e.target.value)}>
            {SONIDOS.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </label>
        <div className="row" style={{ marginTop: '.5rem' }}>
          {SONIDOS.map(s => <button key={s.id} className="btn s y" aria-label={`Probar ${s.nombre}`} onClick={() => beep(s.id)}>🔊 {s.nombre}</button>)}
        </div>
      </div>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3>Puntos de fidelidad</h3>
        <p className="sm">El cliente suma puntos por lo que paga y los canjea en caja por descuento. Se identifica con su celular.</p>
        <label style={{ margin: '.4rem 0' }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={puntos} onChange={e => campo('puntosActivos', e.target.checked)} /> Activar puntos
        </label>
        {puntos && (
          <>
            <label>Puntos por cada $1.000<input type="number" min={0} max={1000} value={f.puntosPorMil ?? ''} onChange={e => campo('puntosPorMil', e.target.value)} /></label>
            <label>Puntos por canje<input type="number" min={1} value={f.puntosCanje ?? ''} onChange={e => campo('puntosCanje', e.target.value)} /></label>
            <label>Descuento por canje ($)<input type="number" min={0} value={f.descuentoCanje ?? ''} onChange={e => campo('descuentoCanje', e.target.value)} /></label>
            <p className="sm">Ejemplo: con {f.puntosPorMil || 0} punto(s) por $1.000, una compra de $50.000 suma {(Number(f.puntosPorMil) || 0) * 50}.
              Cada {f.puntosCanje || 0} puntos canjeados descuentan ${Number(f.descuentoCanje || 0).toLocaleString('es-CO')}.</p>
          </>
        )}
      </div>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3>Mesas</h3>
        <label>Cantidad de mesas<input type="number" min={1} value={f.mesas ?? ''} onChange={e => campo('mesas', e.target.value)} /></label>
      </div>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3>Reportes</h3>
        <p className="sm">Archiva las ventas, compras y bitácora actuales para empezar los reportes en cero. No se borra nada.</p>
        <button className="btn s" style={PELIGRO} onClick={() => setReiniciando(true)}>Reiniciar reportes</button>
      </div>
      <div className="svb"><button className="btn" onClick={guardar}>💾 Guardar cambios</button></div>
      {reiniciando && <ReiniciarReportes onCerrar={() => setReiniciando(false)} />}
    </>
  );
}
