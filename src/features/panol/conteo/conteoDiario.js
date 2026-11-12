/*
 * Conteo diario del pañol: qué 20 productos se cuentan hoy y contra qué número
 * se comparan. La base guarda la lista y aplica los ajustes
 * (migración 20261103120000_panol_conteo_diario.sql); la elección vive acá
 * porque necesita la misma cuenta de stock que el resto de las pantallas.
 *
 * Reparto (propuesta del 03/11/2026):
 *   7 de los más movidos (A, cada 30 días) · 5 intermedios (B, cada 90)
 *   5 del resto (C, cada 180) · 3 por evento (negativo, ubicaciones que no
 *   cierran, ficha con problema). Lo que quedó sin contar ayer va primero.
 */
import { fmtQty, qty, rowObraId, rowSede } from "../stockGrupos.js";
import { rowDelta, rowMovementAt } from "../panolMovimientos.js";

export const CONTEO_CUPOS = { evento: 3, A: 7, B: 5, C: 5 };
export const CONTEO_TOTAL = 20;
export const CONTEO_CADA_DIAS = { A: 30, B: 90, C: 180 };
const DIA_MS = 86400000;
const VENTANA_MOVIMIENTO_DIAS = 90;
const EVENTO_REPOSO_DIAS = 7;

export const CONTEO_ESTADOS = {
  pendiente: { label: "Por contar", tono: "cyan" },
  ok: { label: "Coincide", tono: "green" },
  ajustado: { label: "Ajustado", tono: "blue" },
  recontar: { label: "Segundo conteo", tono: "violet" },
  revisar: { label: "A revisar", tono: "red" },
  descartado: { label: "Descartado", tono: "dim" },
  pasado: { label: "Pasó al día siguiente", tono: "dim" },
};

export const CONTEO_CLASES = {
  A: "Mucho movimiento",
  B: "Movimiento medio",
  C: "Poco movimiento",
  evento: "Por evento",
  arrastre: "Quedó de otro día",
};

