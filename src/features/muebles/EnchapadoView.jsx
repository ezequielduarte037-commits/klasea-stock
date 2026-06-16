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

import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "@/supabaseClient";
import { ChapaSwatch, chapaColor, chapaGradient, esNogal } from "@/features/muebles/chapa";

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
  "Enviada":   { color: C.amber, bg: "rgba(245,158,11,0.1)",     dot: C.amber },
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
const HERRAJES = {
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
    { q: 31, name: "Bisagra codo 9 + base" },
    { q: 18, name: "Retén push" },
    { q: 1,  name: "Guías telescópicas 25 cm" },
    { q: 14, name: "Bisagras ocultas" },
    { q: 4,  name: "Cerraduras Kallay 503" },
    { q: 3,  name: "Pistones 60N" },
    { q: 1,  name: "Guías telescópicas 35 cm" },
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
    { q: 37, name: "Bisagras codo 9" },
    { q: 20, name: "Bisagras codo 0" },
    { q: 2,  name: "Bisagras codo 18" },
    { q: 1,  name: "Barral de ropero (1m)" },
    { q: 4,  name: "Soportes de barral de ropero" },
    { q: 42, name: "Imanes para puertas de muebles" },
    { q: 6,  name: "Correderas de cajón - LARGO 400mm Cierre suave" },
    { q: 6,  name: "Correderas de cajón - LARGO 450mm Cierre suave" },
    { q: 1,  name: "Correderas de cajón - LARGO 250mm Cierre suave" },
    { q: 1,  name: "Bisagra tipo piano (700mm)" }
  ],
};

// ── Helpers ────────────────────────────────────────────────────────────────
function dispatchSteps(ot) {
  const hasTablones = !!TEMPLATES[ot.modelo]?.tablones;
  const hasHerrajes = !!HERRAJES[ot.modelo];
  const estado = ot.estado || "Pendiente";
  const steps = [];
  if (hasTablones) {
    steps.push({ key: "tablones_pedido", label: "Tablones pedidos", done: !!ot.tablones_pedido });
    steps.push({ key: "tablones_enviado", label: "Tablones enviados", done: !!ot.tablones_enviado });
  }
  if (hasHerrajes) {
    steps.push({ key: "herrajes_pedido", label: "Herrajes pedidos", done: !!ot.herrajes_pedido });
    steps.push({ key: "herrajes_enviado", label: "Herrajes enviados", done: !!ot.herrajes_enviado });
  }
  steps.push({ key: "enviada", label: "OT enviada a Oberti", done: estado === "Enviada" || estado === "Devuelta" });
  steps.push({ key: "devuelta", label: "Devuelta", done: estado === "Devuelta" });
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
        <div style={{ width: `${p.pct}%`, height: "100%", background: p.done === p.total ? C.green : C.amber, borderRadius: 999 }} />
      </div>
      <span style={{ fontSize: compact ? 10 : 11, color: C.t2, fontFamily: C.mono, fontWeight: 700, whiteSpace: "nowrap" }}>
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
          <div style={{ fontSize: 10, letterSpacing: 1.3, textTransform: "uppercase", color: C.t2, fontWeight: 800 }}>Proceso de despacho</div>
          <div style={{ fontSize: 12, color: C.t1, marginTop: 3 }}>
            Preparar materiales, enviar a Oberti y confirmar devolución.
          </div>
        </div>
        <DispatchProgress ot={ot} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8 }}>
        {steps.map((s, idx) => {
          const done = !!s.done;
          const color = done ? C.green : isRehacer ? C.red : C.amber;
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
                fontWeight: 900,
                fontFamily: C.mono,
              }}>
                {done ? "✓" : idx + 1}
              </span>
              <span style={{ fontSize: 12, color: done ? C.t0 : C.t2, lineHeight: 1.25, fontWeight: done ? 700 : 600 }}>
                {s.label}
              </span>
            </div>
          );
        })}
      </div>
      {isRehacer && (
        <div style={{ marginTop: 10, fontSize: 12, color: C.red, background: "var(--red-soft)", border: "1px solid var(--red-border)", padding: "7px 10px", borderRadius: 8, fontWeight: 700 }}>
          Esta OT está marcada para rehacer. Revisá materiales antes de volver a enviar.
        </div>
      )}
    </div>
  );
}

