// Íconos propios de Klase A, dibujados para el menú lateral.
//
// Todos en la misma grilla de 24 con margen de 2–3 px y trazo de 1,5 con
// puntas redondas, así se leen como una familia y no como recortes de tres
// bibliotecas. Las metáforas son del astillero: el yate para Obras, el casco
// en el molde para Laminación por obra, el ancla para los barcos entregados,
// el salvavidas para pedir ayuda.
//
// Cada ícono es una lista de trazos (atributo d de un <path>). Un trazo que es
// un objeto { d, relleno: true } va pintado en vez de contorneado (los puntos
// de la calculadora). Son datos y no JSX para poder armar una hoja de muestra
// desde Node sin compilar nada.

const circulo = (cx, cy, r) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
const caja = (x, y, w, h, r = 0) =>
  r
    ? `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(w - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}z`
    : `M${x} ${y}h${w}v${h}h${-w}z`;
const punto = (cx, cy) => ({ d: circulo(cx, cy, 0.95), relleno: true });

// Capas de laminado: la misma pila para Pampa y Chubut (Chubut lleva la marca).
const capas = [
  "M12 3.5l9 4.5-9 4.5-9-4.5z",
  "M3 12.5l9 4.5 9-4.5",
  "M3 16.5l9 4.5 9-4.5",
];
// Bandeja del mostrador: ingresos y egresos cambian sólo el sentido de la flecha.
const bandeja = [
  "M3.5 13.5h4.3l1.5 2.5h5.4l1.5-2.5h4.3",
  "M3.5 13.5v5A1.5 1.5 0 0 0 5 20h14a1.5 1.5 0 0 0 1.5-1.5v-5",
];
const hojaDoblada = [
  "M14 3H7a1.5 1.5 0 0 0-1.5 1.5v15A1.5 1.5 0 0 0 7 21h10a1.5 1.5 0 0 0 1.5-1.5V7.5z",
  "M14 3v4.5h4.5",
  "M9 12.5h6M9 16h4",
];
const estanteria = [
  "M4 3v18M20 3v18M4 9h16M4 15h16M4 21h16",
  "M7 9V5.5h4.5V9",
  "M12.5 15v-3.5H17V15",
  "M7 21v-3h3.5v3",
];

