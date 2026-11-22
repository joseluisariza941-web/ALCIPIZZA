/* Configuración de la página
 * API: ''                              -> modo local: los datos viven en el navegador (demo, sin servidor).
 *      '/api'                          -> la página la sirve el servidor Node de la carpeta /server (SQL Server).
 *      'https://tu-servidor.com/api'   -> el servidor está en otro dominio (activa CORS_ORIGIN en server/.env).
 * Si usas el servidor de /server, él entrega su propio config.js con '/api'; este archivo solo aplica
 * cuando publicas la página aparte (GitHub Pages, Netlify). */
window.APP_CONFIG = { API: '' };
