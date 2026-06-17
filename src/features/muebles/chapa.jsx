// ─────────────────────────────────────────────────────────────────────────────
// chapa.jsx — Sistema de iconos/swatches estilizados de chapa (veneer)
//
// NO usa las fotos de "hojas de chapa/" como textura. Genera muestras por CSS:
// capas superpuestas (brillo de hoja + grano vertical + figura + base) que dan
// identidad por familia (nogal, roble, noce, grises, ébano/wengué, línea X…).
//
// Exports públicos (firmas estables — las consumen EnchapadoView y MueblesScreen):
//   normalizeChapa(tipo)         -> string normalizado
//   esNogal(tipo)                -> bool
//   chapaColor(tipo)             -> { base, grain, vein, text }
//   chapaGradient(tone)          -> string (usado en impresión)
//   chapaTexture(tipo)           -> string (background multicapa de la muestra)
//   chapaMeta(tipo)              -> { familia, figura, calidez, valor, descriptor }  (nuevo)
//   <ChapaSwatch tipo size label />
//   <ChapaReferenceCard tipo />
// ─────────────────────────────────────────────────────────────────────────────

export function normalizeChapa(tipoChapa = "") {
  return String(tipoChapa || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ã©|Ã©/g, "e")
    .replace(/\s+/g, " ");
}

export function esNogal(tipoChapa = "") {
  return normalizeChapa(tipoChapa).includes("nogal");
}

// base = color dominante · grain = vetas claras · vein = vetas/sombra oscura
// text = color de texto legible sobre la muestra (para badges sobre madera)
const CHAPA_COLORS = {
  "nogal natural":          { base: "#7a4a2a", grain: "#a8754a", vein: "#3d2415", text: "#fff7ed" },
  "nogal italiano rayado":  { base: "#6f4326", grain: "#a06a40", vein: "#311b11", text: "#fff7ed" },
  "nogal poro cerrado":     { base: "#704429", grain: "#9a653e", vein: "#42261a", text: "#fff7ed" },
  "nogal rayado":           { base: "#744728", grain: "#ad7344", vein: "#2c1a10", text: "#fff7ed" },
  "xa35 nogal rayado":      { base: "#71452a", grain: "#a86e42", vein: "#2e1b11", text: "#fff7ed" },
  "noce canaletto":         { base: "#7c523d", grain: "#ab7c5e", vein: "#41291f", text: "#fff7ed" },
  "nocce canaletto":        { base: "#7c523d", grain: "#ab7c5e", vein: "#41291f", text: "#fff7ed" },
  "roble plata rayado":     { base: "#9d9b8e", grain: "#d4cdbb", vein: "#666860", text: "#17130e" },
  "roble tinte rayado":     { base: "#a87a45", grain: "#d2ad75", vein: "#684320", text: "#24160b" },
  "roble cape gris":        { base: "#746f66", grain: "#aaa294", vein: "#4c4942", text: "#fffaf0" },
  "roble avorio":           { base: "#c2a979", grain: "#ecdcb8", vein: "#8a714b", text: "#24160b" },
  "roble fume":             { base: "#5c5148", grain: "#8d8072", vein: "#332c26", text: "#fffaf0" },
  "chocolate floreado":     { base: "#3b2318", grain: "#6f4534", vein: "#1c0f0a", text: "#fff7ed" },
  "milan fume":             { base: "#6f6258", grain: "#968a7e", vein: "#423933", text: "#fffaf0" },
  "milan fiume":            { base: "#6f6258", grain: "#968a7e", vein: "#423933", text: "#fffaf0" },
  "gris terso":             { base: "#80858b", grain: "#c2c6cc", vein: "#545a61", text: "#111827" },
  "gris tx":                { base: "#696f76", grain: "#a9aeb4", vein: "#444a51", text: "#f8fafc" },
  "ebano negro":            { base: "#161514", grain: "#3c3933", vein: "#040404", text: "#f8fafc" },
  "eucalipto termotratado": { base: "#745136", grain: "#ab774f", vein: "#3d2918", text: "#fff7ed" },
  "wengue t a16":           { base: "#302219", grain: "#69492f", vein: "#0e0906", text: "#fff7ed" },
  "nrr":                    { base: "#8b694b", grain: "#c09666", vein: "#503420", text: "#fff7ed" },
  "x08":                    { base: "#aa8d63", grain: "#dac291", vein: "#755932", text: "#24160b" },
  "x14 egamo":              { base: "#927359", grain: "#c5a384", vein: "#57402d", text: "#fff7ed" },
  "x18":                    { base: "#805c40", grain: "#b88a62", vein: "#4c2f1f", text: "#fff7ed" },
  "x20":                    { base: "#ba9b6e", grain: "#e6cb97", vein: "#81633b", text: "#24160b" },
  "x22 teka ii":            { base: "#a26a38", grain: "#d89d5e", vein: "#67401e", text: "#fff7ed" },
  "x32 egamo negro":        { base: "#201d1b", grain: "#544b41", vein: "#080706", text: "#f8fafc" },
  "x33 gris terso":         { base: "#7d858a", grain: "#c9ced2", vein: "#545c61", text: "#111827" },
  "x37 roble avorio":       { base: "#c2a979", grain: "#ecdcb8", vein: "#8a714b", text: "#24160b" },
  "x38 roble fume":         { base: "#5c5148", grain: "#8d8072", vein: "#332c26", text: "#fffaf0" },
  "formica blanca":         { base: "#f2eee2", grain: "#ffffff", vein: "#d6d0c2", text: "#1f2937" },
};

