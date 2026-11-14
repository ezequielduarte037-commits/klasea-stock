import { lineaDesdeItem } from "./ingresoCalculos.js";
import { estadoDeRenglon } from "../pedidos/pedidosLogica.js";

/**
 * Recibir en Ingresos un pedido hecho en la pestaña Pedidos. Funciones puras
 * para probar con `node --test` (pedidoRecibido.test.mjs).
 *
 * Cada renglón con algo pendiente pasa a una línea de ingreso con lo que falta,
 * en unidades de compra (como se pidió). La línea recuerda su renglón
 * (`pedidoItemId`) y el ingreso lo guarda en el movimiento: así el pedido sabe
 * qué llegó sin otra escritura, y anular el ingreso lo vuelve a dejar pendiente.
 */

const num = (v) => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/** Pedidos confirmados con algún renglón todavía por llegar, con sólo esos renglones. */
export function pedidosPorRecibir(pedidos = [], recibidos = new Map()) {
  return pedidos
    .filter((p) => p.estado === "pedido")
    .map((p) => ({
      ...p,
      items: (p.items ?? [])
        .map((r) => ({ ...r, pendiente: estadoDeRenglon(r, recibidos.get(r.id)).pendiente }))
        .filter((r) => r.pendiente > 0),
    }))
    .filter((p) => p.items.length > 0);
}

/** Líneas de ingreso a partir de los renglones pendientes del pedido. */
export function lineasDePedidoRecibido(pedido, catalogo = []) {
  const porId = new Map(catalogo.map((i) => [i.id, i]));
  const lineas = [];
  let sinCatalogo = 0;
  for (const renglon of pedido?.items ?? []) {
    const item = porId.get(renglon.material_id);
    const pendiente = num(renglon.pendiente ?? renglon.cantidad);
    if (!item || !(pendiente > 0)) {
      sinCatalogo += 1;
      continue;
    }
    const factor = num(renglon.factor) > 0 ? num(renglon.factor) : 1;
    const base = lineaDesdeItem(item, pendiente);
    // Se recibe como se pidió: mismas cajas y mismo factor que el renglón.
    const porCaja = factor !== 1;
    const costoCompra = num(renglon.costo_compra_ars);
    const costoEntrega = costoCompra != null ? costoCompra / factor : base.costoEntregaReferencia;
    lineas.push({
      ...base,
      porCaja,
      unidadCompra: porCaja ? (renglon.unidad_compra || base.unidadCompra) : base.unidadCompra,
      factor: porCaja ? String(factor) : "",
      costo: costoEntrega != null ? String(Math.round(costoEntrega * factor * 10000) / 10000) : "",
      costoEntregaReferencia: costoEntrega,
      pedidoItemId: renglon.id,
      pedidoCantidad: pendiente,
    });
  }
  return { lineas, sinCatalogo };
}
