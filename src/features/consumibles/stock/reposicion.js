/**
 * Reposición de consumibles: cuánto pedir y cuándo. Funciones puras (sin
 * Supabase ni React) para probarlas con `node --test` (reposicion.test.mjs).
 *
 * La primera semana el stock mínimo se carga a mano. Cuando haya consumo
 * registrado, `minimoSugerido` propone uno:
 *
 *   mínimo = consumo diario promedio × (días de entrega + días de seguridad)
 *
 * Rebollar entrega en el día o al siguiente; los días por defecto son una
 * primera aproximación y se ajustan cuando haya pedidos recibidos medidos.
 */

import { unidadEnTexto } from "../conteo/conteoCalculos.js";

export const DIAS_ENTREGA_POR_DEFECTO = 3;
export const DIAS_SEGURIDAD_POR_DEFECTO = 3;
/** Con menos días de registro el promedio es ruido: no se sugiere mínimo. */
export const DIAS_MINIMOS_DE_HISTORIA = 7;

const DIA_MS = 24 * 60 * 60 * 1000;

const num = (v) => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
// Redondeo hacia arriba sin que 3.0000000004 pase a 4.
const techo = (x) => Math.ceil(x - 1e-9);
const redondear = (x, dec = 3) => Math.round(x * 10 ** dec) / 10 ** dec;

/** Hay que reponer cuando el stock está en el mínimo o por debajo. */
export function necesitaReponer({ stock, minimo }) {
  const m = num(minimo);
  if (!m || m <= 0) return false;
  return (num(stock) ?? 0) <= m;
}

/**
 * Cuánto falta, en unidad de entrega: hasta el máximo, o hasta el doble del
 * mínimo si no hay máximo (o si el máximo cargado no llega ni al mínimo).
 */
export function cantidadAReponer({ stock, minimo, maximo }) {
  if (!necesitaReponer({ stock, minimo })) return 0;
  const s = num(stock) ?? 0;
  const min = num(minimo);
  const max = num(maximo);
  const objetivo = max != null && max > min ? max : 2 * min;
  return redondear(Math.max(0, objetivo - s));
}

/**
 * Pasa una cantidad en unidad de entrega a unidades de compra, hacia arriba y
 * al múltiplo del lote. factor = unidades de entrega por unidad de compra
 * (caja x100 → 100); lote = mínimo de compra, en unidades de compra.
 */
export function aUnidadesDeCompra(cantidadEntrega, { factor, lote } = {}) {
  const c = num(cantidadEntrega) ?? 0;
  if (c <= 0) return { unidadesCompra: 0, cantidadEntrega: 0 };
  const f = num(factor) > 0 ? num(factor) : 1;
  const l = num(lote) > 0 ? num(lote) : 1;
  // Un lote puede ser fraccionado (0,5 kg): redondear antes a una unidad
  // completa hacía comprar de más aunque el proveedor admita medios lotes.
  const unidades = redondear(techo(c / (f * l)) * l);
  return { unidadesCompra: unidades, cantidadEntrega: redondear(unidades * f) };
}

/** Un renglón del pedido sugerido, o null si ese producto no hace falta. */
export function lineaDePedido(item, sede) {
  const cfg = item.config ?? {};
  // Sin contar se pide como si no hubiera (igual que antes), pero se avisa.
  const crudo = num(item.stockPorSede?.[sede]?.stock ?? item.stock);
  const stock = crudo ?? 0;
  const minimo = num(item.stockMinimo);
  const maximo = num(cfg.stock_maximo);
  const reponer = cantidadAReponer({ stock, minimo, maximo });
  if (!(reponer > 0)) return null;
  const factor = num(cfg.factor_compra) > 0 ? num(cfg.factor_compra) : 1;
  const lote = num(cfg.lote_compra) > 0 ? num(cfg.lote_compra) : 1;
  const { unidadesCompra, cantidadEntrega } = aUnidadesDeCompra(reponer, { factor, lote });
  const costoEntrega = num(cfg.costo_unitario_ars ?? item.costoUnitarioArs);
  const costoCompra = costoEntrega != null ? redondear(costoEntrega * factor, 2) : null;
  return {
    materialId: item.id,
    descripcion: item.descripcion,
    imagenUrl: item.imagenUrl || item.imagen_url || null,
    codigoEtiqueta: item.codigoEtiqueta ?? null,
    proveedor: String(cfg.proveedor_nombre || "").trim() || null,
    codigoProveedor: String(cfg.proveedor_codigo || "").trim() || null,
    unidad: item.unidad || "unidad",
    unidadCompra: String(cfg.unidad_compra || "").trim() || (factor === 1 ? item.unidad || "unidad" : null),
    factor,
    lote,
    stock,
    sinContar: crudo == null,
    minimo,
    maximo,
    reponer,
    unidadesCompra,
    cantidadEntrega,
    costoCompra,
    subtotal: costoCompra != null ? redondear(costoCompra * unidadesCompra, 2) : null,
  };
}

