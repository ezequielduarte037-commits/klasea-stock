// Cómo se elige cada cosa de la memoria. Lógica pura.
//
// Cada definición tiene un tipo según lo que de verdad se decide:
//   opciones  una cosa de una lista (madera, piso interior, color de casco…)
//   lleva     lleva o no lleva y, si lleva, cuál (grupo electrógeno, alfombra…)
//   ambientes una elección por lugar del barco (mesadas: cocina, baños, cockpit)
//   lista     varias cosas (electrónica, audio, lonería extra)
//   texto     datos del cliente
// Las opciones salen de lo que se cargó en las memorias reales de cada línea.
// Siempre queda "Otro" para escribir algo que no está.
import { PALETAS, buscarMuestra, claveSimple, sinTildes } from "./acabados";

export const NO_LLEVA = "No lleva";

const MOTORES = {
  K37: ["2× Volvo D3 270 HP", "2× Mercury 270 HP fuera de borda", "2× Mercury Verado 400 fuera de borda", "2× Mercury 450 fuera de borda", "Iveco 400 línea de eje", "Volvo 320 V-Drive", "Volvo D6 380 HP"],
  K42: ["2× Iveco 400 HP", "2× Iveco 450 HP", "2× Volvo 440 HP"],
  K43: ["2× Iveco 450 HP", "2× Iveco 570 HP"],
  K52: ["2× Iveco 570 HP", "2× Volvo 550 HP", "2× Iveco 650 HP"],
  K55: ["Volvo 715", "Volvo 725", "2× Iveco 630 HP"],
  K64: ["2× Iveco 1000 HP"],
  Hunter: ["Volvo diésel 300 HP", "Volvo diésel 320 HP"],
};

const TECHOS = {
  base: ["Soft top", "Hard top", "Open"],
  grandes: ["Hard top", "Fly abierto", "Fly cerrado (salón)"],
};

export const DECISIONES = {
  propietario: { tipo: "texto", label: "Propietario", placeholder: "Nombre del cliente" },
  nombre_barco: { tipo: "texto", label: "Nombre del barco", placeholder: "Si ya lo eligieron" },
  constructor: { tipo: "texto", label: "Constructor", placeholder: "Nombre" },

  motorizacion: {
    tipo: "opciones", label: "Motorización",
    opciones: (linea) => MOTORES[linea] || [...new Set(Object.values(MOTORES).flat())],
    otro: "Otra: cantidad, marca, potencia y transmisión",
  },
  grupo_electrogeno: {
    tipo: "lleva", label: "Grupo electrógeno",
    modelos: ["Kohler 7 kVA", "Kohler 9 kVA", "Onan 6 kVA", "Onan 9,5 kVA", "Onan 13,5 kVA", "Coldmaster", "Mase 6 kVA"],
    otro: "Otro: marca y kVA",
  },
  color_casco: {
    tipo: "opciones", label: "Color de casco", paletas: ["pintura"], sinNoLleva: true,
    complementos: ["Fondo con antifouling", "Fondo convencional", "Con bandas"],
    otro: "Otro color (código o muestra)",
  },
  cabina: {
    tipo: "opciones", label: "Techo",
    opciones: (linea) => (["K55", "K64", "K85"].includes(linea) ? TECHOS.grandes : TECHOS.base),
    sinNoLleva: true, otro: "Otro",
  },
  teca_tipo: { tipo: "opciones", label: "Piso del cockpit", paletas: ["cubiertas"], otro: "Otro material" },

  madera_muebles: { tipo: "opciones", label: "Madera de muebles", paletas: ["maderas"], sinNoLleva: true, otro: "Otra madera o melamina" },
  piso: { tipo: "opciones", label: "Piso interior", paletas: ["pisos"], otro: "Otro piso: marca y código", nota: "Ej.: también en camarotes" },
  alfombra: { tipo: "lleva", label: "Alfombra", modelos: ["Pallas 190", "Hard Twist 01", "Velour Plus", "Espartano HT05"], otro: "Otro modelo" },
  color_mesadas: {
    tipo: "ambientes", label: "Mesadas", paletas: ["piedras"],
    ambientes: [{ key: "cocina", label: "Cocina" }, { key: "banos", label: "Baños" }, { key: "cockpit", label: "Cockpit" }],
    otro: "Otra piedra",
  },

  tapiceria_mamparos: { tipo: "opciones", paletas: ["vinilos"], otro: "Otro: marca y color" },
  tapiceria_dinette: { tipo: "opciones", paletas: ["vinilos", "telas"], otro: "Otro: marca y color" },
  tapiceria_respaldos: { tipo: "opciones", paletas: ["telas", "vinilos"], otro: "Otro: marca y color" },
  tapiceria_exterior: { tipo: "opciones", paletas: ["vinilos"], otro: "Otro: marca y color" },
  color_acolchados: { tipo: "opciones", label: "Acolchados", paletas: ["telas"], otro: "Otra tela: marca y color" },
  color_cerramientos: {
    tipo: "opciones", label: "Cerramientos", paletas: ["lonas"],
    complementos: ["Con mosquitero", "Con bimini"], otro: "Otro color de lona",
  },

  loneria_toldo_proa: { tipo: "lleva", label: "Toldo de proa", paletaModelos: "lonas", otro: "Otro color de lona" },
  loneria_cobertor: { tipo: "lleva", label: "Cobertor", paletaModelos: "lonas", otro: "Otro color de lona" },
  loneria_otros: {
    tipo: "lista",
    sugeridos: ["Cerramiento de popa", "Cerramiento de proa", "Cubre tambucho", "Mosquitero", "Bimini"],
    otro: "Qué más lleva de lonería",
  },

  electronica: {
    tipo: "lista", label: "Electrónica",
    sugeridos: ["Plotter Garmin", "Plotter Simrad", "VHF", "Piloto automático", "AIS", "Sonda", "Cámaras", "Joystick", "Lo trae el cliente"],
    otro: "Equipos y modelos (uno por línea)",
  },
  audio: {
    tipo: "lista", label: "Audio",
    sugeridos: ["Equipo estándar", "Fusion", "JL Audio", "Parlantes en cockpit", "Parlantes en proa", "Subwoofer", "Potencia", "Luces LED RGB", "Lo trae el cliente"],
    otro: "Equipo, parlantes y dónde van",
  },
  tv_camarote: { tipo: "lleva", label: "TV camarote de popa", modelos: [], otro: "Pulgadas o modelo" },
  tv_cockpit: { tipo: "lleva", label: "TV cockpit", modelos: [], otro: "Pulgadas o modelo" },

  adicionales: { tipo: "notas", label: "Notas del cliente" },
};

