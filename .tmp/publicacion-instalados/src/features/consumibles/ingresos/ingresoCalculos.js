/**
 * Cálculos de Ingresos (remitos del proveedor). Funciones puras para probar
 * con `node --test` (ingresoCalculos.test.mjs).
 *
 * Una línea se carga como viene en el remito: N unidades de compra (cajas,
 * bolsas) × factor = unidades de entrega, que es en lo que se cuenta el stock.
 * El costo se escribe por unidad de compra (como figura en la factura) y se
 * guarda por unidad de entrega.
 */

const num = (v) => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const redondear = (x, dec = 4) => Math.round(x * 10 ** dec) / 10 ** dec;

let secuencia = 0;

/** Línea nueva a partir de un ítem del catálogo, con lo que dice su config. */
export function lineaDesdeItem(item, cantidad = 1) {
  const cfg = item.config ?? {};
  const factor = num(cfg.factor_compra) > 0 ? num(cfg.factor_compra) : null;
  const costoEntrega = num(cfg.costo_unitario_ars ?? item.costoUnitarioArs);
  const porCaja = factor != null && factor !== 1;
  secuencia += 1;
  return {
    key: `l${Date.now().toString(36)}${secuencia}`,
    materialId: item.id,
    descripcion: item.descripcion,
    codigoEtiqueta: item.codigoEtiqueta ?? null,
    codigoProveedor: cfg.proveedor_codigo ?? null,
    unidad: item.unidad || "unidad",
    cantidad: String(cantidad),
    porCaja,
    unidadCompra: porCaja ? (cfg.unidad_compra || "caja") : "caja",
    factor: porCaja ? String(factor) : "",
    // Lo que había en la config, para saber si hay que recordarlo.
    factorConfig: factor,
    unidadCompraConfig: cfg.unidad_compra ?? null,
    recordar: true,
    costo: costoEntrega != null ? String(redondear(costoEntrega * (porCaja ? factor : 1), 2)) : "",
    costoEntregaReferencia: costoEntrega,
  };
}

/** Cambiar la presentación conserva el precio por unidad, también sin permiso para verlo. */
export function actualizarLinea(linea, cambio) {
  const nueva = { ...linea, ...cambio };
  const factorAntes = linea.porCaja ? num(linea.factor) : 1;
  const factorDespues = nueva.porCaja ? num(nueva.factor) : 1;
  if ("costo" in cambio) {
    const costo = num(cambio.costo);
    nueva.costoEntregaReferencia = costo != null && factorDespues > 0 ? costo / factorDespues : null;
  } else if ("porCaja" in cambio || "factor" in cambio) {
    // Los borradores anteriores no tienen referencia: se obtiene del precio que muestran.
    const costo = num(linea.costo);
    const referencia = num(linea.costoEntregaReferencia)
      ?? (costo != null && factorAntes > 0 ? costo / factorAntes : null);
    nueva.costoEntregaReferencia = referencia;
    nueva.costo = referencia != null && factorDespues > 0
      ? String(redondear(referencia * factorDespues, 4)) : "";
  }
  if ("porCaja" in cambio) nueva.presentacionPendiente = false;
  return nueva;
}

/** Cantidades y costos de una línea, ya convertidos. */
export function calcularLinea(linea) {
  const cantidad = num(linea.cantidad);
  const factor = linea.porCaja ? num(linea.factor) : 1;
  const costo = num(linea.costo);
  const cantidadEntrega = cantidad != null && factor != null ? redondear(cantidad * factor, 3) : 0;
  const valida = !linea.presentacionPendiente && cantidad != null && cantidad > 0 && factor != null && factor > 0
    && Number.isFinite(cantidadEntrega) && cantidadEntrega > 0 && (costo == null || costo >= 0);
  const costoEntrega = costo != null && factor ? redondear(costo / factor) : null;
  return {
    valida,
    factor: factor ?? null,
    cantidadEntrega,
    costoEntrega,
    subtotal: valida && costo != null ? redondear(cantidad * costo, 2) : null,
  };
}

/** Si se escanea un producto que ya está en el remito, suma uno en vez de repetir la línea. */
export function agregarAlRemito(lineas, item) {
  const i = lineas.findIndex((l) => l.materialId === item.id);
  if (i < 0) return [...lineas, lineaDesdeItem(item)];
  const actual = lineas[i];
  const n = (num(actual.cantidad) ?? 0) + 1;
  return lineas.map((l, k) => (k === i ? { ...l, cantidad: String(n) } : l));
}

/** Cambios de config que hay que guardar para la próxima (unidad de compra y factor). */
export function cambiosDeConfig(linea) {
  if (!linea.porCaja || !linea.recordar) return null;
  const factor = num(linea.factor);
  if (!factor || factor <= 0) return null;
  const unidad = String(linea.unidadCompra || "").trim() || null;
  if (factor === linea.factorConfig && unidad === linea.unidadCompraConfig) return null;
  return { factor_compra: factor, unidad_compra: unidad };
}

export function totalRemito(lineas = []) {
  let total = 0;
  let sinCosto = 0;
  let validas = 0;
  for (const l of lineas) {
    const c = calcularLinea(l);
    if (!c.valida) continue;
    validas += 1;
    if (c.subtotal == null) sinCosto += 1;
    else total += c.subtotal;
  }
  return { total: redondear(total, 2), sinCosto, validas };
}

const limpiarRemito = (r) => String(r ?? "").trim().toUpperCase().replace(/\s+/g, "");

/**
 * Historial agrupado por carga (lote). movimientos: filas de tipo ingreso.
 * Devuelve [{ lote, remito, fecha, nota, filas, total, anulado }], lo más nuevo primero.
 */
export function agruparIngresos(movimientos = []) {
  const grupos = new Map();
  for (const m of movimientos) {
    if (m.tipo && m.tipo !== "ingreso") continue;
    const clave = m.lote || m.id;
    if (!grupos.has(clave)) grupos.set(clave, { lote: clave, remito: m.remito || null, fecha: m.created_at, nota: m.nota || null, filas: [] });
    const g = grupos.get(clave);
    g.filas.push(m);
    if (new Date(m.created_at) < new Date(g.fecha)) g.fecha = m.created_at;
  }
  return [...grupos.values()]
    .map((g) => {
      const activas = g.filas.filter((f) => !f.anulado_at);
      const total = activas.reduce((s, f) => s + (num(f.costo_unitario_ars) != null ? num(f.costo_unitario_ars) * (num(f.cantidad) ?? 0) : 0), 0);
      return { ...g, activas: activas.length, anulado: activas.length === 0, total: redondear(total, 2) };
    })
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
}

/** La carga anterior con el mismo número de remito (sin anular), si la hay. */
export function remitoRepetido(grupos = [], remito) {
  const r = limpiarRemito(remito);
  if (!r) return null;
  return grupos.find((g) => !g.anulado && limpiarRemito(g.remito) === r) ?? null;
}
