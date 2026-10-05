import { C } from "@/theme";
// EnchapadoView.jsx  —  Gestión de OTs para Enchapadora
// ─────────────────────────────────────────────────────────────────────────────
// SCHEMA COMPLETO (ejecutar en SQL Editor si es tabla nueva):
//
//   create table enchapado_ots (
//     id                  uuid primary key default gen_random_uuid(),
//     modelo              text not null,
//     barco               text not null,
//     tipo_chapa          text,
//     fecha               date,
//     responsable         text,
//     estado              text default 'Pendiente',
//     notas               text,
//     fecha_desmolde_est  date,
//     fecha_desmolde_real date,
//     fecha_botada        date,
//     tablones_pedido     boolean default false,
//     tablones_enviado    boolean default false,
//     herrajes_pedido     boolean default false,
//     herrajes_enviado    boolean default false,
//     created_at          timestamptz default now()
//   );
//
//   create table enchapado_ot_items (
//     id                 uuid primary key default gen_random_uuid(),
//     ot_id              uuid references enchapado_ots(id) on delete cascade,
//     item_id            text not null,
//     chapas_descripcion text,
//     created_at         timestamptz default now()
//   );
//
// Si la tabla ya existe, agregar las columnas nuevas:
//   alter table enchapado_ots add column if not exists fecha_desmolde_est  date;
//   alter table enchapado_ots add column if not exists fecha_desmolde_real date;
//   alter table enchapado_ots add column if not exists fecha_botada        date;
//   alter table enchapado_ots add column if not exists tablones_pedido     boolean default false;
//   alter table enchapado_ots add column if not exists tablones_enviado    boolean default false;
//   alter table enchapado_ots add column if not exists herrajes_pedido     boolean default false;
//   alter table enchapado_ots add column if not exists herrajes_enviado    boolean default false;
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { supabase } from "@/supabaseClient";
import { ArrowLeft, Hammer, Pencil, Printer, RefreshCw, Trash2 } from "lucide-react";
import { ChapaReferenceCard, ChapaSwatch, chapaColor, chapaGradient, esNogal } from "@/features/muebles/chapa";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { Aviso, Estado, Tag, Tarea } from "./ui";
import Cargando from "@/components/ui/Cargando";

// ── Design tokens ──────────────────────────────────────────────────────────
const INP = {
  background: "var(--panel)",
  border: `1px solid ${C.b0}`,
  color: C.t0,
  padding: "7px 10px",
  borderRadius: 7,
  fontSize: 13,
  outline: "none",
  width: "100%",
  fontFamily: C.sans,
};

// ── Estado OT ──────────────────────────────────────────────────────────────
const ESTADOS_OT = ["Pendiente", "Enviada", "Devuelta", "Rehacer"];
const ESTADO_META = {
  "Pendiente": { color: C.t2,    bg: "transparent",              dot: "var(--border-3)" },
  "Enviada":   { color: C.blue, bg: C.blueL,                      dot: C.blue },
  "Devuelta":  { color: C.green, bg: "rgba(16,185,129,0.1)",     dot: C.green },
  "Rehacer":   { color: C.red,   bg: "rgba(239,68,68,0.1)",      dot: C.red },
};

// ── Tipos de chapa comunes ─────────────────────────────────────────────────
const CHAPAS_SUGERIDAS = [
  "Nogal Natural", "Nogal Italiano Rayado", "Nogal Poro Cerrado", "Nogal Rayado",
  "Roble Plata Rayado", "Roble Tinte Rayado",
  "Noce Canaletto",
  "Chocolate Floreado", "Milan Fumé", "Gris Terso", "Formica Blanca",
];

// ── Plantillas fijas por modelo ────────────────────────────────────────────
const CHAPAS_REALES = [
  "Roble Cape Gris", "Roble Avorio", "Roble Fume", "Nocce Canaletto",
  "Milan Fiume", "Gris TX", "Ebano Negro", "Eucalipto Termotratado",
  "Wengue T A16", "NRR", "X08", "X14 Egamo", "X18", "X20",
  "X22 Teka II", "X32 Egamo Negro", "X33 Gris Terso",
  "X37 Roble Avorio", "X38 Roble Fume", "Xa35 Nogal Rayado",
];

const CHAPAS_OPCIONES = [...new Set([...CHAPAS_SUGERIDAS, ...CHAPAS_REALES])];

const TEMPLATES = {
  K34: {
    placas: ["3 Terciados 3 mm", "6 Placas de carpintero"],
    items: [
      { id: "A", material: "3 terciados 3 mm",  medidas: "160 × 220 cm", caras: "1 cara",   veta: "A lo largo" },
      { id: "B", material: "1 placa",            medidas: "160 × 220 cm", caras: "1 cara",   veta: "A lo largo" },
      { id: "C", material: "2 placas",           medidas: "160 × 220 cm", caras: "1 cara",   veta: "A lo ancho" },
      { id: "D", material: "1 placa",            medidas: "160 × 220 cm", caras: "2 caras",  veta: "A lo largo" },
      { id: "E", material: "2 placas",           medidas: "160 × 220 cm", caras: "2 caras",  veta: "A lo ancho" },
    ],
    tablones: { lenga: 2, okume: 1 },
  },
  K37: {
    placas: ["4 Terciados 3 mm", "8 Placas de carpintero"],
    items: [
      { id: "A", material: "4 terciados 3 mm",  medidas: "160 × 210 cm", caras: "1 cara",   veta: "A lo largo" },
      { id: "B", material: "4 placas",           medidas: "160 × 220 cm", caras: "2 caras",  veta: "A lo ancho" },
      { id: "C", material: "1 placa",            medidas: "160 × 220 cm", caras: "2 caras",  veta: "A lo largo" },
      { id: "D", material: "2 placas",           medidas: "160 × 220 cm", caras: "1 cara",   veta: "A lo ancho" },
      { id: "E", material: "1 placa",            medidas: "160 × 220 cm", caras: "1 cara",   veta: "A lo largo" },
    ],
    tablones: { lenga: 4, okume: 3 },
  },
  K42: {
    placas: ["7 Terciados 3 mm", "8 Placas de carpintero"],
    items: [
      { id: "A", material: "7 terciados 3 mm",  medidas: "160 × 210 cm", caras: "1 cara",   veta: "A lo largo" },
      { id: "B", material: "4 placas",           medidas: "160 × 220 cm", caras: "1 cara",   veta: "A lo largo" },
      { id: "C", material: "2 placas",           medidas: "160 × 220 cm", caras: "2 caras",  veta: "A lo largo" },
      { id: "D", material: "2 placas",           medidas: "160 × 220 cm", caras: "2 caras",  veta: "A lo ancho" },
    ],
    tablones: { lenga: 4, okume: 3 },
  },
  K43: {
    placas: ["6 Terciados 3 mm", "12 Placas de carpintero"],
    items: [
      { id: "A", material: "6 terciados 3 mm",  medidas: "160 × 220 cm", caras: "1 cara",   veta: "A lo largo" },
      { id: "B", material: "7 placas",           medidas: "160 × 220 cm", caras: "1 cara",   veta: "A lo largo" },
      { id: "C", material: "3 placas",           medidas: "160 × 220 cm", caras: "2 caras",  veta: "A lo largo" },
      { id: "D", material: "2 placas",           medidas: "160 × 220 cm", caras: "2 caras",  veta: "A lo ancho" },
    ],
    tablones: { lenga: 4, okume: 3 },
  },
  K52: {
    placas: ["10 Terciados 3 mm", "4 Terciados 9 mm", "16 Placas de carpintero"],
    items: [
      { id: "1", material: "10 placas",          medidas: "160 × 220 cm", caras: "2 caras",  veta: "A lo largo" },
      { id: "2", material: "2 placas",           medidas: "160 × 220 cm", caras: "1 cara",   veta: "A lo largo" },
      { id: "3", material: "2 placas",           medidas: "160 × 220 cm", caras: "1 cara",   veta: "A lo ancho" },
      { id: "4", material: "2 placas",           medidas: "160 × 220 cm", caras: "2 caras",  veta: "A lo ancho" },
      { id: "5", material: "10 terciados 3 mm",  medidas: "160 × 220 cm", caras: "1 cara",   veta: "A lo largo" },
      { id: "6", material: "4 terciados 9 mm",   medidas: "100 × 220 cm", caras: "1 cara",   veta: "A lo ancho" },
    ],
    tablones: { lenga: 5, okume: 4 },
  },
  K55: {
    placas: ["10 Terciados 3 mm", "4 Terciados 9 mm", "28 Placas de carpintero"],
    items: [
      { id: "1", material: "16 placas",          medidas: "160 × 220 cm", caras: "2 caras",  veta: "A lo largo" },
      { id: "2", material: "8 placas",           medidas: "160 × 220 cm", caras: "1 cara",   veta: "A lo largo" },
      { id: "3", material: "2 placas",           medidas: "160 × 220 cm", caras: "1 cara",   veta: "A lo ancho" },
      { id: "4", material: "2 placas",           medidas: "160 × 220 cm", caras: "2 caras",  veta: "A lo ancho" },
      { id: "5", material: "10 terciados 3 mm",  medidas: "160 × 220 cm", caras: "1 cara",   veta: "A lo largo" },
      { id: "6", material: "4 terciados 9 mm",   medidas: "100 × 220 cm", caras: "1 cara",   veta: "A lo ancho" },
    ],
    tablones: { lenga: 6, okume: 4 },
  },
};

// ── Fechas de producción 2026 (fuente: Fechas_2026.xlsx) ──────────────────
const BARCOS_FECHAS = {
  "H172":  { desmolde_est: null,         desmolde_real: "2026-10-20", botada: "2026-03-23" },
  "H173":  { desmolde_est: null,         desmolde_real: "2026-01-06", botada: "2026-06-09" },
  "H174":  { desmolde_est: "2026-03-30", desmolde_real: null,         botada: "2026-08-24" },
  "H175":  { desmolde_est: "2026-06-08", desmolde_real: null,         botada: "2026-11-02" },
  "H176":  { desmolde_est: "2026-08-17", desmolde_real: null,         botada: "2027-01-11" },
  "37-34": { desmolde_est: null,         desmolde_real: "2026-10-13", botada: "2026-03-09" },
  "37-35": { desmolde_est: null,         desmolde_real: "2026-11-13", botada: "2026-04-16" },
  "37-36": { desmolde_est: null,         desmolde_real: "2026-12-11", botada: "2026-05-07" },
  "37-37": { desmolde_est: "2026-01-12", desmolde_real: "2026-01-12", botada: "2026-06-16" },
  "37-38": { desmolde_est: "2026-02-23", desmolde_real: null,         botada: "2026-07-13" },
  "37-39": { desmolde_est: "2026-03-23", desmolde_real: null,         botada: "2026-08-10" },
  "37-40": { desmolde_est: "2026-04-20", desmolde_real: null,         botada: "2026-09-07" },
  "37-41": { desmolde_est: "2026-05-18", desmolde_real: null,         botada: "2026-10-05" },
  "37-42": { desmolde_est: "2026-06-23", desmolde_real: null,         botada: "2026-11-10" },
  "37-43": { desmolde_est: "2026-07-20", desmolde_real: null,         botada: "2026-12-07" },
  "37-44": { desmolde_est: "2026-08-17", desmolde_real: null,         botada: "2027-01-04" },
  "42-81": { desmolde_est: null,         desmolde_real: "2026-09-03", botada: "2026-03-11" },
  "42-82": { desmolde_est: "2026-02-23", desmolde_real: null,         botada: "2026-08-12" },
  "42-83": { desmolde_est: "2026-07-20", desmolde_real: null,         botada: "2026-01-13" },
  "43-28": { desmolde_est: null,         desmolde_real: "2026-08-06", botada: "2026-04-29" },
  "43-29": { desmolde_est: null,         desmolde_real: "2026-12-11", botada: "2026-08-26" },
  "43-30": { desmolde_est: "2026-03-16", desmolde_real: null,         botada: "2026-11-16" },
  "43-31": { desmolde_est: "2026-05-04", desmolde_real: null,         botada: "2027-01-04" },
  "52-20": { desmolde_est: null,         desmolde_real: "2026-06-05", botada: null         },
  "52-21": { desmolde_est: null,         desmolde_real: "2026-09-17", botada: "2026-05-13" },
  "52-22": { desmolde_est: null,         desmolde_real: "2026-11-13", botada: "2026-07-09" },
  "52-23": { desmolde_est: "2026-01-12", desmolde_real: "2026-01-12", botada: "2026-09-28" },
  "52-24": { desmolde_est: "2026-03-30", desmolde_real: null,         botada: "2026-11-30" },
  "52-25": { desmolde_est: "2026-06-01", desmolde_real: null,         botada: "2026-01-22" },
};

