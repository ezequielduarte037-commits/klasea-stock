// ─── SQL requerido (ejecutar una vez en Supabase) ────────────────
// ALTER TABLE laminacion_obra_materiales
//   ADD COLUMN IF NOT EXISTS ingresado_manual numeric DEFAULT NULL,
//   ADD COLUMN IF NOT EXISTS ingresado_manual_at timestamptz DEFAULT NULL,
//   ADD COLUMN IF NOT EXISTS ingresado_manual_nota text DEFAULT NULL;
// ─────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/supabaseClient";
import Sidebar from "@/components/Sidebar";
import { useResponsive } from "@/hooks/useResponsive";
import { hasAdminAccess } from "@/lib/permissions";
import NotificacionesBell from "@/components/NotificacionesBell";

function num(v) { const x = Number(v); return Number.isFinite(x) ? x : 0; }
function fmtDate(d) { if (!d) return "—"; return new Date(d + "T00:00:00").toLocaleDateString("es-AR"); }
function fmtDateTime(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function hoyStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function diasHasta(dateStr) {
  if (!dateStr) return null;
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  return Math.round((new Date(dateStr + "T00:00:00") - hoy) / 86400000);
}

// ─── PALETA ──────────────────────────────────────────────────────
const C = {
  bg:      "#09090b",
  s0:      "rgba(255,255,255,0.03)",
  s1:      "rgba(255,255,255,0.06)",
  b0:      "rgba(255,255,255,0.08)",
  b1:      "rgba(255,255,255,0.15)",
  t0:      "#f4f4f5",
  t1:      "#a1a1aa",
  t2:      "#71717a",
  mono:    "'JetBrains Mono', 'IBM Plex Mono', monospace",
  sans:    "'Outfit', system-ui, sans-serif",
  primary: "#3b82f6",
  amber:   "#f59e0b",
  green:   "#10b981",
  red:     "#ef4444",
  obra: {
    activa:    { dot: "#3b82f6", bg: "rgba(59,130,246,0.1)",  border: "rgba(59,130,246,0.25)",  label: "Activa"    },
    pausada:   { dot: "#f59e0b", bg: "rgba(245,158,11,0.1)",  border: "rgba(245,158,11,0.25)",  label: "Pausada"   },
    terminada: { dot: "#10b981", bg: "rgba(16,185,129,0.1)",  border: "rgba(16,185,129,0.25)",  label: "Terminada" },
  },
};

const GLASS = { backdropFilter: "blur(32px) saturate(130%)", WebkitBackdropFilter: "blur(32px) saturate(130%)" };
const INP = {
  background: "rgba(255,255,255,0.04)", border: `1px solid ${C.b0}`,
  color: C.t0, padding: "8px 12px", borderRadius: 8, fontSize: 12,
  outline: "none", width: "100%", fontFamily: C.sans,
};

const GANTT_COLORS = ["#3b82f6","#a78bfa","#f59e0b","#10b981","#f43f5e","#0ea5e9","#fb923c","#34d399"];
function obraGanttColor(idx) { return GANTT_COLORS[idx % GANTT_COLORS.length]; }

// ─── UUID directos de laminacion_materiales ───────────────────────
const M = {
  ACELERADOR:  "3cfd9c4c-4c93-4513-90fa-045f01cc3460",
  AIREX10:     "963f4103-474f-4e19-8836-381bb83787a8",
  AIREX15:     "cde2e86c-84de-4f6a-86d1-91bf05a10d4f",
  AIREX20:     "6e5d1272-d42b-49cd-bfbd-47d623c36d3a",
  AIREX25:     "ad520546-493b-4313-ac74-a9bc056e7454",
  GEL1000B:    "6c4f8c92-154a-476d-89cf-249f1211eeca",
  GEL2000B:    "3123f200-d261-4046-a098-645e821f01d2",
  GEL2008:     "7577227f-b79b-4f71-9945-b37c521e9a27",
  GEL2017B:    "5a376089-7ed6-4bea-8254-5ea4f0490026",
  CATALIZADOR: "de7b6037-289d-439a-bd10-fc3141a601e8",
  LT600:       "74814024-b661-4bca-bdd5-facab2999715",
  COREMAT:     "a3740499-d14c-480b-9c8f-c7d8cc31deeb",
  MAT300:      "6357d1e1-a448-4890-b022-62f600f2da96",
  MAT450:      "c536d864-5fa4-4409-9944-114ed809f7cd",
  MONOMERO:    "38903dae-16fd-4afb-8e98-704cc8d7fd1f",
  POLI100:     "dc0d3a3c-e34f-4e87-ac41-08a4bdd5e11a",
  POLI150:     "42a4f402-a327-4f21-8f0a-fe1df2bc4428",
  PQ7:         "863eb63f-663a-4881-91c4-12121ad3fa52",
  REPAIR:      "6843da6b-6d71-4b9e-a294-887e4086b9d0",
  RESINA101:   "6497b1a1-7d0e-49e0-acd4-600e08a0b359",
  RESINA504:   "75352cd6-1828-4cdb-8971-60a1be60194b",
  ROV400:      "39934627-7ae9-4ff7-833f-a428b0da5b13",
  ROV600:      "594d6723-8e14-497f-83a5-f48ddc0f1562",
  TALCO:       "c5128caa-51bb-4a62-b35a-864c4dd9faf0", // bolsas 25kg
  VELO:        "721f20e8-c1f0-4aca-98c9-e9480c9a673c",
};

// ─── Listas base ─────────────────────────────────────────────────
// TALCO: 1 bolsa = 25kg  →  K34/37/42/43 = 50kg = 2 bolsas  |  K52 = 25kg = 1 bolsa
const LISTAS_BASE = {
  K34: [
    { id: M.MAT300,      cantidad: 13 },
    { id: M.ROV600,      cantidad: 4  },
    { id: M.COREMAT,     cantidad: 2  },
    { id: M.RESINA101,   cantidad: 7  },
    { id: M.RESINA504,   cantidad: 1  },
    { id: M.MONOMERO,    cantidad: 1  },
    { id: M.CATALIZADOR, cantidad: 2  },
    { id: M.ACELERADOR,  cantidad: 2  },
    { id: M.GEL2000B,    cantidad: 11 },
    { id: M.GEL2008,     cantidad: 4  },
    { id: M.GEL1000B,    cantidad: 1  },
    { id: M.REPAIR,      cantidad: 1  },
    { id: M.AIREX15,     cantidad: 12 },
    { id: M.TALCO,       cantidad: 2  }, // 2 bolsas × 25kg = 50kg
    { id: M.PQ7,         cantidad: 3  },
  ],
  K37: [
    { id: M.GEL2000B,    cantidad: 10 },
    { id: M.GEL2017B,    cantidad: 4  },
    { id: M.GEL1000B,    cantidad: 1  },
    { id: M.MAT300,      cantidad: 12 },
    { id: M.MAT450,      cantidad: 1  },
    { id: M.ROV400,      cantidad: 2  },
    { id: M.LT600,       cantidad: 3  },
    { id: M.VELO,        cantidad: 1  },
    { id: M.COREMAT,     cantidad: 2  },
    { id: M.RESINA101,   cantidad: 10 },
    { id: M.RESINA504,   cantidad: 1  },
    { id: M.MONOMERO,    cantidad: 2  },
    { id: M.CATALIZADOR, cantidad: 3  },
    { id: M.ACELERADOR,  cantidad: 2  },
    { id: M.AIREX20,     cantidad: 12 },
    { id: M.AIREX15,     cantidad: 12 },
    { id: M.TALCO,       cantidad: 2  }, // 2 bolsas
    { id: M.PQ7,         cantidad: 7  },
    { id: M.POLI100,     cantidad: 10 },
  ],
  K42: [
    { id: M.GEL2000B,    cantidad: 10 },
    { id: M.GEL2017B,    cantidad: 4  },
    { id: M.GEL1000B,    cantidad: 1  },
    { id: M.VELO,        cantidad: 1  },
    { id: M.COREMAT,     cantidad: 3  },
    { id: M.MAT300,      cantidad: 20 },
    { id: M.MAT450,      cantidad: 2  },
    { id: M.ROV400,      cantidad: 3  },
    { id: M.ROV600,      cantidad: 4  },
    { id: M.RESINA101,   cantidad: 13 },
    { id: M.RESINA504,   cantidad: 1  },
    { id: M.MONOMERO,    cantidad: 2  },
    { id: M.CATALIZADOR, cantidad: 4  },
    { id: M.ACELERADOR,  cantidad: 3  },
    { id: M.AIREX20,     cantidad: 9  },
    { id: M.AIREX15,     cantidad: 7  },
    { id: M.PQ7,         cantidad: 3  },
    { id: M.TALCO,       cantidad: 2  }, // 2 bolsas
    { id: M.POLI100,     cantidad: 10 },
  ],
  K43: [
    { id: M.MAT300,      cantidad: 30 },
    { id: M.MAT450,      cantidad: 3  },
    { id: M.ROV400,      cantidad: 6  },
    { id: M.ROV600,      cantidad: 7  },
    { id: M.COREMAT,     cantidad: 4  },
    { id: M.VELO,        cantidad: 1  },
    { id: M.RESINA101,   cantidad: 18 },
    { id: M.RESINA504,   cantidad: 1  },
    { id: M.MONOMERO,    cantidad: 3  },
    { id: M.CATALIZADOR, cantidad: 4  },
    { id: M.ACELERADOR,  cantidad: 3  },
    { id: M.GEL2000B,    cantidad: 21 },
    { id: M.GEL1000B,    cantidad: 2  },
    { id: M.GEL2017B,    cantidad: 8  },
    { id: M.AIREX20,     cantidad: 12 },
    { id: M.AIREX15,     cantidad: 16 },
    { id: M.TALCO,       cantidad: 2  }, // 2 bolsas
    { id: M.PQ7,         cantidad: 8  },
    { id: M.POLI100,     cantidad: 12 },
  ],
  K52: [
    { id: M.GEL2000B,    cantidad: 13 },
    { id: M.GEL2017B,    cantidad: 5  },
    { id: M.GEL1000B,    cantidad: 2  },
    { id: M.MAT300,      cantidad: 22 },
    { id: M.ROV600,      cantidad: 10 },
    { id: M.MAT450,      cantidad: 2  },
    { id: M.COREMAT,     cantidad: 4  },
    { id: M.RESINA504,   cantidad: 1  },
    { id: M.RESINA101,   cantidad: 16 },
    { id: M.MONOMERO,    cantidad: 3  },
    { id: M.CATALIZADOR, cantidad: 6  },
    { id: M.ACELERADOR,  cantidad: 2  },
    { id: M.TALCO,       cantidad: 1  }, // 1 bolsa = 25kg
    { id: M.AIREX10,     cantidad: 11 },
    { id: M.AIREX15,     cantidad: 11 },
    { id: M.AIREX20,     cantidad: 24 },
    { id: M.PQ7,         cantidad: 16 },
    { id: M.POLI100,     cantidad: 14 },
  ],
  K55: [
    { id: M.GEL2000B,    cantidad: 5  },
    { id: M.GEL1000B,    cantidad: 1  },
    { id: M.COREMAT,     cantidad: 1  },
    { id: M.MAT300,      cantidad: 8  },
    { id: M.MAT450,      cantidad: 2  },
    { id: M.LT600,       cantidad: 8  },
    { id: M.RESINA101,   cantidad: 9  },
    { id: M.RESINA504,   cantidad: 1  },
    { id: M.MONOMERO,    cantidad: 1  },
    { id: M.CATALIZADOR, cantidad: 2  },
    { id: M.ACELERADOR,  cantidad: 2  },
    { id: M.POLI100,     cantidad: 20 },
  ],
  K64: [
    { id: M.POLI150,     cantidad: 18 },
    { id: M.POLI100,     cantidad: 15 },
  ],
};

function extraerCodigo(obra) {
  const m1 = (obra.nombre ?? "").match(/^(\d+)/);
  if (m1) return "K" + m1[1];
  const m2 = (obra.descripcion ?? "").match(/\b(K\d+)\b/i);
  if (m2) return m2[1].toUpperCase();
  return null;
}

function urgenciaFinColor(dias) {
  if (dias === null) return C.t2;
  if (dias < 0)  return C.t2;
  if (dias < 14) return C.red;
  if (dias < 30) return "#f97316";
  if (dias < 60) return C.amber;
  return C.green;
}

function EstadoChip({ estado }) {
  const meta = C.obra[estado] ?? C.obra.activa;
  return (
    <span style={{ fontSize: 8, letterSpacing: 2, textTransform: "uppercase", padding: "3px 8px", borderRadius: 99, fontWeight: 700, background: meta.bg, color: meta.dot, border: `1px solid ${meta.border}`, whiteSpace: "nowrap" }}>{meta.label}</span>
  );
}

function ProgressBar({ value }) {
  const pct = Math.min(100, Math.max(0, value));
  const barColor = pct >= 100 ? C.green : pct >= 50 ? C.amber : C.red;
  return (
    <div style={{ height: 4, background: "rgba(255,255,255,0.05)", borderRadius: 99, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${pct}%`, background: barColor, borderRadius: 99, transition: "width .4s ease" }} />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// GANTT VIEW
// ══════════════════════════════════════════════════════════════
function GanttView({ obras, obrasFiltradas, alertasPorObra, obraSelId, setObraSelId }) {
  const [mesesOffset, setMesesOffset] = useState(-1);
  const NUM_MESES = 7;

  const primerMes = useMemo(() => {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + mesesOffset); return d;
  }, [mesesOffset]);

  const meses = useMemo(() => Array.from({ length: NUM_MESES }, (_, i) => {
    const d = new Date(primerMes); d.setMonth(d.getMonth() + i); return d;
  }), [primerMes]);

  const rangoInicio = primerMes;
  const rangoFin = useMemo(() => {
    const d = new Date(primerMes); d.setMonth(d.getMonth() + NUM_MESES); d.setDate(0); return d;
  }, [primerMes]);

  const totalDias = Math.round((rangoFin - rangoInicio) / 86400000) + 1;

  function posicionPct(dateStr) {
    if (!dateStr) return null;
    return (Math.round((new Date(dateStr + "T00:00:00") - rangoInicio) / 86400000) / totalDias) * 100;
  }

  function anchoPct(inicio, fin) {
    const s = Math.max(new Date((inicio || hoyStr()) + "T00:00:00"), rangoInicio);
    const e = Math.min(new Date((fin    || hoyStr()) + "T00:00:00"), rangoFin);
    if (e <= s) return 0;
    return (Math.round((e - s) / 86400000) / totalDias) * 100;
  }

  const hoyPct = posicionPct(hoyStr());
  const obrasConFecha = obrasFiltradas.filter(o => o.fecha_inicio || o.fecha_fin);
  const obrasSinFecha = obrasFiltradas.filter(o => !o.fecha_inicio && !o.fecha_fin);
  const colorMap = useMemo(() => { const m = {}; obras.forEach((o, i) => { m[o.id] = obraGanttColor(i); }); return m; }, [obras]);
  const hoy = new Date(); hoy.setHours(0,0,0,0);

  return (
    <div style={{ padding: "16px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <button onClick={() => setMesesOffset(o => o - 3)} style={{ border: `1px solid ${C.b0}`, background: "transparent", color: C.t2, padding: "5px 12px", borderRadius: 7, cursor: "pointer", fontSize: 13 }}>◀</button>
        <div style={{ flex: 1, textAlign: "center", fontSize: 12, color: C.t1, fontWeight: 600 }}>
          {meses[0].toLocaleDateString("es-AR", { month: "long", year: "numeric" })} — {meses[NUM_MESES-1].toLocaleDateString("es-AR", { month: "long", year: "numeric" })}
        </div>
        <button onClick={() => setMesesOffset(o => o + 3)} style={{ border: `1px solid ${C.b0}`, background: "transparent", color: C.t2, padding: "5px 12px", borderRadius: 7, cursor: "pointer", fontSize: 13 }}>▶</button>
        <button onClick={() => setMesesOffset(-1)} style={{ border: `1px solid ${C.b0}`, background: "transparent", color: C.t2, padding: "5px 10px", borderRadius: 7, cursor: "pointer", fontSize: 11 }}>Hoy</button>
      </div>

      <div style={{ background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ display: "flex", borderBottom: `1px solid ${C.b0}`, background: "rgba(0,0,0,0.3)" }}>
          <div style={{ width: 200, minWidth: 200, padding: "8px 14px", fontSize: 9, color: C.t2, letterSpacing: 2, textTransform: "uppercase", borderRight: `1px solid ${C.b0}` }}>Obra</div>
          <div style={{ flex: 1, display: "flex" }}>
            {meses.map((m, i) => {
              const esHoy = m.getFullYear() === hoy.getFullYear() && m.getMonth() === hoy.getMonth();
              return (
                <div key={i} style={{ flex: 1, padding: "8px 6px", fontSize: 10, color: esHoy ? C.primary : C.t2, fontWeight: esHoy ? 700 : 400, borderRight: i < NUM_MESES-1 ? `1px solid ${C.b0}` : "none", textAlign: "center" }}>
                  {m.toLocaleDateString("es-AR", { month: "short" }).replace(".","").toUpperCase()}
                  <div style={{ fontSize: 8, color: C.t2, marginTop: 1 }}>{m.getFullYear()}</div>
                </div>
              );
            })}
          </div>
        </div>

        {obrasConFecha.length === 0 && <div style={{ padding: "32px 16px", textAlign: "center", color: C.t2, fontSize: 12 }}>No hay obras con fechas en el rango visible.</div>}
        {obrasConFecha.map((o) => {
          const al = alertasPorObra[o.id] ?? { criticas: 0 };
          const sel = obraSelId === o.id;
          const color = colorMap[o.id];
          const diasFin = o.fecha_fin ? diasHasta(o.fecha_fin) : null;
          const barColor = al.criticas > 0 ? C.red : (o.estado === "terminada" ? C.green : color);
          const barLeft = Math.max(0, posicionPct(o.fecha_inicio) ?? 0);
          const barWidth = Math.max(anchoPct(o.fecha_inicio || hoyStr(), o.fecha_fin || o.fecha_inicio || hoyStr()), 0.4);
          return (
            <div key={o.id} onClick={() => setObraSelId(sel ? null : o.id)} style={{ display: "flex", alignItems: "center", borderBottom: `1px solid rgba(255,255,255,0.03)`, background: sel ? "rgba(255,255,255,0.04)" : "transparent", cursor: "pointer", transition: "background .15s", minHeight: 44 }}>
              <div style={{ width: 200, minWidth: 200, padding: "8px 14px", borderRight: `1px solid ${C.b0}`, display: "flex", flexDirection: "column", gap: 3 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: barColor, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.t0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.nombre}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginLeft: 11 }}>
                  <EstadoChip estado={o.estado} />
                  {diasFin !== null && diasFin >= 0 && diasFin <= 60 && <span style={{ fontSize: 8, color: urgenciaFinColor(diasFin), fontWeight: 700 }}>{diasFin}d</span>}
                  {diasFin !== null && diasFin < 0 && o.estado !== "terminada" && <span style={{ fontSize: 8, color: C.red, fontWeight: 700 }}>vencida</span>}
                </div>
              </div>
              <div style={{ flex: 1, position: "relative", height: "100%", minHeight: 44, display: "flex", alignItems: "center" }}>
                {meses.map((_, i) => (i > 0 && <div key={i} style={{ position: "absolute", left: `${(i / NUM_MESES) * 100}%`, top: 0, bottom: 0, width: 1, background: "rgba(255,255,255,0.04)", pointerEvents: "none" }} />))}
                {hoyPct !== null && hoyPct >= 0 && hoyPct <= 100 && <div style={{ position: "absolute", left: `${hoyPct}%`, top: 0, bottom: 0, width: 1, background: "rgba(59,130,246,0.5)", pointerEvents: "none", zIndex: 2 }} />}
                {barWidth > 0 && (
                  <div style={{ position: "absolute", left: `${barLeft}%`, width: `${barWidth}%`, height: 20, background: barColor + "33", border: `1px solid ${barColor}88`, borderRadius: 5, display: "flex", alignItems: "center", paddingLeft: 6, overflow: "hidden", zIndex: 1 }}>
                    <span style={{ fontSize: 9, color: barColor, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontFamily: C.sans }}>{o.nombre}</span>
                  </div>
                )}
                {o.fecha_inicio && posicionPct(o.fecha_inicio) >= 0 && posicionPct(o.fecha_inicio) <= 100 && <div title={`Inicio: ${fmtDate(o.fecha_inicio)}`} style={{ position: "absolute", left: `calc(${posicionPct(o.fecha_inicio)}% - 3px)`, width: 6, height: 6, borderRadius: "50%", background: barColor, zIndex: 3, boxShadow: `0 0 5px ${barColor}` }} />}
                {o.fecha_fin && posicionPct(o.fecha_fin) >= 0 && posicionPct(o.fecha_fin) <= 100 && <div title={`Fin: ${fmtDate(o.fecha_fin)}`} style={{ position: "absolute", left: `calc(${posicionPct(o.fecha_fin)}% - 4px)`, width: 8, height: 8, borderRadius: 2, background: o.estado === "terminada" ? C.green : barColor, zIndex: 3, transform: "rotate(45deg)" }} />}
              </div>
            </div>
          );
        })}

        {obrasSinFecha.length > 0 && (
          <div style={{ borderTop: `1px solid ${C.b0}`, padding: "8px 14px" }}>
            <div style={{ fontSize: 9, color: C.t2, letterSpacing: 2, textTransform: "uppercase", marginBottom: 6 }}>Sin fecha asignada</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {obrasSinFecha.map(o => (
                <div key={o.id} onClick={() => setObraSelId(obraSelId === o.id ? null : o.id)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 6, cursor: "pointer", background: obraSelId === o.id ? C.s1 : "transparent", border: `1px solid ${obraSelId === o.id ? C.b1 : C.b0}` }}>
                  <div style={{ width: 5, height: 5, borderRadius: "50%", background: colorMap[o.id] }} />
                  <span style={{ fontSize: 11, color: C.t1 }}>{o.nombre}</span>
                  <EstadoChip estado={o.estado} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <div style={{ marginTop: 10, display: "flex", gap: 16, fontSize: 10, color: C.t2 }}>
        <span>● inicio · ◆ fin estimado</span>
        <span style={{ color: "rgba(59,130,246,0.7)" }}>│ azul = hoy</span>
        <span style={{ color: C.red }}>■ rojo = materiales críticos</span>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// DETALLE OBRA
// ══════════════════════════════════════════════════════════════
const TH = { padding: "8px 12px", textAlign: "left", fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: C.t2, fontWeight: 700, borderBottom: `1px solid rgba(255,255,255,0.08)`, whiteSpace: "nowrap" };
const TD = { padding: "9px 12px", fontSize: 12, borderBottom: `1px solid rgba(255,255,255,0.03)`, color: "#a1a1aa" };

function DetalleObra({ obraSel, tablaObra, obraStats, esGestion, editNec, setEditNec, savingNec, guardarNecesaria, guardarIngresadoManual, limpiarIngresadoManual, filtroMat, setFiltroMat }) {
  // editIngresado: { [matId]: string } — valor en el input de edición de ingresado
  const [editIngresado, setEditIngresado] = useState({});
  const [editingIngresado, setEditingIngresado] = useState(null); // matId activo

  const filas = useMemo(() => {
    if (filtroMat === "planificados") return tablaObra.filter(r => r.necesario > 0);
    if (filtroMat === "activos")      return tablaObra.filter(r => r.tieneActividad);
    return tablaObra;
  }, [tablaObra, filtroMat]);

  return (
    <div style={{ padding: 22, animation: "slideLeft .2s ease" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 9, color: C.t2, letterSpacing: 2, textTransform: "uppercase", marginBottom: 4 }}>Obra seleccionada</div>
          <h2 style={{ margin: 0, color: C.t0, fontSize: 18, fontWeight: 700 }}>{obraSel.nombre}</h2>
          {obraSel.descripcion && <div style={{ fontSize: 11, color: C.t2, marginTop: 3 }}>{obraSel.descripcion}</div>}
          <div style={{ marginTop: 6, display: "flex", gap: 10, fontSize: 10, color: C.t2 }}>
            {obraSel.fecha_inicio && <span>📅 Inicio: <span style={{ color: C.t1 }}>{fmtDate(obraSel.fecha_inicio)}</span></span>}
            {obraSel.fecha_fin && (() => {
              const dias = diasHasta(obraSel.fecha_fin); const col = urgenciaFinColor(dias);
              return <span>🏁 Fin: <span style={{ color: col, fontWeight: 700 }}>{fmtDate(obraSel.fecha_fin)}</span>{dias !== null && dias >= 0 && <span style={{ color: col }}> ({dias}d)</span>}{dias !== null && dias < 0 && <span style={{ color: C.red }}> ⚠ vencida</span>}</span>;
            })()}
          </div>
        </div>
        <EstadoChip estado={obraSel.estado} />
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 16 }}>
        {[
          { label: "Total mat.",   val: obraStats.total,     color: C.t2      },
          { label: "Planificados", val: obraStats.planif,    color: C.primary },
          { label: "Completos",    val: obraStats.completos, color: C.green   },
          { label: "Críticos",     val: obraStats.criticos,  color: C.red     },
        ].map(({ label, val, color }) => (
          <div key={label} style={{ background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 10, padding: "10px 14px", borderLeft: `2px solid ${color}` }}>
            <div style={{ fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: C.t2, marginBottom: 5 }}>{label}</div>
            <div style={{ fontFamily: C.mono, fontSize: 20, fontWeight: 700, color, lineHeight: 1 }}>{val}</div>
          </div>
        ))}
      </div>

      {/* Leyenda override */}
      {esGestion && (
        <div style={{ marginBottom: 8, fontSize: 10, color: C.t2, display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ background: "rgba(167,139,250,0.12)", border: "1px solid rgba(167,139,250,0.3)", color: "#c4b5fd", padding: "1px 6px", borderRadius: 4, fontSize: 9, fontWeight: 700 }}>✏ editado</span>
          <span>= cantidad ingresada ajustada manualmente en esta lista (no modifica movimientos globales)</span>
        </div>
      )}

      {/* Filtros */}
      <div style={{ display: "flex", gap: 6, marginBottom: 10, alignItems: "center" }}>
        <span style={{ fontSize: 9, color: C.t2, letterSpacing: 1.5, textTransform: "uppercase", marginRight: 4 }}>Ver:</span>
        {[
          { key: "planificados", label: "Planificados" },
          { key: "activos",      label: "Con actividad" },
          { key: "todos",        label: "Todos" },
        ].map(({ key, label }) => (
          <button key={key} onClick={() => setFiltroMat(key)} style={{ border: `1px solid ${filtroMat === key ? C.primary + "88" : C.b0}`, background: filtroMat === key ? "rgba(59,130,246,0.15)" : "transparent", color: filtroMat === key ? "#93c5fd" : C.t2, padding: "4px 12px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: C.sans, fontWeight: filtroMat === key ? 700 : 400 }}>{label}</button>
        ))}
        <span style={{ fontSize: 10, color: C.t2, marginLeft: 4 }}>({filas.length})</span>
      </div>

      {filas.length === 0 ? (
        <div style={{ padding: "40px 0", textAlign: "center", color: C.t2, fontSize: 12 }}>
          {filtroMat === "planificados" && 'Sin planificados. Usá "📋 Lista base" o "Editar nec." para definir cantidades.'}
          {filtroMat === "activos"      && "Sin movimientos registrados todavía."}
          {filtroMat === "todos"        && "Sin materiales. Sincronizá la plantilla."}
        </div>
      ) : (
        <div style={{ background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 12, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={TH}>Material</th>
                <th style={{ ...TH, textAlign: "right" }}>Necesario</th>
                <th style={{ ...TH, textAlign: "right" }}>Ingresado</th>
                <th style={{ ...TH, textAlign: "right" }}>Egresado</th>
                <th style={{ ...TH, textAlign: "right" }}>Falta ingr.</th>
                <th style={{ ...TH, textAlign: "right" }}>Falta usar</th>
                <th style={{ ...TH, textAlign: "center" }}>Progreso</th>
                {esGestion && <th style={{ ...TH, textAlign: "center" }}>Nec.</th>}
              </tr>
            </thead>
            <tbody>
              {filas.map(r => {
                const pct     = r.necesario > 0 ? (r.ingresado / r.necesario) * 100 : 0;
                const necKey  = obraSel.id + r.matId;
                const necVal  = editNec[necKey] ?? "";
                const rowBg   = r.alertaCritica ? "rgba(239,68,68,0.04)" : r.alertaMedia ? "rgba(245,158,11,0.025)" : "transparent";
                const isEditingIng = editingIngresado === r.matId;
                const ingEditVal   = editIngresado[r.matId] ?? "";

                return (
                  <tr key={r.matId} style={{ background: rowBg }}>
                    {/* Material */}
                    <td style={TD}>
                      <div style={{ fontWeight: r.tieneActividad ? 600 : 400, color: r.tieneActividad ? C.t0 : C.t2 }}>{r.mat.nombre}</div>
                      <div style={{ fontSize: 10, color: C.t2, marginTop: 1 }}>{r.mat.unidad}</div>
                    </td>

                    {/* Necesario */}
                    <td style={{ ...TD, textAlign: "right" }}>
                      {esGestion ? (
                        <div style={{ display: "flex", gap: 3, justifyContent: "flex-end", alignItems: "center" }}>
                          <input
                            style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${C.b0}`, color: C.t0, padding: "3px 6px", borderRadius: 5, fontSize: 11, outline: "none", width: 60, textAlign: "right", fontFamily: C.mono }}
                            type="number" min="0" step="0.01"
                            placeholder={r.necesario || "0"}
                            value={necVal}
                            onChange={e => setEditNec(prev => ({ ...prev, [necKey]: e.target.value }))}
                          />
                          {necVal !== "" && (
                            <button disabled={savingNec} style={{ border: "1px solid rgba(16,185,129,0.3)", background: "rgba(16,185,129,0.1)", color: C.green, padding: "3px 6px", borderRadius: 5, cursor: "pointer", fontSize: 11 }}
                              onClick={() => { guardarNecesaria(obraSel.id, r.matId, r.configId, necVal); setEditNec(prev => { const n = { ...prev }; delete n[necKey]; return n; }); }}
                            >✓</button>
                          )}
                          {necVal === "" && <span style={{ fontFamily: C.mono, color: r.necesario > 0 ? "#a1a1aa" : C.t2, opacity: r.necesario > 0 ? 1 : 0.3, fontSize: 12 }}>{r.necesario > 0 ? r.necesario : "—"}</span>}
                        </div>
                      ) : (
                        <span style={{ fontFamily: C.mono, color: r.necesario > 0 ? "#a1a1aa" : C.t2, opacity: r.necesario > 0 ? 1 : 0.3 }}>{r.necesario > 0 ? r.necesario : "—"}</span>
                      )}
                    </td>

                    {/* Ingresado — con edición manual override */}
                    <td style={{ ...TD, textAlign: "right" }}>
                      <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", alignItems: "center" }}>
                        {isEditingIng ? (
                          <>
                            <input
                              autoFocus
                              style={{ background: "rgba(167,139,250,0.08)", border: "1px solid rgba(167,139,250,0.4)", color: C.t0, padding: "3px 6px", borderRadius: 5, fontSize: 11, outline: "none", width: 60, textAlign: "right", fontFamily: C.mono }}
                              type="number" min="0" step="0.01"
                              placeholder={r.ingresado}
                              value={ingEditVal}
                              onChange={e => setEditIngresado(prev => ({ ...prev, [r.matId]: e.target.value }))}
                              onKeyDown={e => {
                                if (e.key === "Enter" && ingEditVal !== "") {
                                  guardarIngresadoManual(obraSel.id, r.matId, r.configId, ingEditVal);
                                  setEditingIngresado(null);
                                  setEditIngresado(prev => { const n = { ...prev }; delete n[r.matId]; return n; });
                                }
                                if (e.key === "Escape") { setEditingIngresado(null); setEditIngresado(prev => { const n = { ...prev }; delete n[r.matId]; return n; }); }
                              }}
                            />
                            {ingEditVal !== "" && (
                              <button style={{ border: "1px solid rgba(167,139,250,0.4)", background: "rgba(167,139,250,0.12)", color: "#c4b5fd", padding: "3px 6px", borderRadius: 5, cursor: "pointer", fontSize: 10 }}
                                onClick={() => { guardarIngresadoManual(obraSel.id, r.matId, r.configId, ingEditVal); setEditingIngresado(null); setEditIngresado(prev => { const n = { ...prev }; delete n[r.matId]; return n; }); }}
                              >✓</button>
                            )}
                            <button style={{ border: `1px solid ${C.b0}`, background: "transparent", color: C.t2, padding: "3px 5px", borderRadius: 5, cursor: "pointer", fontSize: 10 }}
                              onClick={() => { setEditingIngresado(null); setEditIngresado(prev => { const n = { ...prev }; delete n[r.matId]; return n; }); }}
                            >✕</button>
                          </>
                        ) : (
                          <>
                            {/* Valor actual */}
                            <div style={{ textAlign: "right" }}>
                              <span style={{ fontFamily: C.mono, color: r.ingresado > 0 ? C.green : C.t2, fontWeight: r.ingresado > 0 ? 700 : 400 }}>
                                {r.ingresado > 0 ? r.ingresado : <span style={{ opacity: 0.3 }}>0</span>}
                              </span>
                              {/* Badge "editado" + fecha */}
                              {r.editadoManual && (
                                <div style={{ display: "flex", alignItems: "center", gap: 3, justifyContent: "flex-end", marginTop: 2 }}>
                                  <span style={{ background: "rgba(167,139,250,0.12)", border: "1px solid rgba(167,139,250,0.3)", color: "#c4b5fd", padding: "1px 5px", borderRadius: 4, fontSize: 8, fontWeight: 700, letterSpacing: 0.5 }}>✏ editado</span>
                                  {r.editadoAt && <span style={{ fontSize: 8, color: C.t2 }}>{fmtDateTime(r.editadoAt)}</span>}
                                </div>
                              )}
                              {/* Movimientos reales (si hay override, mostrar el original abajo) */}
                              {r.editadoManual && r.ingresadoMovimientos > 0 && (
                                <div style={{ fontSize: 9, color: C.t2, marginTop: 1 }}>movim: {r.ingresadoMovimientos}</div>
                              )}
                            </div>
                            {/* Botón editar (solo gestión) */}
                            {esGestion && (
                              <button
                                title="Ajustar ingresado manualmente"
                                style={{ border: `1px solid ${C.b0}`, background: "transparent", color: C.t2, padding: "2px 5px", borderRadius: 4, cursor: "pointer", fontSize: 10, opacity: 0.5, flexShrink: 0 }}
                                onClick={() => { setEditingIngresado(r.matId); setEditIngresado(prev => ({ ...prev, [r.matId]: String(r.ingresado) })); }}
                              >✎</button>
                            )}
                            {/* Botón limpiar override (solo si hay) */}
                            {esGestion && r.editadoManual && (
                              <button
                                title="Restaurar desde movimientos"
                                style={{ border: "1px solid rgba(239,68,68,0.2)", background: "transparent", color: C.red, padding: "2px 5px", borderRadius: 4, cursor: "pointer", fontSize: 9, opacity: 0.6, flexShrink: 0 }}
                                onClick={() => limpiarIngresadoManual(r.configId)}
                              >↺</button>
                            )}
                          </>
                        )}
                      </div>
                    </td>

                    {/* Egresado */}
                    <td style={{ ...TD, textAlign: "right", fontFamily: C.mono, color: r.egresado > 0 ? C.red : C.t2 }}>
                      {r.egresado > 0 ? r.egresado : <span style={{ opacity: 0.3 }}>0</span>}
                    </td>

                    {/* Falta ingresar */}
                    <td style={{ ...TD, textAlign: "right" }}>
                      {r.faltaIngresar > 0 ? (
                        <span style={{ fontFamily: C.mono, fontWeight: 700, color: r.alertaCritica ? C.red : C.amber }}>{r.faltaIngresar}</span>
                      ) : r.necesario > 0 ? <span style={{ color: C.green }}>✓</span> : <span style={{ opacity: 0.3 }}>—</span>}
                    </td>

                    {/* Falta usar */}
                    <td style={{ ...TD, textAlign: "right" }}>
                      {r.faltaUsar > 0 ? (
                        <span style={{ fontFamily: C.mono, color: "#a1a1aa" }}>{r.faltaUsar}</span>
                      ) : r.necesario > 0 ? <span style={{ color: C.green }}>✓</span> : <span style={{ opacity: 0.3 }}>—</span>}
                    </td>

                    {/* Progreso */}
                    <td style={{ ...TD, minWidth: 90 }}>
                      {r.necesario > 0 ? (
                        <div>
                          <ProgressBar value={pct} />
                          <div style={{ textAlign: "center", fontSize: 10, color: C.t2, marginTop: 3, fontFamily: C.mono }}>{Math.min(100, Math.round(pct))}%</div>
                        </div>
                      ) : <span style={{ opacity: 0.25, fontSize: 10 }}>sin planif.</span>}
                    </td>

                    {/* Col vacía para alinear header */}
                    {esGestion && <td style={TD} />}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ══════════════════════════════════════════════════════════════
export default function ObrasLaminacionScreen({ profile, signOut }) {
  const { isMobile } = useResponsive();
  const role      = profile?.role ?? "invitado";
  const isAdmin   = hasAdminAccess(profile);
  const esGestion = isAdmin || role === "oficina";

  const [obras,         setObras]         = useState([]);
  const [materiales,    setMateriales]    = useState([]);
  const [obraMats,      setObraMats]      = useState([]);
  const [movimientos,   setMovimientos]   = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [syncing,       setSyncing]       = useState(false);
  const [loadingBase,   setLoadingBase]   = useState(false);
  const [loadingImport, setLoadingImport] = useState(false);
  const [err,           setErr]           = useState("");
  const [msg,           setMsg]           = useState("");

  const [obraSelId,     setObraSelId]     = useState(null);
  const [q,             setQ]             = useState("");
  const [viewMode,      setViewMode]      = useState("lista");
  const [showNuevaObra, setShowNuevaObra] = useState(false);
  const [filtroMat,     setFiltroMat]     = useState("planificados");
  const [formObra,      setFormObra]      = useState({
    nombre: "", descripcion: "", estado: "activa",
    fecha_inicio: new Date().toISOString().slice(0, 10), fecha_fin: "",
  });
  const [editNec,   setEditNec]   = useState({});
  const [savingNec, setSavingNec] = useState(false);

  async function cargar() {
    setLoading(true); setErr("");
    const [r1, r2, r3, r4] = await Promise.all([
      supabase.from("laminacion_obras").select("*").order("created_at", { ascending: false }),
      supabase.from("laminacion_materiales").select("*").order("nombre"),
      supabase.from("laminacion_obra_materiales").select("*"),
      supabase.from("laminacion_movimientos")
        .select("material_id, tipo, cantidad, obra, destino")
        .or("obra.not.is.null,destino.not.is.null"),
    ]);
    if (r1.error) { setErr(r1.error.message); setLoading(false); return; }
    setObras(r1.data ?? []);
    setMateriales(r2.data ?? []);
    setObraMats(r3.data ?? []);
    setMovimientos(r4.data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    cargar();
    const ch = supabase.channel("rt-obras-lam")
      .on("postgres_changes", { event: "*", schema: "public", table: "laminacion_obras" }, cargar)
      .on("postgres_changes", { event: "*", schema: "public", table: "laminacion_obra_materiales" }, cargar)
      .on("postgres_changes", { event: "*", schema: "public", table: "laminacion_movimientos" }, cargar)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  const obraSel = useMemo(() => obras.find(o => o.id === obraSelId), [obras, obraSelId]);
  const norm = (s) => (s ?? "").trim().toUpperCase().replace(/\s+/g, " ");

  const tablaObra = useMemo(() => {
    if (!obraSel) return [];
    const configMats = obraMats.filter(om => om.obra_id === obraSel.id);
    const nombreNorm = norm(obraSel.nombre);

    return materiales.map(mat => {
      const config   = configMats.find(cm => cm.material_id === mat.id);
      const necesario = num(config?.cantidad_necesaria ?? 0);

      // Ingresos matchean por obra; egresos matchean por obra O por destino (campo legado del form viejo)
      const movsObra = movimientos.filter(m => {
        if (m.material_id !== mat.id) return false;
        if (norm(m.obra) === nombreNorm) return true;
        if (m.tipo === "egreso" && norm(m.destino) === nombreNorm) return true;
        return false;
      });
      const ingresadoMovimientos = movsObra.filter(m => m.tipo === "ingreso").reduce((s, m) => s + num(m.cantidad), 0);
      const egresado          = movsObra.filter(m => m.tipo === "egreso" ).reduce((s, m) => s + num(m.cantidad), 0);

      // Override manual (solo afecta esta lista, no movimientos globales)
      const ingresadoManual = config?.ingresado_manual ?? null;
      const editadoManual   = ingresadoManual !== null;
      const ingresado       = editadoManual ? ingresadoManual : ingresadoMovimientos;
      const editadoAt       = config?.ingresado_manual_at ?? null;

      const faltaIngresar  = Math.max(0, necesario - ingresado);
      const faltaUsar      = Math.max(0, necesario - egresado);
      const alertaCritica  = necesario > 0 && faltaIngresar > necesario * 0.5;
      const alertaMedia    = necesario > 0 && faltaIngresar > 0;
      const tieneActividad = ingresado > 0 || egresado > 0 || necesario > 0;

      return {
        matId: mat.id, mat, necesario,
        ingresado, ingresadoMovimientos, egresado,
        faltaIngresar, faltaUsar,
        alertaCritica, alertaMedia, tieneActividad,
        editadoManual, editadoAt,
        configId: config?.id ?? null,
      };
    }).sort((a, b) => {
      if (a.tieneActividad && !b.tieneActividad) return -1;
      if (!a.tieneActividad && b.tieneActividad) return 1;
      return (a.mat?.nombre ?? "").localeCompare(b.mat?.nombre ?? "");
    });
  }, [obraSel, obraMats, movimientos, materiales]);

  const alertasPorObra = useMemo(() => {
    const map = {};
    obras.forEach(o => {
      const configMats = obraMats.filter(om => om.obra_id === o.id);
      const nombreNorm = norm(o.nombre);
      const criticas = configMats.filter(cm => {
        const nec = num(cm.cantidad_necesaria); if (!nec) return false;
        const manual = cm.ingresado_manual ?? null;
        const ing = manual !== null ? manual
          : movimientos.filter(m => m.material_id === cm.material_id && m.tipo === "ingreso" && (norm(m.obra) === nombreNorm || norm(m.destino) === nombreNorm)).reduce((s, m) => s + num(m.cantidad), 0);
        return ing < nec * 0.5;
      }).length;
      const pendientes = configMats.filter(cm => {
        const nec = num(cm.cantidad_necesaria); if (!nec) return false;
        const manual = cm.ingresado_manual ?? null;
        const ing = manual !== null ? manual
          : movimientos.filter(m => m.material_id === cm.material_id && m.tipo === "ingreso" && (norm(m.obra) === nombreNorm || norm(m.destino) === nombreNorm)).reduce((s, m) => s + num(m.cantidad), 0);
        return ing < nec;
      }).length;
      map[o.id] = { criticas, pendientes };
    });
    return map;
  }, [obras, obraMats, movimientos]);

  async function crearObra(e) {
    e.preventDefault();
    if (!formObra.nombre.trim()) return setErr("El nombre es obligatorio.");
    const { data: obraData, error: errObra } = await supabase.from("laminacion_obras")
      .insert({ nombre: formObra.nombre.trim().toUpperCase(), descripcion: formObra.descripcion.trim() || null, estado: formObra.estado, fecha_inicio: formObra.fecha_inicio || null, fecha_fin: formObra.fecha_fin || null })
      .select().single();
    if (errObra) return setErr(errObra.message);
    const plantilla = materiales.map(mat => ({ obra_id: obraData.id, material_id: mat.id, cantidad_necesaria: 0 }));
    if (plantilla.length) await supabase.from("laminacion_obra_materiales").insert(plantilla);
    setMsg(`✅ Obra ${obraData.nombre} creada.`);
    setShowNuevaObra(false);
    setFormObra({ nombre: "", descripcion: "", estado: "activa", fecha_inicio: new Date().toISOString().slice(0, 10), fecha_fin: "" });
    await cargar();
  }

  async function cambiarEstado(obraId, nuevoEstado) {
    const upd = { estado: nuevoEstado };
    if (nuevoEstado === "terminada") upd.fecha_fin = new Date().toISOString().slice(0, 10);
    const { error } = await supabase.from("laminacion_obras").update(upd).eq("id", obraId);
    if (error) setErr(error.message); else await cargar();
  }

  async function guardarNecesaria(obraId, matId, configId, valor) {
    setSavingNec(true);
    const cantidad = num(valor); let error;
    if (configId) {
      ({ error } = await supabase.from("laminacion_obra_materiales").update({ cantidad_necesaria: cantidad }).eq("id", configId));
    } else {
      ({ error } = await supabase.from("laminacion_obra_materiales").insert({ obra_id: obraId, material_id: matId, cantidad_necesaria: cantidad }));
    }
    setSavingNec(false);
    if (error) setErr(error.message); else await cargar();
  }

  // ── Override ingresado manual ──────────────────────────────────────
  // Solo toca laminacion_obra_materiales.ingresado_manual — NO crea ni modifica movimientos
  async function guardarIngresadoManual(obraId, matId, configId, valor) {
    const cantidad = num(valor);
    let error;
    if (configId) {
      ({ error } = await supabase.from("laminacion_obra_materiales").update({
        ingresado_manual:    cantidad,
        ingresado_manual_at: new Date().toISOString(),
      }).eq("id", configId));
    } else {
      ({ error } = await supabase.from("laminacion_obra_materiales").insert({
        obra_id:             obraId,
        material_id:         matId,
        cantidad_necesaria:  0,
        ingresado_manual:    cantidad,
        ingresado_manual_at: new Date().toISOString(),
      }));
    }
    if (error) setErr(error.message); else await cargar();
  }

  async function limpiarIngresadoManual(configId) {
    if (!configId) return;
    const { error } = await supabase.from("laminacion_obra_materiales").update({
      ingresado_manual:    null,
      ingresado_manual_at: null,
    }).eq("id", configId);
    if (error) setErr(error.message); else await cargar();
  }

  async function sincronizarMateriales(obraId) {
    setSyncing(true);
    const plantilla = materiales
      .filter(mat => !obraMats.some(om => om.obra_id === obraId && om.material_id === mat.id))
      .map(mat => ({ obra_id: obraId, material_id: mat.id, cantidad_necesaria: 0 }));
    if (!plantilla.length) { setMsg("✅ Ya sincronizado."); setSyncing(false); return; }
    const { error } = await supabase.from("laminacion_obra_materiales").insert(plantilla);
    if (error) setErr(error.message); else setMsg(`✅ ${plantilla.length} materiales sincronizados.`);
    setSyncing(false); await cargar();
  }

  async function cargarListaBase(obraId) {
    const obra = obras.find(o => o.id === obraId);
    if (!obra) return;
    const codigo = extraerCodigo(obra);
    if (!codigo) return setErr(`No se pudo determinar el modelo de "${obra.nombre}". Incluí el código en la descripción (ej: "K34 — Hunter").`);
    const lista = LISTAS_BASE[codigo];
    if (!lista) return setErr(`Sin lista base para ${codigo}. Disponibles: ${Object.keys(LISTAS_BASE).join(", ")}`);

    setLoadingBase(true);

    // Asegurar plantilla completa
    const faltantes = materiales.filter(mat => !obraMats.some(om => om.obra_id === obraId && om.material_id === mat.id));
    if (faltantes.length) {
      await supabase.from("laminacion_obra_materiales")
        .insert(faltantes.map(mat => ({ obra_id: obraId, material_id: mat.id, cantidad_necesaria: 0 })));
    }

    const { data: matsActual } = await supabase.from("laminacion_obra_materiales").select("*").eq("obra_id", obraId);
    const mats = matsActual ?? [];

    const results = await Promise.all(lista.map(item => {
      const config = mats.find(om => om.material_id === item.id);
      if (!config) return Promise.resolve({ error: { message: `UUID ${item.id} no existe en DB` } });
      return supabase.from("laminacion_obra_materiales").update({ cantidad_necesaria: item.cantidad }).eq("id", config.id);
    }));

    const errores = results.filter(r => r.error);
    setLoadingBase(false);
    await cargar();
    if (errores.length > 0) setErr(`Errores: ${errores.map(r => r.error.message).join(" · ")}`);
    else setMsg(`✅ Lista base ${codigo} aplicada — ${lista.length} materiales actualizados.`);
  }

  async function importarDesdeBarcos() {
    setLoadingImport(true); setErr("");
    const { data: barcos, error: errBarcos } = await supabase
      .from("laminacion_barcos").select("*").neq("estado_pedido", "finalizado");
    if (errBarcos) { setErr("Error: " + errBarcos.message); setLoadingImport(false); return; }

    const nombresExistentes = new Set(obras.map(o => o.nombre.trim().toUpperCase()));
    const hoy = new Date().toISOString().slice(0, 10);

    const nuevos = (barcos ?? [])
      .filter(b => b.modelo && b.numero != null)
      .map(b => ({ nombre: String(b.numero).toUpperCase(), modelo: b.modelo.toUpperCase(), fecha_fin: b.desmolde_real || b.desmolde_estimado || null }))
      .filter(b => !nombresExistentes.has(b.nombre));

    if (!nuevos.length) { setMsg("✅ Todas las obras del calendario ya están creadas."); setLoadingImport(false); return; }

    const { data: obrasCreadas, error: errObras } = await supabase.from("laminacion_obras")
      .insert(nuevos.map(b => ({ nombre: b.nombre, descripcion: `${b.modelo} — importado desde calendario`, estado: "activa", fecha_inicio: hoy, fecha_fin: b.fecha_fin || null })))
      .select();
    if (errObras) { setErr("Error creando obras: " + errObras.message); setLoadingImport(false); return; }

    const sinLista = [];
    for (const obraData of obrasCreadas) {
      const barcoOrig = nuevos.find(b => b.nombre === obraData.nombre);
      const codigo    = barcoOrig?.modelo ?? extraerCodigo(obraData);
      if (materiales.length) {
        await supabase.from("laminacion_obra_materiales")
          .insert(materiales.map(mat => ({ obra_id: obraData.id, material_id: mat.id, cantidad_necesaria: 0 })));
      }
      const lista = codigo ? LISTAS_BASE[codigo] : null;
      if (!lista) { sinLista.push(`${obraData.nombre}(${codigo ?? "?"})`); continue; }
      await Promise.all(lista.map(item =>
        supabase.from("laminacion_obra_materiales")
          .update({ cantidad_necesaria: item.cantidad })
          .eq("obra_id", obraData.id).eq("material_id", item.id)
      ));
    }

    await cargar(); setLoadingImport(false);
    const n = obrasCreadas.length;
    const sinMsg = sinLista.length ? ` ⚠ Sin lista: ${sinLista.join(", ")}` : "";
    setMsg(`✅ ${n} obra${n > 1 ? "s" : ""} importada${n > 1 ? "s" : ""} con lista base.${sinMsg}`);
  }

  const obrasFiltradas = useMemo(() => {
    const qq = q.toLowerCase();
    if (!qq) return obras;
    return obras.filter(o => o.nombre.toLowerCase().includes(qq) || (o.descripcion ?? "").toLowerCase().includes(qq));
  }, [obras, q]);

  const obraStats = useMemo(() => ({
    total:     tablaObra.length,
    planif:    tablaObra.filter(r => r.necesario > 0).length,
    completos: tablaObra.filter(r => r.necesario > 0 && r.faltaIngresar === 0).length,
    criticos:  tablaObra.filter(r => r.alertaCritica).length,
  }), [tablaObra]);

  return (
    <div style={{ background: C.bg, position: "fixed", inset: 0, overflow: "hidden", color: C.t0, fontFamily: C.sans }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        select option { background: #0f0f12; color: #a1a1aa; }
        ::-webkit-scrollbar { width: 3px; height: 3px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.07); border-radius: 99px; }
        input:focus, select:focus { border-color: rgba(59,130,246,0.35) !important; outline: none; }
        @keyframes slideUp   { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes slideLeft { from{opacity:0;transform:translateX(10px)} to{opacity:1;transform:translateX(0)} }
        button:not([disabled]):hover { opacity: 0.8; }
        tr:hover td { background: rgba(255,255,255,0.015); }
        .bg-glow { position:fixed;inset:0;pointer-events:none;z-index:0;
          background:radial-gradient(ellipse 70% 38% at 50% -6%,rgba(59,130,246,0.07) 0%,transparent 65%),
                     radial-gradient(ellipse 40% 28% at 92% 88%,rgba(245,158,11,0.02) 0%,transparent 55%); }
      `}</style>
      <div className="bg-glow" />
      <NotificacionesBell profile={profile} />

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "280px 1fr", height: "100%", overflow: "hidden", position: "relative", zIndex: 1 }}>
        <Sidebar profile={profile} signOut={signOut} />
        <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>

          {/* TOPBAR */}
          <div style={{ height: 50, background: "rgba(12,12,14,0.92)", ...GLASS, borderBottom: `1px solid ${C.b0}`, padding: isMobile ? "0 12px 0 52px" : "0 18px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.t0 }}>Obras</div>
              <div style={{ width: 1, height: 14, background: C.b1 }} />
              <div style={{ fontSize: 10, color: C.t2, letterSpacing: 1 }}>Laminación</div>
              <div style={{ display: "flex", gap: 7, marginLeft: 12 }}>
                {[
                  { label: "Activas",    n: obras.filter(o => o.estado === "activa").length,    c: C.obra.activa.dot    },
                  { label: "Pausadas",   n: obras.filter(o => o.estado === "pausada").length,   c: C.obra.pausada.dot   },
                  { label: "Terminadas", n: obras.filter(o => o.estado === "terminada").length, c: C.obra.terminada.dot },
                ].map(({ label, n, c }) => (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 8px", borderRadius: 6, background: C.s0, border: `1px solid ${C.b0}`, borderLeft: `2px solid ${c}` }}>
                    <span style={{ fontFamily: C.mono, fontSize: 13, fontWeight: 700, color: c }}>{n}</span>
                    <span style={{ fontSize: 8, color: C.t1, letterSpacing: 1.5, textTransform: "uppercase" }}>{label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", gap: 2, background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 8, padding: 2 }}>
              {[{ key: "lista", label: "☰ Lista" }, { key: "gantt", label: "📅 Calendario" }].map(({ key, label }) => (
                <button key={key} onClick={() => setViewMode(key)} style={{ border: viewMode === key ? `1px solid rgba(59,130,246,0.4)` : "1px solid transparent", background: viewMode === key ? "rgba(59,130,246,0.15)" : "transparent", color: viewMode === key ? "#93c5fd" : C.t2, padding: "4px 12px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: C.sans, fontWeight: viewMode === key ? 700 : 400, transition: "all .15s" }}>{label}</button>
              ))}
            </div>

            <button onClick={cargar} style={{ border: `1px solid ${C.b0}`, background: "transparent", color: C.t2, padding: "5px 10px", borderRadius: 7, cursor: "pointer", fontFamily: C.sans, fontSize: 11 }}>↻</button>
            {esGestion && (
              <>
                <button disabled={loadingImport} onClick={importarDesdeBarcos}
                  style={{ border: "1px solid rgba(167,139,250,0.35)", background: "rgba(167,139,250,0.12)", color: "#c4b5fd", padding: "7px 16px", borderRadius: 8, cursor: loadingImport ? "not-allowed" : "pointer", fontFamily: C.sans, fontSize: 12, fontWeight: 600, opacity: loadingImport ? 0.6 : 1 }}
                >{loadingImport ? "⟳ Importando…" : "⬇ Importar barcos"}</button>
                <button onClick={() => setShowNuevaObra(v => !v)}
                  style={{ border: "1px solid rgba(59,130,246,0.35)", background: "rgba(59,130,246,0.15)", color: "#60a5fa", padding: "7px 16px", borderRadius: 8, cursor: "pointer", fontFamily: C.sans, fontSize: 12, fontWeight: 600 }}
                >{showNuevaObra ? "✕ Cancelar" : "+ Nueva obra"}</button>
              </>
            )}
          </div>

          {/* MAIN */}
          <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            {(err || msg) && (
              <div style={{ padding: "8px 18px", flexShrink: 0 }}>
                {err && <div onClick={() => setErr("")} style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171", fontSize: 12, cursor: "pointer" }}>{err} ✕</div>}
                {msg && <div onClick={() => setMsg("")} style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)", color: "#34d399", fontSize: 12, cursor: "pointer" }}>{msg} ✕</div>}
              </div>
            )}

            {showNuevaObra && esGestion && (
              <div style={{ padding: "0 18px 12px", flexShrink: 0 }}>
                <div style={{ background: C.s0, border: `1px solid ${C.b1}`, borderRadius: 12, padding: 16, animation: "slideUp .2s ease" }}>
                  <div style={{ fontSize: 9, letterSpacing: 2, color: C.t2, textTransform: "uppercase", marginBottom: 12 }}>Nueva obra</div>
                  <form onSubmit={crearObra}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
                      {[
                        { label: "Número *",    key: "nombre",      placeholder: "37-42" },
                        { label: "Descripción", key: "descripcion", placeholder: "K37 — Casco 42" },
                      ].map(({ label, key, placeholder }) => (
                        <div key={key}>
                          <label style={{ fontSize: 9, letterSpacing: 2, color: C.t2, display: "block", marginBottom: 4, textTransform: "uppercase", fontWeight: 600 }}>{label}</label>
                          <input style={INP} placeholder={placeholder} value={formObra[key]} onChange={e => setFormObra(f => ({ ...f, [key]: e.target.value }))} required={key === "nombre"} />
                        </div>
                      ))}
                      <div>
                        <label style={{ fontSize: 9, letterSpacing: 2, color: C.t2, display: "block", marginBottom: 4, textTransform: "uppercase", fontWeight: 600 }}>Estado</label>
                        <select style={{ ...INP, cursor: "pointer" }} value={formObra.estado} onChange={e => setFormObra(f => ({ ...f, estado: e.target.value }))}>
                          <option value="activa">Activa</option>
                          <option value="pausada">Pausada</option>
                          <option value="terminada">Terminada</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: 9, letterSpacing: 2, color: C.t2, display: "block", marginBottom: 4, textTransform: "uppercase", fontWeight: 600 }}>Inicio</label>
                        <input type="date" style={INP} value={formObra.fecha_inicio} onChange={e => setFormObra(f => ({ ...f, fecha_inicio: e.target.value }))} />
                      </div>
                      <div>
                        <label style={{ fontSize: 9, letterSpacing: 2, color: C.t2, display: "block", marginBottom: 4, textTransform: "uppercase", fontWeight: 600 }}>Fin estimado</label>
                        <input type="date" style={INP} value={formObra.fecha_fin} onChange={e => setFormObra(f => ({ ...f, fecha_fin: e.target.value }))} />
                      </div>
                    </div>
                    <button type="submit" style={{ border: "1px solid rgba(59,130,246,0.35)", background: "rgba(59,130,246,0.15)", color: "#60a5fa", padding: "8px 20px", borderRadius: 8, cursor: "pointer", fontFamily: C.sans, fontSize: 12, fontWeight: 700 }}>Crear obra</button>
                  </form>
                </div>
              </div>
            )}

            {loading ? (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ fontSize: 11, color: C.t2, letterSpacing: 2, textTransform: "uppercase" }}>Cargando…</div>
              </div>
            ) : (
              <div style={{ flex: 1, overflow: "hidden", display: "grid", gridTemplateColumns: "300px 1fr" }}>

                {/* LISTA OBRAS */}
                <div style={{ borderRight: `1px solid ${C.b0}`, display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
                  <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.b0}`, flexShrink: 0 }}>
                    <input style={{ ...INP, padding: "6px 10px", fontSize: 11 }} placeholder="Buscar obra…" value={q} onChange={e => setQ(e.target.value)} />
                  </div>
                  <div style={{ flex: 1, overflowY: "auto", padding: "6px 8px" }}>
                    {obrasFiltradas.length === 0 && <div style={{ padding: "40px 16px", textAlign: "center", color: C.t2, fontSize: 11 }}>Sin obras</div>}
                    {obrasFiltradas.map(o => {
                      const al           = alertasPorObra[o.id] ?? { criticas: 0, pendientes: 0 };
                      const sel          = obraSelId === o.id;
                      const planificados = obraMats.filter(om => om.obra_id === o.id && num(om.cantidad_necesaria) > 0).length;
                      const sinPlantilla = !obraMats.some(om => om.obra_id === o.id);
                      const obraColor    = C.obra[o.estado]?.dot ?? C.t2;
                      const diasFin      = o.fecha_fin ? diasHasta(o.fecha_fin) : null;
                      const codigoLista  = extraerCodigo(o);
                      const tieneLista   = codigoLista && !!LISTAS_BASE[codigoLista];

                      return (
                        <div key={o.id} onClick={() => setObraSelId(sel ? null : o.id)}
                          style={{ padding: "10px 12px", borderRadius: 9, cursor: "pointer", marginBottom: 4, background: sel ? C.s1 : "transparent", border: sel ? `1px solid ${C.b1}` : "1px solid transparent", borderLeft: `2px solid ${sel ? obraColor : "transparent"}`, transition: "all .15s" }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ color: C.t0, fontWeight: 700, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.nombre}</div>
                              {o.descripcion && <div style={{ fontSize: 10, color: C.t2, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.descripcion}</div>}
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "flex-end", flexShrink: 0 }}>
                              <EstadoChip estado={o.estado} />
                              {al.criticas > 0 && <span style={{ fontSize: 8, padding: "2px 6px", borderRadius: 99, background: "rgba(239,68,68,0.1)", color: C.red, border: "1px solid rgba(239,68,68,0.25)", fontWeight: 700 }}>⚠ {al.criticas} crítico{al.criticas > 1 ? "s" : ""}</span>}
                              {sinPlantilla && <span style={{ fontSize: 8, padding: "2px 6px", borderRadius: 99, background: "rgba(245,158,11,0.1)", color: C.amber, border: "1px solid rgba(245,158,11,0.25)", fontWeight: 700 }}>sin plantilla</span>}
                            </div>
                          </div>
                          <div style={{ marginTop: 5, fontSize: 10, color: C.t2, display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <span>{planificados} planif.</span>
                            {tieneLista && <span style={{ color: "#34d399" }}>📋 {codigoLista}</span>}
                            {o.fecha_inicio && <span>📅 {fmtDate(o.fecha_inicio)}</span>}
                            {diasFin !== null && diasFin >= 0 && diasFin <= 30 && <span style={{ color: urgenciaFinColor(diasFin), fontWeight: 700 }}>⏱ {diasFin}d</span>}
                            {diasFin !== null && diasFin < 0 && o.estado !== "terminada" && <span style={{ color: C.red, fontWeight: 700 }}>⚠ vencida</span>}
                          </div>

                          {sel && esGestion && (
                            <div style={{ marginTop: 8, display: "flex", gap: 4, flexWrap: "wrap" }} onClick={e => e.stopPropagation()}>
                              {o.estado !== "activa"    && <button style={{ border: `1px solid ${C.b0}`, background: "transparent", color: C.t1, padding: "2px 8px", borderRadius: 5, cursor: "pointer", fontSize: 9, fontFamily: C.sans }} onClick={() => cambiarEstado(o.id, "activa")}>▶ Activar</button>}
                              {o.estado !== "pausada"   && <button style={{ border: `1px solid ${C.b0}`, background: "transparent", color: C.t1, padding: "2px 8px", borderRadius: 5, cursor: "pointer", fontSize: 9, fontFamily: C.sans }} onClick={() => cambiarEstado(o.id, "pausada")}>⏸ Pausar</button>}
                              {o.estado !== "terminada" && <button style={{ border: `1px solid ${C.b0}`, background: "transparent", color: C.t1, padding: "2px 8px", borderRadius: 5, cursor: "pointer", fontSize: 9, fontFamily: C.sans }} onClick={() => cambiarEstado(o.id, "terminada")}>✓ Terminar</button>}
                              <button disabled={syncing} style={{ border: "1px solid rgba(59,130,246,0.2)", background: "transparent", color: "#93c5fd", padding: "2px 8px", borderRadius: 5, cursor: "pointer", fontSize: 9, fontFamily: C.sans }} onClick={() => sincronizarMateriales(o.id)}>⟳ Sincronizar</button>
                              {tieneLista && (
                                <button disabled={loadingBase} style={{ border: "1px solid rgba(16,185,129,0.25)", background: "rgba(16,185,129,0.08)", color: "#34d399", padding: "2px 8px", borderRadius: 5, cursor: "pointer", fontSize: 9, fontFamily: C.sans }} onClick={() => cargarListaBase(o.id)}>
                                  {loadingBase ? "…" : `📋 Lista ${codigoLista}`}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* PANEL DERECHO */}
                <div style={{ height: "100%", overflowY: "auto" }}>
                  {viewMode === "gantt" ? (
                    <GanttView obras={obras} obrasFiltradas={obrasFiltradas} alertasPorObra={alertasPorObra} obraSelId={obraSelId} setObraSelId={setObraSelId} />
                  ) : !obraSel ? (
                    <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6 }}>
                      <div style={{ fontSize: 28, opacity: 0.15 }}>📋</div>
                      <div style={{ fontSize: 11, color: C.t2, letterSpacing: 2, textTransform: "uppercase" }}>Seleccioná una obra</div>
                      <div style={{ fontSize: 10, color: C.t2, opacity: 0.6, marginTop: 2 }}>O cambiá a vista Calendario</div>
                    </div>
                  ) : (
                    <DetalleObra
                      obraSel={obraSel} tablaObra={tablaObra} obraStats={obraStats}
                      esGestion={esGestion} editNec={editNec} setEditNec={setEditNec}
                      savingNec={savingNec} guardarNecesaria={guardarNecesaria}
                      guardarIngresadoManual={guardarIngresadoManual}
                      limpiarIngresadoManual={limpiarIngresadoManual}
                      filtroMat={filtroMat} setFiltroMat={setFiltroMat}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
