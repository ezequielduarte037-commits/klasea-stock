// Qué lleva la memoria de cada barco y cómo se lee. Lógica pura (sin React ni
// Supabase).
//
// Los campos por línea salen de MEMORIA_FIELDS_BY_TIPO (la misma plantilla que
// usa el mapa del galpón); acá se agrupan en secciones, se decide qué cuenta
// como "definido" y se arman las sugerencias con lo que se eligió en otros
// barcos.
import { MEMORIA_FIELDS_BY_TIPO } from "@/features/obras/mapa/memoriaFields";
import { claveObra } from "@/features/equipos/equiposModelo";
import { MEMORIA_EXCEL_SEED } from "./memoriaExcelSeed";
import { sinTildes } from "./acabados";

export const NO_LLEVA = "No lleva";

// Equipos que se marcan Sí / No. null = todavía no se sabe.
export const EQUIPOS = [
  "starlink", "radar", "plotter", "faro", "pluma", "mesa_fly", "fabricadora_hielo",
  "aire_acondicionado", "calefactor", "bow_thruster", "sternthruster", "flaps", "planchada",
];

export const ETIQUETAS_EQUIPO = {
  starlink: "Starlink",
  radar: "Radar",
  plotter: "Plotter",
  faro: "Faro",
  pluma: "Pluma",
  mesa_fly: "Mesa fly",
  fabricadora_hielo: "Fabricadora de hielo",
  aire_acondicionado: "Aire acondicionado",
  calefactor: "Calefactor",
  bow_thruster: "Bow thruster",
  sternthruster: "Stern thruster",
  flaps: "Flaps",
  planchada: "Planchada",
};

// Secciones de la ficha, en el orden en que se suele charlar con el cliente.
// `usan`: quién trabaja con esos datos (se muestra para que se entienda para
// qué sirve completarlos).
export const SECCIONES = [
  { key: "cliente", label: "Cliente", campos: ["propietario", "nombre_barco", "constructor"], usan: [] },
  { key: "casco", label: "Casco y motor", campos: ["motorizacion", "grupo_electrogeno", "color_casco", "cabina", "teca_tipo"], usan: ["Laminación", "Compras"] },
  { key: "interior", label: "Interior", campos: ["madera_muebles", "piso", "alfombra", "color_mesadas"], usan: ["Muebles", "Marmolería"] },
  { key: "tapiceria", label: "Tapicería", campos: ["tapiceria_mamparos", "tapiceria_dinette", "tapiceria_respaldos", "tapiceria_exterior", "color_acolchados", "color_cerramientos"], usan: ["Tapicería"] },
  { key: "loneria", label: "Lonería", campos: ["loneria_toldo_proa", "loneria_cobertor", "loneria_otros"], usan: ["Tapicería"] },
  { key: "electronica", label: "Electrónica y audio", campos: ["electronica", "audio", "tv_camarote", "tv_cockpit"], usan: ["Compras", "Electricidad"] },
  { key: "equipos", label: "Equipamiento", campos: EQUIPOS, usan: ["Compras"] },
  { key: "adicionales", label: "Adicionales", campos: ["adicionales"], usan: ["Compras", "Pañol"] },
];

const LARGOS = new Set(["electronica", "audio", "loneria_otros", "adicionales", "color_cerramientos"]);
const SIN_SUGERENCIAS = new Set(["propietario", "nombre_barco", "adicionales"]);

// "52-27" → "k52"; "HUNTER-H-175" → "kH". Lo que no se reconoce usa la K52.
export function tipoDeObra(obra) {
  const clave = claveObra(obra?.codigo) || "";
  if (/^H\d+/.test(clave)) return "kH";
  const m = clave.match(/^(\d{2})-/);
  if (m && MEMORIA_FIELDS_BY_TIPO[`k${m[1]}`]) return `k${m[1]}`;
  return "default";
}

