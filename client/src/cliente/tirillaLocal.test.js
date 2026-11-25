import { describe, expect, it } from 'vitest';
import {
  borrarEdicion, borrarTirilla, guardarEdicion, guardarTirilla, leerEdicion, leerTirilla, urlTirilla,
} from './tirillaLocal.js';

describe('tirilla guardada en el navegador', () => {
  it('guarda y lee {id, token}', () => {
    expect(leerTirilla()).toBeNull();
    guardarTirilla({ id: 9, token: 'abc' });
    expect(leerTirilla()).toEqual({ id: 9, token: 'abc' });
    borrarTirilla();
    expect(leerTirilla()).toBeNull();
  });

  it('ignora datos dañados', () => {
    localStorage.setItem('alcipizza.tirilla', '{no json');
    expect(leerTirilla()).toBeNull();
  });

  it('urlTirilla codifica el token', () => {
    expect(urlTirilla(9, 'a b/c')).toBe('/tirilla/9?token=a%20b%2Fc');
  });
});

describe('edición guardada en el navegador', () => {
  it('guarda y lee {id, token, pedido}', () => {
    expect(leerEdicion()).toBeNull();
    const e = { id: 7, token: 'abc', pedido: { id: 7, items: [] } };
    guardarEdicion(e);
    expect(leerEdicion()).toEqual(e);
    borrarEdicion();
    expect(leerEdicion()).toBeNull();
  });

  it('ignora datos dañados o sin pedido', () => {
    localStorage.setItem('alcipizza.edicion', '{no json');
    expect(leerEdicion()).toBeNull();
    localStorage.setItem('alcipizza.edicion', JSON.stringify({ id: 7, token: 'abc' }));
    expect(leerEdicion()).toBeNull();
  });
});
