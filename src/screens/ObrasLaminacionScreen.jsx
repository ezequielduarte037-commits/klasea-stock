import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import Sidebar from "../components/Sidebar";
import NotificacionesBell from "../components/NotificacionesBell";

function num(v) { const x = Number(v); return Number.isFinite(x) ? x : 0; }
function fmtDate(d) { if (!d) return "—"; return new Date(d + "T00:00:00").toLocaleDateString("es-AR"); }

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
  obra: {
    activa:    { dot: "#3b82f6", bg: "rgba(59,130,246,0.1)",  border: "rgba(59,130,246,0.25)",  label: "Activa"    },
    pausada:   { dot: "#f59e0b", bg: "rgba(245,158,11,0.1)",  border: "rgba(245,158,11,0.25)",  label: "Pausada"   },
    terminada: { dot: "#10b981", bg: "rgba(16,185,129,0.1)",  border: "rgba(16,185,129,0.25)",  label: "Terminada" },
  },
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

function EstadoChip({ estado }) {
  const meta = C.obra[estado] ?? C.obra.activa;
  return (
    <span style={{
      fontSize: 8, letterSpacing: 2, textTransform: "uppercase",
      padding: "3px 8px", borderRadius: 99, fontWeight: 700,
      background: meta.bg, color: meta.dot, border: `1px solid ${meta.border}`,
      whiteSpace: "nowrap",
    }}>
      {meta.label}
    </span>
  );
}

function Dot({ color, size = 6, glow = false }) {
  return <div style={{ width: size, height: size, borderRadius: "50%", background: color, flexShrink: 0, boxShadow: glow ? `0 0 7px ${color}90` : "none" }} />;
}

