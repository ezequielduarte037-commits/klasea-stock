// Sólo datos del producto. Los estados, recepciones, importes y vínculos con
// listas de obra pertenecen al pedido anterior y deben generarse de nuevo.
const CAMPOS_PRODUCTO = [
  "material_id", "requisito_material_id", "catalog_source", "especificaciones",
  "notes", "image_url", "image_path", "supplier_description", "supplier_code",
];

export function itemsParaNuevoPedido(items = []) {
  return items.filter((it) => it?.description).map((it) => ({
    description: it.description,
    quantity: it.quantity ?? null,
    unit: it.unit || "unidad",
    link_url: it.link_url || null,
    ...Object.fromEntries(CAMPOS_PRODUCTO
      .filter((campo) => it[campo] != null)
      .map((campo) => [campo, JSON.parse(JSON.stringify(it[campo]))])),
  }));
}

export function prefillRepetirPedido(request, items = []) {
  return {
    repetido: true,
    title: request.title || "",
    description: request.description || "",
    priority: request.priority || "media",
    es_adicional: Boolean(request.es_adicional),
    project_id: "",
    destinos: [],
    destino: "",
    needed_at: "",
    items: itemsParaNuevoPedido(items),
  };
}