/** Cambia las unidades de compra de un renglón (se edita a mano) y recalcula. */
export function conUnidadesDeCompra(linea, unidadesCompra) {
  const u = Math.max(0, techo(num(unidadesCompra) ?? 0));
  return {
    ...linea,
    unidadesCompra: u,
    cantidadEntrega: redondear(u * linea.factor),
    subtotal: linea.costoCompra != null ? redondear(linea.costoCompra * u, 2) : null,
  };
}

const SIN_PROVEEDOR = "Sin proveedor";

/** El pedido sugerido de una sede, agrupado por proveedor (Rebollar primero). */
export function armarPedidoSugerido(items = [], sede) {
  const grupos = new Map();
  for (const item of items) {
    const linea = lineaDePedido(item, sede);
    if (!linea) continue;
    const prov = linea.proveedor || SIN_PROVEEDOR;
    if (!grupos.has(prov)) grupos.set(prov, []);
    grupos.get(prov).push(linea);
  }
  const peso = (p) => (/rebollar/i.test(p) ? 0 : p === SIN_PROVEEDOR ? 2 : 1);
  return [...grupos.entries()]
    .map(([proveedor, lineas]) => ({
      proveedor,
      sinProveedor: proveedor === SIN_PROVEEDOR,
      lineas: lineas.sort((a, b) => String(a.descripcion).localeCompare(String(b.descripcion), "es", { numeric: true })),
    }))
    .sort((a, b) => peso(a.proveedor) - peso(b.proveedor) || a.proveedor.localeCompare(b.proveedor, "es"));
}

/** Total de los renglones con costo y cuántos quedaron sin costo. */
export function totalDePedido(lineas = []) {
  let total = 0;
  let sinCosto = 0;
  for (const l of lineas) {
    if (!(l.unidadesCompra > 0)) continue;
    if (l.subtotal == null) sinCosto += 1;
    else total += l.subtotal;
  }
  return { total: redondear(total, 2), sinCosto };
}

// ── Consumo y mínimo sugerido ──────────────────────────────────────────────

/**
 * Consumo por material en una ventana: retiros y mermas suman, devoluciones
 * restan. movimientos: [{ material_id, tipo, cantidad (con signo), created_at, sede? }].
 */
export function consumoPorMaterial(movimientos = [], { desde = null, hasta = null, sede = null } = {}) {
  const d = desde != null ? new Date(desde).getTime() : -Infinity;
  const h = hasta != null ? new Date(hasta).getTime() : Infinity;
  const out = new Map();
  for (const m of movimientos) {
    if (!["retiro", "devolucion", "merma"].includes(m.tipo) || m.anulado_at) continue;
    if (sede && m.sede && m.sede !== sede) continue;
    const t = new Date(m.created_at).getTime();
    if (t < d || t >= h) continue;
    out.set(m.material_id, redondear((out.get(m.material_id) ?? 0) - (num(m.cantidad) ?? 0)));
  }
  return out;
}

/** Promedio por día; null si no hay días para promediar. */
export function consumoDiarioPromedio(consumo, dias) {
  const c = num(consumo);
  const d = num(dias);
  if (c == null || !d || d <= 0) return null;
  return Math.max(0, c) / d;
}