// ── Leer lo cargado ─────────────────────────────────────────────────────────
const ES_NO = /^(no|sin|no va|no lleva)\b/;
const PREFIJO_SI = /^\s*(si|sí|x)\s*[/:-]\s*/i;

export function esNoLleva(valor) {
  return ES_NO.test(sinTildes(valor));
}

// Las opciones de una definición para esta línea: [{ nombre, tex, grupo }].
export function opcionesDe(key, linea) {
  const d = DECISIONES[key];
  if (!d) return [];
  const out = [];
  for (const p of d.paletas || []) {
    for (const x of PALETAS[p].muestras) out.push({ nombre: x.nombre, tex: x.tex, conMuestra: true, grupo: d.paletas.length > 1 ? PALETAS[p].titulo : null });
  }
  if (typeof d.opciones === "function") for (const nombre of d.opciones(linea)) out.push({ nombre, tex: null, conMuestra: false, grupo: null });
  return out;
}

function encontrar(key, linea, texto) {
  const d = DECISIONES[key];
  for (const p of d?.paletas || []) {
    const x = buscarMuestra(p, texto);
    if (x) return { nombre: x.nombre, tex: x.tex, conMuestra: true };
  }
  const clave = claveSimple(texto);
  const op = typeof d?.opciones === "function" ? d.opciones(linea).find((n) => claveSimple(n) === clave) : null;
  return op ? { nombre: op, tex: null, conMuestra: false } : null;
}

// Separa "Blanco · Fondo con antifouling" en la elección y sus agregados.
export function leerOpciones(key, linea, valor) {
  const d = DECISIONES[key] || {};
  const texto = String(valor ?? "").trim();
  if (!texto) return { vacio: true };
  if (esNoLleva(texto) && !d.sinNoLleva) return { noLleva: true, detalle: texto.replace(/^\s*no( lleva| va)?\s*[/:-]?\s*/i, "") };
  const limpio = texto.replace(PREFIJO_SI, "");
  // "Si" a secas en el piso del cockpit era "lleva teca" en la planilla vieja.
  if (key === "teca_tipo" && /^(si|sí|x)$/i.test(limpio)) return { eleccion: encontrar(key, linea, "Teca"), complementos: [], texto: "Teca" };
  const partes = limpio.split(/\s+·\s+/);
  const complementos = [];
  const resto = [];
  for (const p of partes) {
    const c = (d.complementos || []).find((x) => claveSimple(x) === claveSimple(p));
    if (c) complementos.push(c); else resto.push(p);
  }
  const principal = resto.join(" · ");
  return { eleccion: encontrar(key, linea, principal), principal, complementos, texto: principal };
}

export function armarOpciones(principal, complementos = []) {
  return [principal, ...complementos].filter((x) => String(x || "").trim()).join(" · ");
}

// "No", "Si / Kohler 9 kVA", "Kohler 9 kVA", "Lleva".
export function leerLleva(valor) {
  const texto = String(valor ?? "").trim();
  if (!texto) return { vacio: true };
  if (esNoLleva(texto)) return { noLleva: true, detalle: texto.replace(/^\s*(no( lleva| va)?|sin)\s*[/:-]?\s*/i, "") };
  const modelo = texto.replace(PREFIJO_SI, "").replace(/^(si|sí|lleva)$/i, "");
  return { lleva: true, modelo };
}

export function armarLleva({ noLleva, modelo }) {
  if (noLleva) return NO_LLEVA;
  return String(modelo || "").trim() || "Lleva";
}

