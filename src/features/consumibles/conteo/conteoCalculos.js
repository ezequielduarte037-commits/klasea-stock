/**
 * Cálculos del conteo de consumibles. Funciones puras, sin Supabase ni React,
 * para poder probarlas con `node --test` (conteoCalculos.test.mjs).
 *
 * Lo usa la pestaña Conteo para el inventario inicial del lunes 12/10/2026 y
 * para el conteo cíclico de todos los días ("Contar hoy").
 */

export const DIA_MS = 24 * 60 * 60 * 1000;

const num = (v) => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

export function inicioDelDia(fecha) {
  return new Date(`${claveDia(fecha)}T00:00:00-03:00`);
}

/** El inventario cambia de día a medianoche argentina, aunque el teléfono tenga otra zona. */
export function claveDia(fecha) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(fecha));
}

// ── Búsqueda ───────────────────────────────────────────────────────────────

/**
 * Minúsculas, sin tildes y con las medidas juntas: en el catálogo conviven
 * "Fijador 6 X 3/4" y "fijador 6x3/4", y el pañolero escribe como le sale.
 */
export function normalizarTexto(s) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/(\d)\s*[x×]\s*(\d)/g, "$1x$2")
    .replace(/\s+/g, " ")
    .trim();
}

/** Todas las palabras de la búsqueda tienen que aparecer en algún dato del producto. */
export function coincideBusqueda(item, busqueda) {
  const q = normalizarTexto(busqueda);
  if (!q) return true;
  const pajar = normalizarTexto([
    item.descripcion, item.alias, item.codigo, item.codigoEtiqueta,
    item.rubro, item.ubicacion, item.config?.proveedor_codigo,
  ].filter(Boolean).join(" "));
  return q.split(" ").every((palabra) => pajar.includes(palabra));
}

// ── Orden y grupos ─────────────────────────────────────────────────────────

const colador = new Intl.Collator("es", { numeric: true, sensitivity: "base" });

/** Orden natural: "Mecha 3" < "Mecha 3,25" < "Mecha 10"; "C2-03" < "C10-01". */
export function compararNatural(a, b) {
  return colador.compare(String(a ?? ""), String(b ?? ""));
}

/** La estantería de una ubicación "C2-03" es "C2": agrupa lo que está junto. */
export function estanteriaDe(ubicacion) {
  const u = String(ubicacion ?? "").trim().toUpperCase();
  if (!u) return null;
  return u.split(/[-\s/]/)[0] || u;
}

const porDescripcion = (a, b) => compararNatural(a.descripcion, b.descripcion) || compararNatural(a.id, b.id);
const porUbicacion = (a, b) => compararNatural(a.ubicacion, b.ubicacion) || porDescripcion(a, b);

/**
 * Agrupa la lista para recorrer el pañol.
 *   modo "ubicacion": por estantería, en orden; lo que no tiene ubicación va al
 *                     final agrupado por rubro.
 *   modo "rubro":     por rubro, en orden alfabético.
 * Devuelve [{ clave, titulo, items }].
 */
export function agruparParaConteo(items = [], modo = "rubro") {
  const grupos = new Map();
  const meter = (clave, titulo, orden, item) => {
    if (!grupos.has(clave)) grupos.set(clave, { clave, titulo, orden, items: [] });
    grupos.get(clave).items.push(item);
  };
  for (const item of items) {
    const est = modo === "ubicacion" ? estanteriaDe(item.ubicacion) : null;
    if (est) {
      meter(`u:${est}`, `Estantería ${est}`, `0:${est}`, item);
    } else {
      const rubro = item.rubro || "Sin rubro";
      const titulo = modo === "ubicacion" ? `Sin ubicación · ${rubro}` : rubro;
      meter(`r:${rubro}`, titulo, `1:${item.rubro ? rubro : "￿"}`, item);
    }
  }
  return [...grupos.values()]
    .sort((a, b) => compararNatural(a.orden, b.orden))
    .map((g) => ({
      clave: g.clave,
      titulo: g.titulo,
      items: [...g.items].sort(g.clave.startsWith("u:") ? porUbicacion : porDescripcion),
    }));
}

/** Por defecto se agrupa por ubicación sólo si la mayoría ya la tiene cargada. */
export function modoAgrupadoPorDefecto(items = []) {
  if (!items.length) return "rubro";
  const conUbicacion = items.filter((i) => String(i.ubicacion ?? "").trim()).length;
  return conUbicacion / items.length >= 0.5 ? "ubicacion" : "rubro";
}

