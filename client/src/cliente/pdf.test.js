import { describe, expect, it } from 'vitest';
import { mkpdf, pdfRecibo } from './pdf.js';

const texto = bytes => Array.from(bytes, b => String.fromCharCode(b)).join('');

describe('mkpdf (puerto puro del original)', () => {
  const rows = [['#1', 'Pizza (Grande)', '$38.000']];
  const pdf = texto(mkpdf('Alcipizza · Ventas', 'Generado hoy', ['#', 'Plato', 'Total'], rows, [100, 400, 228], 'TOTAL: $38.000'));

  it('produce un PDF 1.4 válido con cabecera y fin', () => {
    expect(pdf.startsWith('%PDF-1.4\n')).toBe(true);
    expect(pdf.endsWith('%%EOF')).toBe(true);
    expect(pdf).toContain('/Count 1');
  });

  it('incluye títulos, filas y pie como texto (Latin-1)', () => {
    expect(pdf).toContain('(Alcipizza \xB7 Ventas) Tj');
    expect(pdf).toContain('(Pizza \\(Grande\\)) Tj');
    expect(pdf).toContain('(TOTAL: $38.000) Tj');
    expect(pdf).toContain('(P\xE1gina 1 de 1) Tj');
  });

  it('las posiciones de la tabla xref apuntan a cada objeto', () => {
    const xr = +pdf.match(/startxref\n(\d+)/)[1];
    expect(pdf.slice(xr, xr + 4)).toBe('xref');
    const offs = pdf.slice(xr).match(/^\d{10} 00000 n $/gm).map(l => +l.slice(0, 10));
    expect(offs.length).toBeGreaterThan(4);
    offs.forEach((o, i) => expect(pdf.slice(o, o + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));
  });

  it('pagina cuando hay muchas filas y reemplaza caracteres fuera de Latin-1', () => {
    const muchas = Array.from({ length: 60 }, (_, i) => [String(i), '🍕 Pizza', '$1']);
    const p = texto(mkpdf('T', 'S', ['a', 'b', 'c'], muchas, [100, 400, 228]));
    expect(p).toMatch(/\/Count [3-9]/);
    expect(p).toContain('(?? Pizza) Tj');
  });

  it('usa el color de la paleta en la franja del título', () => {
    expect(texto(mkpdf('T', 'S', ['a'], [], [728], '', '#FF0000'))).toContain('1.000 0.000 0.000 rg');
  });
});

it('pdfRecibo arma la tirilla del pedido', () => {
  const p = texto(pdfRecibo({
    id: 7, creadoEn: '2026-11-23T19:30:00', destino: 'Domicilio', cliente: 'Juan', total: 22000, pagoEstado: 'pendiente',
    metodoPago: { codigo: 'nq', nombre: 'Nequi' },
    items: [{ nombre: 'Hamburguesa', variante: 'Sencilla', precioUnitario: 22000, extras: [{ nombre: 'Queso extra', precio: 2000 }], salsas: ['Ketchup'], sin: ['Tomate'], nota: '' }],
  }, { n: 'Alcipizza' }));
  expect(p).toContain('(Alcipizza \xB7 Pedido #7) Tj');
  expect(p).toContain('(Hamburguesa) Tj');
  expect(p).toContain('($22.000) Tj');
  expect(p).toContain('TOTAL: $22.000');
});
