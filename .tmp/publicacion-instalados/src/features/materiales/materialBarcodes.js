export function normalizeBarcode(value = "") {
  return String(value ?? "").trim();
}

export function barcodeKey(value = "") {
  return normalizeBarcode(value).toLowerCase();
}

export function materialBarcodeList(material = {}) {
  const out = [];
  const seen = new Set();
  const push = (entry, fallback = {}) => {
    const codigo = typeof entry === "string" ? entry : entry?.codigo;
    const clean = normalizeBarcode(codigo);
    const key = barcodeKey(clean);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({
      id: typeof entry === "string" ? null : entry?.id ?? null,
      material_id: typeof entry === "string" ? material?.id ?? null : entry?.material_id ?? material?.id ?? null,
      codigo: clean,
      etiqueta: typeof entry === "string" ? fallback.etiqueta ?? "" : entry?.etiqueta ?? fallback.etiqueta ?? "",
      variante: typeof entry === "string" ? fallback.variante ?? null : entry?.variante ?? fallback.variante ?? null,
      activo: typeof entry === "string" ? true : entry?.activo !== false,
      legacy: !!fallback.legacy,
    });
  };

  push(material?.codigo_barra, { etiqueta: "Principal", legacy: true });
  for (const entry of material?.codigos_barra || []) {
    if (entry?.activo === false) continue;
    push(entry);
  }
  return out;
}

export function materialBarcodeText(material = {}) {
  return materialBarcodeList(material).map((entry) => entry.codigo).join(" ");
}

export function materialMatchesBarcode(material, code) {
  const key = barcodeKey(code);
  return !!key && materialBarcodeList(material).some((entry) => barcodeKey(entry.codigo) === key);
}

export function findMaterialByBarcode(materiales = [], code, { excludeId = null } = {}) {
  const key = barcodeKey(code);
  if (!key) return null;
  return (materiales || []).find((material) => material?.id !== excludeId && materialMatchesBarcode(material, key)) || null;
}