export function lineaDeObra(obra) {
  if (obra?.linea_nombre) return obra.linea_nombre;
  const clave = claveObra(obra?.codigo) || "";
  if (/^H\d+/.test(clave)) return "Hunter";
  if (/^A\d+/.test(clave)) return "Antago";
  const m = clave.match(/^(\d{2})-/);
  return m ? `K${m[1]}` : "Otros";
}

// Número de modelo de la matriz ("52"), para las opciones de línea.
export function modeloDeObra(obra) {
  const m = (claveObra(obra?.codigo) || "").match(/^(\d{2})-/);
  return m ? m[1] : null;
}

// Los campos de un barco, con su sección y tipo de control.
//   tipo: "texto" | "largo" | "si_no" | "opciones"
//   extra: equipos que la plantilla de la línea no trae (van en "Más equipos").
export function camposDeObra(obra) {
  const plantilla = MEMORIA_FIELDS_BY_TIPO[tipoDeObra(obra)] || MEMORIA_FIELDS_BY_TIPO.default;
  const porClave = new Map();
  for (const d of plantilla) if (!porClave.has(d.key)) porClave.set(d.key, d);
  const campos = [];
  for (const seccion of SECCIONES) {
    for (const key of seccion.campos) {
      const d = porClave.get(key);
      const esEquipo = EQUIPOS.includes(key);
      // El nombre del barco no está en todas las plantillas pero siempre se
      // puede cargar (no cuenta para el avance: se suele decidir al final).
      const siempre = key === "nombre_barco";
      if (!d && !esEquipo && !siempre) continue;
      campos.push({
        key,
        seccion: seccion.key,
        label: d?.label || ETIQUETAS_EQUIPO[key] || (siempre ? "Nombre del barco" : key),
        tipo: esEquipo ? "si_no" : d?.type === "selector" ? "opciones" : LARGOS.has(key) || d?.wide ? "largo" : "texto",
        opciones: d?.type === "selector" ? (d.opts || []).filter((o) => o.val).map((o) => ({ valor: o.val, label: o.label })) : null,
        extra: (esEquipo || siempre) && !d,
      });
    }
  }
  return campos;
}

export function estaDefinido(campo, valor) {
  if (campo.tipo === "si_no") return valor === true || valor === false;
  return String(valor ?? "").trim() !== "";
}

// Cuánto está definido (los equipos que la línea no trae no cuentan).
export function avanceDe(campos, datos) {
  const cuentan = campos.filter((c) => !c.extra);
  const faltan = cuentan.filter((c) => !estaDefinido(c, propio(datos, c.key)));
  const total = cuentan.length;
  const hechos = total - faltan.length;
  return { total, hechos, faltan, pct: total ? Math.round((hechos / total) * 100) : 0 };
}

// "Si", "x", "true" → true; "No", "no lleva" → false; vacío → null. Las
// memorias viejas tienen equipos escritos como texto.
export function leerSiNo(valor) {
  if (valor === true || valor === false) return valor;
  const texto = sinTildes(valor);
  if (!texto) return null;
  if (/^(si|true|x|p)\b/.test(texto)) return true;
  if (/^(no|false)\b/.test(texto)) return false;
  return true;
}

// ── Códigos de obra ─────────────────────────────────────────────────────────
// La memoria quedó guardada como "H174", "55-02"… y la obra es "HUNTER-H-174",
// "55-2". Se cruzan por claveObra; si hay más de una fila, gana la de la obra,
// después la del código exacto y después la que tiene más datos.
function cantidadDeDatos(fila) {
  return Object.entries(fila || {}).filter(([k, v]) => !["id", "obra_id", "obra_codigo", "created_at", "updated_at", "updated_by", "extras"].includes(k) && v !== null && v !== "").length;
}

