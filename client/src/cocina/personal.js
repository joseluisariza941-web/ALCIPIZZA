// Lógica pura de la pestaña Personal (meseras).

const CORTA = 'La contraseña debe tener al menos 8 caracteres';
const REPETIDO = 'Datos incompletos o usuario repetido';

/**
 * Valida una mesera nueva (addMes original). La API exige clave ≥ 8.
 * @param {{nombre?:string, usuario?:string, clave?:string}} f
 * @param {{usuario:string}[]} existentes
 */
export function validarMesera(f, existentes) {
  const nombre = (f.nombre || '').trim(), usuario = (f.usuario || '').trim().toLowerCase(), clave = f.clave || '';
  if (!nombre || !usuario || !clave || existentes.some(m => m.usuario.toLowerCase() === usuario)) return { error: REPETIDO };
  if (clave.length < 8) return { error: CORTA };
  return { body: { nombre, usuario, clave, rol: 'mesera' } };
}

/**
 * Valida el cambio de un campo de una mesera (cred original).
 * @param {{id:number, usuario:string}} m
 * @param {'nombre'|'usuario'|'clave'} campo
 * @param {string} valor
 * @param {{id:number, usuario:string}[]} todas
 */
export function validarCambioMesera(m, campo, valor, todas) {
  let v = campo === 'clave' ? valor : valor.trim();
  if (!v.trim()) return { error: 'No puede quedar vacío' };
  if (campo === 'usuario') {
    v = v.toLowerCase();
    if (todas.some(x => x.id !== m.id && x.usuario.toLowerCase() === v)) return { error: 'Ese usuario ya existe' };
  }
  if (campo === 'clave' && v.length < 8) return { error: CORTA };
  return { body: { [campo]: v } };
}
