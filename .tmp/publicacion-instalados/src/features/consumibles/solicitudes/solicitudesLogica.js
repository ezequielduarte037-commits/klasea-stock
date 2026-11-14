/**
 * Solicitudes de pañol dentro de Consumibles: la lógica que no depende de
 * Supabase ni de React. Se prueba con `node --test` (solicitudesLogica.test.mjs).
 *
 * El carril planificado: el encargado carga la lista hasta las 15 (o deja el
 * papel en el pañol), pañol la prepara a la tarde y se retira al día siguiente
 * a las 7 con tarjeta. Casi todos los renglones son consumibles; los materiales
 * de obra siguen saliendo por Solicitudes de materiales.
 */

import { coincideBusqueda, compararNatural, normalizarTexto } from "../conteo/conteoCalculos.js";
import { emparejarRenglones } from "../ingresos/remitoIA.js";

const ZONA = "America/Argentina/Buenos_Aires";
const DIA_MS = 24 * 60 * 60 * 1000;
const DIAS_CORTOS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

/** Hora de corte de la preparación: lo que llega después se prepara a la mañana. */
export const CORTE_MINUTOS = 15 * 60;

export const ESTADOS_ACTIVOS = ["enviada", "preparando", "listo"];

/** Estados de un renglón que la base entrega (los mismos que filtra el RPC). */
export const ESTADOS_ENTREGABLES = ["pendiente", "preparado", "reemplazado"];

export const GRUPOS = [
  { key: "preparar", label: "Para preparar", estados: ["enviada", "preparando"] },
  { key: "listas", label: "Listas para retirar", estados: ["listo"] },
  { key: "entregadas", label: "Entregadas", estados: ["entregado"] },
  { key: "todas", label: "Todas", estados: null },
];

export const ESTADO_TEXTO = {
  borrador: "Borrador",
  enviada: "Nueva",
  preparando: "Preparando",
  listo: "Lista para retirar",
  entregado: "Entregada",
  cancelado: "Cancelada",
};

const limpio = (v) => String(v ?? "").trim();

// ── Fechas de Argentina ─────────────────────────────────────────────────────

/** Fecha (AAAA-MM-DD) y minutos del día en Argentina de un instante. */
export function horaArgentina(instante) {
  const d = instante instanceof Date ? instante : new Date(instante);
  if (Number.isNaN(d.getTime())) return null;
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(d).map((p) => [p.type, p.value]),
  );
  return {
    fecha: `${partes.year}-${partes.month}-${partes.day}`,
    minutos: Number(partes.hour) * 60 + Number(partes.minute),
  };
}

export function sumarDias(iso, dias) {
  const [y, m, d] = String(iso).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + dias));
  return dt.toISOString().slice(0, 10);
}

