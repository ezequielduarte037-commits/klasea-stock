// Memoria viva: la memoria descriptiva de un barco cruzada con lo que pasa con
// sus materiales.
//
//   Memoria (lo que pidió el cliente)
//     → Matriz de la línea (está planificado)
//     → Comprado → En pañol (llegó) → A bordo (egresado al barco)
//
// La matriz es panol_material_modelo; lo que pasó en la obra sale de
// panol_obra_materiales_snapshot, que ya registra cada renglón como pendiente,
// comprado, recibido/en pañol o egresado.
//
// Todo este archivo es lógica pura (sin React ni Supabase) para poder probarlo
// contra datos reales. Mientras no existan memoria_reglas y memoria_vinculos
// (ver supabase/migrations/20260917130000_memoria_viva.sql), el vínculo entre un
// campo de la memoria y un material se SUGIERE por palabras clave y por el
// propio valor cargado ("Dekton Entzo" encuentra la mesada Dekton Entzo).

import { MEMORIA_FIELDS_BY_TIPO, getLineaTipo } from "@/features/obras/mapa/memoriaFields";
import { MEMORIA_EXCEL_SEED } from "./memoriaExcelSeed";

export const ETAPAS = [
  { key: "definido", label: "En la memoria", corto: "Memoria", tono: "neutro" },
  { key: "planificado", label: "En la matriz", corto: "Matriz", tono: "cian" },
  { key: "comprado", label: "Comprado", corto: "Compra", tono: "violeta" },
  { key: "en_panol", label: "En pañol", corto: "Pañol", tono: "azul" },
  { key: "a_bordo", label: "A bordo", corto: "A bordo", tono: "verde" },
];
const ORDEN_ETAPA = Object.fromEntries(ETAPAS.map((etapa, i) => [etapa.key, i]));

// Zonas del perfil del barco. El orden es el de la lista en pantalla.
export const ZONAS = [
  { key: "fly", label: "Fly y techo" },
  { key: "interior", label: "Salón y cocina" },
  { key: "camarotes", label: "Camarotes" },
  { key: "cockpit", label: "Cockpit" },
  { key: "proa", label: "Proa" },
  { key: "propulsion", label: "Máquinas" },
  { key: "casco", label: "Casco" },
  { key: "general", label: "Datos del barco" },
];

// Quién resuelve cada campo cuando no es una compra.
export const TALLERES = {
  muebles: { label: "Muebles", ruta: "/muebles" },
  marmoleria: { label: "Marmolería", ruta: "/marmoleria" },
  laminacion: { label: "Laminación", ruta: "/laminacion" },
  tapiceria: { label: "Tapicería y lonería", ruta: null },
};

