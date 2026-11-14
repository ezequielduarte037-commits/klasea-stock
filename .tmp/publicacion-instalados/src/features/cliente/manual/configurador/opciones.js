/* ═══════════════════════════════════════════════════════════════
   Configurador · opciones
   Qué se puede cambiar del barco, las vistas de cámara y los climas.
   Los colores se aplican sobre los acabados del modelo (acabados.js).
═══════════════════════════════════════════════════════════════ */

// Muestras de los botones con tablas (maderas y pisos).
const tablas = (a, b) => `repeating-linear-gradient(100deg, ${a} 0 5px, ${b} 6px 8px, ${a} 9px 13px)`;

/* Mesadas: cuarzo Purastone, línea PURA (purastone.com), terminación pulida.
   Cada una es la foto de la placa hecha textura repetible en su tamaño real
   (scripts/purastone-mesadas.mjs). m: metros que cubre la textura (ancho y
   largo), según el grano y las vetas en las fotos de ambientes del
   fabricante; px: su tamaño; c: su color medio. */
export const PURASTONE = {
  "blanco-nube": { t: "Blanco Nube", m: [0.32, 0.32], px: [864, 864], c: "#ebece6" },
  "blanco-paloma": { t: "Blanco Paloma", m: [0.32, 0.32], px: [864, 864], c: "#e6e6e3" },
  statuarietto: { t: "Statuarietto", m: [0.8, 0.8], px: [864, 864], c: "#e6e4e3" },
  "estatuario-venato": { t: "Estatuario Venato", m: [1.28, 1.28], px: [678, 678], c: "#e0e1dc" },
  "calacatta-dor": { t: "Calacatta D'or", m: [1.44, 0.96], px: [1440, 960], c: "#e7e4e0" },
  "crema-pisa": { t: "Crema Pisa", m: [0.32, 0.32], px: [864, 864], c: "#c5b598" },
  "concrete-dark": { t: "Concrete Dark", m: [0.8, 0.8], px: [864, 864], c: "#9da1a8" },
  "nero-marquina": { t: "Nero Marquina", m: [1.2, 1.2], px: [864, 864], c: "#19191c" },
};
const pura = id => ({ id, t: PURASTONE[id].t, c: PURASTONE[id].c, textura: `purastone-${id}`, muestra: `url(/textures/purastone/${id}-m.jpg) center / cover` });

/* Cada capa de color pinta un grupo del modelo. zona "interior": se elige
   desde la vista interior. textura: "lisa" saca la foto del acabado (manda el
   color); "purastone-…" o "roble-…" las arma interior.js y traen su color (el
   de la opción es para el botón). Sin textura, el color tiñe la foto.
   nota: una línea debajo de las muestras. */