function ProgressBar({ value, color }) {
  const pct = Math.min(100, Math.max(0, value));
  const barColor = pct >= 100 ? C.green : pct >= 50 ? C.amber : C.red;
  return (
    <div style={{ height: 4, background: "rgba(255,255,255,0.05)", borderRadius: 99, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${pct}%`, background: color ?? barColor, borderRadius: 99, transition: "width .4s ease" }} />
    </div>
  );
}

export default function ObrasLaminacionScreen({ profile, signOut }) {
  const role    = profile?.role ?? "invitado";
  const isAdmin = !!profile?.is_admin;
  const esGestion = isAdmin || role === "admin" || role === "oficina";

  const [obras,       setObras]       = useState([]);
  const [materiales,  setMateriales]  = useState([]);
  const [obraMats,    setObraMats]    = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [syncing,     setSyncing]     = useState(false);
  const [err,         setErr]         = useState("");
  const [msg,         setMsg]         = useState("");

  const [obraSelId,     setObraSelId]     = useState(null);
  const [q,             setQ]             = useState("");
  const [showNuevaObra, setShowNuevaObra] = useState(false);
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
      supabase.from("laminacion_movimientos").select("material_id, tipo, cantidad, obra").not("obra", "is", null),
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

  const tablaObra = useMemo(() => {
    if (!obraSel) return [];
    const configMats = obraMats.filter(om => om.obra_id === obraSel.id);
    return materiales.map(mat => {
      const config       = configMats.find(cm => cm.material_id === mat.id);
      const necesario    = num(config?.cantidad_necesaria ?? 0);
      const movsObra     = movimientos.filter(m => m.material_id === mat.id && (m.obra ?? "").trim().toLowerCase() === obraSel.nombre.trim().toLowerCase());
      const ingresado    = movsObra.filter(m => m.tipo === "ingreso").reduce((s, m) => s + num(m.cantidad), 0);
      const egresado     = movsObra.filter(m => m.tipo === "egreso").reduce((s, m) => s + num(m.cantidad), 0);
      const faltaIngresar = Math.max(0, necesario - ingresado);
      const faltaUsar    = Math.max(0, necesario - egresado);
      const alertaCritica = necesario > 0 && faltaIngresar > necesario * 0.5;
      const alertaMedia   = necesario > 0 && faltaIngresar > 0;
      const tieneActividad = ingresado > 0 || egresado > 0 || necesario > 0;
      return { matId: mat.id, mat, necesario, ingresado, egresado, faltaIngresar, faltaUsar, alertaCritica, alertaMedia, configId: config?.id ?? null, tieneActividad };
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
      const criticas = configMats.filter(cm => {
        const nec = num(cm.cantidad_necesaria);
        if (!nec) return false;
        const ing = movimientos.filter(m => m.material_id === cm.material_id && m.tipo === "ingreso" && (m.obra ?? "").trim().toLowerCase() === o.nombre.trim().toLowerCase()).reduce((s, m) => s + num(m.cantidad), 0);
        return ing < nec * 0.5;
      }).length;
      const pendientes = configMats.filter(cm => {
        const nec = num(cm.cantidad_necesaria);
        if (!nec) return false;
        const ing = movimientos.filter(m => m.material_id === cm.material_id && m.tipo === "ingreso" && (m.obra ?? "").trim().toLowerCase() === o.nombre.trim().toLowerCase()).reduce((s, m) => s + num(m.cantidad), 0);
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
    setMsg(`✅ Obra ${obraData.nombre} creada con ${materiales.length} materiales.`);
    setShowNuevaObra(false);
    setFormObra({ nombre: "", descripcion: "", estado: "activa", fecha_inicio: new Date().toISOString().slice(0, 10), fecha_fin: "" });
    await cargar();
  }

  async function cambiarEstado(obraId, nuevoEstado) {
    const upd = { estado: nuevoEstado };
    if (nuevoEstado === "terminada") upd.fecha_fin = new Date().toISOString().slice(0, 10);
    const { error } = await supabase.from("laminacion_obras").update(upd).eq("id", obraId);
    if (error) setErr(error.message);
    else await cargar();
  }

  async function guardarNecesaria(obraId, matId, configId, valor) {
    setSavingNec(true);
    const cantidad = num(valor);
    let error;
    if (configId) {
      ({ error } = await supabase.from("laminacion_obra_materiales").update({ cantidad_necesaria: cantidad }).eq("id", configId));
    } else {
      ({ error } = await supabase.from("laminacion_obra_materiales").insert({ obra_id: obraId, material_id: matId, cantidad_necesaria: cantidad }));
    }
    setSavingNec(false);
    if (error) setErr(error.message);
    else await cargar();
  }

  async function sincronizarMateriales(obraId) {
    setSyncing(true);
    const plantilla = materiales.filter(mat => !obraMats.some(om => om.obra_id === obraId && om.material_id === mat.id))
      .map(mat => ({ obra_id: obraId, material_id: mat.id, cantidad_necesaria: 0 }));
    if (!plantilla.length) { setMsg("✅ Materiales ya sincronizados."); setSyncing(false); return; }
    const { error } = await supabase.from("laminacion_obra_materiales").insert(plantilla);
    if (error) setErr(error.message);
    else setMsg(`✅ ${plantilla.length} materiales sincronizados.`);
    setSyncing(false);
    await cargar();
  }

  const obrasFiltradas = useMemo(() => {
    const qq = q.toLowerCase();
    if (!qq) return obras;
    return obras.filter(o => o.nombre.toLowerCase().includes(qq) || (o.descripcion ?? "").toLowerCase().includes(qq));
  }, [obras, q]);

  // Stats de la obra seleccionada
  const obraStats = useMemo(() => ({
    total:     tablaObra.length,
    planif:    tablaObra.filter(r => r.necesario > 0).length,
    completos: tablaObra.filter(r => r.necesario > 0 && r.faltaIngresar === 0).length,
    criticos:  tablaObra.filter(r => r.alertaCritica).length,
  }), [tablaObra]);

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
        @keyframes slideUp   { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes slideLeft { from{opacity:0;transform:translateX(10px)} to{opacity:1;transform:translateX(0)} }
        button:not([disabled]):hover { opacity: 0.8; }
        tr:hover td { background: rgba(255,255,255,0.015); }
        .bg-glow {
          position: fixed; inset: 0; pointer-events: none; z-index: 0;
          background: radial-gradient(ellipse 70% 38% at 50% -6%, rgba(59,130,246,0.07) 0%, transparent 65%),
                      radial-gradient(ellipse 40% 28% at 92% 88%, rgba(245,158,11,0.02) 0%, transparent 55%);
        }
      `}</style>
      <div className="bg-glow" />
      <NotificacionesBell profile={profile} />

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
            <button onClick={cargar} style={{ border: `1px solid ${C.b0}`, background: "transparent", color: C.t2, padding: "5px 10px", borderRadius: 7, cursor: "pointer", fontFamily: C.sans, fontSize: 11 }}>↻</button>
            {esGestion && (
              <button
                onClick={() => setShowNuevaObra(v => !v)}
                style={{ border: "1px solid rgba(59,130,246,0.35)", background: "rgba(59,130,246,0.15)", color: "#60a5fa", padding: "7px 16px", borderRadius: 8, cursor: "pointer", fontFamily: C.sans, fontSize: 12, fontWeight: 600 }}
              >
                {showNuevaObra ? "✕ Cancelar" : "+ Nueva obra"}
              </button>
            )}
          </div>

          {/* ── MAIN ── */}
          <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            {/* Alertas */}
            {(err || msg) && (
              <div style={{ padding: "8px 18px", flexShrink: 0 }}>
                {err && <div style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171", fontSize: 12 }}>{err}</div>}
                {msg && <div style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)", color: "#34d399", fontSize: 12 }}>{msg}</div>}
              </div>
            )}

            {/* Form nueva obra */}
            {showNuevaObra && esGestion && (
              <div style={{ padding: "0 18px 12px", flexShrink: 0 }}>
                <div style={{ background: C.s0, border: `1px solid ${C.b1}`, borderRadius: 12, padding: 16, animation: "slideUp .2s ease" }}>
                  <div style={{ fontSize: 9, letterSpacing: 2, color: C.t2, textTransform: "uppercase", marginBottom: 12 }}>Nueva obra</div>
                  <form onSubmit={crearObra}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
                      {[
                        { label: "Código *", key: "nombre", placeholder: "43-12" },
                        { label: "Descripción", key: "descripcion", placeholder: "Klase 43 – Casco 12" },
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
                    <button type="submit" style={{ border: "1px solid rgba(59,130,246,0.35)", background: "rgba(59,130,246,0.15)", color: "#60a5fa", padding: "8px 20px", borderRadius: 8, cursor: "pointer", fontFamily: C.sans, fontSize: 12, fontWeight: 700 }}>
                      Crear obra
                    </button>
                  </form>
                </div>
              </div>
            )}

            {/* Split content */}
            {loading ? (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ fontSize: 11, color: C.t2, letterSpacing: 2, textTransform: "uppercase" }}>Cargando…</div>
              </div>
            ) : (
              <div style={{ flex: 1, overflow: "hidden", display: "grid", gridTemplateColumns: "300px 1fr" }}>

                {/* ── LISTA OBRAS ── */}
                <div style={{ borderRight: `1px solid ${C.b0}`, display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
                  <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.b0}`, flexShrink: 0 }}>
                    <input style={{ ...INP, padding: "6px 10px", fontSize: 11 }} placeholder="Buscar obra…" value={q} onChange={e => setQ(e.target.value)} />
                  </div>
                  <div style={{ flex: 1, overflowY: "auto", padding: "6px 8px" }}>
                    {obrasFiltradas.length === 0 && (
                      <div style={{ padding: "40px 16px", textAlign: "center", color: C.t2, fontSize: 11 }}>Sin obras</div>
                    )}
                    {obrasFiltradas.map(o => {
                      const al = alertasPorObra[o.id] ?? { criticas: 0, pendientes: 0 };
                      const sel = obraSelId === o.id;
                      const planificados = obraMats.filter(om => om.obra_id === o.id && num(om.cantidad_necesaria) > 0).length;
                      const sinPlantilla = !obraMats.some(om => om.obra_id === o.id);
                      const obraColor = C.obra[o.estado]?.dot ?? C.t2;

                      return (
                        <div
                          key={o.id}
                          onClick={() => setObraSelId(sel ? null : o.id)}
                          style={{
                            padding: "10px 12px", borderRadius: 9, cursor: "pointer", marginBottom: 4,
                            background: sel ? C.s1 : "transparent",
                            border: sel ? `1px solid ${C.b1}` : "1px solid transparent",
                            borderLeft: `2px solid ${sel ? obraColor : "transparent"}`,
                            transition: "all .15s",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ color: C.t0, fontWeight: 700, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.nombre}</div>
                              {o.descripcion && <div style={{ fontSize: 10, color: C.t2, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.descripcion}</div>}
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "flex-end", flexShrink: 0 }}>
                              <EstadoChip estado={o.estado} />
                              {al.criticas > 0 && (
                                <span style={{ fontSize: 8, padding: "2px 6px", borderRadius: 99, background: "rgba(239,68,68,0.1)", color: C.red, border: "1px solid rgba(239,68,68,0.25)", fontWeight: 700, letterSpacing: 1 }}>
                                  ⚠ {al.criticas} crítico{al.criticas > 1 ? "s" : ""}
                                </span>
                              )}
                              {sinPlantilla && (
                                <span style={{ fontSize: 8, padding: "2px 6px", borderRadius: 99, background: "rgba(245,158,11,0.1)", color: C.amber, border: "1px solid rgba(245,158,11,0.25)", fontWeight: 700 }}>
                                  sin plantilla
                                </span>
                              )}
                            </div>
                          </div>
                          <div style={{ marginTop: 5, fontSize: 10, color: C.t2, display: "flex", gap: 8 }}>
                            <span>{planificados} planificados</span>
                            {o.fecha_inicio && <span>{fmtDate(o.fecha_inicio)}</span>}
                          </div>

                          {sel && esGestion && (
                            <div style={{ marginTop: 8, display: "flex", gap: 4, flexWrap: "wrap" }} onClick={e => e.stopPropagation()}>
                              {o.estado !== "activa"    && <button style={{ border: `1px solid ${C.b0}`, background: "transparent", color: C.t1, padding: "2px 8px", borderRadius: 5, cursor: "pointer", fontSize: 9, fontFamily: C.sans }} onClick={() => cambiarEstado(o.id, "activa")}>▶ Activar</button>}
                              {o.estado !== "pausada"   && <button style={{ border: `1px solid ${C.b0}`, background: "transparent", color: C.t1, padding: "2px 8px", borderRadius: 5, cursor: "pointer", fontSize: 9, fontFamily: C.sans }} onClick={() => cambiarEstado(o.id, "pausada")}>⏸ Pausar</button>}
                              {o.estado !== "terminada" && <button style={{ border: `1px solid ${C.b0}`, background: "transparent", color: C.t1, padding: "2px 8px", borderRadius: 5, cursor: "pointer", fontSize: 9, fontFamily: C.sans }} onClick={() => cambiarEstado(o.id, "terminada")}>✓ Terminar</button>}
                              <button
                                disabled={syncing}
                                style={{ border: "1px solid rgba(59,130,246,0.2)", background: "transparent", color: "#93c5fd", padding: "2px 8px", borderRadius: 5, cursor: "pointer", fontSize: 9, fontFamily: C.sans }}
                                onClick={() => sincronizarMateriales(o.id)}
                              >⟳ Sincronizar</button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* ── DETALLE OBRA ── */}
                <div style={{ height: "100%", overflowY: "auto" }}>
                  {!obraSel ? (
                    <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6 }}>
                      <div style={{ fontSize: 11, color: C.t2, letterSpacing: 2, textTransform: "uppercase" }}>Seleccioná una obra</div>
                    </div>
                  ) : (
                    <div style={{ padding: 22, animation: "slideLeft .2s ease" }}>
                      {/* Header */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                        <div>
                          <div style={{ fontSize: 9, color: C.t2, letterSpacing: 2, textTransform: "uppercase", marginBottom: 4 }}>Obra seleccionada</div>
                          <h2 style={{ margin: 0, color: C.t0, fontSize: 18, fontWeight: 700 }}>{obraSel.nombre}</h2>
                          {obraSel.descripcion && <div style={{ fontSize: 11, color: C.t2, marginTop: 3 }}>{obraSel.descripcion}</div>}
                        </div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <EstadoChip estado={obraSel.estado} />
                          <div style={{ fontSize: 10, color: C.t2 }}>
                            {tablaObra.filter(r => r.necesario > 0).length} plan · {tablaObra.filter(r => r.tieneActividad).length} activos
                          </div>
                        </div>
                      </div>

                      {/* KPI row */}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 16 }}>
                        {[
                          { label: "Total",       val: obraStats.total,     color: C.t2   },
                          { label: "Planificados",val: obraStats.planif,    color: C.primary },
                          { label: "Completos",   val: obraStats.completos, color: C.green   },
                          { label: "Críticos",    val: obraStats.criticos,  color: C.red     },
                        ].map(({ label, val, color }) => (
                          <div key={label} style={{ background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 10, padding: "10px 14px", borderLeft: `2px solid ${color}` }}>
                            <div style={{ fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: C.t2, marginBottom: 5 }}>{label}</div>
                            <div style={{ fontFamily: C.mono, fontSize: 20, fontWeight: 700, color, lineHeight: 1 }}>{val}</div>
                          </div>
                        ))}
                      </div>

                      {/* Tabla materiales */}
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
                              {esGestion && <th style={TH}>Editar nec.</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {tablaObra.map(r => {
                              const pct = r.necesario > 0 ? (r.ingresado / r.necesario) * 100 : 0;
                              const editKey = obraSel.id + r.matId;
                              const editVal = editNec[editKey] ?? "";
                              const rowBg = r.alertaCritica ? "rgba(239,68,68,0.04)" : r.alertaMedia ? "rgba(245,158,11,0.025)" : "transparent";
                              return (
                                <tr key={r.matId} style={{ background: rowBg }}>
                                  <td style={TD}>
                                    <div style={{ fontWeight: r.tieneActividad ? 600 : 400, color: r.tieneActividad ? C.t0 : C.t2 }}>{r.mat.nombre}</div>
                                    <div style={{ fontSize: 10, color: C.t2, marginTop: 1 }}>{r.mat.unidad}</div>
                                  </td>
                                  <td style={{ ...TD, textAlign: "right", fontFamily: C.mono, color: r.necesario > 0 ? C.t1 : C.t2, opacity: r.necesario > 0 ? 1 : 0.3 }}>
                                    {r.necesario > 0 ? r.necesario : "—"}
                                  </td>
                                  <td style={{ ...TD, textAlign: "right", fontFamily: C.mono, color: r.ingresado > 0 ? C.green : C.t2, fontWeight: r.ingresado > 0 ? 700 : 400 }}>
                                    {r.ingresado > 0 ? r.ingresado : <span style={{ opacity: 0.3 }}>0</span>}
                                  </td>
                                  <td style={{ ...TD, textAlign: "right", fontFamily: C.mono, color: r.egresado > 0 ? C.red : C.t2 }}>
                                    {r.egresado > 0 ? r.egresado : <span style={{ opacity: 0.3 }}>0</span>}
                                  </td>
                                  <td style={{ ...TD, textAlign: "right" }}>
                                    {r.faltaIngresar > 0 ? (
                                      <span style={{ fontFamily: C.mono, fontWeight: 700, color: r.alertaCritica ? C.red : C.amber }}>{r.faltaIngresar}</span>
                                    ) : r.necesario > 0 ? (
                                      <span style={{ color: C.green }}>✓</span>
                                    ) : (
                                      <span style={{ opacity: 0.3 }}>—</span>
                                    )}
                                  </td>
                                  <td style={{ ...TD, textAlign: "right" }}>
                                    {r.faltaUsar > 0 ? (
                                      <span style={{ fontFamily: C.mono, color: C.t1 }}>{r.faltaUsar}</span>
                                    ) : r.necesario > 0 ? (
                                      <span style={{ color: C.green }}>✓</span>
                                    ) : (
                                      <span style={{ opacity: 0.3 }}>—</span>
                                    )}
                                  </td>
                                  <td style={{ ...TD, minWidth: 100 }}>
                                    {r.necesario > 0 ? (
                                      <div>
                                        <ProgressBar value={pct} />
                                        <div style={{ textAlign: "center", fontSize: 10, color: C.t2, marginTop: 3, fontFamily: C.mono }}>{Math.min(100, Math.round(pct))}%</div>
                                      </div>
                                    ) : <span style={{ opacity: 0.25, fontSize: 10 }}>sin planif.</span>}
                                  </td>
                                  {esGestion && (
                                    <td style={TD}>
                                      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                                        <input
                                          style={{ ...INP, width: 76, padding: "4px 8px", textAlign: "right", fontFamily: C.mono, fontSize: 12 }}
                                          type="number" min="0" step="0.01"
                                          placeholder={r.necesario || "0"}
                                          value={editVal}
                                          onChange={e => setEditNec(prev => ({ ...prev, [editKey]: e.target.value }))}
                                        />
                                        {editVal !== "" && (
                                          <button
                                            disabled={savingNec}
                                            style={{ border: "1px solid rgba(16,185,129,0.3)", background: "rgba(16,185,129,0.1)", color: C.green, padding: "4px 8px", borderRadius: 6, cursor: "pointer", fontSize: 12 }}
                                            onClick={() => { guardarNecesaria(obraSel.id, r.matId, r.configId, editVal); setEditNec(prev => { const n = { ...prev }; delete n[editKey]; return n; }); }}
                                          >✓</button>
                                        )}
                                      </div>
                                    </td>
                                  )}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      <div style={{ marginTop: 10, fontSize: 10, color: C.t2, opacity: 0.5 }}>
                        Los materiales en gris aún no tienen actividad ni planificación. Usá "Editar nec." para establecer la cantidad necesaria.
                      </div>
                    </div>
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
