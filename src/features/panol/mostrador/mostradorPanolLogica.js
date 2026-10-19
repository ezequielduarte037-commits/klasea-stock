/**
 * Mostrador de egresos de pañol — la lógica que no depende de React ni de la red.
 *
 * El stock sale de la misma cuenta que el stock maestro: `buildProductGroups`
 * (stockGrupos.js) sobre `rowDelta` (panolMovimientos.js). Acá no se calcula
 * stock: se decide qué se muestra, qué entra al carrito, qué falta resolver
 * antes de firmar y cómo se le dice al RPC adónde va cada cosa.
 *
 * Los renglones del carrito son los mismos de siempre (`makeCartItem`), así el
 * carrito que se arma con "Agregar" en el stock maestro aparece acá para firmar.
 *
 * Se prueba con `node --test mostradorPanolLogica.test.mjs`. No importa
 * panolApi (trae Supabase y no corre en node).
 */

import {
  additionalVariantCartItem,
  availableForVariant,
  buildProductGroups,
  cartBaseKey,
  cartLineKey,
  cleanCartVariant,
  compactEgresoSourceRows,
  egresoDisplayDestination,
  egresoDisplayEmployee,
  egresoDisplayItems,
  groupMatchesCode,
  makeCartItem,
  qty,
  remainingCartVariants,
  rowEgresoKind,
  rowEgresoQuantity,
  rowInHistory,
  rowObraId,
  rowObraLabel,
  rowSede,
} from "../stockGrupos.js";
import { rowIsAnulado, rowMovementAt } from "../panolMovimientos.js";
import { fmtNum, normalizarTexto } from "../../consumibles/mostrador/mostradorLogica.js";

const EPS = 0.0001;
const limpio = (v) => String(v ?? "").trim();
const OBRA_CERRADA = new Set(["terminada", "cancelada", "archivada", "cerrada"]);

/** El origen "stock libre": material del pañol que no está reservado a ninguna obra. */
export const LIBRE = "libre";

export const obraCerrada = (obra) => OBRA_CERRADA.has(String(obra?.estado || "").toLowerCase());
export const origenDe = (ubicacion) => ubicacion?.obraId || LIBRE;
const mismaSede = (a, b) => normalizarTexto(a) === normalizarTexto(b);

// ── Lo que se puede egresar ─────────────────────────────────────────────────

/**
 * Productos con algo para entregar. Cada grupo conserva todas sus ubicaciones
 * (las necesita el carrito para el saldo por variante) y suma `conSaldo`: las
 * que tienen stock positivo, que son las únicas que se ofrecen.
 */
export function gruposEgresables(rows = []) {
  return buildProductGroups(rows, "todas")
    .map((g) => ({ ...g, conSaldo: g.locations.filter((l) => l.available > EPS) }))
    .filter((g) => g.conSaldo.length > 0);
}

/** Lo mismo, mirando una sola sede ("todas" no filtra). */
export function enSede(grupos = [], sede = "todas") {
  if (!sede || sede === "todas") return grupos;
  return grupos
    .map((g) => ({ ...g, conSaldo: g.conSaldo.filter((l) => mismaSede(l.sede, sede)) }))
    .filter((g) => g.conSaldo.length > 0);
}

/**
 * El riel "¿De qué obra?": stock libre primero, después cada obra con saldo
 * (las abiertas antes que las cerradas, por código). Cuenta productos, no filas.
 */
export function rielDeOrigenes(grupos = [], obras = []) {
  const obraPorId = new Map(obras.map((o) => [o.id, o]));
  const porOrigen = new Map();
  for (const g of grupos) {
    for (const l of g.conSaldo) {
      const k = origenDe(l);
      const actual = porOrigen.get(k) ?? { productos: new Set(), etiqueta: l.label };
      actual.productos.add(g.key);
      porOrigen.set(k, actual);
    }
  }
  const lista = [...porOrigen.entries()].map(([k, v]) => {
    if (k === LIBRE) return { key: LIBRE, libre: true, codigo: "Stock libre", productos: v.productos.size };
    const obra = obraPorId.get(k);
    return { key: k, obraId: k, codigo: obra?.codigo || v.etiqueta || "Obra", descripcion: obra?.descripcion || "", cerrada: obraCerrada(obra), productos: v.productos.size };
  });
  return lista.sort((a, b) => (a.libre ? -1 : b.libre ? 1 : 0)
    || Number(a.cerrada) - Number(b.cerrada)
    || a.codigo.localeCompare(b.codigo, "es", { numeric: true }));
}

