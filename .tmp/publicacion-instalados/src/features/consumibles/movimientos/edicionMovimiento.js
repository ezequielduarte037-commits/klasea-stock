const redondear = (n) => Math.round(n * 1000) / 1000;

/** Una fila editable por producto, aunque el retiro esté repartido entre obras. */
export function lineasParaEdicion(filas = []) {
  const productos = new Map();
  for (const f of filas.filter((r) => !r.anulado_at)) {
    const anterior = productos.get(f.material_id);
    const cantidad = redondear((anterior?.cantidad || 0) + Math.abs(Number(f.cantidad) || 0));
    const material = Array.isArray(f.material) ? f.material[0] : f.material;
    productos.set(f.material_id, { materialId: f.material_id, item: anterior?.item || { ...material, imagenUrl: material?.imagen_url }, cantidad, canje: f.canje || null });
  }
  return [...productos.values()];
}

export function agregarProductoEdicion(lineas, item) {
  const existe = lineas.some((l) => l.materialId === item.id);
  return existe
    ? lineas.map((l) => l.materialId === item.id ? { ...l, cantidad: redondear((cantidadEdicion(l.cantidad) || 0) + 1) } : l)
    : [...lineas, { materialId: item.id, item, cantidad: 1, canje: null }];
}

export function cantidadEdicion(texto) {
  const limpio = String(texto ?? "").trim().replace(",", ".");
  if (!limpio) return null;
  const n = Number(limpio);
  return Number.isFinite(n) && n > 0 && n <= 99999 && redondear(n) > 0 ? redondear(n) : null;
}

export function itemsParaCorreccion(lineas) {
  if (!lineas.length) throw new Error("Dejá al menos un producto. Para cancelar todo, usá Anular.");
  const ids = new Set();
  return lineas.map((l) => {
    const cantidad = cantidadEdicion(l.cantidad);
    if (!l.materialId || ids.has(l.materialId)) throw new Error("Hay productos repetidos o sin identificar.");
    if (cantidad == null) throw new Error(`Revisá la cantidad de ${l.item?.descripcion || "este producto"}.`);
    ids.add(l.materialId);
    return { material_id: l.materialId, cantidad, canje: l.canje || null };
  });
}

export function hayCambiosEdicion(originales, lineas) {
  try {
    const antes = itemsParaCorreccion(originales);
    const despues = itemsParaCorreccion(lineas);
    return antes.length !== despues.length || despues.some((i) => {
      const previo = antes.find((p) => p.material_id === i.material_id);
      return !previo || previo.cantidad !== i.cantidad || previo.canje !== i.canje;
    });
  } catch { return false; }
}
