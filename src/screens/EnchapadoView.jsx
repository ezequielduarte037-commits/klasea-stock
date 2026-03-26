import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "../supabaseClient";

// ─── Tiny SVG icons ───────────────────────────────────────────────────────
const Icon = {
  download: (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2v8M5 7l3 3 3-3"/><path d="M2 12h12"/>
    </svg>
  ),
  plus: (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M8 2v12M2 8h12"/>
    </svg>
  ),
  close: (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M3 3l10 10M13 3L3 13"/>
    </svg>
  ),
  layers: (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 1L1 5l7 4 7-4-7-4zM1 11l7 4 7-4M1 8l7 4 7-4"/>
    </svg>
  ),
  copy: (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="5" width="9" height="9" rx="1.5"/><path d="M3 11H2a1 1 0 01-1-1V2a1 1 0 011-1h8a1 1 0 011 1v1"/>
    </svg>
  ),
  trash: (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 9a1 1 0 001 1h6a1 1 0 001-1l1-9"/>
    </svg>
  ),
};


// ─── Design tokens (idénticos a MueblesScreen) ─────────────────────────
const C = {
  bg:      "#09090b",
  s0:      "rgba(255,255,255,0.03)",
  s1:      "rgba(255,255,255,0.06)",
  b0:      "rgba(255,255,255,0.08)",
  b1:      "rgba(255,255,255,0.15)",
  t0:      "#f4f4f5",
  t1:      "#a1a1aa",
  t2:      "#71717a",
  sans:    "'Outfit', system-ui, sans-serif",
  mono:    "'JetBrains Mono', monospace",
  green:   "#10b981",
  red:     "#ef4444",
  amber:   "#f59e0b",
  primary: "#3b82f6",
};
const INP = {
  background: "rgba(255,255,255,0.04)",
  border: `1px solid ${C.b0}`,
  color: C.t0,
  padding: "7px 10px",
  borderRadius: 7,
  fontSize: 12,
  outline: "none",
  width: "100%",
  fontFamily: C.sans,
};

const ESTADOS_FICHA = ["Borrador", "Enviada", "En proceso", "Completada"];
const ESTADO_META = {
  "Borrador":    { color: C.t2,     bg: "transparent" },
  "Enviada":     { color: C.amber,  bg: "rgba(245,158,11,0.1)" },
  "En proceso":  { color: C.primary,bg: "rgba(59,130,246,0.1)" },
  "Completada":  { color: C.green,  bg: "rgba(16,185,129,0.1)" },
};
const SENTIDOS_VETA = [
  "A lo largo",
  "A lo ancho",
  "Paralelo al largo",
  "Perpendicular al largo",
  "Diagonal",
];

// ─── SQL para crear tablas ────────────────────────────────────────────────
const SQL_SETUP = `-- Ejecutar en Supabase → SQL Editor

create table enchapado_fichas (
  id uuid primary key default gen_random_uuid(),
  linea text,
  unidad text not null,
  material text,
  acabado text,
  tecnico text,
  fecha text,
  notas text,
  estado text default 'Borrador',
  created_at timestamptz default now()
);

create table enchapado_placas (
  id uuid primary key default gen_random_uuid(),
  ficha_id uuid references enchapado_fichas(id) on delete cascade,
  letra text,
  descripcion text,
  orden integer default 0,
  created_at timestamptz default now()
);

create table enchapado_hojas (
  id uuid primary key default gen_random_uuid(),
  ficha_id uuid references enchapado_fichas(id) on delete cascade,
  letra text,
  material text,
  cantidad integer,
  medidas text,
  orden integer default 0,
  created_at timestamptz default now()
);

create table enchapado_trabajos (
  id uuid primary key default gen_random_uuid(),
  ficha_id uuid references enchapado_fichas(id) on delete cascade,
  letra text,
  cantidad_placas text,
  medidas text,
  cantidad_caras text default '1 cara',
  sentido_veta text,
  fin_pieza text,
  orden integer default 0,
  created_at timestamptz default now()
);`;

// ─── Load SheetJS from CDN ────────────────────────────────────────────────
async function getXLSX() {
  if (window.XLSX) return window.XLSX;
  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return window.XLSX;
}

// ─── Export: Excel ────────────────────────────────────────────────────────
async function exportarExcel(ficha, placas, hojas, trabajos) {
  const XLSX = await getXLSX();
  const rows = [];
  const hasFin = trabajos.some(t => t.fin_pieza);

  rows.push([
    `KLASE A  ${ficha.unidad}${ficha.acabado ? `  (${ficha.acabado})` : ""}`,
    null, null,
    `Fecha: ${ficha.fecha || ""}`,
  ]);
  if (ficha.tecnico) rows.push([null, null, null, `Área Técnica`, `${ficha.tecnico}`]);

  rows.push(["PLACAS"]);
  placas.forEach(p => rows.push([p.letra || null, p.descripcion || null]));

  rows.push([`HOJAS O CHAPAS${ficha.material ? ` (${ficha.material})` : ""}`]);
  hojas.forEach(h => {
    const desc = `${h.cantidad || ""} ${h.material || "hojas"}${h.medidas ? ` de ${h.medidas}` : ""}`.trim();
    rows.push([h.letra || null, desc]);
  });

  rows.push(["TRABAJO A REALIZAR"]);
  if (hasFin) {
    rows.push([null, "CANTIDAD DE PLACAS", "MEDIDAS", "CANTIDAD DE CARAS", "FIN O PIEZA", "SENTIDO DE VETA"]);
    rows.push([null, null, "[cm]"]);
    trabajos.forEach(t => rows.push([t.letra || null, t.cantidad_placas, t.medidas, t.cantidad_caras, t.fin_pieza, t.sentido_veta]));
  } else {
    rows.push(["CANTIDAD DE PLACAS", "MEDIDAS", "CANTIDAD DE CARAS", "SENTIDO DE VETA"]);
    trabajos.forEach(t => rows.push([t.cantidad_placas, t.medidas, t.cantidad_caras, t.sentido_veta]));
  }

  if (ficha.notas) {
    rows.push([]);
    rows.push(["Notas:", ficha.notas]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 38 }, { wch: 22 }, { wch: 16 }, { wch: 14 }, { wch: 28 }, { wch: 30 }];

  const wb = XLSX.utils.book_new();
  const sheetName = (ficha.unidad || "ficha").replace(/[/\\?*[\]]/g, "-").substring(0, 31);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  const fecha = (ficha.fecha || "").replace(/[/\-\s]/g, "");
  XLSX.writeFile(wb, `LISTA_ENCHAPAR_${ficha.unidad.replace(/\s+/g, "_")}_${fecha || "sin_fecha"}.xlsx`);
}

