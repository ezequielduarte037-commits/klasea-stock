import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import Sidebar from "../components/Sidebar";
import NotificacionesBell from "../components/NotificacionesBell";
import useAlertas from "../hooks/useAlertas";

function num(v) { const x = Number(v); return Number.isFinite(x) ? x : 0; }
function fmtDate(d) { if (!d) return "—"; return new Date(d + "T00:00:00").toLocaleDateString("es-AR"); }
function diasDesde(f) { if (!f) return null; return Math.floor((Date.now() - new Date(f + "T00:00:00")) / 86400000); }
function diasEntre(a, b) { if (!a || !b) return null; return Math.floor((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 86400000); }

const ESTADO_OBRA = {
  activa:    { label: "ACTIVA",    bg: "rgba(48,209,88,0.1)",   color: "#30d158", border: "rgba(48,209,88,0.25)"   },
  pausada:   { label: "PAUSADA",   bg: "rgba(255,214,10,0.1)",  color: "#ffd60a", border: "rgba(255,214,10,0.25)"  },
  terminada: { label: "TERMINADA", bg: "rgba(100,100,100,0.1)", color: "#888",    border: "rgba(100,100,100,0.25)" },
  cancelada: { label: "CANCELADA", bg: "rgba(255,69,58,0.1)",   color: "#ff453a", border: "rgba(255,69,58,0.25)"   },
};

export default function ObrasScreen({ profile, signOut }) {
  const role     = profile?.role ?? "invitado";
  const isAdmin  = !!profile?.is_admin;
  const esGestion = isAdmin || role === "admin" || role === "oficina";

  const [obras,    setObras]    = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [procesos, setProcesos] = useState([]);
  const [checks,   setChecks]   = useState([]);    // obra_proceso_checks
  const [steps,    setSteps]    = useState([]);    // proceso_steps_template
  const [loading,  setLoading]  = useState(true);
  const [err,      setErr]      = useState("");
  const [msg,      setMsg]      = useState("");

  // UI
  const [obraSelId,      setObraSelId]      = useState(null);
  const [q,              setQ]              = useState("");
  const [filtroEstado,   setFiltroEstado]   = useState("activa");
  const [showNuevaObra,  setShowNuevaObra]  = useState(false);
  const [expandedProc,   setExpandedProc]   = useState({}); // { [proceso_id]: bool }
  const [showConfirmDel, setShowConfirmDel] = useState(null); // obraId a borrar
  // Modal para agregar step a un proceso del timeline
  const [addStepFor, setAddStepFor] = useState(null); // { obraId, procesoId }
  const [newStepTxt, setNewStepTxt] = useState("");

  const [formObra, setFormObra] = useState({
    codigo: "", descripcion: "", tipo: "barco",
    estado: "activa", fecha_inicio: new Date().toISOString().slice(0, 10),
    fecha_fin_estimada: "", notas: "",
  });

  const { alertas, promediosPorProceso, config } = useAlertas();

  async function cargar() {
    setLoading(true);
    const [r1, r2, r3, r4, r5] = await Promise.all([
      supabase.from("produccion_obras").select("*").order("created_at", { ascending: false }),
      supabase.from("obra_timeline").select("*, procesos(id,nombre,dias_esperados,orden,color,icono)").order("created_at"),
      supabase.from("procesos").select("*").eq("activo", true).order("orden"),
      supabase.from("obra_proceso_checks").select("*").order("created_at"),
      supabase.from("proceso_steps_template").select("*").eq("activo", true).order("orden"),
    ]);
    setObras(r1.data ?? []);
    setTimeline(r2.data ?? []);
    setProcesos(r3.data ?? []);
    setChecks(r4.data ?? []);
    setSteps(r5.data ?? []);
    setLoading(false);
    if (r1.error) setErr(r1.error.message);
  }

  useEffect(() => {
    cargar();
    const ch = supabase.channel("rt-obras-v2")
      .on("postgres_changes", { event: "*", schema: "public", table: "produccion_obras" }, cargar)
      .on("postgres_changes", { event: "*", schema: "public", table: "obra_timeline" }, cargar)
      .on("postgres_changes", { event: "*", schema: "public", table: "obra_proceso_checks" }, cargar)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  const obraSel = useMemo(() => obras.find(o => o.id === obraSelId), [obras, obraSelId]);
  const tlSel   = useMemo(() => timeline.filter(t => t.obra_id === obraSelId)
    .sort((a, b) => num(a.procesos?.orden) - num(b.procesos?.orden)), [timeline, obraSelId]);

  const alertasPorObra = useMemo(() => {
    const map = {};
    alertas.forEach(a => {
      if (!map[a.obra_id]) map[a.obra_id] = { total: 0, criticas: 0 };
      map[a.obra_id].total++;
      if (a.gravedad === "critical") map[a.obra_id].criticas++;
    });
    return map;
  }, [alertas]);

  function procesoActual(obraId) {
    const tl = timeline.filter(t => t.obra_id === obraId && t.estado === "en_curso");
    if (!tl.length) return null;
    return tl.sort((a, b) => num(b.procesos?.orden) - num(a.procesos?.orden))[0];
  }

  function comparacion(procesoId, diasReales) {
    const prom = promediosPorProceso[procesoId];
    const tol  = (config.alerta_tolerancia_pct ?? 20) / 100;
    if (!prom || diasReales == null) return null;
    const ratio = diasReales / prom;
    return {
      promedio: Math.round(prom),
      demora: diasReales - Math.round(prom),
      color: ratio <= 1 ? "#30d158" : ratio <= 1 + tol ? "#ffd60a" : "#ff453a",
      label: ratio <= 1 ? "✓ OK" : ratio <= 1 + tol ? "⚠ Cerca" : "🔴 Demorado",
    };
  }

  // ── CREAR OBRA ──────────────────────────────────────────────
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

    // Sincronizar con laminacion_obras Y crear plantilla de materiales
    const { data: lamObra } = await supabase
      .from("laminacion_obras")
      .upsert({
        nombre:       formObra.codigo.trim().toUpperCase(),
        descripcion:  formObra.descripcion.trim() || null,
        estado:       "activa",
        fecha_inicio: formObra.fecha_inicio || null,
      }, { onConflict: "nombre", ignoreDuplicates: false })
      .select()
      .single();

    // Si se creó/obtuvo la obra de laminación, crear plantilla de materiales
    if (lamObra?.id) {
      const { data: mats } = await supabase.from("laminacion_materiales").select("id");
      if (mats?.length) {
        const plantilla = mats.map(m => ({
          obra_id: lamObra.id, material_id: m.id, cantidad_necesaria: 0,
        }));
        await supabase.from("laminacion_obra_materiales")
          .upsert(plantilla, { onConflict: "obra_id,material_id", ignoreDuplicates: true });
      }
    }

    setMsg(`✅ Obra ${formObra.codigo.toUpperCase()} creada.`);
    setFormObra({ codigo: "", descripcion: "", tipo: "barco", estado: "activa",
      fecha_inicio: new Date().toISOString().slice(0, 10), fecha_fin_estimada: "", notas: "" });
    setShowNuevaObra(false);
    await cargar();
  }

  // ── BORRAR OBRA ─────────────────────────────────────────────
  async function borrarObra(obraId) {
    const obra = obras.find(o => o.id === obraId);
    // También borrar de laminacion_obras si existe
    if (obra?.codigo) {
      await supabase.from("laminacion_obras").delete().eq("nombre", obra.codigo);
    }
    const { error } = await supabase.from("produccion_obras").delete().eq("id", obraId);
    if (error) return setErr(error.message);
    setMsg("🗑 Obra eliminada.");
    setObraSelId(null);
    setShowConfirmDel(null);
    setTimeout(() => setMsg(""), 2000);
    await cargar();
  }

  // ── CAMBIAR ESTADO ──────────────────────────────────────────
  async function cambiarEstado(obraId, estado) {
    const upd = { estado };
    if (estado === "terminada") upd.fecha_fin_real = new Date().toISOString().slice(0, 10);
    await supabase.from("produccion_obras").update(upd).eq("id", obraId);
    await cargar();
  }

  // ── INICIAR PROCESO ─────────────────────────────────────────
  async function iniciarProceso(obraId, procesoId) {
    const { error } = await supabase.from("obra_timeline").upsert({
      obra_id: obraId, proceso_id: procesoId,
      fecha_inicio: new Date().toISOString().slice(0, 10),
      estado: "en_curso",
      registrado_por: profile?.username ?? "sistema",
    }, { onConflict: "obra_id,proceso_id" });
    if (error) { setErr(error.message); return; }

    // Auto-crear checks desde template si existen
    await supabase.rpc("fn_crear_checks_proceso", { p_obra_id: obraId, p_proceso_id: procesoId });
    await cargar();
  }

  // ── COMPLETAR PROCESO ───────────────────────────────────────
  async function completarProceso(timelineId) {
    const { error } = await supabase.from("obra_timeline")
      .update({ fecha_fin: new Date().toISOString().slice(0, 10), estado: "completado" })
      .eq("id", timelineId);
    if (error) setErr(error.message);
    else await cargar();
  }

  // ── TOGGLE CHECK ────────────────────────────────────────────
  async function toggleCheck(checkId, completado) {
    await supabase.from("obra_proceso_checks").update({
      completado:     !completado,
      completado_por: !completado ? (profile?.username ?? "usuario") : null,
      completado_en:  !completado ? new Date().toISOString() : null,
    }).eq("id", checkId);
    await cargar();
  }

  // ── AGREGAR STEP MANUAL A UNA OBRA+PROCESO ──────────────────
  async function agregarCheck() {
    if (!newStepTxt.trim() || !addStepFor) return;
    await supabase.from("obra_proceso_checks").insert({
      obra_id: addStepFor.obraId, proceso_id: addStepFor.procesoId,
      texto: newStepTxt.trim(), completado: false,
    });
    setNewStepTxt("");
    setAddStepFor(null);
    await cargar();
  }

  // ── OBRAS FILTRADAS ─────────────────────────────────────────
  const obrasFiltradas = useMemo(() => {
    return obras.filter(o => {
      if (filtroEstado !== "todos" && o.estado !== filtroEstado) return false;
      const qq = q.toLowerCase();
      if (!qq) return true;
      return (o.codigo ?? "").toLowerCase().includes(qq) || (o.descripcion ?? "").toLowerCase().includes(qq);
    });
  }, [obras, filtroEstado, q]);

  const stats = useMemo(() => ({
    activas:    obras.filter(o => o.estado === "activa").length,
    pausadas:   obras.filter(o => o.estado === "pausada").length,
    terminadas: obras.filter(o => o.estado === "terminada").length,
    conAlertas: Object.values(alertasPorObra).filter(a => a.total > 0).length,
  }), [obras, alertasPorObra]);

  // ── ESTILOS ─────────────────────────────────────────────────
  const S = {
    page:    { background: "#000", minHeight: "100vh", color: "#d0d0d0", fontFamily: "-apple-system, 'Helvetica Neue', sans-serif" },
    layout:  { display: "grid", gridTemplateColumns: "280px 1fr", minHeight: "100vh" },
    main:    { padding: "20px 24px", overflow: "auto" },
    content: { width: "min(1500px,100%)", margin: "0 auto" },
    card:    { border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, background: "rgba(255,255,255,0.02)", padding: 16, marginBottom: 12 },
    input:   { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", padding: "8px 12px", borderRadius: 10, fontSize: 13, outline: "none" },
    label:   { fontSize: 10, letterSpacing: 1.5, opacity: 0.4, display: "block", marginBottom: 4, textTransform: "uppercase" },
    btn:     { border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "#fff", padding: "8px 14px", borderRadius: 10, cursor: "pointer", fontWeight: 600, fontSize: 13 },
    btnPrim: { border: "1px solid rgba(255,255,255,0.2)", background: "#fff", color: "#000", padding: "8px 18px", borderRadius: 10, cursor: "pointer", fontWeight: 800, fontSize: 13 },
    btnSm:   { border: "1px solid rgba(255,255,255,0.08)", background: "transparent", color: "#888", padding: "4px 10px", borderRadius: 7, cursor: "pointer", fontSize: 11 },
    btnDel:  { border: "1px solid rgba(255,69,58,0.3)", background: "transparent", color: "#ff453a", padding: "4px 10px", borderRadius: 7, cursor: "pointer", fontSize: 11 },
    small:   { fontSize: 11, opacity: 0.45 },
    split:   { display: "grid", gridTemplateColumns: "340px 1fr", gap: 14, alignItems: "start" },

    badge: (est) => {
      const st = ESTADO_OBRA[est] ?? ESTADO_OBRA.activa;
      return { display: "inline-block", padding: "2px 8px", borderRadius: 99, fontSize: 10, fontWeight: 700, background: st.bg, color: st.color, border: `1px solid ${st.border}` };
    },
    alertBadge: (critica) => ({
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 8px", borderRadius: 99, fontSize: 10, fontWeight: 700,
      background: critica ? "rgba(255,69,58,0.12)" : "rgba(255,214,10,0.1)",
      color: critica ? "#ff453a" : "#ffd60a",
      border: critica ? "1px solid rgba(255,69,58,0.25)" : "1px solid rgba(255,214,10,0.25)",
    }),
    obraCard: (sel) => ({
      border: sel ? "1px solid rgba(255,255,255,0.15)" : "1px solid rgba(255,255,255,0.05)",
      borderRadius: 12, background: sel ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.01)",
      padding: "12px 14px", cursor: "pointer", marginBottom: 7,
      transition: "all 0.15s",
    }),
    filterBtn: (act) => ({
      border: act ? "1px solid rgba(255,255,255,0.2)" : "1px solid transparent",
      background: act ? "rgba(255,255,255,0.06)" : "transparent",
      color: act ? "#fff" : "rgba(255,255,255,0.4)",
      padding: "5px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: act ? 700 : 400,
    }),
    statCard: (color) => ({
      ...{ border: `1px solid ${color}20`, borderRadius: 12, background: `${color}08`, padding: "12px 16px" },
    }),
    procRow: { marginBottom: 6, borderRadius: 10, border: "1px solid rgba(255,255,255,0.05)", overflow: "hidden" },
    procHeader: { display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", cursor: "pointer", userSelect: "none" },
    checkItem: (done) => ({
      display: "flex", alignItems: "flex-start", gap: 10, padding: "7px 14px 7px 40px",
      background: done ? "rgba(48,209,88,0.04)" : "transparent",
      borderTop: "1px solid rgba(255,255,255,0.03)",
    }),
    checkbox: (done) => ({
      width: 16, height: 16, borderRadius: 4, flexShrink: 0, marginTop: 1,
      border: `1px solid ${done ? "#30d158" : "rgba(255,255,255,0.2)"}`,
      background: done ? "#30d158" : "transparent",
      cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 9, color: "#000",
    }),
    overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 9999 },
    modal:   { background: "rgba(8,8,8,0.98)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, padding: 28, width: "min(420px,90vw)", boxShadow: "0 30px 80px rgba(0,0,0,0.9)" },
  };

  return (
    <div style={S.page}>
      <NotificacionesBell profile={profile} />
      <div style={S.layout}>
        <Sidebar profile={profile} signOut={signOut} />
        <main style={S.main}>
          <div style={S.content}>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
              <div>
                <div style={{ fontSize: 10, letterSpacing: 3, opacity: 0.3, marginBottom: 5, textTransform: "uppercase", fontWeight: 600 }}>Producción</div>
                <h1 style={{ fontFamily: "Montserrat, system-ui", fontSize: 24, margin: 0, color: "#fff", fontWeight: 900, letterSpacing: -0.5 }}>
                  Obras
                </h1>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {esGestion && <button style={S.btnPrim} onClick={() => setShowNuevaObra(v => !v)}>{showNuevaObra ? "✕ Cancelar" : "+ Nueva obra"}</button>}
                <button style={S.btn} onClick={cargar}>↻</button>
              </div>
            </div>

            {err && <div style={{ ...S.card, borderColor: "rgba(255,69,58,0.3)", color: "#ff6b6b", background: "rgba(255,69,58,0.05)" }}>{err}</div>}
            {msg && <div style={{ ...S.card, borderColor: "rgba(48,209,88,0.3)", color: "#a6ffbf", background: "rgba(48,209,88,0.05)" }}>{msg}</div>}

            {/* Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 14 }}>
              {[
                { label: "Activas",     val: stats.activas,    color: "#30d158" },
                { label: "Pausadas",    val: stats.pausadas,   color: "#ffd60a" },
                { label: "Terminadas",  val: stats.terminadas, color: "#888"    },
                { label: "Con alertas", val: stats.conAlertas, color: "#ff453a" },
              ].map(({ label, val, color }) => (
                <div key={label} style={S.statCard(color)}>
                  <div style={{ fontSize: 10, opacity: 0.5, marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
                  <div style={{ fontSize: 26, fontWeight: 900, color, fontFamily: "Montserrat, system-ui" }}>{val}</div>
                </div>
              ))}
            </div>

            {/* Form nueva obra */}
            {showNuevaObra && esGestion && (
              <div style={S.card}>
                <h3 style={{ margin: "0 0 14px", color: "#fff", fontSize: 14, fontWeight: 700 }}>Nueva obra</h3>
                <form onSubmit={crearObra}>
                  <div style={{ display: "grid", gridTemplateColumns: "140px 1fr 110px 130px 130px", gap: 12 }}>
                    <div><label style={S.label}>Código *</label><input style={{ ...S.input, width: "100%" }} placeholder="43-12" required value={formObra.codigo} onChange={e => setFormObra(f => ({ ...f, codigo: e.target.value }))} /></div>
                    <div><label style={S.label}>Descripción</label><input style={{ ...S.input, width: "100%" }} placeholder="Klase 43 – Casco 12" value={formObra.descripcion} onChange={e => setFormObra(f => ({ ...f, descripcion: e.target.value }))} /></div>
                    <div><label style={S.label}>Tipo</label>
                      <select style={{ ...S.input, width: "100%" }} value={formObra.tipo} onChange={e => setFormObra(f => ({ ...f, tipo: e.target.value }))}>
                        <option value="barco">Barco</option>
                        <option value="mueble">Mueble</option>
                        <option value="otro">Otro</option>
                      </select>
                    </div>
                    <div><label style={S.label}>Inicio</label><input style={{ ...S.input, width: "100%" }} type="date" value={formObra.fecha_inicio} onChange={e => setFormObra(f => ({ ...f, fecha_inicio: e.target.value }))} /></div>
                    <div><label style={S.label}>Fin estimado</label><input style={{ ...S.input, width: "100%" }} type="date" value={formObra.fecha_fin_estimada} onChange={e => setFormObra(f => ({ ...f, fecha_fin_estimada: e.target.value }))} /></div>
                  </div>
                  <div style={{ marginTop: 10 }}><label style={S.label}>Notas</label><input style={{ ...S.input, width: "100%" }} value={formObra.notas} onChange={e => setFormObra(f => ({ ...f, notas: e.target.value }))} /></div>
                  <button type="submit" style={{ ...S.btnPrim, marginTop: 12 }}>Crear obra</button>
                </form>
              </div>
            )}

            {/* Split */}
            <div style={S.split}>

              {/* ── LISTA OBRAS ── */}
              <div>
                <div style={{ display: "flex", gap: 5, marginBottom: 8, flexWrap: "wrap" }}>
                  {["activa", "pausada", "terminada", "todos"].map(e => (
                    <button key={e} style={S.filterBtn(filtroEstado === e)} onClick={() => setFiltroEstado(e)}>
                      {e === "todos" ? "Todos" : e.charAt(0).toUpperCase() + e.slice(1)}
                    </button>
                  ))}
                </div>
                <input style={{ ...S.input, width: "100%", marginBottom: 10 }} placeholder="Buscar obra…" value={q} onChange={e => setQ(e.target.value)} />

                {loading && <div style={{ ...S.card, textAlign: "center", opacity: 0.4 }}>Cargando…</div>}

                {obrasFiltradas.map(o => {
                  const sel = obraSelId === o.id;
                  const al  = alertasPorObra[o.id] ?? { total: 0, criticas: 0 };
                  const pc  = procesoActual(o.id);
                  const dias = diasDesde(o.fecha_inicio);
                  return (
                    <div key={o.id} style={S.obraCard(sel)} onClick={() => setObraSelId(sel ? null : o.id)}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div>
                          <div style={{ color: "#fff", fontWeight: 800, fontSize: 16, fontFamily: "Montserrat, system-ui" }}>{o.codigo}</div>
                          {o.descripcion && <div style={{ ...S.small, marginTop: 2 }}>{o.descripcion}</div>}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
                          <span style={S.badge(o.estado)}>{ESTADO_OBRA[o.estado]?.label}</span>
                          {al.criticas > 0 && <span style={S.alertBadge(true)}>⚠ {al.criticas} crítico{al.criticas > 1 ? "s" : ""}</span>}
                        </div>
                      </div>
                      <div style={{ marginTop: 7, display: "flex", gap: 12, flexWrap: "wrap", fontSize: 11, opacity: 0.5 }}>
                        {dias != null && <span>📅 {dias}d en obra</span>}
                        {o.fecha_fin_estimada && <span>🏁 Est: {fmtDate(o.fecha_fin_estimada)}</span>}
                        {pc && <span style={{ color: pc.procesos?.color ?? "#fff" }}>{pc.procesos?.icono} {pc.procesos?.nombre}</span>}
                      </div>

                      {/* Acciones rápidas al seleccionar */}
                      {sel && esGestion && (
                        <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }} onClick={e => e.stopPropagation()}>
                          {o.estado !== "activa"    && <button style={S.btnSm} onClick={() => cambiarEstado(o.id, "activa")}>▶ Activar</button>}
                          {o.estado !== "pausada"   && <button style={S.btnSm} onClick={() => cambiarEstado(o.id, "pausada")}>⏸ Pausar</button>}
                          {o.estado !== "terminada" && <button style={S.btnSm} onClick={() => cambiarEstado(o.id, "terminada")}>✓ Terminar</button>}
                          <button style={S.btnDel} onClick={() => setShowConfirmDel(o.id)}>🗑 Borrar</button>
                        </div>
                      )}
                    </div>
                  );
                })}

                {!loading && obrasFiltradas.length === 0 && (
                  <div style={{ ...S.card, textAlign: "center", opacity: 0.35, padding: 30 }}>Sin obras.</div>
                )}
              </div>

              {/* ── DETALLE OBRA ── */}
              <div>
                {!obraSel ? (
                  <div style={{ ...S.card, textAlign: "center", opacity: 0.3, padding: 60 }}>
                    Seleccioná una obra para ver su timeline
                  </div>
                ) : (
                  <>
                    {/* Header obra */}
                    <div style={S.card}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div>
                          <h2 style={{ margin: 0, color: "#fff", fontFamily: "Montserrat, system-ui", fontSize: 20, fontWeight: 900 }}>{obraSel.codigo}</h2>
                          {obraSel.descripcion && <div style={{ ...S.small, marginTop: 3 }}>{obraSel.descripcion}</div>}
                          {obraSel.notas && <div style={{ marginTop: 6, fontSize: 12, opacity: 0.5, fontStyle: "italic" }}>{obraSel.notas}</div>}
                        </div>
                        <span style={S.badge(obraSel.estado)}>{ESTADO_OBRA[obraSel.estado]?.label}</span>
                      </div>
                      <div style={{ marginTop: 12, display: "flex", gap: 20, fontSize: 12, opacity: 0.55, flexWrap: "wrap" }}>
                        {obraSel.fecha_inicio && <span>📅 Inicio: {fmtDate(obraSel.fecha_inicio)}</span>}
                        {obraSel.fecha_fin_estimada && <span>🏁 Est: {fmtDate(obraSel.fecha_fin_estimada)}</span>}
                        {obraSel.fecha_fin_real && <span>✅ Real: {fmtDate(obraSel.fecha_fin_real)}</span>}
                        {obraSel.fecha_inicio && !obraSel.fecha_fin_real && <span>⏱ {diasDesde(obraSel.fecha_inicio)} días en producción</span>}
                      </div>
                      {/* Alertas activas */}
                      {alertas.filter(a => a.obra_id === obraSel.id).map(a => (
                        <div key={a.id} style={{
                          marginTop: 8, padding: "7px 12px", borderRadius: 8, fontSize: 12,
                          background: a.gravedad === "critical" ? "rgba(255,69,58,0.07)" : "rgba(255,214,10,0.06)",
                          border:     a.gravedad === "critical" ? "1px solid rgba(255,69,58,0.2)" : "1px solid rgba(255,214,10,0.2)",
                          color:      a.gravedad === "critical" ? "#ff6b6b" : "#ffd60a",
                        }}>{a.gravedad === "critical" ? "🔴" : "⚠️"} {a.mensaje}</div>
                      ))}
                    </div>

                    {/* Timeline por procesos */}
                    <div style={S.card}>
                      <h3 style={{ margin: "0 0 14px", color: "#fff", fontSize: 14, fontWeight: 700 }}>Timeline de producción</h3>

                      {procesos.map((p, idx) => {
                        const t = tlSel.find(t => t.proceso_id === p.id);
                        const diasActuales = t?.dias_reales != null ? t.dias_reales
                          : t?.fecha_inicio ? Math.floor((Date.now() - new Date(t.fecha_inicio + "T00:00:00")) / 86400000)
                          : null;
                        const comp = diasActuales != null ? comparacion(p.id, diasActuales) : null;

                        // Checks de este proceso en esta obra
                        const checksProc = checks.filter(c => c.obra_id === obraSel.id && c.proceso_id === p.id);
                        const checksDone = checksProc.filter(c => c.completado).length;
                        const isExpanded = expandedProc[p.id] ?? (t?.estado === "en_curso");

                        return (
                          <div key={p.id} style={{ ...S.procRow, marginBottom: idx < procesos.length - 1 ? 8 : 0, background: t ? "rgba(255,255,255,0.015)" : "transparent" }}>
                            {/* Header del proceso */}
                            <div style={S.procHeader} onClick={() => setExpandedProc(prev => ({ ...prev, [p.id]: !isExpanded }))}>
                              {/* Dot */}
                              <div style={{
                                width: 10, height: 10, borderRadius: "50%", flexShrink: 0,
                                background: t ? (t.estado === "en_curso" ? p.color ?? "#ffd60a" : t.estado === "completado" ? "#30d158" : "#444") : "#1e1e1e",
                                boxShadow: t?.estado === "en_curso" ? `0 0 8px ${p.color ?? "#ffd60a"}88` : "none",
                              }} />
                              <span style={{ fontSize: 15, flexShrink: 0 }}>{p.icono}</span>
                              <div style={{ flex: 1 }}>
                                <span style={{ fontWeight: t ? 700 : 400, color: t ? "#fff" : "rgba(255,255,255,0.35)", fontSize: 13 }}>{p.nombre}</span>
                                {t?.estado === "en_curso" && <span style={{ marginLeft: 8, fontSize: 10, color: "#ffd60a", fontWeight: 700 }}>EN CURSO</span>}
                                {t?.estado === "completado" && <span style={{ marginLeft: 8, fontSize: 10, color: "#30d158", fontWeight: 700 }}>COMPLETADO</span>}
                              </div>

                              {/* Comparación */}
                              {comp && (
                                <div style={{ fontSize: 11, display: "flex", gap: 8, alignItems: "center" }}>
                                  <span style={{ opacity: 0.4 }}>prom {comp.promedio}d</span>
                                  <span style={{ color: comp.color, fontWeight: 700 }}>{diasActuales}d {comp.label}</span>
                                </div>
                              )}
                              {!t && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>{p.dias_esperados}d est.</span>}
                              {checksProc.length > 0 && (
                                <span style={{
                                  fontSize: 10, padding: "2px 7px", borderRadius: 6,
                                  background: checksDone === checksProc.length ? "rgba(48,209,88,0.15)" : "rgba(255,255,255,0.06)",
                                  color: checksDone === checksProc.length ? "#30d158" : "#888",
                                }}>
                                  {checksDone}/{checksProc.length}
                                </span>
                              )}
                              <span style={{ fontSize: 10, opacity: 0.3, marginLeft: 4 }}>{isExpanded ? "▲" : "▼"}</span>
                            </div>

                            {/* Contenido expandido */}
                            {isExpanded && (
                              <div>
                                {/* Fechas */}
                                {t && (
                                  <div style={{ padding: "6px 14px 6px 40px", fontSize: 11, opacity: 0.45, display: "flex", gap: 16, flexWrap: "wrap", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                                    {t.fecha_inicio && <span>Inicio: {fmtDate(t.fecha_inicio)}</span>}
                                    {t.fecha_fin    && <span>Fin: {fmtDate(t.fecha_fin)}</span>}
                                    {t.notas && <span>· {t.notas}</span>}
                                  </div>
                                )}

                                {/* Barra de progreso */}
                                {diasActuales != null && p.dias_esperados > 0 && (
                                  <div style={{ padding: "0 14px 8px 40px" }}>
                                    <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 99, overflow: "hidden" }}>
                                      <div style={{
                                        height: "100%", borderRadius: 99,
                                        width: `${Math.min(100, (diasActuales / p.dias_esperados) * 100)}%`,
                                        background: comp?.color ?? "#30d158",
                                      }} />
                                    </div>
                                  </div>
                                )}

                                {/* Checklist */}
                                {checksProc.map(c => (
                                  <div key={c.id} style={S.checkItem(c.completado)}>
                                    <div style={S.checkbox(c.completado)} onClick={() => toggleCheck(c.id, c.completado)}>
                                      {c.completado && "✓"}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                      <span style={{ fontSize: 12, color: c.completado ? "rgba(255,255,255,0.4)" : "#d0d0d0", textDecoration: c.completado ? "line-through" : "none" }}>{c.texto}</span>
                                      {c.completado && c.completado_por && (
                                        <span style={{ fontSize: 10, opacity: 0.35, marginLeft: 8 }}>{c.completado_por}</span>
                                      )}
                                    </div>
                                  </div>
                                ))}

                                {/* Acciones del proceso */}
                                {esGestion && (
                                  <div style={{ padding: "8px 14px", borderTop: "1px solid rgba(255,255,255,0.04)", display: "flex", gap: 6, flexWrap: "wrap" }}>
                                    {!t && (
                                      <button style={{ ...S.btnSm, color: "#fff" }} onClick={() => iniciarProceso(obraSel.id, p.id)}>▶ Iniciar</button>
                                    )}
                                    {t?.estado === "en_curso" && (
                                      <button style={{ ...S.btnSm, color: "#30d158", borderColor: "rgba(48,209,88,0.3)" }} onClick={() => completarProceso(t.id)}>✓ Completar</button>
                                    )}
                                    {t && (
                                      <button style={S.btnSm} onClick={() => setAddStepFor({ obraId: obraSel.id, procesoId: p.id })}>+ Paso</button>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Análisis tiempos */}
                    {tlSel.some(t => t.dias_reales != null) && (
                      <div style={S.card}>
                        <h3 style={{ margin: "0 0 12px", color: "#fff", fontSize: 14, fontWeight: 700 }}>Análisis de tiempos</h3>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8 }}>
                          {tlSel.filter(t => t.dias_reales != null).map(t => {
                            const c = comparacion(t.proceso_id, t.dias_reales);
                            return (
                              <div key={t.id} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: "10px 14px" }}>
                                <div style={{ fontSize: 11, opacity: 0.4 }}>{t.procesos?.icono} {t.procesos?.nombre}</div>
                                <div style={{ fontSize: 22, fontWeight: 900, color: c?.color ?? "#fff", fontFamily: "Montserrat, system-ui", marginTop: 2 }}>{t.dias_reales}d</div>
                                {c && <div style={{ fontSize: 11, opacity: 0.45, marginTop: 2 }}>Prom: {c.promedio}d {c.demora > 0 ? `(+${c.demora}d)` : "(✓)"}</div>}
                              </div>
                            );
                          })}
                          {obraSel.fecha_inicio && obraSel.fecha_fin_real && (
                            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "10px 14px", gridColumn: "1 / -1" }}>
                              <div style={{ fontSize: 11, opacity: 0.4 }}>⏱ TIEMPO TOTAL</div>
                              <div style={{ fontSize: 26, fontWeight: 900, color: "#fff", fontFamily: "Montserrat, system-ui", marginTop: 2 }}>{diasEntre(obraSel.fecha_inicio, obraSel.fecha_fin_real)} días</div>
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

          {/* ── MODAL CONFIRMAR BORRAR ── */}
          {showConfirmDel && (
            <div style={S.overlay} onClick={() => setShowConfirmDel(null)}>
              <div style={S.modal} onClick={e => e.stopPropagation()}>
                <h2 style={{ margin: "0 0 10px", color: "#fff", fontSize: 16 }}>¿Borrar esta obra?</h2>
                <div style={{ fontSize: 13, opacity: 0.6, marginBottom: 20, lineHeight: 1.6 }}>
                  Se eliminarán la obra, todo su timeline y sus alertas asociadas.<br />
                  <span style={{ color: "#ff453a" }}>Esta acción no se puede deshacer.</span>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button style={{ ...S.btnDel, padding: "9px 18px", fontSize: 13, fontWeight: 700 }} onClick={() => borrarObra(showConfirmDel)}>
                    Sí, borrar
                  </button>
                  <button style={{ ...S.btn, flex: 1 }} onClick={() => setShowConfirmDel(null)}>Cancelar</button>
                </div>
              </div>
            </div>
          )}

          {/* ── MODAL AGREGAR PASO MANUAL ── */}
          {addStepFor && (
            <div style={S.overlay} onClick={() => setAddStepFor(null)}>
              <div style={S.modal} onClick={e => e.stopPropagation()}>
                <h2 style={{ margin: "0 0 16px", color: "#fff", fontSize: 15 }}>Agregar paso al proceso</h2>
                <input
                  style={{ ...S.input, width: "100%" }}
                  placeholder="Descripción del paso…"
                  value={newStepTxt}
                  onChange={e => setNewStepTxt(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && agregarCheck()}
                  autoFocus
                />
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button style={S.btnPrim} onClick={agregarCheck}>Agregar</button>
                  <button style={S.btn} onClick={() => setAddStepFor(null)}>Cancelar</button>
                </div>
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}