/** 0 domingo … 6 sábado, del día calendario (sin corrimiento de zona). */
export function diaSemana(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** El día hábil anterior (el pañol no abre sábado ni domingo). */
export function diaHabilAnterior(iso) {
  let dia = sumarDias(iso, -1);
  while ([0, 6].includes(diaSemana(dia))) dia = sumarDias(dia, -1);
  return dia;
}

/** El día de retiro de un papel que llega hoy: el próximo día hábil. */
export function proximoDiaHabil(iso) {
  let dia = sumarDias(iso, 1);
  while ([0, 6].includes(diaSemana(dia))) dia = sumarDias(dia, 1);
  return dia;
}

/**
 * ¿Llegó después de las 15 del día en que se prepara? Solo se sabe de las que
 * carga el encargado desde el celular: la hora de carga de un papel es la hora
 * en que pañol lo tipeó, no la hora en que se lo dejaron. La pantalla del
 * celular además deja escrito el aviso en las observaciones.
 */
export function llegoTarde(sol) {
  if (!sol) return false;
  if (/despu[eé]s de las 15/i.test(String(sol.observaciones ?? ""))) return true;
  if (sol.origen !== "digital" || !sol.created_at) return false;
  const carga = horaArgentina(sol.created_at);
  if (!carga) return false;
  if (!sol.fecha_retiro) return carga.minutos > CORTE_MINUTOS;
  const corte = diaHabilAnterior(sol.fecha_retiro);
  return carga.fecha > corte || (carga.fecha === corte && carga.minutos > CORTE_MINUTOS);
}

/**
 * Cómo se dice el día de retiro en la bandeja: "hoy", "mañana 7 h", "jue 15".
 * Una que no se entregó y ya pasó su día queda marcada: o no vinieron a
 * buscarla o hay que avisarle a alguien.
 */
export function textoRetiro(fechaRetiro, hoyIso, { cerrada = false } = {}) {
  if (!fechaRetiro) return { texto: "sin día de retiro", tono: "sin" };
  const iso = String(fechaRetiro).slice(0, 10);
  const n = Number(iso.slice(8, 10));
  const corto = `${DIAS_CORTOS[diaSemana(iso)]} ${n}`;
  if (cerrada) return { texto: corto, tono: "futuro" };
  if (iso === hoyIso) return { texto: "hoy", tono: "hoy" };
  if (iso === sumarDias(hoyIso, 1)) return { texto: "mañana 7 h", tono: "manana" };
  if (iso < hoyIso) return { texto: `era el ${corto}`, tono: "atrasada" };
  return { texto: `${corto} 7 h`, tono: "futuro" };
}

/** "13/10 16:20" en hora de Argentina. */
export function fechaHoraCorta(instante) {
  const h = horaArgentina(instante);
  if (!h) return "";
  const hh = String(Math.floor(h.minutos / 60)).padStart(2, "0");
  const mm = String(h.minutos % 60).padStart(2, "0");
  return `${h.fecha.slice(8, 10)}/${h.fecha.slice(5, 7)} ${hh}:${mm}`;
}

// ── Bandeja ────────────────────────────────────────────────────────────────

export function etiquetaOrigen(origen) {
  if (origen === "digital") return "celular";
  if (origen === "foto_ia") return "papel (foto)";
  return "papel";
}

/** Para dónde va: el código de la obra, o el texto de un papel viejo, o el sector. */
export function destinoSolicitud(sol) {
  return limpio(sol?.obra?.codigo) || limpio(sol?.obra_texto) || limpio(sol?.sector) || "Sin obra ni sector";
}

const esListo = (estado) => estado === "preparado" || estado === "reemplazado";

/**
 * Cuenta los renglones de una solicitud. `material.es_consumible` viene del
 * catálogo (la marca del renglón se desfasa si después cambian el material).
 */
export function resumenItems(items = []) {
  let listos = 0;
  let libres = 0;
  let deObra = 0;
  let faltantes = 0;
  for (const it of items) {
    if (esListo(it.estado)) listos += 1;
    if (it.estado === "faltante") faltantes += 1;
    if (!it.material_id) libres += 1;
    else if (it.material && it.material.es_consumible === false) deObra += 1;
  }
  return { total: items.length, listos, pendientes: items.length - listos - faltantes, libres, deObra, faltantes };
}

const instante = (v) => {
  const t = v ? new Date(v).getTime() : NaN;
  return Number.isFinite(t) ? t : 0;
};

/** Urgentes primero, después por día de retiro (sin día al final) y por hora de carga. */
export function ordenarActivas(a, b) {
  const ua = a.prioridad === "urgente" ? 0 : 1;
  const ub = b.prioridad === "urgente" ? 0 : 1;
  if (ua !== ub) return ua - ub;
  const fa = a.fecha_retiro ? String(a.fecha_retiro).slice(0, 10) : "9999-12-31";
  const fb = b.fecha_retiro ? String(b.fecha_retiro).slice(0, 10) : "9999-12-31";
  if (fa !== fb) return fa < fb ? -1 : 1;
  return instante(a.created_at) - instante(b.created_at) || (Number(a.numero) || 0) - (Number(b.numero) || 0);
}

/** Momento en que se cerró (entregada o cancelada): para el orden y los 7 días. */
export function fechaCierre(sol) {
  return sol?.retirado_at || sol?.updated_at || sol?.created_at || null;
}

/** La última entregada arriba: es la que alguien viene a preguntar. */
export function ordenarCerradas(a, b) {
  return instante(fechaCierre(b)) - instante(fechaCierre(a)) || (Number(b.numero) || 0) - (Number(a.numero) || 0);
}

export function coincideSolicitud(sol, busqueda) {
  const q = normalizarTexto(busqueda);
  if (!q) return true;
  const pajar = normalizarTexto([
    sol.numero, sol.obra?.codigo, sol.obra?.descripcion, sol.obra_texto, sol.sector,
    sol.solicita, sol.retira, sol.tarea, sol.retirado_por_nombre,
  ].filter((v) => v != null && v !== "").join(" "));
  return q.split(" ").every((p) => pajar.includes(p));
}

/**
 * Arma la bandeja de la sede del equipo.
 *   filas: solicitudes con `items` (resumen) y `obra`.
 * Devuelve { sinSede, grupos: { preparar, listas, entregadas, todas }, contadores }.
 *
 * Las entregadas se muestran solo de los últimos `dias` días, salvo que se
 * esté buscando: ahí entra todo lo que haya traído la búsqueda.
 */
export function armarBandeja(filas = [], { sede, busqueda = "", ahora = Date.now(), dias = 7 } = {}) {
  const limite = ahora - dias * DIA_MS;
  const buscando = Boolean(limpio(busqueda));
  const vistos = new Set();
  const deLaSede = [];
  const sinSede = [];
  for (const s of filas) {
    if (!s || vistos.has(s.id)) continue;
    vistos.add(s.id);
    if (!coincideSolicitud(s, busqueda)) continue;
    if (!s.sede_origen) {
      // Una sin sede no se puede entregar: aparte, para asignarla.
      if (ESTADOS_ACTIVOS.includes(s.estado)) sinSede.push(s);
      continue;
    }
    if (s.sede_origen !== sede) continue;
    if (s.estado === "borrador") continue;
    const cerrada = s.estado === "entregado" || s.estado === "cancelado";
    if (cerrada && !buscando && instante(fechaCierre(s)) < limite) continue;
    deLaSede.push(s);
  }

  const preparar = deLaSede.filter((s) => s.estado === "enviada" || s.estado === "preparando").sort(ordenarActivas);
  const listas = deLaSede.filter((s) => s.estado === "listo").sort(ordenarActivas);
  const entregadas = deLaSede.filter((s) => s.estado === "entregado").sort(ordenarCerradas);
  const canceladas = deLaSede.filter((s) => s.estado === "cancelado").sort(ordenarCerradas);
  const todas = [...preparar, ...listas, ...[...entregadas, ...canceladas].sort(ordenarCerradas)];
  sinSede.sort(ordenarActivas);

  return {
    sinSede,
    grupos: { preparar, listas, entregadas, todas },
    contadores: { preparar: preparar.length, listas: listas.length, entregadas: entregadas.length, todas: todas.length, sinSede: sinSede.length },
  };
}

// ── Renglones ──────────────────────────────────────────────────────────────

/** Orden natural de ubicaciones: "C2-03" < "C10-01". Sin ubicación, al final. */
export function compararUbicacion(a, b) {
  const ua = limpio(a).toUpperCase();
  const ub = limpio(b).toUpperCase();
  if (!ua && !ub) return 0;
  if (!ua) return 1;
  if (!ub) return -1;
  return compararNatural(ua, ub);
}

/**
 * El recorrido para preparar: por ubicación, y dentro de la misma por nombre.
 * Recibe renglones con { ubicacion, descripcion, orden }.
 */
export function ordenarParaPreparar(renglones = []) {
  return [...renglones].sort((a, b) => compararUbicacion(a.ubicacion, b.ubicacion)
    || compararNatural(a.descripcion, b.descripcion)
    || (Number(a.orden) || 0) - (Number(b.orden) || 0));
}

/**
 * Separa los renglones de una solicitud según lo que hay que hacer con cada uno:
 *   libres      escritos a mano (sin producto): hay que elegir el producto;
 *   deObra      materiales que no son consumibles: van por Solicitudes de materiales;
 *   consumibles el resto, en el orden del recorrido, con el ítem del catálogo
 *               (null si el producto quedó fuera del catálogo activo).
 */
export function clasificarRenglones(items = [], porId = new Map()) {
  const libres = [];
  const deObra = [];
  const consumibles = [];
  for (const it of items) {
    if (!it.material_id) { libres.push(it); continue; }
    if (it.material && it.material.es_consumible === false) { deObra.push(it); continue; }
    const item = porId.get(it.material_id) ?? null;
    consumibles.push({
      ...it,
      item,
      ubicacion: item?.ubicacion ?? it.material?.ubicacion ?? null,
      descripcion: it.descripcion || item?.descripcion || "Consumible",
    });
  }
  return {
    libres: [...libres].sort((a, b) => (Number(a.orden) || 0) - (Number(b.orden) || 0)),
    deObra,
    consumibles: ordenarParaPreparar(consumibles),
  };
}

/**
 * Lo que impide entregar, con las mismas reglas que el RPC
 * `consumibles_entregar_solicitud`: si acá dice que se puede, la base no lo
 * rechaza por lo mismo. Cada problema dice qué hacer.
 */
export function problemasParaEntregar(sol, items = []) {
  if (!sol) return [{ tipo: "sin_solicitud", texto: "Falta la solicitud." }];
  if (sol.estado === "entregado") return [{ tipo: "entregada", texto: "Ya está entregada." }];
  if (sol.estado === "cancelado") return [{ tipo: "cancelada", texto: "Está cancelada: reabrila para entregarla." }];
  const out = [];
  if (!["Chubut", "Pampa"].includes(sol.sede_origen)) {
    out.push({ tipo: "sede", texto: "Elegí de qué pañol sale (Chubut o Pampa)." });
  }
  const cuentan = items.filter((i) => (Number(i.cantidad) || 0) > 0 && ESTADOS_ENTREGABLES.includes(i.estado));
  const libres = cuentan.filter((i) => !i.material_id).length;
  const deObra = cuentan.filter((i) => i.material_id && i.material?.es_consumible === false).length;
  if (libres) {
    out.push({ tipo: "libres", texto: libres === 1 ? "Hay 1 renglón escrito a mano: elegí el producto del catálogo." : `Hay ${libres} renglones escritos a mano: elegí el producto del catálogo.` });
  }
  if (deObra) {
    out.push({ tipo: "obra", texto: deObra === 1 ? "Trae 1 material de obra: se entrega desde Solicitudes de materiales." : `Trae ${deObra} materiales de obra: se entregan desde Solicitudes de materiales.` });
  }
  if (!cuentan.some((i) => i.material_id)) out.push({ tipo: "vacia", texto: "No tiene nada para entregar." });
  return out;
}

/** Lo que no impide entregar pero conviene saber antes de que se vaya. */
export function avisosParaEntregar(items = []) {
  const out = [];
  const pendientes = items.filter((i) => i.estado === "pendiente" && (Number(i.cantidad) || 0) > 0).length;
  const faltantes = items.filter((i) => i.estado === "faltante").length;
  if (pendientes) out.push(pendientes === 1 ? "1 renglón sin tildar: se entrega igual." : `${pendientes} renglones sin tildar: se entregan igual.`);
  if (faltantes) out.push(faltantes === 1 ? "1 renglón marcado como faltante no se entrega." : `${faltantes} renglones marcados como faltantes no se entregan.`);
  return out;
}

/**
 * Una cantidad escrita a mano, como se escribe acá: "1,5" es 1.5 y "1.500"
 * es mil quinientos ("1.5" sigue siendo uno y medio). Cero, negativo o texto
 * no valen.
 */
export function cantidadValida(texto) {
  let t = limpio(typeof texto === "number" ? String(texto) : texto);
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0 || n > 99999) return null;
  return Math.round(n * 1000) / 1000;
}