// ── Herrajes por modelo — Anexo C (Oberti) ────────────────────────────────
const DEFAULT_HERRAJES = {
  K34: [
    { q: 28, name: "Base de bisagra codo" },
    { q: 28, name: "Bisagra codo 9" },
    { q: 2,  name: "Bisagra codo 0" },
    { q: 4,  name: "Rieles de 35" },
    { q: 3,  name: "Bisagra pomela derecha" },
    { q: 3,  name: "Bisagra pomela izquierda" },
    { q: 2,  name: "Cerradura Kallay 503" },
    { q: 6,  name: "Pistón a gas 60N" },
    { q: 3,  name: "Retén BCE" },
  ],
  K37: [
    { q: 30, name: "Bisagra codo 9 + base" },
    { q: 17, name: "Retén push" },
    { q: 1,  name: "Guías telescópicas 25 cm" },
    { q: 5,  name: "Guías telescópicas 30 cm" },
    { q: 1,  name: "Guías telescópicas 35 cm" },
    { q: 14, name: "Bisagras ocultas" },
    { q: 4,  name: "Cerraduras Kallay 503" },
    { q: 4,  name: "Pistones 60N" },
    { q: 2,  name: "Pistones 80N" },
  ],
  K42: [
    { q: 56, name: "Bisagra codo 9" },
    { q: 5,  name: "Bisagra codo 0" },
    { q: 3,  name: "Bisagra pomela derecha" },
    { q: 3,  name: "Bisagra pomela izquierda" },
    { q: 2,  name: "Cerradura Kallay 503" },
    { q: 1,  name: "Cerradura puerta corrediza c/ tirador" },
    { q: 4,  name: "Guías telescópicas 35 cm" },
    { q: 4,  name: "Guías telescópicas 40 cm" },
    { q: 1,  name: "Guías telescópicas 25 cm" },
  ],
  K43: [
    { q: 27, name: "Bisagra codo 9" },
    { q: 18, name: "Bisagra codo 0" },
    { q: 45, name: "Base de bisagra" },
    { q: 7,  name: "Guías telescópicas 35 cm" },
    { q: 4,  name: "Cerradura Kallay 503" },
    { q: 9,  name: "Bisagra pomela derecha" },
    { q: 3,  name: "Bisagra pomela izquierda" },
    { q: 8,  name: "Retén bolas BCE" },
    { q: 8,  name: "Pistón gris 60N" },
  ],
  K52: [
    { q: 15, name: "Bisagras ocultas" },
    { q: 4,  name: "Guías 30 cm cierre suave (56500)" },
    { q: 5,  name: "Guías 25 cm cierre suave (gt4525ns)" },
    { q: 4,  name: "Guías 20 cm (Brz-1820-n)" },
    { q: 3,  name: "Cerradura Kallay 505" },
    { q: 2,  name: "Cerradura Kallay 503" },
    { q: 52, name: "Bisagra codo 9 + base" },
  ],
  K55: [
    { q: "1,5m", name: "Bisagra tipo piano" },
    { q: 20, name: "Bisagras codo 0" },
    { q: 34, name: "Bisagras codo 9" },
    { q: 8,  name: "Bisagras codo 9 - OPCIONAL camarote sin vestidor" },
    { q: 2,  name: "Correderas de cajon - LARGO 200mm Cierre suave" },
    { q: 3,  name: "Correderas de cajon - LARGO 250mm Cierre suave" },
    { q: 6,  name: "Correderas de cajon - LARGO 400mm Cierre suave" },
    { q: 6,  name: "Correderas de cajon - LARGO 450mm Cierre suave" },
    { q: 6,  name: "Resorte a gas para puertas de alacenas - 60N" },
    { q: 4,  name: "Resorte a gas para puertas de alacenas - 80N" },
  ],
};

const HERRAJES_STORAGE_KEY = "enchapado_herrajes_templates_v1";

function mergeHerrajesTemplates(custom = {}) {
  const merged = { ...DEFAULT_HERRAJES };
  Object.entries(custom || {}).forEach(([modelo, rows]) => {
    if (!Array.isArray(rows)) return;
    merged[modelo] = rows
      .map((row) => ({ q: row.q ?? "", name: String(row.name ?? "").trim() }))
      .filter((row) => row.name);
  });
  return merged;
}

function getHerrajesTemplates() {
  if (typeof window === "undefined") return DEFAULT_HERRAJES;
  try {
    return mergeHerrajesTemplates(JSON.parse(window.localStorage.getItem(HERRAJES_STORAGE_KEY) || "{}"));
  } catch {
    return DEFAULT_HERRAJES;
  }
}

function saveHerrajesTemplates(next) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(HERRAJES_STORAGE_KEY, JSON.stringify(next));
}

// Las plantillas están por "K55", pero el modelo puede llegar como "55", "k55"
// o "K55-5" (nombre de línea u obra). Sin normalizar, la OT queda sin ítems.
function modeloKey(modelo) {
  const raw = String(modelo ?? "").trim().toUpperCase().replace(/\s+/g, "");
  const match = raw.match(/^K?-?(\d+)/);
  return match ? `K${match[1]}` : raw;
}

// eslint-disable-next-line react-refresh/only-export-components
export function herrajesForModelo(modelo) {
  return getHerrajesTemplates()[modeloKey(modelo)] ?? null;
}

// eslint-disable-next-line react-refresh/only-export-components
export function templateEnchapadoForModelo(modelo) {
  return TEMPLATES[modeloKey(modelo)] ?? null;
}

function escHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Helpers ────────────────────────────────────────────────────────────────
function dispatchSteps(ot) {
  const hasTablones = !!templateEnchapadoForModelo(ot.modelo)?.tablones;
  const hasHerrajes = !!herrajesForModelo(ot.modelo);
  const estado = ot.estado || "Pendiente";
  const steps = [];
  if (hasTablones) {
    steps.push({ key: "tablones_pedido", label: "OT entregada a Banco", done: !!ot.tablones_pedido });
    steps.push({ key: "tablones_enviado", label: "Aviso de tablones enviado a Oberti", done: !!ot.tablones_enviado });
  }
  if (hasHerrajes) {
    steps.push({ key: "herrajes_pedido", label: "Herrajes pedidos", done: !!ot.herrajes_pedido });
    steps.push({ key: "herrajes_enviado", label: "Herrajes enviados", done: !!ot.herrajes_enviado });
  }
  steps.push({ key: "enviada", label: "OT de chapas y material enviados a enchapadora", done: estado === "Enviada" || estado === "Devuelta" });
  steps.push({ key: "devuelta", label: "Enchapado terminado y material devuelto", done: estado === "Devuelta" });
  return steps;
}

function dispatchProgress(ot, includeReturn = false) {
  const steps = dispatchSteps(ot).filter(s => includeReturn || s.key !== "devuelta");
  const total = steps.length || 1;
  const done = steps.filter(s => s.done).length;
  return { done, total, pct: Math.round((done / total) * 100) };
}

function DispatchProgress({ ot, compact = false }) {
  const p = dispatchProgress(ot, false);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: compact ? 118 : 150 }}>
      <div style={{ flex: 1, height: compact ? 5 : 6, borderRadius: 999, background: C.s1, border: `1px solid ${C.b0}`, overflow: "hidden" }}>
        <div style={{ width: `${p.pct}%`, height: "100%", background: p.done === p.total ? C.green : C.blue, borderRadius: 999 }} />
      </div>
      <span style={{ fontSize: compact ? 10 : 11, color: C.t2, fontFamily: C.mono, fontWeight: 600, whiteSpace: "nowrap" }}>
        {p.done}/{p.total} despacho
      </span>
    </div>
  );
}

function ProcessStepper({ ot }) {
  const steps = dispatchSteps(ot);
  const isRehacer = ot.estado === "Rehacer";
  return (
    <div style={{ background: C.s0, border: `1px solid ${isRehacer ? "rgba(239,68,68,0.35)" : C.b0}`, borderRadius: 12, padding: "13px 14px", marginBottom: 22 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: 1.3, textTransform: "uppercase", color: C.t2, fontWeight: 650 }}>Proceso de despacho</div>
          <div style={{ fontSize: 12, color: C.t1, marginTop: 3 }}>
            Preparar materiales, enviar a Oberti y confirmar devolución.
          </div>
        </div>
        <DispatchProgress ot={ot} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8 }}>
        {steps.map((s, idx) => {
          const done = !!s.done;
          const color = done ? C.green : isRehacer ? C.red : C.blue;
          return (
            <div key={s.key} style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              minHeight: 40,
              padding: "8px 10px",
              borderRadius: 9,
              background: done ? `${C.green}12` : C.panel,
              border: `1px solid ${done ? `${C.green}44` : C.b0}`,
            }}>
              <span style={{
                width: 20,
                height: 20,
                borderRadius: "50%",
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
                background: done ? C.green : "transparent",
                border: `1px solid ${done ? C.green : color + "66"}`,
                color: done ? "#06130d" : color,
                fontSize: 11,
                fontWeight: 700,
                fontFamily: C.mono,
              }}>
                {done ? "✓" : idx + 1}
              </span>
              <span style={{ fontSize: 12, color: done ? C.t0 : C.t2, lineHeight: 1.25, fontWeight: done ? 600 : 500 }}>
                {s.label}
              </span>
            </div>
          );
        })}
      </div>
      {isRehacer && (
        <div style={{ marginTop: 10, fontSize: 12, color: C.red, background: "var(--red-soft)", border: "1px solid var(--red-border)", padding: "7px 10px", borderRadius: 8, fontWeight: 600 }}>
          Esta OT está marcada para rehacer. Revisá materiales antes de volver a enviar.
        </div>
      )}
    </div>
  );
}

function tablonesList(modelo, tipoChapa) {
  const tpl = templateEnchapadoForModelo(modelo)?.tablones;
  if (!tpl) return null;
  const nogal = esNogal(tipoChapa);
  const items = [];
  if (tpl.lenga > 0) {
    items.push(nogal
      ? `${tpl.lenga} Tablón${tpl.lenga > 1 ? "es" : ""} de Nogal  ⟵ reemplaza Lenga`
      : `${tpl.lenga} Lenga`
    );
  }
  if (tpl.okume > 0) items.push(`${tpl.okume} Okumé`);
  return items;
}

function fmtFecha(f) {
  if (!f) return "—";
  const [y, m, d] = f.split("-");
  return `${d}/${m}/${y}`;
}

// Busca un barco en la tabla de fechas (case-insensitive, trim)
function buscarFechasBarco(barco) {
  if (!barco) return null;
  const key = barco.trim().toUpperCase();
  // Búsqueda exacta primero
  for (const [k, v] of Object.entries(BARCOS_FECHAS)) {
    if (k.toUpperCase() === key) return v;
  }
  return null;
}

// ── SQL setup card ─────────────────────────────────────────────────────────
function SetupCard({ onRetry }) {
  const [show, setShow] = useState(false);
  const sql = `-- Tabla nueva:
create table enchapado_ots (
  id                  uuid primary key default gen_random_uuid(),
  modelo              text not null,
  barco               text not null,
  tipo_chapa          text,
  fecha               date,
  responsable         text,
  estado              text default 'Pendiente',
  notas               text,
  fecha_desmolde_est  date,
  fecha_desmolde_real date,
  fecha_botada        date,
  tablones_pedido     boolean default false,
  tablones_enviado    boolean default false,
  herrajes_pedido     boolean default false,
  herrajes_enviado    boolean default false,
  created_at          timestamptz default now()
);

create table enchapado_ot_items (
  id                 uuid primary key default gen_random_uuid(),
  ot_id              uuid references enchapado_ots(id) on delete cascade,
  item_id            text not null,
  chapas_descripcion text,
  created_at         timestamptz default now()
);

-- Si la tabla ya existe, agregar columnas nuevas:
alter table enchapado_ots add column if not exists fecha_desmolde_est  date;
alter table enchapado_ots add column if not exists fecha_desmolde_real date;
alter table enchapado_ots add column if not exists fecha_botada        date;
alter table enchapado_ots add column if not exists tablones_pedido     boolean default false;
alter table enchapado_ots add column if not exists tablones_enviado    boolean default false;
alter table enchapado_ots add column if not exists herrajes_pedido     boolean default false;
alter table enchapado_ots add column if not exists herrajes_enviado    boolean default false;`;

  return (
    <div style={{ padding: 28 }}>
      <div style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 12, padding: 20, maxWidth: 580 }}>
        <div style={{ fontSize: 13, color: "#f87171", fontWeight: 600, marginBottom: 8 }}>⚠ Tablas no encontradas</div>
        <div style={{ fontSize: 13, color: C.t2, lineHeight: 1.7, marginBottom: 12 }}>
          Hay que crear las tablas en Supabase. Andá a <strong style={{ color: C.t1 }}>SQL Editor</strong> y ejecutá:
        </div>
        <button onClick={() => setShow(v => !v)} style={{ background: C.s1, border: `1px solid ${C.b0}`, color: C.t1, padding: "5px 12px", borderRadius: 7, cursor: "pointer", fontSize: 12, fontFamily: C.sans, marginBottom: 10 }}>
          {show ? "Ocultar SQL" : "Ver SQL"}
        </button>
        {show && (
          <pre style={{ background: C.panelSolid, border: `1px solid ${C.b0}`, borderRadius: 8, padding: 14, fontSize: 11, color: C.t1, overflowX: "auto", fontFamily: C.mono, lineHeight: 1.8, marginBottom: 12 }}>{sql}</pre>
        )}
        <button onClick={onRetry} style={{ background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.3)", color: "#60a5fa", padding: "7px 18px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontFamily: C.sans }}>Reintentar</button>
      </div>
    </div>
  );
}

