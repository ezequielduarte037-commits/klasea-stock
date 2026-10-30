import { calcularLinea } from "./ingresoCalculos.js";

/** La foto se conserva en el borrador antes de enviar: un corte no genera otros ids. */
export function prepararIngreso(borrador, sede, id = () => crypto.randomUUID()) {
  if (borrador.envio) return borrador.envio;
  if (!["Chubut", "Pampa"].includes(sede)) throw new Error("Elegí la sede del pañol.");
  if (borrador.sinEmparejar?.length) throw new Error("Resolvé o descartá los renglones para revisar antes de confirmar.");
  if (!borrador.lineas?.length || borrador.lineas.some((l) => !calcularLinea(l).valida)) {
    throw new Error("Revisá cantidades, factores y costos antes de confirmar.");
  }
  const lote = id();
  const nota = [
    borrador.proveedor?.trim() ? `Proveedor: ${borrador.proveedor.trim()}` : null,
    borrador.pedidoId && borrador.pedidoTitulo ? borrador.pedidoTitulo : null,
    borrador.nota?.trim(),
  ].filter(Boolean).join(" · ") || null;
  return { filas: borrador.lineas.map((l) => {
    const calculo = calcularLinea(l);
    const fila = { id: id(), material_id: l.materialId, sede, tipo: "ingreso", cantidad: calculo.cantidadEntrega,
      costo_unitario_ars: calculo.costoEntrega, remito: borrador.remito?.trim() || null, nota, lote, origen: "ingreso" };
    // Enganche al renglón del pedido: de acá sale qué llegó y qué falta.
    if (borrador.pedidoId && l.pedidoItemId) fila.pedido_item_id = l.pedidoItemId;
    return fila;
  }) };
}