// Fallback elegante: roble neutro cálido (nunca un marrón barro genérico).
const FALLBACK_TONE = { base: "#8a6f57", grain: "#bb9e80", vein: "#594434", text: "#fff7ed" };

function withAlpha(hex, alpha) {
  const value = String(hex || "").replace("#", "");
  if (value.length !== 6) return `rgba(0,0,0,${alpha})`;
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function hexToRgb(hex) {
  const v = String(hex || "").replace("#", "");
  if (v.length !== 6) return { r: 128, g: 110, b: 90 };
  return { r: parseInt(v.slice(0, 2), 16), g: parseInt(v.slice(2, 4), 16), b: parseInt(v.slice(4, 6), 16) };
}

export function chapaColor(tipoChapa = "") {
  const key = normalizeChapa(tipoChapa);
  if (CHAPA_COLORS[key]) return CHAPA_COLORS[key];
  // Resolución por familia/atributos (orden de especificidad)
  if (key.includes("plata") && key.includes("roble")) return CHAPA_COLORS["roble plata rayado"];
  if (key.includes("tinte") && key.includes("roble")) return CHAPA_COLORS["roble tinte rayado"];
  if (key.includes("avorio")) return CHAPA_COLORS["roble avorio"];
  if (key.includes("roble") && key.includes("fume")) return CHAPA_COLORS["roble fume"];
  if (key.includes("roble")) return CHAPA_COLORS["roble plata rayado"];
  if (key.includes("noce") || key.includes("canaletto")) return CHAPA_COLORS["noce canaletto"];
  if (key.includes("nogal") && key.includes("rayado")) return CHAPA_COLORS["nogal rayado"];
  if (key.includes("nogal")) return CHAPA_COLORS["nogal natural"];
  if (key.includes("chocolate")) return CHAPA_COLORS["chocolate floreado"];
  if (key.includes("fiume") || key.includes("milan")) return CHAPA_COLORS["milan fiume"];
  if (key.includes("gris") && key.includes("tx")) return CHAPA_COLORS["gris tx"];
  if (key.includes("gris") || key.includes("gray")) return CHAPA_COLORS["gris terso"];
  if (key.includes("ebano") || key.includes("egamo negro")) return CHAPA_COLORS["ebano negro"];
  if (key.includes("eucalipto")) return CHAPA_COLORS["eucalipto termotratado"];
  if (key.includes("wengue")) return CHAPA_COLORS["wengue t a16"];
  if (key.includes("teka")) return CHAPA_COLORS["x22 teka ii"];
  if (key.includes("blanc") || key.includes("white") || key.includes("formica")) return CHAPA_COLORS["formica blanca"];
  return FALLBACK_TONE;
}

// ─── Figura / veta dominante ──────────────────────────────────────────────────
function figureOf(tipoChapa = "") {
  const key = normalizeChapa(tipoChapa);
  if (key.includes("floreado")) return "floreada";
  if (key.includes("rayado") || key.includes("plata")) return "rayada";
  if (key.includes("ebano") || key.includes("wengue") || key.includes("negro")) return "oscura";
  if (key.includes("gris") || key.includes("gray")) return "fria";
  if (key.includes("formica") || key.includes("blanc")) return "lisa";
  if (key.includes("fume") || key.includes("fiume") || key.includes("canaletto") ||
      key.includes("noce") || key.includes("milan")) return "uniforme";
  return "recta";
}

const FIGURE_LABEL = {
  recta: "Veta recta", rayada: "Rayada", floreada: "Floreada",
  uniforme: "Uniforme", fria: "Veta fría", oscura: "Veta oscura", lisa: "Lisa",
};

const FAMILIA_RULES = [
  ["nogal", "Nogal"], ["noce", "Noce"], ["canaletto", "Noce"], ["avorio", "Roble"],
  ["roble", "Roble"], ["gris", "Gris"], ["ebano", "Ébano"], ["wengue", "Wengué"],
  ["eucalipto", "Eucalipto"], ["milan", "Milán"], ["fiume", "Milán"],
  ["chocolate", "Chocolate"], ["formica", "Fórmica"], ["blanc", "Fórmica"], ["nrr", "Línea X"],
];

function familiaOf(tipoChapa = "") {
  const key = normalizeChapa(tipoChapa);
  for (const [needle, label] of FAMILIA_RULES) if (key.includes(needle)) return label;
  if (/^x\s*a?\s*\d/.test(key)) return "Línea X";
  return "Madera";
}

export function chapaMeta(tipoChapa = "") {
  const tone = chapaColor(tipoChapa);
  const { r, g, b } = hexToRgb(tone.base);
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  const valor = lum > 168 ? "Claro" : lum > 92 ? "Medio" : "Oscuro";
  const calidez = r - b > 22 ? "Cálido" : b - r > 8 ? "Frío" : "Neutro";
  const familia = familiaOf(tipoChapa);
  const figura = FIGURE_LABEL[figureOf(tipoChapa)] ?? "Veta recta";
  return { familia, figura, calidez, valor, descriptor: `${familia} · ${figura} · ${calidez} · ${valor}` };
}

// Gradiente plano (se usa en la impresión de la OT).
export function chapaGradient(tone) {
  const t = tone && tone.base ? tone : FALLBACK_TONE;
  return `linear-gradient(135deg, ${t.base} 0%, ${t.grain} 42%, ${t.base} 58%, ${t.grain} 100%)`;
}

// ─── Composición de capas de la muestra (top → bottom) ────────────────────────
// Brillo de hoja arriba + grano vertical + figura + gradiente base.
function veneerLayers(tone, figure) {
  const { base, grain, vein } = tone;
  const sheen =
    `linear-gradient(180deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.03) 15%,` +
    ` transparent 34%, transparent 70%, rgba(0,0,0,0.13) 90%, rgba(0,0,0,0.2) 100%)`;
  const baseGrad = `linear-gradient(102deg, ${base} 0%, ${grain} 44%, ${base} 70%, ${grain} 100%)`;

  if (figure === "rayada") {
    return [
      sheen,
      `repeating-linear-gradient(90deg, ${withAlpha(vein, 0.42)} 0 1.5px, transparent 1.5px 4px,` +
        ` ${withAlpha(grain, 0.36)} 4px 6px, transparent 6px 9px)`,
      baseGrad,
    ];
  }
  if (figure === "floreada") {
    // Figura "catedral": arcos concéntricos que suben desde la base (flameado clásico).
    return [
      sheen,
      `radial-gradient(ellipse 58% 130% at 50% 102%, ${withAlpha(grain, 0.55)} 0 6%, transparent 7% 15%,` +
        ` ${withAlpha(vein, 0.45)} 16% 21%, transparent 22% 34%, ${withAlpha(grain, 0.38)} 35% 40%, transparent 41%)`,
      `radial-gradient(ellipse 26% 90% at 26% 104%, ${withAlpha(vein, 0.4)} 0 9%, transparent 12%)`,
      `repeating-linear-gradient(90deg, ${withAlpha(vein, 0.2)} 0 1px, transparent 1px 8px)`,
      baseGrad,
    ];
  }
  if (figure === "oscura") {
    return [
      `linear-gradient(180deg, rgba(255,255,255,0.1) 0%, transparent 20%, transparent 78%, rgba(0,0,0,0.34) 100%)`,
      `repeating-linear-gradient(90deg, ${withAlpha(grain, 0.5)} 0 1px, transparent 1px 4px,` +
        ` ${withAlpha(vein, 0.6)} 4px 5px, transparent 5px 11px)`,
      `linear-gradient(104deg, ${base}, ${grain} 50%, ${base})`,
    ];
  }
  if (figure === "fria") {
    return [
      `linear-gradient(180deg, rgba(255,255,255,0.2) 0%, transparent 26%, transparent 76%, rgba(0,0,0,0.1) 100%)`,
      `repeating-linear-gradient(90deg, ${withAlpha(vein, 0.24)} 0 1px, transparent 1px 6px,` +
        ` ${withAlpha(grain, 0.16)} 6px 7px, transparent 7px 15px)`,
      `linear-gradient(98deg, ${base} 0%, ${grain} 50%, ${base} 100%)`,
    ];
  }
  if (figure === "uniforme") {
    return [
      sheen,
      `repeating-linear-gradient(91deg, ${withAlpha(vein, 0.16)} 0 1px, transparent 1px 11px)`,
      `linear-gradient(115deg, ${base}, ${grain} 50%, ${base})`,
    ];
  }
  if (figure === "lisa") {
    return [
      `linear-gradient(180deg, rgba(255,255,255,0.24) 0%, transparent 38%, transparent 68%, rgba(0,0,0,0.07) 100%)`,
      `linear-gradient(120deg, ${base}, ${grain} 60%, ${base})`,
    ];
  }
  // recta (veta fina y derecha)
  return [
    sheen,
    `repeating-linear-gradient(90deg, ${withAlpha(vein, 0.2)} 0 1px, transparent 1px 5px,` +
      ` ${withAlpha(grain, 0.22)} 5px 6px, transparent 6px 13px)`,
    baseGrad,
  ];
}

export function chapaTexture(tipoChapa = "") {
  return veneerLayers(chapaColor(tipoChapa), figureOf(tipoChapa)).join(", ");
}

// Profundidad sutil de hoja: brillo arriba, sombra abajo.
const SWATCH_DEPTH = "inset 0 1px 1px rgba(255,255,255,0.22), inset 0 -3px 6px rgba(0,0,0,0.2)";

const SWATCH_DIMS = {
  xs:   { w: 15, h: 15, r: 4 },
  sm:   { w: 21, h: 21, r: 6 },
  md:   { w: 32, h: 32, r: 8 },
  lg:   { w: 52, h: 40, r: 10 },
  pill: { w: 22, h: 22, r: 6 },
};

export function ChapaSwatch({ tipo, size = "sm", label = false }) {
  const d = SWATCH_DIMS[size] ?? SWATCH_DIMS.sm;

  const swatch = (
    <span
      title={tipo || "Sin chapa"}
      style={{
        display: "inline-block",
        width: d.w,
        height: d.h,
        borderRadius: d.r,
        background: chapaTexture(tipo),
        border: "1px solid rgba(0,0,0,0.28)",
        boxShadow: SWATCH_DEPTH,
        flexShrink: 0,
        verticalAlign: "middle",
      }}
    />
  );

  if (!label) return swatch;

  // Variante con etiqueta: muestra + nombre en pill tematizado (legible en claro y oscuro).
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        maxWidth: "100%",
        padding: "3px 11px 3px 4px",
        borderRadius: 999,
        background: "var(--panel)",
        border: "1px solid var(--border)",
        verticalAlign: "middle",
      }}
    >
      {swatch}
      <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.2, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {tipo || "Sin chapa"}
      </span>
    </span>
  );
}