/** Los productos que tienen saldo en ese origen (obra o stock libre). */
export function gruposDeOrigen(grupos = [], origen = null) {
  if (!origen) return grupos;
  return grupos.filter((g) => g.conSaldo.some((l) => origenDe(l) === origen));
}

/** Saldo de un producto en un origen (o en todos), sumando sedes. */
export function saldoEn(grupo, origen = null) {
  return (grupo?.conSaldo ?? [])
    .filter((l) => !origen || origenDe(l) === origen)
    .reduce((s, l) => s + l.available, 0);
}

/**
 * Busca como en una ferretería: todas las palabras tienen que estar en el
 * nombre, un código, la estantería, el rubro, una variante o la obra. Lo que
 * empieza igual va primero; un código exacto, antes que nada.
 */
export function buscarGrupos(grupos = [], texto = "", { max = 60 } = {}) {
  const q = normalizarTexto(texto);
  if (!q) return [];
  const palabras = q.split(" ");
  const puntuados = [];
  for (const g of grupos) {
    const nombre = normalizarTexto(g.label);
    const pajar = normalizarTexto([
      g.label, g.labelHistorico, g.codigo, g.codigo_barra, g.proveedor, g.ubicacion,
      ...(g.categorias ? [...g.categorias] : []),
      ...(g.variantes || []),
      ...(g.opciones || []).map((o) => o.nombre),
      ...g.conSaldo.map((l) => l.label),
    ].filter(Boolean).join(" "));
    if (!palabras.every((p) => pajar.includes(p))) continue;
    const codigoExacto = [g.codigo, g.codigo_barra].some((c) => normalizarTexto(c) === q);
    const puntaje = codigoExacto ? 4 : nombre.startsWith(q) ? 3 : nombre.includes(q) ? 2 : 1;
    puntuados.push({ g, puntaje });
  }
  return puntuados
    .sort((a, b) => b.puntaje - a.puntaje || a.g.label.localeCompare(b.g.label, "es", { numeric: true }))
    .slice(0, max)
    .map((x) => x.g);
}

/** Lo que el lector reconoce por código (de barras, interno o de proveedor). */
export function gruposPorCodigo(grupos = [], codigo = "") {
  if (!limpio(codigo)) return [];
  return grupos.filter((g) => groupMatchesCode(g, codigo));
}

/**
 * ¿De dónde sale lo que se marcó? Con una obra elegida en el riel, de ahí. Si
 * el producto no tiene saldo en esa obra, o tiene en varios lugares y no hay
 * obra elegida, devuelve null: se pregunta.
 */
export function ubicacionParaSumar(grupo, origen = null) {
  const locs = grupo?.conSaldo ?? [];
  if (origen) {
    const deAhi = locs.filter((l) => origenDe(l) === origen);
    return deAhi.length === 1 ? deAhi[0] : null;
  }
  return locs.length === 1 ? locs[0] : null;
}

// ── El carrito ──────────────────────────────────────────────────────────────

export const cantidadDe = (linea) => qty(linea?.cantidad, 0);
const texto = (n) => String(Math.round(n * 1000) / 1000);

/**
 * Suma uno (o `cantidad`) de un producto desde una ubicación. Si ya hay un
 * renglón de esa ubicación, suma ahí (el último que se tocó); si no, abre uno.
 * Nunca pasa lo que hay: devuelve `tope` cuando no pudo sumar todo.
 */
export function sumarAlCarrito(cart = [], grupo, ubicacion, { sede = "", cantidad = 1, ahora = Date.now() } = {}) {
  const nueva = makeCartItem(grupo, ubicacion, { cantidad: "1", sede: ubicacion?.sede || sede, codigo: grupo.codigo, unidad: grupo.unidad });
  const mismas = cart.filter((l) => cartBaseKey(l) === nueva.baseKey);
  const destino = mismas.sort((a, b) => (b.agregadoAt || 0) - (a.agregadoAt || 0))[0];
  if (!destino) {
    const n = Math.min(cantidad, nueva.available);
    if (n <= EPS) return { cart, tope: nueva.available };
    return { cart: [...cart, { ...nueva, cantidad: texto(n), agregadoAt: ahora }], tope: n < cantidad ? nueva.available : null, key: nueva.key };
  }
  const actual = cantidadDe(destino);
  const n = Math.min(actual + cantidad, destino.available);
  if (n <= actual + EPS) return { cart, tope: destino.available, key: destino.key };
  return {
    cart: cart.map((l) => (l.key === destino.key ? { ...l, cantidad: texto(n), agregadoAt: ahora } : l)),
    tope: n < actual + cantidad - EPS ? destino.available : null,
    key: destino.key,
  };
}

