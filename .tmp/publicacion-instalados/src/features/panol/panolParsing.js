const UNIT_ALIASES = {
  u: "unidad", un: "unidad", uni: "unidad", unid: "unidad", unidad: "unidad", unidades: "unidad", uds: "unidad",
  m: "metro", mt: "metro", mts: "metro", mtr: "metro", mtrs: "metro", metro: "metro", metros: "metro",
  kg: "kg", kgs: "kg", kilo: "kg", kilos: "kg",
  l: "litro", lt: "litro", lts: "litro", litro: "litro", litros: "litro",
  pie: "pies", pies: "pies",
  caja: "caja", cajas: "caja",
  rollo: "rollo", rollos: "rollo",
  par: "par", pares: "par",
  juego: "juego", juegos: "juego",
  m2: "m2", "m\u00b2": "m2",
};

function normKey(value = "") {
  return String(value)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.]/g, "");
}

function cleanNumber(value = "") {
  const raw = String(value || "").trim().replace(",", ".");
  if (!raw) return "";
  const n = Number(raw);
  return Number.isFinite(n) ? String(n) : raw;
}

export function normalizePriceForDb(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return null;
  let clean = raw.replace(/[$\s]/g, "").replace(/[^\d,.-]/g, "");
  if (!clean) return null;
  if (clean.includes(",")) clean = clean.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(clean)) clean = clean.replace(/\./g, "");
  return clean;
}

function detectCode(rest = "") {
  const match = String(rest).match(/\s+([A-Z\u00d1]{1,5}\d[A-Z0-9-]{2,})$/i);
  if (!match) return { codigo: "", descripcion: rest.trim() };
  return {
    codigo: match[1].toUpperCase(),
    descripcion: rest.slice(0, match.index).trim(),
  };
}

export function parsePanolLine(line = "") {
  const original = String(line || "").trim();
  if (!original) return null;

  if (/[|\t]/.test(original)) {
    const parts = original.split(/\s*[|\t]\s*/).map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      let descripcion = parts[0];
      let codigo = "";
      let cantidad = "";
      let unidad = "unidad";
      let precio = "";
      for (const p of parts.slice(1)) {
        const np = normKey(p);
        if (!precio && (/[$]/.test(p) || /^\d{1,3}(\.\d{3})+(,\d+)?$/.test(p) || /^\d+,\d{1,2}$/.test(p))) {
          precio = normalizePriceForDb(p) || "";
          continue;
        }
        if (unidad === "unidad" && UNIT_ALIASES[np]) { unidad = UNIT_ALIASES[np]; continue; }
        if (!cantidad && /^\d+(?:[.,]\d+)?$/.test(p)) { cantidad = cleanNumber(p); continue; }
        if (!codigo && /[a-z]/i.test(p) && /\d/.test(p)) { codigo = p.toUpperCase(); continue; }
        descripcion = `${descripcion} ${p}`.trim();
      }
      return {
        descripcion,
        codigo,
        cantidad,
        unidad,
        precio_unitario: precio,
        moneda: "ARS",
        purchase_request_item_id: null,
      };
    }
  }

  let text = original.replace(/\s+/g, " ");
  let cantidad = "";
  let unidad = "unidad";
  const qty = text.match(/^(\d+(?:[,.]\d+)?)\s+(.*)$/);
  if (qty) {
    cantidad = cleanNumber(qty[1]);
    text = qty[2].trim();

    const maybeUnit = text.match(/^([\p{L}\d.]+)\b\s*(.*)$/u);
    if (maybeUnit) {
      const unit = UNIT_ALIASES[normKey(maybeUnit[1])];
      if (unit) {
        unidad = unit;
        text = maybeUnit[2].trim();
      }
    }
  }

  const coded = detectCode(text);
  return {
    descripcion: coded.descripcion || text,
    codigo: coded.codigo,
    cantidad,
    unidad,
    precio_unitario: "",
    moneda: "ARS",
    purchase_request_item_id: null,
  };
}
