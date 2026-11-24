// Datos de ejemplo para las pruebas del panel de cocina.
export const cocinero = { id: 2, usuario: 'admin', nombre: 'Admin', rol: 'cocina' };

/** @returns {any} */
export const pedido = (o = {}) => ({
  id: 1, creadoEn: '2026-11-23T20:00:00Z', origen: 'web', mesera: null, destino: 'Domicilio', cliente: 'Juan',
  direccion: 'Cra 1 #2-3', telefono: '3001234567', total: 21000, estado: 'nuevo', pagoEstado: 'pendiente',
  metodoPago: { codigo: 'nq', nombre: 'Nequi' }, pagadoEn: null, cobradoPor: null,
  items: [{ id: 1, platoId: 1, nombre: 'Pizza', emoji: '🍕', variante: 'Pequeña', precioUnitario: 21000, nota: 'bien asada',
    extras: [{ id: 4, nombre: 'Queso extra', precio: 2000 }], salsas: ['Ketchup'], sin: ['Tomate'] }],
  ...o,
});

export const config = { n: 'Alcipizza', w1: 'Tu próximo antojo', w2: 'Calidad', w3: 'Descubre', w4: 'Todo a tu gusto',
  tel: '3108819617', mesas: 8, h: [[18, 22], null, [18, 22], [18, 22], [18, 22], [18, 22], [18, 22]], logo: '', bg: '' };

export const insumos = [
  { id: 1, nombre: 'Queso', tipo: 'insumo', unidad: 'g', stock: 100, stockReferencia: 1000, costo: 20000, surtidorId: 1 },
  { id: 2, nombre: 'Carne', tipo: 'insumo', unidad: 'kg', stock: 5, stockReferencia: 10, costo: 0, surtidorId: null },
  { id: 3, nombre: 'Ketchup', tipo: 'salsa', unidad: 'g', stock: 800, stockReferencia: 1000, costo: 0, surtidorId: null },
  { id: 4, nombre: 'Gaseosa', tipo: 'insumo', unidad: 'und', stock: 20, stockReferencia: 24, costo: 0, surtidorId: null },
];

export const surtidores = [{ id: 1, nombre: 'Pedro', empresa: 'Lácteos SA', correo: 'p@l.co', telefono: '311' }];

export const compras = [
  { id: 1, fecha: '2026-11-22T15:00:00Z', insumo: { id: 1, nombre: 'Queso' }, cantidad: 1, unidad: 'kg', costo: 20000,
    surtidor: { id: 1, nombre: 'Pedro' }, registradoPor: { id: 2, nombre: 'Admin' } },
];

export const extras = [
  { id: 4, nombre: 'Queso extra', insumoId: 1, cantidad: 30, unidad: 'g', precio: 2000, grupo: null },
];

export const platos = [
  { id: 1, nombre: 'Pizza', emoji: '🍕', imagenUrl: '', categoria: 'Pizzas', activo: true,
    variantes: [{ id: 1, nombre: 'Pequeña', precio: 16000, multiplicador: 1 }],
    ingredientes: [{ insumoId: 1, nombre: 'Queso', cantidad: 100, unidad: 'g' }],
    salsas: ['Ketchup'], extras: [{ id: 4, nombre: 'Queso extra', precio: 2000, grupo: null }] },
  { id: 2, nombre: 'Gaseosa', emoji: '🥤', imagenUrl: '', categoria: 'Bebidas', activo: true,
    variantes: [{ id: 2, nombre: 'Personal', precio: 3000, multiplicador: 1 }],
    ingredientes: [{ insumoId: 4, nombre: 'Gaseosa', cantidad: 1, unidad: 'und' }], salsas: [], extras: [] },
];

export const metodos = [
  { codigo: 'ef', nombre: 'Efectivo', numero: '', activo: true },
  { codigo: 'nq', nombre: 'Nequi', numero: '3001112222', activo: true },
];

export const meseras = [
  { id: 3, usuario: 'ana', nombre: 'Ana', rol: 'mesera', activo: true, debeCambiarClave: false },
];

export const bitacora = [
  { id: 1, fecha: '2026-11-23T19:00:00Z', usuario: 'ana', nombre: 'Ana', accion: 'Ingresó al sistema' },
];