function MetaTag({ children }) {
  return (
    <span style={{
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: 0.3,
      color: "var(--muted)",
      background: "var(--panel-2)",
      border: "1px solid var(--border)",
      borderRadius: 5,
      padding: "2px 7px",
      whiteSpace: "nowrap",
    }}>
      {children}
    </span>
  );
}

export function ChapaReferenceCard({ tipo }) {
  const tone = chapaColor(tipo);
  const meta = chapaMeta(tipo);

  return (
    <div style={{
      display: "flex",
      gap: 14,
      alignItems: "stretch",
      background: "var(--panel)",
      border: "1px solid var(--border)",
      borderRadius: 12,
      padding: 12,
      overflow: "hidden",
    }}>
      {/* Muestra grande */}
      <div style={{
        position: "relative",
        width: 104,
        minHeight: 104,
        flexShrink: 0,
        borderRadius: 10,
        overflow: "hidden",
        background: chapaTexture(tipo),
        border: "1px solid rgba(0,0,0,0.3)",
        boxShadow: "inset 0 1px 2px rgba(255,255,255,0.26), inset 0 -5px 12px rgba(0,0,0,0.26)",
      }} />

      {/* Ficha */}
      <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 7 }}>
        <div style={{ fontSize: 9.5, letterSpacing: 1.4, textTransform: "uppercase", color: "var(--dim)", fontWeight: 800 }}>
          Muestra estilizada · referencia
        </div>
        <div style={{ fontSize: 15, color: "var(--text)", fontWeight: 800, lineHeight: 1.12, wordBreak: "break-word" }}>
          {tipo || "Sin chapa"}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          <MetaTag>{meta.familia}</MetaTag>
          <MetaTag>{meta.figura}</MetaTag>
          <MetaTag>{meta.calidez}</MetaTag>
          <MetaTag>{meta.valor}</MetaTag>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 1 }}>
          {[tone.base, tone.grain, tone.vein].map((c, i) => (
            <span key={i} style={{ width: 13, height: 13, borderRadius: 4, background: c, border: "1px solid rgba(0,0,0,0.25)" }} />
          ))}
          <span style={{ fontSize: 10.5, color: "var(--muted)" }}>tono · veta · sombra</span>
        </div>
      </div>
    </div>
  );
}
