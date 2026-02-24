import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import Sidebar from "../components/Sidebar";

// --- FUNCIONES AUXILIARES ---
function num(v) { const x = Number(v); return Number.isFinite(x) ? x : 0; }
function fmt(ts) { if (!ts) return "—"; return new Date(ts).toLocaleString("es-AR"); }

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

function Btn({ onClick, children, variant = "outline", disabled = false, style = {} }) {
  const V = {
    outline: { border: `1px solid ${C.b0}`, background: C.s0, color: C.t0, padding: "6px 14px", borderRadius: 8, fontSize: 12 },
    primary: { border: "1px solid rgba(59,130,246,0.35)", background: "rgba(59,130,246,0.15)", color: "#60a5fa", padding: "7px 18px", borderRadius: 8, fontSize: 12, fontWeight: 600 },
    green:   { border: "1px solid rgba(16,185,129,0.3)", background: "rgba(16,185,129,0.08)", color: "#34d399", padding: "6px 14px", borderRadius: 8, fontSize: 12 },
    blue:    { border: "1px solid rgba(59,130,246,0.25)", background: "rgba(59,130,246,0.07)", color: "#93c5fd", padding: "6px 14px", borderRadius: 8, fontSize: 12 },
    toggle:  (active) => active
      ? { border: `1px solid ${C.b1}`, background: C.s1, color: C.t0, padding: "5px 14px", borderRadius: 6, fontSize: 11, fontWeight: 600 }
      : { border: "1px solid rgba(255,255,255,0.04)", background: "transparent", color: C.t2, padding: "5px 14px", borderRadius: 6, fontSize: 11 },
  };
  const base = typeof V[variant] === "function" ? V[variant](style._active) : V[variant];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        fontFamily: C.sans,
        transition: "opacity .15s",
        ...base, ...style,
      }}
    >
      {children}
    </button>
  );
}