export const CAPAS = [
  {
    id: "casco", t: "Casco", grupo: "casco",
    ops: [
      { id: "artico", t: "Blanco Ártico", c: "#ffffff" },
      { id: "perla", t: "Gris Perla", c: "#c3c6c8" },
      { id: "arena", t: "Arena", c: "#c8b597" },
      { id: "oliva", t: "Verde Oliva", c: "#4b5242" },
      { id: "medianoche", t: "Azul Medianoche", c: "#1b2638" },
      { id: "grafito", t: "Grafito", c: "#393c40" },
      { id: "piano", t: "Negro Piano", c: "#0d0e0f" },
    ],
  },
  {
    id: "cubierta", t: "Cubierta", grupo: "cubierta",
    // Tonos bien separados: los claros muy parecidos (blanco, hueso, gris
    // niebla) al sol se veían todos blancos y parecía que no cambiaba nada.
    ops: [
      { id: "blanco", t: "Blanco", c: "#f6f6f3" },
      { id: "hueso", t: "Arena", c: "#d6c3a2" },
      { id: "niebla", t: "Gris perla", c: "#aeb3b6" },
      { id: "acero", t: "Gris acero", c: "#6f767b" },
      { id: "grafito", t: "Grafito", c: "#3d4044" },
      { id: "negro", t: "Negro", c: "#17181b" },
    ],
  },
  {
    id: "teca", t: "Teca", grupo: "teca",
    ops: [
      { id: "natural", t: "Teca natural", c: "#a8774a", teca: "natural" },
      { id: "plata", t: "Teca plateada", c: "#b8b2a7", teca: "gris" },
      { id: "carbon", t: "Sintética carbón", c: "#3b3129", teca: "oscura" },
    ],
  },
  {
    id: "tapizado", t: "Tapizados", grupo: "tapizado",
    // Cuero náutico en grises (el color cuero no se ofrece).
    ops: [
      { id: "piedra", t: "Gris piedra", c: "#a19e98" },
      { id: "perla", t: "Gris perla", c: "#cfcdc8" },
      { id: "grafito", t: "Grafito", c: "#4b4d50" },
      { id: "marfil", t: "Marfil", c: "#ece7dd" },
      { id: "marino", t: "Azul marino", c: "#27324a" },
      { id: "negro", t: "Negro", c: "#26272a" },
    ],
  },
  {
    id: "almohadon", t: "Almohadones", grupo: "almohadon",
    ops: [
      { id: "blanco", t: "Blanco", c: "#f2eee7" },
      { id: "arena", t: "Arena", c: "#d5c7b0" },
      { id: "humo", t: "Humo", c: "#8d8f92" },
      { id: "marino", t: "Marino", c: "#2e3a52" },
    ],
  },
  {
    id: "negro", t: "Hardtop y detalles", grupo: "negro",
    ops: [
      { id: "negro", t: "Negro brillante", c: "#2f3235" },
      { id: "titanio", t: "Titanio", c: "#6c6f73" },
      { id: "blanco", t: "Blanco", c: "#e9e9e6" },
    ],
  },
  // ── Interior ──
  {
    id: "tela", t: "Tapizados", grupo: "tela", zona: "interior",
    // Tela de lana con su trama en relieve; tonos neutros (nada de color cuero).
    ops: [
      { id: "lino", t: "Lino", c: "#e3dccf", textura: "lisa" },
      { id: "topo", t: "Gris topo", c: "#9d978e", textura: "lisa" },
      { id: "perla", t: "Gris perla", c: "#c9c6c0", textura: "lisa" },
      { id: "marfil", t: "Marfil", c: "#e4ddcf", textura: "lisa" },
      { id: "grafito", t: "Grafito", c: "#4a4c50", textura: "lisa" },
      { id: "marino", t: "Azul marino", c: "#2b344b", textura: "lisa" },
      { id: "salvia", t: "Verde salvia", c: "#8b9585", textura: "lisa" },
    ],
  },
  {
    id: "cojin", t: "Almohadones", grupo: "cojin", zona: "interior",
    ops: [
      { id: "arena", t: "Arena", c: "#d3c4ab" },
      { id: "lino", t: "Lino", c: "#ece6dc" },
      { id: "humo", t: "Humo", c: "#8c8e91" },
      { id: "marino", t: "Marino", c: "#2e3a52" },
      { id: "salvia", t: "Salvia", c: "#9aa596" },
    ],
  },
  {
    id: "mesada", t: "Mesadas", grupo: "piedra", zona: "interior", nota: "Cuarzo Purastone · línea PURA · pulido",
    ops: Object.keys(PURASTONE).map(pura),
  },
  {
    id: "madera", t: "Madera", grupo: "madera", zona: "interior",
    ops: [
      { id: "claro", t: "Roble claro", c: "#d6bda6", textura: "roble-claro", muestra: tablas("#d9c0a8", "#c8ad95") },
      { id: "natural", t: "Roble natural", c: "#b0a088", textura: "roble-natural", muestra: tablas("#b6a68c", "#a08f75") },
      { id: "blanqueado", t: "Roble blanqueado", c: "#d6cec0", textura: "roble-blanqueado", muestra: tablas("#d8d0c2", "#c6bdae") },
      { id: "ahumado", t: "Roble ahumado", c: "#7c746a", textura: "roble-ahumado", muestra: tablas("#80786e", "#6b645b") },
      { id: "nogal", t: "Nogal", c: "#62463a", textura: "roble-nogal", muestra: tablas("#664a38", "#523a2b") },
    ],
  },
  {
    id: "piso", t: "Piso", grupo: "piso", zona: "interior",
    ops: [
      { id: "roble", t: "Roble claro", c: "#ceb69a", textura: "piso-claro", muestra: tablas("#cdb79c", "#bba487") },
      { id: "gris", t: "Roble gris", c: "#b0aaa2", textura: "piso-gris", muestra: tablas("#aaa59d", "#97928a") },
      { id: "nogal", t: "Nogal", c: "#745842", textura: "piso-nogal", muestra: tablas("#7b604b", "#67503d") },
    ],
  },
];

export const CAPAS_EXTERIOR = CAPAS.filter(c => c.zona !== "interior");
export const CAPAS_INTERIOR = CAPAS.filter(c => c.zona === "interior");

export const ELECCION_INICIAL = Object.fromEntries(CAPAS.map(c => [c.id, c.ops[0].id]));

/* Estilos completos: un toque y cambia todo el barco. */
export const ESTILOS = [
  { id: "klasea", t: "Klase A", d: "Blanco, teca clara y tapizados gris piedra. El clásico de la casa.", e: { casco: "artico", cubierta: "blanco", teca: "natural", tapizado: "piedra", almohadon: "blanco", negro: "negro" } },
  { id: "tendencia", t: "Marcando tendencia", d: "Casco negro piano, cubierta grafito y tapizados marfil.", e: { casco: "piano", cubierta: "grafito", teca: "carbon", tapizado: "marfil", almohadon: "blanco", negro: "negro" } },
  { id: "riviera", t: "Riviera", d: "Azul medianoche con teca natural, como en la Costa Azul.", e: { casco: "medianoche", cubierta: "blanco", teca: "natural", tapizado: "perla", almohadon: "marino", negro: "titanio" } },
  { id: "explorer", t: "Explorer", d: "Oliva, teca plateada y piedra. Para salir lejos.", e: { casco: "oliva", cubierta: "hueso", teca: "plata", tapizado: "grafito", almohadon: "arena", negro: "negro" } },
  { id: "costa", t: "Costa", d: "Arena y hueso, todo claro y cálido.", e: { casco: "arena", cubierta: "hueso", teca: "natural", tapizado: "perla", almohadon: "arena", negro: "titanio" } },
];

