// Alias comprobados en las listas y en el maestro. No inferir proveedores a
// partir de parecidos: un nombre con barra representa alternativas, no una firma.
const ALIAS = new Map([
  ["casairiarte", "Iriarte"],
  ["iriarte", "Iriarte"],
  ["electro2001", "2001"],
  ["2001", "2001"],
  ["powerbat", "PowerBat"],
  ["trimer", "Trimer"],
  ["rincondelherraje", "Rincón del Herraje"],
  ["levy", "Levy"],
]);

const key = (value) => String(value || "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]/g, "");

export function nombresProveedor(value) {
  const raw = String(value || "").trim();
  if (!raw || key(raw) === "sinproveedor") return [];
  const parts = raw.split(/\s*(?:\/|\s+o\s+)\s*/i).map((name) => name.trim()).filter(Boolean);
  const unique = new Map();
  for (const part of parts) {
    const canon = ALIAS.get(key(part)) || part;
    if (!unique.has(key(canon))) unique.set(key(canon), canon);
  }
  return [...unique.values()];
}

export function nombreProveedorVisible(value) {
  return nombresProveedor(value).join(" o ");
}

export function esProveedorAlternativo(value) {
  return nombresProveedor(value).length > 1;
}

export function coincideProveedor(value, selected) {
  if (!selected) return true;
  if (key(selected) === "sinproveedor") return nombresProveedor(value).length === 0;
  return nombresProveedor(value).some((name) => key(name) === key(selected));
}