export const ICONOS_KLASEA = {
  // ── Producción ─────────────────────────────────────────────────────────
  // Yate de perfil: casco, cabina con parabrisas y mástil con radar.
  "/obras": [
    "M2.5 14h19.5l-2.6 4.3a2 2 0 0 1-1.7 1H6.2a2 2 0 0 1-1.8-1.2z",
    "M6 14v-3.5a1 1 0 0 1 1-1h7.2l3.6 4.5",
    "M10 9.5V6M8.5 6h3",
  ],
  // Escalones: las tandas de compra de una obra, una tras otra.
  "/compras-etapa": ["M3 20h4.5v-4.5H12V11h4.5V6.5H21"],
  // Libro abierto: la memoria descriptiva del barco.
  "/memorias": [
    "M12 6.5C10.4 5.2 8 4.5 3.5 4.5V18c4.5 0 6.9.7 8.5 2 1.6-1.3 4-2 8.5-2V4.5c-4.5 0-6.9.7-8.5 2z",
    "M12 6.5V20",
  ],
  "/revisiones": [
    caja(5, 4.5, 14, 16.5, 2),
    caja(9, 3, 6, 3, 1),
    "M9 13.5l2 2 4-4.5",
  ],
  // Placa con vetas.
  "/marmoleria": [
    caja(3.5, 5, 17, 14, 1.5),
    "M3.5 13.5c2.5-.3 3.6-3 6.3-3 2.4 0 3 2.3 5.3 2.3 1.9 0 2.8-1.6 5.4-1.6",
    "M11.5 19c.3-1.7 1.4-2.8 3-3.2",
  ],
  // Mueble de dos puertas con patas.
  "/muebles": [
    caja(4, 3.5, 16, 14.5, 1.5),
    "M12 3.5V18M10 9.8v2.4M14 9.8v2.4",
    "M6.5 18v2.5M17.5 18v2.5",
  ],
  // Tuerca: el taller de mecanizado. La llave fija se confundía con ajustes.
  "/torneria": [
    "M7.5 3.5h9l4.5 8.5-4.5 8.5h-9L3 12z",
    circulo(12, 12, 3.5),
  ],
  // Camión: la logística de fletes y grúas.
  "/calendario": [
    "M14 16.5V7a1 1 0 0 0-1-1H3.5a1 1 0 0 0-1 1v8.5a1 1 0 0 0 1 1h1.6",
    "M9.1 16.5h6.1",
    "M14 9.5h3.6a1 1 0 0 1 .8.4l2.4 3.1a1 1 0 0 1 .2.6v1.9a1 1 0 0 1-1 1h-.8",
    circulo(7.1, 17, 2),
    circulo(17.2, 17, 2),
  ],
  "/semaforo": [
    caja(8, 2.5, 8, 19, 2.5),
    circulo(12, 7, 1.6),
    circulo(12, 12, 1.6),
    circulo(12, 17, 1.6),
  ],

  // ── Inventario ─────────────────────────────────────────────────────────
  // Pino, como la tarjeta de Maderas de la portada. Se probó un tronco de
  // costado: a 20 px parecía un interruptor.
  "/madera": [
    "M12 2.5l5 6h-2.5l4 5h-3l3.5 4.5h-14l3.5-4.5h-3l4-5H7z",
    "M12 18v3.5",
  ],
  "/laminacion": capas,
  // Chubut: la misma pila con un punto, para distinguirlos en el riel.
  "/laminacion-chubut": [...capas, { d: circulo(20, 3.6, 1.7), relleno: true }],
  "/scan": [
    "M3.5 8V5A1.5 1.5 0 0 1 5 3.5h3",
    "M16 3.5h3A1.5 1.5 0 0 1 20.5 5v3",
    "M20.5 16v3a1.5 1.5 0 0 1-1.5 1.5h-3",
    "M8 20.5H5A1.5 1.5 0 0 1 3.5 19v-3",
    "M8 8v8M11 8v8M13.5 8v8M16 8v8",
  ],

  // ── Laminación por obra ───────────────────────────────────────────────
  // Corte del casco dentro del molde.
  "/obras-laminacion": [
    "M3 4v6.5a9 9 0 0 0 18 0V4",
    "M7 4v6.5a5 5 0 0 0 10 0V4",
  ],
  // La receta: una hoja con su pila de capas.
  "/laminacion/plantillas": [
    caja(4.5, 3, 15, 18, 1.5),
    "M8 7.5h8M8 11h5",
    "M8 15.5l4-1.8 4 1.8-4 1.8z",
  ],

  // ── Pañol ──────────────────────────────────────────────────────────────
  "/inicio-panol": [
    caja(3.5, 3.5, 7, 9, 1.2),
    caja(13.5, 3.5, 7, 5, 1.2),
    caja(13.5, 11.5, 7, 9, 1.2),
    caja(3.5, 15.5, 7, 5, 1.2),
  ],
  "/ingresos-panol": [...bandeja, "M12 3v8.5M8.5 8l3.5 3.5L15.5 8"],
  "/egresos-panol": [...bandeja, "M12 11.5V3M8.5 6.5L12 3l3.5 3.5"],
  // Caja de cartón con su cinta: lo que entra y sale del pañol.
  "/recepcion-panol": [
    "M12 2.8l8.5 4.3v9.8L12 21.2l-8.5-4.3V7.1z",
    "M3.5 7.1l8.5 4.3 8.5-4.3",
    "M12 11.4v9.8",
    "M7.8 4.9l8.5 4.3",
  ],
  // Comanda con el borde cortado: un pedido.
  "/recepcion-panol?tab=recepcion": [
    "M6 3h12v18l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4L6 21z",
    "M9 8h6M9 11.5h6M9 15h3.5",
  ],
  // Carpeta: los remitos guardados.
  "/remitos-panol": [
    "M3 7a1.5 1.5 0 0 1 1.5-1.5h4.2l2 2h8.8A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z",
    "M7.5 13h9M7.5 16.5h5",
  ],
  "/consumibles?tab=solicitudes": hojaDoblada,
  "/solicitudes-panol": hojaDoblada,
  // Rollo de cinta: lo que se gasta.
  "/consumibles": [
    circulo(11, 12, 7.5),
    circulo(11, 12, 3),
    "M18.5 12v8.5H13",
  ],
  // Lista con tildes: lo que la cuadrilla retira mañana.
  "/pedido-panol": [
    "M10.5 6.5h9.5M10.5 12h9.5M10.5 17.5h6",
    "M3.5 6.5L5 8l2.5-2.8",
    "M3.5 12L5 13.5l2.5-2.8",
    caja(3.7, 15.8, 3.6, 3.6, 0.8),
  ],
  "/stock-panol": estanteria,
  "/stock-panol?tab=maestro": estanteria,
  "/stock-panol?tab=mapa": [
    "M3 6.5L8.5 4l7 2.5L21 4v13.5L15.5 20l-7-2.5L3 20z",
    "M8.5 4v13.5M15.5 6.5V20",
  ],
  "/stock-panol?tab=movimientos": [
    "M4 8h15M16 5l3 3-3 3",
    "M20 16H5M8 13l-3 3 3 3",
  ],
  "/motores-y-grupos": [
    "M8 5h6M11 5v3",
    "M4 11.5v5M4 14h2.5",
    "M6.5 8H15l2 2.5h1.5V9H21v8h-2.5v-1.5H17L15 18H9l-2.5-2.5z",
  ],
  // Flechas en círculo con un más: volver a pedir lo que se terminó.
  "/scan-pedido": [
    "M20 11.5a8 8 0 0 0-14.6-4.4",
    "M4 12.5a8 8 0 0 0 14.6 4.4",
    "M5 3.4v3.9h3.9M19 20.6v-3.9h-3.9",
    "M12 9v6M9 12h6",
  ],

  // ── Compras, catálogo y precios ───────────────────────────────────────
  "/compras": [
    "M2.5 3.5h2.3l2.4 11a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.4-1.1l1.8-6.6H5.9",
    circulo(9.5, 19.5, 1.4),
    circulo(17, 19.5, 1.4),
  ],
  // Fichas apiladas.
  "/catalogo-maestro": [
    caja(3, 7, 14, 13, 1.5),
    "M7 7V5a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-4",
    "M6 11.5h8M6 15h5",
  ],
  // Planilla: las listas de materiales.
  "/materiales": [
    caja(3, 4, 18, 16, 1.5),
    "M3 9h18M3 14.5h18M9 9v11",
  ],
  "/costo-barco": [
    caja(5, 2.5, 14, 19, 2),
    caja(8, 5.5, 8, 3.5, 0.8),
    punto(8.8, 13), punto(12, 13), punto(15.2, 13),
    punto(8.8, 17), punto(12, 17), punto(15.2, 17),
  ],
  "/precios": [
    "M3.5 4.5v7.3a1.5 1.5 0 0 0 .44 1.06l8.2 8.2a1.5 1.5 0 0 0 2.12 0l6.8-6.8a1.5 1.5 0 0 0 0-2.12l-8.2-8.2A1.5 1.5 0 0 0 11.8 3.5H4.5a1 1 0 0 0-1 1z",
    circulo(8, 8, 1.5),
  ],

  // ── Sólo en la portada ─────────────────────────────────────────────
  // Barras: los indicadores de stock de madera.
  "/admin": [
    "M3.5 20.5h17",
    "M7 17v-5M11 17V6.5M15 17v-3.5M19 17V9",
  ],
  "/movimientos": [
    "M4 8h15M16 5l3 3-3 3",
    "M20 16H5M8 13l-3 3 3 3",
  ],
  // Tablilla con renglones: órdenes de compra de madera.
  "/pedidos": [
    caja(5, 4.5, 14, 16.5, 2),
    caja(9, 3, 6, 3, 1),
    "M8.5 11h7M8.5 14.5h7M8.5 18h4",
  ],
  // Recorrido con origen y destino: la hoja de ruta del cadete.
  "/cadete": [
    circulo(6, 18, 2),
    circulo(18, 6, 2),
    "M8 18h7.5a3 3 0 0 0 0-6h-7a3 3 0 0 1 0-6H16",
  ],

  // ── Resto ──────────────────────────────────────────────────────────────
  // Ancla: los barcos ya entregados.
  "/postventa": [
    circulo(12, 5, 2),
    "M12 7v14M8.5 10.5h7",
    "M4.5 13.5A7.5 7.5 0 0 0 12 21a7.5 7.5 0 0 0 7.5-7.5",
    "M2.8 15.2l1.7-1.7 1.7 1.7M17.8 15.2l1.7-1.7 1.7 1.7",
  ],
  // Credencial: el fichero.
  "/rrhh": [
    caja(3, 5, 18, 14, 2),
    circulo(9, 10.8, 2),
    "M5.8 16.2c.6-1.6 1.8-2.4 3.2-2.4s2.6.8 3.2 2.4",
    "M15 10h3M15 13.5h3",
  ],
  // Reguladores: ajustes sin la rueda dentada genérica.
  "/configuracion": [
    "M4 7h9M17 7h3M4 17h3M11 17h9",
    circulo(15, 7, 2),
    circulo(9, 17, 2),
  ],
  // Manual con señalador.
  "/procedimientos": [
    "M5 19.5V5a2 2 0 0 1 2-2h12.5v15H7a2 2 0 0 0-2 2 2 2 0 0 0 2 2h12.5",
    "M10 3v6.5l2-1.5 2 1.5V3",
  ],
  // Salvavidas: pedir ayuda.
  "/tickets": [
    circulo(12, 12, 8.5),
    circulo(12, 12, 3.5),
    "M6 6l3.5 3.5M18 6l-3.5 3.5M6 18l3.5-3.5M18 18l-3.5-3.5",
  ],
};

export const ICONO_GENERICO = [circulo(12, 12, 4)];

/** El ícono de una ruta: primero el exacto (con ?tab=…), si no el de la ruta base. */
export function trazosDeRuta(ruta) {
  const texto = String(ruta ?? "");
  return ICONOS_KLASEA[texto] ?? ICONOS_KLASEA[texto.split("?")[0]] ?? null;
}