/** Escribir la cantidad: no se recorta, el exceso se avisa como problema. */
export function fijarCantidad(cart = [], key, n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return cart;
  return cart.map((l) => (l.key === key ? { ...l, cantidad: texto(v) } : l));
}

/** El − y el +. Bajar de uno saca el renglón; subir no pasa lo disponible. */
export function sumarCantidad(cart = [], key, delta) {
  const l = cart.find((x) => x.key === key);
  if (!l) return cart;
  const actual = cantidadDe(l);
  if (delta < 0 && actual + delta <= EPS) return quitarLinea(cart, key);
  const n = delta > 0 ? Math.min(actual + delta, Math.max(actual, l.available)) : actual + delta;
  return fijarCantidad(cart, key, n);
}

export function quitarLinea(cart = [], key) {
  return cart.filter((l) => l.key !== key);
}

/** La última línea tocada (para "x5" en el lector). */
export function ultimaLinea(cart = []) {
  return [...cart].sort((a, b) => (b.agregadoAt || 0) - (a.agregadoAt || 0))[0] ?? null;
}

/**
 * Cambia la variante de un renglón (Blanco, 12 V…). El saldo pasa a ser el de
 * esa variante y la cantidad se acomoda a lo que hay. Si esa variante ya está
 * en otro renglón de la misma ubicación, no se duplica.
 */
export function cambiarVariante(cart = [], key, variante) {
  const l = cart.find((x) => x.key === key);
  if (!l) return { cart };
  const v = cleanCartVariant(variante);
  const nuevaKey = cartLineKey(cartBaseKey(l), v);
  if (nuevaKey === key) return { cart };
  if (cart.some((x) => x.key === nuevaKey)) return { cart, error: `${v || "Sin especificar"} ya está en el carrito.` };
  const available = availableForVariant({ available: l.locationAvailable, porVariante: l.porVariante }, v);
  const pedida = Math.max(cantidadDe(l), 1);
  const cantidad = available > EPS ? Math.min(pedida, available) : pedida;
  return {
    cart: cart.map((x) => (x.key === key ? { ...x, key: nuevaKey, baseKey: cartBaseKey(x), variante: v, available, cantidad: texto(cantidad) } : x)),
    key: nuevaKey,
  };
}

/** Otra variante del mismo producto y ubicación, en un renglón aparte. */
export function agregarVariante(cart = [], key, variante, { ahora = Date.now() } = {}) {
  const l = cart.find((x) => x.key === key);
  if (!l) return { cart };
  const nueva = additionalVariantCartItem(l, variante);
  if (cart.some((x) => x.key === nueva.key)) return { cart, error: `${variante} ya está en el carrito.` };
  const n = Math.min(1, nueva.available);
  return { cart: [...cart, { ...nueva, cantidad: texto(n > EPS ? n : 1), agregadoAt: ahora }], key: nueva.key };
}

export function variantesQueFaltan(cart = [], key) {
  const l = cart.find((x) => x.key === key);
  return l ? remainingCartVariants(l, cart) : [];
}

/** "CAJA DE PASO · 90X90X75" dentro del renglón "CAJA DE PASO": alcanza con la medida. */
export function sinPrefijo(texto = "", prefijo = "") {
  const t = limpio(texto);
  const p = limpio(prefijo);
  if (!p || !t.toLowerCase().startsWith(p.toLowerCase())) return t;
  const resto = t.slice(p.length).replace(/^[\s·:,-]+/, "").trim();
  return resto || t;
}

/** El producto concreto elegido para un requisito, dicho corto. */
export function productoElegido(linea) {
  const p = (linea?.productosCompatibles || []).find((x) => x.id === linea?.productoMaterialId);
  return p ? sinPrefijo(p.descripcion, linea.label) : "";
}

/** Requisito de la matriz: el producto concreto que sale ("¿Cuál?"). */
export function elegirProducto(cart = [], key, productoMaterialId) {
  return cart.map((l) => (l.key === key ? { ...l, productoMaterialId: productoMaterialId || "", variante: "" } : l));
}

/**
 * Pone al día los saldos de lo que está en el carrito con el stock recién
 * leído: el carrito puede venir guardado de hace horas (o del stock maestro) y
 * mientras tanto otro pudo retirar. Sólo toca renglones del stock maestro
 * (clave `all::`) de la sede que se leyó; los armados desde la vista por obra
 * o en otra sede quedan como estaban.
 */
