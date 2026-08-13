export const PRODUCT_SPEC_FIELDS = [
  { key: "color", label: "Color / código", placeholder: "Ej. Blanco · RAL 9010" },
  { key: "terminacion", label: "Terminación", placeholder: "Ej. Mate, brillante, anodizado" },
  { key: "medida", label: "Medida / configuración", placeholder: "Ej. 32 pulgadas · 12 V" },
  { key: "detalle", label: "Detalle técnico", placeholder: "Dato especial para compra, OT o recepción" },
];

export function normalizeProductSpecs(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    PRODUCT_SPEC_FIELDS
      .map(({ key }) => [key, String(value[key] ?? "").trim()])
      .filter(([, fieldValue]) => fieldValue),
  );
}

export function productSpecEntries(value = {}) {
  const clean = normalizeProductSpecs(value);
  return PRODUCT_SPEC_FIELDS
    .filter(({ key }) => clean[key])
    .map(({ key, label }) => ({ key, label, value: clean[key] }));
}

export function productSpecsText(value = {}) {
  return productSpecEntries(value)
    .map(({ label, value: fieldValue }) => `${label}: ${fieldValue}`)
    .join(" · ");
}

export function productSpecsNote(value = {}) {
  const text = productSpecsText(value);
  return text ? `Especificaciones: ${text}` : "";
}

export function hasProductSpecs(value = {}) {
  return productSpecEntries(value).length > 0;
}