// Fecha local AAAA-MM-DD (el lote es "de hoy" en Argentina, no en UTC).
export function fechaLocal(date = new Date()) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Generador chico y determinista: dos equipos que arman la lista del mismo día
// eligen lo mismo aunque la base se quede con la primera.
function semilla(texto) {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i += 1) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function azar(seed) {
  let s = seed || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/** Movimientos del producto en los últimos 90 días: la medida de "cuánto se usa". */
export function movimientosRecientes(group, now = new Date()) {
  const desde = now.getTime() - VENTANA_MOVIMIENTO_DIAS * DIA_MS;
  return (group.rows || []).filter((row) => {
    if (Math.abs(rowDelta(row)) < 0.0001) return false;
    const ts = rowMovementAt(row);
    return ts && new Date(ts).getTime() >= desde;
  }).length;
}

/**
 * Clase A/B/C de cada producto con stock, por movimiento (y valor en USD cuando
 * lo hay, porque muchas fichas no tienen precio). A = 15 % de arriba, B = 30 %.
 */
export function clasificarABC(groups = [], now = new Date()) {
  const puntaje = groups.map((group) => ({
    group,
    score: movimientosRecientes(group, now) + (qty(group.valueUsd, 0) > 0 ? Math.log10(1 + qty(group.valueUsd, 0)) * 2 : 0),
  })).sort((a, b) => b.score - a.score || String(a.group.label).localeCompare(String(b.group.label), "es"));
  const n = puntaje.length;
  const corteA = Math.ceil(n * 0.15);
  const corteB = Math.ceil(n * 0.45);
  const clases = new Map();
  puntaje.forEach((item, index) => {
    clases.set(item.group.material.id, index < corteA ? "A" : index < corteB ? "B" : "C");
  });
  return clases;
}

function motivoEvento(group) {
  if (group.negativo) return "Stock negativo en el sistema";
  if (group.locationImbalance) return "Las ubicaciones no cierran";
  if (group.verificacion === "problema") return "Ficha marcada con problema";
  return "";
}

/**
 * Arma la lista del día.
 *   groups: buildProductGroups de las filas de la sede (sin consumibles).
 *   ultimoConteo: Map material_id → fecha del último conteo terminado.
 *   arrastre: renglones de días anteriores que quedaron sin contar
 *             ([{ material_id, fecha }]).
 * Devuelve [{ material_id, clase, motivo, unidad }].
 */
export function elegirConteoDelDia(groups = [], { ultimoConteo = new Map(), arrastre = [], sede = "", fecha = fechaLocal(), now = new Date(), total = CONTEO_TOTAL } = {}) {
  const contables = groups.filter((group) => group.material?.id && !group.esRequisito);
  const byId = new Map(contables.map((group) => [group.material.id, group]));
  const elegidos = new Map();
  const agregar = (group, clase, motivo) => {
    if (!group || elegidos.size >= total || elegidos.has(group.material.id)) return;
    elegidos.set(group.material.id, { material_id: group.material.id, clase, motivo: motivo || CONTEO_CLASES[clase], unidad: group.unidad || "unidad" });
  };

  for (const item of arrastre) {
    agregar(byId.get(item.material_id), "arrastre", item.fecha ? `Quedó del ${item.fecha.split("-").reverse().slice(0, 2).join("/")}` : CONTEO_CLASES.arrastre);
  }

  const diasDesde = (materialId) => {
    const at = ultimoConteo.get(materialId);
    return at ? (now.getTime() - new Date(at).getTime()) / DIA_MS : Infinity;
  };
  const rand = azar(semilla(`${sede}|${fecha}`));
  const orden = (lista) => lista
    .map((group) => ({ group, dias: diasDesde(group.material.id), r: rand() }))
    .sort((a, b) => (b.dias === a.dias ? a.r - b.r : b.dias - a.dias))
    .map((item) => item.group);

  // Eventos: lo dudoso, salvo que se haya contado en la última semana.
  const eventos = orden(contables.filter((group) => motivoEvento(group) && diasDesde(group.material.id) > EVENTO_REPOSO_DIAS));
  eventos.slice(0, CONTEO_CUPOS.evento).forEach((group) => agregar(group, "evento", motivoEvento(group)));

  const conStock = contables.filter((group) => qty(group.total, 0) > 0.0001);
  const clases = clasificarABC(conStock, now);
  const vencidos = { A: [], B: [], C: [] };
  for (const group of conStock) {
    const clase = clases.get(group.material.id);
    if (diasDesde(group.material.id) > CONTEO_CADA_DIAS[clase]) vencidos[clase].push(group);
  }
  const ordenados = { A: orden(vencidos.A), B: orden(vencidos.B), C: orden(vencidos.C) };
  for (const clase of ["A", "B", "C"]) {
    ordenados[clase].slice(0, CONTEO_CUPOS[clase]).forEach((group) => agregar(group, clase));
  }
  // Si una clase no llenó su cupo, se completa con lo vencido de las otras y,
  // al final, con lo que hace más tiempo no se cuenta.
  for (const clase of ["A", "B", "C"]) ordenados[clase].forEach((group) => agregar(group, clase));
  orden(conStock).forEach((group) => agregar(group, clases.get(group.material.id)));

  return [...elegidos.values()];
}

/**
 * Lo que dice el sistema para un material en una sede, con las filas del
 * ledger de ese material: total físico (lo libre más lo reservado a obras,
 * porque se cuenta todo lo que hay en el estante) y lo libre.
 */
export function teoricoEnSede(rows = [], materialId, sede) {
  let total = 0;
  let libre = 0;
  for (const row of rows) {
    if (row.material_id !== materialId || rowSede(row) !== sede) continue;
    const delta = rowDelta(row);
    total += delta;
    if (!rowObraId(row)) libre += delta;
  }
  return { total: Math.round(total * 10000) / 10000, libre: Math.round(libre * 10000) / 10000 };
}

/** Exactitud: de lo contado y cerrado, cuánto dio igual al sistema. */
export function exactitud(items = []) {
  const cerrados = items.filter((item) => ["ok", "ajustado", "revisar", "descartado"].includes(item.estado));
  if (!cerrados.length) return null;
  const ok = cerrados.filter((item) => item.estado === "ok").length;
  return { cerrados: cerrados.length, ok, porcentaje: Math.round((ok / cerrados.length) * 100) };
}

// ─── Recorrido y historial ───────────────────────────────────────────────────

const comparadorUbicacion = new Intl.Collator("es", { numeric: true, sensitivity: "base" });

/**
 * Orden para caminar el pañol: por ubicación (A1, A2… A10) y, sin ubicación,
 * al final. Dentro de la misma ubicación respeta el orden de la lista.
 */
export function ordenRecorrido(items = []) {
  return [...items].sort((a, b) => {
    const ua = String(a.material?.ubicacion || "").trim();
    const ub = String(b.material?.ubicacion || "").trim();
    if (!ua !== !ub) return ua ? -1 : 1;
    return comparadorUbicacion.compare(ua, ub) || (a.orden ?? 0) - (b.orden ?? 0);
  });
}

/** Lo que hizo cada persona: primer conteo, segundo conteo o resolución. */
export function accionesDeItems(items = []) {
  const acciones = [];
  for (const item of items) {
    if (item.contado_at) acciones.push({ tipo: "conteo", uid: item.contado_por, at: item.contado_at, item });
    if (item.recontado_at) acciones.push({ tipo: "segundo", uid: item.recontado_por, at: item.recontado_at, item });
    if (item.resuelto_at) acciones.push({ tipo: "resuelto", uid: item.resuelto_por, at: item.resuelto_at, item });
  }
  return acciones.sort((a, b) => new Date(a.at) - new Date(b.at));
}

function sumarDias(fecha, n) {
  const [y, m, d] = fecha.split("-").map(Number);
  return fechaLocal(new Date(y, m - 1, d + n));
}

function diaDeSemana(fecha) {
  const [y, m, d] = fecha.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

/**
 * Resumen de los últimos `dias` días de una sede para ver si se está contando.
 *   lotes: [{ id, fecha, creado_por, created_at, items: [...] }]
 * Los días hábiles (lunes a viernes) aparecen siempre, aunque no se haya
 * armado la lista; sábado y domingo sólo si hubo lista o algún conteo.
 * Lo que se hizo se agrupa por el día en que se hizo (un segundo conteo de un
 * renglón del lunes hecho el martes cuenta para el martes).
 * `inicio` es la fecha de la primera lista de la sede: antes no había conteo
 * diario y esos días no cuentan como "sin lista".
 */
export function resumenHistorial(lotes = [], { hoy = fechaLocal(), dias = 30, inicio = null } = {}) {
  const hace = sumarDias(hoy, -(dias - 1));
  const desde = inicio && inicio > hace ? inicio : hace;
  const lotePorFecha = new Map(lotes.map((lote) => [lote.fecha, lote]));
  const acciones = accionesDeItems(lotes.flatMap((lote) => lote.items || []))
    .filter((accion) => {
      const f = fechaLocal(accion.at);
      return f >= desde && f <= hoy;
    });
  const accionesPorFecha = new Map();
  for (const accion of acciones) {
    const f = fechaLocal(accion.at);
    if (!accionesPorFecha.has(f)) accionesPorFecha.set(f, []);
    accionesPorFecha.get(f).push(accion);
  }

  const filas = [];
  for (let f = hoy; f >= desde; f = sumarDias(f, -1)) {
    const lote = lotePorFecha.get(f) || null;
    const delDia = accionesPorFecha.get(f) || [];
    const dow = diaDeSemana(f);
    const habil = dow >= 1 && dow <= 5;
    if (!habil && !lote && !delDia.length) continue;
    const items = lote?.items || [];
    const contados = items.filter((item) => item.contado_at).length;
    const personas = new Map();
    for (const accion of delDia) {
      const p = personas.get(accion.uid) || { uid: accion.uid, conteo: 0, segundo: 0, resuelto: 0 };
      p[accion.tipo] += 1;
      personas.set(accion.uid, p);
    }
    let estado;
    if (!lote) estado = f === hoy ? "sin_armar" : "sin_lista";
    else if (items.length && contados >= items.length) estado = "completa";
    else if (!contados) estado = f === hoy ? "por_empezar" : "sin_contar";
    else estado = f === hoy ? "en_curso" : "incompleta";
    filas.push({
      fecha: f,
      habil,
      hoy: f === hoy,
      lote,
      estado,
      asignados: items.length,
      contados,
      ok: items.filter((item) => item.estado === "ok").length,
      ajustados: items.filter((item) => item.estado === "ajustado").length,
      diferencias: items.filter((item) => ["recontar", "revisar"].includes(item.estado)).length,
      primero: delDia[0]?.at || null,
      ultimo: delDia[delDia.length - 1]?.at || null,
      acciones: delDia,
      personas: [...personas.values()].sort((a, b) => (b.conteo + b.segundo) - (a.conteo + a.segundo)),
    });
  }

  const personas = new Map();
  for (const accion of acciones) {
    const p = personas.get(accion.uid) || { uid: accion.uid, conteo: 0, segundo: 0, resuelto: 0, dias: new Set(), ultimo: null };
    p[accion.tipo] += 1;
    p.dias.add(fechaLocal(accion.at));
    p.ultimo = accion.at;
    personas.set(accion.uid, p);
  }

  // Los días pasados son los que se pueden juzgar; hoy todavía está en curso.
  const juzgables = filas.filter((fila) => fila.habil && !fila.hoy);
  const lotesPeriodo = lotes.filter((lote) => lote.fecha >= desde && lote.fecha <= hoy);
  const itemsPeriodo = lotesPeriodo.flatMap((lote) => lote.items || []);
  const asignados = lotesPeriodo.filter((lote) => lote.fecha < hoy).reduce((sum, lote) => sum + (lote.items?.length || 0), 0);
  const contadosPasados = lotesPeriodo.filter((lote) => lote.fecha < hoy).reduce((sum, lote) => sum + (lote.items || []).filter((item) => item.contado_at).length, 0);
  return {
    desde,
    hoy,
    filas,
    personas: [...personas.values()]
      .map((p) => ({ ...p, dias: p.dias.size }))
      .sort((a, b) => (b.conteo + b.segundo) - (a.conteo + a.segundo)),
    totales: {
      diasHabiles: juzgables.length,
      diasConLista: juzgables.filter((fila) => fila.lote).length,
      diasCompletos: juzgables.filter((fila) => fila.estado === "completa").length,
      diasSinContar: juzgables.filter((fila) => ["sin_lista", "sin_contar"].includes(fila.estado)).length,
      asignados,
      contados: contadosPasados,
      cumplimiento: asignados ? Math.round((contadosPasados / asignados) * 100) : null,
      exactitud: exactitud(itemsPeriodo),
      ajustados: itemsPeriodo.filter((item) => item.estado === "ajustado").length,
      abiertos: itemsPeriodo.filter((item) => ["recontar", "revisar"].includes(item.estado)).length,
    },
  };
}

export const ESTADOS_DIA = {
  completa: { label: "Completa", tono: "green" },
  incompleta: { label: "Incompleta", tono: "violet" },
  en_curso: { label: "En curso", tono: "cyan" },
  por_empezar: { label: "Sin empezar", tono: "cyan" },
  sin_contar: { label: "No se contó", tono: "red" },
  sin_lista: { label: "Sin lista", tono: "red" },
  sin_armar: { label: "Sin armar", tono: "dim" },
};

// ─── Qué pasó con un renglón, en palabras ────────────────────────────────────

/** Diferencias que se ven en "Ajustes y diferencias" del historial. */
export function tieneDiferencia(item = {}) {
  return ["ajustado", "recontar", "revisar", "descartado"].includes(item.estado) || !!item.ajuste_anulado;
}

/** Motivo de una anulación a partir de la nota "[anulado] … Motivo reversion: …". */
export function motivoAnulacion(nota = "") {
  const texto = String(nota || "");
  if (!texto.toLowerCase().includes("[anulado]")) return null;
  const match = texto.match(/motivo reversi[oó]n:\s*([^|\n]+)/i);
  return (match?.[1] || "").trim();
}

/**
 * Una o dos frases que cuentan qué pasó: qué decía el sistema, quién contó
 * cuánto, qué se hizo con el stock y en cuánto quedó.
 *   nombre(uid) → "Tomas"
 *   verNumeros: false para quien cuenta mientras falta un segundo conteo (el
 *   conteo es a ciegas: no puede saber qué dio el primero ni qué dice el sistema).
 */
export function explicarConteo(item = {}, { nombre = () => "Alguien", verNumeros = true } = {}) {
  const u = item.unidad && !/^unidad(es)?$/i.test(item.unidad) ? ` ${item.unidad}` : "";
  const n = (x) => `${fmtQty(x)}${u}`;
  const t = item.teorico == null ? null : Number(item.teorico);
  const c = item.contado == null ? null : Number(item.contado);
  const r = item.recontado == null ? null : Number(item.recontado);
  const quien = nombre(item.contado_por);
  const quien2 = nombre(item.recontado_por);
  const resolvio = item.resuelto_at ? nombre(item.resuelto_por) : null;
  const diferencia = (a, b) => {
    const d = a - b;
    if (d > 0) return `${n(d)} de más`;
    return Math.abs(d) === 1 ? `faltaba ${n(1)}` : `faltaban ${n(-d)}`;
  };
  const cambio = (ajuste) => {
    const uno = Math.abs(ajuste) === 1;
    return ajuste > 0 ? `${uno ? "Se sumó" : "Se sumaron"} ${n(ajuste)}` : `${uno ? "Se descontó" : "Se descontaron"} ${n(-ajuste)}`;
  };

  let texto;
  let tono = "dim";
  if (item.estado === "pendiente" || c == null) {
    return { texto: item.estado === "pasado" ? "No se contó ese día; pasó a la lista siguiente." : "Todavía no se contó.", tono: "dim" };
  }
  if (item.estado === "recontar") {
    tono = "violet";
    texto = verNumeros && t != null
      ? `El sistema decía ${n(t)} y ${quien} contó ${n(c)} (${diferencia(c, t)}). Es mucha diferencia para corregirla sola: falta que otra persona lo cuente.`
      : `${quien} lo contó y no coincidió con el sistema. Falta que otra persona lo cuente.`;
    return { texto, tono };
  }

  const base = t == null ? "" : `El sistema decía ${n(t)}`;
  const conteos = r == null
    ? `${quien} contó ${n(c)}`
    : `${quien} contó ${n(c)} y ${quien2} volvió a contar ${n(r)}`;

  if (item.estado === "ok") {
    tono = "green";
    texto = resolvio
      ? `${base}; ${conteos}. ${resolvio} lo dejó como estaba.`
      : `${base} y ${conteos}: coincide. No se tocó el stock.`;
  } else if (item.estado === "ajustado") {
    tono = "blue";
    const ajuste = Number(item.ajuste || 0);
    const final = t == null ? null : t + ajuste;
    const quedo = final == null ? "" : `: el sistema quedó en ${n(final)}`;
    if (resolvio) texto = `${base}; ${conteos}. ${resolvio} lo dejó en ${n(final)}. ${cambio(ajuste)} al stock.`;
    else if (r != null) texto = `${base}; ${conteos}, que confirma la diferencia (${diferencia(r, t)}). ${cambio(ajuste)}${quedo}.`;
    else texto = `${base} y ${conteos} (${diferencia(c, t)}). Como la diferencia es chica, se corrigió sola. ${cambio(ajuste)}${quedo}.`;
  } else if (item.estado === "revisar") {
    tono = "red";
    texto = `${base}; ${conteos}. Los conteos no coinciden entre sí, así que no se tocó el stock: lo resuelve Compras.`;
  } else if (item.estado === "descartado") {
    texto = `${base}; ${conteos}. ${resolvio || "Compras"} descartó la diferencia: el stock quedó como estaba.`;
  } else {
    texto = `${base}; ${conteos}.`;
  }

  if (item.ajuste_anulado) {
    tono = "red";
    const motivo = item.ajuste_anulado.motivo ? ` (motivo: «${item.ajuste_anulado.motivo}»)` : "";
    const por = item.ajuste_anulado.por ? `${nombre(item.ajuste_anulado.por)} anuló` : "Después se anuló";
    texto += ` ${por} ese ajuste${motivo}, así que el sistema volvió a ${t == null ? "lo que decía antes" : n(t)} y no coincide con lo contado.`;
  }
  return { texto: texto.replace(/^; /, ""), tono };
}