export function filaDeObra(obra, filas) {
  if (!obra) return null;
  const clave = claveObra(obra.codigo);
  const candidatas = (filas || []).filter((f) => f.obra_id === obra.id || f.obra_codigo === obra.codigo || (clave && claveObra(f.obra_codigo) === clave));
  if (!candidatas.length) return null;
  return candidatas.sort((a, b) =>
    Number(b.obra_id === obra.id) - Number(a.obra_id === obra.id)
    || Number(b.obra_codigo === obra.codigo) - Number(a.obra_codigo === obra.codigo)
    || cantidadDeDatos(b) - cantidadDeDatos(a))[0];
}

const SEMILLA = new Map(Object.entries(MEMORIA_EXCEL_SEED).map(([codigo, datos]) => [claveObra(codigo), datos]));

// Lo que había en la planilla Excel vieja para este barco (o null).
export function semillaDeObra(obra) {
  return SEMILLA.get(claveObra(obra?.codigo)) || null;
}

// Los datos de una fila de la base, con las notas que viven en `extras`
// mezcladas como si fueran columnas ("piso_obs").
// Ojo: "constructor" es un campo de la memoria y también una propiedad de todo
// objeto de JavaScript ({}.constructor es una función). Por eso los datos
// siempre lo traen propio, aunque sea null.
export function propio(obj, key) {
  return obj && Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : undefined;
}

export function datosDeFila(fila) {
  if (!fila) return { constructor: null };
  const { extras, ...resto } = fila;
  return { constructor: null, ...(extras && typeof extras === "object" ? extras : {}), ...resto };
}

// La semilla Excel traducida a lo que guarda la base (equipos como Sí/No).
export function datosDeSemilla(semilla, campos) {
  const out = {};
  for (const campo of campos) {
    const valor = propio(semilla, campo.key);
    if (valor == null || valor === "") continue;
    if (campo.tipo === "si_no") {
      out[campo.key] = leerSiNo(valor);
      if (typeof valor === "string" && !/^(si|sí|no|x|true|false)$/i.test(valor.trim())) out[`${campo.key}_obs`] = valor.trim();
    } else {
      out[campo.key] = valor;
    }
  }
  return out;
}

// ── Sugerencias ─────────────────────────────────────────────────────────────
// Lo que se eligió en otros barcos para cada campo, lo de la misma línea
// primero y lo más repetido arriba. Sale de la base y de la planilla vieja.
export function armarSugerencias(filas, obrasPorClave) {
  const porCampo = new Map();
  const sumar = (key, valor, linea) => {
    if (SIN_SUGERENCIAS.has(key) || typeof valor !== "string") return;
    const texto = valor.trim().replace(/\s+/g, " ");
    // Sin "???" ni textos larguísimos: una sugerencia es para elegir de un toque.
    if (!texto || texto.length > 60 || !/[a-z]{2,}/i.test(sinTildes(texto)) || sinTildes(texto) === sinTildes(NO_LLEVA)) return;
    if (!porCampo.has(key)) porCampo.set(key, new Map());
    const mapa = porCampo.get(key);
    const id = sinTildes(texto);
    const actual = mapa.get(id) || { valor: texto, veces: 0, lineas: new Set() };
    actual.veces += 1;
    if (linea) actual.lineas.add(linea);
    mapa.set(id, actual);
  };
  const lineaDeCodigo = (codigo) => {
    const clave = claveObra(codigo);
    const obra = obrasPorClave?.get(clave);
    return obra ? lineaDeObra(obra) : lineaDeObra({ codigo });
  };
  const vistos = new Set();
  for (const fila of filas || []) {
    const clave = claveObra(fila.obra_codigo);
    vistos.add(clave);
    const linea = lineaDeCodigo(fila.obra_codigo);
    for (const [key, valor] of Object.entries(fila)) sumar(key, valor, linea);
  }
  for (const [codigo, datos] of Object.entries(MEMORIA_EXCEL_SEED)) {
    if (vistos.has(claveObra(codigo))) continue;
    const linea = lineaDeCodigo(codigo);
    for (const [key, valor] of Object.entries(datos)) sumar(key, valor, linea);
  }
  return porCampo;
}

