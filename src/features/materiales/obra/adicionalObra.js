// Las ampliaciones comparten material, pero cada compra conserva cantidades y
// recepción propias. Los adicionales anteriores mantienen su clave histórica.
export function adicionalSnapshotKey(row) {
  if (row?.source !== "adicional_obra") return null;
  const id = row.snapshotId || row.obra_snapshot_id || row.id;
  return id ? `adicional:${id}` : null;
}

export function cantidadPedidoValida(value) {
  if (value == null || String(value).trim() === "") return false;
  const cantidad = Number(String(value).replace(",", "."));
  return Number.isFinite(cantidad) && cantidad > 0;
}
