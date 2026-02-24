import { useEffect, useMemo, useState } from "react";
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

function KpiCard({ label, value, color, bg, border }) {
  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 10, padding: "12px 16px", borderLeft: `2px solid ${color}` }}>
      <div style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: C.t2, marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: C.mono, fontSize: 24, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
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
    <div style={{ background: C.bg, minHeight: "100vh", color: C.t0, fontFamily: C.sans }}>
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
        button:not([disabled]):hover { opacity: 0.8; }
        .bg-glow {
          position: fixed; inset: 0; pointer-events: none; z-index: 0;
          background: radial-gradient(ellipse 70% 38% at 50% -6%, rgba(59,130,246,0.06) 0%, transparent 65%),
                      radial-gradient(ellipse 40% 28% at 92% 88%, rgba(245,158,11,0.02) 0%, transparent 55%);
        }
        tr:hover td { background: rgba(255,255,255,0.015); }
      `}</style>
      <div className="bg-glow" />

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", minHeight: "100vh", position: "relative", zIndex: 1 }}>
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
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 16 }}>
              <KpiCard label="OK"       value={stats.ok} color={C.green}   bg="rgba(16,185,129,0.06)"  border="rgba(16,185,129,0.15)" />
              <KpiCard label="Atención" value={stats.at} color={C.amber}   bg="rgba(245,158,11,0.06)"  border="rgba(245,158,11,0.15)" />
              <KpiCard label="Crítico"  value={stats.cr} color={C.red}     bg="rgba(239,68,68,0.06)"   border="rgba(239,68,68,0.15)"  />
              <KpiCard label="Pedido"   value={stats.pe} color="#93c5fd"   bg="rgba(59,130,246,0.06)"  border="rgba(59,130,246,0.15)" />
            </div>

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
