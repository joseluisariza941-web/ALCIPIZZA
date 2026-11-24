// Lee una imagen elegida por el usuario como data URL, reducida como en upImg/upLogo/upBg originales.

/**
 * @param {File} file
 * @param {number} max lado mayor en píxeles
 * @param {string} [tipo] formato de salida
 * @param {number} [calidad]
 * @returns {Promise<string>} data URL
 */
export function leerImagen(file, max, tipo = 'image/jpeg', calidad = 0.8) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onerror = () => rej(new Error('No se pudo leer esa imagen'));
    r.onload = () => {
      const src = String(r.result);
      const c = document.createElement('canvas');
      let ctx = null;
      try { ctx = c.getContext('2d'); } catch { /* sin canvas */ }
      if (!ctx) return res(src); // sin canvas: se guarda tal cual
      const im = new Image();
      im.onload = () => {
        const k = Math.min(1, max / Math.max(im.width, im.height));
        c.width = Math.max(1, im.width * k); c.height = Math.max(1, im.height * k);
        ctx.drawImage(im, 0, 0, c.width, c.height);
        res(c.toDataURL(tipo, calidad));
      };
      im.onerror = () => rej(new Error('No se pudo leer esa imagen'));
      im.src = src;
    };
    r.readAsDataURL(file);
  });
}
