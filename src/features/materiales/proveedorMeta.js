import { C } from "@/theme";

export const PROVEEDOR_TIPOS = ["principal", "secundario", "terciario", "servicio", "laminacion"];

export const PROVEEDOR_TIPO_PRIORITY = {
  principal: 5,
  terciario: 4,
  secundario: 3,
  servicio: 2,
  laminacion: 1,
};

export const PROVEEDOR_TIPO_UI = {
  principal: { label: "Principal", color: C.green, bg: C.greenL, border: C.greenB },
  secundario: { label: "Secundario", color: C.t2, bg: C.panel2, border: C.b0 },
  terciario: { label: "Terciario", color: C.amber, bg: C.amberL, border: C.amberB },
  servicio: { label: "Servicio", color: C.violet, bg: "var(--violet-soft)", border: "var(--violet-border)" },
  laminacion: { label: "Laminación", color: C.teal, bg: "var(--teal-soft)", border: "var(--teal-border)" },
};

export const PROVEEDOR_SIN_CLASIFICAR_UI = {
  label: "Sin clasificar",
  color: C.t2,
  bg: C.panel2,
  border: C.b0,
};

function normProveedor(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitProveedorText(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return [];
  const parts = raw.split(/[/|,+;]+/).map(normProveedor).filter((part) => part.length >= 2);
  const full = normProveedor(raw);
  return [...new Set([full, ...parts].filter(Boolean))];
}

function splitProveedorDisplay(value = "") {
  return String(value || "")
    .split(/[/|,+;]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function providerNames(proveedor) {
  return splitProveedorText(proveedor?.nombre || "");
}

function matchScore(tokens, names) {
  let score = 0;
  for (const token of tokens) {
    for (const name of names) {
      if (!token || !name) continue;
      if (token === name) score = Math.max(score, 100);
      else if (token.length >= 3 && name.length >= 3 && (token.includes(name) || name.includes(token))) {
        score = Math.max(score, 60);
      }
    }
  }
  return score;
}

export function proveedorTipoUi(tipo) {
  return PROVEEDOR_TIPO_UI[tipo] || null;
}

export function proveedorTooltip(meta) {
  if (!meta) return "";
  return [
    meta.nombre,
    meta.perfil,
    meta.rubros ? `Rubros: ${meta.rubros}` : "",
    meta.sede ? `Sede: ${meta.sede}` : "",
    meta.compite_con ? `Compite con: ${meta.compite_con}` : "",
  ].filter(Boolean).join(" - ");
}

export function proveedorMeta(nombreTexto, proveedores = []) {
  const tokens = splitProveedorText(nombreTexto);
  if (!tokens.length || !Array.isArray(proveedores) || !proveedores.length) return null;

  const matches = [];
  for (const proveedor of proveedores) {
    const names = providerNames(proveedor);
    const score = matchScore(tokens, names);
    if (!score) continue;
    matches.push({
      proveedor,
      score,
      priority: PROVEEDOR_TIPO_PRIORITY[proveedor.tipo] || 0,
    });
  }

  if (!matches.length) return null;
  matches.sort((a, b) =>
    (b.priority - a.priority)
    || (b.score - a.score)
    || String(a.proveedor.nombre || "").localeCompare(String(b.proveedor.nombre || ""), "es")
  );

  const p = matches[0].proveedor;
  return {
    id: p.id,
    nombre: p.nombre,
    tipo: p.tipo || null,
    perfil: p.perfil || null,
    rubros: p.rubros || null,
    sede: p.sede || null,
    compite_con: p.compite_con || null,
  };
}

export function proveedorAlternativas(nombreTexto, proveedores = []) {
  const meta = proveedorMeta(nombreTexto, proveedores);
  if (!meta?.compite_con) return [];

  const currentTokens = new Set([
    ...splitProveedorText(nombreTexto),
    ...splitProveedorText(meta.nombre),
  ]);

  const seen = new Set();
  return splitProveedorDisplay(meta.compite_con)
    .filter((name) => {
      const key = normProveedor(name);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      for (const current of currentTokens) {
        if (key === current || key.includes(current) || current.includes(key)) return false;
      }
      return true;
    });
}