/** Días con registro: desde el primer conteo (inventario inicial) hasta hoy, con tope. */
export function diasDeHistoria(primerRegistro, hoy = new Date(), tope = 30) {
  if (!primerRegistro) return 0;
  const dias = Math.floor((new Date(hoy).getTime() - new Date(primerRegistro).getTime()) / DIA_MS);
  return Math.max(0, Math.min(tope, dias));
}

/**
 * Mínimo sugerido = consumo diario × (días de entrega + días de seguridad),
 * redondeado hacia arriba. null si no hay consumo o falta historia.
 */
export function minimoSugerido({ consumoDiario, diasEntrega = DIAS_ENTREGA_POR_DEFECTO, diasSeguridad = DIAS_SEGURIDAD_POR_DEFECTO, diasHistoria = Infinity } = {}) {
  const c = num(consumoDiario);
  if (!c || c <= 0) return null;
  if (diasHistoria < DIAS_MINIMOS_DE_HISTORIA) return null;
  return techo(c * ((num(diasEntrega) ?? 0) + (num(diasSeguridad) ?? 0)));
}

// ── Exportar ───────────────────────────────────────────────────────────────

const fmt = (n) => (num(n) ?? 0).toLocaleString("es-AR", { maximumFractionDigits: 2 });
const fechaCorta = (f) => new Date(f).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", year: "numeric" });

/** "4 cajas x100" o "7 unidades": cómo lo lee el proveedor. */
const cantidadDeCompraTexto = (l) => {
  if (l.unidadCompra && l.factor > 1) return `${fmt(l.unidadesCompra)} ${unidadEnTexto(l.unidadCompra, l.unidadesCompra)} x${fmt(l.factor)}`;
  return `${fmt(l.unidadesCompra)} ${unidadEnTexto(l.unidadCompra || l.unidad, l.unidadesCompra)}`;
};

const unidadDeCompraTexto = (l) => {
  if (l.unidadCompra && l.factor > 1) return `${l.unidadCompra} x${fmt(l.factor)}`;
  return l.unidadCompra || l.unidad;
};

/** Texto para pegar en WhatsApp: cantidad, unidad de compra, código y descripción. Sin precios. */
export function textoWhatsApp(grupo, { sede, fecha = new Date() } = {}) {
  const lineas = grupo.lineas.filter((l) => l.unidadesCompra > 0);
  const renglones = lineas.map((l) => {
    const codigo = l.codigoProveedor ? `[${l.codigoProveedor}] ` : "";
    return `• ${cantidadDeCompraTexto(l)} — ${codigo}${l.descripcion}`;
  });
  return [
    `*Pedido de consumibles · Klase A · Pañol ${sede}*`,
    `${grupo.sinProveedor ? "Sin proveedor asignado" : `Proveedor: ${grupo.proveedor}`} · ${fechaCorta(fecha)}`,
    "",
    ...renglones,
  ].filter((x) => x != null).join("\n").trim();
}

/** Filas para la planilla (descargarXlsx de compras). */
/** Filas para la planilla. Sin precios (`conPrecios: false`) quedan afuera costo, subtotal y total. */
export function filasExcel(grupo, { conPrecios = true } = {}) {
  const encabezado = ["Código proveedor", "Descripción", "Cantidad", "Unidad de compra", "Equivale a", "Stock", "Mínimo", "Máximo", "Costo unit. (sin IVA)", "Subtotal"];
  const filas = grupo.lineas
    .filter((l) => l.unidadesCompra > 0)
    .map((l) => [
      l.codigoProveedor || "",
      l.descripcion,
      l.unidadesCompra,
      unidadDeCompraTexto(l),
      `${fmt(l.cantidadEntrega)} ${unidadEnTexto(l.unidad, l.cantidadEntrega)}`,
      l.sinContar ? "sin contar" : l.stock,
      l.minimo ?? "",
      l.maximo ?? "",
      l.costoCompra ?? "",
      l.subtotal ?? "",
    ]);
  if (!conPrecios) return [encabezado.slice(0, 8), ...filas.map((f) => f.slice(0, 8))];
  const { total } = totalDePedido(grupo.lineas);
  return [encabezado, ...filas, ["", "Total", "", "", "", "", "", "", "", total || ""]];
}
