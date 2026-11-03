/*
 * Calendario de compras de los ítems estándar (matriz de cada línea).
 *
 *   se necesita   = desmolde de la obra + semana del ítem o de su rubro
 *   comprar antes = se necesita − plazo del proveedor − margen
 *
 * Lo que ya llegó a la obra o ya está pedido no se vuelve a comprar, y lo que
 * hay libre en el pañol se usa antes de comprar (primero para la obra que lo
 * necesita antes). Lo que en una obra en curso ya tendría que haber llegado y
 * el sistema no lo vio no se manda a comprar: va a "A confirmar", porque en los
 * barcos ya botados el 83 % de la matriz se puso sin pasar por el pañol
 * (03/11/2026) y comprarlo de nuevo sería un error.
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
 * Arma el calendario.
 *   matriz:   [{ linea, material_id, descripcion, codigo, unidad, proveedor, categoria_id, rubro, cantidad }]
 *   obras:    [{ id, codigo, linea, desmolde }]
 *   obraFilas: Map `${obraId}|${materialId}` → { cantidad, estado, descripcion }
 *   llegados: Set `${obraId}|${materialId}`
 *   libre:    Map materialId → cantidad libre en pañol
 */
export function armarCalendario({
  matriz = [], obras = [], obraFilas = new Map(), llegados = new Set(), libre = new Map(),
  semanasItem = new Map(), semanasRubro = new Map(), sugeridas = new Map(),
  plazos = new Map(), plazosSugeridos = new Map(), plazoGeneral = 21,
  hoy = new Date(), margen = MARGEN_DIAS, semanasALaVista = SEMANAS_A_LA_VISTA,
} = {}) {
  const hoyD = aFecha(hoy);
  const porLinea = new Map();
  for (const item of matriz) {
    if (!porLinea.has(item.linea)) porLinea.set(item.linea, []);
    porLinea.get(item.linea).push(item);
  }

  const necesidades = [];
  const aConfirmar = new Map();
  const sinFecha = new Map();
  let cubiertas = 0;

  for (const obra of obras) {
    if (!obra.desmolde) continue;
    for (const item of porLinea.get(obra.linea) || []) {
      const k = `${obra.id}|${item.material_id}`;
      const fila = obraFilas.get(k);
      const estado = fila?.estado || "pendiente";
      if (llegados.has(k) || ["pedido", "comprado", "en_panol", "recibido", "parcial", "egresado"].includes(estado)) {
        cubiertas += 1;
        continue;
      }
      const cantidad = Number(fila?.cantidad ?? item.cantidad) || 0;
      if (cantidad <= 0) continue;
      const sem = semanaDe(item, { semanasItem, semanasRubro, sugeridas });
      if (!sem) {
        const s = sinFecha.get(item.categoria_id) || { rubro: item.rubro, linea: new Set(), items: 0 };
        s.linea.add(item.linea);
        s.items += 1;
        sinFecha.set(item.categoria_id, s);
        continue;
      }
      const necesita = sumarDias(obra.desmolde, sem.semana * 7);
      if (necesita < hoyD) {
        const a = aConfirmar.get(obra.id) || { obra: obra.codigo, items: 0, rubros: new Map() };
        a.items += 1;
        a.rubros.set(item.rubro || "Sin rubro", (a.rubros.get(item.rubro || "Sin rubro") || 0) + 1);
        aConfirmar.set(obra.id, a);
        continue;
      }
      const plazo = plazoDe(item.proveedor, { plazos, plazosSugeridos, plazoGeneral });
      necesidades.push({
        ...item,
        descripcion: fila?.descripcion || item.descripcion,
        obraId: obra.id,
        obra: obra.codigo,
        cantidad,
        necesita,
        comprarAntes: sumarDias(necesita, -(plazo.dias + margen)),
        semana: sem.semana,
        semanaFuente: sem.fuente,
        plazo: plazo.dias,
        plazoFuente: plazo.fuente,
      });
    }
  }

  // Lo libre del pañol se usa primero para lo que se necesita antes.
  necesidades.sort((a, b) => a.necesita - b.necesita || String(a.obra).localeCompare(String(b.obra), "es", { numeric: true }));
  const libreRestante = new Map([...libre.entries()].map(([k, v]) => [k, Math.max(0, Number(v) || 0)]));
  const aComprar = [];
  const conStock = [];
  for (const n of necesidades) {
    const hay = libreRestante.get(n.material_id) || 0;
    const usa = Math.min(hay, n.cantidad);
    if (usa > 0) libreRestante.set(n.material_id, hay - usa);
    if (usa >= n.cantidad - 0.0001) { conStock.push({ ...n, deStock: usa }); continue; }
    aComprar.push({ ...n, deStock: usa, faltan: n.cantidad - usa });
  }

  // Agrupado: semana de compra → proveedor → producto (sumando obras).
  const lunesHoy = inicioSemana(hoyD);
  const limite = sumarDias(lunesHoy, semanasALaVista * 7);
  const semanas = new Map();
  let masAdelante = 0;
  for (const n of aComprar) {
    let clave;
    let inicio;
    if (n.comprarAntes < hoyD) { clave = "atrasado"; inicio = null; }
    else if (n.comprarAntes >= limite) { masAdelante += 1; continue; }
    else { inicio = inicioSemana(n.comprarAntes); clave = isoFecha(inicio); }
    if (!semanas.has(clave)) semanas.set(clave, { clave, inicio, proveedores: new Map() });
    const sem = semanas.get(clave);
    const prov = n.proveedor || "Sin proveedor";
    if (!sem.proveedores.has(prov)) sem.proveedores.set(prov, { proveedor: prov, plazo: n.plazo, plazoFuente: n.plazoFuente, productos: new Map() });
    const p = sem.proveedores.get(prov);
    if (!p.productos.has(n.material_id)) {
      p.productos.set(n.material_id, {
        material_id: n.material_id, linea: n.linea, descripcion: n.descripcion, codigo: n.codigo, unidad: n.unidad,
        rubro: n.rubro, semana: n.semana, semanaFuente: n.semanaFuente, total: 0, deStock: 0, obras: [],
        necesita: n.necesita, comprarAntes: n.comprarAntes,
      });
    }
    const prod = p.productos.get(n.material_id);
    prod.total += n.faltan;
    prod.deStock += n.deStock;
    prod.obras.push({ obra: n.obra, cantidad: n.faltan, necesita: n.necesita });
    if (n.necesita < prod.necesita) prod.necesita = n.necesita;
    if (n.comprarAntes < prod.comprarAntes) prod.comprarAntes = n.comprarAntes;
  }

  const lista = [...semanas.values()]
    .sort((a, b) => (a.clave === "atrasado" ? -1 : b.clave === "atrasado" ? 1 : a.inicio - b.inicio))
    .map((s) => ({
      clave: s.clave,
      inicio: s.inicio,
      proveedores: [...s.proveedores.values()]
        .map((p) => ({ ...p, productos: [...p.productos.values()].sort((a, b) => a.comprarAntes - b.comprarAntes || a.descripcion.localeCompare(b.descripcion, "es")) }))
        .sort((a, b) => (a.proveedor === "Sin proveedor") - (b.proveedor === "Sin proveedor") || b.productos.length - a.productos.length),
    }));

  return {
    semanas: lista,
    conStock,
    masAdelante,
    cubiertas,
    aConfirmar: [...aConfirmar.values()].map((a) => ({ ...a, rubros: [...a.rubros.entries()].sort((x, y) => y[1] - x[1]) })).sort((a, b) => b.items - a.items),
    sinFecha: [...sinFecha.values()].map((s) => ({ ...s, linea: [...s.linea] })),
    totalAComprar: aComprar.length,
  };
}

/** Texto del pedido para mandar al proveedor. */
export function textoPedido(proveedor, productos = []) {
  const lineas = productos.map((p) => {
    const obras = p.obras.map((o) => `${o.obra}: ${fmt(o.cantidad)}`).join(", ");
    return `- ${p.descripcion}${p.codigo ? ` (${p.codigo})` : ""} × ${fmt(p.total)} ${p.unidad || "u"}  [${obras}]`;
  });
  return [`Pedido a ${proveedor}`, ...lineas].join("\n");
}

function fmt(n) {
  const v = Math.round(Number(n) * 100) / 100;
  return Number.isInteger(v) ? String(v) : String(v).replace(".", ",");
}