export function refrescarCarrito(cart = [], grupos = [], { sede = "todas" } = {}) {
  const porKey = new Map(grupos.map((g) => [g.key, g]));
  let cambio = false;
  const siguiente = cart.map((l) => {
    if (!String(l.groupKey || "").startsWith("all::")) return l;
    if (sede && sede !== "todas" && l.sede && !mismaSede(l.sede, sede)) return l;
    const g = porKey.get(l.groupKey);
    const loc = g?.locations.find((x) => `${g.key}::${x.key}` === cartBaseKey(l));
    const porVariante = loc?.porVariante ?? [];
    const locationAvailable = loc ? loc.available : 0;
    const available = availableForVariant({ available: locationAvailable, porVariante }, l.variante);
    const sourceRows = loc ? compactEgresoSourceRows(loc) : [];
    if (Math.abs(available - (l.available ?? 0)) <= EPS && Math.abs(locationAvailable - (l.locationAvailable ?? 0)) <= EPS
      && JSON.stringify(sourceRows) === JSON.stringify(l.sourceRows ?? [])) return l;
    cambio = true;
    return { ...l, available, locationAvailable, porVariante: porVariante.map((p) => ({ ...p })), sourceRows };
  });
  return cambio ? siguiente : cart;
}

/**
 * Lo que falta resolver antes de firmar: cantidades, stock y el producto
 * concreto de los requisitos. Con algo de esto el RPC rechaza el lote entero,
 * así que se frena acá y se dice qué renglón es.
 */
export function problemasDelCarrito(cart = []) {
  const out = [];
  const porUbicacion = new Map();
  for (const l of cart) {
    const n = qty(l.cantidad, NaN);
    const nombre = l.label || "Un producto";
    if (l.catalogOnly) out.push({ key: l.key, tipo: "stock", texto: `${nombre}: no tiene stock recibido.` });
    else if (!(n > 0)) out.push({ key: l.key, tipo: "cantidad", texto: `${nombre}: falta la cantidad.` });
    else if (n > (l.available ?? 0) + EPS) out.push({ key: l.key, tipo: "stock", texto: `${nombre}: hay ${fmtNum(l.available ?? 0)}${l.variante ? ` de ${l.variante}` : ""}.` });
    if (l.esRequisito && !l.productoMaterialId) {
      out.push({
        key: l.key,
        tipo: "producto",
        texto: l.productosCompatibles?.length
          ? `${nombre}: falta elegir cuál.`
          : `${nombre}: no tiene productos compatibles cargados. Revisalo en Materiales.`,
      });
    }
    const base = cartBaseKey(l);
    const suma = porUbicacion.get(base) ?? { total: 0, disponible: l.locationAvailable ?? l.available ?? 0, nombre, key: l.key, lineas: 0 };
    suma.total += n > 0 ? n : 0;
    suma.lineas += 1;
    porUbicacion.set(base, suma);
  }
  for (const s of porUbicacion.values()) {
    if (s.lineas > 1 && s.total > s.disponible + EPS) {
      out.push({ key: s.key, tipo: "stock", texto: `${s.nombre}: entre las variantes suman ${fmtNum(s.total)} y hay ${fmtNum(s.disponible)}.` });
    }
  }
  return out;
}

export const totalUnidades = (cart = []) => cart.reduce((s, l) => s + cantidadDe(l), 0);

/** Renglones agrupados por de dónde salen: stock libre primero, después cada obra. */
export function carritoPorOrigen(cart = [], obras = []) {
  const obraPorId = new Map(obras.map((o) => [o.id, o]));
  const grupos = new Map();
  for (const l of cart) {
    const k = l.obraId ? `obra:${l.obraId}` : `libre:${l.sede || ""}`;
    if (!grupos.has(k)) {
      grupos.set(k, {
        key: k,
        obraId: l.obraId || null,
        titulo: l.obraId ? `Asignado a ${obraPorId.get(l.obraId)?.codigo || l.locationLabel || "obra"}` : `Stock libre${l.sede ? ` · ${l.sede}` : ""}`,
        lineas: [],
      });
    }
    grupos.get(k).lineas.push(l);
  }
  return [...grupos.values()].sort((a, b) => Number(Boolean(a.obraId)) - Number(Boolean(b.obraId)) || a.titulo.localeCompare(b.titulo, "es", { numeric: true }));
}

