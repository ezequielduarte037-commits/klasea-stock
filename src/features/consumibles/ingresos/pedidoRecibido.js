import { calcularLinea, lineaDesdeItem } from "./ingresoCalculos.js";

/**
 * Recibir un pedido a Compras en Ingresos. Funciones puras para probar con
 * `node --test` (pedidoRecibido.test.mjs).
 *
 * Cada renglón del pedido pasa a una línea de ingreso con la cantidad que se
 * pidió (en unidades de compra, igual que en el pedido). La línea recuerda qué
 * renglón del pedido es, para cerrarlo cuando llega completo.
 */

const num = (v) => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/** Líneas de ingreso a partir de los renglones abiertos del pedido. */
export function lineasDePedidoRecibido(pedido, catalogo = []) {
  const porId = new Map(catalogo.map((i) => [i.id, i]));
  const lineas = [];
  let sinCatalogo = 0;
  for (const renglon of pedido?.items ?? []) {
    const item = porId.get(renglon.material_id);
    const pedida = num(renglon.quantity);
    if (!item || !(pedida > 0)) {
      sinCatalogo += 1;
      continue;
    }
    lineas.push({ ...lineaDesdeItem(item, pedida), pedidoItemId: renglon.id, pedidoCantidad: pedida });
  }
  return { lineas, sinCatalogo };
}

/** Renglones del pedido que llegaron completos: cantidad cargada ≥ la pedida. */
export function renglonesCompletos(lineas = []) {
  return lineas
    .filter((l) => l.pedidoItemId && calcularLinea(l).valida && (num(l.cantidad) ?? 0) >= (l.pedidoCantidad ?? Infinity))
    .map((l) => l.pedidoItemId);
}
