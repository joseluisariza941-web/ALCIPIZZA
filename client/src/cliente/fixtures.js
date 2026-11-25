// Datos de prueba compartidos por las pruebas de las pantallas públicas.
export const H_ABIERTO = [[0, 24], [0, 24], [0, 24], [0, 24], [0, 24], [0, 24], [0, 24]];

export const CONFIG = {
  config: {
    n: 'Pizzería Test', w1: 'Antojo test', w2: 'Sabor test', w3: 'Menú test', w4: 'A tu gusto test',
    tel: '3001112233', mesas: 4, h: H_ABIERTO, logo: '', bg: '',
  },
  pagos: [
    { codigo: 'ef', nombre: 'Efectivo', numero: '', activo: true, qrUrl: null },
    { codigo: 'nq', nombre: 'Nequi', numero: '3009998877', activo: true, qrUrl: null },
  ],
  abierto: true,
  suscripcionActiva: true,
  promociones: [],
  puntos: { activo: false, porMil: 1, puntosCanje: 100, descuentoCanje: 1000 },
};

export const MENU = [
  {
    id: 2, nombre: 'Hamburguesa', emoji: '🍔', imagenUrl: '', categoria: 'Hamburguesas',
    variantes: [{ id: 21, nombre: 'Sencilla', precio: 14000 }, { id: 22, nombre: 'Doble carne', precio: 20000 }],
    ingredientes: ['Pan', 'Carne', 'Tomate'], salsas: ['Ketchup', 'Mayonesa'],
    extras: [
      { id: 1, nombre: 'Papas pequeña', precio: 3000, grupo: 'papas' },
      { id: 2, nombre: 'Papas mediana', precio: 5000, grupo: 'papas' },
      { id: 4, nombre: 'Queso extra', precio: 2000, grupo: null },
    ],
  },
  {
    id: 7, nombre: 'Coca-Cola', emoji: '🥤', imagenUrl: '', categoria: 'Bebidas',
    variantes: [{ id: 71, nombre: 'Personal 300ml', precio: 3000 }],
    ingredientes: ['Coca-Cola'], salsas: [], extras: [],
  },
];

export const PEDIDO = {
  id: 7, creadoEn: '2026-11-23T19:30:00', origen: 'web', mesera: null, destino: 'Domicilio', cliente: 'Juan',
  direccion: 'Cra 1 #2-3', telefono: '3001234567', celular: null, subtotal: 22000, descuentoPromo: 0,
  promocion: null, puntosCanjeados: 0, descuentoPuntos: 0, puntosGanados: 0, editadoEn: null,
  canceladoPorCliente: false, total: 22000, estado: 'nuevo', pagoEstado: 'pendiente',
  metodoPago: { codigo: 'nq', nombre: 'Nequi' }, pagadoEn: null, cobradoPor: null,
  items: [{ id: 1, platoId: 2, varianteId: 22, nombre: 'Hamburguesa', emoji: '🍔', variante: 'Doble carne', precioUnitario: 22000, nota: '',
    extras: [{ id: 4, nombre: 'Queso extra', precio: 2000 }], salsas: ['Ketchup'], sin: ['Tomate'] }],
};