// ─── Export: PDF (ventana de impresión) ──────────────────────────────────
function exportarPDF(ficha, placas, hojas, trabajos) {
  const hasFin = trabajos.some(t => t.fin_pieza);
  const fecha = new Date().toLocaleDateString("es-AR");

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Lista para Enchapar – ${ficha.unidad}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', sans-serif; font-size: 11px; color: #111827; padding: 32px 36px; line-height: 1.5; }

  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 22px; padding-bottom: 16px; border-bottom: 2px solid #111827; }
  .header-left .title { font-size: 19px; font-weight: 700; letter-spacing: -0.02em; }
  .header-left .sub { font-size: 12px; color: #555; margin-top: 4px; }
  .header-right { text-align: right; font-size: 11px; color: #555; }
  .header-right .date { font-size: 13px; font-weight: 600; color: #111; font-family: 'JetBrains Mono', monospace; }

  .badge { display: inline-block; padding: 2px 10px; border-radius: 99px; font-size: 10px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; background: #e8f5e9; color: #1b5e20; margin-top: 6px; }

  .section { margin-bottom: 20px; break-inside: avoid; }
  .section-label { font-size: 9px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: #888; border-bottom: 1px solid #e5e7eb; padding-bottom: 5px; margin-bottom: 10px; }

  .item-row { display: flex; gap: 12px; padding: 3px 0; border-bottom: 1px solid #f3f4f6; align-items: baseline; }
  .item-letra { font-weight: 700; min-width: 20px; flex-shrink: 0; font-size: 11px; }
  .item-text { color: #374151; }
  .item-qty { font-weight: 700; color: #111; }

  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  thead th { background: #111827; color: #fff; padding: 7px 10px; text-align: left; font-size: 9px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; }
  tbody td { padding: 7px 10px; border-bottom: 1px solid #e5e7eb; color: #374151; }
  tbody tr:nth-child(even) td { background: #f9fafb; }
  tbody td:first-child { font-weight: 700; color: #111; }
  .code { font-family: 'JetBrains Mono', monospace; font-size: 10px; }
  .tag-caras { font-size: 10px; font-weight: 600; }
  .tag-caras.dos { color: #b45309; }
  .veta { font-size: 10px; color: #6b7280; }

  .notas { background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 10px 14px; margin-bottom: 18px; color: #78350f; font-size: 11px; }

  .footer { margin-top: 28px; padding-top: 10px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; font-size: 10px; color: #9ca3af; }

  .resumen { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 20px; }
  .res-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 12px; }
  .res-card .num { font-size: 20px; font-weight: 700; font-family: 'JetBrains Mono', monospace; }
  .res-card .lbl { font-size: 9px; color: #888; letter-spacing: 0.1em; text-transform: uppercase; margin-top: 2px; }

  @media print {
    body { padding: 12px 16px; }
    @page { margin: 1.2cm 1cm; size: A4; }
  }
</style>
</head>
<body>

<div class="header">
  <div class="header-left">
    <div class="title">KLASE A — ${ficha.unidad}</div>
    <div class="sub">${[ficha.material, ficha.acabado].filter(Boolean).join("  ·  ") || "Sin material especificado"}</div>
    ${ficha.linea ? `<div class="sub" style="margin-top:2px">Línea: ${ficha.linea}</div>` : ""}
  </div>
  <div class="header-right">
    <div class="date">${ficha.fecha || "Sin fecha"}</div>
    ${ficha.tecnico ? `<div style="margin-top:4px">Área Técnica: <strong>${ficha.tecnico}</strong></div>` : ""}
    <div class="badge">${ficha.estado || "Borrador"}</div>
  </div>
</div>

${ficha.notas ? `<div class="notas"><strong>Notas:</strong> ${ficha.notas}</div>` : ""}

<div class="resumen">
  <div class="res-card"><div class="num">${placas.length}</div><div class="lbl">Placas</div></div>
  <div class="res-card"><div class="num">${hojas.reduce((a, h) => a + (parseInt(h.cantidad) || 0), 0)}</div><div class="lbl">Hojas / Chapas</div></div>
  <div class="res-card"><div class="num">${trabajos.length}</div><div class="lbl">Ítems trabajo</div></div>
</div>

${placas.length > 0 ? `
<div class="section">
  <div class="section-label">Placas</div>
  ${placas.map(p => `
    <div class="item-row">
      <span class="item-letra">${p.letra || ""}</span>
      <span class="item-text">${p.descripcion || "—"}</span>
    </div>
  `).join("")}
</div>` : ""}

${hojas.length > 0 ? `
<div class="section">
  <div class="section-label">Hojas o Chapas${ficha.material ? ` — ${ficha.material}` : ""}</div>
  ${hojas.map(h => `
    <div class="item-row">
      <span class="item-letra">${h.letra || ""}</span>
      <span class="item-text">
        ${h.cantidad ? `<span class="item-qty">${h.cantidad}</span> ` : ""}${h.material || "hojas"}${h.medidas ? ` de <span class="code">${h.medidas}</span>` : ""}
      </span>
    </div>
  `).join("")}
</div>` : ""}

${trabajos.length > 0 ? `
<div class="section">
  <div class="section-label">Trabajo a Realizar</div>
  <table>
    <thead>
      <tr>
        <th style="width:36px"></th>
        <th>Cant. Placas</th>
        <th>Medidas (cm)</th>
        <th>Caras</th>
        ${hasFin ? "<th>Fin / Pieza</th>" : ""}
        <th>Sentido de Veta</th>
      </tr>
    </thead>
    <tbody>
      ${trabajos.map(t => `
        <tr>
          <td>${t.letra || ""}</td>
          <td>${t.cantidad_placas || "—"}</td>
          <td class="code">${t.medidas || "—"}</td>
          <td class="tag-caras${t.cantidad_caras === "2 caras" ? " dos" : ""}">${t.cantidad_caras || "—"}</td>
          ${hasFin ? `<td>${t.fin_pieza || "—"}</td>` : ""}
          <td class="veta">${t.sentido_veta || "—"}</td>
        </tr>
      `).join("")}
    </tbody>
  </table>
</div>` : ""}

<div class="footer">
  <span>Lista para Enchapar · Klase A</span>
  <span>Generado: ${fecha}</span>
</div>

<script>window.onload = () => window.print();</script>
</body>
</html>`;

  const w = window.open("", "_blank");
  if (w) { w.document.write(html); w.document.close(); }
}

// ─── NuevaFichaModal ─────────────────────────────────────────────────────
function NuevaFichaModal({ onClose, onCreate }) {
  const [form, setForm] = useState({
    unidad: "", linea: "", material: "", acabado: "", tecnico: "",
    fecha: new Date().toLocaleDateString("es-AR"), notas: "",
  });
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const LBL = { fontSize: 9, letterSpacing: 2, color: C.t2, display: "block", marginBottom: 4, textTransform: "uppercase", fontWeight: 600 };
  const ok = form.unidad.trim();

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 2000, background: "rgba(0,0,0,0.82)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#0f0f12", border: `1px solid ${C.b1}`, borderRadius: 14, padding: 26, width: 490, maxWidth: "94vw" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.t0, marginBottom: 20 }}>Nueva ficha de enchapado</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={LBL}>Unidad *</label>
            <input style={INP} placeholder="Ej: 64-19, K43-22, 85-2" value={form.unidad} onChange={e => f("unidad", e.target.value)} autoFocus />
          </div>
          <div>
            <label style={LBL}>Línea</label>
            <input style={INP} placeholder="Ej: K52, 85, K43" value={form.linea} onChange={e => f("linea", e.target.value)} />
          </div>
          <div>
            <label style={LBL}>Fecha</label>
            <input style={INP} value={form.fecha} onChange={e => f("fecha", e.target.value)} />
          </div>
          <div>
            <label style={LBL}>Material / Chapa</label>
            <input style={INP} placeholder="Nogal, Roble, Noce Canaletto…" value={form.material} onChange={e => f("material", e.target.value)} />
          </div>
          <div>
            <label style={LBL}>Acabado</label>
            <input style={INP} placeholder="rayado, natural, tinte…" value={form.acabado} onChange={e => f("acabado", e.target.value)} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={LBL}>Técnico</label>
            <input style={INP} placeholder="Nombre del técnico" value={form.tecnico} onChange={e => f("tecnico", e.target.value)} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={LBL}>Notas</label>
            <textarea style={{ ...INP, height: 58, resize: "vertical", lineHeight: 1.5 }} placeholder="Observaciones generales…" value={form.notas} onChange={e => f("notas", e.target.value)} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "8px 16px", background: C.s0, border: `1px solid ${C.b0}`, color: C.t1, borderRadius: 8, cursor: "pointer", fontSize: 12, fontFamily: C.sans }}>Cancelar</button>
          <button onClick={() => ok && onCreate(form)} disabled={!ok} style={{ padding: "8px 22px", background: C.s1, border: `1px solid ${C.b1}`, color: C.t0, borderRadius: 8, cursor: ok ? "pointer" : "not-allowed", fontSize: 12, fontWeight: 600, fontFamily: C.sans, opacity: ok ? 1 : 0.45 }}>Crear ficha</button>
        </div>
      </div>
    </div>
  );
}

// ─── PlacaEditor ──────────────────────────────────────────────────────────
function PlacaEditor({ items, onAdd, onUpdate, onRemove, esAdmin }) {
  const [n, setN] = useState({ letra: "", descripcion: "" });
  const add = () => { if (n.descripcion.trim()) { onAdd(n); setN({ letra: "", descripcion: "" }); } };

  return (
    <div>
      {items.map((p, i) => (
        <div key={p.id || i} style={{ display: "grid", gridTemplateColumns: "40px 1fr 28px", gap: 6, alignItems: "center", marginBottom: 5 }}>
          <input style={{ ...INP, textAlign: "center", fontWeight: 700, padding: "5px 4px" }} value={p.letra || ""} placeholder="A" onChange={e => onUpdate(p.id, { ...p, letra: e.target.value.toUpperCase() })} readOnly={!esAdmin} />
          <input style={INP} value={p.descripcion || ""} placeholder="Ej: 4 Placas de carpintero 160 x 220 cm" onChange={e => onUpdate(p.id, { ...p, descripcion: e.target.value })} readOnly={!esAdmin} />
          {esAdmin && <button onClick={() => onRemove(p.id)} style={{ border: "none", background: "transparent", color: C.t2, cursor: "pointer", fontSize: 17, lineHeight: 1, padding: 0 }}>×</button>}
        </div>
      ))}
      {esAdmin && (
        <div style={{ display: "grid", gridTemplateColumns: "40px 1fr 28px", gap: 6, marginTop: 8 }}>
          <input style={{ ...INP, textAlign: "center", fontWeight: 700, padding: "5px 4px" }} value={n.letra} placeholder="A" onChange={e => setN(p => ({ ...p, letra: e.target.value.toUpperCase() }))} />
          <input style={INP} value={n.descripcion} placeholder="Nueva placa…" onChange={e => setN(p => ({ ...p, descripcion: e.target.value }))} onKeyDown={e => e.key === "Enter" && add()} />
          <button onClick={add} style={{ background: C.s1, border: `1px solid ${C.b0}`, color: C.t1, borderRadius: 7, cursor: "pointer", fontSize: 16, lineHeight: 1, fontFamily: C.sans }}>+</button>
        </div>
      )}
    </div>
  );
}

// ─── HojasEditor ─────────────────────────────────────────────────────────
function HojasEditor({ items, onAdd, onUpdate, onRemove, esAdmin }) {
  const [n, setN] = useState({ letra: "", cantidad: "", material: "", medidas: "" });
  const add = () => { if (n.material.trim()) { onAdd(n); setN({ letra: "", cantidad: "", material: "", medidas: "" }); } };

  const ColLabel = ({ children }) => (
    <div style={{ fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: C.t2, fontWeight: 600, paddingBottom: 5 }}>{children}</div>
  );

  return (
    <div>
      {/* Header */}
      <div style={{ display: "grid", gridTemplateColumns: "36px 68px 1fr 140px 28px", gap: 6, marginBottom: 6, paddingBottom: 6, borderBottom: `1px solid ${C.b0}` }}>
        <ColLabel></ColLabel>
        <ColLabel>Cant.</ColLabel>
        <ColLabel>Material</ColLabel>
        <ColLabel>Medidas</ColLabel>
        <div />
      </div>
      {items.map((h, i) => (
        <div key={h.id || i} style={{ display: "grid", gridTemplateColumns: "36px 68px 1fr 140px 28px", gap: 6, alignItems: "center", marginBottom: 5 }}>
          <input style={{ ...INP, textAlign: "center", fontWeight: 700, padding: "5px 4px" }} value={h.letra || ""} placeholder="A" onChange={e => onUpdate(h.id, { ...h, letra: e.target.value.toUpperCase() })} readOnly={!esAdmin} />
          <input style={{ ...INP, textAlign: "center" }} value={h.cantidad || ""} placeholder="0" type="number" min="1" onChange={e => onUpdate(h.id, { ...h, cantidad: e.target.value })} readOnly={!esAdmin} />
          <input style={INP} value={h.material || ""} placeholder="Ej: Hojas de Nogal Italiano Rayado" onChange={e => onUpdate(h.id, { ...h, material: e.target.value })} readOnly={!esAdmin} />
          <input style={INP} value={h.medidas || ""} placeholder="Ej: 70x210" onChange={e => onUpdate(h.id, { ...h, medidas: e.target.value })} readOnly={!esAdmin} />
          {esAdmin && <button onClick={() => onRemove(h.id)} style={{ border: "none", background: "transparent", color: C.t2, cursor: "pointer", fontSize: 17, lineHeight: 1, padding: 0 }}>×</button>}
        </div>
      ))}
      {esAdmin && (
        <div style={{ display: "grid", gridTemplateColumns: "36px 68px 1fr 140px 28px", gap: 6, marginTop: 8 }}>
          <input style={{ ...INP, textAlign: "center", fontWeight: 700, padding: "5px 4px" }} value={n.letra} placeholder="A" onChange={e => setN(p => ({ ...p, letra: e.target.value.toUpperCase() }))} />
          <input style={{ ...INP, textAlign: "center" }} value={n.cantidad} placeholder="0" type="number" min="1" onChange={e => setN(p => ({ ...p, cantidad: e.target.value }))} />
          <input style={INP} value={n.material} placeholder="Material / descripción…" onChange={e => setN(p => ({ ...p, material: e.target.value }))} />
          <input style={INP} value={n.medidas} placeholder="Medidas" onChange={e => setN(p => ({ ...p, medidas: e.target.value }))} onKeyDown={e => e.key === "Enter" && add()} />
          <button onClick={add} style={{ background: C.s1, border: `1px solid ${C.b0}`, color: C.t1, borderRadius: 7, cursor: "pointer", fontSize: 16, lineHeight: 1 }}>+</button>
        </div>
      )}
    </div>
  );
}

// ─── TrabajoEditor ───────────────────────────────────────────────────────
function TrabajoEditor({ items, onAdd, onUpdate, onRemove, esAdmin }) {
  const [n, setN] = useState({ letra: "", cantidad_placas: "", medidas: "", cantidad_caras: "1 cara", sentido_veta: "A lo largo", fin_pieza: "" });
  const add = () => { if (n.medidas.trim() || n.cantidad_placas.trim()) { onAdd(n); setN({ letra: "", cantidad_placas: "", medidas: "", cantidad_caras: "1 cara", sentido_veta: "A lo largo", fin_pieza: "" }); } };

  const cols = "36px 110px 110px 96px 1fr 170px 28px";
  const ColLabel = ({ children }) => (
    <div style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: C.t2, fontWeight: 600, paddingBottom: 5 }}>{children}</div>
  );

  const carasSt = v => ({
    ...INP, padding: "5px 8px", cursor: esAdmin ? "pointer" : "default",
    color: v === "2 caras" ? C.amber : C.t1,
    borderColor: v === "2 caras" ? "rgba(245,158,11,0.3)" : C.b0,
  });

  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ minWidth: 700 }}>
        <div style={{ display: "grid", gridTemplateColumns: cols, gap: 6, marginBottom: 6, paddingBottom: 6, borderBottom: `1px solid ${C.b0}` }}>
          <ColLabel></ColLabel>
          <ColLabel>Cant. placas</ColLabel>
          <ColLabel>Medidas [cm]</ColLabel>
          <ColLabel>Caras</ColLabel>
          <ColLabel>Fin / Pieza</ColLabel>
          <ColLabel>Sentido de veta</ColLabel>
          <div />
        </div>

        {items.map((t, i) => (
          <div key={t.id || i} style={{ display: "grid", gridTemplateColumns: cols, gap: 6, alignItems: "center", marginBottom: 5 }}>
            <input style={{ ...INP, textAlign: "center", fontWeight: 700, padding: "5px 4px" }} value={t.letra || ""} placeholder="A" onChange={e => onUpdate(t.id, { ...t, letra: e.target.value.toUpperCase() })} readOnly={!esAdmin} />
            <input style={INP} value={t.cantidad_placas || ""} placeholder="Ej: 7 (terciado)" onChange={e => onUpdate(t.id, { ...t, cantidad_placas: e.target.value })} readOnly={!esAdmin} />
            <input style={INP} value={t.medidas || ""} placeholder="160x210" onChange={e => onUpdate(t.id, { ...t, medidas: e.target.value })} readOnly={!esAdmin} />
            <select style={carasSt(t.cantidad_caras)} value={t.cantidad_caras || "1 cara"} onChange={e => onUpdate(t.id, { ...t, cantidad_caras: e.target.value })} disabled={!esAdmin}>
              <option>1 cara</option>
              <option>2 caras</option>
            </select>
            <input style={INP} value={t.fin_pieza || ""} placeholder="Descripción de la pieza" onChange={e => onUpdate(t.id, { ...t, fin_pieza: e.target.value })} readOnly={!esAdmin} />
            <select style={{ ...INP, padding: "5px 8px" }} value={t.sentido_veta || ""} onChange={e => onUpdate(t.id, { ...t, sentido_veta: e.target.value })} disabled={!esAdmin}>
              <option value="">—</option>
              {SENTIDOS_VETA.map(s => <option key={s}>{s}</option>)}
            </select>
            {esAdmin && <button onClick={() => onRemove(t.id)} style={{ border: "none", background: "transparent", color: C.t2, cursor: "pointer", fontSize: 17, lineHeight: 1, padding: 0 }}>×</button>}
          </div>
        ))}

        {esAdmin && (
          <div style={{ display: "grid", gridTemplateColumns: cols, gap: 6, marginTop: 8 }}>
            <input style={{ ...INP, textAlign: "center", fontWeight: 700, padding: "5px 4px" }} value={n.letra} placeholder="A" onChange={e => setN(p => ({ ...p, letra: e.target.value.toUpperCase() }))} />
            <input style={INP} value={n.cantidad_placas} placeholder="Cant." onChange={e => setN(p => ({ ...p, cantidad_placas: e.target.value }))} />
            <input style={INP} value={n.medidas} placeholder="Medidas" onChange={e => setN(p => ({ ...p, medidas: e.target.value }))} />
            <select style={{ ...INP, padding: "5px 8px" }} value={n.cantidad_caras} onChange={e => setN(p => ({ ...p, cantidad_caras: e.target.value }))}>
              <option>1 cara</option>
              <option>2 caras</option>
            </select>
            <input style={INP} value={n.fin_pieza} placeholder="Fin/pieza" onChange={e => setN(p => ({ ...p, fin_pieza: e.target.value }))} />
            <select style={{ ...INP, padding: "5px 8px" }} value={n.sentido_veta} onChange={e => setN(p => ({ ...p, sentido_veta: e.target.value }))}>
              <option value="">—</option>
              {SENTIDOS_VETA.map(s => <option key={s}>{s}</option>)}
            </select>
            <button onClick={add} style={{ background: C.s1, border: `1px solid ${C.b0}`, color: C.t1, borderRadius: 7, cursor: "pointer", fontSize: 16, lineHeight: 1 }}>+</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── FichaInfo (datos generales con auto-save) ───────────────────────────
function FichaInfo({ ficha, onChange, esAdmin }) {
  const LBL = { fontSize: 9, letterSpacing: 2, color: C.t2, display: "block", marginBottom: 4, textTransform: "uppercase", fontWeight: 600 };
  const f = (k, v) => onChange({ ...ficha, [k]: v });

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
      <div>
        <label style={LBL}>Material / Chapa</label>
        <input style={INP} value={ficha.material || ""} onChange={e => f("material", e.target.value)} placeholder="Nogal, Roble, Noce…" readOnly={!esAdmin} />
      </div>
      <div>
        <label style={LBL}>Acabado</label>
        <input style={INP} value={ficha.acabado || ""} onChange={e => f("acabado", e.target.value)} placeholder="rayado, natural, tinte…" readOnly={!esAdmin} />
      </div>
      <div>
        <label style={LBL}>Fecha</label>
        <input style={INP} value={ficha.fecha || ""} onChange={e => f("fecha", e.target.value)} readOnly={!esAdmin} />
      </div>
      <div>
        <label style={LBL}>Técnico</label>
        <input style={INP} value={ficha.tecnico || ""} onChange={e => f("tecnico", e.target.value)} placeholder="David, Gaston…" readOnly={!esAdmin} />
      </div>
      <div>
        <label style={LBL}>Línea</label>
        <input style={INP} value={ficha.linea || ""} onChange={e => f("linea", e.target.value)} placeholder="K52, 85, K43…" readOnly={!esAdmin} />
      </div>
      <div>
        <label style={LBL}>Estado</label>
        <select style={{ ...INP }} value={ficha.estado || "Borrador"} onChange={e => f("estado", e.target.value)} disabled={!esAdmin}>
          {ESTADOS_FICHA.map(e => <option key={e}>{e}</option>)}
        </select>
      </div>
      <div style={{ gridColumn: "1 / -1" }}>
        <label style={LBL}>Notas</label>
        <textarea style={{ ...INP, height: 62, resize: "vertical", lineHeight: 1.6 }} value={ficha.notas || ""} onChange={e => f("notas", e.target.value)} placeholder="Observaciones para la enchapadora…" readOnly={!esAdmin} />
      </div>
    </div>
  );
}

// ─── Vista Previa (replica el formato del Excel) ─────────────────────────
function VistaPrevia({ ficha, placas, hojas, trabajos, onExcelExport, onPDFExport }) {
  const hasFin = trabajos.some(t => t.fin_pieza);
  const totalHojas = hojas.reduce((a, h) => a + (parseInt(h.cantidad) || 0), 0);

  const TH = ({ children, w }) => (
    <th style={{ textAlign: "left", padding: "7px 10px", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: C.t2, borderBottom: `1px solid ${C.b0}`, width: w || "auto" }}>{children}</th>
  );
  const TD = ({ children, mono, accent }) => (
    <td style={{ padding: "6px 10px", color: accent || C.t1, fontSize: 11, fontFamily: mono ? C.mono : C.sans, borderBottom: `1px solid rgba(255,255,255,0.03)` }}>{children}</td>
  );

  return (
    <div>
      {/* Preview card */}
      <div style={{ background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 12, padding: "22px 24px", fontFamily: C.mono, marginBottom: 16 }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18, paddingBottom: 14, borderBottom: `1px solid ${C.b0}` }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.t0, letterSpacing: "-0.01em" }}>
              KLASE A  {ficha.unidad}{ficha.acabado ? `  (${ficha.acabado})` : ""}
            </div>
            {ficha.material && <div style={{ fontSize: 11, color: C.t2, marginTop: 3 }}>{ficha.material}</div>}
            {ficha.linea && <div style={{ fontSize: 10, color: C.t2, marginTop: 2 }}>Línea: {ficha.linea}</div>}
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: C.t1 }}>Fecha: {ficha.fecha || "—"}</div>
            {ficha.tecnico && <div style={{ fontSize: 10, color: C.t2, marginTop: 2 }}>Área Técnica: {ficha.tecnico}</div>}
          </div>
        </div>

        {/* Resumen rápido */}
        <div style={{ display: "flex", gap: 16, marginBottom: 18 }}>
          {[["Placas", placas.length], ["Hojas / Chapas", totalHojas], ["Ítems trabajo", trabajos.length]].map(([lbl, n]) => (
            <div key={lbl} style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${C.b0}`, borderRadius: 8, padding: "8px 14px", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontFamily: C.mono, fontSize: 16, fontWeight: 700, color: C.t0 }}>{n}</span>
              <span style={{ fontSize: 10, color: C.t2, letterSpacing: "0.06em" }}>{lbl}</span>
            </div>
          ))}
        </div>

        {/* PLACAS */}
        {placas.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 9, letterSpacing: 2, color: C.t2, textTransform: "uppercase", marginBottom: 8, paddingBottom: 5, borderBottom: `1px solid ${C.b0}` }}>PLACAS</div>
            {placas.map((p, i) => (
              <div key={i} style={{ display: "flex", gap: 10, padding: "3px 0", fontSize: 11, color: C.t1, borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                {p.letra && <span style={{ fontWeight: 700, color: C.t0, minWidth: 20 }}>{p.letra}</span>}
                <span>{p.descripcion}</span>
              </div>
            ))}
          </div>
        )}

        {/* HOJAS */}
        {hojas.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 9, letterSpacing: 2, color: C.t2, textTransform: "uppercase", marginBottom: 8, paddingBottom: 5, borderBottom: `1px solid ${C.b0}` }}>
              HOJAS O CHAPAS{ficha.material ? ` (${ficha.material})` : ""}
            </div>
            {hojas.map((h, i) => (
              <div key={i} style={{ display: "flex", gap: 10, padding: "3px 0", fontSize: 11, color: C.t1, borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                {h.letra && <span style={{ fontWeight: 700, color: C.t0, minWidth: 20 }}>{h.letra}</span>}
                <span>
                  {h.cantidad && <strong style={{ color: C.t0 }}>{h.cantidad} </strong>}
                  {h.material}
                  {h.medidas && <span style={{ color: C.t2 }}> · {h.medidas}</span>}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* TRABAJO */}
        {trabajos.length > 0 && (
          <div>
            <div style={{ fontSize: 9, letterSpacing: 2, color: C.t2, textTransform: "uppercase", marginBottom: 8, paddingBottom: 5, borderBottom: `1px solid ${C.b0}` }}>TRABAJO A REALIZAR</div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <TH w="36px"></TH>
                  <TH>Cant. placas</TH>
                  <TH>Medidas</TH>
                  <TH>Caras</TH>
                  {hasFin && <TH>Fin / Pieza</TH>}
                  <TH>Sentido veta</TH>
                </tr>
              </thead>
              <tbody>
                {trabajos.map((t, i) => (
                  <tr key={i}>
                    <TD accent={C.t0}><strong>{t.letra}</strong></TD>
                    <TD>{t.cantidad_placas || "—"}</TD>
                    <TD mono>{t.medidas || "—"}</TD>
                    <TD accent={t.cantidad_caras === "2 caras" ? C.amber : C.t1}>{t.cantidad_caras || "—"}</TD>
                    {hasFin && <TD>{t.fin_pieza || "—"}</TD>}
                    <TD accent={C.t2}>{t.sentido_veta || "—"}</TD>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {placas.length === 0 && hojas.length === 0 && trabajos.length === 0 && (
          <div style={{ color: C.t2, fontSize: 12, textAlign: "center", padding: "24px 0" }}>Sin contenido. Completá las secciones anteriores.</div>
        )}
      </div>

      {/* Export buttons */}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onPDFExport} style={{ padding: "9px 20px", background: C.s0, border: `1px solid ${C.b0}`, color: C.t1, borderRadius: 8, cursor: "pointer", fontSize: 11, fontFamily: C.sans, display: "flex", alignItems: "center", gap: 6 }}>
          {Icon.download} Exportar PDF
        </button>
        <button onClick={onExcelExport} style={{ padding: "9px 20px", background: C.s0, border: `1px solid ${C.b0}`, color: C.t1, borderRadius: 8, cursor: "pointer", fontSize: 11, fontFamily: C.sans, display: "flex", alignItems: "center", gap: 6 }}>
          {Icon.download} Exportar Excel
        </button>
      </div>
    </div>
  );
}

// ─── Dashboard ───────────────────────────────────────────────────────────
function Dashboard({ fichas }) {
  const stats = useMemo(() => {
    const byEstado = {};
    ESTADOS_FICHA.forEach(e => (byEstado[e] = 0));
    fichas.forEach(f => { const e = f.estado || "Borrador"; byEstado[e] = (byEstado[e] || 0) + 1; });
    const mats = {};
    fichas.forEach(f => { if (f.material) mats[f.material] = (mats[f.material] || 0) + 1; });
    const topMat = Object.entries(mats).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const recientes = [...fichas].slice(0, 5);
    return { byEstado, topMat, recientes, total: fichas.length };
  }, [fichas]);

  return (
    <div style={{ padding: "40px 36px", maxWidth: 720 }}>
      <div style={{ fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: C.t2, marginBottom: 8, fontFamily: C.mono }}>ENCHAPADORA</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: C.t0, letterSpacing: "-0.02em", marginBottom: 6 }}>Panel de control</div>
      <div style={{ fontSize: 12, color: C.t2, marginBottom: 32, fontFamily: C.mono }}>{stats.total} fichas registradas</div>

      {/* Estado cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 28 }}>
        {ESTADOS_FICHA.map(e => {
          const m = ESTADO_META[e];
          return (
            <div key={e} style={{ background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 10, padding: "16px 16px 12px" }}>
              <div style={{ fontSize: 26, fontWeight: 700, color: m.color, fontFamily: C.mono, lineHeight: 1 }}>{stats.byEstado[e]}</div>
              <div style={{ fontSize: 9, color: C.t2, marginTop: 8, letterSpacing: "0.12em", textTransform: "uppercase" }}>{e}</div>
            </div>
          );
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {/* Top materiales */}
        {stats.topMat.length > 0 && (
          <div style={{ background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 10, padding: "16px 18px" }}>
            <div style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: C.t2, marginBottom: 12 }}>Materiales + usados</div>
            {stats.topMat.map(([mat, cnt]) => (
              <div key={mat} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: `1px solid rgba(255,255,255,0.03)` }}>
                <span style={{ fontSize: 12, color: C.t1 }}>{mat}</span>
                <span style={{ fontFamily: C.mono, fontSize: 11, color: C.t2 }}>{cnt}</span>
              </div>
            ))}
          </div>
        )}
        {/* Recientes */}
        {stats.recientes.length > 0 && (
          <div style={{ background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 10, padding: "16px 18px" }}>
            <div style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: C.t2, marginBottom: 12 }}>Recientes</div>
            {stats.recientes.map(f => {
              const m = ESTADO_META[f.estado || "Borrador"];
              return (
                <div key={f.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: `1px solid rgba(255,255,255,0.03)` }}>
                  <span style={{ fontSize: 12, color: C.t1, fontFamily: C.mono }}>{f.unidad}</span>
                  <span style={{ fontSize: 10, color: m.color, background: m.bg, padding: "1px 7px", borderRadius: 4 }}>{f.estado || "Borrador"}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {fichas.length === 0 && (
        <div style={{ marginTop: 24, fontSize: 12, color: C.t2 }}>
          No hay fichas aún. Usá <strong style={{ color: C.t1 }}>+ Nueva</strong> para crear la primera.
        </div>
      )}
    </div>
  );
}

// ─── EnchapadoView ────────────────────────────────────────────────────────
export default function EnchapadoView({ esAdmin }) {
  const [fichas,     setFichas]     = useState([]);
  const [selId,      setSelId]      = useState(null);
  const [ficha,      setFicha]      = useState(null);
  const [placas,     setPlacas]     = useState([]);
  const [hojas,      setHojas]      = useState([]);
  const [trabajos,   setTrabajos]   = useState([]);
  const [tab,        setTab]        = useState("info");
  const [loading,    setLoading]    = useState(false);
  const [detLoading, setDetLoading] = useState(false);
  const [dbErr,      setDbErr]      = useState(null);
  const [showNueva,  setShowNueva]  = useState(false);
  const [q,          setQ]          = useState("");
  const [filtroEst,  setFiltroEst]  = useState("todos");
  const saveTimer = useRef(null);

  // ── Cargar fichas ──
  async function cargarFichas() {
    setLoading(true);
    const { data, error } = await supabase.from("enchapado_fichas").select("*").order("created_at", { ascending: false });
    if (error) {
      if (error.code === "42P01" || error.message?.includes("does not exist")) setDbErr(true);
      else console.error(error);
      setLoading(false);
      return;
    }
    setFichas(data ?? []);
    setLoading(false);
  }

  // ── Cargar detalle de ficha ──
  async function cargarDetalle(id) {
    setDetLoading(true);
    const [{ data: p }, { data: h }, { data: t }] = await Promise.all([
      supabase.from("enchapado_placas").select("*").eq("ficha_id", id).order("orden").order("created_at"),
      supabase.from("enchapado_hojas").select("*").eq("ficha_id", id).order("orden").order("created_at"),
      supabase.from("enchapado_trabajos").select("*").eq("ficha_id", id).order("orden").order("created_at"),
    ]);
    setPlacas(p ?? []);
    setHojas(h ?? []);
    setTrabajos(t ?? []);
    setDetLoading(false);
  }

  useEffect(() => { cargarFichas(); }, []);

  useEffect(() => {
    if (selId) {
      const found = fichas.find(x => x.id === selId);
      setFicha(found ?? null);
      if (found) cargarDetalle(selId);
      setTab("info");
    } else {
      setFicha(null);
      setPlacas([]);
      setHojas([]);
      setTrabajos([]);
    }
  }, [selId]);

  // ── Auto-save header ──
  function handleFichaChange(updated) {
    setFicha(updated);
    setFichas(p => p.map(f => f.id === updated.id ? { ...f, ...updated } : f));
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      await supabase.from("enchapado_fichas").update({
        linea: updated.linea, unidad: updated.unidad, material: updated.material,
        acabado: updated.acabado, tecnico: updated.tecnico, fecha: updated.fecha,
        notas: updated.notas, estado: updated.estado,
      }).eq("id", updated.id);
    }, 700);
  }

  // ── CRUD fichas ──
  async function crearFicha(form) {
    const { data, error } = await supabase.from("enchapado_fichas").insert({ ...form, estado: "Borrador" }).select().single();
    if (error) return alert(error.message);
    setFichas(p => [data, ...p]);
    setShowNueva(false);
    setSelId(data.id);
  }

  async function eliminarFicha(id) {
    if (!window.confirm("¿Eliminar esta ficha? Se borrará todo su contenido.")) return;
    await supabase.from("enchapado_fichas").delete().eq("id", id);
    setFichas(p => p.filter(f => f.id !== id));
    if (selId === id) setSelId(null);
  }

  async function duplicarFicha() {
    if (!ficha) return;
    const { data: nf, error } = await supabase.from("enchapado_fichas").insert({
      linea: ficha.linea, unidad: ficha.unidad + " (copia)", material: ficha.material,
      acabado: ficha.acabado, tecnico: ficha.tecnico, fecha: ficha.fecha,
      notas: ficha.notas, estado: "Borrador",
    }).select().single();
    if (error) return alert(error.message);
    if (placas.length)  await supabase.from("enchapado_placas").insert(placas.map(({ id, ficha_id, ...r }) => ({ ...r, ficha_id: nf.id })));
    if (hojas.length)   await supabase.from("enchapado_hojas").insert(hojas.map(({ id, ficha_id, ...r }) => ({ ...r, ficha_id: nf.id })));
    if (trabajos.length) await supabase.from("enchapado_trabajos").insert(trabajos.map(({ id, ficha_id, ...r }) => ({ ...r, ficha_id: nf.id })));
    await cargarFichas();
    setSelId(nf.id);
  }

  // ── CRUD placas ──
  const addPlaca     = async item => { const { data } = await supabase.from("enchapado_placas").insert({ ficha_id: selId, ...item, orden: placas.length }).select().single(); if (data) setPlacas(p => [...p, data]); };
  const updatePlaca  = (id, item) => { setPlacas(p => p.map(x => x.id === id ? { ...x, ...item } : x)); clearTimeout(saveTimer.current); saveTimer.current = setTimeout(() => supabase.from("enchapado_placas").update({ letra: item.letra, descripcion: item.descripcion }).eq("id", id), 700); };
  const removePlaca  = async id => { await supabase.from("enchapado_placas").delete().eq("id", id); setPlacas(p => p.filter(x => x.id !== id)); };

  // ── CRUD hojas ──
  const addHoja     = async item => { const { data } = await supabase.from("enchapado_hojas").insert({ ficha_id: selId, ...item, orden: hojas.length }).select().single(); if (data) setHojas(p => [...p, data]); };
  const updateHoja  = (id, item) => { setHojas(p => p.map(x => x.id === id ? { ...x, ...item } : x)); clearTimeout(saveTimer.current); saveTimer.current = setTimeout(() => supabase.from("enchapado_hojas").update({ letra: item.letra, material: item.material, cantidad: item.cantidad, medidas: item.medidas }).eq("id", id), 700); };
  const removeHoja  = async id => { await supabase.from("enchapado_hojas").delete().eq("id", id); setHojas(p => p.filter(x => x.id !== id)); };

  // ── CRUD trabajos ──
  const addTrabajo     = async item => { const { data } = await supabase.from("enchapado_trabajos").insert({ ficha_id: selId, ...item, orden: trabajos.length }).select().single(); if (data) setTrabajos(p => [...p, data]); };
  const updateTrabajo  = (id, item) => { setTrabajos(p => p.map(x => x.id === id ? { ...x, ...item } : x)); clearTimeout(saveTimer.current); saveTimer.current = setTimeout(() => supabase.from("enchapado_trabajos").update({ letra: item.letra, cantidad_placas: item.cantidad_placas, medidas: item.medidas, cantidad_caras: item.cantidad_caras, sentido_veta: item.sentido_veta, fin_pieza: item.fin_pieza }).eq("id", id), 700); };
  const removeTrabajo  = async id => { await supabase.from("enchapado_trabajos").delete().eq("id", id); setTrabajos(p => p.filter(x => x.id !== id)); };

  // ── Filtrado ──
  const filtered = useMemo(() => {
    let rows = fichas;
    if (filtroEst !== "todos") rows = rows.filter(f => (f.estado || "Borrador") === filtroEst);
    if (q.trim()) {
      const qq = q.toLowerCase();
      rows = rows.filter(f =>
        (f.unidad || "").toLowerCase().includes(qq) ||
        (f.material || "").toLowerCase().includes(qq) ||
        (f.acabado || "").toLowerCase().includes(qq) ||
        (f.linea || "").toLowerCase().includes(qq) ||
        (f.tecnico || "").toLowerCase().includes(qq)
      );
    }
    return rows;
  }, [fichas, filtroEst, q]);

  // ── Error de DB ──
  if (dbErr) return (
    <div style={{ padding: 32 }}>
      <div style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 12, padding: 22, maxWidth: 620 }}>
        <div style={{ fontSize: 12, color: "#f87171", fontWeight: 600, marginBottom: 10 }}>Faltan las tablas de enchapado</div>
        <div style={{ fontSize: 11, color: C.t2, marginBottom: 12 }}>
          Andá a <strong style={{ color: C.t1 }}>Supabase → SQL Editor</strong> y ejecutá este SQL:
        </div>
        <pre style={{ background: "#0a0a0d", border: `1px solid ${C.b0}`, borderRadius: 8, padding: 14, fontSize: 10, color: C.t1, overflowX: "auto", fontFamily: C.mono, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{SQL_SETUP}</pre>
        <button onClick={() => { setDbErr(false); cargarFichas(); }} style={{ marginTop: 12, padding: "7px 18px", background: C.s1, border: `1px solid ${C.b0}`, color: C.t0, borderRadius: 7, cursor: "pointer", fontSize: 11, fontFamily: C.sans }}>Reintentar</button>
      </div>
    </div>
  );

  const tabSt = active => ({
    border: active ? `1px solid ${C.b1}` : "1px solid transparent",
    background: active ? C.s1 : "transparent",
    color: active ? C.t0 : C.t2,
    padding: "6px 14px",
    borderRadius: 7,
    cursor: "pointer",
    fontSize: 11,
    fontFamily: C.sans,
    transition: "all .15s",
    whiteSpace: "nowrap",
  });

  const TABS = [
    ["info",     "Datos"],
    ["placas",   "Placas"],
    ["hojas",    "Hojas / Chapas"],
    ["trabajo",  "Trabajo a realizar"],
    ["preview",  "Vista previa"],
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "272px 1fr", height: "100vh", overflow: "hidden" }}>
      <style>{`
        select option { background: #0f0f12; color: #a1a1aa; }
        input:read-only { opacity: 0.7; cursor: default; }
        textarea:read-only { opacity: 0.7; cursor: default; }
      `}</style>

      {/* ══ LEFT PANEL ══ */}
      <div style={{ height: "100vh", overflowY: "auto", borderRight: `1px solid ${C.b0}`, background: "rgba(9,9,11,0.98)", display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div style={{ padding: "18px 16px 10px", borderBottom: `1px solid ${C.b0}`, flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.t0 }}>Enchapadora</div>
              <div style={{ fontSize: 10, color: C.t2, marginTop: 2, fontFamily: C.mono }}>{fichas.length} fichas</div>
            </div>
            {esAdmin && (
              <button onClick={() => setShowNueva(true)} style={{ padding: "5px 11px", background: C.s1, border: `1px solid ${C.b0}`, color: C.t1, borderRadius: 7, cursor: "pointer", fontSize: 11, fontWeight: 500, fontFamily: C.sans, display: "flex", alignItems: "center", gap: 5 }}>
                  {Icon.plus} Nueva
                </button>
            )}
          </div>
          <input style={{ ...INP, padding: "6px 10px", fontSize: 11 }} placeholder="Buscar unidad, material…" value={q} onChange={e => setQ(e.target.value)} />
        </div>

        {/* Filtros estado */}
        <div style={{ padding: "7px 10px", borderBottom: `1px solid ${C.b0}`, display: "flex", gap: 3, flexWrap: "wrap", flexShrink: 0 }}>
          {["todos", ...ESTADOS_FICHA].map(e => (
            <button key={e} onClick={() => setFiltroEst(e)} style={{
              padding: "3px 9px", borderRadius: 5, cursor: "pointer", fontSize: 10, fontFamily: C.sans,
              background: filtroEst === e ? C.s1 : "transparent",
              border: filtroEst === e ? `1px solid ${C.b1}` : "1px solid transparent",
              color: filtroEst === e ? C.t0 : C.t2,
            }}>{e === "todos" ? "Todas" : e}</button>
          ))}
        </div>

        {/* Lista */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {loading ? (
            <div style={{ padding: "30px 16px", textAlign: "center", color: C.t2, fontSize: 11 }}>Cargando…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: "30px 16px", textAlign: "center", color: C.t2, fontSize: 11 }}>
              {fichas.length === 0 ? "Sin fichas. Creá la primera con + Nueva." : "Sin resultados."}
            </div>
          ) : filtered.map(f => {
            const sel = selId === f.id;
            const m = ESTADO_META[f.estado || "Borrador"];
            return (
              <div key={f.id} onClick={() => setSelId(f.id)} style={{
                padding: "11px 16px",
                borderBottom: `1px solid rgba(255,255,255,0.04)`,
                background: sel ? "rgba(59,130,246,0.07)" : "transparent",
                borderLeft: `2px solid ${sel ? "rgba(59,130,246,0.6)" : "transparent"}`,
                cursor: "pointer",
                transition: "all .12s",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6, marginBottom: 3 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: sel ? C.t0 : C.t1, fontFamily: C.mono }}>{f.unidad}</div>
                  <div style={{ fontSize: 10, color: m.color, background: m.bg, padding: "1px 7px", borderRadius: 4, flexShrink: 0 }}>{f.estado || "Borrador"}</div>
                </div>
                {(f.material || f.acabado) && (
                  <div style={{ fontSize: 10, color: C.t2 }}>{[f.material, f.acabado].filter(Boolean).join(" · ")}</div>
                )}
                {(f.fecha || f.tecnico) && (
                  <div style={{ fontSize: 10, color: C.t2, marginTop: 2 }}>
                    {[f.fecha, f.tecnico].filter(Boolean).join("  ·  ")}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ══ RIGHT PANEL ══ */}
      <div style={{ height: "100vh", overflowY: "auto" }}>
        {!selId ? (
          <Dashboard fichas={fichas} />
        ) : !ficha ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: C.t2, fontSize: 12 }}>Cargando…</div>
        ) : (
          <div style={{ padding: "28px 34px 60px" }}>
            {/* ── Header ficha ── */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22 }}>
              <div>
                <div style={{ fontSize: 24, fontWeight: 700, color: C.t0, letterSpacing: "-0.02em", fontFamily: C.mono }}>
                  {ficha.unidad}
                </div>
                <div style={{ fontSize: 12, color: C.t2, marginTop: 5 }}>
                  {[ficha.linea, ficha.material, ficha.acabado].filter(Boolean).join(" · ") || "Sin detalle de material"}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <button onClick={() => exportarPDF(ficha, placas, hojas, trabajos)} style={{ padding: "7px 14px", background: C.s0, border: `1px solid ${C.b0}`, color: C.t1, borderRadius: 8, cursor: "pointer", fontSize: 11, fontFamily: C.sans, display: "flex", alignItems: "center", gap: 5 }}>{Icon.download} PDF</button>
                <button onClick={() => exportarExcel(ficha, placas, hojas, trabajos)} style={{ padding: "7px 14px", background: C.s0, border: `1px solid ${C.b0}`, color: C.t1, borderRadius: 8, cursor: "pointer", fontSize: 11, fontFamily: C.sans, display: "flex", alignItems: "center", gap: 5 }}>{Icon.download} Excel</button>
                {esAdmin && (
                  <>
                    <button onClick={duplicarFicha} style={{ padding: "7px 14px", background: C.s0, border: `1px solid ${C.b0}`, color: C.t1, borderRadius: 8, cursor: "pointer", fontSize: 11, fontFamily: C.sans, display: "flex", alignItems: "center", gap: 5 }}>{Icon.copy} Duplicar</button>
                    <button onClick={() => eliminarFicha(selId)} style={{ padding: "7px 12px", background: "transparent", border: `1px solid rgba(239,68,68,0.18)`, color: "rgba(239,68,68,0.65)", borderRadius: 8, cursor: "pointer", fontSize: 11, fontFamily: C.sans, display: "flex", alignItems: "center", gap: 5 }}>{Icon.trash}</button>
                  </>
                )}
              </div>
            </div>

            {/* ── Tabs ── */}
            <div style={{ display: "flex", gap: 4, marginBottom: 22, borderBottom: `1px solid ${C.b0}`, paddingBottom: 8, overflowX: "auto" }}>
              {TABS.map(([key, label]) => (
                <button key={key} style={tabSt(tab === key)} onClick={() => setTab(key)}>{label}</button>
              ))}
            </div>

            {/* ── Tab content ── */}
            {detLoading ? (
              <div style={{ padding: "30px 0", textAlign: "center", color: C.t2, fontSize: 12 }}>Cargando…</div>
            ) : (
              <>
                {tab === "info" && <FichaInfo ficha={ficha} onChange={handleFichaChange} esAdmin={esAdmin} />}

                {tab === "placas" && (
                  <div>
                    <div style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: C.t2, marginBottom: 14 }}>Placas · {placas.length} ítems</div>
                    <PlacaEditor items={placas} onAdd={addPlaca} onUpdate={updatePlaca} onRemove={removePlaca} esAdmin={esAdmin} />
                  </div>
                )}

                {tab === "hojas" && (
                  <div>
                    <div style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: C.t2, marginBottom: 14 }}>Hojas / Chapas · {hojas.length} ítems · {hojas.reduce((a, h) => a + (parseInt(h.cantidad) || 0), 0)} unidades</div>
                    <HojasEditor items={hojas} onAdd={addHoja} onUpdate={updateHoja} onRemove={removeHoja} esAdmin={esAdmin} />
                  </div>
                )}

                {tab === "trabajo" && (
                  <div>
                    <div style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: C.t2, marginBottom: 14 }}>Trabajo a realizar · {trabajos.length} ítems · {trabajos.filter(t => t.cantidad_caras === "2 caras").length} a dos caras</div>
                    <TrabajoEditor items={trabajos} onAdd={addTrabajo} onUpdate={updateTrabajo} onRemove={removeTrabajo} esAdmin={esAdmin} />
                  </div>
                )}

                {tab === "preview" && (
                  <VistaPrevia
                    ficha={ficha}
                    placas={placas}
                    hojas={hojas}
                    trabajos={trabajos}
                    onExcelExport={() => exportarExcel(ficha, placas, hojas, trabajos)}
                    onPDFExport={() => exportarPDF(ficha, placas, hojas, trabajos)}
                  />
                )}
              </>
            )}
          </div>
        )}
      </div>

      {showNueva && <NuevaFichaModal onClose={() => setShowNueva(false)} onCreate={crearFicha} />}
    </div>
  );
}
