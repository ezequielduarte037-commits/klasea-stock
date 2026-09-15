function clean(value) {
  return String(value ?? "").trim();
}

function supplierKey(value) {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

export function normalizeSupplierComponents(value) {
  const source = Array.isArray(value) ? value : [];
  return source
    .map((row) => ({
      descripcion: clean(row?.descripcion || row?.description),
      codigo: clean(row?.codigo || row?.code),
      cantidad: Number(row?.cantidad ?? row?.quantity ?? 1) || 1,
      unidad: clean(row?.unidad || row?.unit) || "unidad",
    }))
    .filter((row) => row.descripcion || row.codigo);
}

/**
 * Denominación y código con los que UN proveedor reconoce el artículo.
 * El nombre interno del catálogo no se reemplaza: ambos cumplen funciones
 * distintas y el término del proveedor puede variar entre casas.
 */
export function supplierTermsForMaterial(material, { proveedorId = null, proveedor = "" } = {}) {
  if (!material) return null;
  const wantedName = supplierKey(proveedor);
  const entries = Array.isArray(material.proveedores_lista) ? material.proveedores_lista : [];
  const match = entries.find((entry) => {
    if (proveedorId && entry?.proveedor_id === proveedorId) return true;
    if (!wantedName) return false;
    return supplierKey(entry?.proveedor?.nombre) === wantedName;
  }) || (proveedorId && material.proveedor_id === proveedorId
    ? entries.find((entry) => entry?.proveedor_id === material.proveedor_id)
    : null);

  if (!match) return null;
  return {
    supplierId: match.proveedor_id || proveedorId || null,
    supplierName: clean(match.proveedor?.nombre || proveedor || material.proveedor) || null,
    description: clean(match.denominacion_proveedor) || null,
    code: clean(match.codigo_proveedor) || null,
    components: normalizeSupplierComponents(match.componentes_pedido),
  };
}

export function supplierSnapshotForMaterial(material, options = {}) {
  const terms = supplierTermsForMaterial(material, options);
  return {
    supplier_id: terms?.supplierId || options.proveedorId || null,
    supplier_name: terms?.supplierName || clean(options.proveedor) || null,
    supplier_description: terms?.description || null,
    supplier_code: terms?.code || null,
    supplier_components: terms?.components || [],
  };
}

export function supplierPurchaseLines(item) {
  const components = normalizeSupplierComponents(item?.supplier_components);
  const baseQty = Number(item?.quantity) || 1;
  if (components.length) {
    return components.map((component) => ({
      description: component.descripcion || item?.supplier_description || item?.description || "Ítem sin detalle",
      code: component.codigo || "",
      quantity: baseQty * component.cantidad,
      unit: component.unidad || item?.unit || "unidad",
      sourceDescription: item?.description || "",
    }));
  }
  return [{
    description: clean(item?.supplier_description) || item?.description || "Ítem sin detalle",
    code: clean(item?.supplier_code),
    quantity: item?.quantity,
    unit: item?.unit,
    sourceDescription: item?.description || "",
  }];
}
