// Cobro del pedido: método de pago y, si los puntos están activos, canje en caja. Lo usan mesera y cocina.
import { useState } from 'react';
import { api } from '../api.js';
import { celularValido, normalizarCelular } from '../cliente/carrito.js';
import { Modal } from './componentes.jsx';
import { pesos } from './formato.js';

const ERRORES = {
  PUNTOS_INACTIVOS: 'El programa de puntos está apagado',
  PUNTOS_INVALIDOS: 'La cantidad de puntos a canjear no es válida',
  PUNTOS_INSUFICIENTES: 'El cliente no tiene puntos suficientes',
  PUNTOS_EXCEDEN: 'El descuento por puntos supera el total del pedido',
};

/** Canjes posibles: sin pasar del saldo ni del total. @param {number} saldo @param {number} total @param {{puntosCanje:number, descuentoCanje:number}} p */
export function maxCanjes(saldo, total, p) {
  const porSaldo = Math.floor(saldo / Math.max(1, p.puntosCanje));
  const porTotal = p.descuentoCanje > 0 ? Math.floor(total / p.descuentoCanje) : porSaldo;
  return Math.max(0, Math.min(porSaldo, porTotal));
}

/**
 * @param {{ o:any, pagos:{codigo:string, nombre:string}[], puntos?:{activo:boolean, puntosCanje:number, descuentoCanje:number},
 *   onCobrado?:(pedido:any)=>void, onCerrar:()=>void }} p
 */
export default function CobroModal({ o, pagos, puntos, onCobrado, onCerrar }) {
  const activo = !!puntos?.activo;
  const [celular, setCelular] = useState(o.celular || '');
  const [saldo, setSaldo] = useState(/** @type {number|null} */ (null));
  const [canjes, setCanjes] = useState(0);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [hecho, setHecho] = useState(/** @type {any} */ (null));

  const tieneCelular = celular.trim() !== '';
  const max = saldo === null ? 0 : maxCanjes(saldo, o.total, puntos);
  const descuento = canjes * (puntos?.descuentoCanje || 0);

  const cambiarCelular = v => { setCelular(v); setSaldo(null); setCanjes(0); setError(''); };

  async function verPuntos() {
    if (!celularValido(celular)) return setError('Escribe un celular válido (10 dígitos que empiezan por 3)');
    setError('');
    try {
      const r = await api.get(`/api/public/puntos/${normalizarCelular(celular)}`);
      setSaldo(Number(r?.saldo) || 0);
      setCanjes(0);
    } catch (e) { setError(e.message || 'No se pudo consultar el saldo'); }
  }

  async function pagar(codigo) {
    if (enviando) return;
    /** @type {Record<string, any>} */
    const body = { metodoPago: codigo };
    if (activo && tieneCelular) {
      if (!celularValido(celular)) return setError('Escribe un celular válido (10 dígitos que empiezan por 3)');
      body.celular = normalizarCelular(celular);
      if (canjes > 0) body.canjearPuntos = canjes * puntos.puntosCanje;
    }
    setEnviando(true); setError('');
    try {
      const p = await api.post(`/api/pedidos/${o.id}/pago`, body);
      onCobrado?.(p);
      if (p?.descuentoPuntos > 0) setHecho(p); else onCerrar();
    } catch (e) {
      setError(ERRORES[e.data?.code] || e.message || 'No se pudo confirmar el pago');
    } finally { setEnviando(false); }
  }

  if (hecho) {
    return (
      <Modal etiqueta={'Cobrar pedido #' + o.id}>
        <div className="card" style={{ maxWidth: 360, width: '92%' }}>
          <h2>Pedido #{o.id}</h2>
          <p className="sm" style={{ margin: '.5rem 0' }}>Descuento por puntos: -{pesos(hecho.descuentoPuntos)}</p>
          <p><b>Total cobrado: {pesos(hecho.total)}</b></p>
          <button className="btn y" style={{ marginTop: '1rem' }} onClick={onCerrar}>Listo</button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal etiqueta={'Cobrar pedido #' + o.id}>
      <div className="card" style={{ maxWidth: 360, width: '92%' }}>
        <h2>Pedido #{o.id}</h2>
        <p className="sm" style={{ margin: '.5rem 0' }}>Total {pesos(o.total)} · ¿Cómo pagó?</p>
        {activo && (
          <>
            <label>Celular<input type="tel" inputMode="numeric" maxLength={13} value={celular} placeholder="Para puntos (opcional)"
              onChange={e => cambiarCelular(e.target.value)} /></label>
            <button className="btn s" style={{ margin: '.4rem 0' }} disabled={!tieneCelular} onClick={verPuntos}>Ver puntos</button>
            {saldo !== null && (
              <>
                <p className="sm">Saldo: {saldo} puntos</p>
                {max > 0
                  ? (
                    <label>Canjes a aplicar
                      <select value={canjes} onChange={e => setCanjes(Number(e.target.value))}>
                        {[...Array(max + 1)].map((_, i) => <option key={i} value={i}>{i}</option>)}
                      </select>
                    </label>
                  )
                  : <p className="sm">No hay canjes disponibles.</p>}
                {canjes > 0 && (
                  <>
                    <p className="sm">Descuento por puntos: -{pesos(descuento)}</p>
                    <p><b>Total a cobrar: {pesos(o.total - descuento)}</b></p>
                  </>
                )}
              </>
            )}
          </>
        )}
        {error && <p role="alert" className="sm" style={{ color: 'var(--rd, #c0392b)', margin: '.4rem 0' }}>{error}</p>}
        <div className="row">
          {pagos.map(x => <button key={x.codigo} className="btn y" disabled={enviando} onClick={() => pagar(x.codigo)}>{x.nombre}</button>)}
        </div>
        <button className="btn s" style={{ marginTop: '1rem' }} onClick={onCerrar}>Cancelar</button>
      </div>
    </Modal>
  );
}
