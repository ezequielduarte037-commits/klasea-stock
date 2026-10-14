/* ═══════════════════════════════════════════════════════════════
   Configurador · opciones
   Qué se puede cambiar del barco, las vistas de cámara y los climas.
   Los colores se aplican sobre los acabados del modelo (acabados.js).
═══════════════════════════════════════════════════════════════ */

/* Cada capa de color pinta un grupo del modelo. */
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
];

export const ELECCION_INICIAL = Object.fromEntries(CAPAS.map(c => [c.id, c.ops[0].id]));

/* Estilos completos: un toque y cambia todo el barco. */
export const ESTILOS = [
  { id: "klasea", t: "Klase A", d: "Blanco, teca clara y tapizados gris piedra. El clásico de la casa.", e: { casco: "artico", cubierta: "blanco", teca: "natural", tapizado: "piedra", almohadon: "blanco", negro: "negro" } },
  { id: "tendencia", t: "Marcando tendencia", d: "Casco negro piano, cubierta grafito y tapizados marfil.", e: { casco: "piano", cubierta: "grafito", teca: "carbon", tapizado: "marfil", almohadon: "blanco", negro: "negro" } },
  { id: "riviera", t: "Riviera", d: "Azul medianoche con teca natural, como en la Costa Azul.", e: { casco: "medianoche", cubierta: "blanco", teca: "natural", tapizado: "perla", almohadon: "marino", negro: "titanio" } },
  { id: "explorer", t: "Explorer", d: "Oliva, teca plateada y piedra. Para salir lejos.", e: { casco: "oliva", cubierta: "hueso", teca: "plata", tapizado: "grafito", almohadon: "arena", negro: "negro" } },
  { id: "costa", t: "Costa", d: "Arena y hueso, todo claro y cálido.", e: { casco: "arena", cubierta: "hueso", teca: "natural", tapizado: "perla", almohadon: "arena", negro: "titanio" } },
];

export function opcionDe(capa, id) {
  const c = CAPAS.find(x => x.id === capa);
  return c?.ops.find(o => o.id === id) || c?.ops[0];
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
