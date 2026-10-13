/**
 * Mostrador de consumibles — la lógica que no depende de React ni de la red.
 *
 * Vive aparte para poder probarla con `node --test` (mostradorLogica.test.mjs):
 * acá se decide qué entra al carrito, cuándo un retiro se pasa del cupo, cómo
 * se arman las filas del registro y cómo se guarda la cola sin conexión. Si
 * algo de esto se equivoca, el stock queda mal para siempre, así que no puede
 * depender de probar a mano en la pantalla.
 *
 * No importa `api.js` (trae Supabase y no corre en node): lo que hace falta de
 * ahí (`nuevoId`, `repartirEntreObras`, `piezasDesdeGramos`) lo pasa quien llama.
 */

export const SEDES_MOSTRADOR = ["Chubut", "Pampa"];

const OBRA_CERRADA = new Set(["terminada", "cancelada", "archivada", "cerrada"]);

const limpio = (v) => String(v ?? "").trim();

export function num(v) {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function redondear(n, decimales = 2) {
  const f = 10 ** decimales;
  return Math.round((Number(n) || 0) * f) / f;
}

export function fmtNum(v) {
  const n = num(v);
  if (n == null) return "—";
  return n.toLocaleString("es-AR", { maximumFractionDigits: 3 });
}

/** Minúsculas, sin acentos y con un solo espacio: para buscar como habla la gente. */
export function normalizarTexto(s) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ── El lector de códigos ────────────────────────────────────────────────────

/**
 * Separa lo que escribió el lector de lo que escribió una persona.
 *
 * El lector USB es un teclado que tipea todo el código en ráfaga (menos de
 * 30 ms entre teclas) y manda Enter. Una persona tarda más de 80 ms. Mirando
 * los tiempos de las últimas teclas se sabe si lo que hay en el campo es un
 * escaneo, aunque el pañolero haya dejado escrito "lij" a medio buscar: la
 * ráfaga del final es el código y lo de antes queda como estaba.
 *
 * teclas: [{ k: "7", t: 1000 }, ...] en el orden en que llegaron.
 */
export function separarRafaga(teclas = [], { gapMs = 50, minLargo = 4 } = {}) {
  const todo = teclas.map((x) => x.k).join("");
  if (teclas.length < minLargo) return { rafaga: null, previo: todo };
  let i = teclas.length - 1;
  while (i > 0 && teclas[i].t - teclas[i - 1].t <= gapMs) i -= 1;
  const largo = teclas.length - i;
  if (largo < minLargo) return { rafaga: null, previo: todo };
  return {
    rafaga: teclas.slice(i).map((x) => x.k).join(""),
    previo: teclas.slice(0, i).map((x) => x.k).join(""),
  };
}

/**
 * ¿Puede ser el UID de una tarjeta? Los lectores que escriben como teclado
 * mandan el UID en hexadecimal (4, 7 o 10 bytes) o en decimal de 10 dígitos.
 * Sirve para no confundir un código de barras desconocido con una tarjeta.
 */
export function pareceUidTarjeta(codigo) {
  const c = limpio(codigo).toUpperCase();
  if (/^\d{10}$/.test(c)) return true;
  return /^[0-9A-F]+$/.test(c) && [8, 14, 20].includes(c.length) && /[A-F]/.test(c);
}

/**
 * "x5", "*5" o "5*": cambiar la cantidad de lo último marcado sin soltar el
 * lector, como en una caja. Un número solo no alcanza: "600" puede ser
 * "Lija al agua 600". Devuelve la cantidad o null.
 */
export function cantidadTipeada(texto) {
  const t = limpio(texto);
  const m = t.match(/^[x*]\s*(\d{1,4}(?:[.,]\d{1,3})?)$/i) || t.match(/^(\d{1,4}(?:[.,]\d{1,3})?)\s*\*$/);
  if (!m) return null;
  const n = num(m[1]);
  return n > 0 ? n : null;
}

// ── Catálogo, búsqueda y botonera ───────────────────────────────────────────

/**
 * Busca en el catálogo como en una ferretería: todas las palabras tienen que
 * aparecer (en cualquier orden) en la descripción, el alias, el rubro o un
 * código. Lo que empieza igual va primero; a igualdad, lo más retirado.
 */
export function buscarEnCatalogo(catalogo = [], texto = "", { max = 30, popularidad = null } = {}) {
  const q = normalizarTexto(texto);
  if (!q) return [];
  const palabras = q.split(" ");
  const comoCodigo = q.replace(/\s+/g, "").toUpperCase();
  const puntuados = [];
  for (const item of catalogo) {
    const desc = normalizarTexto(item.descripcion);
    const pajar = normalizarTexto([
      item.descripcion, item.alias, item.rubro, item.rubroPadre, item.codigo, item.codigoEtiqueta,
    ].filter(Boolean).join(" "));
    let puntos;
    if ((item.codigos ?? []).includes(comoCodigo)) puntos = 1000;
    else if (palabras.every((p) => pajar.includes(p))) {
      puntos = 10;
      if (desc.startsWith(q)) puntos += 60;
      else if (desc.split(" ").some((w) => w.startsWith(palabras[0]))) puntos += 25;
    } else continue;
    puntos += Math.min(9, popularidad?.get(item.id) ?? 0);
    puntuados.push({ item, puntos });
  }
  puntuados.sort((a, b) => b.puntos - a.puntos || String(a.item.descripcion).localeCompare(String(b.item.descripcion), "es"));
  return puntuados.slice(0, max).map((x) => x.item);
}

/**
 * Cuántas veces salió cada consumible. Cuenta retiros, no unidades: 100
 * guantes de una vez pesan menos que 30 personas pidiendo trapo.
 *
 * filas: [{ material_id, cantidad, lote? }]. Las filas de un mismo lote (un
 * retiro repartido entre obras) cuentan una sola vez.
 */
export function rankingMasRetirados(filas = []) {
  const porMaterial = new Map();
  for (const f of filas) {
    if (!f?.material_id) continue;
    const r = porMaterial.get(f.material_id) ?? { materialId: f.material_id, veces: 0, cantidad: 0, lotes: new Set() };
    const claveLote = f.lote ? String(f.lote) : null;
    if (!claveLote || !r.lotes.has(claveLote)) {
      r.veces += 1;
      if (claveLote) r.lotes.add(claveLote);
    }
    r.cantidad += Math.abs(num(f.cantidad) ?? 0);
    porMaterial.set(f.material_id, r);
  }
  return [...porMaterial.values()]
    .map(({ materialId, veces, cantidad }) => ({ materialId, veces, cantidad: redondear(cantidad) }))
    .sort((a, b) => b.veces - a.veces || b.cantidad - a.cantidad);
}

/**
 * La botonera: primero los que Compras ordenó a mano (`favorito_orden`), y si
 * no alcanzan, los más retirados. Solo lo que está activo en el mostrador.
 */
export function elegirFavoritos(catalogo = [], ranking = [], max = 24) {
  const disponibles = catalogo.filter((i) => i.enMostrador !== false && i.activo !== false);
  const porId = new Map(disponibles.map((i) => [i.id, i]));
  const ordenFijo = (i) => (i.config?.favorito_orden == null ? null : num(i.config.favorito_orden));
  const fijos = disponibles
    .filter((i) => ordenFijo(i) != null)
    .sort((a, b) => ordenFijo(a) - ordenFijo(b));
  const out = [];
  const vistos = new Set();
  for (const i of fijos) {
    if (out.length >= max) break;
    out.push(i);
    vistos.add(i.id);
  }
  for (const r of ranking) {
    if (out.length >= max) break;
    const i = porId.get(r.materialId);
    if (!i || vistos.has(i.id)) continue;
    out.push(i);
    vistos.add(i.id);
  }
  return out;
}

/** Suma un código al ítem (después de vincularlo) sin tocar el original. */
export function agregarCodigoAlCatalogo(catalogo = [], materialId, codigo) {
  return catalogo.map((i) => (i.id === materialId && !i.codigos.includes(codigo)
    ? { ...i, codigos: [...i.codigos, codigo] }
    : i));
}

/**
 * Descuenta (o suma) en el stock local lo que se acaba de registrar. Un
 * producto sin contar sigue sin stock: lo que sale antes del primer conteo es
 * pre-conteo y no descuenta.
 */
export function aplicarStockLocal(catalogo = [], filas = []) {
  const delta = new Map();
  for (const f of filas) delta.set(f.material_id, (delta.get(f.material_id) ?? 0) + Number(f.cantidad || 0));
  if (!delta.size) return catalogo;
  return catalogo.map((i) => (delta.has(i.id) && i.stock != null
    ? { ...i, stock: redondear(i.stock + delta.get(i.id), 3) }
    : i));
}

// ── El carrito ──────────────────────────────────────────────────────────────

/**
 * Una línea por consumible. Lo que se muestra (descripción, unidad, stock) se
 * busca en el catálogo al dibujar; la línea guarda solo lo que se decidió en
 * el mostrador.
 */
export function nuevaLinea(item, ahora = 0) {
  const forma = item?.formaEntrega ?? "unidad";
  return {
    key: item.id,
    materialId: item.id,
    // Lo que va por peso arranca sin cantidad: se pesa o se cuenta.
    cantidad: forma === "peso" ? 0 : 1,
    gramos: null,
    canje: forma === "canje" ? "trajo_usado" : null,
    autorizaCanje: "",
    agregadoAt: ahora,
  };
}

/**
 * Lo que pasa cuando el lector (o un botón) marca un consumible: si no estaba,
 * entra arriba; si estaba, suma 1 y sube. Lo que va por peso no suma de a uno
 * (nadie escanea cada tornillo): se vuelve a abrir la balanza.
 */
export function agregarAlCarrito(carrito = [], item, { cantidad = 1, ahora = 0 } = {}) {
  const i = carrito.findIndex((l) => l.materialId === item.id);
  const esPeso = item.formaEntrega === "peso";
  if (i < 0) {
    const linea = nuevaLinea(item, ahora);
    if (!esPeso && cantidad !== 1) linea.cantidad = redondear(cantidad, 3);
    return [linea, ...carrito];
  }
  const actual = carrito[i];
  const actualizada = esPeso
    ? { ...actual, agregadoAt: ahora }
    : { ...actual, cantidad: redondear(actual.cantidad + cantidad, 3), agregadoAt: ahora };
  return [actualizada, ...carrito.slice(0, i), ...carrito.slice(i + 1)];
}

export function quitarLinea(carrito = [], key) {
  return carrito.filter((l) => l.key !== key);
}

/** +1 / −1. En cero la línea se va: es lo que espera quien toca "menos". */
export function sumarCantidad(carrito = [], key, delta) {
  return carrito
    .map((l) => (l.key === key ? { ...l, cantidad: redondear(Math.max(0, l.cantidad + delta), 3) } : l))
    .filter((l) => l.key !== key || l.cantidad > 0);
}

export function fijarCantidad(carrito = [], key, cantidad) {
  const n = num(cantidad);
  if (!(n > 0)) return quitarLinea(carrito, key);
  return carrito.map((l) => (l.key === key ? { ...l, cantidad: redondear(n, 3) } : l));
}

export function fijarPeso(carrito = [], key, { gramos = null, cantidad }) {
  const n = num(cantidad);
  const g = num(gramos);
  return carrito.map((l) => (l.key === key
    ? { ...l, cantidad: n > 0 ? redondear(n, 3) : 0, gramos: g > 0 ? redondear(g, 1) : null }
    : l));
}

export function fijarCanje(carrito = [], key, { trajoUsado, autoriza }) {
  return carrito.map((l) => {
    if (l.key !== key) return l;
    if (trajoUsado) return { ...l, canje: "trajo_usado", autorizaCanje: "" };
    return { ...l, canje: "sin_usado", autorizaCanje: autoriza ?? l.autorizaCanje ?? "" };
  });
}

/** Si la unidad de entrega ya es de peso, la balanza da la cantidad directo. */
export function unidadDePeso(unidad) {
  const u = normalizarTexto(unidad).replace(/\.$/, "");
  if (["kg", "kgs", "kilo", "kilos", "kilogramo", "kilogramos"].includes(u)) return "kg";
  if (["g", "gr", "grs", "gramo", "gramos"].includes(u)) return "g";
  return null;
}

/**
 * Qué cantidad sale de una pesada.
 *   - unidad kg o g: la cantidad es el peso.
 *   - piezas contadas a mano: mandan (la Kretz de 5 g no sirve para 4 tornillos).
 *   - calibrado: piezas = gramos / peso por pieza (lo calcula quien llama con
 *     `piezasDesdeGramos` de api.js y lo pasa en `piezasCalculadas`).
 * Devuelve { cantidad, modo } o null si todavía no alcanza para decidir.
 */
export function cantidadParaPeso({ gramos = null, unidad = "unidad", piezasCalculadas = null, piezasManual = null } = {}) {
  const g = num(gramos);
  const tipo = unidadDePeso(unidad);
  if (tipo === "kg") return g > 0 ? { cantidad: redondear(g / 1000, 3), modo: "kg" } : null;
  if (tipo === "g") return g > 0 ? { cantidad: redondear(g, 1), modo: "g" } : null;
  const manual = num(piezasManual);
  if (manual > 0) return { cantidad: Math.round(manual), modo: "manual" };
  const calc = num(piezasCalculadas);
  if (calc > 0) return { cantidad: Math.round(calc), modo: "balanza" };
  return null;
}

/**
 * Cuántas piezas de error trae una pesada: la Kretz marca de a 5 g, así que
 * la lectura puede errar ±2,5 g. Con piezas de 3 g eso es ±1 pieza.
 */
export function margenPiezas(pesoUnitarioG, divisionG = 5) {
  const pu = num(pesoUnitarioG);
  if (!(pu > 0)) return null;
  return Math.max(0, Math.ceil((divisionG / 2) / pu));
}

/**
 * El aviso de stock de una línea. Nunca bloquea. Hasta que un producto tenga
 * su primer conteo en la sede, el stock no significa nada (los retiros lo
 * dejan negativo antes del inventario inicial): se avisa "sin contar", sin
 * alarma, y se retira igual.
 */
export function avisoStock(item, enCarrito = 0) {
  if (!item) return null;
  if (item.stock == null || !item.ultimoConteoAt) return { nivel: "sin_conteo", texto: "Sin contar en esta sede" };
  const stock = Number(item.stock);
  const queda = redondear(stock - (Number(enCarrito) || 0), 3);
  if (stock <= 0) return { nivel: "sin_stock", texto: `El sistema dice ${fmtNum(stock)}`, queda };
  if (queda < 0) return { nivel: "negativo", texto: `Hay ${fmtNum(stock)}: queda en ${fmtNum(queda)}`, queda };
  if (item.stockMinimo != null && queda <= item.stockMinimo) return { nivel: "bajo", texto: `Quedan ${fmtNum(queda)} · mínimo ${fmtNum(item.stockMinimo)}`, queda };
  return { nivel: "ok", texto: `Quedan ${fmtNum(queda)}`, queda };
}

/** Lo que falta resolver en el carrito antes de firmar. Cada uno dice qué hacer. */
export function problemasDelCarrito(carrito = [], porId = new Map(), modo = "retiro") {
  const out = [];
  for (const l of carrito) {
    const item = porId.get(l.materialId);
    const nombre = item?.descripcion ?? "un producto";
    if (!(l.cantidad > 0)) {
      out.push({ key: l.key, tipo: "cantidad", texto: item?.formaEntrega === "peso" ? `Falta pesar o contar: ${nombre}` : `Falta la cantidad: ${nombre}` });
    }
    if (modo === "retiro" && l.canje === "sin_usado" && !limpio(l.autorizaCanje)) {
      out.push({ key: l.key, tipo: "canje", texto: `${nombre} sin el usado: falta quién autoriza` });
    }
  }
  return out;
}

export function totalUnidades(carrito = []) {
  return redondear(carrito.reduce((s, l) => s + (Number(l.cantidad) || 0), 0));
}

// ── Cupo diario ─────────────────────────────────────────────────────────────

/**
 * Lo que la persona ya se llevó hoy, por consumible, en positivo. Junta lo
 * que dice la base (`retirosDeHoy`) con lo que salió de este mostrador y
 * todavía está en la cola sin conexión: si no, cortar la red regala cupo.
 */
export function cantidadesDeHoy(retirosHoy = [], pendientes = []) {
  const map = new Map();
  const vistos = new Set();
  for (const r of [...retirosHoy, ...pendientes]) {
    if (!r?.material_id) continue;
    if (r.id) {
      if (vistos.has(r.id)) continue;
      vistos.add(r.id);
    }
    map.set(r.material_id, redondear((map.get(r.material_id) ?? 0) + Math.abs(Number(r.cantidad) || 0), 3));
  }
  return map;
}

/** Filas de retiro de una persona que están en la cola, desde una hora dada. */
export function retirosPendientesDe(cola = [], empleadoId, desdeIso, hastaIso) {
  if (!empleadoId) return [];
  const desde = desdeIso ? new Date(desdeIso).getTime() : 0;
  const hasta = hastaIso ? new Date(hastaIso).getTime() : Infinity;
  const out = [];
  for (const envio of cola) {
    if (envio.tipo !== "retiro") continue;
    for (const f of envio.filas ?? []) {
      const fecha = new Date(f.created_at ?? envio.creadoAt).getTime();
      if (fecha >= desde && fecha < hasta && f.empleado_id === empleadoId && f.tipo === "retiro") out.push(f);
    }
  }
  return out;
}

/**
 * Qué líneas pasan el cupo diario. Pasarse no bloquea: pide quién autoriza y
 * la fila queda marcada `fuera_cupo`.
 */
export function evaluarCupo(carrito = [], porId = new Map(), hoy = new Map(), { incierto = false } = {}) {
  const excedidos = [];
  for (const l of carrito) {
    const item = porId.get(l.materialId);
    const cupo = num(item?.config?.cupo_diario);
    if (!(cupo > 0) || !(l.cantidad > 0)) continue;
    const ya = hoy.get(l.materialId) ?? 0;
    const total = redondear(ya + l.cantidad, 3);
    if (total > cupo || incierto) {
      excedidos.push({
        materialId: l.materialId,
        descripcion: item?.descripcion ?? "",
        unidad: item?.unidad ?? "",
        cupo,
        ya,
        enCarrito: l.cantidad,
        total,
        incierto,
      });
    }
  }
  return excedidos;
}

// ── Destino: obra, reparto o sector ─────────────────────────────────────────

/** Las obras de RRHH que siguen abiertas (la base trae también terminadas). */
export function obrasVigentes(obras = []) {
  const vistas = new Set();
  return obras.filter((o) => o?.id && !OBRA_CERRADA.has(String(o.estado || "").toLowerCase()) && !vistas.has(o.id) && vistas.add(o.id));
}

/** Con una sola obra se carga ahí sin preguntar. Con varias o ninguna, se elige. */
export function destinoInicial(obras = []) {
  return obras.length === 1 ? { tipo: "obra", obraId: obras[0].id } : null;
}

export function repartoDeDestino(destino) {
  if (!destino) return { reparto: [], sector: null, ok: false };
  if (destino.tipo === "obra") {
    return { reparto: destino.obraId ? [{ obraId: destino.obraId, proporcion: 1 }] : [], sector: null, ok: Boolean(destino.obraId) };
  }
  if (destino.tipo === "repartir") {
    const ids = [...new Set((destino.obraIds ?? []).filter(Boolean))];
    return { reparto: ids.map((obraId) => ({ obraId, proporcion: 1 })), sector: null, ok: ids.length > 0 };
  }
  if (destino.tipo === "sector") {
    const sector = limpio(destino.sector) || null;
    // "Otro" a secas no dice nada después: se pide para qué o para quién es.
    const comentario = sector === "Otro" ? limpio(destino.comentario) || null : null;
    return { reparto: [], sector, comentario, ok: Boolean(sector) && (sector !== "Otro" || Boolean(comentario)) };
  }
  return { reparto: [], sector: null, ok: false };
}

/** Elegido "Otro" y todavía sin el comentario. */
export function faltaComentarioOtro(destino) {
  return destino?.tipo === "sector" && limpio(destino.sector) === "Otro" && !limpio(destino.comentario);
}

export function textoDestino(destino, obrasPorId = new Map()) {
  if (!destino) return "";
  const cod = (id) => obrasPorId.get(id)?.codigo ?? "obra";
  if (destino.tipo === "obra") return destino.obraId ? cod(destino.obraId) : "";
  if (destino.tipo === "repartir") {
    const ids = [...new Set(destino.obraIds ?? [])];
    return ids.length ? `${ids.map(cod).join(" · ")} (repartido)` : "";
  }
  if (destino.tipo === "sector") {
    const comentario = limpio(destino.sector) === "Otro" ? limpio(destino.comentario) : "";
    return comentario ? `Otro: ${comentario}` : limpio(destino.sector);
  }
  return "";
}

// ── Las filas del registro ──────────────────────────────────────────────────

const autorizantes = (...nombres) => [...new Set(nombres.map(limpio).filter(Boolean))].join(" / ") || null;

/**
 * Traduce las decisiones del mostrador al contrato compartido. El constructor
 * de api.js es el único que reparte cantidades, gramos y genera ids: mantener
 * otro algoritmo acá volvía a introducir errores ya corregidos en el contrato.
 */
export function datosParaRetiro({
  carrito = [],
  porId = new Map(),
  empleado = null,
  metodoFirma = "nfc",
  sede,
  destino = null,
  excedidos = [],
  autorizaCupo = "",
  lote,
  carril = "mostrador",
  origen = "mostrador",
} = {}) {
  if (!SEDES_MOSTRADOR.includes(sede)) throw new Error("Elegí la sede del pañol.");
  if (!empleado?.id && !limpio(empleado?.nombre)) throw new Error("Falta quién retira.");
  const lineas = carrito.filter((l) => l.materialId && Number(l.cantidad) > 0);
  if (!lineas.length) throw new Error("El carrito está vacío.");
  const { reparto, sector, comentario, ok } = repartoDeDestino(destino);
  if (faltaComentarioOtro(destino)) throw new Error("Con «Otro», escribí para qué o para quién es.");
  if (!ok) throw new Error("Falta elegir la obra o el sector.");

  const fueraDeCupo = new Set(excedidos.map((e) => e.materialId));
  if (fueraDeCupo.size && !limpio(autorizaCupo)) throw new Error("Se pasa del cupo: falta quién autoriza.");

  const items = lineas.map((l) => {
    const item = porId.get(l.materialId);
    if (l.canje === "sin_usado" && !limpio(l.autorizaCanje)) {
      throw new Error(`${item?.descripcion ?? "Un canje"} sin el usado: falta quién autoriza.`);
    }
    const fueraCupo = fueraDeCupo.has(l.materialId);
    const autorizadoPor = autorizantes(l.canje === "sin_usado" ? l.autorizaCanje : "", fueraCupo ? autorizaCupo : "");
    // El comentario de "Otro" va en la nota de cada renglón (Movimientos lo muestra como destino).
    const nota = [item?.formaEntrega === "prestamo" ? "Préstamo: tiene que volver al pañol" : null, comentario]
      .filter(Boolean).join(" · ") || null;
    return { materialId: l.materialId, cantidad: Number(l.cantidad), gramos: l.gramos,
      canje: l.canje ?? null, fueraCupo, autorizadoPor, nota };
  });
  return { items, empleado, metodoFirma, sede, reparto, sector, carril, lote, origen };
}

/** Las notas de préstamo se agregan sin alterar el reparto del contrato. */
export function notasDelRetiro(filas, datos) {
  const notas = new Map(datos.items.map((i) => [i.materialId, i.nota]));
  return filas.map((f) => ({ ...f, nota: notas.get(f.material_id) ?? f.nota }));
}

/**
 * Filas de una devolución (lo que sobra, o una herramienta prestada que
 * vuelve). Mismos campos que `registrarDevolucion` de api.js, más el id, el
 * lote y la firma, por la misma razón que en el retiro: la cola reenvía igual.
 */
export function armarFilasDevolucion({
  carrito = [],
  porId = new Map(),
  empleado = null,
  metodoFirma = null,
  sede,
  obraId = null,
  nota = "",
  lote,
} = {}, { nuevoId } = {}) {
  if (typeof nuevoId !== "function") throw new Error("Falta nuevoId.");
  if (!SEDES_MOSTRADOR.includes(sede)) throw new Error("Elegí la sede del pañol.");
  const lineas = carrito.filter((l) => l.materialId && Number(l.cantidad) > 0)
    .sort((a, b) => String(a.materialId).localeCompare(String(b.materialId)));
  if (!lineas.length) throw new Error("No hay nada para devolver.");
  return lineas.map((l) => {
    const item = porId.get(l.materialId);
    const notaItem = [item?.formaEntrega === "prestamo" ? "Vuelve el préstamo" : "", limpio(nota)].filter(Boolean).join(" · ");
    return {
      id: nuevoId(),
      material_id: l.materialId,
      sede,
      tipo: "devolucion",
      cantidad: Math.abs(Number(l.cantidad)),
      gramos: Number(l.gramos) > 0 ? Number(l.gramos) : null,
      empleado_id: empleado?.id ?? null,
      empleado_nombre: empleado?.nombre ?? null,
      empleado_dni: empleado?.dni ?? null,
      metodo_firma: empleado ? metodoFirma : null,
      obra_id: obraId || null,
      lote,
      origen: "devolucion",
      nota: notaItem || null,
    };
  });
}

// ── La cola sin conexión ────────────────────────────────────────────────────

export const COLA_KEY = "klasea.consumibles.mostrador.cola";

/**
 * Cada envío es un carrito entero: { id (= lote), tipo, filas, creadoAt,
 * resumen, intentos, error }. Las filas llevan sus ids desde el primer
 * intento, así que reenviar nunca duplica.
 */
export function leerCola(storage) {
  try {
    const v = JSON.parse(storage?.getItem(COLA_KEY) || "[]");
    return Array.isArray(v) ? v.filter((e) => e && e.id && Array.isArray(e.filas) && e.filas.length) : [];
  } catch {
    return [];
  }
}

export function guardarCola(storage, cola) {
  try {
    if (!storage) return false;
    if (!cola.length) storage?.removeItem(COLA_KEY);
    else storage?.setItem(COLA_KEY, JSON.stringify(cola));
    return true;
  } catch {
    return false;
  }
}

/**
 * Suma un envío a la cola. Si el primer intento no llegó, las filas se quedan
 * con la hora real del retiro (`created_at`): si no, un retiro de las 7 que se
 * manda a las 9 figura a las 9 y descoloca el "ya retiró hoy".
 */
export function encolarEnvio(cola = [], envio) {
  if (!envio?.id || cola.some((e) => e.id === envio.id)) return cola;
  const creadoAt = envio.creadoAt ?? new Date().toISOString();
  const filas = (envio.filas ?? []).map((f) => ({ ...f, created_at: f.created_at ?? creadoAt }));
  return [...cola, { ...envio, creadoAt, filas, intentos: envio.intentos ?? 0, error: envio.error ?? null }];
}

export function quitarDeCola(cola = [], id) {
  return cola.filter((e) => e.id !== id);
}

export function marcarIntento(cola = [], id, { error = null, ahora = null } = {}) {
  return cola.map((e) => (e.id === id
    ? { ...e, intentos: (e.intentos ?? 0) + 1, error: error ? String(error) : null, ultimoIntentoAt: ahora }
    : e));
}

/**
 * ¿Vale la pena reintentar? Sí si no hubo red, si el servidor no contestó a
 * tiempo, si el error es del servidor (5xx) o si la sesión venció (se renueva
 * sola al volver la red). No si la base rechazó el dato: eso no se arregla
 * reintentando y lo tiene que mirar una persona.
 */
export function esErrorReintentable(err, { online = true } = {}) {
  // Un constraint o un permiso denegado no se arregla aunque se caiga la red
  // justo cuando llega el rechazo. La causa explícita tiene prioridad.
  if (/^(22|23|42501)/.test(String(err?.code ?? "")) || Number(err?.status) === 403) return false;
  if (!online) return true;
  if (!err) return false;
  if (err.esTimeout || err.name === "TimeoutError" || err.name === "AbortError") return true;
  const status = Number(err.status ?? err.statusCode);
  if (status === 0 || status === 401 || status === 408 || status === 429 || status >= 500) return true;
  const msg = String(err.message ?? err).toLowerCase();
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed|err_internet|err_network|timeout|timed out|sin conexi|econnreset|socket|gateway|service unavailable|jwt expired|token/.test(msg);
}

/** Corta una promesa que no contesta: el pañolero no puede esperar a la red. */
export function conTimeout(promesa, ms, texto = "El servidor no contestó a tiempo.") {
  let timer = null;
  const corte = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(texto);
      err.esTimeout = true;
      reject(err);
    }, ms);
  });
  return Promise.race([promesa, corte]).finally(() => clearTimeout(timer));
}

