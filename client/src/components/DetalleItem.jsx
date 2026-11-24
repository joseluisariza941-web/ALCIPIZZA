// Detalle de un plato pedido (las líneas <br><small> de ticket()/conf()/recibo() originales).

/**
 * @param {{ sin?: string[], extras?: string[], salsas?: string[], nota?: string, prefijoSalsas?: string, mostrarNota?: boolean }} p
 */
export default function DetalleItem({ sin = [], extras = [], salsas = [], nota = '', prefijoSalsas = 'salsas: ', mostrarNota = true }) {
  return (
    <>
      {sin.length > 0 && <><br /><small>sin {sin.join(', ')}</small></>}
      {extras.length > 0 && <><br /><small>+ {extras.join(', ')}</small></>}
      {salsas.length > 0 && <><br /><small>{prefijoSalsas}{salsas.join(', ')}</small></>}
      {mostrarNota && nota && <><br /><small>“{nota}”</small></>}
    </>
  );
}