// Por campo: zona del barco, quién lo resuelve y cómo reconocer sus materiales.
//   incluye / excluye: fragmentos del nombre del material (sin tildes).
//   porValor: además busca las palabras del valor cargado (marcas, modelos).
//   equipo: es un equipo que se compra; si aparece en la matriz o en la obra
//           sin estar marcado en la memoria, se avisa.
const CONSUMIBLES = ["filtro", "aceite", "impulsor", "anodo", "correa", "junta", "o-ring", "oring", "fusible", "precinto"];
export const CAMPOS = {
  propietario: { zona: "general", resuelve: "definicion" },
  constructor: { zona: "general", resuelve: "definicion" },
  nombre_barco: { zona: "general", resuelve: "definicion" },
  cabina: { zona: "general", resuelve: "definicion" },
  adicionales: { zona: "general", resuelve: "definicion" },

  motorizacion: { zona: "propulsion", resuelve: "compra", porValor: true, incluye: ["motor volvo", "motor cummins", "motor mercury", "volvo penta d", "motor diesel", "motor fuera de borda", "cummins qsb", "zeus"], excluye: CONSUMIBLES },
  grupo_electrogeno: { zona: "propulsion", resuelve: "compra", equipo: true, incluye: ["grupo electrogeno", "generador"], excluye: CONSUMIBLES },
  sternthruster: { zona: "propulsion", resuelve: "compra", equipo: true, incluye: ["sternthruster", "stern thruster", "helice de popa"], excluye: CONSUMIBLES },
  flaps: { zona: "propulsion", resuelve: "compra", equipo: true, incluye: ["flap", "trim tab", "interceptor"], excluye: CONSUMIBLES },
  bow_thruster: { zona: "proa", resuelve: "compra", equipo: true, incluye: ["bowthruster", "bow thruster", "helice de proa"], excluye: CONSUMIBLES },
  faro: { zona: "proa", resuelve: "compra", equipo: true, incluye: ["faro"], excluye: ["farol", ...CONSUMIBLES] },
  loneria_toldo_proa: { zona: "proa", resuelve: "tapiceria", incluye: ["toldo proa", "toldo rebatible"] },

  color_casco: { zona: "casco", resuelve: "laminacion", incluye: ["gelcoat", "antifouling", "vinilo casco"] },

  starlink: { zona: "fly", resuelve: "compra", equipo: true, incluye: ["starlink"] },
  radar: { zona: "fly", resuelve: "compra", equipo: true, incluye: ["radar"], excluye: ["arco radar", "cableado"] },
  plotter: { zona: "fly", resuelve: "compra", equipo: true, incluye: ["plotter", "gpsmap", "chartplotter"] },
  pluma: { zona: "fly", resuelve: "compra", equipo: true, incluye: ["pluma", "davit"] },
  mesa_fly: { zona: "fly", resuelve: "muebles", incluye: ["mesa fly", "mesa del fly"] },
  electronica: { zona: "fly", resuelve: "compra", incluye: ["vhf", "sonda", "transductor", "piloto automatico", "ais "], porValor: true },

  aire_acondicionado: { zona: "interior", resuelve: "compra", equipo: true, incluye: ["aire acondicionado", "fcf12", "fcf16", "chiller"], excluye: CONSUMIBLES },
  calefactor: { zona: "interior", resuelve: "compra", equipo: true, incluye: ["calefactor", "calefaccion", "webasto", "eberspacher"], excluye: CONSUMIBLES },
  audio: { zona: "interior", resuelve: "compra", incluye: ["parlante", "subwoofer", "amplificador", "fusion ms", "equipo de audio", "estereo"], porValor: true },
  madera_muebles: { zona: "interior", resuelve: "muebles", incluye: ["enchapado", "chapa de madera", "laminado decorativo"], porValor: true },
  piso: { zona: "interior", resuelve: "compra", incluye: ["piso vinilico", "piso flotante", "piso laminado", "porcelanato"], excluye: ["levantapiso", "caja de piso", "rejilla"], porValor: true },
  color_mesadas: { zona: "interior", resuelve: "marmoleria", incluye: ["dekton", "silestone", "neolith", "granito", "cuarzo", "marmol"], excluye: ["monocomando", "griferia", "canilla"], porValor: true },
  tapiceria_dinette: { zona: "interior", resuelve: "tapiceria", porValor: true },

  alfombra: { zona: "camarotes", resuelve: "compra", incluye: ["alfombra"], porValor: true },
  tapiceria_mamparos: { zona: "camarotes", resuelve: "tapiceria", porValor: true },
  tapiceria_respaldos: { zona: "camarotes", resuelve: "tapiceria", porValor: true },
  color_acolchados: { zona: "camarotes", resuelve: "tapiceria", porValor: true },
  tv_camarote: { zona: "camarotes", resuelve: "compra", incluye: ["tv ", "televisor"], porValor: true },

  teca_tipo: { zona: "cockpit", resuelve: "compra", incluye: ["teca sintetica", "flexiteek", "permateek", "seadek", "infinity"], excluye: ["limpiador", "aceite"], porValor: true },
  tapiceria_exterior: { zona: "cockpit", resuelve: "tapiceria", porValor: true },
  color_cerramientos: { zona: "cockpit", resuelve: "tapiceria", porValor: true },
  loneria_cobertor: { zona: "cockpit", resuelve: "tapiceria", incluye: ["cobertor", "lona"] },
  loneria_otros: { zona: "cockpit", resuelve: "tapiceria", incluye: ["cubre tambucho", "cubretambucho", "mosquitero", "cerramiento de lona"] },
  fabricadora_hielo: { zona: "cockpit", resuelve: "compra", equipo: true, incluye: ["fabricadora de hielo", "maquina de hielo", "icemaker"], excluye: CONSUMIBLES },
  tv_cockpit: { zona: "cockpit", resuelve: "compra", incluye: ["tv ", "televisor"], porValor: true },
};

