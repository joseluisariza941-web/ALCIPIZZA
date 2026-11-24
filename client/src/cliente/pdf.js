// Generador de PDF sin dependencias (mkpdf original como función pura) + tirilla en PDF + descarga.
import { fechaCorta, pesos, precioItem } from './formato.js';

/**
 * Tabla en PDF horizontal (carta), paginada.
 * @param {string} title @param {string} sub @param {string[]} head
 * @param {(string|number)[][]} rows @param {number[]} w anchos de columna (suman 728)
 * @param {string} [foot] texto final en la última página
 * @param {string} [color] color de la franja del título (#RRGGBB); por defecto el de la paleta "aji"
 * @returns {Uint8Array}
 */
export function mkpdf(title, sub, head, rows, w, foot, color = '#E4262B') {
  const W = 792, H = 612, M = 32, rh = 18, pp = Math.floor((H - 2 * M - 64) / rh), n = Math.max(1, Math.ceil(rows.length / pp)), x = [M];
  w.forEach(a => x.push(x[x.length - 1] + a));
  const ac = color.replace('#', '').match(/\w\w/g).map(h => (parseInt(h, 16) / 255).toFixed(3)).join(' ');
  const t = s => String(s).replace(/[^\x20-\xFF]/g, '?').replace(/[\\()]/g, '\\$&');
  const tx = (f, z, X, Y, s, c) => `BT /${f} ${z} Tf ${c || '0 g'} ${X} ${Y} Td (${t(s)}) Tj ET\n`;
  const cl = (s, i, z) => { s = String(s); const m = Math.floor((w[i] - 8) / (z * 0.52)); return s.length > m ? s.slice(0, m - 1) + '.' : s; };
  const o = [0, '<</Type/Catalog/Pages 2 0 R>>', '', '<</Type/Font/Subtype/Type1/BaseFont/Helvetica/Encoding/WinAnsiEncoding>>', '<</Type/Font/Subtype/Type1/BaseFont/Helvetica-Bold/Encoding/WinAnsiEncoding>>'], kids = [];
  for (let p = 0; p < n; p++) {
    let c = `${ac} rg ${M} ${H - M - 40} ${W - 2 * M} 40 re f\n` + tx('F2', 16, M + 10, H - M - 18, title, '1 g') + tx('F1', 9, M + 10, H - M - 33, sub, '1 g'), y = H - M - 64;
    c += `0.88 g ${M} ${y - rh + 4} ${W - 2 * M} ${rh} re f\n`;
    head.forEach((h, i) => { c += tx('F2', 9, x[i] + 4, y - 8, h); });
    rows.slice(p * pp, (p + 1) * pp).forEach((r, k) => {
      y -= rh;
      if (k % 2) c += `0.96 g ${M} ${y - rh + 4} ${W - 2 * M} ${rh} re f\n`;
      r.forEach((v, i) => { c += tx('F1', 8.5, x[i] + 4, y - 8, cl(v, i, 8.5)); });
    });
    if (foot && p === n - 1) c += tx('F2', 11, M + 4, y - rh - 8, foot);
    c += tx('F1', 8, W / 2 - 30, M - 12, `Página ${p + 1} de ${n}`);
    o.push(`<</Length ${c.length}>>\nstream\n${c}endstream`, `<</Type/Page/Parent 2 0 R/MediaBox[0 0 ${W} ${H}]/Resources<</Font<</F1 3 0 R/F2 4 0 R>>>>/Contents ${5 + 2 * p} 0 R>>`);
    kids.push(`${6 + 2 * p} 0 R`);
  }
  o[2] = `<</Type/Pages/Kids[${kids.join(' ')}]/Count ${n}>>`;
  let out = '%PDF-1.4\n';
  const of = [];
  for (let i = 1; i < o.length; i++) { of[i] = out.length; out += `${i} 0 obj\n${o[i]}\nendobj\n`; }
  const xr = out.length;
  out += `xref\n0 ${o.length}\n0000000000 65535 f \n` + of.slice(1).map(a => String(a).padStart(10, '0') + ' 00000 n \n').join('')
    + `trailer\n<</Size ${o.length}/Root 1 0 R>>\nstartxref\n${xr}\n%%EOF`;
  return Uint8Array.from(out, ch => ch.charCodeAt(0) & 255);
}

/**
 * Tirilla de un pedido en PDF.
 * @param {any} o Pedido de la API @param {{ n:string }} cfg @param {string} [color]
 */
export function pdfRecibo(o, cfg, color) {
  const mp = o.metodoPago?.nombre || '';
  const detalle = c => [
    c.sin?.length ? 'sin ' + c.sin.join(', ') : '',
    c.extras?.length ? '+ ' + c.extras.map(e => e.nombre).join(', ') : '',
    c.salsas?.length ? 'salsas: ' + c.salsas.join(', ') : '',
    c.nota ? `"${c.nota}"` : '',
  ].filter(Boolean).join(' · ') || '-';
  return mkpdf(
    `${cfg.n} · Pedido #${o.id}`,
    [fechaCorta(o.creadoEn), o.destino, o.cliente].filter(Boolean).join(' · '),
    ['Plato', 'Tamaño', 'Detalle', 'Precio'],
    o.items.map(c => [c.nombre, c.variante, detalle(c), pesos(precioItem(c))]),
    [150, 110, 368, 100],
    `TOTAL: ${pesos(o.total)}  ·  ${o.pagoEstado === 'pagado' ? 'Pagado con ' + mp : 'Pago pendiente' + (mp ? ' (' + mp + ')' : '')}`,
    color,
  );
}

/** Descarga bytes como archivo PDF (dl original). @param {Uint8Array} b @param {string} name */
export function descargarPdf(b, name) {
  const u = URL.createObjectURL(new Blob([b], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = u; a.download = name;
  document.body.append(a);
  a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(u); }, 1500);
}
