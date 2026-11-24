import { describe, expect, it } from 'vitest';
import { borrarTirilla, guardarTirilla, leerTirilla, urlTirilla } from './tirillaLocal.js';

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
