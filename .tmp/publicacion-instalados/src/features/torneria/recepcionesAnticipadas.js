// Las cantidades siguen la misma regla que el pedido y la base: una pieza
// usa cantidad del renglón; un lote, cantidades de su receta de catálogo.
export function materialesRequeridos(item) {
  const lista = (item.materiales || []).filter((row) => row.material_id);
  if (lista.length) return lista.map((row) => ({
    materialId: row.material_id,
    material: row.material,
    cantidad: Number(lista.length === 1 ? item.cantidad : row.cantidad) || 0,
  }));
  return item.material_id ? [{
    materialId: item.material_id, material: item.material, cantidad: Number(item.cantidad) || 0,
  }] : [];
}

export function recepcionAnticipada(item) {
  const recibidos = new Map();
  for (const row of item.recepciones_panol || []) {
    recibidos.set(row.material_id, (recibidos.get(row.material_id) || 0) + Number(row.cantidad || 0));
  }
  const materiales = materialesRequeridos(item).map((row) => {
    const recibida = Math.min(row.cantidad, recibidos.get(row.materialId) || 0);
    return { ...row, recibida, faltante: Math.max(0, row.cantidad - recibida) };
  });
  return {
    materiales,
    tieneIngreso: materiales.some((row) => row.recibida > 0),
    completa: materiales.length > 0 && materiales.every((row) => row.faltante === 0),
  };
}

export function cantidadPendienteDeCompra(item, materialId) {
  return recepcionAnticipada(item).materiales.find((row) => row.materialId === materialId)?.faltante
    ?? Number(item.cantidad);
}
