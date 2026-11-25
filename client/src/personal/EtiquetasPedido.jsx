// Lo que cambió el cliente y los descuentos aplicados, para las tarjetas de mesera y cocina.
import { pesos } from './formato.js';

/** @param {{ o:any }} p */
export default function EtiquetasPedido({ o }) {
  const hay = o.editadoEn || o.canceladoPorCliente || o.promocion || o.descuentoPromo > 0 || o.descuentoPuntos > 0;
  if (!hay) return null;
  return (
    <p className="sm" style={{ display: 'flex', flexWrap: 'wrap', gap: '.3rem', margin: '.3rem 0' }}>
      {o.editadoEn ? <span className="bd">Editado por el cliente</span> : null}
      {o.canceladoPorCliente ? <span className="bd">Cancelado por el cliente</span> : null}
      {o.promocion || o.descuentoPromo > 0
        ? <span className="bd">Promoción {o.promocion?.nombre || ''}: -{pesos(o.descuentoPromo)}</span> : null}
      {o.descuentoPuntos > 0 ? <span className="bd">Puntos: -{pesos(o.descuentoPuntos)}</span> : null}
    </p>
  );
}
