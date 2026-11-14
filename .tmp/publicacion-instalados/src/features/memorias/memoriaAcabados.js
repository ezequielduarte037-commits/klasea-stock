// Texturas generativas y datos demo del selector de acabados.
// En un archivo propio para que MemoriaSelector.jsx exporte solo el componente
// (Fast Refresh) y para que MemoriasScreen pueda armar sus familias con fotos
// reales importando los helpers desde aca.

/* ── Texturas generativas (fallback cuando un acabado no tiene foto) ────────── */
// Sin comillas ni paréntesis crudos: estos strings terminan dentro de style="",
// y una comilla o un ")" sin codificar corta el atributo y mata la textura.
const NOISE = "url(data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%27120%27%20height=%27120%27%3E%3Cfilter%20id=%27n%27%3E%3CfeTurbulence%20type=%27fractalNoise%27%20baseFrequency=%27.9%27%20numOctaves=%272%27/%3E%3CfeColorMatrix%20values=%270%200%200%200%200%200%200%200%200%200%200%200%200%200%200%200%200%200%20.05%200%27/%3E%3C/filter%3E%3Crect%20width=%27120%27%20height=%27120%27%20filter=%27url%28%23n%29%27/%3E%3C/svg%3E)";

export const texPiedra = (c1, c2, vein) =>
  `${NOISE},` +
  `linear-gradient(112deg,transparent 44%,${vein} 46.5%,transparent 48%),` +
  `linear-gradient(96deg,transparent 66%,${vein} 68%,transparent 70.5%),` +
  `linear-gradient(128deg,transparent 22%,${vein} 23%,transparent 25%),` +
  `radial-gradient(130% 90% at 24% 12%,${c2} 0%,transparent 58%),` +
  `linear-gradient(155deg,${c1},${c2})`;
export const texMadera = (c1, c2, c3) =>
  `${NOISE},` +
  `linear-gradient(180deg,rgba(255,255,255,.10),transparent 32%,rgba(0,0,0,.14)),` +
  `repeating-linear-gradient(92deg,${c1} 0 9px,${c2} 9px 12px,${c1} 12px 26px,${c3} 26px 28px)`;
export const texPiso = (c1, c2, line) =>
  `${NOISE},` +
  `repeating-linear-gradient(0deg,${c1} 0 32px,${line} 32px 35px,${c2} 35px 67px,${line} 67px 70px)`;
export const texTela = (c1, c2) =>
  `${NOISE},` +
  `repeating-linear-gradient(45deg,${c1} 0 3px,${c2} 3px 6px),` +
  `repeating-linear-gradient(-45deg,transparent 0 3px,rgba(0,0,0,.07) 3px 6px)`;
export const texLona = (c1, c2) =>
  `${NOISE},` +
  `repeating-linear-gradient(90deg,${c1} 0 4px,${c2} 4px 8px),` +
  `repeating-linear-gradient(0deg,transparent 0 4px,rgba(0,0,0,.05) 4px 8px)`;

/* ── Datos demo (los reales los arma MemoriasScreen con las fotos) ───────────
   Cada familia declara sus `ambientes`: los campos de la memoria que aceptan
   sus acabados ({ key, label }). El selector arma progreso y resumen con eso. */
export const FAMILIAS_DEMO = [
  { id: "piedras", nombre: "Piedras", hint: "Mesadas y superficies", cover: 2,
    ambientes: [{ key: "color_mesadas", label: "Mesadas" }],
    items: [
    { nombre: "Black", tex: texPiedra("#141416", "#2b2b30", "rgba(255,255,255,.10)") },
    { nombre: "Entzo", tex: texPiedra("#8a7f72", "#6e655b", "rgba(255,255,255,.16)") },
    { nombre: "Travertino", tex: texPiedra("#c9bfae", "#b0a48e", "rgba(120,105,80,.28)") },
    { nombre: "Aria", tex: texPiedra("#dcdad5", "#c2beb6", "rgba(110,110,115,.26)") },
    { nombre: "Dessert", tex: texPiedra("#cfc0a5", "#b3a284", "rgba(255,255,255,.30)") },
  ] },
  { id: "maderas", nombre: "Maderas", hint: "Interiores y mobiliario", cover: 1,
    ambientes: [{ key: "madera_muebles", label: "Madera muebles" }],
    items: [
    { nombre: "Silver", tex: texMadera("#b6afa4", "#a49d90", "#8f887c") },
    { nombre: "Oak", tex: texMadera("#b08d5f", "#9d7a4d", "#8a6a41") },
    { nombre: "Walnut", tex: texMadera("#6b4e37", "#5a412e", "#4a3526") },
    { nombre: "Grey", tex: texMadera("#8d8a84", "#7d7a74", "#6d6a65") },
    { nombre: "Choco", tex: texMadera("#4e3527", "#402b20", "#332218") },
    { nombre: "Cedar", tex: texMadera("#a2653d", "#8f5734", "#7b4a2c") },
  ] },
  { id: "pisos", nombre: "Pisos", hint: "Cubierta e interiores", cover: 3,
    ambientes: [
      { key: "piso", label: "Piso" },
      { key: "alfombra", label: "Alfombra" },
      { key: "teca_tipo", label: "Teca" },
    ],
    items: [
    { nombre: "White", tex: texPiso("#e6e2d8", "#dcd7cb", "#b9b3a5") },
    { nombre: "Infinity", tex: texPiso("#9a958c", "#8e8981", "#6f6a62") },
    { nombre: "Seadek", tex: texPiso("#5a5c5e", "#525456", "#3c3e40") },
    { nombre: "Sand", tex: texPiso("#cfc2a8", "#c4b699", "#a4977c") },
  ] },
  { id: "telas", nombre: "Telas", hint: "Tapicería interior", cover: 0,
    ambientes: [
      { key: "tapiceria_mamparos", label: "Mamparos" },
      { key: "tapiceria_dinette", label: "Dinette" },
      { key: "tapiceria_respaldos", label: "Respaldos" },
      { key: "tapiceria_exterior", label: "Tapicería exterior" },
      { key: "color_acolchados", label: "Acolchados" },
    ],
    items: [
    { nombre: "Shani", tex: texTela("#d8cdbb", "#cec2ae") },
    { nombre: "Bhanu", tex: texTela("#a9998a", "#9d8d7e") },
    { nombre: "Charcoal", tex: texTela("#4c4c50", "#434347") },
    { nombre: "Black", tex: texTela("#26262a", "#1f1f23") },
    { nombre: "Pearl", tex: texTela("#e5e2da", "#dbd8cf") },
    { nombre: "Navy", tex: texTela("#2b3a55", "#24324a") },
  ] },
  { id: "lonas", nombre: "Lonas", hint: "Exterior y cerramientos", cover: 4,
    ambientes: [
      { key: "loneria_toldo_proa", label: "Toldo proa" },
      { key: "loneria_cobertor", label: "Cobertor" },
      { key: "loneria_otros", label: "Otros" },
      { key: "color_cerramientos", label: "Cerramientos" },
    ],
    items: [
    { nombre: "Black", tex: texLona("#26262a", "#2d2d32") },
    { nombre: "Charcoal", tex: texLona("#47484c", "#4f5054") },
    { nombre: "Grey", tex: texLona("#8b8d90", "#94969a") },
    { nombre: "White", tex: texLona("#e8e6df", "#efede7") },
    { nombre: "Beige", tex: texLona("#cbbfa8", "#d3c8b2") },
  ] },
];