// ── Lo que ya retiró hoy y los últimos movimientos ──────────────────────────

export function agruparRetirosDeHoy(retiros = [], porId = new Map()) {
  const map = new Map();
  for (const r of retiros) {
    if (!r?.material_id) continue;
    const item = porId.get(r.material_id);
    const actual = map.get(r.material_id) ?? {
      materialId: r.material_id,
      descripcion: item?.descripcion ?? "Consumible",
      unidad: item?.unidad ?? "",
      cantidad: 0,
    };
    actual.cantidad = redondear(actual.cantidad + Math.abs(Number(r.cantidad) || 0), 3);
    map.set(r.material_id, actual);
  }
  return [...map.values()].sort((a, b) => b.cantidad - a.cantidad);
}

/**
 * Los movimientos vienen fila por fila; en el mostrador se piensan por
 * carrito. Agrupa por lote (las filas sin lote quedan solas) respetando el
 * orden en que llegaron (lo más nuevo primero).
 */
export function agruparMovimientos(movs = [], max = 20) {
  const grupos = [];
  const porClave = new Map();
  for (const m of movs) {
    const clave = m.lote ? `l:${m.lote}` : `m:${m.id}`;
    let g = porClave.get(clave);
    if (!g) {
      g = {
        clave,
        lote: m.lote ?? null,
        tipo: m.tipo,
        createdAt: m.created_at,
        empleado: m.empleado_nombre ?? "",
        metodoFirma: m.metodo_firma ?? null,
        carril: m.carril ?? null,
        filas: [],
      };
      porClave.set(clave, g);
      grupos.push(g);
    }
    g.filas.push(m);
  }
  return grupos.slice(0, max).map((g) => {
    const obras = [...new Set(g.filas.map((f) => f.obra?.codigo).filter(Boolean))];
    const sectores = [...new Set(g.filas.map((f) => (f.sector === "Otro" && f.nota ? `Otro: ${f.nota}` : f.sector)).filter(Boolean))];
    const activas = g.filas.filter((f) => !f.anulado_at);
    return {
      ...g,
      destino: [...obras, ...sectores].join(" · "),
      anulado: activas.length === 0,
      activas,
      // Lo que viene de la lista planificada se corrige en la solicitud: si se
      // anula acá, el papel y el registro dejan de coincidir.
      anulable: g.carril !== "planificado" && activas.length > 0,
    };
  });
}