const TOGGLES = new Set(["starlink", "sternthruster", "fabricadora_hielo", "radar", "pluma", "planchada", "mesa_fly", "aire_acondicionado", "calefactor", "bow_thruster", "plotter", "faro", "flaps"]);

// Palabras que no sirven para buscar por valor: colores genéricos, conectores y
// respuestas de planilla.
const PALABRAS_VACIAS = new Set([
  "blanco", "negro", "gris", "azul", "rojo", "verde", "beige", "crema", "natural", "claro", "oscuro", "color",
  "tipo", "con", "sin", "para", "del", "las", "los", "una", "uno", "que", "como", "todo", "toda",
  "viene", "segun", "standard", "estandar", "cliente", "interior", "exterior", "techo", "techos",
  "linea", "modelo", "juego", "cocina", "bano", "cockpit", "salon", "popa", "proa", "camarote",
]);

export function normalizar(texto) {
  return String(texto ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function contiene(nombre, fragmento) {
  // Coincide al principio de una palabra: "faro" no encuentra "farol" gracias
  // a excluye, y "tv " no encuentra "tvbox" porque lleva el espacio.
  const indice = nombre.indexOf(fragmento);
  if (indice < 0) return false;
  return indice === 0 || !/[a-z0-9]/.test(nombre[indice - 1]);
}

function palabrasDelValor(valor) {
  if (typeof valor !== "string") return [];
  return [...new Set(
    normalizar(valor)
      .split(/[^a-z0-9]+/)
      .filter((palabra) => palabra.length >= 4 && !/^\d+$/.test(palabra) && !PALABRAS_VACIAS.has(palabra)),
  )];
}

export function estaDefinido(valor) {
  if (typeof valor === "boolean") return valor;
  return String(valor ?? "").trim() !== "";
}

function parseToggle(valor) {
  if (typeof valor === "boolean") return valor;
  const texto = normalizar(valor);
  if (!texto) return false;
  return /^(si|true|x|p)\b/.test(texto);
}

export function lineaDeObra(obra) {
  const tipo = getLineaTipo(obra);
  const numero = tipo.match(/^k(\d+)$/)?.[1] || null;
  return { tipo, numero, nombre: obra?.linea_nombre || (numero ? `K${numero}` : "Sin línea") };
}

// La memoria de un barco: lo cargado en la base pisa la semilla del Excel, y
// los toggles escritos a mano ("Si / Coldmaster") pasan a booleano + nota.
export function memoriaDeObra(obra, memoriasDb = {}) {
  const codigo = String(obra?.codigo || "").trim().toUpperCase();
  const base = { ...(MEMORIA_EXCEL_SEED[codigo] || {}), ...(memoriasDb[obra?.id] || memoriasDb[codigo] || {}) };
  for (const key of TOGGLES) {
    const valor = base[key];
    if (typeof valor === "string" && valor.trim()) {
      if (!base[`${key}_obs`] && !/^(si|sí|true|false|no|x|p|o)$/i.test(valor.trim())) base[`${key}_obs`] = valor;
      base[key] = parseToggle(valor);
    }
  }
  return base;
}

export function camposDeLinea(obra) {
  const { tipo } = lineaDeObra(obra);
  return MEMORIA_FIELDS_BY_TIPO[tipo] || MEMORIA_FIELDS_BY_TIPO.default || [];
}

function etapaDeRenglon(renglon) {
  const estado = normalizar(renglon.estado);
  if (estado === "egresado" || renglon.egreso_at) return "a_bordo";
  if (estado === "en_panol" || estado === "recibido") return "en_panol";
  if (estado === "comprado") return "comprado";
  return "planificado";
}

function coincideCampo(key, nombre, valor) {
  const regla = CAMPOS[key];
  if (!regla) return false;
  if (regla.excluye?.some((fragmento) => contiene(nombre, fragmento))) return false;
  if (regla.incluye?.some((fragmento) => contiene(nombre, fragmento))) return true;
  if (regla.porValor) {
    const palabras = palabrasDelValor(valor);
    return palabras.some((palabra) => contiene(nombre, palabra));
  }
  return false;
}

// Agrupa renglones del mismo producto: la obra suele tener varias filas por
// material (lo que entró, lo que salió al barco, un conteo).
function agrupar(renglones) {
  const grupos = new Map();
  for (const renglon of renglones) {
    const clave = renglon.material_id || normalizar(renglon.descripcion);
    const grupo = grupos.get(clave) || { clave, descripcion: renglon.descripcion, rubro: renglon.rubro, renglones: [], porEtapa: {} };
    grupo.renglones.push(renglon);
    const etapa = etapaDeRenglon(renglon);
    grupo.porEtapa[etapa] = (grupo.porEtapa[etapa] || 0) + 1;
    grupos.set(clave, grupo);
  }
  return [...grupos.values()].map((grupo) => {
    // La etapa de un producto es la más avanzada que alcanzó; "parcial" avisa
    // si todavía quedan unidades atrás (en pañol mientras otras ya están a bordo).
    const etapas = Object.keys(grupo.porEtapa).sort((a, b) => ORDEN_ETAPA[a] - ORDEN_ETAPA[b]);
    const etapa = etapas[etapas.length - 1];
    return { ...grupo, etapa, parcial: etapas.length > 1 };
  });
}

/**
 * Cruza una obra.
 *   obra: { id, codigo, linea_nombre }
 *   memoria: objeto de campos (ver memoriaDeObra)
 *   matriz: [{ material_id, cantidad, descripcion, es_requisito }] de la línea
 *   renglones: panol_obra_materiales_snapshot de la obra
 * Devuelve { items, porZona, porEtapa, completitud, cruces }.
 */
export function cruzarObra({ obra, memoria, matriz = [], renglones = [] }) {
  const plantilla = camposDeLinea(obra);
  const keysPlantilla = new Set(plantilla.map((campo) => campo.key));
  const matrizNorm = matriz.map((fila) => ({ ...fila, nombre: normalizar(fila.descripcion) }));
  const renglonesNorm = renglones.map((renglon) => ({ ...renglon, nombre: normalizar(renglon.descripcion) }));

  const items = plantilla
    .filter((campo, i, lista) => lista.findIndex((otro) => otro.key === campo.key) === i)
    .map((campo) => {
      const regla = CAMPOS[campo.key] || { zona: "general", resuelve: "definicion" };
      const valor = memoria[campo.key];
      const definido = estaDefinido(valor);
      const obs = memoria[`${campo.key}_obs`] || "";
      const enMatriz = regla.resuelve === "definicion" ? [] : matrizNorm.filter((fila) => coincideCampo(campo.key, fila.nombre, valor));
      const enObra = regla.resuelve === "definicion" ? [] : agrupar(renglonesNorm.filter((renglon) => coincideCampo(campo.key, renglon.nombre, valor)));

      let etapa = null;
      if (definido) {
        etapa = "definido";
        if (enMatriz.length) etapa = "planificado";
        for (const grupo of enObra) {
          if (ORDEN_ETAPA[grupo.etapa] > ORDEN_ETAPA[etapa]) etapa = grupo.etapa;
        }
      }
      const tipo = campo.type === "toggle" || TOGGLES.has(campo.key) ? "toggle" : campo.type === "selector" ? "selector" : "texto";
      return {
        key: campo.key,
        label: campo.label,
        seccion: campo.section,
        tipo,
        zona: regla.zona,
        resuelve: regla.resuelve,
        taller: TALLERES[regla.resuelve] || null,
        valor,
        obs,
        definido,
        etapa,
        enMatriz,
        enObra,
      };
    });

  // Cruces: lo que no cierra entre la memoria y los materiales.
  const cruces = [];
  for (const item of items) {
    const regla = CAMPOS[item.key];
    if (!regla?.equipo) continue;
    const hayMateriales = item.enMatriz.length > 0 || item.enObra.length > 0;
    if (item.definido && !hayMateriales && item.resuelve === "compra") {
      cruces.push({ tipo: "falta", key: item.key, label: item.label, zona: item.zona,
        texto: `${item.label}: está en la memoria, pero no aparece ni en la matriz ni en los materiales de la obra.` });
    }
    if (!item.definido && hayMateriales) {
      const donde = item.enObra.length ? "ya hay materiales en la obra" : "está en la matriz de la línea";
      cruces.push({ tipo: "sobra", key: item.key, label: item.label, zona: item.zona,
        texto: `${item.label}: ${donde}, pero la memoria no lo marca.` });
    }
  }
  // Equipos que la plantilla de esta línea ni siquiera contempla.
  for (const [key, regla] of Object.entries(CAMPOS)) {
    if (!regla.equipo || keysPlantilla.has(key)) continue;
    const enObra = agrupar(renglonesNorm.filter((renglon) => coincideCampo(key, renglon.nombre, null)));
    const enMatriz = matrizNorm.filter((fila) => coincideCampo(key, fila.nombre, null));
    if (!enObra.length && !enMatriz.length) continue;
    const ejemplo = (enObra[0]?.descripcion || enMatriz[0]?.descripcion || "").trim();
    cruces.push({ tipo: "fuera", key, label: etiquetaDe(key), zona: regla.zona,
      texto: `${etiquetaDe(key)}: la memoria de ${lineaDeObra(obra).nombre} no tiene este campo, pero la obra lo lleva (${ejemplo}).` });
  }

  const conEtapa = items.filter((item) => item.definido && item.resuelve !== "definicion");
  const porEtapa = Object.fromEntries(ETAPAS.map((etapa) => [etapa.key, conEtapa.filter((item) => item.etapa === etapa.key).length]));
  const porZona = Object.fromEntries(ZONAS.map((zona) => {
    const deZona = items.filter((item) => item.zona === zona.key);
    const seguidos = deZona.filter((item) => item.definido && item.resuelve !== "definicion");
    const avance = seguidos.length
      ? seguidos.reduce((suma, item) => suma + ORDEN_ETAPA[item.etapa] / (ETAPAS.length - 1), 0) / seguidos.length
      : null;
    return [zona.key, {
      total: deZona.length,
      definidos: deZona.filter((item) => item.definido).length,
      avance,
      cruces: cruces.filter((cruce) => cruce.zona === zona.key).length,
    }];
  }));
  const definidos = items.filter((item) => item.definido).length;
  return {
    items,
    porEtapa,
    porZona,
    cruces,
    completitud: { definidos, total: items.length, pct: items.length ? Math.round((definidos / items.length) * 100) : 0 },
  };
}

const ETIQUETAS_EXTRA = {
  aire_acondicionado: "Aire acondicionado", calefactor: "Calefactor", bow_thruster: "Bow thruster",
  plotter: "Plotter", faro: "Faro", flaps: "Flaps", starlink: "Starlink", radar: "Radar", pluma: "Pluma",
  sternthruster: "Sternthruster", fabricadora_hielo: "Fabricadora de hielo", grupo_electrogeno: "Grupo electrógeno",
};
function etiquetaDe(key) {
  return ETIQUETAS_EXTRA[key] || key.replace(/_/g, " ");
}

export function indiceEtapa(key) {
  return ORDEN_ETAPA[key] ?? -1;
}

// Tono de una zona según el avance promedio de sus ítems ("neutro" si no tiene
// nada que seguir). Lo usan el perfil del barco y los chips del celular.
export function tonoDeZona(info) {
  if (!info || info.avance == null) return "neutro";
  return ETAPAS[Math.round(info.avance * (ETAPAS.length - 1))]?.tono || "neutro";
}
