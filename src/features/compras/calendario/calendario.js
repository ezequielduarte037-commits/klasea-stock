/*
 * Calendario de compras de los ítems estándar (matriz de cada línea).
 *
 *   comprar = desmolde de la obra + semana de compra
 *
 * La semana se cuenta desde el desmolde (−4 = un mes antes, 0 = la semana del
 * desmolde) y ya incluye lo que tarda el proveedor: es como lo piensa Compras
 * ("lo de Trimer se compra un mes antes", 05/11/2026). Manda la del ítem, si
 * no la del proveedor, si no la del rubro en esa línea, si no una sugerida.
 *
 * Lo que falta sale de la misma cuenta que la lista de cada obra (la planilla
 * de la línea): lo pedido o con aviso de ingreso ya no se vuelve a comprar, y
 * lo que hay libre en el pañol se usa antes (primero para la obra que lo
 * compra antes). Lo de una obra ya desmoldada que tendría que haber llegado
 * hace rato no se manda a comprar solo, porque en los barcos ya botados el
 * 83 % de la matriz se puso sin pasar por el pañol (03/11/2026) y comprarlo de
 * nuevo sería un error: se ve sólo si se pide.
 */

export const SEMANAS_A_LA_VISTA = 12;
// Lo que tarda en llegar algo pedido, para las sugerencias que salen de cuándo
// llegó cada cosa y para decidir qué ya tendría que estar en el barco.
export const SEMANAS_DE_ENTREGA = 3;
// Lo que tendría que haber llegado hace más que esto, en una obra ya
// desmoldada, probablemente se puso sin pasar por el pañol.
export const SEMANAS_DE_GRACIA = 4;

// Semana de compra base por rubro. Es un punto de partida para que el
// calendario funcione desde el primer día: Compras la corrige por línea en
// "Por rubro". Broncería, sanitarios y vidrios son los que dio Ezequiel.
export const SEMANA_BASE_POR_RUBRO = {
  mecanica: -3,
  laminacion: -3,
  electricidad: -1,
  sanitarios: 0,
  fijaciones: -1,
  maderas: -1,
  herreria: 0,
  bronceria: 0,
  "carpinteria y alistamiento": 4,
  herrajes: 4,
  electronica: 5,
  griferias: 5,
  electrodomesticos: 6,
  vidrios: -13,
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
 * Sugerencia de semana de compra por línea y rubro. Si hay suficientes
 * llegadas en barcos recientes de la línea, la mediana de cuándo llegó menos
 * lo que tarda la entrega; si no, la semana base del rubro.
 *   llegadas: [{ linea, categoria_id, semanas }]   (semanas desde el desmolde)
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
    // no cuándo hace falta: no sirve como sugerencia.
    if (valores.length >= MIN_LLEGADAS_PARA_SUGERIR && med >= 0 && med <= 40) {
      out.set(k, { semana: Math.round(med) - SEMANAS_DE_ENTREGA, fuente: `según ${valores.length} llegadas` });
      continue;
    }
    const base = SEMANA_BASE_POR_RUBRO[normalizarTexto(r.rubro)];
    if (base != null) out.set(k, { semana: base, fuente: "base" });
  }
  return out;
}

