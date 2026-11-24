import { describe, expect, it } from 'vitest';
import { validarMesera, validarCambioMesera } from './personal.js';

describe('validarMesera (addMes original + reglas de la API)', () => {
  it('pide todos los datos', () => {
    expect(validarMesera({ nombre: 'Ana', usuario: '', clave: '12345678' }, [])).toEqual({ error: 'Datos incompletos o usuario repetido' });
  });
  it('no repite usuario (sin distinguir mayúsculas)', () => {
    expect(validarMesera({ nombre: 'A', usuario: 'ANA', clave: '12345678' }, [{ usuario: 'ana' }]).error).toBe('Datos incompletos o usuario repetido');
  });
  it('clave de al menos 8 caracteres', () => {
    expect(validarMesera({ nombre: 'A', usuario: 'b', clave: '123' }, [])).toEqual({ error: 'La contraseña debe tener al menos 8 caracteres' });
  });
  it('arma el cuerpo con rol mesera y usuario en minúsculas', () => {
    expect(validarMesera({ nombre: ' Luz ', usuario: ' LUZ ', clave: '12345678' }, []))
      .toEqual({ body: { nombre: 'Luz', usuario: 'luz', clave: '12345678', rol: 'mesera' } });
  });
});

describe('validarCambioMesera (cred original)', () => {
  const m = { id: 3, usuario: 'ana', nombre: 'Ana' };
  it('no puede quedar vacío', () => {
    expect(validarCambioMesera(m, 'nombre', '  ', [m])).toEqual({ error: 'No puede quedar vacío' });
  });
  it('usuario repetido', () => {
    expect(validarCambioMesera(m, 'usuario', 'Luz', [m, { id: 4, usuario: 'luz' }])).toEqual({ error: 'Ese usuario ya existe' });
  });
  it('clave corta', () => {
    expect(validarCambioMesera(m, 'clave', '1', [m]).error).toBe('La contraseña debe tener al menos 8 caracteres');
  });
  it('devuelve el cuerpo parcial', () => {
    expect(validarCambioMesera(m, 'usuario', ' ANITA ', [m])).toEqual({ body: { usuario: 'anita' } });
  });
});
