/**
 * Pedidos de consumibles al proveedor (Rebollar). Funciones puras para probar
 * con `node --test` (pedidosLogica.test.mjs).
 *
 * El pedido se arma en unidades de compra (cajas, rollos), como lo lee el
 * proveedor. Lo recibido llega en unidades de entrega (lo que suma el stock) y
 * se pasa a unidades de compra con el factor guardado al pedir.
 */

const num = (v) => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const redondear = (x, dec = 3) => Math.round(x * 10 ** dec) / 10 ** dec;

export const PROVEEDOR_POR_DEFECTO = "Rebollar";

/** Datos de un renglón nuevo del carrito, con lo que dice la config del producto. */
export function renglonDesdeItem(item, cantidad = 1) {
  const cfg = item?.config ?? {};
  const factor = num(cfg.factor_compra) > 0 ? num(cfg.factor_compra) : 1;
  const costoEntrega = num(cfg.costo_unitario_ars ?? item?.costoUnitarioArs);
  return {
    material_id: item.id,
    cantidad: num(cantidad) > 0 ? num(cantidad) : 1,
    unidad_compra: String(cfg.unidad_compra || "").trim() || (factor === 1 ? item.unidad || "unidad" : "caja"),
    factor,
    costo_compra_ars: costoEntrega != null ? redondear(costoEntrega * factor, 2) : null,
  };
}

/**
 * Cómo está un renglón: cuánto se pidió y cuánto llegó, en unidades de compra.
 * recibidoEntrega: suma de los ingresos vigentes del renglón.
 */
export function estadoDeRenglon(renglon, recibidoEntrega = 0) {
  const pedido = num(renglon.cantidad) ?? 0;
  const factor = num(renglon.factor) > 0 ? num(renglon.factor) : 1;
  const recibido = redondear((num(recibidoEntrega) ?? 0) / factor);
  const pendiente = redondear(Math.max(0, pedido - recibido));
  return { pedido, recibido, pendiente, completo: pendiente <= 0 };
}

/**
 * Estado que se muestra del pedido. borrador = el carrito; después, según lo
 * que llegó: "esperando", "parcial" o "completo"; "cerrado" y "anulado" son a mano.
 */
export function estadoDePedido(pedido, recibidos = new Map()) {
  if (pedido.estado !== "pedido") return pedido.estado;
  const renglones = (pedido.items ?? []).map((r) => estadoDeRenglon(r, recibidos.get(r.id)));
  if (!renglones.length) return "esperando";
  if (renglones.every((r) => r.completo)) return "completo";
  if (renglones.some((r) => r.recibido > 0)) return "parcial";
  return "esperando";
}

export const ETIQUETA_ESTADO = {
  borrador: "Carrito",
  esperando: "Esperando",
  parcial: "Llegó una parte",
  completo: "Llegó todo",
  cerrado: "Cerrado",
  anulado: "Anulado",
};

/** Total estimado (sin IVA) y renglones sin precio. */
export function totalDePedido(items = []) {
  let total = 0;
  let sinCosto = 0;
  for (const r of items) {
    const c = num(r.costo_compra_ars);
    const q = num(r.cantidad) ?? 0;
    if (c == null) sinCosto += 1;
    else total += c * q;
  }
  return { total: redondear(total, 2), sinCosto };
}

/** Los renglones con lo que hace falta para mostrarlos (descripción, códigos). */
export function renglonesParaMostrar(pedido, catalogoPorId = new Map(), recibidos = new Map()) {
  return (pedido.items ?? [])
    .map((r) => {
      const item = catalogoPorId.get(r.material_id) ?? null;
      const factor = num(r.factor) > 0 ? num(r.factor) : 1;
      return {
        ...r,
        ...estadoDeRenglon(r, recibidos.get(r.id)),
        factor,
        item,
        descripcion: item?.descripcion || "Producto sin ficha",
        unidad: item?.unidad || "unidad",
        codigoProveedor: String(item?.config?.proveedor_codigo || "").trim() || null,
        codigoEtiqueta: item?.codigoEtiqueta ?? null,
        subtotal: num(r.costo_compra_ars) != null ? redondear(num(r.costo_compra_ars) * (num(r.cantidad) ?? 0), 2) : null,
      };
    })
    .sort((a, b) => String(a.descripcion).localeCompare(String(b.descripcion), "es", { numeric: true }));
}

const fmt = (n) => (num(n) ?? 0).toLocaleString("es-AR", { maximumFractionDigits: 2 });
const fmtPesos = (n) => `$ ${(num(n) ?? 0).toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
const fechaCorta = (f) => new Date(f).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", year: "numeric" });

/** "4 cajas x100" o "7 unidades": como lo lee el proveedor. */
export function cantidadTexto(r) {
  const unidad = r.unidad_compra || r.unidad || "unidad";
  return `${fmt(r.cantidad)} ${unidad}${r.factor > 1 ? ` x${fmt(r.factor)}` : ""}`;
}

/** Texto para mandar por WhatsApp: cantidad, código del proveedor y descripción. */
export function textoWhatsApp({ pedido, renglones, fecha = new Date() }) {
  const { total, sinCosto } = totalDePedido(renglones);
  return [
    `*Pedido de consumibles · Klase A · Pañol ${pedido.sede}*`,
    `Proveedor: ${pedido.proveedor}${pedido.numero ? ` · Pedido N° ${pedido.numero}` : ""} · ${fechaCorta(pedido.pedido_at || fecha)}`,
    "",
    ...renglones.map((r) => `• ${cantidadTexto(r)} — ${r.codigoProveedor ? `[${r.codigoProveedor}] ` : ""}${r.descripcion}`),
    "",
    total > 0 ? `Total estimado: ${fmtPesos(total)} sin IVA${sinCosto ? ` (${sinCosto} sin precio)` : ""}` : null,
    pedido.nota ? `Nota: ${pedido.nota}` : null,
  ].filter((x) => x != null).join("\n").trim();
}

/** Filas para la planilla (descargarXlsx de compras). */
export function filasExcel(renglones = []) {
  const { total } = totalDePedido(renglones);
  return [
    ["Código proveedor", "Descripción", "Cantidad", "Unidad de compra", "Equivale a", "Costo unit. (sin IVA)", "Subtotal"],
    ...renglones.map((r) => [
      r.codigoProveedor || "",
      r.descripcion,
      num(r.cantidad) ?? 0,
      `${r.unidad_compra || r.unidad}${r.factor > 1 ? ` x${fmt(r.factor)}` : ""}`,
      `${fmt((num(r.cantidad) ?? 0) * r.factor)} ${r.unidad}`,
      num(r.costo_compra_ars) ?? "",
      r.subtotal ?? "",
    ]),
    ["", "Total", "", "", "", "", total || ""],
  ];
}