function semanaDe(n, { semanasItem, semanasProveedor, semanasRubro, sugeridas }) {
  const kItem = `${n.linea}|${n.filaId}`;
  if (semanasItem.has(kItem)) return { semana: semanasItem.get(kItem), fuente: "item" };
  const kProv = claveProveedor(n.proveedor);
  if (kProv && semanasProveedor.has(kProv)) return { semana: semanasProveedor.get(kProv), fuente: "proveedor" };
  const kRubro = `${n.linea}|${n.categoria_id}`;
  if (semanasRubro.has(kRubro)) return { semana: semanasRubro.get(kRubro), fuente: "rubro" };
  const sug = sugeridas.get(kRubro);
  if (sug) return { semana: sug.semana, fuente: "sugerida" };
  return null;
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
 * Un pedido entra a la vista si su ítem más urgente hay que comprarlo dentro
 * de las semanas a la vista; entra entero, con lo que se compra más adelante,
 * porque se le pide todo junto al proveedor. Lo vencido (obra ya desmoldada y
 * tendría que haber llegado hace más de un mes) queda afuera salvo que se pida verlo.
 */
export function armarPedidos({
  necesidades = [], libre = new Map(),
  semanasItem = new Map(), semanasProveedor = new Map(), semanasRubro = new Map(), sugeridas = new Map(),
  hoy = new Date(), semanasALaVista = SEMANAS_A_LA_VISTA, incluirVencidos = false,
} = {}) {
  const hoyD = aFecha(hoy);
  const fechadas = [];
  const sinFecha = new Map();
  const vencidos = new Map();

  for (const n of necesidades) {
    if (!n.desmolde || !(Number(n.cantidad) > 0)) continue;
    const sem = semanaDe(n, { semanasItem, semanasProveedor, semanasRubro, sugeridas });
    if (!sem) {
      const s = sinFecha.get(n.categoria_id) || { rubro: n.rubro, linea: new Set(), items: 0 };
      s.linea.add(n.linea);
      s.items += 1;
      sinFecha.set(n.categoria_id, s);
      continue;
    }
    const comprarAntes = sumarDias(n.desmolde, sem.semana * 7);
    const vencido = aFecha(n.desmolde) < hoyD && sumarDias(comprarAntes, (SEMANAS_DE_ENTREGA + SEMANAS_DE_GRACIA) * 7) < hoyD;
    if (vencido) {
      const v = vencidos.get(n.obraId) || { obra: n.obra, items: 0 };
      v.items += 1;
      vencidos.set(n.obraId, v);
      if (!incluirVencidos) continue;
    }
    fechadas.push({ ...n, cantidad: Number(n.cantidad), comprarAntes, vencido, semana: sem.semana, semanaFuente: sem.fuente });
  }

  // Lo libre del pañol se usa primero para lo que se compra antes.
  fechadas.sort((a, b) => a.comprarAntes - b.comprarAntes || String(a.obra).localeCompare(String(b.obra), "es", { numeric: true }));
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
    if (!porProveedor.has(kProv)) porProveedor.set(kProv, { clave: kProv, proveedor: nombre, semanaProveedor: semanasProveedor.get(kProv) ?? null, pedidos: new Map() });
    const prov = porProveedor.get(kProv);
    if (!prov.pedidos.has(n.obraId)) {
      prov.pedidos.set(n.obraId, { clave: `${kProv}|${n.obraId}`, obraId: n.obraId, obra: n.obra, linea: n.linea, desmolde: n.desmolde, comprarAntes: n.comprarAntes, items: [] });
    }
    const ped = prov.pedidos.get(n.obraId);
    ped.items.push(n);
    if (n.comprarAntes < ped.comprarAntes) ped.comprarAntes = n.comprarAntes;
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

export const SEMANAS_FALTANTES = 8;

/**
 * Lo que va a faltar en el pañol para los barcos, por producto. Reemplaza al
 * mínimo fijo en lo que se compra para cada barco (matafuegos que se vencen,
 * anclas, equipos): no avisa por tener poco, avisa cuando los barcos que lo
 * necesitan en las próximas semanas son más que lo libre. "Hay 1 libre y lo
 * necesitan 3 barcos: faltan 2."
 *
 * Misma cuenta que armarPedidos (necesidades de la lista de cada obra, semana
 * de compra del ítem, del proveedor o del rubro, lo libre primero para el que
 * lo necesita antes). Se necesita = la compra más lo que tarda la entrega. Lo que
 * ya tendría que estar en el barco no se suma al faltante: va a "a confirmar",
 * porque en los barcos en curso mucho se puso sin pasar por el pañol (el ancla
 * figuraba pendiente en 16 obras, botadas incluidas, el 04/11/2026).
 */
export function faltantesParaObras({
  necesidades = [], libre = new Map(),
  semanasItem = new Map(), semanasProveedor = new Map(), semanasRubro = new Map(), sugeridas = new Map(),
  hoy = new Date(), semanasHorizonte = SEMANAS_FALTANTES,
} = {}) {
  const hoyD = aFecha(hoy);
  const limite = sumarDias(hoyD, semanasHorizonte * 7);
  const proximas = [];
  const atrasadas = [];
  let sinFecha = 0;

  for (const n of necesidades) {
    if (!n.desmolde || !(Number(n.cantidad) > 0)) continue;
    const sem = semanaDe(n, { semanasItem, semanasProveedor, semanasRubro, sugeridas });
    if (!sem) { sinFecha += 1; continue; }
    const comprarAntes = sumarDias(n.desmolde, sem.semana * 7);
    const necesita = sumarDias(comprarAntes, SEMANAS_DE_ENTREGA * 7);
    if (necesita < hoyD) { atrasadas.push({ ...n, cantidad: Number(n.cantidad), necesita }); continue; }
    if (necesita > limite) continue;
    proximas.push({ ...n, cantidad: Number(n.cantidad), necesita, comprarAntes });
  }

  const producto = (n) => ({
    clave: n.libreKey || n.material_id,
    material_id: n.material_id,
    descripcion: n.descripcion,
    codigo: n.codigo,
    unidad: n.unidad,
    rubro: n.rubro,
    proveedor: n.proveedor,
    libre: Math.max(0, Number(libre.get(n.libreKey || n.material_id)) || 0),
  });

  proximas.sort((a, b) => a.necesita - b.necesita || String(a.obra).localeCompare(String(b.obra), "es", { numeric: true }));
  const libreRestante = new Map([...libre.entries()].map(([k, v]) => [k, Math.max(0, Number(v) || 0)]));
  const porProducto = new Map();
  for (const n of proximas) {
    const p = porProducto.get(n.libreKey || n.material_id) || { ...producto(n), necesitan: [], necesario: 0, faltan: 0, necesita: n.necesita, comprarAntes: null };
    porProducto.set(p.clave, p);
    const hay = libreRestante.get(p.clave) || 0;
    const usa = Math.min(hay, n.cantidad);
    libreRestante.set(p.clave, hay - usa);
    const faltan = redondear(n.cantidad - usa);
    p.necesitan.push({ obraId: n.obraId, obra: n.obra, cantidad: n.cantidad, necesita: n.necesita, deStock: usa, faltan });
    p.necesario = redondear(p.necesario + n.cantidad);
    p.faltan = redondear(p.faltan + faltan);
    // "Pedir antes" lo marca la primera obra que queda sin cubrir.
    if (faltan > 0 && (!p.comprarAntes || n.comprarAntes < p.comprarAntes)) p.comprarAntes = n.comprarAntes;
  }
  const productos = [...porProducto.values()];
  const faltan = productos
    .filter((p) => p.faltan > 0.0001)
    .map((p) => ({ ...p, atrasado: p.comprarAntes < hoyD }))
    .sort((a, b) => a.comprarAntes - b.comprarAntes || a.necesita - b.necesita || a.descripcion.localeCompare(b.descripcion, "es"));

  const confirmar = new Map();
  for (const n of atrasadas) {
    const p = confirmar.get(n.libreKey || n.material_id) || { ...producto(n), obras: [], cantidad: 0 };
    confirmar.set(p.clave, p);
    p.obras.push({ obraId: n.obraId, obra: n.obra, cantidad: n.cantidad, necesita: n.necesita, semanasAtraso: Math.floor((hoyD - n.necesita) / (7 * 86400000)) });
    p.cantidad = redondear(p.cantidad + n.cantidad);
  }
  const aConfirmar = [...confirmar.values()]
    .map((p) => ({ ...p, obras: p.obras.sort((a, b) => a.necesita - b.necesita) }))
    .sort((a, b) => b.obras.length - a.obras.length || a.descripcion.localeCompare(b.descripcion, "es"));

  return { faltan, aConfirmar, cubiertos: productos.length - faltan.length, sinFecha, limite };
}

/**
 * faltantesParaObras con lo que trae cargarDatosCalendario: las semanas
 * sugeridas se sacan igual que en el calendario de Compras.
 */
export function faltantesDesdeDatos(datos, opciones = {}) {
  const rubros = new Map();
  for (const m of datos?.matriz || []) {
    if (!m.categoria_id) continue;
    const k = `${m.linea}|${m.categoria_id}`;
    if (!rubros.has(k)) rubros.set(k, { linea: m.linea, categoria_id: m.categoria_id, rubro: m.rubro });
  }
  const sugeridas = sugerirSemanasRubro([...rubros.values()], datos?.llegadas || []);
  return faltantesParaObras({ ...datos, sugeridas, ...opciones });
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