// ── Estado del conteo de hoy ───────────────────────────────────────────────

/**
 * Lo que ya se contó hoy, por material: el último conteo gana (un reconteo
 * reemplaza al anterior). movimientos: filas de consumibles_movimientos.
 * Devuelve Map material_id → { contado, teorico, diferencia, at, por, veces }.
 */
export function estadoConteoDeHoy(movimientos = []) {
  const mapa = new Map();
  const ordenados = movimientos
    .filter((m) => m.tipo === "inventario" && !m.anulado_at)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  for (const m of ordenados) {
    const previo = mapa.get(m.material_id);
    mapa.set(m.material_id, {
      contado: num(m.contado) ?? 0,
      teorico: num(m.teorico) ?? 0,
      diferencia: num(m.cantidad) ?? 0,
      at: m.created_at,
      por: m.created_by ?? null,
      veces: (previo?.veces ?? 0) + 1,
    });
  }
  return mapa;
}

/** Stock al empezar el día: el de ahora menos lo que se movió hoy. */
export function stockAlInicioDelDia(stockActual, movimientosDeHoy = []) {
  const hoy = movimientosDeHoy
    .filter((m) => !m.anulado_at)
    .reduce((s, m) => s + (num(m.cantidad) ?? 0), 0);
  return (num(stockActual) ?? 0) - hoy;
}

/**
 * Cantidad final de un conteo.
 *   "reemplazar": lo que se contó ahora es el total.
 *   "sumar":      el producto estaba en dos lugares; se suma a lo ya contado hoy.
 */
export function cantidadFinalDeConteo({ contadoAhora, modo = "reemplazar", contadoAntesHoy = 0 }) {
  const ahora = num(contadoAhora);
  if (ahora == null || ahora < 0) return null;
  if (modo === "sumar") return Math.round(((num(contadoAntesHoy) ?? 0) + ahora) * 1000) / 1000;
  return ahora;
}

/**
 * Piezas a partir del peso del cajón. Si se pesó con el envase, se resta su
 * peso. Devuelve { netos, piezas } o null si no alcanza para calcular.
 */
export function piezasPorPeso({ gramosTotales, gramosEnvase = 0, pesoUnitarioG }) {
  const total = num(gramosTotales);
  const envase = num(gramosEnvase) ?? 0;
  const pu = num(pesoUnitarioG);
  if (total == null || total <= 0 || envase < 0 || envase > total) return null;
  const netos = total - envase;
  if (!pu || pu <= 0) return { netos, piezas: null };
  return { netos, piezas: Math.round(netos / pu) };
}

// ── "Contar hoy": el conteo cíclico ────────────────────────────────────────

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

/**
 * Los productos a contar hoy. Primero los de stock negativo (algo no se
 * registró), y después mitad y mitad entre los que más salen y los que hace
 * más que no se cuentan.
 *
 * Usa sólo datos de ANTES de hoy (stock al inicio del día, retiros y conteos
 * anteriores): así la lista no cambia a medida que se cuenta y los dos
 * celulares ven la misma.
 *
 *   items:   [{ id, descripcion, ubicacion, stockInicioDia }]
 *   retiros: [{ material_id, created_at }]   (se miran los últimos 30 días)
 *   conteos: [{ material_id, created_at }]   (tipo inventario)
 * Devuelve [{ id, motivo, razon }] con razon = negativo | movimiento | antiguedad.
 */
