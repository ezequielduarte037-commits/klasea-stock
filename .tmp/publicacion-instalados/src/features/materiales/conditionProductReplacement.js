// Un opcional puede expresar una terminación como "quita cromado / agrega negro".
// Si el cromado es el producto predeterminado de un requisito de matriz,
// ambos movimientos reemplazan el producto de esa misma fila, no crean otra.
export function findConditionProductReplacements(baseRows, items, compatibleLinks) {
  const linksByRequirement = new Map();
  for (const link of compatibleLinks || []) {
    if (link.activo === false) continue;
    const products = linksByRequirement.get(link.requisito_material_id) || new Set();
    products.add(link.producto_material_id);
    linksByRequirement.set(link.requisito_material_id, products);
  }

  const replacements = [];
  const consumedItemIds = new Set();
  for (const row of baseRows || []) {
    const requirementId = row.requisitoMaterialId || row.material_id || row.materialId;
    const defaultProductId = row.productoMaterialId || row.producto_predeterminado_id;
    const quantity = Number(row.cantidad || 0);
    if (!requirementId || !defaultProductId || quantity <= 0) continue;
    const family = linksByRequirement.get(requirementId);
    if (!family?.has(defaultProductId)) continue;

    const removals = (items || []).filter((item) => item.activo !== false
      && item.tipo_item === "quita" && item.material_id === defaultProductId
      && Number(item.cantidad || 0) === quantity && !consumedItemIds.has(item.id));
    const additions = (items || []).filter((item) => item.activo !== false
      && item.tipo_item !== "quita" && item.material_id !== defaultProductId
      && family.has(item.material_id) && Number(item.cantidad || 0) === quantity
      && !consumedItemIds.has(item.id));
    // Ante ambigüedad no se consume nada: la configuración queda visible para
    // revisión en vez de sustituir un artículo equivocado.
    if (removals.length !== 1 || additions.length !== 1) continue;
    const removal = removals[0];
    const addition = additions[0];
    replacements.push({ requirementId, productId: addition.material_id, removal, addition });
    consumedItemIds.add(removal.id);
    consumedItemIds.add(addition.id);
  }
  return { replacements, consumedItemIds };
}