/** La cantidad para un campo editable: sin separador de miles ("1500", "1,5"). */
export function cantidadParaCampo(n) {
  const v = Math.round((Number(n) || 0) * 1000) / 1000;
  return String(v).replace(".", ",");
}

// ── Búsqueda de productos ──────────────────────────────────────────────────

/**
 * Busca en el catálogo por nombre, alias, código o ubicación (todas las
 * palabras). Lo que empieza igual va primero. El código exacto lo resuelve
 * la pantalla con `indexarCodigos` antes de llegar acá.
 */
export function buscarProductos(catalogo = [], texto = "", max = 8) {
  const q = normalizarTexto(texto);
  if (!q) return [];
  const encontrados = catalogo.filter((item) => coincideBusqueda(item, q));
  const empieza = (item) => (normalizarTexto(item.descripcion).startsWith(q) ? 0 : 1);
  return encontrados
    .sort((a, b) => empieza(a) - empieza(b) || compararNatural(a.descripcion, b.descripcion))
    .slice(0, max);
}

/**
 * Candidatos del catálogo para un renglón escrito a mano. Primero el parecido
 * estricto de Ingresos (descripción y alias, medidas exactas); si no hay
 * ninguno, los que tienen la palabra más larga, para no dejar la lista vacía.
 */
