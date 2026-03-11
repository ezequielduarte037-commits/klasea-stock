import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabaseClient";
import Sidebar from "../components/Sidebar";

function num(v) { const x = Number(v); return Number.isFinite(x) ? x : 0; }

// ── CSV Export ──────────────────────────────────────────────────
function descargarCSV(filas, nombre) {
  if (!filas.length) return;
  const cols = Object.keys(filas[0]);
  const esc = v => { const s = v == null ? "" : String(v); return (s.includes(",") || s.includes('"') || s.includes("\n")) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = [cols.map(esc).join(","), ...filas.map(r => cols.map(k => esc(r[k])).join(","))].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement("a"), { href: url, download: nombre }).click();
  URL.revokeObjectURL(url);
}

// ─── PALETA ────────────────────────────────────────────────────
const C = {
  bg: "#09090b",
  s0: "rgba(255,255,255,0.03)",
  s1: "rgba(255,255,255,0.06)",
  b0: "rgba(255,255,255,0.08)",
  b1: "rgba(255,255,255,0.15)",
  t0: "#f4f4f5",
  t1: "#a1a1aa",
  t2: "#71717a",
  mono: "'JetBrains Mono', 'IBM Plex Mono', monospace",
  sans: "'Outfit', system-ui, sans-serif",
  primary: "#3b82f6",
  amber: "#f59e0b",
  green: "#10b981",
  red: "#ef4444",
};

const GLASS = {
  backdropFilter: "blur(32px) saturate(130%)",
  WebkitBackdropFilter: "blur(32px) saturate(130%)",
};

const INP = {
  background: "rgba(255,255,255,0.04)",
  border: `1px solid ${C.b0}`,
  color: C.t0, padding: "8px 12px", borderRadius: 8, fontSize: 12,
  outline: "none", width: "100%", fontFamily: C.sans,
};

// ─── ESTADO CONFIG ─────────────────────────────────────────────
const ESTADO_META = {
  OK:       { color: C.green,   bg: "rgba(16,185,129,0.1)",  border: "rgba(16,185,129,0.25)"  },
  ATENCION: { color: C.amber,   bg: "rgba(245,158,11,0.1)",  border: "rgba(245,158,11,0.25)"  },
  CRITICO:  { color: C.red,     bg: "rgba(239,68,68,0.1)",   border: "rgba(239,68,68,0.25)"   },
  PEDIDO:   { color: "#93c5fd", bg: "rgba(59,130,246,0.1)",  border: "rgba(59,130,246,0.25)"  },
};

function EstadoChip({ estado }) {
  const meta = ESTADO_META[String(estado).toUpperCase()] ?? ESTADO_META.OK;
  return (
    <span style={{
      fontSize: 8, letterSpacing: 1.5, textTransform: "uppercase",
      padding: "2px 8px", borderRadius: 99, fontWeight: 700,
      background: meta.bg, color: meta.color, border: `1px solid ${meta.border}`,
      whiteSpace: "nowrap",
    }}>
      {estado}
    </span>
  );
}

// ── ANIMATED NUMBER ────────────────────────────────────────────────
function AnimatedNumber({ value, duration = 700 }) {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef(null);
  const prevRef = useRef(0);
  useEffect(() => {
    const start = performance.now();
    const from = prevRef.current;
    const to = value;
    function tick(now) {
      const p = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(from + (to - from) * ease));
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
      else prevRef.current = to;
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value]);
  return <>{display}</>;
}

