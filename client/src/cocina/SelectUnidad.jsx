import { UNIDADES } from './unidades.js';

/** Selector de unidad con la lista común (und, g, kg, lb, Litros y ml). */
export default function SelectUnidad({ value, onChange, style, label = 'Unidad' }) {
  return (
    <select aria-label={label} style={style} value={value} onChange={onChange}>
      {UNIDADES.map(u => <option key={u.valor} value={u.valor}>{u.etiqueta}</option>)}
    </select>
  );
}