// ── La pantalla que mira el operario (/pantalla-egreso) ─────────────────────

/**
 * El formato que ya entiende PantallaEgresoScreen (egresoDisplay.js). Solo
 * para retiros: una devolución no se muestra, porque la pantalla dice "retiro"
 * y el que mira cree que le están cargando algo a su nombre.
 */
export function armarPantallaOperario({
  carrito = [],
  porId = new Map(),
  sede = "",
  persona = null,
  destinoTexto = "",
  estado = "draft",
  error = "",
  ahoraIso = null,
} = {}) {
  const items = carrito.map((l) => {
    const item = porId.get(l.materialId);
    const detalle = [];
    if (l.gramos) detalle.push(`${fmtNum(l.gramos)} g`);
    if (l.canje === "trajo_usado") detalle.push("canje: trajo el usado");
    if (l.canje === "sin_usado") detalle.push("canje sin el usado");
    if (item?.formaEntrega === "prestamo") detalle.push("préstamo: vuelve al pañol");
    if (item?.formaEntrega === "peso" && !(l.cantidad > 0)) detalle.push("pesando…");
    return {
      key: l.key,
      label: item?.descripcion ?? "Consumible",
      quantity: Number(l.cantidad) || 0,
      unit: item?.unidad ?? "u",
      variant: detalle.join(" · "),
      origin: sede ? `Pañol ${sede}` : "Pañol",
      destination: destinoTexto,
    };
  });
  return {
    mode: "retiro",
    status: estado,
    items,
    employee: persona
      ? { name: persona.nombre ?? "", dni: persona.dni ?? "", photoUrl: persona.fotoUrl ?? "", sede: persona.sede ?? "" }
      : null,
    retiredBy: persona?.nombre ?? "",
    destination: destinoTexto,
    sector: "",
    note: "",
    totalLines: items.length,
    totalUnits: totalUnidades(carrito),
    error,
    completedAt: estado === "complete" ? ahoraIso : null,
  };
}

/** El resumen de la pantalla de listo: qué, a quién y adónde. */
export function resumenDelRegistro({ tipo = "retiro", carrito = [], porId = new Map(), persona = null, destinoTexto = "", sinConexion = false } = {}) {
  const items = carrito
    .filter((l) => Number(l.cantidad) > 0)
    .map((l) => {
      const item = porId.get(l.materialId);
      return {
        key: l.key,
        descripcion: item?.descripcion ?? "Consumible",
        cantidad: Number(l.cantidad),
        unidad: item?.unidad ?? "",
        gramos: l.gramos ?? null,
        prestamo: item?.formaEntrega === "prestamo",
        canje: l.canje ?? null,
      };
    });
  return {
    tipo,
    quien: persona?.nombre ?? "",
    metodo: persona?.metodo ?? null,
    destino: destinoTexto,
    items,
    unidades: totalUnidades(carrito),
    prestamos: items.filter((i) => i.prestamo).map((i) => i.descripcion),
    sinConexion,
  };
}
