/**
 * Lógica pura del mostrador de ingresos de pañol (sin React ni Supabase, con
 * pruebas en ingresosLogica.test.mjs).
 *
 * Lo que entra al pañol llega de dos maneras:
 *
 *   - De un PEDIDO en camino (un aviso de Compras o de Técnica: panol_envios
 *     con renglones por recibir). Recibirlo es marcar el renglón con la
 *     cantidad acumulada (panol_marcar_items).
 *   - SIN PEDIDO: lo trae un remito y no lo esperaba nadie. Entra como un envío
 *     nuevo ya recibido (panol_crear_envio, origen "remito"), igual que el
 *     ingreso directo de siempre.
 *
 * Lo que tiene un renglón esperando nunca entra como "sin pedido": si no,
 * entra dos veces al stock. Por eso el código del lector y la búsqueda van
 * primero a los pedidos.
 */

import { codeKey } from "../stockGrupos.js";
import { materialBarcodeList } from "../../materiales/materialBarcodes.js";
import { normalizarTexto } from "../../consumibles/mostrador/mostradorLogica.js";

export const STOCK = "stock";
const ESTADOS_CERRADOS = new Set(["recibido", "cerrado", "cancelado"]);
const RENGLON_CERRADO = new Set(["recibido", "rechazado"]);
const PRIORIDAD = { urgente: 4, alta: 3, media: 2, baja: 1 };