function FieldRow({ label, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ fontSize: 9, letterSpacing: 2, color: C.t2, display: "block", marginBottom: 5, textTransform: "uppercase", fontWeight: 600 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

export default function PanolScreen({ profile, signOut }) {
  const [modo, setModo] = useState("EGRESO");
  const [materiales, setMateriales] = useState([]);
  const [movs, setMovs] = useState([]);
  const [q, setQ] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [cantidadRevisada, setCantidadRevisada] = useState(false);
  const [obra, setObra] = useState("");
  const [retira, setRetira] = useState("");
  const [entrega, setEntrega] = useState("");
  const [proveedor, setProveedor] = useState("");
  const [recibe, setRecibe] = useState("");
  const [obs, setObs] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [exportando, setExportando] = useState(false);

  async function cargarMateriales() {
    const { data, error } = await supabase
      .from("materiales")
      .select("id,nombre,categoria,unidad_medida,stock_actual,stock_minimo")
      .order("nombre", { ascending: true });
    if (error) return setErr(error.message);
    setMateriales(data ?? []);
    if (!materialId && (data ?? []).length) setMaterialId(data[0].id);
  }

  async function cargarMovs() {
    const r = await supabase
      .from("movimientos_ui")
      .select("id,created_at,delta,obra,usuario,entregado_por,proveedor,recibe,obs_ui,material_nombre")
      .order("created_at", { ascending: false })
      .limit(12);
    if (!r.error) { setMovs(r.data ?? []); return; }
    const r2 = await supabase
      .from("movimientos")
      .select("id,created_at,delta,obra,usuario,entregado_por,proveedor,recibe,obs,material_id")
      .order("created_at", { ascending: false })
      .limit(12);
    if (r2.error) return setErr(r2.error.message);
    const mats = await supabase.from("materiales").select("id,nombre");
    const map = new Map((mats.data ?? []).map(m => [m.id, m.nombre]));
    setMovs((r2.data ?? []).map(m => ({ ...m, obs_ui: m.obs ?? null, material_nombre: map.get(m.material_id) ?? "—" })));
  }

  useEffect(() => {
    cargarMateriales();
    cargarMovs();
    const ch1 = supabase.channel("rt-pan-materiales").on("postgres_changes", { event: "*", schema: "public", table: "materiales" }, cargarMateriales).subscribe();
    const ch2 = supabase.channel("rt-pan-movs").on("postgres_changes", { event: "*", schema: "public", table: "movimientos" }, cargarMovs).subscribe();
    return () => { supabase.removeChannel(ch1); supabase.removeChannel(ch2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtrados = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return materiales;
    return materiales.filter(m => (m.nombre ?? "").toLowerCase().includes(qq) || (m.categoria ?? "").toLowerCase().includes(qq));
  }, [q, materiales]);

  const sel = useMemo(() => materiales.find(m => m.id === materialId), [materialId, materiales]);

  useEffect(() => {
    if (filtrados.length > 0) {
      const valid = filtrados.find(m => m.id === materialId);
      if (!valid) setMaterialId(filtrados[0].id);
    }
  }, [filtrados, materialId]);

  async function exportarStockMaderas() {
    const hoy = new Date().toLocaleDateString("es-AR").replace(/[/]/g, "-");
    const filas = materiales.map(m => ({
      Material: m.nombre, Categoria: m.categoria ?? "—", Unidad: m.unidad_medida ?? "—",
      Stock_actual: num(m.stock_actual), Stock_minimo: num(m.stock_minimo),
      Estado: num(m.stock_actual) <= 0 ? "CRÍTICO" : num(m.stock_actual) <= num(m.stock_minimo) ? "ATENCIÓN" : "OK",
    }));
    descargarCSV(filas, `stock_maderas_${hoy}.csv`);
  }

  async function exportarMovimientosMaderas() {
    setExportando(true);
    const hoy = new Date().toLocaleDateString("es-AR").replace(/[/]/g, "-");
    const r = await supabase.from("movimientos_ui").select("id,created_at,delta,obra,usuario,entregado_por,proveedor,recibe,obs_ui,material_nombre").order("created_at", { ascending: false });
    const datos = r.data ?? movs;
    const mats = await supabase.from("materiales").select("id,nombre");
    const matMap = new Map((mats.data ?? []).map(m => [m.id, m.nombre]));
    const filas = datos.map(m => ({
      Fecha: new Date(m.created_at).toLocaleDateString("es-AR"),
      Hora: new Date(m.created_at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }),
      Tipo: num(m.delta) >= 0 ? "Ingreso" : "Egreso",
      Material: m.material_nombre ?? matMap.get(m.material_id) ?? "—",
      Cantidad: Math.abs(num(m.delta)),
      Obra: m.obra ?? "—",
      Persona: m.usuario ?? "—",
      Panol: m.entregado_por ?? m.recibe ?? "—",
      Proveedor: m.proveedor ?? "—",
      Observaciones: m.obs_ui ?? "—",
    }));
    descargarCSV(filas, `movimientos_maderas_${hoy}.csv`);
    setExportando(false);
  }

  function limpiar() {
    setCantidad(""); setCantidadRevisada(false); setObra(""); setRetira(""); setEntrega("");
    setProveedor(""); setRecibe(""); setObs(""); setMsg(""); setErr("");
  }

  function ajustarCantidad(delta) {
    const actual = cantidad === "" ? 0 : num(cantidad);
    setCantidad(String(Math.max(0, actual + delta)));
    setCantidadRevisada(true);
  }

  async function confirmar(e) {
    e?.preventDefault?.();
    setErr(""); setMsg("");
    if (!materialId) return setErr("Seleccioná un material.");
    if (!obra.trim()) return setErr("Obra obligatoria.");
    if (!cantidadRevisada) return setErr("Revisá la cantidad.");
    if (cantidad === "" || num(cantidad) <= 0) return setErr("Cantidad inválida.");
    if (num(cantidad) === 1) { const ok = window.confirm("Cantidad = 1. ¿Confirmás que es correcto?"); if (!ok) return; }
    if (modo === "EGRESO") {
      if (!retira.trim()) return setErr("Falta nombre de quien retira.");
      if (!entrega.trim()) return setErr("Falta empleado de pañol (entrega).");
    } else {
      if (!proveedor.trim()) return setErr("Falta proveedor.");
      if (!recibe.trim()) return setErr("Falta quien recibe (pañol).");
    }
    const delta = modo === "EGRESO" ? -Math.abs(num(cantidad)) : Math.abs(num(cantidad));
    const rpc = await supabase.rpc("registrar_movimiento", {
      p_material_id: materialId, p_delta: delta, p_obra: obra.trim(),
      p_usuario: modo === "EGRESO" ? retira.trim() : null,
      p_entregado_por: modo === "EGRESO" ? entrega.trim() : null,
      p_proveedor: modo === "INGRESO" ? proveedor.trim() : null,
      p_recibe: modo === "INGRESO" ? recibe.trim() : null,
      p_obs: obs.trim() || null,
    });
    if (!rpc.error) { setMsg(`✅ Movimiento OK: ${sel?.nombre}`); limpiar(); await cargarMateriales(); await cargarMovs(); return; }
    const nuevoStock = num(sel?.stock_actual) + delta;
    const up = await supabase.from("materiales").update({ stock_actual: nuevoStock }).eq("id", materialId);
    if (up.error) return setErr("Error stock: " + up.error.message);
    const ins = await supabase.from("movimientos").insert({
      material_id: materialId, delta, obra: obra.trim(),
      usuario: modo === "EGRESO" ? retira.trim() : null,
      entregado_por: modo === "EGRESO" ? entrega.trim() : null,
      proveedor: modo === "INGRESO" ? proveedor.trim() : null,
      recibe: modo === "INGRESO" ? recibe.trim() : null,
      obs: obs.trim() || null,
    });
    if (ins.error) return setErr("Error guardar: " + ins.error.message);
    setMsg(`✅ Movimiento OK: ${sel?.nombre}`);
    limpiar();
    await cargarMateriales();
    await cargarMovs();
  }

  // ── Stock status del material seleccionado
  const stockStatus = useMemo(() => {
    if (!sel) return null;
    const s = num(sel.stock_actual);
    const m = num(sel.stock_minimo);
    if (s <= 0)   return { label: "Crítico",  color: C.red,     bg: "rgba(239,68,68,0.1)",   border: "rgba(239,68,68,0.25)"  };
    if (s <= m)   return { label: "Atención", color: C.amber,   bg: "rgba(245,158,11,0.1)",  border: "rgba(245,158,11,0.25)" };
    return              { label: "OK",        color: C.green,   bg: "rgba(16,185,129,0.1)",  border: "rgba(16,185,129,0.25)" };
  }, [sel]);

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.t0, fontFamily: C.sans }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        select option { background: #0f0f12; color: #a1a1aa; }
        ::-webkit-scrollbar { width: 3px; height: 3px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.07); border-radius: 99px; }
        input:focus, select:focus, textarea:focus { border-color: rgba(59,130,246,0.35) !important; outline: none; }
        @keyframes slideUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        button:not([disabled]):hover { opacity: 0.8; }
        .bg-glow {
          position: fixed; inset: 0; pointer-events: none; z-index: 0;
          background: radial-gradient(ellipse 70% 38% at 50% -6%, rgba(59,130,246,0.07) 0%, transparent 65%),
                      radial-gradient(ellipse 40% 28% at 92% 88%, rgba(245,158,11,0.02) 0%, transparent 55%);
        }
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
            <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.t0 }}>Pañol</div>
              <div style={{ width: 1, height: 14, background: C.b1 }} />
              <div style={{ fontSize: 10, color: C.t2, letterSpacing: 1 }}>Maderas</div>
              {/* Toggles modo */}
              <div style={{ marginLeft: 10, display: "flex", gap: 3, background: C.s0, borderRadius: 8, padding: 3, border: `1px solid ${C.b0}` }}>
                {["EGRESO","INGRESO"].map(m => (
                  <button key={m} onClick={() => setModo(m)} style={{
                    border: modo === m ? `1px solid ${C.b1}` : "1px solid transparent",
                    background: modo === m ? C.s1 : "transparent",
                    color: modo === m ? C.t0 : C.t2,
                    padding: "3px 12px", borderRadius: 6, cursor: "pointer",
                    fontSize: 10, fontWeight: modo === m ? 700 : 400,
                    letterSpacing: 1.5, textTransform: "uppercase", fontFamily: C.sans,
                  }}>{m}</button>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <Btn variant="green" onClick={exportarStockMaderas}>↓ Stock CSV</Btn>
              <Btn variant="blue" onClick={exportarMovimientosMaderas} disabled={exportando}>
                {exportando ? "Exportando…" : "↓ Movimientos CSV"}
              </Btn>
            </div>
          </div>

          {/* ── MAIN ── */}
          <div style={{ flex: 1, overflow: "auto", padding: "20px 22px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 14, alignItems: "start", maxWidth: 1100 }}>

              {/* ── FORMULARIO ── */}
              <div style={{ background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 12, padding: 20, animation: "slideUp .3s ease" }}>
                {/* Material selector con preview de stock */}
                <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: `1px solid ${C.b0}` }}>
                  <FieldRow label="Buscar material">
                    <input style={INP} value={q} onChange={e => setQ(e.target.value)} placeholder="Ej: Fibrofácil…" />
                  </FieldRow>
                  <FieldRow label="Material">
                    <select style={{ ...INP, cursor: "pointer" }} value={materialId} onChange={e => setMaterialId(e.target.value)}>
                      {filtrados.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                    </select>
                  </FieldRow>

                  {/* Material info card */}
                  {sel && (
                    <div style={{ marginTop: 8, padding: "10px 12px", borderRadius: 8, background: stockStatus?.bg, border: `1px solid ${stockStatus?.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: C.t0 }}>{sel.nombre}</div>
                        <div style={{ fontSize: 10, color: C.t1, marginTop: 1 }}>{sel.categoria} · {sel.unidad_medida}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontFamily: C.mono, fontSize: 18, fontWeight: 700, color: stockStatus?.color, lineHeight: 1 }}>{num(sel.stock_actual)}</div>
                        <div style={{ fontSize: 9, color: stockStatus?.color, letterSpacing: 1.5, textTransform: "uppercase", marginTop: 2 }}>{stockStatus?.label}</div>
                      </div>
                    </div>
                  )}
                </div>

                <FieldRow label="Obra">
                  <input style={INP} value={obra} onChange={e => setObra(e.target.value)} placeholder="Ej: K37…" />
                </FieldRow>

                {modo === "EGRESO" ? (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <FieldRow label="Retira">
                      <input style={INP} value={retira} onChange={e => setRetira(e.target.value)} />
                    </FieldRow>
                    <FieldRow label="Entrega (pañol)">
                      <input style={INP} value={entrega} onChange={e => setEntrega(e.target.value)} />
                    </FieldRow>
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <FieldRow label="Proveedor">
                      <input style={INP} value={proveedor} onChange={e => setProveedor(e.target.value)} />
                    </FieldRow>
                    <FieldRow label="Recibe (pañol)">
                      <input style={INP} value={recibe} onChange={e => setRecibe(e.target.value)} />
                    </FieldRow>
                  </div>
                )}

                <FieldRow label="Cantidad">
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input
                      style={{ ...INP, fontFamily: C.mono, fontSize: 14, textAlign: "center", flex: 1 }}
                      value={cantidad}
                      onChange={e => { setCantidad(e.target.value); setCantidadRevisada(true); }}
                      placeholder="0"
                    />
                    {[-10, -1, +1, +10].map(d => (
                      <button key={d} onClick={() => ajustarCantidad(d)} style={{
                        border: `1px solid ${C.b0}`, background: "transparent", color: C.t1,
                        padding: "7px 8px", borderRadius: 7, cursor: "pointer", fontSize: 11,
                        fontFamily: C.mono, fontWeight: 700, minWidth: 36,
                      }}>{d > 0 ? "+" : ""}{d}</button>
                    ))}
                  </div>
                  {!cantidadRevisada && (
                    <div style={{ marginTop: 5, fontSize: 10, color: C.amber, display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ width: 5, height: 5, borderRadius: "50%", background: C.amber, display: "inline-block" }} />
                      Revisá la cantidad antes de confirmar
                    </div>
                  )}
                </FieldRow>

                <FieldRow label="Observaciones">
                  <input style={INP} value={obs} onChange={e => setObs(e.target.value)} />
                </FieldRow>

                <div style={{ marginTop: 14, display: "flex", gap: 8, alignItems: "center" }}>
                  <button
                    onClick={confirmar}
                    style={{
                      flex: 1, padding: "10px",
                      background: modo === "EGRESO" ? "rgba(239,68,68,0.12)" : "rgba(16,185,129,0.12)",
                      border: modo === "EGRESO" ? "1px solid rgba(239,68,68,0.3)" : "1px solid rgba(16,185,129,0.3)",
                      color: modo === "EGRESO" ? "#f87171" : "#34d399",
                      borderRadius: 9, cursor: "pointer", fontFamily: C.sans,
                      fontSize: 13, fontWeight: 700, letterSpacing: 0.5,
                    }}
                  >
                    Confirmar {modo}
                  </button>
                  <button onClick={limpiar} style={{ border: `1px solid ${C.b0}`, background: "transparent", color: C.t2, padding: "10px 14px", borderRadius: 9, cursor: "pointer", fontFamily: C.sans, fontSize: 11 }}>
                    Limpiar
                  </button>
                </div>

                {msg && <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 7, background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)", color: "#34d399", fontSize: 12 }}>{msg}</div>}
                {err && <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 7, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171", fontSize: 12 }}>{err}</div>}
              </div>

              {/* ── MOVIMIENTOS ── */}
              <div style={{ background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 12, overflow: "hidden" }}>
                <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.b0}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: C.t0 }}>Últimos movimientos</span>
                  <span style={{ fontSize: 10, color: C.t2, fontFamily: C.mono }}>{movs.length}</span>
                </div>
                <div style={{ padding: "0 0 4px" }}>
                  {movs.map(m => {
                    const esIng = num(m.delta) >= 0;
                    return (
                      <div key={m.id} style={{ padding: "10px 16px", borderBottom: `1px solid rgba(255,255,255,0.03)` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: C.t0, flex: 1, lineHeight: 1.3 }}>{m.material_nombre}</div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                            <span style={{
                              fontFamily: C.mono, fontSize: 13, fontWeight: 700,
                              color: esIng ? C.green : C.red,
                            }}>
                              {esIng ? "+" : ""}{m.delta}
                            </span>
                            <span style={{
                              fontSize: 8, letterSpacing: 1.5, textTransform: "uppercase",
                              padding: "2px 6px", borderRadius: 99, fontWeight: 700,
                              background: esIng ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)",
                              color: esIng ? C.green : C.red,
                              border: `1px solid ${esIng ? "rgba(16,185,129,0.25)" : "rgba(239,68,68,0.25)"}`,
                            }}>{esIng ? "ING" : "EGR"}</span>
                          </div>
                        </div>
                        <div style={{ marginTop: 4, display: "flex", gap: 10, flexWrap: "wrap" }}>
                          {m.obra && <span style={{ fontSize: 10, color: C.t2 }}>Obra: <span style={{ color: C.t1 }}>{m.obra}</span></span>}
                          {m.usuario && <span style={{ fontSize: 10, color: C.t2 }}>Retira: <span style={{ color: C.t1 }}>{m.usuario}</span></span>}
                        </div>
                        <div style={{ marginTop: 3, fontSize: 10, color: C.t2, fontFamily: C.mono }}>{fmt(m.created_at)}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