export function candidatosPara(descripcion, catalogo = [], max = 3) {
  const texto = limpio(descripcion);
  if (!texto || !catalogo.length) return [];
  const [fila] = emparejarRenglones([{ descripcion: texto }], catalogo);
  const out = [...(fila?.candidatos ?? [])];
  if (out.length < max) {
    const palabra = normalizarTexto(texto).split(" ").filter((p) => p.length >= 4 && !/\d/.test(p)).sort((a, b) => b.length - a.length)[0];
    if (palabra) {
      for (const item of catalogo) {
        if (out.length >= max) break;
        if (!out.includes(item) && normalizarTexto(`${item.descripcion ?? ""} ${item.alias ?? ""}`).includes(palabra)) out.push(item);
      }
    }
  }
  return out.slice(0, max);
}

// ── Lectura de la hoja con IA ──────────────────────────────────────────────

/**
 * Reparte lo que leyó la IA:
 *   nuevos     claros (producto único, cantidad leída, confianza no baja): entran solos;
 *   dudosos    se cargan como renglones escritos a mano, para elegir el producto;
 *   yaEstaban  el producto ya estaba en la solicitud (no se suma: la hoja es la misma).
 *
 * lectura: los `items` de la IA ({ descripcion, cantidad, unidad, observacion, confianza }).
 * actuales: ids de material que ya tiene la solicitud.
 */