/** Número de una cantidad escrita como texto ("2", "2,5", "3 u"). null si no hay. */
export function numero(valor) {
  if (valor == null) return null;
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  const m = String(valor).replace(/\s+/g, "").match(/^-?\d+(?:[.,]\d+)?/);
  if (!m) return null;
  const n = Number(m[0].replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

const redondo = (n) => Math.round(n * 1000) / 1000;
export const texto = (n) => String(redondo(n));

// ── Pedidos en camino ───────────────────────────────────────────────────────

/** Cuánto pidió, cuánto llegó y cuánto falta de un renglón. */
export function cuentasDelRenglon(item = {}) {
  const pedido = numero(item.cantidad);
  const llego = numero(item.cantidad_recibida) ?? 0;
  const falta = pedido == null ? null : Math.max(0, redondo(pedido - llego));
  return { pedido, llego, falta };
}

/** Un renglón sigue por llegar mientras no esté recibido ni rechazado. */
export function renglonAbierto(item = {}) {
  if (RENGLON_CERRADO.has(item.estado)) return false;
  const { falta } = cuentasDelRenglon(item);
  return falta == null || falta > 0;
}

/**
 * Los envíos abiertos de la sede, armados para el mostrador: cada uno con sus
 * renglones por llegar. Los envíos sin nada por llegar no aparecen.
 */
export function armarPedidos(envios = []) {
  const pedidos = [];
  for (const e of envios) {
    if (!e || ESTADOS_CERRADOS.has(e.estado)) continue;
    const renglones = [];
    let total = 0;
    for (const it of e.items || []) {
      total += 1;
      if (!renglonAbierto(it)) continue;
      const { pedido, llego, falta } = cuentasDelRenglon(it);
      const material = it.material || null;
      renglones.push({
        id: it.id,
        envioId: e.id,
        envioTitulo: e.titulo || "Pedido",
        descripcion: String(it.descripcion || material?.descripcion || "Sin descripción").trim(),
        codigo: it.codigo || material?.codigo || "",
        unidad: it.unidad || material?.unidad_medida || "unidad",
        estado: it.estado || "pendiente",
        pedido,
        llego,
        falta,
        materialId: it.material_id || material?.id || null,
        requisitoMaterialId: it.requisito_material_id || null,
        material,
        variante: it.variante || "",
        obraId: it.obra_id ?? null,
        obraCodigo: it.obra_codigo || "",
        stockGeneral: Boolean(it.stock_general),
        nota: it.nota || "",
      });
    }
    if (!renglones.length) continue;
    renglones.sort((a, b) => a.descripcion.localeCompare(b.descripcion, "es", { numeric: true }));
    pedidos.push({
      id: e.id,
      titulo: e.titulo || "Pedido",
      obraCodigo: e.obra?.codigo || "",
      origen: e.origen || "manual",
      prioridad: e.prioridad || "media",
      estado: e.estado,
      creadoAt: e.created_at || null,
      purchaseRequestId: e.purchase_request_id || null,
      totalRenglones: total,
      renglones,
    });
  }
  // Lo urgente arriba; después lo más viejo (lo que hace más que espera).
  return pedidos.sort((a, b) => (PRIORIDAD[b.prioridad] || 0) - (PRIORIDAD[a.prioridad] || 0)
    || String(a.creadoAt || "").localeCompare(String(b.creadoAt || "")));
}

/** "52-27", "Stock", o el destino que se sepa del renglón. */
export function destinoDelRenglon(r = {}, sede = "") {
  if (r.obraCodigo) return r.obraCodigo;
  if (r.stockGeneral || !r.obraId) return sede ? `Stock ${sede}` : "Stock";
  return "Obra";
}

/** Códigos que reconoce un material: interno, de barras y los adicionales. */
export function codigosDe(material = null) {
  if (!material) return [];
  return [material.codigo, material.codigo_barra, ...materialBarcodeList(material).map((b) => b.codigo)]
    .map(codeKey)
    .filter(Boolean);
}

/** Renglones por llegar que corresponden a un material del catálogo. */
export function renglonesDeMaterial(pedidos = [], materialId) {
  if (!materialId) return [];
  const out = [];
  for (const p of pedidos) {
    for (const r of p.renglones) {
      if (r.materialId === materialId || r.requisitoMaterialId === materialId) out.push(r);
    }
  }
  return out;
}

/** Renglones por llegar cuyo código (o el de su material) es el leído. */
export function renglonesPorCodigo(pedidos = [], codigo = "") {
  const c = codeKey(codigo);
  if (!c) return [];
  const out = [];
  for (const p of pedidos) {
    for (const r of p.renglones) {
      if (codeKey(r.codigo) === c || codigosDe(r.material).includes(c)) out.push(r);
    }
  }
  return out;
}

/** Materiales del catálogo con ese código. */
export function materialesPorCodigo(catalogo = [], codigo = "") {
  const c = codeKey(codigo);
  if (!c) return [];
  return catalogo.filter((m) => codigosDe(m).includes(c));
}

function pajarDeRenglon(r) {
  return normalizarTexto([r.descripcion, r.codigo, r.envioTitulo, r.obraCodigo, r.material?.descripcion, r.material?.codigo_barra].filter(Boolean).join(" "));
}

/** Búsqueda por palabras sobre los renglones por llegar (todas tienen que estar). */
export function buscarRenglones(pedidos = [], consulta = "", { max = 40 } = {}) {
  const q = normalizarTexto(consulta);
  if (!q) return [];
  const palabras = q.split(" ");
  const out = [];
  for (const p of pedidos) {
    for (const r of p.renglones) {
      const pajar = pajarDeRenglon(r);
      if (!palabras.every((w) => pajar.includes(w))) continue;
      const nombre = normalizarTexto(r.descripcion);
      out.push({ r, puntaje: codeKey(r.codigo) === codeKey(consulta) ? 3 : nombre.startsWith(q) ? 2 : 1 });
    }
  }
  return out.sort((a, b) => b.puntaje - a.puntaje || a.r.descripcion.localeCompare(b.r.descripcion, "es", { numeric: true }))
    .slice(0, max)
    .map((x) => x.r);
}

/**
 * Búsqueda por palabras en el catálogo. Los requisitos no entran (son una
 * necesidad de la matriz, no un producto) y los consumibles tampoco: van por
 * su propio circuito.
 */
export function buscarCatalogo(catalogo = [], consulta = "", { max = 40 } = {}) {
  const q = normalizarTexto(consulta);
  if (!q) return [];
  const palabras = q.split(" ");
  const out = [];
  for (const m of catalogo) {
    if (!m || m.es_requisito || m.es_consumible || m.activo === false) continue;
    const nombre = normalizarTexto(m.descripcion);
    const pajar = normalizarTexto([m.descripcion, m.alias, m.codigo, m.codigo_barra, m.proveedor, m.ubicacion].filter(Boolean).join(" "));
    if (!palabras.every((w) => pajar.includes(w))) continue;
    const exacto = [m.codigo, m.codigo_barra].some((c) => codeKey(c) && codeKey(c) === codeKey(consulta));
    out.push({ m, puntaje: exacto ? 3 : nombre.startsWith(q) ? 2 : 1 });
  }
  return out.sort((a, b) => b.puntaje - a.puntaje || String(a.m.descripcion).localeCompare(String(b.m.descripcion), "es", { numeric: true }))
    .slice(0, max)
    .map((x) => x.m);
}

// ── El carrito ("Entra") ────────────────────────────────────────────────────

export const cantidadDe = (l) => numero(l?.cantidad) ?? 0;

const ahora = () => Date.now();

/**
 * Suma un renglón de un pedido. `cantidad` null = todo lo que falta (tocar el
 * renglón); un número = esa cantidad más (el lector suma de a uno).
 */
export function sumarRenglon(cart = [], r, cantidad = null) {
  const key = `r:${r.id}`;
  const actual = cart.find((l) => l.key === key);
  const todo = r.falta ?? 1;
  if (actual) {
    const siguiente = cantidad == null ? Math.max(cantidadDe(actual), todo) : cantidadDe(actual) + cantidad;
    return cart.map((l) => (l.key === key ? { ...l, cantidad: texto(siguiente), agregadoAt: ahora() } : l));
  }
  return [...cart, {
    key,
    tipo: "pedido",
    renglonId: r.id,
    envioId: r.envioId,
    envioTitulo: r.envioTitulo,
    label: r.descripcion,
    codigo: r.codigo,
    unidad: r.unidad,
    pedido: r.pedido,
    llego: r.llego,
    falta: r.falta,
    obraId: r.obraId,
    obraCodigo: r.obraCodigo,
    stockGeneral: r.stockGeneral,
    materialId: r.materialId,
    ubicacion: r.material?.ubicacion || "",
    imagenUrl: r.material?.imagen_url || null,
    variante: r.variante || "",
    cantidad: texto(cantidad == null ? todo : cantidad),
    agregadoAt: ahora(),
  }];
}

/** Suma un producto del catálogo que llegó sin pedido. Va a stock salvo que se elija una obra. */
export function sumarSinPedido(cart = [], material, { cantidad = 1, obraId = null, variante = "" } = {}) {
  const key = `m:${material.id}:${obraId || STOCK}:${variante || ""}`;
  const actual = cart.find((l) => l.key === key);
  if (actual) {
    return cart.map((l) => (l.key === key ? { ...l, cantidad: texto(cantidadDe(l) + cantidad), agregadoAt: ahora() } : l));
  }
  return [...cart, {
    key,
    tipo: "directo",
    materialId: material.id,
    material,
    label: material.descripcion || "Producto",
    codigo: material.codigo || "",
    unidad: material.unidad || material.unidad_medida || "unidad",
    proveedor: material.proveedor || "",
    variantes: Array.isArray(material.variantes) ? material.variantes.filter(Boolean) : [],
    variante: variante || "",
    obraId: obraId || null,
    ubicacion: material.ubicacion || "",
    imagenUrl: material.imagen_url || null,
    cantidad: texto(cantidad),
    agregadoAt: ahora(),
  }];
}

/** Algo que no tiene ficha: entra con la descripción y Técnica lo da de alta. */
export function sumarSinFicha(cart = [], { descripcion, codigo = "", cantidad = 1, unidad = "unidad", obraId = null }) {
  const desc = String(descripcion || "").trim();
  const key = `n:${normalizarTexto(desc)}:${codeKey(codigo)}:${obraId || STOCK}`;
  const actual = cart.find((l) => l.key === key);
  if (actual) {
    return cart.map((l) => (l.key === key ? { ...l, cantidad: texto(cantidadDe(l) + cantidad), agregadoAt: ahora() } : l));
  }
  return [...cart, {
    key,
    tipo: "nuevo",
    materialId: null,
    label: desc,
    codigo: String(codigo || "").trim(),
    unidad: unidad || "unidad",
    obraId: obraId || null,
    cantidad: texto(cantidad),
    agregadoAt: ahora(),
  }];
}

export function fijarCantidad(cart = [], key, n) {
  const v = Math.max(0, redondo(Number(n) || 0));
  if (v <= 0) return quitarLinea(cart, key);
  return cart.map((l) => (l.key === key ? { ...l, cantidad: texto(v) } : l));
}

export function sumarCantidad(cart = [], key, delta) {
  const l = cart.find((x) => x.key === key);
  if (!l) return cart;
  return fijarCantidad(cart, key, cantidadDe(l) + delta);
}

export function quitarLinea(cart = [], key) {
  return cart.filter((l) => l.key !== key);
}

/** Cambia la obra (o stock) de una línea sin pedido. Si ya había otra igual, se juntan. */
export function cambiarObra(cart = [], key, obraId = null) {
  const l = cart.find((x) => x.key === key);
  if (!l || l.tipo === "pedido") return cart;
  const nueva = l.tipo === "directo"
    ? `m:${l.materialId}:${obraId || STOCK}:${l.variante || ""}`
    : `n:${normalizarTexto(l.label)}:${codeKey(l.codigo)}:${obraId || STOCK}`;
  if (nueva === key) return cart;
  const otra = cart.find((x) => x.key === nueva);
  if (otra) {
    return cart
      .filter((x) => x.key !== key)
      .map((x) => (x.key === nueva ? { ...x, cantidad: texto(cantidadDe(x) + cantidadDe(l)) } : x));
  }
  return cart.map((x) => (x.key === key ? { ...x, key: nueva, obraId: obraId || null } : x));
}

export function cambiarVariante(cart = [], key, variante = "") {
  const l = cart.find((x) => x.key === key);
  if (!l || l.tipo !== "directo") return cart;
  const nueva = `m:${l.materialId}:${l.obraId || STOCK}:${variante || ""}`;
  if (nueva === key) return cart;
  const otra = cart.find((x) => x.key === nueva);
  if (otra) {
    return cart
      .filter((x) => x.key !== key)
      .map((x) => (x.key === nueva ? { ...x, cantidad: texto(cantidadDe(x) + cantidadDe(l)) } : x));
  }
  return cart.map((x) => (x.key === key ? { ...x, key: nueva, variante: variante || "" } : x));
}

export function ultimaLinea(cart = []) {
  return [...cart].sort((a, b) => (b.agregadoAt || 0) - (a.agregadoAt || 0))[0] || null;
}

export function totalUnidades(cart = []) {
  return redondo(cart.reduce((s, l) => s + cantidadDe(l), 0));
}

/** Cuánto se lleva de más / de menos un renglón de pedido con esta cantidad. */
export function comparaConPedido(l) {
  if (l?.tipo !== "pedido" || l.falta == null) return { tipo: "sin_dato", diferencia: 0 };
  const d = redondo(cantidadDe(l) - l.falta);
  if (d > 0) return { tipo: "de_mas", diferencia: d };
  if (d < 0) return { tipo: "parcial", diferencia: -d };
  return { tipo: "completo", diferencia: 0 };
}

/**
 * El carrito agrupado para mostrarlo: primero cada pedido (con sus renglones),
 * después lo que entra sin pedido.
 */
export function carritoAgrupado(cart = []) {
  const grupos = new Map();
  for (const l of cart) {
    const k = l.tipo === "pedido" ? `p:${l.envioId}` : "sin";
    if (!grupos.has(k)) grupos.set(k, { key: k, titulo: l.tipo === "pedido" ? l.envioTitulo : "Sin pedido", pedido: l.tipo === "pedido", lineas: [] });
    grupos.get(k).lineas.push(l);
  }
  return [...grupos.values()].sort((a, b) => Number(b.pedido) - Number(a.pedido));
}

/**
 * Con cada lectura de los pedidos, los renglones del carrito se ponen al día
 * (otro equipo pudo recibir una parte). Si el renglón ya no está por llegar,
 * la línea queda marcada: confirmarla lo daría por recibido dos veces.
 */
export function refrescarCarrito(cart = [], pedidos = []) {
  if (!cart.some((l) => l.tipo === "pedido")) return cart;
  const porId = new Map();
  for (const p of pedidos) for (const r of p.renglones) porId.set(r.id, r);
  let cambio = false;
  const siguiente = cart.map((l) => {
    if (l.tipo !== "pedido") return l;
    const r = porId.get(l.renglonId);
    if (!r) {
      if (l.yaRecibido) return l;
      cambio = true;
      return { ...l, yaRecibido: true };
    }
    if (!l.yaRecibido && r.falta === l.falta && r.llego === l.llego && r.pedido === l.pedido) return l;
    cambio = true;
    return { ...l, yaRecibido: false, falta: r.falta, llego: r.llego, pedido: r.pedido };
  });
  return cambio ? siguiente : cart;
}

/** Lo que frena la confirmación. */
export function problemasDelCarrito(cart = [], referencia = "") {
  const out = [];
  for (const l of cart) {
    if (l.yaRecibido) out.push({ key: l.key, texto: `${l.label} ya se recibió en otro equipo. Sacalo del carrito.` });
    if (!(cantidadDe(l) > 0)) out.push({ key: l.key, texto: `Falta la cantidad de ${l.label}.` });
    if (l.tipo === "nuevo" && String(l.label || "").trim().length < 4) out.push({ key: l.key, texto: "Un producto sin ficha necesita una descripción de al menos 4 letras." });
  }
  if (cart.some((l) => l.tipo !== "pedido") && !String(referencia || "").trim()) {
    out.push({ key: "referencia", texto: "Falta el número de remito." });
  }
  return out;
}

/**
 * Lo que se manda a la base:
 *   - recibir: un renglón por pedido, con la cantidad ACUMULADA (lo que ya
 *     había llegado más lo de ahora). Recibido si se completó, parcial si no.
 *   - crear: el envío nuevo con lo que entró sin pedido (null si no hay).
 */
export function planDeIngreso(cart = [], { sede, referencia = "" } = {}) {
  const recibir = cart
    .filter((l) => l.tipo === "pedido" && cantidadDe(l) > 0)
    .map((l) => {
      const total = redondo((l.llego || 0) + cantidadDe(l));
      const pedido = l.pedido;
      const completo = pedido == null || total >= pedido - 0.0001;
      return { id: l.renglonId, envioId: l.envioId, estado: completo ? "recibido" : "parcial", cantidadRecibida: texto(total) };
    });
  const sinPedido = cart.filter((l) => l.tipo !== "pedido" && cantidadDe(l) > 0);
  const crear = sinPedido.length ? {
    titulo: String(referencia || "").trim(),
    sede,
    origen: "remito",
    items: sinPedido.map((l) => ({
      descripcion: l.label,
      codigo: String(l.codigo || "").trim().toUpperCase() || null,
      cantidad: texto(cantidadDe(l)),
      unidad: l.unidad || "unidad",
      obra_id: l.obraId || null,
      material_id: l.materialId || null,
      proveedor: l.proveedor || null,
      variante: l.variante || null,
      recepcion_estado: "recibido",
    })),
  } : null;
  return { recibir, crear };
}

/** Para la pantalla de "listo". */
export function resumenDelIngreso(cart = [], { obras = [], sede = "", referencia = "" } = {}) {
  const obraPorId = new Map(obras.map((o) => [o.id, o.codigo]));
  const items = cart.filter((l) => cantidadDe(l) > 0).map((l) => {
    const destino = l.tipo === "pedido"
      ? (l.obraCodigo || (l.obraId ? obraPorId.get(l.obraId) : "") || `Stock ${sede}`)
      : (l.obraId ? obraPorId.get(l.obraId) || "Obra" : `Stock ${sede}`);
    const cmp = comparaConPedido(l);
    const detalle = [
      destino,
      l.tipo === "nuevo" ? "sin ficha" : null,
      cmp.tipo === "parcial" ? `faltan ${texto(cmp.diferencia)}` : null,
      cmp.tipo === "de_mas" ? `${texto(cmp.diferencia)} de más` : null,
    ].filter(Boolean).join(" · ");
    return { key: l.key, cantidad: cantidadDe(l), descripcion: l.label, unidad: l.unidad, detalle };
  });
  const pedidos = new Set(cart.filter((l) => l.tipo === "pedido").map((l) => l.envioId)).size;
  return { unidades: totalUnidades(cart), items, pedidos, sinPedido: cart.filter((l) => l.tipo !== "pedido").length, referencia: String(referencia || "").trim() };
}

/**
 * Los últimos ingresos de la sede, juntados por envío y minuto (un remito o
 * una recepción es una sola tarjeta aunque tenga diez renglones).
 */
export function agruparUltimos(items = [], { limite = 20 } = {}) {
  const grupos = new Map();
  for (const it of items) {
    const at = it.marcado_at || it.updated_at || it.created_at;
    if (!at) continue;
    const minuto = String(at).slice(0, 16);
    const k = `${it.envio_id}|${minuto}`;
    if (!grupos.has(k)) {
      grupos.set(k, {
        clave: k,
        at,
        envioId: it.envio_id,
        titulo: it.envio?.titulo || "Ingreso",
        sinPedido: it.envio?.origen === "remito",
        items: [],
      });
    }
    const n = numero(it.cantidad_recibida) ?? numero(it.cantidad) ?? 0;
    grupos.get(k).items.push({ cantidad: n, descripcion: it.descripcion || "", parcial: it.estado === "parcial" });
  }
  return [...grupos.values()].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, limite);
}