// ── Adónde va ───────────────────────────────────────────────────────────────
//
// El RPC recibe UN destino para todo el carrito. Sin destino, cada renglón
// sale cargado a la obra donde estaba; lo de stock libre sale sin obra y tiene
// que decir para qué (un sector cuenta como esa observación). Con destino, todo
// se carga a esa obra: lo que estaba reservado a otra se reasigna.
//
// destino = { obraId: string | null, sector: string | null, comentario: string }

export const hayStockLibre = (cart = []) => cart.some((l) => !l.obraId);

export const DESTINO_VACIO = { obraId: null, sector: null, comentario: "" };

/**
 * El destino con que arranca la firma. Si nada sale de stock libre, cada uno a
 * su obra. Si sale algo de stock libre y la persona tiene una sola obra en
 * RRHH, esa obra, siempre que no obligue a reasignar lo de otra. Si no, null:
 * hay que elegir.
 */
export function destinoSugerido(cart = [], obrasPersona = []) {
  if (!hayStockLibre(cart)) return { ...DESTINO_VACIO };
  if (obrasPersona.length === 1) {
    const obraId = obrasPersona[0].id;
    if (cart.every((l) => !l.obraId || l.obraId === obraId)) return { ...DESTINO_VACIO, obraId };
  }
  return null;
}

export function sectorDeDestino(destino) {
  const sector = limpio(destino?.sector);
  if (!sector) return "";
  if (sector === "Otro") {
    const comentario = limpio(destino?.comentario);
    return comentario ? `Otro: ${comentario}` : "";
  }
  return sector;
}

/** Qué falta para poder confirmar el destino. Vacío: nada. */
export function faltaEnDestino(cart = [], destino, modo = "retiro", obras = []) {
  if (modo === "asignar") {
    if (!destino?.obraId) return "Elegí la obra";
    const ya = cart.find((l) => l.obraId === destino.obraId);
    if (ya) {
      const codigo = obras.find((o) => o.id === destino.obraId)?.codigo || "esa obra";
      return `${ya.label} ya está asignado a ${codigo}`;
    }
    return "";
  }
  if (!destino) return "Elegí a qué obra o sector se carga";
  if (destino.obraId || !hayStockLibre(cart)) return "";
  if (!limpio(destino.sector)) return "Falta la obra o el sector de lo que sale de stock libre";
  if (limpio(destino.sector) === "Otro" && !limpio(destino.comentario)) return "Escribí para qué es";
  return "";
}

/** Texto corto del destino, para el botón y el resumen. */
export function textoDestino(cart = [], destino, obras = [], modo = "retiro") {
  const codigo = (id) => obras.find((o) => o.id === id)?.codigo || "obra";
  if (destino?.obraId) return codigo(destino.obraId);
  if (modo === "asignar") return "";
  const propias = [...new Set(cart.filter((l) => l.obraId).map((l) => codigo(l.obraId)))];
  const sector = sectorDeDestino(destino);
  return [...propias, ...(hayStockLibre(cart) && sector ? [sector] : [])].join(" · ");
}

/** Cada renglón con de dónde sale y adónde va, marcando lo que se reasigna. */
export function lineasConDestino(cart = [], destino, obras = [], modo = "retiro") {
  const codigo = (id) => obras.find((o) => o.id === id)?.codigo || "obra";
  const sector = sectorDeDestino(destino);
  return cart.map((l) => {
    const origen = l.obraId ? codigo(l.obraId) : `Stock libre${l.sede ? ` ${l.sede}` : ""}`;
    const haciaObra = destino?.obraId || (modo === "retiro" ? l.obraId : null);
    return {
      key: l.key,
      origen,
      destino: haciaObra ? codigo(haciaObra) : modo === "retiro" ? (sector || "sin obra") : "",
      reasigna: Boolean(l.obraId && destino?.obraId && l.obraId !== destino.obraId),
      sinObra: modo === "retiro" && !haciaObra,
    };
  });
}

/** sector_destino y la nota del egreso, con el mismo formato que usaba el carrito de stock. */
export function notaDelEgreso(destino, nota = "") {
  const sector = destino?.obraId ? "" : sectorDeDestino(destino);
  return {
    sectorDestino: sector,
    nota: [sector ? `Destino: ${sector}` : "", limpio(nota)].filter(Boolean).join(" · "),
  };
}

// ── Quién retira ────────────────────────────────────────────────────────────