export function repartirLectura(lectura = [], catalogo = [], actuales = new Set()) {
  const filas = (lectura ?? []).filter((r) => r && limpio(r.descripcion));
  // Mismo filtro que emparejarRenglones: los índices quedan alineados.
  const emparejadas = emparejarRenglones(filas.map((r) => ({ descripcion: r.descripcion, cantidad: r.cantidad, unidad: r.unidad })), catalogo);
  const nuevos = new Map();
  const dudosos = [];
  let yaEstaban = 0;
  emparejadas.forEach((x, i) => {
    const original = filas[i];
    const cantidad = cantidadValida(original.cantidad);
    const claro = x.item && cantidad != null && original.confianza !== "baja";
    if (claro) {
      if (actuales.has(x.item.id)) { yaEstaban += 1; return; }
      const previo = nuevos.get(x.item.id);
      nuevos.set(x.item.id, { item: x.item, cantidad: (previo?.cantidad ?? 0) + cantidad });
      return;
    }
    const notas = ["Leído con IA"];
    if (cantidad == null) notas.push("cantidad sin leer");
    if (limpio(original.observacion)) notas.push(limpio(original.observacion));
    dudosos.push({
      descripcion: limpio(original.descripcion),
      cantidad: cantidad ?? 1,
      unidad: limpio(original.unidad) || null,
      observacion: notas.join(": "),
    });
  });
  return { nuevos: [...nuevos.values()], dudosos, yaEstaban };
}