function tablonesList(modelo, tipoChapa) {
  const tpl = TEMPLATES[modelo]?.tablones;
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
function OTCard({ ot, ots, onClick }) {
    const otNumStr = getOtNum(ot, ots);
  
  

  const meta = ESTADO_META[ot.estado] ?? ESTADO_META["Pendiente"];
  const tpl  = TEMPLATES[ot.modelo];
  const chapa = chapaColor(ot.tipo_chapa);

  // Desmolde: preferir real sobre estimado
  const desmolde = ot.fecha_desmolde_real || ot.fecha_desmolde_est;
  const desmoldeLabel = ot.fecha_desmolde_real ? "Desmolde" : "Desmolde est.";

  // Indicadores de despacho pendiente
  const tPendiente = tpl?.tablones && !ot.tablones_enviado;
  const hPendiente = HERRAJES[ot.modelo] && !ot.herrajes_enviado;

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
        fontSize: 12, fontWeight: 700, color: C.t0, fontFamily: C.mono,
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
              <span style={{ fontSize: 10, color: C.amber, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", padding: "1px 6px", borderRadius: 4 }}>
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
        fontSize: 12, fontWeight: 700, color: meta.color,
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

  const LBL = { fontSize: 10, letterSpacing: 1.3, color: C.t2, display: "block", marginBottom: 5, marginTop: 12, textTransform: "uppercase", fontWeight: 700 };

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

        <div style={{ fontSize: 16, fontWeight: 700, color: C.t0, marginBottom: 2 }}>Nueva OT — Enchapadora</div>
        <div style={{ fontSize: 12, color: C.t2, marginBottom: 4 }}>Klase A</div>

        {/* Modelo */}
        <label style={LBL}>Modelo</label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {Object.keys(TEMPLATES).map(m => (
            <button key={m} onClick={() => f("modelo", m)} style={{
              padding: "6px 14px", borderRadius: 8, cursor: "pointer", fontSize: 13,
              fontWeight: form.modelo === m ? 700 : 400, fontFamily: C.mono,
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
              {CHAPAS_SUGERIDAS.filter(s => !form.tipo_chapa || s.toLowerCase().includes(form.tipo_chapa.toLowerCase())).map(s => (
                <button key={s} onMouseDown={() => f("tipo_chapa", s)} style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", textAlign: "left", padding: "8px 12px", background: "transparent", border: "none", color: C.t1, cursor: "pointer", fontSize: 13, fontFamily: C.sans, borderBottom: `1px solid ${C.b0}` }}
                  onMouseEnter={e => e.currentTarget.style.background = C.s1}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <ChapaSwatch tipo={s} size="xs" />
                  <span style={{ flex: 1 }}>{s}</span>
                  {esNogal(s) && <span style={{ fontSize: 11, color: "#d97706" }}>nogal</span>}
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
          <div style={{ marginTop: 5, fontSize: 12, color: "#d97706", background: "rgba(217,119,6,0.07)", border: "1px solid rgba(217,119,6,0.2)", borderRadius: 6, padding: "5px 10px" }}>
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
          style={{ marginTop: 20, width: "100%", padding: "11px", background: saving ? C.s1 : "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.35)", color: "#60a5fa", fontWeight: 700, borderRadius: 10, cursor: saving ? "not-allowed" : "pointer", fontFamily: C.sans, fontSize: 14, opacity: !form.barco.trim() ? 0.5 : 1 }}
        >{saving ? "Creando…" : "Crear OT"}</button>
      </div>
    </div>
  );
}

// ── Vista detalle de una OT ────────────────────────────────────────────────
function OTDetail({ ot: otInit, ots, onBack, onUpdated, onDeleted, esAdmin, onEnsureMueblesUnidad }) {
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
  const inputRef = useRef(null);

  const tpl     = TEMPLATES[ot.modelo];
  const nogal   = esNogal(ot.tipo_chapa);
  const chapa   = chapaColor(ot.tipo_chapa);
  const tablones = tablonesList(ot.modelo, ot.tipo_chapa);
    const herrajesKit = HERRAJES[ot.modelo] ?? null;
    let otNumStr = "---";
  try {
    if (ots && ots.length > 0 && ot && ot.modelo && ot.barco) {
      const mNum = ot.modelo.replace(/[^0-9]/g, "");
      const mismosModelos = ots.filter(o => o.modelo === ot.modelo).sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
      const barcosUnicos = [...new Set(mismosModelos.map(o => o.barco.trim().toUpperCase()))];
      const idx = barcosUnicos.indexOf(ot.barco.trim().toUpperCase());
      const n = idx >= 0 ? idx + 1 : barcosUnicos.length + 1;
      otNumStr = `${mNum}-${n}`;
    }
  } catch (err) { 
    console.error("Error al calcular N OT:", err);
  }

  

  async function cargar() {
    setLoading(true);
    const { data } = await supabase
      .from("enchapado_ot_items")
      .select("*")
      .eq("ot_id", ot.id)
      .order("item_id");
    setItems(data ?? []);
    setLoading(false);
  }

  useEffect(() => { cargar(); }, [ot.id]);
  useEffect(() => { setSyncMsg(ot.muebles_sync ?? null); }, [ot]);

  function abrirEdit(itemId) {
    const row = items.find(i => i.item_id === itemId);
    setEditItem(itemId);
    setEditVal(row?.chapas_descripcion ?? "");
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  async function guardarChapas(itemId) {
    const row = items.find(i => i.item_id === itemId);
    if (!row) return;
    await supabase.from("enchapado_ot_items").update({ chapas_descripcion: editVal }).eq("id", row.id);
    setItems(p => p.map(i => i.item_id === itemId ? { ...i, chapas_descripcion: editVal } : i));
    setEditItem(null);
  }

  async function setEstado(estado) {
    await supabase.from("enchapado_ots").update({ estado }).eq("id", ot.id);
    const updated = { ...ot, estado };
    setOt(updated);
    onUpdated?.(updated);
  }

  async function guardarNotas() {
    await supabase.from("enchapado_ots").update({ notas: notasVal }).eq("id", ot.id);
    const updated = { ...ot, notas: notasVal };
    setOt(updated);
    setEditNotas(false);
    onUpdated?.(updated);
  }

  async function guardarFechas() {
    const updates = {
      fecha_desmolde_est:  fechasForm.fecha_desmolde_est  || null,
      fecha_desmolde_real: fechasForm.fecha_desmolde_real || null,
      fecha_botada:        fechasForm.fecha_botada        || null,
    };
    await supabase.from("enchapado_ots").update(updates).eq("id", ot.id);
    const updated = { ...ot, ...updates };
    setOt(updated);
    setEditFechas(false);
    onUpdated?.(updated);
  }

  // Toggle genérico para campos boolean
  async function toggle(campo) {
    const val = !ot[campo];
    await supabase.from("enchapado_ots").update({ [campo]: val }).eq("id", ot.id);
    const updated = { ...ot, [campo]: val };
    setOt(updated);
    onUpdated?.(updated);
  }

  async function eliminarOT() {
    if (!window.confirm(`¿Eliminar OT "${ot.barco} — ${ot.modelo}"? Esta acción no se puede deshacer.`)) return;
    await supabase.from("enchapado_ots").delete().eq("id", ot.id);
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

  function imprimir() {
    const tablonesLineas = tablonesList(ot.modelo, ot.tipo_chapa) ?? [];
    const printTone = chapaColor(ot.tipo_chapa);
    const printChapa = (ot.tipo_chapa || "Sin especificar")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
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
    font-family:'JetBrains Mono', monospace;
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
    <span>Chapa: ${printChapa}</span>
  </div>
</section>`;

    // ── Estilos compartidos ───────────────────────────────────────
    const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&family=JetBrains+Mono:wght@400;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Outfit', sans-serif; font-size: 11pt; color: #1a1a1a; background: #fff; }
  .page { padding: 14mm 16mm 16mm; page-break-after: always; }
  .page:last-child { page-break-after: auto; }
  .dest-banner { display: inline-flex; align-items: center; gap: 8px; background: #1a1a1a; color: #fff;
    font-size: 8pt; font-weight: 700; letter-spacing: 3px; text-transform: uppercase;
    padding: 5px 14px; border-radius: 4px; margin-bottom: 12px; font-family: 'JetBrains Mono', monospace; }
  .dest-banner.carp  { background: #1e3a2f; }
  .dest-banner.paniol { background: #2a1a3a; }
  header { display: flex; justify-content: space-between; align-items: flex-start;
    border-bottom: 2px solid #1a1a1a; padding-bottom: 10px; margin-bottom: 14px; }
  .brand { font-family: 'JetBrains Mono', monospace; font-size: 9pt; letter-spacing: 3px; text-transform: uppercase; color: #666; }
  .title { font-size: 20pt; font-weight: 700; margin: 2px 0; }
  .meta { font-size: 9pt; color: #555; margin-top: 4px; }
  .estado { font-size: 9pt; font-weight: 700; padding: 4px 10px; border: 1.5px solid #1a1a1a; border-radius: 5px; text-align: center; }
  section { margin-bottom: 14px; }
  h3 { font-size: 8pt; letter-spacing: 2px; text-transform: uppercase; color: #888; font-weight: 600;
    margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px solid #ddd; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 6px; }
  .chip { font-family: 'JetBrains Mono', monospace; font-size: 9pt; background: #f4f4f4;
    border: 1px solid #ccc; padding: 3px 10px; border-radius: 5px; }
  .chip.nogal { background: #fff8ed; border-color: #d97706; color: #b45309; }
  .chip.big   { font-size: 12pt; font-weight: 700; padding: 8px 18px; background: #f0f0f0; }
  .chip.big.nogal { font-size: 12pt; font-weight: 700; padding: 8px 18px; }
  .nogal-note { font-size: 9pt; color: #b45309; margin-top: 6px; font-weight: 600; }
  .sub { font-size: 9pt; color: #777; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
  th { text-align: left; font-size: 7.5pt; letter-spacing: 1.5px; text-transform: uppercase;
    color: #888; font-weight: 600; padding: 5px 8px; border-bottom: 1.5px solid #1a1a1a; }
  td { padding: 7px 8px; border-bottom: 1px solid #e8e8e8; vertical-align: top; }
  tr:nth-child(even) td { background: #fafafa; }
  td.item-id { font-family: 'JetBrains Mono', monospace; font-weight: 700; color: #555; width: 36px; }
  td.chapas  {
  font-family: 'JetBrains Mono', monospace;
  font-size: 9pt;
  white-space: pre-wrap;
  width: 320px;
  min-width: 320px;
  line-height: 1.45;
}
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
    .page { padding: 10mm 12mm 12mm; }
    @page { margin: 0; size: A4; }
  }`;

    // ── Header común (mini versión para páginas 2 y 3) ────────────
            const shortId = ot.id ? ot.id.split('-')[0].toUpperCase() : "S/N";
    const miniHeader = `
<header>
  <div>
    <div class="brand">
      Klase A &middot; Enchapadora &nbsp;|&nbsp; OT ${ot.barco}
    </div>

    <div class="title">${ot.barco}</div>

    <div class="meta">
      Modelo: <strong>${ot.modelo}</strong>
      &nbsp;&middot;&nbsp;
      Fecha: <strong>${fmtFecha(ot.fecha)}</strong>
    </div>
  </div>

  <div style="display:flex; flex-direction:column; align-items:flex-end; gap:8px;">
    <div style="
      font-family:'JetBrains Mono',monospace;
      font-size:16pt;
      font-weight:800;
      color:#1a1a1a;
      background:var(--text);
      padding:4px 12px;
      border:2px solid #1a1a1a;
      border-radius:6px;
    ">
      ${ot.barco}
    </div>

    <div class="estado">${ot.estado}</div>
  </div>
</header>`;

    // ── PÁGINA 1: ENCHAPADORA ─────────────────────────────────────
    const rowsItems = (tpl?.items ?? []).map(it => {
      const row = items.find(i => i.item_id === it.id);
      const chapas = row?.chapas_descripcion?.trim() || "—";
      return `
        <tr>
          <td class="item-id">${it.id}</td>
          <td class="chapas">${chapas.replace(/\n/g, "<br>")}</td>
          <td>${it.material}</td>
          <td>${it.medidas}</td>
          <td>${it.caras}</td>
          <td>${it.veta}</td>
        </tr>`;
    }).join("");

    const placasHTML = (tpl?.placas ?? []).map(p => `<span class="chip">${p}</span>`).join("");

    const fechasHTML = (ot.fecha_desmolde_est || ot.fecha_desmolde_real || ot.fecha_botada) ? `
    <section>
      <h3>Fechas de Producción</h3>
      <div class="chips">
        ${ot.fecha_desmolde_est  ? `<span class="chip">Desmolde est.: ${fmtFecha(ot.fecha_desmolde_est)}</span>`  : ""}
        ${ot.fecha_desmolde_real ? `<span class="chip">Desmolde real: ${fmtFecha(ot.fecha_desmolde_real)}</span>` : ""}
        ${ot.fecha_botada        ? `<span class="chip">Botada: ${fmtFecha(ot.fecha_botada)}</span>`               : ""}
      </div>
    </section>` : "";

    const pagEnchapadoHTML = `
  <div class="page">
    <div class="dest-banner">🔨 Para: Enchapadora</div>
    ${miniHeader}

${chapaPrintBlock}
    ${fechasHTML}
    <section>
      <h3>Placas a enviar</h3>
      <div class="chips">${placasHTML}</div>
      <p class="sub">Identificar cada paquete con modelo, ítem y número de OT.</p>
    </section>
    <section>
      <h3>Hojas de Chapa &amp; Trabajo a Realizar</h3>
      <table>
        <thead>
          <tr>
            <th>Ítem</th><th>Hojas de Chapa</th><th>Material</th><th>Medidas</th><th>Caras</th><th>Sentido de Veta</th>
          </tr>
        </thead>
        <tbody>${rowsItems}</tbody>
      </table>
    </section>
    ${ot.notas ? `<section><h3>Notas</h3><div class="notas-box">${ot.notas.replace(/\n/g, "<br>")}</div></section>` : ""}
    <div class="sign-area">
      <div class="sign-line">Entregó</div>
      <div class="sign-line">Recibió (Enchapadora)</div>
      <div class="sign-line">Fecha entrega</div>
    </div>
    <div class="footer">
      <span>Klase A · Procedimiento Enchapadora — Hoja 1 / Enchapadora</span>
      <span>Impreso: ${new Date().toLocaleDateString("es-AR")}</span>
    </div>
  </div>`;

    // ── PÁGINA 2: CARPINTERÍA (sólo si hay tablones) ──────────────
    let pagCarpinteriaHTML = "";
    if (tablonesLineas.length) {
      const tablonesStd = tpl?.tablones
        ? `${tpl.tablones.lenga} Lenga + ${tpl.tablones.okume} Okumé`
        : null;
      pagCarpinteriaHTML = `
  <div class="page">
    <div class="dest-banner carp">🪵 Para: Carpintería</div>
    ${miniHeader}

${chapaPrintBlock}
    <section>
      <h3>Anexo B — Tablones Cepillados</h3>
            <div style="background: #f8f8f8; border: 2px solid #bbb; padding: 14px; border-radius: 8px; margin-bottom: 20px; margin-top: 10px;">
        <div style="font-size: 14pt; font-weight: 700; color: #111; text-align: center; margin-bottom: 6px;">Medida: 2,00 m &times; 0,20 m &times; 45 mm</div>
        <div style="font-size: 12pt; font-weight: 800; color: #1e3a2f; text-align: center; text-transform: uppercase; letter-spacing: 1.5px;">Cepillados en 4 caras</div>
        <div style="font-size: 10pt; color: #555; text-align: center; margin-top: 8px; font-family: 'JetBrains Mono', monospace;">Marcados con: Modelo ${ot.modelo} / OT: ${ot.barco}</div>
      </div>
      <div class="chips">
        ${tablonesLineas.map(t => `<span class="chip big${t.includes("Nogal") ? " nogal" : ""}">${t}</span>`).join("")}
      </div>
      ${nogal ? '<p class="nogal-note">⚠ Chapa de nogal — La Lenga fue reemplazada por Tablón de Nogal</p>' : ""}
      ${tablonesStd ? `<p class="sub" style="margin-top:10px">Combinación estándar: ${tablonesStd}</p>` : ""}
    </section>
    <div class="check-row">
      <div class="check-box">
        <div class="check-label">Pedido confirmado</div>
        <div class="check-val">${ot.tablones_pedido ? "✓  Sí" : "⬜  Pendiente"}</div>
      </div>
      <div class="check-box">
        <div class="check-label">Enviado a Oberti</div>
        <div class="check-val">${ot.tablones_enviado ? "✓  Sí" : "⬜  Pendiente"}</div>
      </div>
    </div>
    <div class="sign-area" style="margin-top: 32px">
      <div class="sign-line">Preparó (Carpintería)</div>
      <div class="sign-line">Recibió (Oberti)</div>
      <div class="sign-line">Fecha despacho</div>
    </div>
    <div class="footer">
      <span>Klase A · Procedimiento Enchapadora — Hoja 2 / Carpintería</span>
      <span>Impreso: ${new Date().toLocaleDateString("es-AR")}</span>
    </div>
  </div>`;
    }

    // ── PÁGINA 3: PAÑOL / OBERTI (sólo si hay herrajes) ──────────
    let pagHerrajesHTML = "";
    if (herrajesKit) {
      const herrajesRows = herrajesKit.map((h, i) => `
        <tr>
          <td style="font-family:'JetBrains Mono',monospace;font-weight:700;color:#555;width:50px">${h.q}×</td>
          <td>${h.name}</td>
          <td style="width:60px;text-align:center;font-size:16pt">⬜</td>
        </tr>`).join("");

      pagHerrajesHTML = `
  <div class="page">
    <div class="dest-banner paniol">🔩 Para: Pañol / Oberti</div>
    ${miniHeader}

${chapaPrintBlock}
    <section>
      <h3>Anexo C — Kit de Herrajes (${ot.modelo})</h3>
      <p class="sub" style="margin-bottom:12px">Pañol confirma cantidades antes del despacho. Un envío = un modelo completo.</p>
      <table>
        <thead>
          <tr>
            <th>Cant.</th>
            <th>Herraje</th>
            <th style="text-align:center">✓</th>
          </tr>
        </thead>
        <tbody>${herrajesRows}</tbody>
      </table>
    </section>
    <div class="check-row">
      <div class="check-box">
        <div class="check-label">Pedido a Pañol</div>
        <div class="check-val">${ot.herrajes_pedido ? "✓  Sí" : "⬜  Pendiente"}</div>
      </div>
      <div class="check-box">
        <div class="check-label">Enviado a Oberti</div>
        <div class="check-val">${ot.herrajes_enviado ? "✓  Sí" : "⬜  Pendiente"}</div>
      </div>
    </div>
    <div class="sign-area" style="margin-top: 32px">
      <div class="sign-line">Preparó (Pañol)</div>
      <div class="sign-line">Recibió (Oberti)</div>
      <div class="sign-line">Fecha despacho</div>
    </div>
    <div class="footer">
      <span>Klase A · Procedimiento Enchapadora — Hoja 3 / Pañol</span>
      <span>Impreso: ${new Date().toLocaleDateString("es-AR")}</span>
    </div>
  </div>`;
    }

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>OT Enchapadora — ${ot.modelo} ${ot.barco}</title>
<style>${CSS}</style>
</head>
<body>
${pagEnchapadoHTML}
${pagCarpinteriaHTML}
${pagHerrajesHTML}
<script>window.onload = () => window.print();<\/script>
</body>
</html>`;

    const win = window.open("", "_blank");
    win.document.write(html);
    win.document.close();
  }

  const meta = ESTADO_META[ot.estado] ?? ESTADO_META["Pendiente"];

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

  // Componente toggle de despacho
  const DespachoToggle = ({ campo, label, color }) => {
    const active = !!ot[campo];
    return (
      <button
        onClick={() => toggle(campo)}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 14px", borderRadius: 9, cursor: "pointer",
          fontFamily: C.sans, fontSize: 13, transition: "all .15s",
          background: active ? color + "15" : C.s0,
          border: `1px solid ${active ? color + "44" : C.b0}`,
          color: active ? color : C.t2,
        }}
      >
        <span style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${active ? color : C.b1}`, background: active ? color : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all .15s" }}>
          {active && <span style={{ color: "#000", fontSize: 11, lineHeight: 1, fontWeight: 700 }}>✓</span>}
        </span>
        {label}
      </button>
    );
  };

  return (
    <div style={{ padding: "28px 28px 60px", maxWidth: 820 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 24 }}>
        <button onClick={onBack} style={{ flexShrink: 0, marginTop: 2, background: C.s0, border: `1px solid ${C.b0}`, color: C.t2, width: 32, height: 32, borderRadius: 8, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10, fontFamily: C.mono, letterSpacing: 3, color: C.t2, textTransform: "uppercase" }}>Klase A</span>
            <span style={{ fontFamily: C.mono, fontSize: 14, color: C.t1, background: C.s1, border: `1px solid ${C.b0}`, padding: "2px 8px", borderRadius: 6 }}>{ot.modelo}</span>
          </div>
          <h2 style={{ margin: "4px 0 0", fontSize: 22, fontWeight: 700, color: C.t0, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {ot.barco}
            {ot.tipo_chapa && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, color: C.t0, background: C.s1, border: `1px solid ${chapa.base}55`, padding: "4px 10px 4px 5px", borderRadius: 9, fontFamily: C.sans }}>
                <ChapaSwatch tipo={ot.tipo_chapa} size="md" />
                {ot.tipo_chapa}
              </span>
            )}
          </h2>
          <div style={{ display: "flex", gap: 16, marginTop: 5, fontSize: 12, color: C.t2 }}>
            <span>📅 {fmtFecha(ot.fecha)}</span>
            {ot.responsable && <span>👤 {ot.responsable}</span>}
          </div>
        </div>

        <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: 5, alignItems: "flex-end" }}>
          {syncMsg && (
            <div style={{ maxWidth: 250, textAlign: "right", fontSize: 11, lineHeight: 1.45, color: syncMsg.ok ? C.green : "#f87171" }}>
              {syncMsg.ok
                ? `${syncMsg.created ? "Alta creada" : "Ya vinculada"} en Muebles - ${syncMsg.lineaNombre} / ${syncMsg.unidadCodigo}`
                : `Muebles: ${syncMsg.message ?? "No se pudo sincronizar"}`}
            </div>
          )}
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase", color: C.t2, fontWeight: 800, textAlign: "right" }}>Estado de la OT</span>
            <select
              value={ot.estado}
              onChange={e => setEstado(e.target.value)}
              style={{ background: meta.bg, border: `1px solid ${meta.color}55`, color: meta.color, padding: "8px 12px", borderRadius: 8, fontSize: 13, fontWeight: 800, cursor: "pointer", outline: "none", fontFamily: C.sans, boxShadow: `0 0 0 1px ${meta.color}22` }}
            >
              {ESTADOS_OT.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </label>
          <button onClick={sincronizarMuebles} disabled={syncingMuebles || !onEnsureMueblesUnidad} style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.28)", color: C.green, padding: "5px 12px", borderRadius: 7, cursor: syncingMuebles ? "not-allowed" : "pointer", fontSize: 12, fontFamily: C.sans, opacity: syncingMuebles ? 0.7 : 1 }}>
            {syncingMuebles ? "Sincronizando..." : "Sincronizar con Muebles"}
          </button>
          <button onClick={imprimir} style={{ background: C.s0, border: `1px solid ${C.b0}`, color: C.t1, padding: "5px 12px", borderRadius: 7, cursor: "pointer", fontSize: 12, fontFamily: C.sans, display: "flex", alignItems: "center", gap: 5 }}>
            Imprimir PDF
          </button>
          {esAdmin && (
            <button onClick={eliminarOT} style={{ background: "transparent", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171", padding: "5px 12px", borderRadius: 7, cursor: "pointer", fontSize: 12, fontFamily: C.sans }}>Eliminar OT</button>
          )}
        </div>
      </div>

      <ProcessStepper ot={ot} />

      {/* ── SECCIÓN: FECHAS DE PRODUCCIÓN ───────────────────────────────── */}
      <Section
        title="Producción"
        action={
          <button onClick={() => setEditFechas(v => !v)} style={{ background: "none", border: "none", color: C.t2, cursor: "pointer", fontSize: 12, fontFamily: C.sans, padding: "1px 4px" }}>
            {editFechas ? "Cancelar" : "Editar fechas"}
          </button>
        }
      >
        {editFechas ? (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
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
                    value={fechasForm[key]}
                    onChange={e => setFechasForm(p => ({ ...p, [key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
            <button onClick={guardarFechas} style={{ padding: "7px 18px", background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.3)", color: "#60a5fa", borderRadius: 8, cursor: "pointer", fontSize: 13, fontFamily: C.sans }}>
              Guardar fechas
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            {[
              { label: "Desmolde est.",  val: ot.fecha_desmolde_est,  color: C.t1 },
              { label: "Desmolde real",  val: ot.fecha_desmolde_real, color: C.amber },
              { label: "Botada",         val: ot.fecha_botada,        color: C.green },
            ].map(({ label, val, color }) => (
              <div key={label}>
                <div style={{ fontSize: 10, letterSpacing: 1.1, color: C.t2, textTransform: "uppercase", marginBottom: 3 }}>{label}</div>
                <div style={{ fontFamily: C.mono, fontSize: 14, fontWeight: 600, color: val ? color : C.t2 }}>
                  {fmtFecha(val)}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ── SECCIÓN: PLACAS ─────────────────────────────────────────────── */}
      <Section title="Placas">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {tpl?.placas.map((p, i) => (
            <div key={i} style={{ fontSize: 13, color: C.t0, background: C.s1, border: `1px solid ${C.b0}`, padding: "6px 12px", borderRadius: 8, fontFamily: C.mono }}>
              {p}
            </div>
          ))}
        </div>
        <div style={{ marginTop: 8, fontSize: 11, color: C.t2 }}>
          Identificar cada paquete con modelo, ítem y número de OT.
        </div>
      </Section>

      {/* ── SECCIÓN: HOJAS DE CHAPA ─────────────────────────────────────── */}
      <Section title="Hojas de Chapa" badge={ot.tipo_chapa || undefined} badgeColor={chapa.grain}>
        {ot.tipo_chapa && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 10, padding: "9px 11px", marginBottom: 10 }}>
            <ChapaSwatch tipo={ot.tipo_chapa} size="lg" />
            <div>
              <div style={{ fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase", color: C.t2, fontWeight: 800 }}>Tono de chapa</div>
              <div style={{ fontSize: 14, color: C.t0, fontWeight: 700, marginTop: 2 }}>{ot.tipo_chapa}</div>
            </div>
          </div>
        )}
        {loading ? (
          <div style={{ fontSize: 12, color: C.t2 }}>Cargando…</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {tpl?.items.map(tItem => {
              const row = items.find(i => i.item_id === tItem.id);
              const val = row?.chapas_descripcion ?? "";
              const isEdit = editItem === tItem.id;
              return (
                <div key={tItem.id} style={{ display: "grid", gridTemplateColumns: "28px 1fr auto", gap: 10, alignItems: "start", padding: "10px 12px", borderRadius: 9, background: isEdit ? "rgba(59,130,246,0.04)" : (val ? C.s0 : "transparent"), border: `1px solid ${isEdit ? "rgba(59,130,246,0.2)" : (val ? C.b0 : "transparent")}`, transition: "all .15s" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: val ? C.t1 : C.t2, fontFamily: C.mono, paddingTop: 1 }}>{tItem.id}</div>
                  <div>
                    {isEdit ? (
                      <textarea
                        ref={inputRef}
                        value={editVal}
                        onChange={e => setEditVal(e.target.value)}
                        onBlur={() => guardarChapas(tItem.id)}
                        onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); guardarChapas(tItem.id); } if (e.key === "Escape") setEditItem(null); }}
                        placeholder={`Hojas de chapa para ítem ${tItem.id}…`}
                        style={{ ...INP, minHeight: 56, resize: "vertical", fontSize: 13, lineHeight: 1.7 }}
                      />
                    ) : val ? (
                      <div onClick={() => abrirEdit(tItem.id)} style={{ fontSize: 13, color: C.t0, lineHeight: 1.7, whiteSpace: "pre-wrap", cursor: "text", fontFamily: C.mono }}>{val}</div>
                    ) : (
                      <button onClick={() => abrirEdit(tItem.id)} style={{ background: "none", border: "none", color: C.t2, fontSize: 12, cursor: "text", padding: 0, fontFamily: C.sans }}>
                        + Hojas para ítem {tItem.id}
                      </button>
                    )}
                    <div style={{ marginTop: 3, fontSize: 11, color: C.t2, fontFamily: C.mono }}>
                      {tItem.material} · {tItem.medidas} · {tItem.caras} · {tItem.veta}
                    </div>
                  </div>
                  {!isEdit && val && (
                    <button onClick={() => abrirEdit(tItem.id)} style={{ background: C.s0, border: `1px solid ${C.b0}`, color: C.t2, padding: "4px 9px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: C.sans, marginTop: 1 }}>Editar</button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* ── SECCIÓN: TRABAJO A REALIZAR ─────────────────────────────────── */}
      <Section title="Trabajo a Realizar">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, tableLayout: "fixed" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.b0}` }}>
                {["Ítem", "Material", "Medidas", "Caras", "Sentido de Veta"].map((h, i) => (
                  <th key={i} style={{ textAlign: "left", padding: "6px 10px", fontSize: 10, letterSpacing: 1.3, color: C.t2, textTransform: "uppercase", fontWeight: 700, width: i === 0 ? 40 : i === 4 ? "auto" : undefined }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tpl?.items.map((it, idx) => (
                <tr key={it.id} style={{ borderBottom: `1px solid var(--panel)`, background: idx % 2 === 0 ? C.s0 : "transparent" }}>
                  <td style={{ padding: "9px 10px", fontFamily: C.mono, fontSize: 12, fontWeight: 700, color: C.t1 }}>{it.id}</td>
                  <td style={{ padding: "9px 10px", color: C.t0 }}>{it.material}</td>
                  <td style={{ padding: "9px 10px", color: C.t1, fontFamily: C.mono, fontSize: 12 }}>{it.medidas}</td>
                  <td style={{ padding: "9px 10px", color: C.t1 }}>{it.caras}</td>
                  <td style={{ padding: "9px 10px" }}><VetaChip v={it.veta} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 10, fontSize: 11, color: C.t2, lineHeight: 1.7 }}>
          Respetar el sentido de veta indicado. · Control y actualización a cargo de Oficina Técnica.
        </div>
      </Section>

      {/* ── SECCIÓN: TABLONES — Anexo B ─────────────────────────────────── */}
      {tablones && (
        <Section title="Tablones — Anexo B" badge={nogal ? "⚠ regla nogal activa" : undefined} badgeColor="#d97706">
          {/* Tablones requeridos */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            {tablones.map((t, i) => (
              <div key={i} style={{
                fontSize: 13, padding: "6px 13px", borderRadius: 8, fontFamily: C.mono,
                background: t.includes("Nogal") ? "rgba(217,119,6,0.08)" : C.s1,
                border: `1px solid ${t.includes("Nogal") ? "rgba(217,119,6,0.25)" : C.b0}`,
                color: t.includes("Nogal") ? "#d97706" : C.t0,
              }}>{t}</div>
            ))}
          </div>
                    <div style={{ background: "var(--panel)", border: `1px solid ${C.b0}`, padding: "14px 18px", borderRadius: 8, marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.t0, marginBottom: 4 }}>Medida: 2,00 m &times; 0,20 m &times; 45 mm</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.green, textTransform: "uppercase", letterSpacing: 1.1, marginBottom: 8 }}>Cepillados en 4 caras</div>
            <div style={{ fontSize: 12, color: C.t2, fontFamily: C.mono }}>Marcados con: {ot.modelo} / OT: {ot.barco}</div>
            {nogal && <div style={{ fontSize: 12, color: "#d97706", marginTop: 8 }}>&#9888; La Lenga fue reemplazada por Tabl&oacute;n de Nogal.</div>}
          </div>
          {/* Toggles pedido / enviado */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <DespachoToggle campo="tablones_pedido"  label="Pedidos a carpintería" color={C.amber} />
            <DespachoToggle campo="tablones_enviado" label="Enviados a Oberti"      color={C.green} />
          </div>
        </Section>
      )}

      {/* ── SECCIÓN: HERRAJES — Anexo C ─────────────────────────────────── */}
      {herrajesKit && (
        <Section title="Herrajes — Anexo C" badge={`${herrajesKit.length} ítems · ${ot.modelo}`} badgeColor={C.purple}>
          {/* Toggles */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
            <DespachoToggle campo="herrajes_pedido"  label="Pedidos a Pañol"    color={C.amber} />
            <DespachoToggle campo="herrajes_enviado" label="Enviados a Oberti"  color={C.green} />
          </div>
          {/* Kit expandible */}
          <button
            onClick={() => setShowHerrajesKit(v => !v)}
            style={{ background: "none", border: "none", color: C.t2, fontSize: 12, cursor: "pointer", padding: 0, fontFamily: C.sans, display: "flex", alignItems: "center", gap: 5 }}
          >
            {showHerrajesKit ? "▾" : "▸"} {showHerrajesKit ? "Ocultar" : "Ver"} kit de herrajes
          </button>
          {showHerrajesKit && (
            <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
              {herrajesKit.map((h, i) => (
                <div key={i} style={{ fontSize: 12, color: C.t1, background: C.s0, border: `1px solid ${C.b0}`, padding: "4px 10px", borderRadius: 7, fontFamily: C.mono }}>
                  <span style={{ color: C.purple, fontWeight: 700 }}>{h.q}×</span>{" "}{h.name}
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: 10, fontSize: 11, color: C.t2, lineHeight: 1.7 }}>
            Pañol controla cantidades y estado antes del despacho. Un envío = un modelo completo.
          </div>
        </Section>
      )}

      {/* ── SECCIÓN: Notas ───────────────────────────────────────────────── */}
      <Section title="Notas">
        {editNotas ? (
          <div>
            <textarea
              value={notasVal}
              onChange={e => setNotasVal(e.target.value)}
              style={{ ...INP, minHeight: 80, resize: "vertical", lineHeight: 1.7 }}
              autoFocus
              onKeyDown={e => { if (e.key === "Escape") { setEditNotas(false); setNotasVal(ot.notas ?? ""); } }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button onClick={guardarNotas} style={{ padding: "7px 18px", background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.3)", color: "#60a5fa", borderRadius: 8, cursor: "pointer", fontSize: 13, fontFamily: C.sans }}>Guardar</button>
              <button onClick={() => { setEditNotas(false); setNotasVal(ot.notas ?? ""); }} style={{ padding: "7px 14px", background: "transparent", border: `1px solid ${C.b0}`, color: C.t2, borderRadius: 8, cursor: "pointer", fontSize: 13, fontFamily: C.sans }}>Cancelar</button>
            </div>
          </div>
        ) : notasVal ? (
          <div onClick={() => setEditNotas(true)} style={{ fontSize: 13, color: C.t1, lineHeight: 1.7, whiteSpace: "pre-wrap", cursor: "text" }}>{notasVal}</div>
        ) : (
          <button onClick={() => setEditNotas(true)} style={{ background: "none", border: "none", color: C.t2, fontSize: 12, cursor: "text", padding: 0, fontFamily: C.sans }}>+ Agregar nota</button>
        )}
      </Section>
    </div>
  );
}

// ── Section wrapper ────────────────────────────────────────────────────────
function Section({ title, badge, badgeColor, action, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, paddingBottom: 8, borderBottom: `1px solid var(--panel-2)` }}>
        <span style={{ fontSize: 10, letterSpacing: 1.3, textTransform: "uppercase", color: C.t2, fontWeight: 700 }}>{title}</span>
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

  const modelos  = Object.keys(TEMPLATES);
  const tpl      = TEMPLATES[modeloSel] ?? TEMPLATES["K34"];
  const nogal    = esNogal(chapaSim);
  const tablones = tablonesList(modeloSel, chapaSim);

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
        <div style={{ fontSize: 22, fontWeight: 700, color: C.t0 }}>Plantillas</div>
        <div style={{ fontSize: 12, color: C.t2, marginTop: 4 }}>
          Referencia fija por modelo · Procedimiento Enchapadora · Klase A
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
        {modelos.map(m => (
          <button key={m} onClick={() => setModeloSel(m)} style={{
            padding: "8px 18px", borderRadius: 9, cursor: "pointer",
            fontSize: 13, fontWeight: modeloSel === m ? 700 : 400,
            fontFamily: C.mono, transition: "all .12s",
            background: modeloSel === m ? "rgba(59,130,246,0.15)" : C.s0,
            border: `1px solid ${modeloSel === m ? "rgba(59,130,246,0.45)" : C.b0}`,
            color: modeloSel === m ? "#60a5fa" : C.t1,
          }}>{m}</button>
        ))}
      </div>

      {/* Simulador de chapa */}
      <div style={{ background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 12, padding: "14px 16px", marginBottom: 24, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, letterSpacing: 1.3, textTransform: "uppercase", color: C.t2, fontWeight: 700, whiteSpace: "nowrap" }}>Simular chapa</span>
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
              {CHAPAS_SUGERIDAS.filter(s => !chapaSim || s.toLowerCase().includes(chapaSim.toLowerCase())).map(s => (
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
          <span style={{ fontSize: 12, color: "#d97706", background: "rgba(217,119,6,0.08)", border: "1px solid rgba(217,119,6,0.2)", padding: "4px 10px", borderRadius: 6 }}>
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
                  <th key={i} style={{ textAlign: "left", padding: "6px 12px", fontSize: 10, letterSpacing: 1.3, color: C.t2, textTransform: "uppercase", fontWeight: 700 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tpl?.items.map((it, idx) => (
                <tr key={it.id} style={{ borderBottom: `1px solid var(--panel)`, background: idx % 2 === 0 ? C.s0 : "transparent" }}>
                  <td style={{ padding: "10px 12px", fontFamily: C.mono, fontSize: 12, fontWeight: 700, color: C.t1 }}>{it.id}</td>
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
        <Section title="Tablones — Anexo B" badge={nogal ? "⚠ regla nogal activa" : undefined} badgeColor="#d97706">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            {tablones?.map((t, i) => (
              <div key={i} style={{
                fontSize: 13, padding: "7px 14px", borderRadius: 8, fontFamily: C.mono,
                background: t.includes("Nogal") ? "rgba(217,119,6,0.08)" : C.s1,
                border: `1px solid ${t.includes("Nogal") ? "rgba(217,119,6,0.25)" : C.b0}`,
                color: t.includes("Nogal") ? "#d97706" : C.t0,
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
            <div style={{ background: "rgba(217,119,6,0.05)", border: "1px solid rgba(217,119,6,0.2)", borderRadius: 9, padding: "10px 14px" }}>
              <div style={{ fontSize: 10, letterSpacing: 1.3, textTransform: "uppercase", color: "#d97706", marginBottom: 6 }}>Con chapa de nogal</div>
              <div style={{ fontFamily: C.mono, fontSize: 13, color: "#d97706" }}>{tpl.tablones.lenga} Nogal + {tpl.tablones.okume} Okumé</div>
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
      {HERRAJES[modeloSel] ? (
        <Section title="Herrajes — Anexo C" badge={`Kit ${modeloSel} · ${HERRAJES[modeloSel].length} ítems`} badgeColor={C.purple}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {HERRAJES[modeloSel].map((h, i) => (
              <div key={i} style={{ fontSize: 12, color: C.t1, background: C.s0, border: `1px solid ${C.b0}`, padding: "5px 11px", borderRadius: 7, fontFamily: C.mono }}>
                <span style={{ color: C.purple, fontWeight: 700 }}>{h.q}×</span>{" "}{h.name}
              </div>
            ))}
          </div>
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
const getOtNum = (ot, ots) => {
  try {
    if (!ot || !ot.modelo || !ots) return "---";
    const mNum = String(ot.modelo).replace(/[^0-9]/g, "");
    const mismosModelos = ots.filter(o => o.modelo === ot.modelo).sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
    const barcosUnicos = [...new Set(mismosModelos.map(o => String(o.barco).trim().toUpperCase()))];
    const idx = barcosUnicos.indexOf(String(ot.barco).trim().toUpperCase());
    return `${mNum}-${idx >= 0 ? idx + 1 : barcosUnicos.length + 1}`;
  } catch (e) { return "---"; }
};

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

  async function cargar() {
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
  }

  useEffect(() => { cargar(); }, []);

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
          <div style={{ fontSize: 22, fontWeight: 700, color: C.t0 }}>Enchapadora</div>
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
          { label: "Enviadas",   val: stats.enviada,   color: C.amber, est: "Enviada" },
          { label: "Devueltas",  val: stats.devuelta,  color: C.green, est: "Devuelta" },
          { label: "Rehacer",    val: stats.rehacer,   color: C.red,   est: "Rehacer" },
        ].filter(s => s.val > 0).map(s => (
          <button key={s.est} onClick={() => setFiltroE(filtroE === s.est ? "todos" : s.est)} style={{ display: "flex", alignItems: "center", gap: 7, background: filtroE === s.est ? s.color + "15" : C.s0, border: `1px solid ${filtroE === s.est ? s.color + "44" : C.b0}`, color: s.color, padding: "5px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontFamily: C.sans }}>
            <span style={{ fontFamily: C.mono, fontWeight: 700, fontSize: 14 }}>{s.val}</span>
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
          <button onClick={() => setFiltroE("todos")} style={{ ...filterBtnSt(true), color: C.amber }}>
            × {filtroE}
          </button>
        )}
      </div>

      {/* Lista */}
      {loading ? (
        <div style={{ color: C.t2, fontSize: 13, padding: "40px 0", textAlign: "center" }}>Cargando…</div>
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
                <span style={{ fontFamily: C.mono, fontSize: 12, fontWeight: 700, color: C.t1, background: C.s1, border: `1px solid ${C.b0}`, padding: "2px 8px", borderRadius: 6 }}>{modelo}</span>
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
