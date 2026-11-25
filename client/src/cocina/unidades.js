// Unidades de medida: el valor es el código que usa el servidor (Servicios/Unidades.php).

/** Unidades en el orden en que se muestran. */
export const UNIDADES = [
  { valor: 'und', etiqueta: 'und' },
  { valor: 'g', etiqueta: 'g' },
  { valor: 'kg', etiqueta: 'kg' },
  { valor: 'lb', etiqueta: 'lb' },
  { valor: 'L', etiqueta: 'Litros' },
  { valor: 'ml', etiqueta: 'ml' },
];

const GRUPO = { und: 'und', g: 'masa', kg: 'masa', lb: 'masa', ml: 'volumen', L: 'volumen' };

/** Texto de una unidad para mostrar. */
export const etiquetaUnidad = u => UNIDADES.find(x => x.valor === u)?.etiqueta ?? u;

/** ¿Se puede pasar de una unidad a otra? (mismo grupo: unidades, masa o volumen). */
export const unidadesCompatibles = (a, b) => GRUPO[a] !== undefined && GRUPO[a] === GRUPO[b];
