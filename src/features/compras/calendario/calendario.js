/*
 * Calendario de compras de los ítems estándar (matriz de cada línea).
 *
 *   se necesita   = desmolde de la obra + semana del ítem o de su rubro
 *   comprar antes = se necesita − plazo del proveedor − margen
 *
 * Lo que falta sale de la misma cuenta que la lista de cada obra (la planilla
 * de la línea): lo pedido o con aviso de ingreso ya no se vuelve a comprar, y
 * lo que hay libre en el pañol se usa antes (primero para la obra que lo
 * necesita antes). Lo que en una obra en curso ya tendría que haber llegado y
 * el sistema no lo vio no se manda a comprar solo, porque en los barcos ya
 * botados el 83 % de la matriz se puso sin pasar por el pañol (03/11/2026) y
 * comprarlo de nuevo sería un error: se ve sólo si se pide.
 */

export const MARGEN_DIAS = 7;
export const SEMANAS_A_LA_VISTA = 12;

// Semana base desde el desmolde en que cada rubro tiene que estar en el pañol.
// Es un punto de partida para que el calendario funcione desde el primer día:
// Compras la corrige por línea en "Semanas por rubro".
export const SEMANA_BASE_POR_RUBRO = {
  mecanica: 0,
  laminacion: 0,
  electricidad: 2,
  sanitarios: 2,
  fijaciones: 2,
  maderas: 2,
  herreria: 3,
  bronceria: 3,
  "carpinteria y alistamiento": 7,
  herrajes: 7,
  electronica: 8,
  griferias: 8,
  electrodomesticos: 9,
  vidrios: 10,
};

const MIN_LLEGADAS_PARA_SUGERIR = 5;

