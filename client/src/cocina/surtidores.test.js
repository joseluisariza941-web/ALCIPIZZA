import { describe, expect, it } from 'vitest';
import { filasSurtidores, validarSurtidor } from './surtidores.js';
import { compras, insumos, surtidores } from './fixtures.js';

describe('validarSurtidor', () => {
  it('exige el nombre', () => {
    expect(validarSurtidor({ nombre: '  ' })).toEqual({ error: 'Escribe el nombre del surtidor' });
  });
  it('limpia los campos', () => {
    expect(validarSurtidor({ nombre: ' Ana ', empresa: ' X ', correo: '', telefono: '1' }))
      .toEqual({ body: { nombre: 'Ana', empresa: 'X', correo: '', telefono: '1' } });
  });
});

describe('filasSurtidores (prodOf/hs original)', () => {
  const mas = [...compras, { ...compras[0], id: 2, fecha: '2026-11-23T10:00:00Z', costo: 5000, insumo: { id: 2, nombre: 'Carne' } },
    { ...compras[0], id: 3, surtidor: null, costo: 999 }];
  it('calcula productos, total comprado y última compra', () => {
    const [f] = filasSurtidores(surtidores, mas, insumos, '');
    expect(f.productos).toBe('Queso, Carne');
    expect(f.total).toBe(25000);
    expect(f.ultima).toBe('2026-11-23T10:00:00Z');
  });
  it('sin compras ni insumos: — y sin fecha', () => {
    const [f] = filasSurtidores([{ id: 9, nombre: 'Luis', empresa: '', correo: '', telefono: '' }], mas, insumos, '');
    expect(f).toMatchObject({ productos: '—', total: 0, ultima: null });
  });
  it('busca por surtidor, empresa o producto', () => {
    expect(filasSurtidores(surtidores, mas, insumos, 'carne')).toHaveLength(1);
    expect(filasSurtidores(surtidores, mas, insumos, 'lácteos')).toHaveLength(1);
    expect(filasSurtidores(surtidores, mas, insumos, 'zzz')).toHaveLength(0);
  });
});