// Mesadas: "Cocina: X · Baños: Y · Cockpit: Z" (o una sola si es todo igual).
// Lee también lo escrito a mano ("Baño y Cockpit: Puraprima / Cocina: …").
const LUGARES = [
  { key: "cocina", re: /\bcoc(ina)?\b/ },
  { key: "banos", re: /ba[nñ]/ },
  { key: "cockpit", re: /cockpit|exterior/ },
];

export function leerAmbientes(valor) {
  const texto = String(valor ?? "").trim();
  if (!texto) return { vacio: true };
  if (esNoLleva(texto)) return { noLleva: true };
  const encabezado = /((?:cocina|coc|baños?|baño|bañ|banos?|cockpit|exterior|mesada de cockpit)(?:\s*(?:y|,|\/)\s*(?:cocina|coc|baños?|baño|bañ|banos?|cockpit|exterior))*)\s*[:;]/gi;
  const marcas = [...texto.matchAll(encabezado)];
  if (!marcas.length) return { todo: texto.replace(/\s*\(?(todo el barco|barco completo|completo)\)?\s*$/i, "").replace(/^todo\s+/i, "") };
  // Si antes del primer "Cocina:" hay algo escrito, no se entiende bien: se deja como está.
  if (/[a-z]/i.test(texto.slice(0, marcas[0].index))) return { todo: texto };
  const out = {};
  marcas.forEach((mm, i) => {
    const desde = mm.index + mm[0].length;
    const hasta = i + 1 < marcas.length ? marcas[i + 1].index : texto.length;
    const valorLugar = texto.slice(desde, hasta).replace(/[\s·/;,.-]+$/, "").replace(/^[\s:]+/, "").replace(/\(purastone\)/i, "").replace(/\s+/g, " ").trim();
    const cabeza = sinTildes(mm[1]);
    for (const l of LUGARES) if (l.re.test(cabeza)) out[l.key] = valorLugar;
  });
  return { porLugar: out };
}

export function armarAmbientes({ todo, porLugar }, ambientes) {
  if (todo != null) return String(todo).trim();
  const valores = ambientes.map((a) => [a, String(porLugar?.[a.key] || "").trim()]);
  const llenos = valores.filter(([, v]) => v);
  if (!llenos.length) return "";
  if (llenos.length === ambientes.length && llenos.every(([, v]) => claveSimple(v) === claveSimple(llenos[0][1]))) return llenos[0][1];
  return llenos.map(([a, v]) => `${a.label}: ${v}`).join(" · ");
}

// Lo que se muestra en la tarjeta: { estado: "vacio"|"no"|"ok", texto, sub, tex, filas }.
export function mostrar(campo, valor, linea) {
  const d = DECISIONES[campo.key] || {};
  const tipo = d.tipo || campo.tipo;
  if (tipo === "opciones") {
    const l = leerOpciones(campo.key, linea, valor);
    if (l.vacio) return { estado: "vacio" };
    if (l.noLleva) return { estado: "no", texto: NO_LLEVA, sub: l.detalle };
    return { estado: "ok", texto: l.eleccion?.nombre || l.texto, tex: l.eleccion?.tex, conMuestra: !!l.eleccion?.conMuestra || !!d.paletas, sub: l.complementos.join(" · ") };
  }
  if (tipo === "lleva") {
    const l = leerLleva(valor);
    if (l.vacio) return { estado: "vacio" };
    if (l.noLleva) return { estado: "no", texto: NO_LLEVA, sub: l.detalle };
    const muestra = d.paletaModelos ? buscarMuestra(d.paletaModelos, l.modelo) : null;
    return { estado: "ok", texto: l.modelo || "Lleva", sub: l.modelo ? "" : "Falta el modelo", tex: muestra?.tex, conMuestra: !!d.paletaModelos };
  }
  if (tipo === "ambientes") {
    const l = leerAmbientes(valor);
    if (l.vacio) return { estado: "vacio" };
    if (l.noLleva) return { estado: "no", texto: NO_LLEVA };
    if (l.todo != null) {
      const x = buscarMuestra("piedras", l.todo);
      return { estado: "ok", texto: x?.nombre || l.todo, tex: x?.tex, conMuestra: true, sub: "En todo el barco" };
    }
    const filas = d.ambientes.map((a) => {
      const v = l.porLugar[a.key];
      const x = v ? buscarMuestra("piedras", v) : null;
      return { label: a.label, texto: x?.nombre || v || "", tex: x?.tex };
    });
    return { estado: "ok", filas };
  }
  const texto = String(valor ?? "").trim();
  if (!texto) return { estado: "vacio" };
  if (tipo === "lista" && esNoLleva(texto)) return { estado: "no", texto: NO_LLEVA, sub: texto.replace(/^\s*no\s*[/:-]?\s*/i, "") };
  if (tipo === "lista" && /^(si|sí)$/i.test(texto)) return { estado: "ok", texto: "Lleva", sub: "Falta el detalle" };
  return { estado: "ok", texto: texto.replace(PREFIJO_SI, "") };
}