export function sugerenciasPara(sugerencias, key, linea, limite = 8) {
  const mapa = sugerencias?.get(key);
  if (!mapa) return [];
  return [...mapa.values()]
    .sort((a, b) => Number(b.lineas.has(linea)) - Number(a.lineas.has(linea)) || b.veces - a.veces || a.valor.localeCompare(b.valor, "es"))
    .slice(0, limite);
}

// ── Texto para copiar ───────────────────────────────────────────────────────
export function textoDeMemoria(obra, campos, datos) {
  const lineas = [`Memoria descriptiva ${obra.codigo} · ${lineaDeObra(obra)}`];
  for (const seccion of SECCIONES) {
    const propios = campos.filter((c) => c.seccion === seccion.key && estaDefinido(c, datos[c.key]));
    if (!propios.length) continue;
    lineas.push("", seccion.label.toUpperCase());
    for (const c of propios) {
      const valor = c.tipo === "si_no" ? (datos[c.key] ? "Sí" : "No") : String(datos[c.key]).trim();
      const nota = String(datos[`${c.key}_obs`] || "").trim();
      lineas.push(`${c.label}: ${valor}${nota ? ` (${nota})` : ""}`);
    }
  }
  return lineas.join("\n");
}

// "hace 3 días", "recién".
export function haceCuanto(fecha) {
  if (!fecha) return "";
  const ms = Date.now() - new Date(fecha).getTime();
  if (!Number.isFinite(ms)) return "";
  const min = Math.round(ms / 60000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const horas = Math.round(min / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.round(horas / 24);
  if (dias === 1) return "ayer";
  if (dias < 30) return `hace ${dias} días`;
  const meses = Math.round(dias / 30);
  if (meses < 12) return meses === 1 ? "hace un mes" : `hace ${meses} meses`;
  return new Date(fecha).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

// Tono según cuánto falta: completa verde, a medias cian, vacía neutra.
export function tonoDeAvance(pct) {
  if (pct >= 100) return "verde";
  if (pct > 0) return "cian";
  return "neutro";
}

// Orden de las líneas en la portada.
const ORDEN_LINEAS = ["K37", "K42", "K43", "K52", "K55", "K64", "K85", "Hunter", "Antago"];
export function ordenLinea(a, b) {
  const ia = ORDEN_LINEAS.indexOf(a);
  const ib = ORDEN_LINEAS.indexOf(b);
  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || String(a).localeCompare(String(b), "es");
}

// Qué dice la memoria sobre una opción de la línea ("Radar", "Hard top"…):
// "si", "no" o null si no la menciona.
export function memoriaSobreOpcion(nombre, datos) {
  const n = sinTildes(nombre).replace(/\(.*?\)/g, "").trim();
  if (n.length < 3) return null;
  for (const [key, etiqueta] of Object.entries(ETIQUETAS_EQUIPO)) {
    if (sinTildes(etiqueta) === n && (datos?.[key] === true || datos?.[key] === false)) return datos[key] ? "si" : "no";
  }
  const directos = { audio: "audio", "grupo electrogeno": "grupo_electrogeno" };
  if (directos[n]) {
    const valor = datos?.[directos[n]];
    if (valor == null || String(valor).trim() === "") return null;
    return leerSiNo(valor) === false || sinTildes(valor) === sinTildes(NO_LLEVA) ? "no" : "si";
  }
  const texto = sinTildes(Object.values(datos || {}).filter((v) => typeof v === "string").join(" | "));
  if (!texto) return null;
  const palabra = (t) => new RegExp(`(^|[^a-z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9])`);
  if (palabra(n).test(texto)) return "si";
  // "Hard top" también aparece escrito "HardTop".
  if (n.includes(" ") && palabra(n.replace(/\s+/g, "")).test(texto)) return "si";
  return null;
}
