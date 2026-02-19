import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import Sidebar from "../components/Sidebar";
import useAlertas from "../hooks/useAlertas";

function num(v) { const x = Number(v); return Number.isFinite(x) ? x : 0; }
function fmtDate(d) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("es-AR");
}
function diasDesde(fecha) {
  if (!fecha) return null;
  return Math.floor((Date.now() - new Date(fecha + "T00:00:00").getTime()) / 86400000);
}
function diasEntre(a, b) {
  if (!a || !b) return null;
  return Math.floor((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 86400000);
}

const ESTADO_OBRA = {
  activa:    { label: "ACTIVA",    bg: "rgba(48,209,88,0.12)",  color: "#30d158", border: "rgba(48,209,88,0.3)"   },
  pausada:   { label: "PAUSADA",   bg: "rgba(255,214,10,0.12)", color: "#ffd60a", border: "rgba(255,214,10,0.3)"  },
  terminada: { label: "TERMINADA", bg: "rgba(100,100,100,0.12)",color: "#888",    border: "rgba(100,100,100,0.3)" },
  cancelada: { label: "CANCELADA", bg: "rgba(255,69,58,0.12)",  color: "#ff453a", border: "rgba(255,69,58,0.3)"  },
};
const ESTADO_TIMELINE = {
  en_curso:   { color: "#ffd60a", label: "En curso" },
  completado: { color: "#30d158", label: "Completado" },
  cancelado:  { color: "#ff453a", label: "Cancelado" },
};

export default function ObrasScreen({ profile, signOut }) {
  const role    = profile?.role ?? "invitado";
  const isAdmin = !!profile?.is_admin;
  const esGestion = isAdmin || role === "admin" || role === "oficina";

  // Data propia de esta screen
  const [obras,     setObras]     = useState([]);
  const [timeline,  setTimeline]  = useState([]);
  const [procesos,  setProcesos]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [err,       setErr]       = useState("");
  const [msg,       setMsg]       = useState("");

  // UI
  const [obraSelId,    setObraSelId]    = useState(null);
  const [q,            setQ]            = useState("");
  const [filtroEstado, setFiltroEstado] = useState("activa");
  const [showNuevaObra,setShowNuevaObra]= useState(false);
  const [formObra, setFormObra] = useState({
    codigo: "", descripcion: "", tipo: "barco",
    estado: "activa", fecha_inicio: new Date().toISOString().slice(0,10),
    fecha_fin_estimada: "", notas: "",
  });

  // Alertas del hook compartido
  const { alertas, promediosPorProceso, config } = useAlertas();

  // ── CARGA ─────────────────────────────────────────────────
  async function cargar() {
    setLoading(true);
    const [r1, r2, r3] = await Promise.all([
      supabase.from("produccion_obras").select("*").order("created_at", { ascending: false }),
      supabase.from("obra_timeline").select("*, procesos(id,nombre,dias_esperados,orden,color,icono)").order("created_at"),
      supabase.from("procesos").select("*").eq("activo", true).order("orden"),
    ]);
    if (r1.error) setErr(r1.error.message);
    setObras(r1.data ?? []);
    setTimeline(r2.data ?? []);
    setProcesos(r3.data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    cargar();
    const ch = supabase.channel("rt-obras-screen")
      .on("postgres_changes", { event: "*", schema: "public", table: "obras" }, cargar)
      .on("postgres_changes", { event: "*", schema: "public", table: "obra_timeline" }, cargar)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  // ── OBRA SELECCIONADA ─────────────────────────────────────
  const obraSel = useMemo(() => obras.find(o => o.id === obraSelId), [obras, obraSelId]);
  const tlSel   = useMemo(() => timeline.filter(t => t.obra_id === obraSelId)
    .sort((a, b) => num(a.procesos?.orden) - num(b.procesos?.orden)), [timeline, obraSelId]);

  // ── PROCESO ACTUAL ────────────────────────────────────────
  function procesoActual(obraId) {
    const tl = timeline.filter(t => t.obra_id === obraId && t.estado === "en_curso");
    if (!tl.length) return null;
    return tl.sort((a, b) => num(b.procesos?.orden) - num(a.procesos?.orden))[0];
  }

  // ── ALERTAS POR OBRA ──────────────────────────────────────
  const alertasPorObra = useMemo(() => {
    const map = {};
    alertas.forEach(a => {
      if (!map[a.obra_id]) map[a.obra_id] = { total: 0, criticas: 0 };
      map[a.obra_id].total++;
      if (a.gravedad === "critical") map[a.obra_id].criticas++;
    });
    return map;
  }, [alertas]);

  // ── COMPARACIÓN CON PROMEDIO ──────────────────────────────
  function comparacionProceso(procesoId, diasReales) {
    const promedio = promediosPorProceso[procesoId];
    const tolerancia = (config.alerta_tolerancia_pct ?? 20) / 100;
    if (!promedio || diasReales == null) return null;
    const ratio = diasReales / promedio;
    return {
      promedio: Math.round(promedio),
      demora: diasReales - Math.round(promedio),
      color: ratio <= 1 ? "#30d158" : ratio <= 1 + tolerancia ? "#ffd60a" : "#ff453a",
      label: ratio <= 1 ? "✓ OK" : ratio <= 1 + tolerancia ? "⚠ Cerca" : "🔴 Demorado",
    };
  }

  // ── CREAR OBRA ────────────────────────────────────────────
  async function crearObra(e) {
    e.preventDefault();
    if (!formObra.codigo.trim()) return setErr("El código es obligatorio.");
    const { error } = await supabase.from("produccion_obras").insert({
      codigo:             formObra.codigo.trim().toUpperCase(),
      descripcion:        formObra.descripcion.trim() || null,
      tipo:               formObra.tipo,
      estado:             formObra.estado,
      fecha_inicio:       formObra.fecha_inicio || null,
      fecha_fin_estimada: formObra.fecha_fin_estimada || null,
      notas:              formObra.notas.trim() || null,
    });
    if (error) return setErr(error.message);

    // Auto-sync: crear en laminacion_obras también
    await supabase.from("laminacion_obras").upsert({
      nombre:      formObra.codigo.trim().toUpperCase(),
      descripcion: formObra.descripcion.trim() || null,
      estado:      "activa",
      fecha_inicio: formObra.fecha_inicio || null,
    }, { onConflict: "nombre", ignoreDuplicates: true });

    setMsg(`✅ Obra ${formObra.codigo.toUpperCase()} creada (sincronizada con Laminación).`);
    setFormObra({ codigo: "", descripcion: "", tipo: "barco", estado: "activa",
      fecha_inicio: new Date().toISOString().slice(0,10), fecha_fin_estimada: "", notas: "" });
    setShowNuevaObra(false);
    await cargar();
  }

  // ── CAMBIAR ESTADO OBRA ───────────────────────────────────
  async function cambiarEstadoObra(obraId, estado) {
    const upd = { estado };
    if (estado === "terminada") upd.fecha_fin_real = new Date().toISOString().slice(0,10);
    await supabase.from("produccion_obras").update(upd).eq("id", obraId);
    await cargar();
  }

  // ── INICIAR / COMPLETAR PROCESO ───────────────────────────
  async function iniciarProceso(obraId, procesoId) {
    const { error } = await supabase.from("obra_timeline").upsert({
      obra_id: obraId, proceso_id: procesoId,
      fecha_inicio: new Date().toISOString().slice(0,10),
      estado: "en_curso",
      registrado_por: profile?.username ?? "sistema",
    }, { onConflict: "obra_id,proceso_id" });
    if (error) setErr(error.message);
    else await cargar();
  }

  async function completarProceso(timelineId) {
    const { error } = await supabase.from("obra_timeline")
      .update({ fecha_fin: new Date().toISOString().slice(0,10), estado: "completado" })
      .eq("id", timelineId);
    if (error) setErr(error.message);
    else await cargar();
  }

  // ── OBRAS FILTRADAS ───────────────────────────────────────
  const obrasFiltradas = useMemo(() => {
    return obras.filter(o => {
      if (filtroEstado !== "todos" && o.estado !== filtroEstado) return false;
      const qq = q.toLowerCase();
      if (!qq) return true;
      return (o.codigo ?? "").toLowerCase().includes(qq) ||
             (o.descripcion ?? "").toLowerCase().includes(qq);
    });
  }, [obras, filtroEstado, q]);

  // ── STATS RÁPIDAS ─────────────────────────────────────────
  const stats = useMemo(() => ({
    activas:   obras.filter(o => o.estado === "activa").length,
    pausadas:  obras.filter(o => o.estado === "pausada").length,
    terminadas:obras.filter(o => o.estado === "terminada").length,
    conAlertas:Object.keys(alertasPorObra).length,
  }), [obras, alertasPorObra]);

  // ── ESTILOS ───────────────────────────────────────────────
  const S = {
    page:    { background: "#000", minHeight: "100vh", color: "#d0d0d0", fontFamily: "Roboto, system-ui, Arial" },
    layout:  { display: "grid", gridTemplateColumns: "280px 1fr", minHeight: "100vh" },
    main:    { padding: 20, overflow: "auto" },
    content: { width: "min(1500px, 100%)", margin: "0 auto" },
    card:    { border: "1px solid #1e1e1e", borderRadius: 14, background: "#070707", padding: 16, marginBottom: 14 },
    input:   { background: "#0b0b0b", border: "1px solid #2a2a2a", color: "#fff", padding: "9px 12px", borderRadius: 10, fontSize: 13 },
    label:   { fontSize: 10, letterSpacing: 1.5, opacity: 0.5, display: "block", marginBottom: 4 },
    btn:     { border: "1px solid #2a2a2a", background: "#111", color: "#fff", padding: "9px 14px", borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 13 },
    btnPrim: { border: "1px solid rgba(255,255,255,0.15)", background: "#fff", color: "#000", padding: "9px 18px", borderRadius: 10, cursor: "pointer", fontWeight: 900, fontSize: 13 },
    small:   { fontSize: 11, opacity: 0.45 },
    split:   { display: "grid", gridTemplateColumns: "340px 1fr", gap: 14, alignItems: "start" },

    badge: (est) => {
      const st = ESTADO_OBRA[est] ?? ESTADO_OBRA.activa;
      return { display: "inline-block", padding: "2px 8px", borderRadius: 999,
        fontSize: 10, fontWeight: 700, background: st.bg, color: st.color, border: `1px solid ${st.border}` };
    },
    alertBadge: (critica) => ({
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 8px", borderRadius: 999, fontSize: 10, fontWeight: 700,
      background: critica ? "rgba(255,69,58,0.15)"  : "rgba(255,214,10,0.12)",
      color:      critica ? "#ff453a" : "#ffd60a",
      border:     critica ? "1px solid rgba(255,69,58,0.3)" : "1px solid rgba(255,214,10,0.3)",
    }),
    obraCard: (sel) => ({
      border: sel ? "1px solid #3a3a3a" : "1px solid #1a1a1a",
      borderRadius: 12, background: sel ? "#0f0f0f" : "#080808",
      padding: "12px 14px", cursor: "pointer", marginBottom: 8,
    }),
    filterBtn: (act) => ({
      border: act ? "1px solid #444" : "1px solid #1a1a1a",
      background: act ? "#141414" : "transparent",
      color: act ? "#fff" : "#666",
      padding: "6px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: act ? 700 : 400,
    }),
  };

  // ── RENDER ────────────────────────────────────────────────
  return (
    <div style={S.page}>
      <div style={S.layout}>
        <Sidebar profile={profile} signOut={signOut} alertasCount={alertas.length} />
        <main style={S.main}>
          <div style={S.content}>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div>
                <h1 style={{ fontFamily: "Montserrat, system-ui, Arial", fontSize: 22, margin: 0, color: "#fff" }}>
                  Obras de Producción
                </h1>
                <div style={S.small}>Timeline · Comparación histórica · Alertas automáticas</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {esGestion && (
                  <button style={S.btn} onClick={() => setShowNuevaObra(v => !v)}>
                    {showNuevaObra ? "✕ Cancelar" : "+ Nueva obra"}
                  </button>
                )}
                <button style={S.btn} onClick={cargar}>↻</button>
              </div>
            </div>

            {err && <div style={{ ...S.card, borderColor: "#5a1d1d", color: "#ffbdbd" }}>{err}</div>}
            {msg && <div style={{ ...S.card, borderColor: "#1d5a2d", color: "#a6ffbf" }}>{msg}</div>}

            {/* Stats rápidas */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 14 }}>
              {[
                { label: "Activas",     val: stats.activas,    color: "#30d158" },
                { label: "Pausadas",    val: stats.pausadas,   color: "#ffd60a" },
                { label: "Terminadas",  val: stats.terminadas, color: "#888"    },
                { label: "Con alertas", val: stats.conAlertas, color: "#ff453a" },
              ].map(({ label, val, color }) => (
                <div key={label} style={{ ...S.card, marginBottom: 0, padding: "12px 16px" }}>
                  <div style={{ ...S.small, marginBottom: 4 }}>{label.toUpperCase()}</div>
                  <div style={{ fontSize: 28, fontWeight: 900, color, fontFamily: "Montserrat, system-ui" }}>{val}</div>
                </div>
              ))}
            </div>

            {/* Formulario nueva obra */}
            {showNuevaObra && esGestion && (
              <div style={S.card}>
                <h3 style={{ margin: "0 0 14px", color: "#fff" }}>Nueva obra</h3>
                <form onSubmit={crearObra}>
                  <div style={{ display: "grid", gridTemplateColumns: "160px 1fr 120px 140px 140px", gap: 12 }}>
                    <div>
                      <label style={S.label}>Código *</label>
                      <input style={{ ...S.input, width: "100%" }} placeholder="37-34" required
                        value={formObra.codigo} onChange={e => setFormObra(f => ({ ...f, codigo: e.target.value }))} />
                    </div>
                    <div>
                      <label style={S.label}>Descripción</label>
                      <input style={{ ...S.input, width: "100%" }} placeholder="Klase 37 – Casco 4"
                        value={formObra.descripcion} onChange={e => setFormObra(f => ({ ...f, descripcion: e.target.value }))} />
                    </div>
                    <div>
                      <label style={S.label}>Tipo</label>
                      <select style={{ ...S.input, width: "100%" }} value={formObra.tipo}
                        onChange={e => setFormObra(f => ({ ...f, tipo: e.target.value }))}>
                        <option value="barco">Barco</option>
                        <option value="mueble">Mueble</option>
                        <option value="otro">Otro</option>
                      </select>
                    </div>
                    <div>
                      <label style={S.label}>Inicio</label>
                      <input style={{ ...S.input, width: "100%" }} type="date"
                        value={formObra.fecha_inicio} onChange={e => setFormObra(f => ({ ...f, fecha_inicio: e.target.value }))} />
                    </div>
                    <div>
                      <label style={S.label}>Fin estimado</label>
                      <input style={{ ...S.input, width: "100%" }} type="date"
                        value={formObra.fecha_fin_estimada} onChange={e => setFormObra(f => ({ ...f, fecha_fin_estimada: e.target.value }))} />
                    </div>
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <label style={S.label}>Notas</label>
                    <input style={{ ...S.input, width: "100%" }} placeholder="Observaciones opcionales…"
                      value={formObra.notas} onChange={e => setFormObra(f => ({ ...f, notas: e.target.value }))} />
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <button type="submit" style={S.btnPrim}>Crear obra</button>
                  </div>
                </form>
              </div>
            )}

            {/* Layout split */}
            <div style={S.split}>

              {/* ── LISTA OBRAS ── */}
              <div>
                <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                  {["activa","pausada","terminada","todos"].map(e => (
                    <button key={e} style={S.filterBtn(filtroEstado === e)}
                      onClick={() => setFiltroEstado(e)}>
                      {e === "todos" ? "Todos" : e.charAt(0).toUpperCase() + e.slice(1)}
                    </button>
                  ))}
                </div>
                <input style={{ ...S.input, width: "100%", marginBottom: 10 }}
                  placeholder="Buscar obra…" value={q} onChange={e => setQ(e.target.value)} />

                {loading && <div style={{ ...S.card, textAlign: "center", opacity: 0.5 }}>Cargando…</div>}

                {obrasFiltradas.map(o => {
                  const sel = obraSelId === o.id;
                  const al  = alertasPorObra[o.id] ?? { total: 0, criticas: 0 };
                  const pc  = procesoActual(o.id);
                  const diasEnObra = diasDesde(o.fecha_inicio);

                  return (
                    <div key={o.id} style={S.obraCard(sel)} onClick={() => setObraSelId(sel ? null : o.id)}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div>
                          <div style={{ color: "#fff", fontWeight: 800, fontSize: 16, fontFamily: "Montserrat, system-ui" }}>
                            {o.codigo}
                          </div>
                          {o.descripcion && <div style={{ ...S.small, marginTop: 2 }}>{o.descripcion}</div>}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
                          <span style={S.badge(o.estado)}>{ESTADO_OBRA[o.estado]?.label}</span>
                          {al.criticas > 0 && <span style={S.alertBadge(true)}>⚠ {al.criticas} crítico{al.criticas > 1 ? "s" : ""}</span>}
                          {al.total > 0 && al.criticas === 0 && <span style={S.alertBadge(false)}>● {al.total} alerta{al.total > 1 ? "s" : ""}</span>}
                        </div>
                      </div>

                      {/* Mini info */}
                      <div style={{ marginTop: 8, display: "flex", gap: 12, flexWrap: "wrap", fontSize: 11, opacity: 0.55 }}>
                        {diasEnObra != null && <span>📅 {diasEnObra} días en obra</span>}
                        {o.fecha_fin_estimada && <span>🏁 Fin est: {fmtDate(o.fecha_fin_estimada)}</span>}
                        {pc && <span style={{ color: pc.procesos?.color ?? "#fff" }}>
                          {pc.procesos?.icono} {pc.procesos?.nombre}
                        </span>}
                      </div>

                      {/* Mini timeline pills */}
                      {sel && (
                        <div style={{ marginTop: 10, display: "flex", gap: 4, flexWrap: "wrap" }}>
                          {procesos.map(p => {
                            const t = timeline.find(t => t.obra_id === o.id && t.proceso_id === p.id);
                            const color = t ? ESTADO_TIMELINE[t.estado]?.color : "#222";
                            return (
                              <div key={p.id} style={{
                                padding: "3px 8px", borderRadius: 6, fontSize: 10, fontWeight: 600,
                                background: t ? `${color}18` : "#111",
                                border: `1px solid ${t ? color + "44" : "#1e1e1e"}`,
                                color: t ? color : "#444",
                              }}>
                                {p.icono} {p.nombre}
                                {t?.dias_reales != null && ` · ${t.dias_reales}d`}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Acciones cuando está seleccionada */}
                      {sel && esGestion && (
                        <div style={{ marginTop: 10, display: "flex", gap: 6 }} onClick={e => e.stopPropagation()}>
                          {o.estado !== "activa"    && <button style={{ ...S.btn, fontSize: 11, padding: "5px 10px" }} onClick={() => cambiarEstadoObra(o.id, "activa")}>▶ Activar</button>}
                          {o.estado !== "pausada"   && <button style={{ ...S.btn, fontSize: 11, padding: "5px 10px" }} onClick={() => cambiarEstadoObra(o.id, "pausada")}>⏸ Pausar</button>}
                          {o.estado !== "terminada" && <button style={{ ...S.btn, fontSize: 11, padding: "5px 10px" }} onClick={() => cambiarEstadoObra(o.id, "terminada")}>✓ Terminar</button>}
                        </div>
                      )}
                    </div>
                  );
                })}

                {!loading && obrasFiltradas.length === 0 && (
                  <div style={{ ...S.card, textAlign: "center", opacity: 0.4, padding: 30 }}>
                    Sin obras con este filtro.
                  </div>
                )}
              </div>

              {/* ── DETALLE OBRA: TIMELINE ── */}
              <div>
                {!obraSel ? (
                  <div style={{ ...S.card, textAlign: "center", opacity: 0.35, padding: 50 }}>
                    Seleccioná una obra para ver su timeline y análisis
                  </div>
                ) : (
                  <>
                    {/* Header obra */}
                    <div style={S.card}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div>
                          <h2 style={{ margin: 0, color: "#fff", fontFamily: "Montserrat, system-ui", fontSize: 20 }}>
                            {obraSel.codigo}
                          </h2>
                          {obraSel.descripcion && <div style={{ ...S.small, marginTop: 3 }}>{obraSel.descripcion}</div>}
                          {obraSel.notas && <div style={{ marginTop: 6, fontSize: 12, opacity: 0.6, fontStyle: "italic" }}>{obraSel.notas}</div>}
                        </div>
                        <span style={S.badge(obraSel.estado)}>{ESTADO_OBRA[obraSel.estado]?.label}</span>
                      </div>

                      {/* Fechas */}
                      <div style={{ marginTop: 12, display: "flex", gap: 20, fontSize: 12, opacity: 0.65 }}>
                        {obraSel.fecha_inicio && <span>📅 Inicio: {fmtDate(obraSel.fecha_inicio)}</span>}
                        {obraSel.fecha_fin_estimada && <span>🏁 Fin est.: {fmtDate(obraSel.fecha_fin_estimada)}</span>}
                        {obraSel.fecha_fin_real && <span>✅ Fin real: {fmtDate(obraSel.fecha_fin_real)}</span>}
                        {obraSel.fecha_inicio && !obraSel.fecha_fin_real && (
                          <span>⏱ {diasDesde(obraSel.fecha_inicio)} días en producción</span>
                        )}
                        {obraSel.fecha_inicio && obraSel.fecha_fin_real && (
                          <span>⏱ {diasEntre(obraSel.fecha_inicio, obraSel.fecha_fin_real)} días totales</span>
                        )}
                      </div>

                      {/* Alertas activas de esta obra */}
                      {alertas.filter(a => a.obra_id === obraSel.id).length > 0 && (
                        <div style={{ marginTop: 12 }}>
                          {alertas.filter(a => a.obra_id === obraSel.id).map(a => (
                            <div key={a.id} style={{
                              padding: "8px 12px", borderRadius: 8, marginBottom: 6, fontSize: 12,
                              background: a.gravedad === "critical" ? "rgba(255,69,58,0.08)" : "rgba(255,214,10,0.07)",
                              border: a.gravedad === "critical" ? "1px solid rgba(255,69,58,0.25)" : "1px solid rgba(255,214,10,0.25)",
                              color: a.gravedad === "critical" ? "#ff6b6b" : "#ffd60a",
                            }}>
                              {a.gravedad === "critical" ? "🔴" : "⚠️"} {a.mensaje}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Timeline visual */}
                    <div style={S.card}>
                      <h3 style={{ margin: "0 0 16px", color: "#fff", fontSize: 15 }}>Timeline de producción</h3>

                      {procesos.map((p, idx) => {
                        const t = tlSel.find(t => t.proceso_id === p.id);
                        const comp = t?.dias_reales != null
                          ? comparacionProceso(p.id, t.dias_reales)
                          : t?.fecha_inicio && !t?.fecha_fin
                            ? comparacionProceso(p.id, Math.floor((Date.now() - new Date(t.fecha_inicio + "T00:00:00")) / 86400000))
                            : null;
                        const diasActuales = t?.dias_reales != null ? t.dias_reales
                          : t?.fecha_inicio ? Math.floor((Date.now() - new Date(t.fecha_inicio + "T00:00:00")) / 86400000)
                          : null;

                        return (
                          <div key={p.id} style={{ display: "flex", gap: 0, marginBottom: 6 }}>
                            {/* Línea vertical */}
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 28, marginRight: 12 }}>
                              <div style={{
                                width: 12, height: 12, borderRadius: "50%", flexShrink: 0,
                                background: t ? (ESTADO_TIMELINE[t.estado]?.color ?? "#444") : "#1e1e1e",
                                border: t ? "none" : "1px solid #2a2a2a",
                                boxShadow: t?.estado === "en_curso" ? `0 0 8px ${ESTADO_TIMELINE.en_curso.color}66` : "none",
                              }} />
                              {idx < procesos.length - 1 && (
                                <div style={{ width: 1, flex: 1, minHeight: 18, background: t ? "#2a2a2a" : "#141414" }} />
                              )}
                            </div>

                            {/* Contenido */}
                            <div style={{ flex: 1, paddingBottom: 12 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <span style={{ fontSize: 14 }}>{p.icono}</span>
                                  <span style={{
                                    fontWeight: t ? 700 : 400,
                                    color: t ? "#fff" : "#555",
                                    fontSize: 14,
                                  }}>{p.nombre}</span>
                                  {t?.estado === "en_curso" && (
                                    <span style={{ fontSize: 10, color: "#ffd60a", fontWeight: 700 }}>EN CURSO</span>
                                  )}
                                </div>

                                {/* Comparación con promedio */}
                                {comp && (
                                  <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12 }}>
                                    <span style={{ opacity: 0.5 }}>Prom: {comp.promedio}d</span>
                                    <span style={{ color: comp.color, fontWeight: 700 }}>
                                      {diasActuales}d {comp.label}
                                    </span>
                                    {comp.demora > 0 && (
                                      <span style={{ color: comp.color, fontSize: 11 }}>+{comp.demora}d</span>
                                    )}
                                  </div>
                                )}

                                {/* Sin datos pero configurado */}
                                {!t && (
                                  <span style={{ fontSize: 11, color: "#333" }}>{p.dias_esperados}d esperados</span>
                                )}
                              </div>

                              {/* Fechas del proceso */}
                              {t && (
                                <div style={{ marginTop: 4, fontSize: 11, opacity: 0.55, display: "flex", gap: 12 }}>
                                  {t.fecha_inicio && <span>Inicio: {fmtDate(t.fecha_inicio)}</span>}
                                  {t.fecha_fin    && <span>Fin: {fmtDate(t.fecha_fin)}</span>}
                                  {t.notas && <span>· {t.notas}</span>}
                                </div>
                              )}

                              {/* Barra de progreso vs días esperados */}
                              {diasActuales != null && (
                                <div style={{ marginTop: 6, height: 3, background: "#111", borderRadius: 99, overflow: "hidden", maxWidth: 300 }}>
                                  <div style={{
                                    height: "100%", borderRadius: 99,
                                    width: `${Math.min(100, (diasActuales / p.dias_esperados) * 100)}%`,
                                    background: comp?.color ?? "#30d158",
                                    transition: "width 0.4s ease",
                                  }} />
                                </div>
                              )}

                              {/* Acciones */}
                              {esGestion && (
                                <div style={{ marginTop: 6, display: "flex", gap: 6 }}>
                                  {!t && (
                                    <button style={{ ...S.btn, fontSize: 11, padding: "4px 10px" }}
                                      onClick={() => iniciarProceso(obraSel.id, p.id)}>
                                      ▶ Iniciar
                                    </button>
                                  )}
                                  {t?.estado === "en_curso" && (
                                    <button style={{ ...S.btn, fontSize: 11, padding: "4px 10px", borderColor: "#30d158", color: "#30d158" }}
                                      onClick={() => completarProceso(t.id)}>
                                      ✓ Completar
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Resumen de tiempos */}
                    {tlSel.some(t => t.dias_reales != null) && (
                      <div style={S.card}>
                        <h3 style={{ margin: "0 0 12px", color: "#fff", fontSize: 15 }}>Análisis de tiempos</h3>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                          {tlSel.filter(t => t.dias_reales != null).map(t => {
                            const comp = comparacionProceso(t.proceso_id, t.dias_reales);
                            return (
                              <div key={t.id} style={{ background: "#0d0d0d", border: "1px solid #1a1a1a", borderRadius: 10, padding: "10px 14px" }}>
                                <div style={{ fontSize: 11, opacity: 0.45 }}>{t.procesos?.icono} {t.procesos?.nombre}</div>
                                <div style={{ fontSize: 22, fontWeight: 900, color: comp?.color ?? "#fff", fontFamily: "Montserrat, system-ui", marginTop: 2 }}>
                                  {t.dias_reales}d
                                </div>
                                {comp && (
                                  <div style={{ fontSize: 11, opacity: 0.55, marginTop: 2 }}>
                                    Promedio histórico: {comp.promedio}d
                                    {comp.demora > 0 ? ` (+${comp.demora}d)` : " (✓ en tiempo)"}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                          {/* Total */}
                          {obraSel.fecha_inicio && obraSel.fecha_fin_real && (
                            <div style={{ background: "#0d0d0d", border: "1px solid #2a2a2a", borderRadius: 10, padding: "10px 14px", gridColumn: "1 / -1" }}>
                              <div style={{ fontSize: 11, opacity: 0.45 }}>⏱ TIEMPO TOTAL DE OBRA</div>
                              <div style={{ fontSize: 26, fontWeight: 900, color: "#fff", fontFamily: "Montserrat, system-ui", marginTop: 2 }}>
                                {diasEntre(obraSel.fecha_inicio, obraSel.fecha_fin_real)} días
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