export function sugerirConteoDiario({ items = [], retiros = [], conteos = [], hoy = new Date(), cantidad = 10 } = {}) {
  const inicioHoy = inicioDelDia(hoy).getTime();
  const desde30 = inicioHoy - 30 * DIA_MS;

  const salidas = new Map();
  for (const r of retiros) {
    const t = new Date(r.created_at).getTime();
    if (t >= desde30 && t < inicioHoy) salidas.set(r.material_id, (salidas.get(r.material_id) ?? 0) + 1);
  }
  const ultimoConteo = new Map();
  for (const c of conteos) {
    const t = new Date(c.created_at).getTime();
    if (t >= inicioHoy) continue;
    if (!ultimoConteo.has(c.material_id) || ultimoConteo.get(c.material_id) < t) ultimoConteo.set(c.material_id, t);
  }
  const diasSinContar = (id) => {
    const t = ultimoConteo.get(id);
    return t == null ? Infinity : Math.floor((inicioHoy - inicioDelDia(t).getTime()) / DIA_MS);
  };
  const desempate = (a, b) => compararNatural(a.ubicacion, b.ubicacion) || porDescripcion(a, b);

  const elegidos = [];
  const usados = new Set();
  const tomar = (item, razon, motivo) => {
    if (elegidos.length >= cantidad || usados.has(item.id)) return false;
    usados.add(item.id);
    elegidos.push({ id: item.id, razon, motivo });
    return true;
  };

  // 1. Negativos: el más negativo primero.
  items
    .filter((i) => (num(i.stockInicioDia) ?? 0) < 0)
    .sort((a, b) => num(a.stockInicioDia) - num(b.stockInicioDia) || desempate(a, b))
    .forEach((i) => tomar(i, "negativo", "Stock negativo: algo salió sin registrar"));

  // 2. Los que más salen, si no se contaron en la última semana.
  const movidos = items
    .filter((i) => (salidas.get(i.id) ?? 0) > 0 && diasSinContar(i.id) >= 7)
    .sort((a, b) => (salidas.get(b.id) - salidas.get(a.id)) || desempate(a, b));
  // 3. Los que hace más que no se cuentan (nunca contados primero).
  const viejos = [...items].sort((a, b) => {
    const da = diasSinContar(a.id);
    const db = diasSinContar(b.id);
    if (da !== db) return da === Infinity ? -1 : db === Infinity ? 1 : db - da;
    return desempate(a, b);
  });

  const motivoViejo = (i) => {
    const d = diasSinContar(i.id);
    return d === Infinity ? "Nunca se contó" : `No se cuenta hace ${plural(d, "día", "días")}`;
  };
  const cupoMovidos = Math.ceil((cantidad - elegidos.length) / 2);
  let tomadosMovidos = 0;
  for (const i of movidos) {
    if (tomadosMovidos >= cupoMovidos) break;
    if (tomar(i, "movimiento", `Sale mucho: ${plural(salidas.get(i.id), "retiro", "retiros")} en 30 días`)) tomadosMovidos += 1;
  }
  for (const i of viejos) {
    if (elegidos.length >= cantidad) break;
    tomar(i, "antiguedad", motivoViejo(i));
  }
  return elegidos;
}

// ── Unidades ───────────────────────────────────────────────────────────────

const PLURALES = {
  unidad: "unidades", par: "pares", rollo: "rollos", litro: "litros", metro: "metros",
  pack: "packs", caja: "cajas", bolsa: "bolsas", kg: "kg", g: "g", lt: "lt", m: "m",
  hoja: "hojas", pieza: "piezas", juego: "juegos", tubo: "tubos", lata: "latas", balde: "baldes",
};

/** "unidad" → "unidades" cuando hay más de una (o ninguna). */
export function unidadEnTexto(unidad, cantidad) {
  const u = String(unidad || "unidad").trim().toLowerCase();
  const n = num(cantidad);
  if (n === 1) return u;
  return PLURALES[u] ?? (/[aeiou]$/.test(u) ? `${u}s` : u);
}

/** Las unidades que se pueden partir (litros, metros, kilos) llevan coma. */
export function admiteDecimales(unidad) {
  return /^(litros?|lts?|l|metros?|m|mts?|kg|kilos?|kilogramos?)$/i.test(String(unidad || "").trim());
}

// ── Alta rápida ────────────────────────────────────────────────────────────

export const UNIDADES = ["unidad", "par", "rollo", "litro", "metro", "kg", "pack", "caja"];

/** Arma un ítem con la forma de fetchCatalogo para usarlo sin recargar todo. */
export function itemDesdeAlta({ material, config }, { rubro = null, ubicacion = null } = {}) {
  return {
    id: material.id,
    descripcion: material.descripcion,
    alias: null,
    codigo: null,
    rubro,
    rubroPadre: "Consumibles",
    categoriaId: material.categoria_id,
    imagenUrl: null,
    ubicacion: ubicacion || null,
    stockMinimo: null,
    pesoUnitarioG: null,
    pesoCalibradoAt: null,
    proveedor: null,
    activo: true,
    config,
    codigoEtiqueta: config?.codigo_etiqueta ?? null,
    formaEntrega: config?.forma_entrega ?? "unidad",
    unidad: config?.unidad_entrega ?? material.unidad_medida ?? "unidad",
    costoUnitarioArs: null,
    enMostrador: true,
    stock: null,
    ultimoConteoAt: null,
    stockPorSede: {},
    codigos: [config?.codigo_etiqueta].filter(Boolean),
  };
}