/** "Apellido Nombre (DNI 30111222)": lo que se guarda en retirado_por. */
export function etiquetaPersona(persona) {
  const nombre = limpio(persona?.nombre);
  const dni = limpio(persona?.dni);
  return [nombre, dni ? `(DNI ${dni})` : ""].filter(Boolean).join(" ");
}

export function buscarPersonas(empleados = [], texto = "", max = 8) {
  const q = normalizarTexto(texto);
  if (!q) return [];
  const digitos = q.replace(/\D/g, "");
  const palabras = q.split(" ");
  return empleados
    .filter((e) => (digitos.length >= 3 && String(e.dni ?? "").includes(digitos))
      || palabras.every((p) => normalizarTexto(e.nombre).includes(p)))
    .slice(0, max);
}

// ── Pantalla del operario y resumen ─────────────────────────────────────────

/** Lo que ve en /pantalla-egreso la persona que retira. */
export function pantallaOperario({ modo = "retiro", cart = [], obras = [], destino = null, persona = null, retiradoPor = "", estado = "draft", nota = "", completedAt = null } = {}) {
  const sector = sectorDeDestino(destino);
  return {
    mode: modo === "asignar" ? "reasignacion" : "retiro",
    status: estado,
    items: egresoDisplayItems(cart, obras, destino?.obraId || ""),
    employee: modo === "asignar" ? null : egresoDisplayEmployee(persona ? { nombre: persona.nombre, dni: persona.dni, foto_url: persona.fotoUrl, sede: persona.sede } : null),
    retiredBy: modo === "asignar" ? "" : retiradoPor,
    destination: egresoDisplayDestination(cart, obras, destino?.obraId || "", sector),
    sector,
    note: nota,
    totalLines: cart.length,
    totalUnits: totalUnidades(cart),
    error: "",
    completedAt,
  };
}

export function resumenDelMovimiento({ modo = "retiro", cart = [], quien = "", metodo = "", destinoTexto = "" } = {}) {
  return {
    tipo: modo,
    quien,
    metodo,
    destino: destinoTexto,
    unidades: totalUnidades(cart),
    items: cart.map((l) => ({
      key: l.key,
      descripcion: l.label,
      cantidad: cantidadDe(l),
      unidad: l.unidad || "u",
      detalle: [l.variante, productoElegido(l)].filter(Boolean).join(" · "),
    })),
  };
}

// ── Últimos movimientos ─────────────────────────────────────────────────────

const minuto = (iso) => {
  const t = new Date(iso || 0).getTime();
  return Number.isFinite(t) ? Math.floor(t / 60_000) : 0;
};

/**
 * Los últimos retiros y asignaciones de la sede, juntando los renglones de un
 * mismo carrito (mismo minuto, misma persona, mismo destino).
 */
export function ultimosMovimientos(rows = [], { obras = [], sede = "todas", limite = 20 } = {}) {
  const codigo = (id) => obras.find((o) => o.id === id)?.codigo || "";
  const grupos = new Map();
  for (const row of rows) {
    if (!rowInHistory(row)) continue;
    if (sede && sede !== "todas" && !mismaSede(rowSede(row), sede)) continue;
    const at = rowMovementAt(row);
    const kind = rowEgresoKind(row);
    const asignacion = kind === "asignacion" || kind === "reasignacion";
    const destino = asignacion
      ? codigo(rowObraId(row)) || rowObraLabel(row)
      : row.egreso_destino_obra_id
        ? codigo(row.egreso_destino_obra_id) || row.egreso_destino_obra?.codigo || "obra"
        : rowObraId(row) ? rowObraLabel(row) : limpio(row.sector_destino) || "sin obra";
    const quien = limpio(row.retirado_por);
    const clave = [minuto(at), asignacion ? "a" : "r", quien, destino].join("|");
    if (!grupos.has(clave)) grupos.set(clave, { clave, at, tipo: asignacion ? "asignacion" : "retiro", quien, destino, items: new Map(), filas: 0, anuladas: 0 });
    const g = grupos.get(clave);
    if (new Date(at) > new Date(g.at)) g.at = at;
    g.filas += 1;
    if (rowIsAnulado(row)) g.anuladas += 1;
    const k = row.material_id || row.descripcion;
    const it = g.items.get(k) ?? { descripcion: row.descripcion_catalogo || row.descripcion || "Material", cantidad: 0 };
    it.cantidad += rowEgresoQuantity(row);
    g.items.set(k, it);
  }
  return [...grupos.values()]
    .map((g) => ({ ...g, items: [...g.items.values()], anulado: g.anuladas > 0 && g.anuladas === g.filas }))
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .slice(0, limite);
}