export function normalizarTexto(value = "") {
  return String(value || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function claveProveedor(nombre) {
  return String(nombre || "").trim().toLowerCase();
}

function aFecha(value) {
  if (!value) return null;
  if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  const [y, m, d] = String(value).slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function sumarDias(fecha, dias) {
  const d = aFecha(fecha);
  d.setDate(d.getDate() + dias);
  return d;
}

export function isoFecha(fecha) {
  const d = aFecha(fecha);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Lunes de la semana de una fecha. */
export function inicioSemana(fecha) {
  const d = aFecha(fecha);
  const dia = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dia);
  return d;
}

function mediana(valores) {
  if (!valores.length) return null;
  const v = [...valores].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/**
 * Sugerencia de semana por línea y rubro. Si hay suficientes llegadas en
 * barcos recientes de la línea, la mediana; si no, la semana base del rubro.
 *   llegadas: [{ linea, categoria_id, semanas }]
 *   rubros:   [{ linea, categoria_id, rubro }]
 */
export function sugerirSemanasRubro(rubros = [], llegadas = []) {
  const porClave = new Map();
  for (const l of llegadas) {
    const k = `${l.linea}|${l.categoria_id}`;
    if (!porClave.has(k)) porClave.set(k, []);
    porClave.get(k).push(l.semanas);
  }
  const out = new Map();
  for (const r of rubros) {
    const k = `${r.linea}|${r.categoria_id}`;
    const valores = porClave.get(k) || [];
    const med = mediana(valores);
    // Una mediana negativa es lo comprado por adelantado para barcos futuros,
    // no cuándo se necesita: no sirve como sugerencia.
    if (valores.length >= MIN_LLEGADAS_PARA_SUGERIR && med >= 0 && med <= 40) {
      out.set(k, { semana: Math.round(med), fuente: `según ${valores.length} llegadas` });
      continue;
    }
    const base = SEMANA_BASE_POR_RUBRO[normalizarTexto(r.rubro)];
    if (base != null) out.set(k, { semana: base, fuente: "base" });
  }
  return out;
}

/**
 * Sugerencia de plazo: lo medido del proveedor si hay al menos 3 pedidos
 * recibidos; si no, la mediana general.
 *   medidos: Map clave → { dias: [..] }
 */
export function sugerirPlazo(proveedor, medidos = new Map(), general = 21) {
  const dias = medidos.get(claveProveedor(proveedor))?.dias || [];
  if (dias.length >= 3) return { dias: Math.round(mediana(dias)), fuente: `medido en ${dias.length} pedidos` };
  return { dias: general, fuente: "general" };
}

function semanaDe(item, { semanasItem, semanasRubro, sugeridas }) {
  const kItem = `${item.linea}|${item.material_id}`;
  if (semanasItem.has(kItem)) return { semana: semanasItem.get(kItem), fuente: "item" };
  const kRubro = `${item.linea}|${item.categoria_id}`;
  if (semanasRubro.has(kRubro)) return { semana: semanasRubro.get(kRubro), fuente: "rubro" };
  const sug = sugeridas.get(kRubro);
  if (sug) return { semana: sug.semana, fuente: "sugerida" };
  return null;
}

function plazoDe(proveedor, { plazos, plazosSugeridos, plazoGeneral }) {
  const k = claveProveedor(proveedor);
  if (k && plazos.has(k)) return { dias: plazos.get(k), fuente: "cargado" };
  const sug = k ? plazosSugeridos.get(k) : null;
  if (sug) return { dias: sug.dias, fuente: "sugerido" };
  return { dias: plazoGeneral, fuente: "general" };
}

/**
 * Arma los pedidos: un proveedor, y dentro un pedido por obra. Así se cotiza y
 * se compra en Klase A: los codos de bronce del 37 y los del 52 llegan juntos,
 * pero el presupuesto es uno por barco.
 *
 *   necesidades: [{ linea, filaId, material_id, requisito_material_id, snapshotId,
 *                   descripcion, codigo, unidad, proveedor, categoria_id, rubro,
 *                   obraId, obra, desmolde, cantidad, sinModelo, libreKey }]
 *                 Lo que la lista de cada obra todavía espera y nadie pidió ni avisó.
 *   libre:       Map libreKey → cantidad libre en el pañol (de toda la familia)
 *
 * Un pedido entra a la vista si su ítem más urgente hay que pedirlo dentro de
 * las semanas a la vista; entra entero, con lo que se necesita más adelante,
 * porque se le pide todo junto al proveedor. Lo vencido (ya tendría que estar
 * en el barco) queda afuera salvo que se pida verlo.
 */
export function armarPedidos({
  necesidades = [], libre = new Map(),
  semanasItem = new Map(), semanasRubro = new Map(), sugeridas = new Map(),
  plazos = new Map(), plazosSugeridos = new Map(), plazoGeneral = 21,
  hoy = new Date(), margen = MARGEN_DIAS, semanasALaVista = SEMANAS_A_LA_VISTA, incluirVencidos = false,
} = {}) {
  const hoyD = aFecha(hoy);
  const fechadas = [];
  const sinFecha = new Map();
  const vencidos = new Map();

  for (const n of necesidades) {
    if (!n.desmolde || !(Number(n.cantidad) > 0)) continue;
    const sem = semanaDe({ linea: n.linea, material_id: n.filaId, categoria_id: n.categoria_id }, { semanasItem, semanasRubro, sugeridas });
    if (!sem) {
      const s = sinFecha.get(n.categoria_id) || { rubro: n.rubro, linea: new Set(), items: 0 };
      s.linea.add(n.linea);
      s.items += 1;
      sinFecha.set(n.categoria_id, s);
      continue;
    }
    const necesita = sumarDias(n.desmolde, sem.semana * 7);
    const vencido = necesita < hoyD;
    if (vencido) {
      const v = vencidos.get(n.obraId) || { obra: n.obra, items: 0 };
      v.items += 1;
      vencidos.set(n.obraId, v);
      if (!incluirVencidos) continue;
    }
    const plazo = plazoDe(n.proveedor, { plazos, plazosSugeridos, plazoGeneral });
    fechadas.push({
      ...n,
      cantidad: Number(n.cantidad),
      necesita,
      vencido,
      comprarAntes: sumarDias(necesita, -(plazo.dias + margen)),
      semana: sem.semana,
      semanaFuente: sem.fuente,
      plazo: plazo.dias,
      plazoFuente: plazo.fuente,
    });
  }

  // Lo libre del pañol se usa primero para lo que se necesita antes.
  fechadas.sort((a, b) => a.necesita - b.necesita || String(a.obra).localeCompare(String(b.obra), "es", { numeric: true }));
  const libreRestante = new Map([...libre.entries()].map(([k, v]) => [k, Math.max(0, Number(v) || 0)]));
  const aComprar = [];
  const conStock = [];
  for (const n of fechadas) {
    const k = n.libreKey || n.material_id;
    const hay = libreRestante.get(k) || 0;
    const usa = Math.min(hay, n.cantidad);
    if (usa > 0) libreRestante.set(k, hay - usa);
    if (usa >= n.cantidad - 0.0001) { conStock.push({ ...n, deStock: usa }); continue; }
    aComprar.push({ ...n, deStock: usa, faltan: redondear(n.cantidad - usa) });
  }

  // proveedor → obra → ítems
  const porProveedor = new Map();
  for (const n of aComprar) {
    const nombre = n.proveedor || "Sin proveedor";
    const kProv = n.proveedor ? claveProveedor(n.proveedor) : "";
    if (!porProveedor.has(kProv)) porProveedor.set(kProv, { clave: kProv, proveedor: nombre, plazo: n.plazo, plazoFuente: n.plazoFuente, pedidos: new Map() });
    const prov = porProveedor.get(kProv);
    if (!prov.pedidos.has(n.obraId)) {
      prov.pedidos.set(n.obraId, { clave: `${kProv}|${n.obraId}`, obraId: n.obraId, obra: n.obra, linea: n.linea, desmolde: n.desmolde, comprarAntes: n.comprarAntes, necesita: n.necesita, items: [] });
    }
    const ped = prov.pedidos.get(n.obraId);
    ped.items.push(n);
    if (n.comprarAntes < ped.comprarAntes) ped.comprarAntes = n.comprarAntes;
    if (n.necesita < ped.necesita) ped.necesita = n.necesita;
  }

  const limite = sumarDias(inicioSemana(hoyD), semanasALaVista * 7);
  let masAdelante = 0;
  const proveedores = [];
  for (const prov of porProveedor.values()) {
    const pedidos = [];
    for (const ped of prov.pedidos.values()) {
      if (ped.comprarAntes >= limite) { masAdelante += 1; continue; }
      ped.items.sort((a, b) => a.comprarAntes - b.comprarAntes || String(a.rubro).localeCompare(String(b.rubro), "es") || a.descripcion.localeCompare(b.descripcion, "es"));
      ped.atrasado = ped.comprarAntes < hoyD;
      pedidos.push(ped);
    }
    if (!pedidos.length) continue;
    pedidos.sort((a, b) => a.comprarAntes - b.comprarAntes || String(a.obra).localeCompare(String(b.obra), "es", { numeric: true }));
    proveedores.push({ ...prov, pedidos, comprarAntes: pedidos[0].comprarAntes });
  }
  proveedores.sort((a, b) => (!a.clave) - (!b.clave) || a.comprarAntes - b.comprarAntes || a.proveedor.localeCompare(b.proveedor, "es"));

  const pedidosVisibles = proveedores.flatMap((p) => p.pedidos);
  return {
    proveedores,
    conStock,
    masAdelante,
    vencidos: [...vencidos.values()].sort((a, b) => b.items - a.items),
    sinFecha: [...sinFecha.values()].map((s) => ({ ...s, linea: [...s.linea] })),
    totalPedidos: pedidosVisibles.length,
    totalItems: pedidosVisibles.reduce((n, p) => n + p.items.length, 0),
    pedidosAtrasados: pedidosVisibles.filter((p) => p.atrasado).length,
  };
}

/** Texto de un pedido (un proveedor, una obra) para mandar a cotizar. */
export function textoPedido(proveedor, obra, items = []) {
  const lineas = items.map((i) => `- ${fmt(i.faltan ?? i.cantidad)} ${i.unidad || "u"}  ${i.descripcion}${i.codigo ? ` (${i.codigo})` : ""}`);
  return [`Pedido a ${proveedor} · Obra ${obra}`, ...lineas].join("\n");
}

const redondear = (n) => Math.round(Number(n || 0) * 100) / 100;

function fmt(n) {
  const v = redondear(n);
  return Number.isInteger(v) ? String(v) : String(v).replace(".", ",");
}