/* Ambientes del interior: un toque y cambia todo adentro. */
export const AMBIENTES = [
  { id: "klasea", t: "Klase A", d: "Lino, roble claro y cuarzo Blanco Nube, como en los barcos del astillero.", e: { tela: "lino", cojin: "arena", mesada: "blanco-nube", madera: "claro", piso: "roble" } },
  { id: "nordico", t: "Nórdico", d: "Gris perla, roble blanqueado y Statuarietto.", e: { tela: "perla", cojin: "lino", mesada: "statuarietto", madera: "blanqueado", piso: "roble" } },
  { id: "contemporaneo", t: "Contemporáneo", d: "Grafito, nogal y Nero Marquina. Profundo y elegante.", e: { tela: "grafito", cojin: "humo", mesada: "nero-marquina", madera: "nogal", piso: "nogal" } },
  { id: "riviera", t: "Riviera", d: "Azul marino, roble natural y Calacatta D'or.", e: { tela: "marino", cojin: "lino", mesada: "calacatta-dor", madera: "natural", piso: "roble" } },
  { id: "costa", t: "Costa", d: "Salvia, roble ahumado y Crema Pisa.", e: { tela: "salvia", cojin: "arena", mesada: "crema-pisa", madera: "ahumado", piso: "gris" } },
  { id: "urbano", t: "Urbano", d: "Gris topo, roble ahumado y Concrete Dark.", e: { tela: "topo", cojin: "humo", mesada: "concrete-dark", madera: "ahumado", piso: "gris" } },
  { id: "sereno", t: "Sereno", d: "Marfil, roble natural y Estatuario Venato.", e: { tela: "marfil", cojin: "lino", mesada: "estatuario-venato", madera: "natural", piso: "roble" } },
];

export function opcionDe(capa, id) {
  const c = CAPAS.find(x => x.id === capa);
  return c?.ops.find(o => o.id === id) || c?.ops[0];
}

/* Lo guardado en el dispositivo, sin las opciones que ya no existen (las
   mesadas de antes de Purastone, p. ej.): esas vuelven a la de fábrica. */
export function eleccionValida(guardada) {
  return Object.fromEntries(Object.entries(guardada || {})
    .filter(([capa, id]) => CAPAS.find(c => c.id === capa)?.ops.some(o => o.id === id)));
}

/* Vistas de cámara. foco: punto del barco (u: 0 popa → 1 proa, alto en
   puntales sobre la cubierta) o un equipo del modelo (ancla).
   az: 0 mira desde proa, 90 desde babor; el: elevación; dist: en esloras. */
export const VISTAS = [
  { id: "tres", t: "Tres cuartos", foco: { u: 0.5, alto: 0.6 }, az: 38, el: 13, dist: 1.25 },
  { id: "perfil", t: "Perfil", foco: { u: 0.5, alto: 0.5 }, az: 90, el: 3, dist: 1.4 },
  { id: "proa", t: "Proa", foco: { u: 0.85, alto: 0.4 }, az: 18, el: 16, dist: 0.85 },
  { id: "popa", t: "Popa", foco: { u: 0.08, alto: 0.4 }, az: 158, el: 14, dist: 0.8 },
  { id: "balcones", t: "Balcones", foco: { u: 0.12, alto: 0.2 }, az: 128, el: 26, dist: 0.62 },
  { id: "solarium", t: "Solárium", foco: { u: 0.8, alto: 0.9 }, az: 120, el: 42, dist: 0.45 },
  { id: "cockpit", t: "Cockpit", foco: { ancla: "timon", u: 0.5, alto: 1 }, az: 205, el: 30, dist: 0.36 },
  { id: "cenital", t: "Cenital", foco: { u: 0.5, alto: 0.4 }, az: 90, el: 84, dist: 1.5 },
];

/* Clima: cómo se ve el cielo y el mar. Los valores se interpolan al cambiar. */
export const CLIMAS = [
  { id: "sol", t: "Soleado" },
  { id: "nubes", t: "Nublado" },
  { id: "lluvia", t: "Lluvia" },
];

export const HORA_MIN = 5;
export const HORA_MAX = 22;

export function textoHora(h) {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60 / 5) * 5;
  return `${String(hh + (mm === 60 ? 1 : 0)).padStart(2, "0")}:${String(mm === 60 ? 0 : mm).padStart(2, "0")}`;
}