// ── SVG RING CHART ────────────────────────────────────────────────
function RingChart({ pct, color, size = 52, stroke = 4 }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)", flexShrink: 0 }}>
      {/* Track */}
      <circle cx={size/2} cy={size/2} r={r}
        fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={stroke} />
      {/* Arc */}
      <circle cx={size/2} cy={size/2} r={r}
        fill="none" stroke={color} strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circ}`}
        style={{ transition: "stroke-dasharray 1.4s cubic-bezier(.22,1,.36,1)", filter: `drop-shadow(0 0 4px ${color}88)` }}
      />
    </svg>
  );
}

function KpiCard({ label, value, total, color, bg, border, icon, pulse = false, delay = 0 }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="kpi-card" style={{
      background: bg, border: `1px solid ${border}`, borderRadius: 14,
      padding: "16px 18px",
      boxShadow: pulse && value > 0 ? `0 0 32px ${color}22, inset 0 0 20px ${color}08` : "none",
      transition: "box-shadow .3s, transform .18s",
      display: "flex", flexDirection: "column", gap: 10,
      animation: `slideUp .35s cubic-bezier(.22,1,.36,1) ${delay}ms both`,
      position: "relative", overflow: "hidden",
    }}>
      {/* Ambient glow top-right */}
      <div style={{
        position: "absolute", top: -20, right: -20, width: 80, height: 80,
        borderRadius: "50%", background: `${color}0d`, pointerEvents: "none",
        filter: "blur(16px)",
      }} />

      {/* Top row: label + icon */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <span style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: C.t2, fontWeight: 700 }}>{label}</span>
        <span style={{ fontSize: 14, opacity: .6 }}>{icon}</span>
      </div>

      {/* Middle: number + ring */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontFamily: C.mono, fontSize: 36, fontWeight: 700, color, lineHeight: 1, display: "flex", alignItems: "baseline", gap: 5 }}>
            <AnimatedNumber value={value} duration={900} />
            {pulse && value > 0 && (
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, display: "inline-block", animation: "kpiPulse 1.4s ease infinite", marginBottom: 3 }} />
            )}
          </div>
          <div style={{ fontSize: 9, color: C.t2, marginTop: 4, fontFamily: C.mono }}>
            {total > 0 ? `${pct}% del total` : "—"}
          </div>
        </div>
        <RingChart pct={pct} color={color} size={48} stroke={3.5} />
      </div>

      {/* Bottom: thin accent bar */}
      <div style={{ height: 2, borderRadius: 99, background: "rgba(255,255,255,0.05)", overflow: "hidden" }}>
        <div style={{
          height: "100%", borderRadius: 99,
          width: total > 0 ? `${pct}%` : "0%",
          background: `linear-gradient(90deg, ${color}88, ${color})`,
          transition: "width 1.4s cubic-bezier(.22,1,.36,1)",
          boxShadow: `0 0 8px ${color}88`,
        }} />
      </div>
    </div>
  );
}

export default function AdminDashboard({ profile, signOut }) {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [q, setQ] = useState("");
  const [soloNoOk, setSoloNoOk] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [newMat, setNewMat] = useState({ nombre: "", categoria: "Maderas", unidad_medida: "u", stock_minimo: 5 });

  async function cargar() {
    setError("");
    const { data, error } = await supabase
      .from("materiales_kpi_pedidos")
      .select("id,nombre,unidad_medida,stock_actual,stock_minimo,consumo_semanal,semanas_cobertura,estado,pedido_sugerido,pedido_pendiente,estado_ui,categoria")
      .order("nombre", { ascending: true });
    if (error) return setError(error.message);
    setRows(data ?? []);
  }

  useEffect(() => {
    cargar();
    const ch = supabase.channel("rt-admin-materiales")
      .on("postgres_changes", { event: "*", schema: "public", table: "materiales" }, cargar)
      .on("postgres_changes", { event: "*", schema: "public", table: "pedidos" }, cargar)
      .on("postgres_changes", { event: "*", schema: "public", table: "pedido_items" }, cargar)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  async function crearMaterial() {
    if (!newMat.nombre.trim()) return alert("Poné un nombre al material");
    const { error } = await supabase.from("materiales").insert({
      nombre: newMat.nombre, categoria: newMat.categoria,
      unidad_medida: newMat.unidad_medida, stock_minimo: newMat.stock_minimo, stock_actual: 0,
    });
    if (error) { alert("Error: " + error.message); }
    else {
      setMsg("✅ Material creado exitosamente");
      setShowModal(false);
      setNewMat({ nombre: "", categoria: "Maderas", unidad_medida: "u", stock_minimo: 5 });
      setTimeout(() => setMsg(""), 2000);
      cargar();
    }
  }

  const stats = useMemo(() => {
    const st = r => String(r.estado_ui || r.estado || "").toUpperCase();
    return {
      ok:    rows.filter(r => st(r) === "OK").length,
      at:    rows.filter(r => st(r) === "ATENCION").length,
      cr:    rows.filter(r => st(r) === "CRITICO").length,
      pe:    rows.filter(r => st(r) === "PEDIDO").length,
      total: rows.length,
    };
  }, [rows]);

  const filtrados = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return rows.filter(r => {
      const est = String(r.estado_ui || r.estado || "").toUpperCase();
      if (soloNoOk && est === "OK") return false;
      if (!qq) return true;
      return (r.nombre || "").toLowerCase().includes(qq) || (r.categoria || "").toLowerCase().includes(qq);
    });
  }, [rows, q, soloNoOk]);

  const listaCompra = useMemo(() =>
    filtrados.filter(r => num(r.pedido_sugerido) > 0 && !r.pedido_pendiente)
      .map(r => `${r.nombre} -> PEDIR: ${num(r.pedido_sugerido).toFixed(2)} ${r.unidad_medida || ""}`.trim()),
  [filtrados]);

  function exportarInventario() {
    const hoy = new Date().toLocaleDateString("es-AR").replace(/[/]/g, "-");
    const filas = filtrados.map(r => ({
      Material: r.nombre, Categoria: r.categoria ?? "—", Unidad: r.unidad_medida ?? "—",
      Stock_actual: num(r.stock_actual).toFixed(2), Stock_minimo: num(r.stock_minimo).toFixed(2),
      Consumo_semanal: num(r.consumo_semanal).toFixed(2),
      Cobertura_sem: r.semanas_cobertura >= 999 ? "—" : num(r.semanas_cobertura).toFixed(2),
      Estado: String(r.estado_ui || r.estado || "").toUpperCase(),
      Pedido_sugerido: r.pedido_pendiente ? "YA PEDIDO" : (num(r.pedido_sugerido) > 0 ? num(r.pedido_sugerido).toFixed(2) : "—"),
    }));
    descargarCSV(filas, `inventario_maderas_${hoy}.csv`);
  }

  function copiarListaCompra() {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(["LISTA DE COMPRA", ...listaCompra].join("\n"));
      setMsg("✅ Lista copiada");
      setTimeout(() => setMsg(""), 1500);
    } else { setMsg("⚠️ No soportado en este navegador"); }
  }

  const TH = { padding: "8px 12px", textAlign: "left", fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: C.t2, fontWeight: 700, borderBottom: `1px solid ${C.b0}`, whiteSpace: "nowrap" };
  const TD = { padding: "9px 12px", fontSize: 12, borderBottom: `1px solid rgba(255,255,255,0.03)`, color: C.t1 };

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
        @keyframes slideUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fadeIn  { from{opacity:0} to{opacity:1} }
        @keyframes kpiPulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(1.3)} }
        button:not([disabled]):hover { opacity: 0.8; }
        .bg-glow {
          position: fixed; inset: 0; pointer-events: none; z-index: 0;
          background: radial-gradient(ellipse 70% 38% at 50% -6%, rgba(59,130,246,0.06) 0%, transparent 65%),
                      radial-gradient(ellipse 40% 28% at 92% 88%, rgba(245,158,11,0.02) 0%, transparent 55%);
        }
        tr:hover td { background: rgba(255,255,255,0.015); }
        .kpi-card { transition: transform .18s, box-shadow .3s; }
        .kpi-card:hover { transform: translateY(-2px); }
      `}</style>
      <div className="bg-glow" />

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", height: "100vh", overflow: "hidden", position: "relative", zIndex: 1 }}>
        <Sidebar profile={profile} signOut={signOut} />

        <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
          {/* ── TOPBAR ── */}
          <div style={{
            height: 50, background: "rgba(12,12,14,0.92)", ...GLASS,
            borderBottom: `1px solid ${C.b0}`, padding: "0 18px",
            display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
          }}>
            <div style={{ display: "flex", gap: 7, flex: 1 }}>
              {[
                { label: "OK",       n: stats.ok, ...ESTADO_META.OK       },
                { label: "Atención", n: stats.at, ...ESTADO_META.ATENCION },
                { label: "Crítico",  n: stats.cr, ...ESTADO_META.CRITICO  },
                { label: "Pedido",   n: stats.pe, ...ESTADO_META.PEDIDO   },
              ].map(({ label, n, color, bg, border }) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 7, background: bg, border: `1px solid ${border}`, borderLeft: `2px solid ${color}` }}>
                  <span style={{ fontFamily: C.mono, fontSize: 15, fontWeight: 700, color, lineHeight: 1 }}>{n}</span>
                  <span style={{ fontSize: 8, color: C.t1, letterSpacing: 2, textTransform: "uppercase" }}>{label}</span>
                </div>
              ))}
            </div>
            <button onClick={cargar} style={{ border: `1px solid ${C.b0}`, background: "transparent", color: C.t2, padding: "5px 10px", borderRadius: 7, cursor: "pointer", fontFamily: C.sans, fontSize: 11 }}>↻</button>
            <button onClick={() => setShowModal(true)} style={{ border: "1px solid rgba(59,130,246,0.35)", background: "rgba(59,130,246,0.15)", color: "#60a5fa", padding: "7px 16px", borderRadius: 8, cursor: "pointer", fontFamily: C.sans, fontSize: 12, fontWeight: 600 }}>+ Material</button>
          </div>

          {/* ── FILTERBAR ── */}
          <div style={{
            height: 42, background: "rgba(12,12,14,0.85)", ...GLASS,
            borderBottom: `1px solid ${C.b0}`, padding: "0 18px",
            display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
          }}>
            <input
              style={{ ...INP, width: 260, padding: "5px 10px", fontSize: 11 }}
              placeholder="Buscar material o categoría…"
              value={q} onChange={e => setQ(e.target.value)}
            />
            <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11, color: C.t2, cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}>
              <input type="checkbox" checked={soloNoOk} onChange={e => setSoloNoOk(e.target.checked)} style={{ accentColor: C.amber }} />
              Solo no OK
            </label>
            <div style={{ flex: 1 }} />
            <button
              onClick={exportarInventario} disabled={!filtrados.length}
              style={{
                border: filtrados.length ? "1px solid rgba(16,185,129,0.28)" : `1px solid ${C.b0}`,
                background: filtrados.length ? "rgba(16,185,129,0.07)" : "transparent",
                color: filtrados.length ? "#34d399" : C.t2,
                padding: "5px 12px", borderRadius: 7, cursor: filtrados.length ? "pointer" : "not-allowed",
                fontFamily: C.sans, fontSize: 11,
              }}
            >↓ CSV <span style={{ fontFamily: C.mono, opacity: 0.7 }}>({filtrados.length})</span></button>
            <button
              onClick={copiarListaCompra} disabled={!listaCompra.length}
              style={{
                border: listaCompra.length ? "1px solid rgba(245,158,11,0.28)" : `1px solid ${C.b0}`,
                background: listaCompra.length ? "rgba(245,158,11,0.07)" : "transparent",
                color: listaCompra.length ? "#fbbf24" : C.t2,
                padding: "5px 12px", borderRadius: 7, cursor: listaCompra.length ? "pointer" : "not-allowed",
                fontFamily: C.sans, fontSize: 11,
              }}
            >📋 Lista compra <span style={{ fontFamily: C.mono, opacity: 0.7 }}>({listaCompra.length})</span></button>
          </div>

          {/* ── MAIN ── */}
          <div style={{ flex: 1, overflow: "auto", padding: "16px 22px" }}>
            {error && <div style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171", fontSize: 12, marginBottom: 10 }}>{error}</div>}
            {msg   && <div style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)", color: "#34d399", fontSize: 12, marginBottom: 10 }}>{msg}</div>}

            {/* KPIs */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr) 220px", gap: 12, marginBottom: 16 }}>
              <KpiCard label="OK"       value={stats.ok} total={stats.total} color={C.green}   bg="rgba(16,185,129,0.04)"  border="rgba(16,185,129,0.12)" icon="✦" delay={0} />
              <KpiCard label="Atención" value={stats.at} total={stats.total} color={C.amber}   bg="rgba(245,158,11,0.04)"  border="rgba(245,158,11,0.12)" icon="◈" delay={60} />
              <KpiCard label="Crítico"  value={stats.cr} total={stats.total} color={C.red}     bg="rgba(239,68,68,0.04)"   border="rgba(239,68,68,0.12)"  icon="⬡" delay={120} pulse />
              <KpiCard label="Pedido"   value={stats.pe} total={stats.total} color="#93c5fd"   bg="rgba(59,130,246,0.04)"  border="rgba(59,130,246,0.12)" icon="⊕" delay={180} />

              {/* SALUD PANEL */}
              <div className="kpi-card" style={{
                background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 14, padding: "16px 18px",
                display: "flex", flexDirection: "column", gap: 10,
                animation: "slideUp .35s cubic-bezier(.22,1,.36,1) 240ms both",
                position: "relative", overflow: "hidden",
              }}>
                <div style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: C.t2, fontWeight: 700 }}>Salud stock</div>

                {/* Big pct */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontFamily: C.mono, fontSize: 36, fontWeight: 700, lineHeight: 1, color: stats.ok === stats.total && stats.total > 0 ? C.green : C.t0 }}>
                      <AnimatedNumber value={stats.total > 0 ? Math.round(stats.ok/stats.total*100) : 0} duration={1100} />
                      <span style={{ fontSize: 18, fontWeight: 400, color: C.t2, marginLeft: 2 }}>%</span>
                    </div>
                    <div style={{ fontSize: 9, color: C.t2, marginTop: 4, fontFamily: C.mono }}>{stats.total} materiales</div>
                  </div>

                  {/* SVG donut */}
                  {stats.total > 0 && (() => {
                    const S = 52, r = 21, circ = 2 * Math.PI * r;
                    const dOk = (stats.ok / stats.total) * circ;
                    const dAt = (stats.at / stats.total) * circ;
                    const dCr = (stats.cr / stats.total) * circ;
                    const oAt = dOk;
                    const oCr = dOk + dAt;
                    return (
                      <svg width={S} height={S} style={{ transform: "rotate(-90deg)", flexShrink: 0 }}>
                        <circle cx={S/2} cy={S/2} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={4} />
                        {dOk > 0 && <circle cx={S/2} cy={S/2} r={r} fill="none" stroke={C.green} strokeWidth={4}
                          strokeDasharray={`${dOk} ${circ}`} strokeDashoffset={0}
                          style={{ transition: "stroke-dasharray 1.4s cubic-bezier(.22,1,.36,1)", filter: `drop-shadow(0 0 3px ${C.green}99)` }} />}
                        {dAt > 0 && <circle cx={S/2} cy={S/2} r={r} fill="none" stroke={C.amber} strokeWidth={4}
                          strokeDasharray={`${dAt} ${circ}`} strokeDashoffset={-oAt}
                          style={{ transition: "stroke-dasharray 1.4s cubic-bezier(.22,1,.36,1) .1s", filter: `drop-shadow(0 0 3px ${C.amber}99)` }} />}
                        {dCr > 0 && <circle cx={S/2} cy={S/2} r={r} fill="none" stroke={C.red} strokeWidth={4}
                          strokeDasharray={`${dCr} ${circ}`} strokeDashoffset={-oCr}
                          style={{ transition: "stroke-dasharray 1.4s cubic-bezier(.22,1,.36,1) .2s", filter: `drop-shadow(0 0 5px ${C.red}cc)`, animation: stats.cr > 0 ? "kpiPulse 2s ease infinite" : "none" }} />}
                      </svg>
                    );
                  })()}
                </div>

                {/* Segmented bar */}
                <div style={{ height: 3, borderRadius: 99, overflow: "hidden", display: "flex" }}>
                  {stats.total > 0 && <>
                    <div style={{ height: "100%", width: `${stats.ok/stats.total*100}%`, background: C.green, transition: "width 1.4s cubic-bezier(.22,1,.36,1)", boxShadow: `0 0 6px ${C.green}88` }} />
                    <div style={{ height: "100%", width: `${stats.at/stats.total*100}%`, background: C.amber, transition: "width 1.4s cubic-bezier(.22,1,.36,1) .1s", boxShadow: `0 0 6px ${C.amber}88` }} />
                    <div style={{ height: "100%", width: `${stats.cr/stats.total*100}%`, background: C.red, transition: "width 1.4s cubic-bezier(.22,1,.36,1) .2s", boxShadow: `0 0 6px ${C.red}88` }} />
                  </>}
                </div>

                {/* Legend */}
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {[
                    { label: "OK",       n: stats.ok, c: C.green },
                    { label: "Atención", n: stats.at, c: C.amber },
                    { label: "Crítico",  n: stats.cr, c: C.red   },
                  ].map(({ label, n, c }) => (
                    <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <div style={{ width: 5, height: 5, borderRadius: "50%", background: c, boxShadow: `0 0 4px ${c}88` }} />
                        <span style={{ fontSize: 9, color: C.t2, letterSpacing: 1, textTransform: "uppercase" }}>{label}</span>
                      </div>
                      <span style={{ fontFamily: C.mono, fontSize: 10, fontWeight: 700, color: n > 0 ? c : C.t2 }}>{n}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Materiales críticos chips */}
            {stats.cr > 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14, animation: "fadeIn .4s ease .3s both" }}>
                <span style={{ fontSize: 9, color: C.t2, letterSpacing: 2, textTransform: "uppercase", alignSelf: "center", marginRight: 2 }}>CRÍTICO</span>
                {rows.filter(r => String(r.estado_ui || r.estado || "").toUpperCase() === "CRITICO").slice(0, 10).map((r, i) => (
                  <div key={r.id} style={{
                    padding: "3px 10px", borderRadius: 99,
                    background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.18)",
                    fontSize: 10, color: "#f87171", animation: `fadeIn .3s ease ${i*35}ms both`,
                    display: "flex", alignItems: "center", gap: 5,
                  }}>
                    <span style={{ width: 4, height: 4, borderRadius: "50%", background: C.red, display: "inline-block", animation: "kpiPulse 1.5s ease infinite" }} />
                    {r.nombre}
                  </div>
                ))}
                {stats.cr > 10 && <div style={{ padding: "3px 10px", borderRadius: 99, background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.10)", fontSize: 10, color: C.t2 }}>+{stats.cr-10} más</div>}
              </div>
            )}

            {/* Tabla */}
            <div style={{ background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 12, overflow: "hidden", animation: "slideUp .3s ease" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Material", "Categoría", "Estado", "Stock", "Mínimo", "Consumo / sem", "Cobertura", "Pedido sugerido"].map(h => (
                      <th key={h} style={TH}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map(r => {
                    const st = String(r.estado_ui || r.estado || "").toUpperCase();
                    return (
                      <tr key={r.id}>
                        <td style={TD}>
                          <div style={{ color: C.t0, fontWeight: 600, fontSize: 12 }}>{r.nombre}</div>
                          <div style={{ fontSize: 10, color: C.t2, marginTop: 1 }}>{r.unidad_medida}</div>
                        </td>
                        <td style={{ ...TD, fontSize: 10, color: C.t2 }}>{r.categoria || "—"}</td>
                        <td style={TD}><EstadoChip estado={st} /></td>
                        <td style={{ ...TD, fontFamily: C.mono, fontWeight: 600, color: C.t0 }}>{num(r.stock_actual).toFixed(2)}</td>
                        <td style={{ ...TD, fontFamily: C.mono, color: C.t2 }}>{num(r.stock_minimo).toFixed(2)}</td>
                        <td style={{ ...TD, fontFamily: C.mono, color: C.t2 }}>{num(r.consumo_semanal).toFixed(2)}</td>
                        <td style={{ ...TD, fontFamily: C.mono, color: C.t2 }}>
                          {r.semanas_cobertura >= 999 ? <span style={{ opacity: 0.3 }}>—</span> : num(r.semanas_cobertura).toFixed(2)}
                        </td>
                        <td style={TD}>
                          {r.pedido_pendiente ? (
                            <span style={{ fontSize: 10, color: "#93c5fd", fontWeight: 700 }}>YA PEDIDO</span>
                          ) : num(r.pedido_sugerido) > 0 ? (
                            <span style={{ fontFamily: C.mono, fontWeight: 700, color: C.amber }}>{num(r.pedido_sugerido).toFixed(2)}</span>
                          ) : (
                            <span style={{ opacity: 0.3 }}>—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {!filtrados.length && (
                    <tr>
                      <td colSpan={8} style={{ ...TD, textAlign: "center", padding: "40px", color: C.t2, fontSize: 11 }}>
                        Sin resultados para la búsqueda actual
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* ── MODAL NUEVO MATERIAL ── */}
      {showModal && (
        <div
          onClick={e => e.target === e.currentTarget && setShowModal(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 9000,
            background: "rgba(0,0,0,0.85)", backdropFilter: "blur(32px)",
            display: "flex", justifyContent: "center", alignItems: "center",
            animation: "fadeIn .15s ease",
          }}
        >
          <div style={{ background: "#0d0d10", border: `1px solid ${C.b1}`, borderRadius: 14, padding: 28, width: "min(440px,92vw)", position: "relative" }}>
            <button
              onClick={() => setShowModal(false)}
              style={{ position: "absolute", top: 14, right: 14, background: C.s0, border: `1px solid ${C.b0}`, color: C.t0, width: 28, height: 28, borderRadius: "50%", cursor: "pointer", fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center" }}
            >×</button>
            <div style={{ fontSize: 9, letterSpacing: 2, color: C.t2, textTransform: "uppercase", marginBottom: 4 }}>Nuevo material</div>
            <h2 style={{ margin: "0 0 20px", fontSize: 16, color: C.t0 }}>Alta de Material</h2>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 9, letterSpacing: 2, color: C.t2, display: "block", marginBottom: 5, textTransform: "uppercase", fontWeight: 600 }}>Nombre</label>
              <input style={INP} value={newMat.nombre} onChange={e => setNewMat({ ...newMat, nombre: e.target.value })} placeholder="Ej: Tablón Cedro" autoFocus />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 9, letterSpacing: 2, color: C.t2, display: "block", marginBottom: 5, textTransform: "uppercase", fontWeight: 600 }}>Categoría</label>
                <input style={INP} value={newMat.categoria} onChange={e => setNewMat({ ...newMat, categoria: e.target.value })} />
              </div>
              <div>
                <label style={{ fontSize: 9, letterSpacing: 2, color: C.t2, display: "block", marginBottom: 5, textTransform: "uppercase", fontWeight: 600 }}>Unidad</label>
                <select style={{ ...INP, cursor: "pointer" }} value={newMat.unidad_medida} onChange={e => setNewMat({ ...newMat, unidad_medida: e.target.value })}>
                  <option value="u">Unidad (u)</option>
                  <option value="m">Metros (m)</option>
                  <option value="m2">m²</option>
                  <option value="kg">Kilos (kg)</option>
                  <option value="l">Litros (l)</option>
                  <option value="ft">Pies (ft)</option>
                </select>
              </div>
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 9, letterSpacing: 2, color: C.t2, display: "block", marginBottom: 5, textTransform: "uppercase", fontWeight: 600 }}>Stock mínimo (alerta)</label>
              <input type="number" style={INP} value={newMat.stock_minimo} onChange={e => setNewMat({ ...newMat, stock_minimo: e.target.value })} />
            </div>

            <button
              onClick={crearMaterial}
              style={{ width: "100%", padding: "11px", border: "1px solid rgba(59,130,246,0.35)", background: "rgba(59,130,246,0.15)", color: "#60a5fa", fontWeight: 700, borderRadius: 10, cursor: "pointer", fontFamily: C.sans, fontSize: 13, marginBottom: 8 }}
            >Guardar material</button>
            <button
              onClick={() => setShowModal(false)}
              style={{ width: "100%", padding: "11px", border: `1px solid ${C.b0}`, background: "transparent", color: C.t2, borderRadius: 10, cursor: "pointer", fontFamily: C.sans, fontSize: 12 }}
            >Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}
