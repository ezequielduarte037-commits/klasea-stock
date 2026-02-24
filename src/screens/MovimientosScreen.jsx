import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import Sidebar from "../components/Sidebar";

// ─── PALETA ──────────────────────────────────────────────────────────────────
const C = {
  bg:   "#09090b",
  s0:   "rgba(255,255,255,0.03)",
  s1:   "rgba(255,255,255,0.06)",
  b0:   "rgba(255,255,255,0.08)",
  b1:   "rgba(255,255,255,0.15)",
  t0:   "#f4f4f5",
  t1:   "#a1a1aa",
  t2:   "#71717a",
  mono: "'JetBrains Mono', 'IBM Plex Mono', monospace",
  sans: "'Outfit', system-ui, sans-serif",
  green: "#10b981",
  red:   "#ef4444",
};
const GLASS = {
  backdropFilter: "blur(32px) saturate(130%)",
  WebkitBackdropFilter: "blur(32px) saturate(130%)",
};

function num(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}
function fmt(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// ── CSV Export ────────────────────────────────────────────────────────────────
function descargarCSV(filas, nombre) {
  if (!filas.length) return;
  const cols = Object.keys(filas[0]);
  const esc  = v => {
    const s = v == null ? "" : String(v);
    return (s.includes(",") || s.includes('"') || s.includes("\n"))
      ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [cols.map(esc).join(","), ...filas.map(r => cols.map(k => esc(r[k])).join(","))].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  Object.assign(document.createElement("a"), { href: url, download: nombre }).click();
  URL.revokeObjectURL(url);
}

// ─── Columnas de la tabla ─────────────────────────────────────────────────────
const COLS = "180px 1.4fr 80px 110px 160px 110px 1fr";

export default function MovimientosScreen({ profile, signOut }) {
  const [rows, setRows] = useState([]);
  const [q,   setQ]    = useState("");
  const [err, setErr]  = useState("");

  async function cargar() {
    setErr("");
    const r = await supabase
      .from("movimientos_ui")
      .select("id,created_at,delta,obra,usuario,entregado_por,proveedor,recibe,obs_ui,material_nombre")
      .order("created_at", { ascending: false })
      .limit(200);

    if (!r.error) { setRows(r.data ?? []); return; }

    // Fallback a tabla original
    const r2 = await supabase
      .from("movimientos")
      .select("id,created_at,delta,obra,usuario,entregado_por,proveedor,recibe,obs,material_id")
      .order("created_at", { ascending: false })
      .limit(200);

    if (r2.error) return setErr(r2.error.message);

    const mats = await supabase.from("materiales").select("id,nombre");
    const map  = new Map((mats.data ?? []).map(m => [m.id, m.nombre]));
    setRows((r2.data ?? []).map(m => ({ ...m, obs_ui: m.obs ?? null, material_nombre: map.get(m.material_id) ?? "—" })));
  }

  useEffect(() => {
    cargar();
    const ch = supabase
      .channel("rt-movs")
      .on("postgres_changes", { event: "*", schema: "public", table: "movimientos" }, cargar)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const filtrados = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return rows;
    return rows.filter(r => {
      const s = [r.material_nombre, r.obra, r.usuario, r.proveedor, r.entregado_por, r.recibe, r.obs_ui]
        .filter(Boolean).join(" ").toLowerCase();
      return s.includes(qq);
    });
  }, [rows, q]);

  function exportarMovimientos() {
    const hoy = new Date().toLocaleDateString("es-AR").replace(/[/]/g, "-");
    const filas = filtrados.map(r => ({
      Fecha:         new Date(r.created_at).toLocaleDateString("es-AR"),
      Hora:          new Date(r.created_at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }),
      Tipo:          num(r.delta) >= 0 ? "Ingreso" : "Egreso",
      Material:      r.material_nombre ?? "—",
      Cantidad:      Math.abs(num(r.delta)),
      Obra:          r.obra ?? "—",
      Persona:       r.usuario ?? r.proveedor ?? "—",
      Panol:         r.entregado_por ?? r.recibe ?? "—",
      Observaciones: r.obs_ui ?? "—",
    }));
    descargarCSV(filas, `movimientos_${hoy}.csv`);
  }

  // Totales rápidos
  const ingresos  = rows.filter(r => num(r.delta) > 0).length;
  const egresos   = rows.filter(r => num(r.delta) < 0).length;

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.t0, fontFamily: C.sans }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        select option { background: #0f0f12; color: #a1a1aa; }
        ::-webkit-scrollbar { width: 3px; height: 3px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.07); border-radius: 99px; }
        input:focus { border-color: rgba(59,130,246,0.35) !important; outline: none; }
        button:not([disabled]):hover { opacity: 0.8; }
        .bg-glow {
          position: fixed; inset: 0; pointer-events: none; z-index: 0;
          background:
            radial-gradient(ellipse 70% 38% at 50% -6%, rgba(59,130,246,0.07) 0%, transparent 65%),
            radial-gradient(ellipse 40% 28% at 92% 88%, rgba(245,158,11,0.02) 0%, transparent 55%);
        }
        .mov-row:hover { background: rgba(255,255,255,0.025) !important; }
      `}</style>
      <div className="bg-glow" />

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", minHeight: "100vh", position: "relative", zIndex: 1 }}>
        <Sidebar profile={profile} signOut={signOut} />

        <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>

          {/* ── TOPBAR ── */}
          <div style={{
            height: 50, background: "rgba(12,12,14,0.92)", ...GLASS,
            borderBottom: `1px solid ${C.b0}`, padding: "0 18px",
            display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.t0 }}>Movimientos</div>
              <div style={{ fontSize: 9, color: C.t2, letterSpacing: 1.5, textTransform: "uppercase", marginTop: 1 }}>
                Historial de stock
              </div>
            </div>

            {[
              { label: "Ingresos", val: ingresos, color: C.green  },
              { label: "Egresos",  val: egresos,  color: C.red    },
              { label: "Total",    val: rows.length, color: C.t1  },
            ].map(s => (
              <div key={s.label} style={{
                display: "flex", alignItems: "center", gap: 5, padding: "4px 10px",
                borderRadius: 7, background: C.s0, border: `1px solid ${C.b0}`,
                borderLeft: `2px solid ${s.color}`,
              }}>
                <span style={{ fontFamily: C.mono, fontSize: 15, fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.val}</span>
                <span style={{ fontSize: 8, color: C.t1, letterSpacing: 1.5, textTransform: "uppercase" }}>{s.label}</span>
              </div>
            ))}

            <button
              onClick={exportarMovimientos}
              disabled={!filtrados.length}
              style={{
                border: filtrados.length ? "1px solid rgba(16,185,129,0.3)" : `1px solid ${C.b0}`,
                background: filtrados.length ? "rgba(16,185,129,0.08)" : "transparent",
                color: filtrados.length ? C.green : C.t2,
                padding: "6px 14px", borderRadius: 8,
                cursor: filtrados.length ? "pointer" : "not-allowed",
                fontSize: 11, fontFamily: C.sans, fontWeight: 600,
                display: "flex", alignItems: "center", gap: 5,
              }}
            >
              ↓ CSV
              <span style={{ fontSize: 9, opacity: 0.7 }}>
                {filtrados.length !== rows.length ? `${filtrados.length}` : `${rows.length}`}
              </span>
            </button>
          </div>

          {/* ── SEARCH BAR ── */}
          <div style={{
            height: 44, background: "rgba(12,12,14,0.85)", ...GLASS,
            borderBottom: `1px solid ${C.b0}`, padding: "0 18px",
            display: "flex", alignItems: "center", flexShrink: 0,
          }}>
            <input
              style={{
                background: "transparent", border: "none",
                color: C.t0, fontSize: 12, fontFamily: C.sans,
                outline: "none", width: "100%", maxWidth: 500,
              }}
              placeholder="⌕  Buscar por material / obra / persona / pañol / proveedor…"
              value={q}
              onChange={e => setQ(e.target.value)}
            />
            {q && (
              <button onClick={() => setQ("")} style={{
                background: "transparent", border: "none", color: C.t2,
                cursor: "pointer", fontSize: 16, padding: "0 4px",
              }}>×</button>
            )}
          </div>

          {/* ── TABLE ── */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {err && (
              <div style={{ padding: "10px 18px", color: C.red, fontSize: 12 }}>ERROR: {err}</div>
            )}

            {/* Header */}
            <div style={{
              display: "grid", gridTemplateColumns: COLS, gap: 10,
              padding: "10px 18px",
              background: "rgba(6,6,8,0.8)",
              borderBottom: `1px solid ${C.b0}`,
              position: "sticky", top: 0, zIndex: 10,
            }}>
              {["FECHA", "MATERIAL", "DELTA", "OBRA", "PERSONA / PROV", "PAÑOL", "OBS"].map(h => (
                <div key={h} style={{ fontSize: 9, color: C.t2, letterSpacing: 2, textTransform: "uppercase" }}>
                  {h}
                </div>
              ))}
            </div>

            {filtrados.slice(0, 200).map(r => {
              const d = num(r.delta);
              return (
                <div key={r.id} className="mov-row" style={{
                  display: "grid", gridTemplateColumns: COLS, gap: 10,
                  padding: "12px 18px",
                  borderBottom: `1px solid rgba(255,255,255,0.04)`,
                  alignItems: "center",
                }}>
                  <div style={{ fontFamily: C.mono, fontSize: 11, color: C.t2 }}>{fmt(r.created_at)}</div>
                  <div style={{ color: C.t0, fontWeight: 600, fontSize: 12 }}>{r.material_nombre || "—"}</div>
                  <div style={{
                    fontFamily: C.mono, fontWeight: 700, fontSize: 13,
                    color: d >= 0 ? C.green : C.red,
                  }}>
                    {d >= 0 ? "+" : ""}{d}
                  </div>
                  <div style={{ fontSize: 11, color: C.t1 }}>{r.obra || "—"}</div>
                  <div style={{ fontSize: 11, color: C.t1 }}>{r.usuario || r.proveedor || "—"}</div>
                  <div style={{ fontSize: 11, color: C.t1 }}>{r.entregado_por || r.recibe || "—"}</div>
                  <div style={{ fontSize: 11, color: C.t2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.obs_ui || "—"}
                  </div>
                </div>
              );
            })}

            {!filtrados.length && (
              <div style={{ padding: 40, textAlign: "center", color: C.t2, fontSize: 12 }}>
                No hay movimientos.
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
