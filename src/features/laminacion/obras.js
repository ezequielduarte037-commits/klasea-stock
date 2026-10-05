// Obras para Laminación: una sola lista para elegir (pedidos, egresos e
// ingresos) armada con las obras de Producción (`produccion_obras`, donde están
// las fechas reales de desmolde) y las de laminación (`laminacion_obras`).
//
// Antes cada pantalla escribía la obra a mano y en la base convivían "H174",
// "h174" y "HUNTER 174", o "ANTAGO 30", "ANTAGO  29" y "ANT 29": los consumos
// por obra no cerraban. Ahora se elige de la lista y se guarda siempre el mismo
// texto; escribir a mano queda como última opción.

// Lugar de stock de cada galpón: es el destino que reciben Compras y los
// pedidos que no van a un barco.
export const STOCK_DE_SEDE = { Pampa: "Stock Pampa 1050", Chubut: "Stock Chubut" };

export function stockDeSede(sede) {
  return STOCK_DE_SEDE[sede] || STOCK_DE_SEDE.Pampa;
}

export function esDestinoStock(valor) {
  return /^Stock(\s|$)/i.test(String(valor || "").trim());
}

// Clave para comparar dos formas de escribir la misma obra:
// "K52-27", "52-27" y "Obra K52-27" → "52-27"; "HUNTER-H-175", "H175",
// "hunter 175" → "H175"; "ANTAGO-A-30" y "ANTAGO 30" → "A30".
export function claveObra(valor) {
  let s = String(valor ?? "").trim().toUpperCase();
  if (!s) return "";
  s = s.replace(/^OBRA\s+/, "");
  s = s.replace(/^HUNTER[\s-]*(H[\s-]*)?/, "H");
  s = s.replace(/^ANTAGO[\s-]*(A[\s-]*)?/, "A");
  s = s.replace(/^K(?=\d)/, "");
  s = s.replace(/[\s_]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  s = s.replace(/^([A-Z])-(\d)/, "$1$2");
  return s;
}

// Texto que se guarda para una obra de Producción. Coincide con lo que ya usan
// Obras por laminación y Costos ("52-27"); Hunter y Antago van como se venían
// escribiendo en el galpón ("H175", "ANTAGO 30").
function valorDeProduccion(codigo) {
  const c = String(codigo || "").trim();
  const hunter = c.match(/^HUNTER-H-?(\d+)$/i);
  if (hunter) return `H${hunter[1]}`;
  const antago = c.match(/^ANTAGO-A-?(\d+)$/i);
  if (antago) return `ANTAGO ${antago[1]}`;
  return c;
}

// Línea de la plantilla de laminación (`linea_plantillas.linea`).
export function lineaPlantilla(codigo, lineaNombre) {
  const linea = String(lineaNombre || "").trim().toUpperCase();
  const c = String(codigo || "").trim().toUpperCase();
  if (linea.startsWith("HUNTER") || /^(HUNTER|H\d)/.test(c)) return "K34";
  if (linea.startsWith("ANTAGO") || /^(ANTAGO|A\d)/.test(c)) return "ANTAGO";
  if (/^K\d+/.test(linea)) return linea.match(/^K\d+/)[0];
  const num = c.replace(/^K/, "").match(/^(\d+)-/);
  return num ? `K${num[1]}` : (linea || null);
}

function etiquetaLinea(linea) {
  if (linea === "K34") return "Hunter 34";
  if (linea === "ANTAGO") return "Antago";
  return linea || "Otras";
}

const ESTADO_ORDEN = { activa: 0, pausada: 1, terminada: 2 };

export function construirObras({ produccion = [], laminacion = [] }) {
  const porClave = new Map();
  const agregar = (obra) => {
    const previa = porClave.get(obra.clave);
    if (!previa) { porClave.set(obra.clave, obra); return; }
    // Si la obra está en las dos tablas, se combinan: estado y fechas de
    // Producción y, si laminación ya tenía la obra con otro nombre, se sigue
    // guardando ese (es con el que Obras por laminación cuenta los consumos).
    const deProduccion = previa.poId ? previa : obra.poId ? obra : previa;
    porClave.set(obra.clave, {
      ...previa,
      alias: [...(previa.alias || []), ...(obra.alias || [])],
      valor: previa.loId ? previa.valor : obra.loId ? obra.valor : previa.valor,
      linea: previa.linea || obra.linea,
      lineaLabel: previa.linea ? previa.lineaLabel : obra.lineaLabel,
      estado: deProduccion.estado,
      desmoldeEstimado: deProduccion.desmoldeEstimado || previa.desmoldeEstimado || obra.desmoldeEstimado,
      desmoldeReal: deProduccion.desmoldeReal || previa.desmoldeReal || obra.desmoldeReal,
      botada: deProduccion.botada || previa.botada || obra.botada,
      poId: previa.poId || obra.poId,
      loId: previa.loId || obra.loId,
    });
  };

  for (const po of produccion) {
    if (!po?.codigo) continue;
    const valor = valorDeProduccion(po.codigo);
    const linea = lineaPlantilla(po.codigo, po.linea_nombre);
    agregar({
      clave: claveObra(valor),
      valor,
      codigo: valor,
      linea,
      lineaLabel: etiquetaLinea(linea),
      estado: po.estado || "activa",
      desmoldeEstimado: po.desmolde_estimado?.slice(0, 10) || null,
      desmoldeReal: po.desmolde_real?.slice(0, 10) || null,
      botada: (po.botada_real || po.botada)?.slice(0, 10) || null,
      poId: po.id,
      loId: null,
      alias: [],
    });
  }

  for (const lo of laminacion) {
    if (!lo?.nombre) continue;
    const linea = lineaPlantilla(lo.nombre, lo.descripcion?.match(/K\d+/)?.[0]);
    const po = lo.produccion_obra_id ? produccion.find((p) => p.id === lo.produccion_obra_id) : null;
    // Laminación cargó la Antago 30 como "ANTAGO" con el número en la
    // descripción: es la misma obra que "ANTAGO-A-30" de Producción. Se sigue
    // guardando "ANTAGO" (así están sus egresos) pero se muestra con el número.
    const numero = !po && /^(ANTAGO|HUNTER)$/i.test(lo.nombre.trim()) && /^\d+$/.test(String(lo.descripcion || "").trim())
      ? String(lo.descripcion).trim() : null;
    const nombreVisible = numero ? `${lo.nombre.trim().toUpperCase()} ${numero}` : lo.nombre;
    const clave = po ? claveObra(valorDeProduccion(po.codigo)) : claveObra(nombreVisible);
    agregar({
      clave,
      valor: lo.nombre,
      codigo: nombreVisible,
      linea: po ? lineaPlantilla(po.codigo, po.linea_nombre) : linea,
      lineaLabel: etiquetaLinea(po ? lineaPlantilla(po.codigo, po.linea_nombre) : linea),
      estado: po?.estado || lo.estado || "activa",
      desmoldeEstimado: lo.fecha_desmolde_estimada?.slice(0, 10) || null,
      desmoldeReal: lo.fecha_desmolde_real?.slice(0, 10) || null,
      botada: null,
      poId: po?.id || null,
      loId: lo.id,
      alias: numero ? [claveObra(lo.nombre)] : [],
    });
  }

  return [...porClave.values()].sort((a, b) =>
    (ESTADO_ORDEN[a.estado] ?? 3) - (ESTADO_ORDEN[b.estado] ?? 3)
    || String(a.linea || "").localeCompare(String(b.linea || ""), "es", { numeric: true })
    || String(a.codigo).localeCompare(String(b.codigo), "es", { numeric: true }));
}

export function buscarObra(obras, valor) {
  const clave = claveObra(valor);
  if (!clave) return null;
  return obras.find((o) => o.clave === clave) ?? obras.find((o) => o.alias?.includes(clave)) ?? null;
}

// ¿Este texto (destino de un egreso, obra de un pedido…) es esta obra?
export function esDeObra(obra, valor) {
  const clave = claveObra(valor);
  return Boolean(obra && clave && (clave === obra.clave || obra.alias?.includes(clave)));
}

// La fecha que manda es el desmolde real; si todavía no pasó, el estimado.
export function desmoldeDe(obra) {
  if (!obra) return null;
  return obra.desmoldeReal || obra.desmoldeEstimado || null;
}

export function hoyISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function diasHasta(fechaISO) {
  if (!fechaISO) return null;
  const [y, m, d] = fechaISO.slice(0, 10).split("-").map(Number);
  const objetivo = new Date(y, m - 1, d);
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return Math.round((objetivo - hoy) / 86400000);
}

export function textoDias(dias) {
  if (dias == null) return "";
  if (dias === 0) return "hoy";
  if (dias === 1) return "mañana";
  if (dias === -1) return "ayer";
  if (dias > 0) return dias < 60 ? `en ${dias} días` : `en ${Math.round(dias / 7)} semanas`;
  return -dias < 60 ? `hace ${-dias} días` : `hace ${Math.round(-dias / 7)} semanas`;
}

export function fmtFecha(fechaISO, { anio = true } = {}) {
  if (!fechaISO) return "—";
  const s = String(fechaISO);
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00`) : new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-AR", anio ? { day: "2-digit", month: "2-digit", year: "2-digit" } : { day: "2-digit", month: "short" });
}

// Destinos que no son obras y se usaron varias veces (VARIOS, USO SEMANAL…),
// para ofrecerlos en la lista. Quedan afuera los traslados entre galpones —
// eso se hace en Traslados— y lo que se escribió una sola vez.
export function destinosFrecuentes(movimientos, obras, { minimo = 3, maximo = 6 } = {}) {
  const cuenta = new Map();
  for (const m of movimientos || []) {
    if (m.tipo !== "egreso") continue;
    const texto = String(m.destino || "").trim().replace(/\s+/g, " ").toUpperCase();
    if (!texto || /CHUBUT|PAMPA|TRASLADO|AJUSTE|TEST/.test(texto)) continue;
    // "K55" a secas es una línea, no una obra: mejor que elijan el barco.
    if (/^K\d+$/.test(texto)) continue;
    // Una obra vieja que ya no está en Obras ("42-80") no es "otro destino":
    // si hace falta, se escribe.
    if (buscarObra(obras, texto) || /^(\d{2,3}-\d+|[HA]\d+)$/.test(claveObra(texto))) continue;
    cuenta.set(texto, (cuenta.get(texto) || 0) + 1);
  }
  return [...cuenta.entries()]
    .filter(([, n]) => n >= minimo)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maximo)
    .map(([texto, n]) => ({ valor: texto, label: texto.charAt(0) + texto.slice(1).toLowerCase(), detalle: `${n} egresos` }));
}

// Número con hasta dos decimales, con coma.
export function fmtNum(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "0";
  return x.toLocaleString("es-AR", { maximumFractionDigits: 2 });
}

export function num(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

// Exporta filas a un CSV que Excel abre bien.
export function descargarCSV(filas, nombre) {
  if (!filas.length) return;
  const encabezado = Object.keys(filas[0]);
  const escape = (v) => {
    const s = v == null ? "" : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [encabezado.map(escape).join(","), ...filas.map((row) => encabezado.map((k) => escape(row[k])).join(","))].join("\n");
  // BOM UTF-8 para que Excel abra bien los acentos.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: nombre });
  a.click();
  URL.revokeObjectURL(url);
}

// Agrupa los pedidos por orden (la referencia OC-… va al principio de las
// observaciones). Lo usan Ingresos (recepción) y Pedidos.
export function agruparPorOrden(items, { manualPorPedido = true } = {}) {
  const grupos = {};
  for (const p of items) {
    const obs = p.observaciones ?? "";
    const match = obs.match(/^(OC-\d{8}-[A-Z0-9]+)/);
    const ref = match ? match[1] : manualPorPedido ? `__manual_${p.id}` : "__manual__";
    const label = match ? obs.replace(`${match[1]} | `, "") : (obs || "Pedido manual");
    if (!grupos[ref]) grupos[ref] = { ref, label, items: [], createdAt: p.created_at };
    grupos[ref].items.push(p);
    if (p.created_at && (!grupos[ref].createdAt || p.created_at > grupos[ref].createdAt)) grupos[ref].createdAt = p.created_at;
  }
  return Object.values(grupos).sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
}
