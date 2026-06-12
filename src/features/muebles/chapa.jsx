export function normalizeChapa(tipoChapa = "") {
  return String(tipoChapa || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u00e3\u00a9|\u00c3\u00a9/g, "e")
    .replace(/\s+/g, " ");
}

export function esNogal(tipoChapa = "") {
  return normalizeChapa(tipoChapa).includes("nogal");
}

const CHAPA_COLORS = {
  "nogal natural": { base: "#7a4a2a", grain: "#a07045", text: "#fff7ed" },
  "nogal italiano rayado": { base: "#6f4326", grain: "#9c6840", text: "#fff7ed" },
  "nogal poro cerrado": { base: "#704429", grain: "#94613d", text: "#fff7ed" },
  "nogal rayado": { base: "#744728", grain: "#a06b40", text: "#fff7ed" },
  "noce canaletto": { base: "#8a4d32", grain: "#b56f4d", text: "#fff7ed" },
  "roble plata rayado": { base: "#b8925f", grain: "#d2b37d", text: "#24160b" },
  "roble tinte rayado": { base: "#a87a45", grain: "#cfaa72", text: "#24160b" },
  "chocolate floreado": { base: "#3f261c", grain: "#654031", text: "#fff7ed" },
  "milan fume": { base: "#6f6258", grain: "#94877c", text: "#fffaf0" },
  "gris terso": { base: "#8f949c", grain: "#c0c4ca", text: "#111827" },
  "formica blanca": { base: "#f2eee2", grain: "#ffffff", text: "#1f2937" },
};

export function chapaColor(tipoChapa = "") {
  const key = normalizeChapa(tipoChapa);
  if (CHAPA_COLORS[key]) return CHAPA_COLORS[key];
  if (key.includes("nogal")) return CHAPA_COLORS["nogal natural"];
  if (key.includes("noce") || key.includes("canaletto")) return CHAPA_COLORS["noce canaletto"];
  if (key.includes("roble")) return CHAPA_COLORS["roble plata rayado"];
  if (key.includes("chocolate")) return CHAPA_COLORS["chocolate floreado"];
  if (key.includes("fume") || key.includes("fum")) return CHAPA_COLORS["milan fume"];
  if (key.includes("gris") || key.includes("gray")) return CHAPA_COLORS["gris terso"];
  if (key.includes("blanc") || key.includes("white") || key.includes("formica")) return CHAPA_COLORS["formica blanca"];
  return { base: "#8b735f", grain: "#b69b80", text: "#fffaf0" };
}

export function chapaGradient(tone) {
  return `linear-gradient(135deg, ${tone.base} 0%, ${tone.grain} 42%, ${tone.base} 58%, ${tone.grain} 100%)`;
}

export function ChapaSwatch({ tipo, size = "sm", label = false }) {
  const tone = chapaColor(tipo);
  const dims = {
    xs: { w: 16, h: 16, r: 4 },
    sm: { w: 22, h: 22, r: 6 },
    md: { w: 34, h: 34, r: 9 },
    lg: { w: 50, h: 38, r: 10 },
    pill: { w: "auto", h: 24, r: 999 },
  }[size] ?? { w: 22, h: 22, r: 6 };

  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: label ? 7 : 0,
      width: label ? "auto" : dims.w,
      height: dims.h,
      minWidth: label ? dims.h : dims.w,
      borderRadius: dims.r,
      padding: label ? "0 9px 0 3px" : 0,
      background: chapaGradient(tone),
      border: "1px solid rgba(0,0,0,0.28)",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.24)",
      color: tone.text,
      overflow: "hidden",
      flexShrink: 0,
      verticalAlign: "middle",
    }}>
      {label && (
        <>
          <span style={{ width: dims.h - 8, height: dims.h - 8, borderRadius: Math.max(3, dims.r - 3), background: "rgba(255,255,255,0.18)", border: "1px solid rgba(255,255,255,0.22)", marginLeft: 2 }} />
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.2, color: tone.text }}>{tipo || "Sin chapa"}</span>
        </>
      )}
    </span>
  );
}