/**
 * Lo que la hoja dice de la cabecera, solo para los campos vacíos y con
 * confianza media o alta: nunca pisa lo que alguien ya escribió.
 */
export function cabeceraDesdeLectura(cab, sol, { obras = [], sectores = [] } = {}) {
  if (!cab || !sol) return {};
  const valor = (k) => (cab[k] && cab[k].confianza !== "baja" ? limpio(cab[k].valor) : "");
  const patch = {};
  for (const k of ["solicita", "retira", "tarea"]) {
    if (!limpio(sol[k]) && valor(k)) patch[k] = valor(k);
  }
  const obraLeida = normalizarTexto(valor("obra")).replace(/\s/g, "");
  if (!sol.obra_id && !limpio(sol.obra_texto) && obraLeida) {
    const obra = obras.find((o) => normalizarTexto(o.codigo).replace(/\s/g, "") === obraLeida);
    if (obra) { patch.obra_id = obra.id; patch.obra_texto = obra.codigo; }
  }
  const sector = valor("sector");
  if (!limpio(sol.sector) && sector && sectores.includes(sector)) patch.sector = sector;
  return patch;
}

// ── Quién retira ───────────────────────────────────────────────────────────

const palabrasDe = (s) => normalizarTexto(s).split(" ").filter((p) => p.length >= 2);

/** Personas de RRHH por nombre (todas las palabras) o por DNI (desde 3 dígitos). */
export function buscarPersonas(empleados = [], texto = "", max = 8) {
  const q = normalizarTexto(texto);
  if (!q) return [];
  const digitos = q.replace(/\D/g, "");
  const palabras = q.split(" ").filter(Boolean);
  return empleados
    .filter((e) => (digitos.length >= 3 && String(e.dni ?? "").includes(digitos))
      || palabras.every((p) => normalizarTexto(e.nombre).includes(p)))
    .slice(0, max);
}

/**
 * La solicitud dice quién la retira (o, si no, quién la pidió): si eso
 * coincide con una sola persona de RRHH, se sugiere. Con dos "Juan" no se
 * adivina.
 */
export function sugerirPersona(sol, empleados = []) {
  for (const campo of ["retira", "solicita"]) {
    const palabras = palabrasDe(sol?.[campo]);
    if (!palabras.length) continue;
    const coinciden = empleados.filter((e) => {
      const nombre = normalizarTexto(e.nombre);
      return palabras.every((p) => nombre.includes(p));
    });
    if (coinciden.length === 1) return { persona: coinciden[0], campo, texto: limpio(sol[campo]) };
    return { persona: null, campo, texto: limpio(sol[campo]), varias: coinciden.length > 1 };
  }
  return null;
}

/** "9 renglones a nombre de Juan Pérez": lo que se muestra después de entregar. */
export function textoResultadoEntrega(res, persona) {
  if (!res) return "";
  const quien = limpio(res.retira) || limpio(persona?.nombre) || "quien retira";
  if (res.ya_entregada) return `${res.numero != null ? `La N° ${res.numero}` : "La solicitud"} ya estaba entregada: no se registró de nuevo.`;
  const n = Number(res.movimientos) || 0;
  return `${n === 1 ? "1 renglón registrado" : `${n} renglones registrados`} a nombre de ${quien}.`;
}

// ── Textos chicos ──────────────────────────────────────────────────────────

/** Dos iniciales para cuando no hay foto: "PEREZ, Juan" → "PJ". */
export function iniciales(texto) {
  return String(texto || "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase() || "?";
}

/** El código que se ve: hoy es el de Rebollar (el de la etiqueta). */
export function codigoVisible(item, renglon) {
  return item?.codigoEtiqueta || item?.config?.proveedor_codigo || renglon?.codigo || item?.codigo || "";
}

/** "mié 14/10": para la hoja impresa y el detalle. */
export function fechaCorta(iso) {
  const d = String(iso ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return "";
  return `${DIAS_CORTOS[diaSemana(d)]} ${d.slice(8, 10)}/${d.slice(5, 7)}`;
}
