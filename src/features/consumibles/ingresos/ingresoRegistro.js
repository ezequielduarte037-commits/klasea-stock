import { calcularLinea } from "./ingresoCalculos.js";

/** La foto se conserva en el borrador antes de enviar: un corte no genera otros ids. */
export function prepararIngreso(borrador, sede, id = () => crypto.randomUUID()) {
  if (borrador.envio) return borrador.envio;
  if (!["Chubut", "Pampa"].includes(sede)) throw new Error("Elegí la sede del pañol.");
  if (!borrador.lineas?.length || borrador.lineas.some((l) => !calcularLinea(l).valida)) {
    throw new Error("Revisá cantidades, factores y costos antes de confirmar.");
  }
  const lote = id();
  const nota = [
    borrador.proveedor?.trim() ? `Proveedor: ${borrador.proveedor.trim()}` : null,
    borrador.pedidoId ? "Recibido contra un pedido a Compras" : null,
    borrador.nota?.trim(),
  ].filter(Boolean).join(" · ") || null;
  return { filas: borrador.lineas.map((l) => {
    const calculo = calcularLinea(l);
    return { id: id(), material_id: l.materialId, sede, tipo: "ingreso", cantidad: calculo.cantidadEntrega,
      costo_unitario_ars: calculo.costoEntrega, remito: borrador.remito?.trim() || null, nota, lote, origen: "ingreso" };
  }) };
}