// ── OT Card ────────────────────────────────────────────────────────────────
function OTCard({ ot, onClick }) {
  const meta = ESTADO_META[ot.estado] ?? ESTADO_META["Pendiente"];
  const tpl  = templateEnchapadoForModelo(ot.modelo);
  const chapa = chapaColor(ot.tipo_chapa);

  // Desmolde: preferir real sobre estimado
  const desmolde = ot.fecha_desmolde_real || ot.fecha_desmolde_est;
  const desmoldeLabel = ot.fecha_desmolde_real ? "Desmolde" : "Desmolde est.";

  // Indicadores de despacho pendiente
  const tPendiente = tpl?.tablones && !ot.tablones_enviado;
  const hPendiente = herrajesForModelo(ot.modelo) && !ot.herrajes_enviado;

  return (
    <div
      className="ot-card"
      onClick={onClick}
      style={{
        background: C.s0, border: `1px solid ${C.b0}`,
        borderRadius: 12, padding: "14px 16px",
        cursor: "pointer", transition: "all .15s",
        display: "flex", gap: 14, alignItems: "center",
      }}
    >
      {/* Modelo badge */}
      <div style={{
        flexShrink: 0, width: 46, height: 46, borderRadius: 10,
        background: "var(--panel)", border: `1px solid ${C.b0}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 12, fontWeight: 600, color: C.t0, fontFamily: C.mono,
        letterSpacing: 1,
      }}>{ot.modelo}</div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: C.t0 }}>{ot.barco}</span>
          {ot.tipo_chapa && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: C.t0, fontFamily: C.mono, background: C.s1, border: `1px solid ${chapa.base}55`, padding: "2px 7px 2px 4px", borderRadius: 6, minWidth: 0 }}>
              <ChapaSwatch tipo={ot.tipo_chapa} size="xs" />
              {ot.tipo_chapa}
            </span>
          )}
        </div>
        {/* Fechas producción */}
        <div style={{ display: "flex", gap: 12, fontSize: 12, color: C.t2, flexWrap: "wrap" }}>
          {desmolde && (
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 10, color: C.t2, opacity: 0.7 }}>⬡</span>
              <span style={{ color: C.t2, fontSize: 11 }}>{desmoldeLabel}:</span>
              <span style={{ fontFamily: C.mono, color: C.t1, fontSize: 11 }}>{fmtFecha(desmolde)}</span>
            </span>
          )}
          {ot.fecha_botada && (
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 10, color: C.green, opacity: 0.8 }}>⛵</span>
              <span style={{ color: C.t2, fontSize: 11 }}>Botada:</span>
              <span style={{ fontFamily: C.mono, color: C.green, fontSize: 11 }}>{fmtFecha(ot.fecha_botada)}</span>
            </span>
          )}
        </div>
        {/* Indicadores despacho */}
        {(tPendiente || hPendiente) && (
          <div style={{ display: "flex", gap: 5, marginTop: 5 }}>
            {tPendiente && (
              <span style={{ fontSize: 10, color: C.blue, background: C.blueL, border: `1px solid ${C.blueB}`, padding: "1px 6px", borderRadius: 4 }}>
                tablones pendientes
              </span>
            )}
            {hPendiente && (
              <span style={{ fontSize: 10, color: C.purple, background: "rgba(168,85,247,0.08)", border: "1px solid rgba(168,85,247,0.2)", padding: "1px 6px", borderRadius: 4 }}>
                herrajes pendientes
              </span>
            )}
          </div>
        )}
        <div style={{ marginTop: 7 }}>
          <DispatchProgress ot={ot} compact />
        </div>
      </div>

      {/* Estado */}
      <div style={{
        flexShrink: 0, display: "flex", alignItems: "center", gap: 5,
        background: meta.bg, border: `1px solid ${meta.color}33`,
        padding: "5px 10px", borderRadius: 7,
        fontSize: 12, fontWeight: 600, color: meta.color,
        fontFamily: C.sans,
      }}>
        <div style={{ width: 5, height: 5, borderRadius: "50%", background: meta.dot, flexShrink: 0 }} />
        {ot.estado}
      </div>
    </div>
  );
}

// ── Modal: Nueva OT ────────────────────────────────────────────────────────
function NuevaOTModal({ onClose, onCreate, onEnsureMueblesUnidad }) {
  const [form, setForm] = useState({
    modelo: "K52",
    barco: "",
    tipo_chapa: "",
    fecha: new Date().toISOString().split("T")[0],
    responsable: "",
    fecha_desmolde_est: "",
    fecha_desmolde_real: "",
    fecha_botada: "",
  });
  const [saving, setSaving] = useState(false);
  const [showSug, setShowSug] = useState(false);
  const [fechasAutoLookup, setFechasAutoLookup] = useState(false);

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // Al cambiar el barco, intentar pre-cargar las fechas
  function onBarcoChange(val) {
    f("barco", val);
    const found = buscarFechasBarco(val);
    if (found) {
      setForm(p => ({
        ...p,
        barco: val,
        fecha_desmolde_est:  found.desmolde_est  ?? "",
        fecha_desmolde_real: found.desmolde_real ?? "",
        fecha_botada:        found.botada        ?? "",
      }));
      setFechasAutoLookup(true);
    } else {
      setFechasAutoLookup(false);
    }
  }

  const LBL = { fontSize: 10, letterSpacing: 1.3, color: C.t2, display: "block", marginBottom: 5, marginTop: 12, textTransform: "uppercase", fontWeight: 600 };

  async function crear() {
    if (!form.barco.trim()) return;
    setSaving(true);
    const { data: ot, error } = await supabase.from("enchapado_ots").insert({
      modelo:              form.modelo,
      barco:               form.barco.trim(),
      tipo_chapa:          form.tipo_chapa.trim(),
      fecha:               form.fecha || null,
      responsable:         form.responsable.trim(),
      estado:              "Pendiente",
      fecha_desmolde_est:  form.fecha_desmolde_est  || null,
      fecha_desmolde_real: form.fecha_desmolde_real || null,
      fecha_botada:        form.fecha_botada        || null,
    }).select().single();

    if (error) { alert(error.message); setSaving(false); return; }

    // Crear items vacíos según template
    const tpl = TEMPLATES[form.modelo];
    if (tpl?.items?.length) {
      await supabase.from("enchapado_ot_items").insert(
        tpl.items.map(it => ({ ot_id: ot.id, item_id: it.id, chapas_descripcion: "" }))
      );
    }
    if (onEnsureMueblesUnidad) {
      try {
        const sync = await onEnsureMueblesUnidad({ modelo: ot.modelo, barco: ot.barco });
        ot.muebles_sync = {
          ok: true,
          created: !!sync?.created,
          lineaNombre: sync?.linea?.nombre ?? ot.modelo,
          unidadCodigo: sync?.unidad?.codigo ?? ot.barco,
        };
      } catch (syncError) {
        ot.muebles_sync = {
          ok: false,
          message: syncError.message,
        };
      }
    }
    onCreate(ot);
    setSaving(false);
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 2000, background: "var(--overlay-strong)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.panelSolid, border: `1px solid ${C.b1}`, borderRadius: 16, padding: 28, width: "min(520px,94vw)", position: "relative", maxHeight: "90vh", overflowY: "auto" }}>
        <button onClick={onClose} style={{ position: "absolute", top: 14, right: 14, background: C.s0, border: `1px solid ${C.b0}`, color: C.t0, width: 28, height: 28, borderRadius: "50%", cursor: "pointer", fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>

        <div style={{ fontSize: 16, fontWeight: 600, color: C.t0, marginBottom: 2 }}>Nueva OT de preparación — Banco</div>
        <div style={{ fontSize: 12, color: C.t2, marginBottom: 4 }}>Klase A</div>

        {/* Modelo */}
        <label style={LBL}>Modelo</label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {Object.keys(TEMPLATES).map(m => (
            <button key={m} onClick={() => f("modelo", m)} style={{
              padding: "6px 14px", borderRadius: 8, cursor: "pointer", fontSize: 13,
              fontWeight: form.modelo === m ? 600 : 400, fontFamily: C.mono,
              background: form.modelo === m ? "rgba(59,130,246,0.15)" : C.s0,
              border: `1px solid ${form.modelo === m ? "rgba(59,130,246,0.45)" : C.b0}`,
              color: form.modelo === m ? "#60a5fa" : C.t1,
              transition: "all .12s",
            }}>{m}</button>
          ))}
        </div>

        {/* Barco */}
        <label style={LBL}>Número / ID del barco</label>
        <input
          style={INP}
          placeholder="Ej: 52-24  o  H174  o  37-40"
          value={form.barco}
          onChange={e => onBarcoChange(e.target.value)}
          autoFocus
          onKeyDown={e => e.key === "Enter" && crear()}
        />
        {fechasAutoLookup && (
          <div style={{ marginTop: 5, fontSize: 12, color: C.green, background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 6, padding: "4px 10px" }}>
            ✓ Fechas cargadas automáticamente desde el cronograma 2026
          </div>
        )}

        {/* Tipo de chapa */}
        <label style={LBL}>Tipo de chapa</label>
        <div style={{ position: "relative" }}>
          <input
            style={INP}
            placeholder="Ej: Nogal Natural, Roble Plata Rayado…"
            value={form.tipo_chapa}
            onChange={e => { f("tipo_chapa", e.target.value); setShowSug(e.target.value.length > 0); }}
            onFocus={() => setShowSug(true)}
            onBlur={() => setTimeout(() => setShowSug(false), 150)}
          />
          {showSug && (
            <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50, background: C.panelSolid, border: `1px solid ${C.b1}`, borderRadius: 8, marginTop: 3, overflow: "hidden", boxShadow: "0 8px 24px rgba(0,0,0,0.6)" }}>
              {CHAPAS_OPCIONES.filter(s => !form.tipo_chapa || s.toLowerCase().includes(form.tipo_chapa.toLowerCase())).map(s => (
                <button key={s} onMouseDown={() => f("tipo_chapa", s)} style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", textAlign: "left", padding: "8px 12px", background: "transparent", border: "none", color: C.t1, cursor: "pointer", fontSize: 13, fontFamily: C.sans, borderBottom: `1px solid ${C.b0}` }}
                  onMouseEnter={e => e.currentTarget.style.background = C.s1}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <ChapaSwatch tipo={s} size="xs" />
                  <span style={{ flex: 1 }}>{s}</span>
                  {esNogal(s) && <span style={{ fontSize: 11, color: "#0891b2" }}>nogal</span>}
                </button>
              ))}
            </div>
          )}
        </div>
        {form.tipo_chapa && (
          <div style={{ marginTop: 7, display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, color: C.t1, background: C.s0, border: `1px solid ${C.b0}`, padding: "5px 8px", borderRadius: 8 }}>
            <ChapaSwatch tipo={form.tipo_chapa} size="sm" />
            Vista de tono: <strong style={{ color: C.t0 }}>{form.tipo_chapa}</strong>
          </div>
        )}
        {form.tipo_chapa && esNogal(form.tipo_chapa) && (
          <div style={{ marginTop: 5, fontSize: 12, color: "#0891b2", background: "rgba(34,211,238,0.07)", border: "1px solid rgba(34,211,238,0.2)", borderRadius: 6, padding: "5px 10px" }}>
            ⚠ Chapa de nogal — en Anexo B la Lenga se reemplaza por Tablón de Nogal
          </div>
        )}

        {/* Fechas de producción */}
        <label style={{ ...LBL, marginTop: 16, color: C.t2, borderTop: `1px solid ${C.b0}`, paddingTop: 12 }}>Fechas de producción</label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {[
            { key: "fecha_desmolde_est",  label: "Desmolde est." },
            { key: "fecha_desmolde_real", label: "Desmolde real" },
            { key: "fecha_botada",        label: "Botada" },
          ].map(({ key, label }) => (
            <div key={key}>
              <div style={{ fontSize: 10, letterSpacing: 1.1, color: C.t2, marginBottom: 4, textTransform: "uppercase" }}>{label}</div>
              <input
                style={{ ...INP, fontSize: 12 }}
                type="date"
                value={form[key]}
                onChange={e => f(key, e.target.value)}
              />
            </div>
          ))}
        </div>

        {/* Fecha OT + Responsable */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 4 }}>
          <div>
            <label style={LBL}>Fecha OT</label>
            <input style={INP} type="date" value={form.fecha} onChange={e => f("fecha", e.target.value)} />
          </div>
          <div>
            <label style={LBL}>Responsable</label>
            <input style={INP} placeholder="Ej: David, Ezequiel…" value={form.responsable} onChange={e => f("responsable", e.target.value)} />
          </div>
        </div>

        <button
          onClick={crear}
          disabled={saving || !form.barco.trim()}
          style={{ marginTop: 20, width: "100%", padding: "11px", background: saving ? C.s1 : "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.35)", color: "#60a5fa", fontWeight: 600, borderRadius: 10, cursor: saving ? "not-allowed" : "pointer", fontFamily: C.sans, fontSize: 14, opacity: !form.barco.trim() ? 0.5 : 1 }}
        >{saving ? "Creando…" : "Crear OT"}</button>
      </div>
    </div>
  );
}

// ── Vista detalle de una OT ────────────────────────────────────────────────
export function OTDetail({ ot: otInit, onBack, onUpdated, onDeleted, esAdmin, onEnsureMueblesUnidad }) {
  const confirmar = useConfirm();
  const [ot,        setOt]        = useState(otInit);
  const [items,     setItems]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [editItem,  setEditItem]  = useState(null);
  const [editVal,   setEditVal]   = useState("");
  const [editNotas,  setEditNotas]  = useState(false);
  const [notasVal,   setNotasVal]   = useState(ot.notas ?? "");
  const [editFechas, setEditFechas] = useState(false);
  const [fechasForm, setFechasForm] = useState({
    fecha_desmolde_est:  ot.fecha_desmolde_est  ?? "",
    fecha_desmolde_real: ot.fecha_desmolde_real ?? "",
    fecha_botada:        ot.fecha_botada        ?? "",
  });
  const [showHerrajesKit, setShowHerrajesKit] = useState(false);
  const [syncingMuebles, setSyncingMuebles] = useState(false);
  const [syncMsg, setSyncMsg] = useState(ot.muebles_sync ?? null);
  const [error, setError] = useState("");
  const inputRef = useRef(null);
  // Espejo de `items` para los guardados que terminan después de otro render.
  const itemsRef = useRef(items);
  useEffect(() => { itemsRef.current = items; }, [items]);
  const guardadosEnCurso = useRef(new Map());
  const cancelarEdicion = useRef(false);

  const tpl     = templateEnchapadoForModelo(ot.modelo);
  const nogal   = esNogal(ot.tipo_chapa);
  const tablones = tablonesList(ot.modelo, ot.tipo_chapa);
  const herrajesKit = herrajesForModelo(ot.modelo) ?? null;
  // Lo que está escrito en el ítem abierto cuenta aunque todavía no se haya
  // guardado: al hacer clic en "Imprimir" el textarea pierde el foco recién en
  // ese momento y el guardado llega después.
  const chapaDeItem = (itemId) => (editItem === itemId
    ? editVal
    : items.find((item) => item.item_id === itemId)?.chapas_descripcion ?? ""
  ).trim();
  const itemsSinChapas = (tpl?.items ?? []).filter((templateItem) => !chapaDeItem(templateItem.id));
  const hayChapasCargadas = Boolean(tpl?.items?.length) && itemsSinChapas.length < tpl.items.length;

  const cargar = useCallback(async () => {
    setLoading(true);
    const { data, error: itemsError } = await supabase
      .from("enchapado_ot_items")
      .select("*")
      .eq("ot_id", ot.id)
      .order("item_id");
    if (itemsError) setError(`No se pudieron leer las hojas de chapa: ${itemsError.message}`);
    setItems(data ?? []);
    setLoading(false);
  }, [ot.id]);

  useEffect(() => {
    const timer = setTimeout(() => { cargar(); }, 0);
    return () => clearTimeout(timer);
  }, [cargar]);
  useEffect(() => { setSyncMsg(ot.muebles_sync ?? null); }, [ot]);

  function abrirEdit(itemId) {
    const row = items.find(i => i.item_id === itemId);
    cancelarEdicion.current = false;
    setEditItem(itemId);
    setEditVal(row?.chapas_descripcion ?? "");
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function cancelarEdit() {
    cancelarEdicion.current = true;
    setEditItem(null);
  }

  // Enter, el blur y "Imprimir" pueden pedir el mismo guardado casi a la vez:
  // se reutiliza el que está en curso en vez de mandar tres updates.
  function guardarChapas(itemId, valor) {
    if (cancelarEdicion.current) return Promise.resolve(false);
    const clave = `${itemId}\u0000${valor}`;
    const enCurso = guardadosEnCurso.current.get(clave);
    if (enCurso) return enCurso;
    const promesa = escribirChapas(itemId, valor)
      .finally(() => guardadosEnCurso.current.delete(clave));
    guardadosEnCurso.current.set(clave, promesa);
    return promesa;
  }

  async function escribirChapas(itemId, valor) {
    const cerrar = () => setEditItem((actual) => (actual === itemId ? null : actual));
    const row = itemsRef.current.find(i => i.item_id === itemId);
    if (row && (row.chapas_descripcion ?? "") === valor) {
      cerrar();
      return true;
    }
    // Si el renglón no existe (la OT se creó sin ítems o cambió de modelo), se
    // crea. Antes el texto se perdía sin aviso.
    const { data, error: saveError } = row
      ? await supabase.from("enchapado_ot_items").update({ chapas_descripcion: valor }).eq("id", row.id).select()
      : await supabase.from("enchapado_ot_items").insert({ ot_id: ot.id, item_id: itemId, chapas_descripcion: valor }).select();
    if (saveError || !data?.length) {
      setError(`No se guardaron las chapas del ítem ${itemId}: ${saveError?.message ?? "la base no aceptó el cambio."}`);
      return false;
    }
    const guardado = data[0];
    setItems(p => (p.some(i => i.id === guardado.id)
      ? p.map(i => (i.id === guardado.id ? guardado : i))
      : [...p, guardado]));
    setError("");
    cerrar();
    return true;
  }

  // Si la base rechaza el cambio, la pantalla no lo muestra como hecho.
  async function actualizarOt(cambios, accion) {
    const { data, error: updateError } = await supabase
      .from("enchapado_ots")
      .update(cambios)
      .eq("id", ot.id)
      .select("id");
    if (updateError || !data?.length) {
      setError(`No se pudo ${accion}: ${updateError?.message ?? "la base no aceptó el cambio."}`);
      return false;
    }
    setError("");
    const updated = { ...ot, ...cambios };
    setOt(updated);
    onUpdated?.(updated);
    return true;
  }

  async function setEstado(estado) {
    await actualizarOt({ estado }, "cambiar el estado");
  }

  async function guardarNotas() {
    if (await actualizarOt({ notas: notasVal }, "guardar la nota")) setEditNotas(false);
  }

  async function guardarFechas() {
    const updates = {
      fecha_desmolde_est:  fechasForm.fecha_desmolde_est  || null,
      fecha_desmolde_real: fechasForm.fecha_desmolde_real || null,
      fecha_botada:        fechasForm.fecha_botada        || null,
    };
    if (await actualizarOt(updates, "guardar las fechas")) setEditFechas(false);
  }

  // Toggle genérico para campos boolean
  async function toggle(campo) {
    await actualizarOt({ [campo]: !ot[campo] }, "actualizar el despacho");
  }

  async function eliminarOT() {
    const ok = await confirmar({
      title: `¿Eliminar la OT ${ot.barco}?`,
      message: `Se borra la OT de preparación ${ot.modelo} ${ot.barco} con sus hojas de chapa. No se puede deshacer.`,
      confirmLabel: "Eliminar OT",
      tone: "danger",
    });
    if (!ok) return;
    const { error: deleteError } = await supabase.from("enchapado_ots").delete().eq("id", ot.id);
    if (deleteError) {
      setError(`No se pudo eliminar la OT: ${deleteError.message}`);
      return;
    }
    onDeleted?.(ot.id);
  }

  async function sincronizarMuebles() {
    if (!onEnsureMueblesUnidad) return;
    setSyncingMuebles(true);
    try {
      const sync = await onEnsureMueblesUnidad({ modelo: ot.modelo, barco: ot.barco });
      const mueblesSync = {
        ok: true,
        created: !!sync?.created,
        lineaNombre: sync?.linea?.nombre ?? ot.modelo,
        unidadCodigo: sync?.unidad?.codigo ?? ot.barco,
      };
      const updated = { ...ot, muebles_sync: mueblesSync };
      setOt(updated);
      setSyncMsg(mueblesSync);
      onUpdated?.(updated);
    } catch (error) {
      const mueblesSync = { ok: false, message: error.message };
      const updated = { ...ot, muebles_sync: mueblesSync };
      setOt(updated);
      setSyncMsg(mueblesSync);
      onUpdated?.(updated);
    } finally {
      setSyncingMuebles(false);
    }
  }

  function imprimir(destino) {
    // Si hay un ítem abierto se imprime lo que está escrito, y se guarda igual.
    let itemsActuales = items;
    if (editItem != null) {
      const texto = editVal;
      itemsActuales = items.some(i => i.item_id === editItem)
        ? items.map(i => (i.item_id === editItem ? { ...i, chapas_descripcion: texto } : i))
        : [...items, { item_id: editItem, chapas_descripcion: texto }];
      guardarChapas(editItem, texto);
    }

    // La ventana se abre antes que nada: si se abre después de algo asincrónico
    // el navegador la toma como emergente y la bloquea.
    const win = window.open("", "_blank");
    if (!win) {
      setError("El navegador bloqueó la ventana de impresión. Permití las ventanas emergentes para este sitio y volvé a intentar.");
      return;
    }

    const tablonesLineas = tablonesList(ot.modelo, ot.tipo_chapa) ?? [];
    const printTone = chapaColor(ot.tipo_chapa);
    const barco = escHtml(ot.barco);
    const modelo = escHtml(ot.modelo);
    const impreso = new Date().toLocaleDateString("es-AR");
    const chapaPrintBlock = `
<section style="margin-top:-4px; margin-bottom:14px;">
  <div style="
    display:inline-flex;
    align-items:center;
    gap:10px;
    padding:8px 16px 8px 10px;
    border:2px solid #888;
    border-radius:8px;
    background:#f5f5f5;
    font-family:'JetBrains Mono', Consolas, monospace;
    font-size:12pt;
    font-weight:700;
    color:#111;
  ">
    <span style="
      display:inline-block;
      width:30px;
      height:22px;
      border-radius:5px;
      border:1.5px solid #333;
      background:${chapaGradient(printTone)};
      vertical-align:middle;
    "></span>
    <span>Chapa: ${escHtml(ot.tipo_chapa || "Sin especificar")}</span>
  </div>
</section>`;

    // ── Estilos compartidos ───────────────────────────────────────
    const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&family=JetBrains+Mono:wght@400;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Outfit', 'Segoe UI', Arial, sans-serif; font-size: 11pt; color: #1a1a1a; background: #fff; }
  .toolbar { display: flex; gap: 8px; justify-content: flex-end; align-items: center; padding: 12px 16mm 0;
    font-size: 9pt; color: #777; }
  .toolbar button { font-family: inherit; font-size: 10pt; font-weight: 600; padding: 7px 14px; border-radius: 7px;
    border: 1px solid #ccc; background: #fff; color: #1a1a1a; cursor: pointer; }
  .toolbar button.primario { background: #1a1a1a; border-color: #1a1a1a; color: #fff; }
  .page { padding: 14mm 16mm 16mm; page-break-after: always; }
  .page:last-of-type { page-break-after: auto; }
  .dest-banner { display: inline-flex; align-items: center; gap: 8px; background: #1a1a1a; color: #fff;
    font-size: 8pt; font-weight: 700; letter-spacing: 3px; text-transform: uppercase;
    padding: 5px 14px; border-radius: 4px; margin-bottom: 12px; font-family: 'JetBrains Mono', Consolas, monospace; }
  .dest-banner.carp  { background: #1e3a2f; }
  header { display: flex; justify-content: space-between; align-items: flex-start;
    border-bottom: 2px solid #1a1a1a; padding-bottom: 10px; margin-bottom: 14px; }
  .brand { font-family: 'JetBrains Mono', Consolas, monospace; font-size: 9pt; letter-spacing: 3px; text-transform: uppercase; color: #666; }
  .title { font-size: 20pt; font-weight: 700; margin: 2px 0; }
  .meta { font-size: 9pt; color: #555; margin-top: 4px; }
  .barco-tag { font-family: 'JetBrains Mono', Consolas, monospace; font-size: 16pt; font-weight: 700; color: #1a1a1a;
    background: #fff; padding: 4px 12px; border: 2px solid #1a1a1a; border-radius: 6px; }
  .estado { font-size: 9pt; font-weight: 700; padding: 4px 10px; border: 1.5px solid #1a1a1a; border-radius: 5px; text-align: center; }
  section { margin-bottom: 14px; }
  h3 { font-size: 8pt; letter-spacing: 2px; text-transform: uppercase; color: #888; font-weight: 600;
    margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px solid #ddd; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 6px; }
  .chip { font-family: 'JetBrains Mono', Consolas, monospace; font-size: 9pt; background: #f4f4f4;
    border: 1px solid #ccc; padding: 3px 10px; border-radius: 5px; }
  .chip.nogal { background: #ecfeff; border-color: #0891b2; color: #0e7490; }
  .chip.big   { font-size: 12pt; font-weight: 700; padding: 8px 18px; background: #f0f0f0; }
  .chip.big.nogal { font-size: 12pt; font-weight: 700; padding: 8px 18px; }
  .nogal-note { font-size: 9pt; color: #0e7490; margin-top: 6px; font-weight: 600; }
  .sub { font-size: 9pt; color: #777; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
  th { text-align: left; font-size: 7.5pt; letter-spacing: 1.5px; text-transform: uppercase;
    color: #888; font-weight: 600; padding: 5px 8px; border-bottom: 1.5px solid #1a1a1a; }
  td { padding: 7px 8px; border-bottom: 1px solid #e8e8e8; vertical-align: top; }
  tr:nth-child(even) td { background: #fafafa; }
  td.item-id { font-family: 'JetBrains Mono', Consolas, monospace; font-weight: 700; color: #555; width: 36px; }
  td.chapas {
    font-family: 'JetBrains Mono', Consolas, monospace;
    font-size: 10pt;
    font-weight: 700;
    color: #111;
    white-space: pre-wrap;
    width: 34%;
    line-height: 1.45;
  }
  .a-mano { min-height: 34px; }
  .notas-box { border: 1px solid #ccc; border-radius: 6px; padding: 10px 14px;
    min-height: 48px; font-size: 10pt; color: #333; white-space: pre-wrap; }
  .footer { margin-top: 20px; padding-top: 8px; border-top: 1px solid #ddd;
    font-size: 8pt; color: #aaa; display: flex; justify-content: space-between; }
  .check-row { display: flex; gap: 24px; margin-top: 16px; }
  .check-box { border: 1.5px solid #999; border-radius: 5px; padding: 10px 18px; min-width: 140px; }
  .check-label { font-size: 8pt; letter-spacing: 1.5px; text-transform: uppercase; color: #888; margin-bottom: 6px; }
  .check-val { font-size: 10pt; font-weight: 600; color: #1a1a1a; }
  .sign-area { margin-top: 24px; display: flex; gap: 32px; }
  .sign-line { flex: 1; border-top: 1px solid #999; padding-top: 5px; font-size: 8pt; color: #999; }
  @media print {
    /* Sin esto Chrome no imprime fondos y el texto blanco de las etiquetas desaparece. */
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .toolbar { display: none !important; }
    .page { padding: 10mm 12mm 12mm; }
    @page { margin: 0; size: A4; }
  }`;

    const miniHeader = `
<header>
  <div>
    <div class="brand">Klase A &middot; Enchapadora &nbsp;|&nbsp; OT ${barco}</div>
    <div class="title">${barco}</div>
    <div class="meta">
      Modelo: <strong>${modelo}</strong>
      &nbsp;&middot;&nbsp;
      Fecha: <strong>${fmtFecha(ot.fecha)}</strong>
    </div>
  </div>
  <div style="display:flex; flex-direction:column; align-items:flex-end; gap:8px;">
    <div class="barco-tag">${barco}</div>
    <div class="estado">${escHtml(ot.estado)}</div>
  </div>
</header>`;

    // Las hojas de chapa cargadas salen en las dos OT (Banco y Enchapadora).
    // El ítem sin cargar queda con lugar para completarlo a mano.
    const chapaDe = (itemId) => itemsActuales
      .find(i => i.item_id === itemId)?.chapas_descripcion?.trim() || "";
    const rowsItems = (tpl?.items ?? []).map(it => {
      const chapas = chapaDe(it.id);
      return `
        <tr>
          <td class="item-id">${escHtml(it.id)}</td>
          <td class="chapas">${chapas ? escHtml(chapas).replace(/\n/g, "<br>") : '<div class="a-mano"></div>'}</td>
          <td>${escHtml(it.material)}</td>
          <td>${escHtml(it.medidas)}</td>
          <td>${escHtml(it.caras)}</td>
          <td>${escHtml(it.veta)}</td>
        </tr>`;
    }).join("");

    const placasHTML = (tpl?.placas ?? []).map(p => `<span class="chip">${escHtml(p)}</span>`).join("");

    const fechasHTML = (ot.fecha_desmolde_est || ot.fecha_desmolde_real || ot.fecha_botada) ? `
    <section>
      <h3>Fechas de Producción</h3>
      <div class="chips">
        ${ot.fecha_desmolde_est  ? `<span class="chip">Desmolde est.: ${fmtFecha(ot.fecha_desmolde_est)}</span>`  : ""}
        ${ot.fecha_desmolde_real ? `<span class="chip">Desmolde real: ${fmtFecha(ot.fecha_desmolde_real)}</span>` : ""}
        ${ot.fecha_botada        ? `<span class="chip">Botada: ${fmtFecha(ot.fecha_botada)}</span>`               : ""}
      </div>
    </section>` : "";

    const paginaChapas = ({ banner, titulo, firmas, pie }) => `
  <div class="page">
    <div class="dest-banner">${banner}</div>
    ${miniHeader}
    ${chapaPrintBlock}
    ${fechasHTML}
    <section>
      <h3>Placas a enviar</h3>
      <div class="chips">${placasHTML}</div>
      <p class="sub">Identificar cada paquete con modelo, ítem y número de OT.</p>
    </section>
    <section>
      <h3>${titulo}</h3>
      <table>
        <thead>
          <tr>
            <th>Ítem</th><th>Hojas de Chapa</th><th>Material</th><th>Medidas</th><th>Caras</th><th>Sentido de Veta</th>
          </tr>
        </thead>
        <tbody>${rowsItems}</tbody>
      </table>
    </section>
    ${ot.notas ? `<section><h3>Notas</h3><div class="notas-box">${escHtml(ot.notas).replace(/\n/g, "<br>")}</div></section>` : ""}
    <div class="sign-area">
      ${firmas.map(f => `<div class="sign-line">${f}</div>`).join("")}
    </div>
    <div class="footer">
      <span>${pie}</span>
      <span>Impreso: ${impreso}</span>
    </div>
  </div>`;

    const pagEnchapadoHTML = paginaChapas({
      banner: "🔨 Para: Enchapadora",
      titulo: "Hojas de Chapa &amp; Trabajo a Realizar",
      firmas: ["Entregó", "Recibió (Enchapadora)", "Fecha entrega"],
      pie: "Klase A · Procedimiento Enchapadora — Hoja 1 / Enchapadora",
    });

    const pagPreparacionBancoHTML = paginaChapas({
      banner: "🔨 Para: Carpintero de banco",
      titulo: "Preparación de hojas de chapa",
      firmas: ["Entregó", "Supervisó (Oficina Técnica)", "Fecha de devolución"],
      pie: "Klase A · Procedimiento Enchapadora — Preparación / Banco",
    });

    // ── Tablones: Banco los prepara, a Oberti se le avisa ─────────
    const paginaTablones = ({ banner, titulo, firmas, pie }) => {
      if (!tablonesLineas.length) return "";
      const tablonesStd = tpl?.tablones
        ? `${tpl.tablones.lenga} Lenga + ${tpl.tablones.okume} Okumé`
        : null;
      return `
  <div class="page">
    <div class="dest-banner carp">${banner}</div>
    ${miniHeader}
    ${chapaPrintBlock}
    <section>
      <h3>${titulo}</h3>
      <div style="background: #f8f8f8; border: 2px solid #bbb; padding: 14px; border-radius: 8px; margin-bottom: 20px; margin-top: 10px;">
        <div style="font-size: 14pt; font-weight: 700; color: #111; text-align: center; margin-bottom: 6px;">Medida: 2,00 m &times; 0,20 m &times; 45 mm</div>
        <div style="font-size: 12pt; font-weight: 700; color: #1e3a2f; text-align: center; text-transform: uppercase; letter-spacing: 1.5px;">Cepillados en 4 caras</div>
        <div style="font-size: 10pt; color: #555; text-align: center; margin-top: 8px; font-family: 'JetBrains Mono', Consolas, monospace;">Marcados con: Modelo ${modelo} / OT: ${barco}</div>
      </div>
      <div class="chips">
        ${tablonesLineas.map(t => `<span class="chip big${t.includes("Nogal") ? " nogal" : ""}">${escHtml(t)}</span>`).join("")}
      </div>
      ${nogal ? '<p class="nogal-note">⚠ Chapa de nogal — La Lenga fue reemplazada por Tablón de Nogal</p>' : ""}
      ${tablonesStd ? `<p class="sub" style="margin-top:10px">Combinación estándar: ${tablonesStd}</p>` : ""}
    </section>
    <div class="check-row">
      <div class="check-box">
        <div class="check-label">OT entregada a Banco</div>
        <div class="check-val">${ot.tablones_pedido ? "✓  Sí" : "⬜  Pendiente"}</div>
      </div>
      <div class="check-box">
        <div class="check-label">Aviso enviado a Oberti</div>
        <div class="check-val">${ot.tablones_enviado ? "✓  Sí" : "⬜  Pendiente"}</div>
      </div>
    </div>
    <div class="sign-area" style="margin-top: 32px">
      ${firmas.map(f => `<div class="sign-line">${f}</div>`).join("")}
    </div>
    <div class="footer">
      <span>${pie}</span>
      <span>Impreso: ${impreso}</span>
    </div>
  </div>`;
    };

    const pagCarpinteriaHTML = paginaTablones({
      banner: "🪵 Para: Carpintero de banco",
      titulo: "Anexo B — Tablones Cepillados",
      firmas: ["Preparó (Banco)", "Controló", "Fecha preparación"],
      pie: "Klase A · Preparación de muebles — Tablones / Banco",
    });

    const pagAvisoObertiHTML = paginaTablones({
      banner: "🪵 Aviso para: Oberti",
      titulo: "Aviso de tablones preparados",
      firmas: ["Informó (Oficina Técnica)", "Recibió aviso (Oberti)", "Fecha de aviso"],
      pie: "Klase A · Preparación de muebles — Aviso de tablones / Oberti",
    });

    const paginas = destino === "banco"
      ? `${pagPreparacionBancoHTML}${pagCarpinteriaHTML}`
      : destino === "oberti"
        ? pagAvisoObertiHTML
        : pagEnchapadoHTML;
    const tituloDocumento = destino === "banco"
      ? "OT Banco"
      : destino === "oberti"
        ? "Aviso Tablones Oberti"
        : "OT Enchapadora";

    // El diálogo de impresión se abre cuando las fuentes ya llegaron: si se
    // dispara antes, el navegador puede imprimir la hoja sin texto. La barra
    // de arriba queda por si el diálogo no se abre o se cierra sin imprimir.
    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>${tituloDocumento} — ${modelo} ${barco}</title>
<style>${CSS}</style>
</head>
<body>
<div class="toolbar">
  <span>Si no se abrió el diálogo de impresión, usá el botón.</span>
  <button class="primario" onclick="window.print()">Imprimir / Guardar PDF</button>
  <button onclick="window.close()">Cerrar</button>
</div>
${paginas}
<script>
(function () {
  var hecho = false;
  function imprimir() {
    if (hecho) return;
    hecho = true;
    setTimeout(function () { try { window.focus(); window.print(); } catch (e) {} }, 200);
  }
  function esperarFuentes() {
    setTimeout(imprimir, 2500);
    if (!document.fonts || !document.fonts.load) return imprimir();
    Promise.all([
      document.fonts.load("400 11pt Outfit"),
      document.fonts.load("700 11pt Outfit"),
      document.fonts.load("400 10pt 'JetBrains Mono'"),
      document.fonts.load("700 10pt 'JetBrains Mono'")
    ]).then(imprimir, imprimir);
  }
  if (document.readyState === "complete") esperarFuentes();
  else window.addEventListener("load", esperarFuentes);
})();
</script>
</body>
</html>`;

    win.document.open();
    win.document.write(html);
    win.document.close();
  }

  const tonoEstado = { Pendiente: "neutro", Enviada: "azul", Devuelta: "verde", Rehacer: "rojo" }[ot.estado] ?? "neutro";
  const pasos = dispatchSteps(ot);
  const avanceDespacho = dispatchProgress(ot, true);
  // Los pasos de tablones y herrajes se tildan acá; el envío y la devolución
  // los da el estado de la OT, y el pedido de herrajes sale de Compras.
  const pasoEditable = { tablones_pedido: true, tablones_enviado: true, herrajes_enviado: true };
  const vetaTono = (v = "") => (v.toLowerCase().includes("ancho") ? "azul" : v.toLowerCase().includes("largo") ? "verde" : "neutro");
  const fechasCargadas = [ot.fecha_desmolde_est, ot.fecha_desmolde_real, ot.fecha_botada].some(Boolean);

  return (
    <div className="mbl-ot">
      <div className="mbl-ot-barra">
        <button type="button" className="ui-btn ui-btn-fantasma chico" onClick={onBack}>
          <ArrowLeft size={15} /> Volver al seguimiento
        </button>
        <span className="mbl-ot-ruta">OT de preparación · <b className="mono">{ot.barco}</b></span>
        {/* El estado va a la izquierda: la esquina derecha la ocupa el aviso de notificaciones. */}
        <label className="mbl-ot-estado" data-tono={tonoEstado}>
          <span>Estado</span>
          <select value={ot.estado} onChange={e => setEstado(e.target.value)} aria-label="Estado de la OT">
            {ESTADOS_OT.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        </label>
      </div>

      <div className="mbl-panel" style={{ margin: "0 auto", maxWidth: 940 }}>
        <div className="mbl-cab">
          <div className="mbl-cab-sw">
            {ot.tipo_chapa ? <ChapaSwatch tipo={ot.tipo_chapa} size="lg" /> : <Hammer size={22} />}
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="mbl-cab-tags">
              <Tag tono="teal">{ot.modelo}</Tag>
              {ot.estado === "Rehacer" && <Estado tono="rojo">Rehacer</Estado>}
            </div>
            <h2 className="mbl-cab-tit">OT <span className="mono">{ot.barco}</span></h2>
            <div className="mbl-cab-sub">{ot.tipo_chapa ? `Chapa ${ot.tipo_chapa}` : "Chapa sin especificar"}{nogal ? " · regla nogal: la Lenga pasa a Tablón de Nogal" : ""}</div>
            <div className="mbl-cab-sub">Creada el {fmtFecha(ot.fecha)}{ot.responsable ? ` · ${ot.responsable}` : ""}</div>
          </div>
        </div>

        {error && <Aviso onCerrar={() => setError("")}>{error}</Aviso>}
        {ot.estado === "Rehacer" && <Aviso tono="rojo">Esta OT está marcada para rehacer. Revisá los materiales antes de volver a enviarla.</Aviso>}

        {/* Cada destino recibe sólo su parte. */}
        <section className="mbl-bloque">
          <div className="mbl-bloque-cab"><h3>Imprimir</h3></div>
          <div className="mbl-imprimir">
            <div className="mbl-imp">
              <div className="mbl-imp-cab"><span className="mbl-imp-n">1</span> Banco</div>
              <div className="mbl-imp-txt">OT completa: prepara chapas{tablones ? " y tablones" : ""}.</div>
              <button type="button" className="ui-btn chico" onClick={() => imprimir("banco")}><Printer size={14} /> OT para Banco</button>
            </div>
            <div className="mbl-imp destacado">
              <div className="mbl-imp-cab"><span className="mbl-imp-n">2</span> Enchapadora</div>
              <div className="mbl-imp-txt">
                {!loading && tpl?.items?.length > 0 && itemsSinChapas.length > 0
                  ? hayChapasCargadas
                    ? `Sin hojas de chapa: ${itemsSinChapas.length === 1 ? "ítem" : "ítems"} ${itemsSinChapas.map(i => i.id).join(", ")}. Sale en blanco para completar a mano.`
                    : "Cargá las hojas de chapa abajo para poder imprimirla."
                  : "Sólo la OT de chapas, ya digitalizada."}
              </div>
              {/* Antes exigía todos los ítems: con uno vacío el botón quedaba
                  apagado y la única OT imprimible era la de Banco, con las
                  chapas en blanco. */}
              <button type="button" className="ui-btn ui-btn-primario chico" onClick={() => imprimir("enchapadora")} disabled={!hayChapasCargadas}><Printer size={14} /> OT para Enchapadora</button>
            </div>
            {tablones && (
              <div className="mbl-imp">
                <div className="mbl-imp-cab"><span className="mbl-imp-n">3</span> Oberti</div>
                <div className="mbl-imp-txt">Aviso de los tablones que van a llegar.</div>
                <button type="button" className="ui-btn chico" onClick={() => imprimir("oberti")}><Printer size={14} /> Aviso de tablones</button>
              </div>
            )}
          </div>
        </section>

        <section className="mbl-bloque">
          <div className="mbl-bloque-cab">
            <h3>Despacho</h3>
            <div className="der">
              <span className="mono" style={{ fontSize: 12, color: "var(--dim)" }}>{avanceDespacho.done}/{avanceDespacho.total}</span>
              <span className="mbl-mini" style={{ width: 90 }}><i className={avanceDespacho.pct >= 100 ? "lleno" : ""} style={{ width: `${avanceDespacho.pct}%` }} /></span>
            </div>
          </div>
          <div className="mbl-tareas" style={{ marginTop: 0 }}>
            {pasos.map(paso => (
              <Tarea
                key={paso.key}
                hecha={paso.done}
                disabled={!pasoEditable[paso.key]}
                onClick={() => toggle(paso.key)}
              >
                {paso.label}
                {!pasoEditable[paso.key] && (
                  <span style={{ marginLeft: 8, fontSize: 11.5, color: "var(--subtle)" }}>
                    {paso.key === "herrajes_pedido" ? "· se marca al pedirlos a Compras" : "· sale del estado de la OT"}
                  </span>
                )}
              </Tarea>
            ))}
          </div>
        </section>

        <section className="mbl-bloque">
          <div className="mbl-bloque-cab">
            <h3>Hojas de chapa</h3>
            {tpl?.items?.length > 0 && (
              <span className="der mono" style={{ fontSize: 12, color: "var(--dim)" }}>{tpl.items.length - itemsSinChapas.length}/{tpl.items.length} cargadas</span>
            )}
          </div>
          {ot.tipo_chapa && <div style={{ marginBottom: 12 }}><ChapaReferenceCard tipo={ot.tipo_chapa} /></div>}
          {loading ? (
            <Cargando compacto />
          ) : !tpl?.items?.length ? (
            <p className="mbl-bloque-txt">No hay plantilla de ítems para el modelo {ot.modelo}.</p>
          ) : (
            <div className="mbl-hojas">
              {tpl.items.map(tItem => {
                const row = items.find(i => i.item_id === tItem.id);
                const val = row?.chapas_descripcion ?? "";
                const isEdit = editItem === tItem.id;
                return (
                  <div key={tItem.id} className={`mbl-hoja${isEdit ? " editando" : ""}${val.trim() ? "" : " vacia"}`}>
                    <span className="mbl-hoja-id mono">{tItem.id}</span>
                    <div style={{ minWidth: 0 }}>
                      {isEdit ? (
                        <textarea
                          ref={inputRef}
                          className="ui-input"
                          value={editVal}
                          onChange={e => setEditVal(e.target.value)}
                          onBlur={() => guardarChapas(tItem.id, editVal)}
                          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); guardarChapas(tItem.id, editVal); } if (e.key === "Escape") cancelarEdit(); }}
                          placeholder={`Hojas de chapa para el ítem ${tItem.id}…`}
                          style={{ minHeight: 64, fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}
                        />
                      ) : val.trim() ? (
                        <button type="button" className="mbl-hoja-val mono" onClick={() => abrirEdit(tItem.id)}>{val}</button>
                      ) : (
                        <button type="button" className="mbl-hoja-cargar" onClick={() => abrirEdit(tItem.id)}>+ Cargar hojas del ítem {tItem.id}</button>
                      )}
                      <div className="mbl-hoja-meta">
                        <span>{tItem.material}</span>
                        <span className="mono">{tItem.medidas}</span>
                        <span>{tItem.caras}</span>
                        <span className="mbl-estado" data-tono={vetaTono(tItem.veta)} style={{ minHeight: 20 }}>Veta {tItem.veta.toLowerCase()}</span>
                      </div>
                      {isEdit && <div className="mbl-hoja-ayuda">Enter guarda · Shift+Enter agrega un renglón · Esc cancela</div>}
                    </div>
                    {!isEdit && val.trim() && (
                      <button type="button" className="mbl-btn-ic" style={{ width: 32, height: 32 }} onClick={() => abrirEdit(tItem.id)} aria-label={`Editar hojas del ítem ${tItem.id}`}><Pencil size={14} /></button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <p className="mbl-bloque-txt" style={{ marginTop: 10 }}>Respetar el sentido de veta indicado. Control y actualización a cargo de Oficina Técnica.</p>
        </section>

        <section className="mbl-bloque">
          <div className="mbl-bloque-cab"><h3>Placas a enviar</h3></div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {(tpl?.placas ?? []).map((p, i) => <span key={i} className="ui-chip mono" style={{ minHeight: 30, fontSize: 12.5 }}>{p}</span>)}
          </div>
          <p className="mbl-bloque-txt" style={{ marginTop: 8 }}>Identificar cada paquete con modelo, ítem y número de OT.</p>
        </section>

        {tablones && (
          <section className="mbl-bloque">
            <div className="mbl-bloque-cab">
              <h3>Tablones · Anexo B</h3>
              {nogal && <span className="der"><Estado tono="cian">Regla nogal activa</Estado></span>}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
              {tablones.map((t, i) => (
                <span key={i} className="mbl-estado" data-tono={t.includes("Nogal") ? "cian" : "neutro"} style={{ minHeight: 30, fontSize: 13, padding: "0 12px" }}>{t}</span>
              ))}
            </div>
            <div className="mbl-obs" style={{ marginTop: 0 }}>
              <b style={{ color: "var(--text)" }}>2,00 m × 0,20 m × 45 mm</b> · cepillados en 4 caras · marcados con {ot.modelo} / OT {ot.barco}
              {nogal && <><br />La Lenga se reemplaza por Tablón de Nogal.</>}
            </div>
          </section>
        )}

        {herrajesKit && (
          <section className="mbl-bloque">
            <div className="mbl-bloque-cab">
              <h3>Herrajes · Anexo C</h3>
              <span className="der">
                <button type="button" className="mbl-link tenue" onClick={() => setShowHerrajesKit(v => !v)} aria-expanded={showHerrajesKit}>
                  {showHerrajesKit ? "Ocultar kit" : `Ver kit · ${herrajesKit.length} ítems`}
                </button>
              </span>
            </div>
            <p className="mbl-bloque-txt">
              {ot.herrajes_pedido ? "Pedido creado en Compras." : "El pedido se crea desde Seguimiento."} Pañol controla cantidades antes del despacho: un envío = un modelo completo.
            </p>
            {showHerrajesKit && (
              <div className="mbl-kit">
                {herrajesKit.map((h, i) => (
                  <div key={i} className="mbl-kit-fila"><span className="mono">{h.q}×</span><span>{h.name}</span></div>
                ))}
              </div>
            )}
          </section>
        )}

        <section className="mbl-bloque">
          <div className="mbl-bloque-cab">
            <h3>Fechas de producción</h3>
            <span className="der">
              <button type="button" className="mbl-link tenue" onClick={() => setEditFechas(v => !v)}>{editFechas ? "Cancelar" : "Editar"}</button>
            </span>
          </div>
          {editFechas ? (
            <div style={{ display: "grid", gap: 10 }}>
              <div className="mbl-form tres">
                {[
                  { key: "fecha_desmolde_est",  label: "Desmolde estimado" },
                  { key: "fecha_desmolde_real", label: "Desmolde real" },
                  { key: "fecha_botada",        label: "Botada" },
                ].map(({ key, label }) => (
                  <label key={key} className="mbl-campo"><span>{label}</span>
                    <input className="ui-input" type="date" value={fechasForm[key]} onChange={e => setFechasForm(p => ({ ...p, [key]: e.target.value }))} />
                  </label>
                ))}
              </div>
              <div><button type="button" className="ui-btn ui-btn-primario chico" onClick={guardarFechas}>Guardar fechas</button></div>
            </div>
          ) : fechasCargadas ? (
            <div className="mbl-datos">
              {[
                { label: "Desmolde estimado", val: ot.fecha_desmolde_est },
                { label: "Desmolde real",     val: ot.fecha_desmolde_real },
                { label: "Botada",            val: ot.fecha_botada },
              ].map(({ label, val }) => (
                <div key={label}>
                  <div className="mbl-dato-et">{label}</div>
                  <div className={`mbl-dato-v mono${val ? "" : " vacio"}`}>{fmtFecha(val)}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mbl-bloque-txt">Sin fechas cargadas.</p>
          )}
        </section>

        <section className="mbl-bloque">
          <div className="mbl-bloque-cab">
            <h3>Notas</h3>
            {!editNotas && notasVal && <span className="der"><button type="button" className="mbl-link tenue" onClick={() => setEditNotas(true)}>Editar</button></span>}
          </div>
          {editNotas ? (
            <div style={{ display: "grid", gap: 8 }}>
              <textarea
                className="ui-input"
                value={notasVal}
                onChange={e => setNotasVal(e.target.value)}
                autoFocus
                onKeyDown={e => { if (e.key === "Escape") { setEditNotas(false); setNotasVal(ot.notas ?? ""); } }}
                placeholder="Indicaciones para Banco o la Enchapadora…"
              />
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="ui-btn ui-btn-primario chico" onClick={guardarNotas}>Guardar</button>
                <button type="button" className="ui-btn ui-btn-fantasma chico" onClick={() => { setEditNotas(false); setNotasVal(ot.notas ?? ""); }}>Cancelar</button>
              </div>
            </div>
          ) : notasVal ? (
            <div className="mbl-obs" style={{ marginTop: 0 }}>{notasVal}</div>
          ) : (
            <button type="button" className="mbl-hoja-cargar" onClick={() => setEditNotas(true)}>+ Agregar nota</button>
          )}
        </section>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", paddingTop: 4 }}>
          {syncMsg && (
            <span style={{ fontSize: 12, color: syncMsg.ok ? "var(--green)" : "var(--red)" }}>
              {syncMsg.ok
                ? `${syncMsg.created ? "Alta creada" : "Ya vinculada"} en Muebles · ${syncMsg.lineaNombre} / ${syncMsg.unidadCodigo}`
                : `Muebles: ${syncMsg.message ?? "No se pudo sincronizar"}`}
            </span>
          )}
          <div className="mbl-sp" />
          <button type="button" className="ui-btn ui-btn-fantasma chico" onClick={sincronizarMuebles} disabled={syncingMuebles || !onEnsureMueblesUnidad}>
            <RefreshCw size={14} /> {syncingMuebles ? "Sincronizando…" : "Sincronizar con Muebles"}
          </button>
          {esAdmin && (
            <button type="button" className="ui-btn ui-btn-peligro chico" onClick={eliminarOT}><Trash2 size={14} /> Eliminar OT</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Section wrapper ────────────────────────────────────────────────────────
function Section({ title, badge, badgeColor, action, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, paddingBottom: 8, borderBottom: `1px solid var(--panel-2)` }}>
        <span style={{ fontSize: 10, letterSpacing: 1.3, textTransform: "uppercase", color: C.t2, fontWeight: 600 }}>{title}</span>
        {badge && (
          <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 5, background: (badgeColor ?? C.t2) + "15", border: `1px solid ${(badgeColor ?? C.t2)}33`, color: badgeColor ?? C.t2, letterSpacing: 1 }}>{badge}</span>
        )}
        {action && <div style={{ marginLeft: "auto" }}>{action}</div>}
      </div>
      {children}
    </div>
  );
}

// ── PlantillasView ────────────────────────────────────────────────────────
function PlantillasView() {
  const [modeloSel, setModeloSel] = useState("K34");
  const [chapaSim,  setChapaSim]  = useState("");
  const [showSug,   setShowSug]   = useState(false);
  const [herrajesTemplates, setHerrajesTemplates] = useState(() => getHerrajesTemplates());
  const [editHerrajes, setEditHerrajes] = useState(false);
  const [herrajesDraft, setHerrajesDraft] = useState([]);

  const modelos  = Object.keys(TEMPLATES);
  const tpl      = TEMPLATES[modeloSel] ?? TEMPLATES["K34"];
  const nogal    = esNogal(chapaSim);
  const tablones = tablonesList(modeloSel, chapaSim);
  const herrajesModelo = herrajesTemplates[modeloSel] ?? null;

  function updateHerrajeDraft(index, patch) {
    setHerrajesDraft((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function abrirEditorHerrajes() {
    setHerrajesDraft((herrajesTemplates[modeloSel] ?? []).map((row) => ({ ...row })));
    setEditHerrajes(true);
  }

  function guardarHerrajesModelo() {
    const clean = herrajesDraft
      .map((row) => ({ q: row.q, name: String(row.name || "").trim() }))
      .filter((row) => row.name);
    const next = { ...herrajesTemplates, [modeloSel]: clean };
    setHerrajesTemplates(next);
    saveHerrajesTemplates(next);
    setEditHerrajes(false);
  }

  function restaurarHerrajesModelo() {
    const base = (DEFAULT_HERRAJES[modeloSel] ?? []).map((row) => ({ ...row }));
    const next = { ...herrajesTemplates, [modeloSel]: base };
    setHerrajesTemplates(next);
    setHerrajesDraft(base);
    saveHerrajesTemplates(next);
    setEditHerrajes(false);
  }

  const VetaChip = ({ v }) => {
    const col = v.toLowerCase().includes("ancho") ? "#60a5fa"
               : v.toLowerCase().includes("largo") ? C.green
               : C.t2;
    return (
      <span style={{ fontSize: 11, color: col, background: col + "14", border: `1px solid ${col}33`, padding: "2px 7px", borderRadius: 5, fontFamily: C.mono }}>
        {v}
      </span>
    );
  };

  return (
    <div style={{ padding: "28px 28px 60px", maxWidth: 820 }}>
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 22, fontWeight: 600, color: C.t0 }}>Plantillas</div>
        <div style={{ fontSize: 12, color: C.t2, marginTop: 4 }}>
          Referencia fija por modelo · Procedimiento Enchapadora · Klase A
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
        {modelos.map(m => (
          <button key={m} onClick={() => { setModeloSel(m); setEditHerrajes(false); }} style={{
            padding: "8px 18px", borderRadius: 9, cursor: "pointer",
            fontSize: 13, fontWeight: modeloSel === m ? 600 : 400,
            fontFamily: C.mono, transition: "all .12s",
            background: modeloSel === m ? "rgba(59,130,246,0.15)" : C.s0,
            border: `1px solid ${modeloSel === m ? "rgba(59,130,246,0.45)" : C.b0}`,
            color: modeloSel === m ? "#60a5fa" : C.t1,
          }}>{m}</button>
        ))}
      </div>

      {/* Simulador de chapa */}
      <div style={{ background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 12, padding: "14px 16px", marginBottom: 24, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, letterSpacing: 1.3, textTransform: "uppercase", color: C.t2, fontWeight: 600, whiteSpace: "nowrap" }}>Simular chapa</span>
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <input
            style={{ ...INP, padding: "6px 10px", fontSize: 12 }}
            placeholder="Ej: Nogal Natural, Roble Plata Rayado…"
            value={chapaSim}
            onChange={e => { setChapaSim(e.target.value); setShowSug(e.target.value.length > 0); }}
            onFocus={() => setShowSug(true)}
            onBlur={() => setTimeout(() => setShowSug(false), 150)}
          />
          {showSug && (
            <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50, background: C.panelSolid, border: `1px solid ${C.b1}`, borderRadius: 8, marginTop: 3, overflow: "hidden", boxShadow: "0 8px 24px rgba(0,0,0,0.6)" }}>
              {CHAPAS_OPCIONES.filter(s => !chapaSim || s.toLowerCase().includes(chapaSim.toLowerCase())).map(s => (
                <button key={s} onMouseDown={() => { setChapaSim(s); setShowSug(false); }} style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", textAlign: "left", padding: "7px 12px", background: "transparent", border: "none", color: C.t1, cursor: "pointer", fontSize: 12, fontFamily: C.sans, borderBottom: `1px solid ${C.b0}` }}
                  onMouseEnter={e => e.currentTarget.style.background = C.s1}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <ChapaSwatch tipo={s} size="xs" />
                  <span>{s}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {chapaSim && <ChapaSwatch tipo={chapaSim} size="pill" label />}
        {chapaSim && (
          <button onClick={() => setChapaSim("")} style={{ background: "transparent", border: `1px solid ${C.b0}`, color: C.t2, padding: "5px 10px", borderRadius: 7, cursor: "pointer", fontSize: 12, fontFamily: C.sans }}>Limpiar</button>
        )}
        {nogal && (
          <span style={{ fontSize: 12, color: "#0891b2", background: "rgba(34,211,238,0.08)", border: "1px solid rgba(34,211,238,0.2)", padding: "4px 10px", borderRadius: 6 }}>
            ⚠ Nogal — Lenga → Tablón de Nogal en Anexo B
          </span>
        )}
      </div>

      {/* Placas */}
      <Section title="Placas a enviar">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
          {tpl?.placas.map((p, i) => (
            <div key={i} style={{ fontSize: 13, color: C.t0, background: C.s1, border: `1px solid ${C.b0}`, padding: "7px 14px", borderRadius: 8, fontFamily: C.mono }}>{p}</div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: C.t2 }}>Identificar cada paquete con modelo, ítem y número de OT.</div>
      </Section>

      {/* Trabajo a Realizar */}
      <Section title="Trabajo a Realizar">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.b0}` }}>
                {["Ítem", "Material", "Medidas", "Caras", "Sentido de Veta"].map((h, i) => (
                  <th key={i} style={{ textAlign: "left", padding: "6px 12px", fontSize: 10, letterSpacing: 1.3, color: C.t2, textTransform: "uppercase", fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tpl?.items.map((it, idx) => (
                <tr key={it.id} style={{ borderBottom: `1px solid var(--panel)`, background: idx % 2 === 0 ? C.s0 : "transparent" }}>
                  <td style={{ padding: "10px 12px", fontFamily: C.mono, fontSize: 12, fontWeight: 600, color: C.t1 }}>{it.id}</td>
                  <td style={{ padding: "10px 12px", color: C.t0 }}>{it.material}</td>
                  <td style={{ padding: "10px 12px", color: C.t1, fontFamily: C.mono, fontSize: 12 }}>{it.medidas}</td>
                  <td style={{ padding: "10px 12px", color: C.t1 }}>{it.caras}</td>
                  <td style={{ padding: "10px 12px" }}><VetaChip v={it.veta} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 10, fontSize: 11, color: C.t2, lineHeight: 1.7 }}>
          Respetar el sentido de veta indicado. · Las hojas de chapa las escribe el carpintero en cada OT.
        </div>
      </Section>

      {/* Tablones Anexo B */}
      {tpl?.tablones ? (
        <Section title="Tablones — Anexo B" badge={nogal ? "⚠ regla nogal activa" : undefined} badgeColor="#0891b2">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            {tablones?.map((t, i) => (
              <div key={i} style={{
                fontSize: 13, padding: "7px 14px", borderRadius: 8, fontFamily: C.mono,
                background: t.includes("Nogal") ? "rgba(34,211,238,0.08)" : C.s1,
                border: `1px solid ${t.includes("Nogal") ? "rgba(34,211,238,0.25)" : C.b0}`,
                color: t.includes("Nogal") ? "#0891b2" : C.t0,
              }}>{t}</div>
            ))}
            {!chapaSim && (
              <div style={{ fontSize: 12, color: C.t2, alignSelf: "center", fontStyle: "italic" }}>
                Simulá una chapa de nogal arriba para ver el reemplazo
              </div>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div style={{ background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 9, padding: "10px 14px" }}>
              <div style={{ fontSize: 10, letterSpacing: 1.3, textTransform: "uppercase", color: C.t2, marginBottom: 6 }}>Chapa estándar</div>
              <div style={{ fontFamily: C.mono, fontSize: 13, color: C.t0 }}>{tpl.tablones.lenga} Lenga + {tpl.tablones.okume} Okumé</div>
            </div>
            <div style={{ background: "rgba(34,211,238,0.05)", border: "1px solid rgba(34,211,238,0.2)", borderRadius: 9, padding: "10px 14px" }}>
              <div style={{ fontSize: 10, letterSpacing: 1.3, textTransform: "uppercase", color: "#0891b2", marginBottom: 6 }}>Con chapa de nogal</div>
              <div style={{ fontFamily: C.mono, fontSize: 13, color: "#0891b2" }}>{tpl.tablones.lenga} Nogal + {tpl.tablones.okume} Okumé</div>
            </div>
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: C.t2, lineHeight: 1.7 }}>
            Medida estándar: 2,00 m × 0,20 m × 45 mm · Cepillados y marcados por carpintería.
          </div>
        </Section>
      ) : (
        <Section title="Tablones — Anexo B">
          <div style={{ fontSize: 12, color: C.t2, fontStyle: "italic" }}>Sin datos de tablones para {modeloSel} todavía.</div>
        </Section>
      )}

      {/* Herrajes Anexo C */}
      {herrajesModelo ? (
        <Section
          title="Herrajes — Anexo C"
          badge={`Kit ${modeloSel} · ${herrajesModelo.length} ítems`}
          badgeColor={C.purple}
          action={(
            <button
              onClick={() => (editHerrajes ? setEditHerrajes(false) : abrirEditorHerrajes())}
              style={{ background: editHerrajes ? C.s1 : "transparent", border: `1px solid ${editHerrajes ? C.b1 : C.b0}`, color: editHerrajes ? C.t0 : C.t2, padding: "5px 10px", borderRadius: 7, cursor: "pointer", fontSize: 12, fontFamily: C.sans }}
            >
              {editHerrajes ? "Cerrar edición" : "Editar kit"}
            </button>
          )}
        >
          {editHerrajes ? (
            <div style={{ display: "grid", gap: 8 }}>
              {herrajesDraft.map((h, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "86px 1fr auto", gap: 8, alignItems: "center" }}>
                  <input value={h.q ?? ""} onChange={(e) => updateHerrajeDraft(i, { q: e.target.value })} style={{ ...INP, fontFamily: C.mono }} placeholder="Cant." />
                  <input value={h.name ?? ""} onChange={(e) => updateHerrajeDraft(i, { name: e.target.value })} style={INP} placeholder="Nombre del herraje" />
                  <button
                    onClick={() => setHerrajesDraft((rows) => rows.filter((_, idx) => idx !== i))}
                    style={{ background: "transparent", border: "1px solid rgba(239,68,68,0.25)", color: C.red, padding: "7px 10px", borderRadius: 7, cursor: "pointer", fontSize: 12, fontFamily: C.sans }}
                  >
                    Borrar
                  </button>
                </div>
              ))}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                <button onClick={() => setHerrajesDraft((rows) => [...rows, { q: 1, name: "" }])} style={{ background: C.s0, border: `1px solid ${C.b0}`, color: C.t1, padding: "7px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontFamily: C.sans }}>+ Ítem</button>
                <button onClick={guardarHerrajesModelo} style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.28)", color: C.green, padding: "7px 14px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontFamily: C.sans, fontWeight: 600 }}>Guardar plantilla</button>
                <button onClick={restaurarHerrajesModelo} style={{ background: "transparent", border: `1px solid ${C.b0}`, color: C.t2, padding: "7px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontFamily: C.sans }}>Restaurar base</button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {herrajesModelo.map((h, i) => (
                <div key={i} style={{ fontSize: 12, color: C.t1, background: C.s0, border: `1px solid ${C.b0}`, padding: "5px 11px", borderRadius: 7, fontFamily: C.mono }}>
                  <span style={{ color: C.purple, fontWeight: 600 }}>{h.q}×</span>{" "}{h.name}
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: 10, fontSize: 11, color: C.t2, lineHeight: 1.7 }}>
            Pañol prepara el kit completo antes del despacho a Oberti. Un envío = un modelo.
          </div>
        </Section>
      ) : (
        <Section title="Herrajes — Anexo C">
          <div style={{ fontSize: 12, color: C.t2, fontStyle: "italic" }}>Sin datos de herrajes para {modeloSel} todavía.</div>
        </Section>
      )}

      {/* Materiales base */}
      <Section title="Materiales base — Pedido de compra">
        {modeloSel === "K34" && <MatRow items={["3 terciados 3 mm", "1 terciado 15 mm", "7 placas carpintero", "30 pies Okumé", "30 pies Lenga", "70 m² de chapa"]} />}
        {modeloSel === "K37" && <MatRow items={["8 placas carpintero", "105 m² de chapa", "25 pies Okumé", "25 pies Lenga"]} />}
        {modeloSel === "K42" && <MatRow items={["10 placas carpintero", "8 terciados 3 mm", "1 terciado 9 mm", "1 terciado 12 mm", "1 terciado 18 mm", "80 pies Okumé", "60 pies Lenga", "150 m² de chapa"]} />}
        {modeloSel === "K43" && <MatRow items={["13 placas carpintero", "6 terciados 3 mm", "60 pies Okumé", "60 pies Lenga", "160 m² de chapa"]} />}
        {modeloSel === "K52" && <MatRow items={["16 placas carpintero", "10 terciados 3 mm", "4 terciados 9 mm", "1 terciado 12 mm", "100 pies Okumé", "80 pies Lenga", "230 m² de chapa"]} />}
        {modeloSel === "K55" && <MatRow items={["28 placas carpintero", "10 terciados 3 mm", "4 terciados 9 mm", "6 tablones Lenga", "4 tablones Okumé"]} />}
        <div style={{ marginTop: 10, fontSize: 11, color: C.t2 }}>
          Fuente: Procedimiento — Gestión de Maderas, Chapas, Tablones y Herrajes · Oficina Técnica.
        </div>
      </Section>
    </div>
  );
}

function MatRow({ items }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
      {items.map((it, i) => (
        <div key={i} style={{ fontSize: 12, color: C.t1, background: C.s0, border: `1px solid ${C.b0}`, padding: "5px 11px", borderRadius: 7, fontFamily: C.mono }}>{it}</div>
      ))}
    </div>
  );
}

// ── Main: EnchapadoView ────────────────────────────────────────────────────

// Función Global para calcular OT (ej: 55-3)
export default function EnchapadoView({ esAdmin, onEnsureMueblesUnidad }) {
  const [ots,        setOts]        = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [setupError, setSetupError] = useState(false);
  const [view,       setView]       = useState("list"); // "list" | "detail" | "plantillas"
  const [selected,   setSelected]   = useState(null);
  const [showNew,    setShowNew]    = useState(false);
  const [filtroM,    setFiltroM]    = useState("todos");
  const [filtroE,    setFiltroE]    = useState("todos");
  const [q,          setQ]          = useState("");

  const cargar = useCallback(async () => {
    setLoading(true);
    setSetupError(false);
    const { data, error } = await supabase
      .from("enchapado_ots")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      if (
        error.code === "42P01" ||
        error.message.toLowerCase().includes("does not exist") ||
        error.message.toLowerCase().includes("schema cache") ||
        error.message.toLowerCase().includes("not found")
      ) {
        setSetupError(true);
      }
    }
    setOts(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { cargar(); }, 0);
    return () => clearTimeout(timer);
  }, [cargar]);

  function onCreated(ot) {
    setShowNew(false);
    setOts(p => [ot, ...p]);
    setSelected(ot);
    setView("detail");
  }

  function onBack() { setView("list"); setSelected(null); }
  function onUpdated(ot) { setOts(p => p.map(o => o.id === ot.id ? ot : o)); setSelected(ot); }
  function onDeleted(id) { setOts(p => p.filter(o => o.id !== id)); setView("list"); setSelected(null); }

  const filtered = useMemo(() => {
    let rows = ots;
    if (filtroM !== "todos") rows = rows.filter(o => o.modelo === filtroM);
    if (filtroE !== "todos") rows = rows.filter(o => o.estado === filtroE);
    if (q.trim()) {
      const qq = q.toLowerCase();
      rows = rows.filter(o =>
        o.barco.toLowerCase().includes(qq) ||
        (o.tipo_chapa ?? "").toLowerCase().includes(qq) ||
        (o.responsable ?? "").toLowerCase().includes(qq)
      );
    }
    return rows;
  }, [ots, filtroM, filtroE, q]);

  const porModelo = useMemo(() => {
    const map = {};
    filtered.forEach(o => {
      if (!map[o.modelo]) map[o.modelo] = [];
      map[o.modelo].push(o);
    });
    return map;
  }, [filtered]);

  const stats = useMemo(() => ({
    total:     ots.length,
    pendiente: ots.filter(o => o.estado === "Pendiente").length,
    enviada:   ots.filter(o => o.estado === "Enviada").length,
    devuelta:  ots.filter(o => o.estado === "Devuelta").length,
    rehacer:   ots.filter(o => o.estado === "Rehacer").length,
  }), [ots]);

  if (setupError) return <SetupCard onRetry={cargar} />;

  if (view === "plantillas") return (
    <div>
      <div style={{ borderBottom: `1px solid ${C.b0}`, padding: "14px 28px", display: "flex", alignItems: "center", gap: 8 }}>
        <button onClick={() => setView("list")} style={{ background: "transparent", border: "none", color: C.t2, cursor: "pointer", fontSize: 14, padding: "2px 6px", display: "flex", alignItems: "center", gap: 5, fontFamily: C.sans }}>‹ OTs</button>
        <span style={{ color: C.b1 }}>|</span>
        <span style={{ fontSize: 12, color: C.t2, letterSpacing: 1.3, textTransform: "uppercase" }}>Plantillas</span>
      </div>
      <PlantillasView />
    </div>
  );

  if (view === "detail" && selected) {
    return (
      <OTDetail ot={selected} ots={ots} onBack={onBack}
        onUpdated={onUpdated}
        onDeleted={onDeleted}
        esAdmin={esAdmin}
        onEnsureMueblesUnidad={onEnsureMueblesUnidad}
      />
    );
  }

  const filterBtnSt = act => ({
    padding: "5px 12px", borderRadius: 7, cursor: "pointer", fontSize: 12,
    fontFamily: C.sans, transition: "all .15s",
    background: act ? C.s1 : "transparent",
    border: `1px solid ${act ? C.b1 : "transparent"}`,
    color: act ? C.t0 : C.t2,
  });

  return (
    <div style={{ padding: "28px 28px 60px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 600, color: C.t0 }}>Preparación y enchapado</div>
          <div style={{ fontSize: 12, color: C.t2, marginTop: 4, fontFamily: C.mono }}>
            {stats.total} OT{stats.total !== 1 ? "s" : ""} · {stats.enviada} enviada{stats.enviada !== 1 ? "s" : ""} · {stats.devuelta} devuelta{stats.devuelta !== 1 ? "s" : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {esAdmin && (
            <button
              onClick={() => setShowNew(true)}
              style={{ padding: "9px 18px", background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.3)", color: "#60a5fa", borderRadius: 9, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: C.sans }}
            >+ Nueva OT</button>
          )}
          <button
            onClick={() => setView("plantillas")}
            style={{ padding: "9px 16px", background: C.s0, border: `1px solid ${C.b0}`, color: C.t2, borderRadius: 9, cursor: "pointer", fontSize: 13, fontFamily: C.sans }}
          >Plantillas</button>
        </div>
      </div>

      {/* Stats chips */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
        {[
          { label: "Pendientes", val: stats.pendiente, color: C.t2,    est: "Pendiente" },
          { label: "Enviadas",   val: stats.enviada,   color: C.blue, est: "Enviada" },
          { label: "Devueltas",  val: stats.devuelta,  color: C.green, est: "Devuelta" },
          { label: "Rehacer",    val: stats.rehacer,   color: C.red,   est: "Rehacer" },
        ].filter(s => s.val > 0).map(s => (
          <button key={s.est} onClick={() => setFiltroE(filtroE === s.est ? "todos" : s.est)} style={{ display: "flex", alignItems: "center", gap: 7, background: filtroE === s.est ? s.color + "15" : C.s0, border: `1px solid ${filtroE === s.est ? s.color + "44" : C.b0}`, color: s.color, padding: "5px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontFamily: C.sans }}>
            <span style={{ fontFamily: C.mono, fontWeight: 600, fontSize: 14 }}>{s.val}</span>
            {s.label}
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        <button style={filterBtnSt(filtroM === "todos")} onClick={() => setFiltroM("todos")}>Todos</button>
        {Object.keys(TEMPLATES).map(m => (
          <button key={m} style={{ ...filterBtnSt(filtroM === m), fontFamily: C.mono, fontSize: 12 }} onClick={() => setFiltroM(filtroM === m ? "todos" : m)}>{m}</button>
        ))}
        <div style={{ flex: 1, minWidth: 160 }}>
          <input
            style={{ ...INP, padding: "5px 11px", fontSize: 13 }}
            placeholder="Buscar barco, chapa, responsable…"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
        </div>
        {filtroE !== "todos" && (
          <button onClick={() => setFiltroE("todos")} style={{ ...filterBtnSt(true), color: C.blue }}>
            × {filtroE}
          </button>
        )}
      </div>

      {/* Lista */}
      {loading ? (
        <Cargando />
      ) : ots.length === 0 ? (
        <div style={{ color: C.t2, fontSize: 13, padding: "60px 0", textAlign: "center", lineHeight: 2 }}>
          Sin OTs todavía.{esAdmin && <><br /><span style={{ color: C.t1 }}>Usá "+ Nueva OT" para crear la primera.</span></>}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ color: C.t2, fontSize: 13, padding: "40px 0", textAlign: "center" }}>Sin resultados para este filtro.</div>
      ) : filtroM !== "todos" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map(ot => (
            <OTCard key={ot.id} ot={ot} ots={ots} onClick={() => { setSelected(ot); setView("detail"); }} />
          ))}
        </div>
      ) : (
        Object.entries(porModelo).map(([modelo, rows]) => (
          <div key={modelo} style={{ marginBottom: 28 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 8, borderBottom: `1px solid var(--panel-2)`, marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: C.mono, fontSize: 12, fontWeight: 600, color: C.t1, background: C.s1, border: `1px solid ${C.b0}`, padding: "2px 8px", borderRadius: 6 }}>{modelo}</span>
                <span style={{ fontSize: 11, color: C.t2 }}>{rows.length} OT{rows.length !== 1 ? "s" : ""}</span>
              </div>
              <div style={{ display: "flex", gap: 5 }}>
                {["Enviada", "Devuelta", "Rehacer"].map(est => {
                  const n = rows.filter(r => r.estado === est).length;
                  if (!n) return null;
                  const col = ESTADO_META[est].color;
                  return <span key={est} style={{ fontSize: 11, color: col, fontFamily: C.mono }}>{n} {est.toLowerCase()}{n > 1 ? "s" : ""}</span>;
                })}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {rows.map(ot => (
                <OTCard key={ot.id} ot={ot} ots={ots} onClick={() => { setSelected(ot); setView("detail"); }} />
              ))}
            </div>
          </div>
        ))
      )}

      {showNew && <NuevaOTModal onClose={() => setShowNew(false)} onCreate={onCreated} onEnsureMueblesUnidad={onEnsureMueblesUnidad} />}

      <style>{`.ot-card:hover { border-color: rgba(255,255,255,0.14) !important; background: var(--panel) !important; }`}</style>
    </div>
  );
}
