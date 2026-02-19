import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import Sidebar from "../components/Sidebar";

export default function ProcedimientosScreen({ profile, signOut }) {
  const role    = profile?.role ?? "invitado";
  const isAdmin = !!profile?.is_admin;

  const [procedimientos, setProcedimientos] = useState([]);
  const [procesos,       setProcesos]       = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [selId,          setSelId]          = useState(null);
  const [q,              setQ]              = useState("");
  const [filtroProc,     setFiltroProc]     = useState("todos");
  const [err,            setErr]            = useState("");
  const [msg,            setMsg]            = useState("");

  // Modal edición (solo admin)
  const [showModal,   setShowModal]   = useState(false);
  const [editTarget,  setEditTarget]  = useState(null); // null = nuevo
  const [form, setForm] = useState({
    titulo: "", descripcion: "", contenido: "",
    proceso_id: "", rol_visible: "todos", orden: "", area: "",
  });
  const [pasosForm, setPasosForm] = useState([""]);

  async function cargar() {
    setLoading(true);
    const [r1, r2] = await Promise.all([
      supabase
        .from("procedimientos")
        .select("*, procesos(nombre,icono,color)")
        .eq("activo", true)
        .order("orden"),
      supabase.from("procesos").select("*").eq("activo", true).order("orden"),
    ]);

    let datos = r1.data ?? [];
    // Filtrar por rol si no es admin
    if (!isAdmin) {
      datos = datos.filter(p =>
        Array.isArray(p.rol_visible)
          ? p.rol_visible.includes(role) || p.rol_visible.includes("todos")
          : true
      );
    }

    setProcedimientos(datos);
    setProcesos(r2.data ?? []);
    setLoading(false);
  }

  useEffect(() => { cargar(); }, []);

  const filtrados = useMemo(() => {
    const qq = q.toLowerCase();
    return procedimientos.filter(p => {
      if (filtroProc !== "todos" && String(p.proceso_id) !== filtroProc) return false;
      if (qq && !p.titulo.toLowerCase().includes(qq) && !(p.descripcion ?? "").toLowerCase().includes(qq)) return false;
      return true;
    });
  }, [procedimientos, q, filtroProc]);

  const selProced = useMemo(() => procedimientos.find(p => p.id === selId), [procedimientos, selId]);

  function abrirNuevo() {
    setEditTarget(null);
    setForm({ titulo: "", descripcion: "", contenido: "", proceso_id: "", rol_visible: "todos", orden: "", area: "" });
    setPasosForm([""]);
    setShowModal(true);
  }

  function abrirEditar(p) {
    setEditTarget(p.id);
    setForm({
      titulo:       p.titulo ?? "",
      descripcion:  p.descripcion ?? "",
      contenido:    p.contenido ?? "",
      proceso_id:   p.proceso_id ?? "",
      rol_visible:  Array.isArray(p.rol_visible) ? p.rol_visible[0] : "todos",
      orden:        p.orden ?? "",
      area:         p.area ?? "",
    });
    const pasos = Array.isArray(p.pasos) && p.pasos.length > 0
      ? p.pasos.map(ps => (typeof ps === "string" ? ps : ps.texto ?? ""))
      : [""];
    setPasosForm(pasos);
    setShowModal(true);
  }

  async function guardar(e) {
    e.preventDefault();
    if (!form.titulo.trim()) return setErr("El título es obligatorio.");

    const payload = {
      titulo:       form.titulo.trim(),
      descripcion:  form.descripcion.trim() || null,
      contenido:    form.contenido.trim() || null,
      proceso_id:   form.proceso_id || null,
      rol_visible:  form.rol_visible === "todos" ? ["todos"] : [form.rol_visible],
      orden:        form.orden ? Number(form.orden) : null,
      area:         form.area.trim() || null,
      pasos:        pasosForm
                      .filter(p => p.trim())
                      .map((texto, i) => ({ orden: i + 1, texto })),
    };

    const { error } = editTarget
      ? await supabase.from("procedimientos").update(payload).eq("id", editTarget)
      : await supabase.from("procedimientos").insert({ ...payload, activo: true });

    if (error) return setErr(error.message);

    setMsg(editTarget ? "✅ Procedimiento actualizado." : "✅ Procedimiento creado.");
    setShowModal(false);
    setTimeout(() => setMsg(""), 2500);
    cargar();
  }

  async function archivar(id) {
    await supabase.from("procedimientos").update({ activo: false }).eq("id", id);
    setSelId(null);
    cargar();
  }

  const ROLES = ["todos", "admin", "oficina", "laminacion", "muebles", "panol", "mecanica", "electricidad"];

  const S = {
    page:    { background: "#000", minHeight: "100vh", color: "#d0d0d0", fontFamily: "Roboto, system-ui, Arial" },
    layout:  { display: "grid", gridTemplateColumns: "280px 1fr", minHeight: "100vh" },
    main:    { padding: 20, overflowY: "auto" },
    content: { width: "min(1200px,100%)", margin: "0 auto" },
    card:    { border: "1px solid #1e1e1e", borderRadius: 14, background: "#070707", padding: 16, marginBottom: 10 },
    input:   { background: "#0b0b0b", border: "1px solid #2a2a2a", color: "#fff", padding: "8px 12px", borderRadius: 10, width: "100%", fontSize: 13, outline: "none" },
    textarea:{ background: "#0b0b0b", border: "1px solid #2a2a2a", color: "#fff", padding: "8px 12px", borderRadius: 10, width: "100%", fontSize: 13, resize: "vertical", minHeight: 80, outline: "none" },
    label:   { fontSize: 10, letterSpacing: 1.5, opacity: 0.45, display: "block", marginBottom: 5, textTransform: "uppercase" },
    btn:     { border: "1px solid #2a2a2a", background: "#111", color: "#fff", padding: "7px 14px", borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 13 },
    btnPrim: { border: "none", background: "#fff", color: "#000", padding: "9px 18px", borderRadius: 10, cursor: "pointer", fontWeight: 900, fontSize: 13 },
    btnSm:   { border: "1px solid #2a2a2a", background: "transparent", color: "#888", padding: "4px 10px", borderRadius: 8, cursor: "pointer", fontSize: 11 },
    filterBtn: (act, color) => ({
      border: act ? `1px solid ${color ?? "#444"}` : "1px solid transparent",
      background: act ? (color ? `${color}15` : "#1a1a1a") : "transparent",
      color: act ? (color ?? "#fff") : "#555",
      padding: "5px 12px", borderRadius: 8, cursor: "pointer", fontSize: 11, fontWeight: act ? 700 : 400,
    }),
    procCard: (sel) => ({
      border: sel ? "1px solid #3a3a3a" : "1px solid #141414",
      borderRadius: 12, background: sel ? "#0f0f0f" : "#070707",
      padding: "12px 14px", marginBottom: 8, cursor: "pointer",
      transition: "all 0.15s",
    }),
    paso: {
      display: "flex", gap: 12, marginBottom: 10,
      background: "#0d0d0d", borderRadius: 10, padding: "10px 14px",
      border: "1px solid #1a1a1a",
    },
    numBadge: {
      width: 24, height: 24, borderRadius: "50%",
      background: "#1e1e1e", display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 11, fontWeight: 900, color: "#666", flexShrink: 0,
    },
    overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", backdropFilter: "blur(6px)", display: "flex", justifyContent: "center", alignItems: "flex-start", zIndex: 9999, padding: "40px 20px", overflowY: "auto" },
    modal:   { background: "#0d0d0d", border: "1px solid #2a2a2a", borderRadius: 16, padding: 28, width: "100%", maxWidth: 560 },
  };

  return (
    <div style={S.page}>
      <div style={S.layout}>
        <Sidebar profile={profile} signOut={signOut} />
        <main style={S.main}>
          <div style={S.content}>

            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <div>
                <h1 style={{ fontFamily: "Montserrat, system-ui, Arial", fontSize: 22, margin: 0, color: "#fff" }}>
                  Procedimientos
                </h1>
                <div style={{ fontSize: 12, opacity: 0.45, marginTop: 3 }}>
                  Instrucciones y SOP por área · solo ves los que te corresponden
                </div>
              </div>
              {isAdmin && (
                <button style={S.btnPrim} onClick={abrirNuevo}>+ Nuevo</button>
              )}
            </div>

            {err && <div style={{ ...S.card, borderColor: "#5a1d1d", color: "#ffbdbd" }}>{err}</div>}
            {msg && <div style={{ ...S.card, borderColor: "#1d5a2d", color: "#a6ffbf" }}>{msg}</div>}

            <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 16, alignItems: "start" }}>

              {/* ── LISTA ── */}
              <div>
                <input style={{ ...S.input, marginBottom: 10 }}
                  placeholder="Buscar…" value={q} onChange={e => setQ(e.target.value)} />

                {/* Filtro por proceso */}
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 12 }}>
                  <button style={S.filterBtn(filtroProc === "todos")} onClick={() => setFiltroProc("todos")}>
                    Todos
                  </button>
                  {procesos.map(p => (
                    <button key={p.id}
                      style={S.filterBtn(filtroProc === String(p.id), p.color)}
                      onClick={() => setFiltroProc(String(p.id))}>
                      {p.icono} {p.nombre}
                    </button>
                  ))}
                </div>

                {loading && <div style={{ opacity: 0.4, fontSize: 13 }}>Cargando…</div>}
                {!loading && filtrados.length === 0 && (
                  <div style={{ opacity: 0.35, fontSize: 13, padding: 20, textAlign: "center" }}>
                    Sin procedimientos disponibles.
                  </div>
                )}

                {filtrados.map(p => (
                  <div key={p.id}
                    style={S.procCard(selId === p.id)}
                    onClick={() => setSelId(selId === p.id ? null : p.id)}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <span style={{ fontSize: 20, flexShrink: 0 }}>
                        {p.procesos?.icono ?? "📄"}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: "#fff", fontWeight: 600, fontSize: 13, lineHeight: 1.3 }}>
                          {p.titulo}
                        </div>
                        {p.procesos?.nombre && (
                          <div style={{ fontSize: 10, opacity: 0.4, marginTop: 3 }}>{p.procesos.nombre}</div>
                        )}
                        {p.descripcion && (
                          <div style={{ fontSize: 11, opacity: 0.45, marginTop: 4, lineHeight: 1.4,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {p.descripcion}
                          </div>
                        )}
                        {Array.isArray(p.pasos) && p.pasos.length > 0 && (
                          <div style={{ fontSize: 10, opacity: 0.35, marginTop: 4 }}>
                            {p.pasos.length} paso{p.pasos.length !== 1 ? "s" : ""}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* ── DETALLE ── */}
              <div>
                {!selProced ? (
                  <div style={{ ...S.card, textAlign: "center", padding: 60, opacity: 0.3 }}>
                    Seleccioná un procedimiento para ver los detalles
                  </div>
                ) : (
                  <div style={S.card}>
                    {/* Header detalle */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <span style={{ fontSize: 28 }}>{selProced.procesos?.icono ?? "📄"}</span>
                        <div>
                          <h2 style={{ margin: 0, color: "#fff", fontSize: 18, fontFamily: "Montserrat, system-ui" }}>
                            {selProced.titulo}
                          </h2>
                          <div style={{ fontSize: 11, opacity: 0.4, marginTop: 3, display: "flex", gap: 10 }}>
                            {selProced.procesos?.nombre && <span>{selProced.procesos.nombre}</span>}
                            {selProced.area && <span>· {selProced.area}</span>}
                            {Array.isArray(selProced.rol_visible) && (
                              <span>· {selProced.rol_visible.join(", ")}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      {isAdmin && (
                        <div style={{ display: "flex", gap: 6 }}>
                          <button style={S.btnSm} onClick={() => abrirEditar(selProced)}>✏️ Editar</button>
                          <button style={{ ...S.btnSm, color: "#ff453a", borderColor: "#ff453a44" }}
                            onClick={() => { if (confirm("¿Archivar este procedimiento?")) archivar(selProced.id); }}>
                            Archivar
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Descripción */}
                    {selProced.descripcion && (
                      <div style={{ fontSize: 13, opacity: 0.7, lineHeight: 1.6, marginBottom: 16,
                        padding: "10px 14px", background: "#0d0d0d", borderRadius: 10, border: "1px solid #1a1a1a" }}>
                        {selProced.descripcion}
                      </div>
                    )}

                    {/* Pasos */}
                    {Array.isArray(selProced.pasos) && selProced.pasos.length > 0 && (
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 10, letterSpacing: 1.5, opacity: 0.4, marginBottom: 10, textTransform: "uppercase" }}>
                          Pasos ({selProced.pasos.length})
                        </div>
                        {selProced.pasos.map((paso, i) => (
                          <div key={i} style={S.paso}>
                            <div style={S.numBadge}>{i + 1}</div>
                            <div style={{ fontSize: 13, lineHeight: 1.6, color: "#ccc", paddingTop: 2 }}>
                              {typeof paso === "string" ? paso : paso.texto ?? JSON.stringify(paso)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Contenido libre */}
                    {selProced.contenido && (
                      <div style={{ fontSize: 13, opacity: 0.6, lineHeight: 1.7, whiteSpace: "pre-wrap",
                        borderTop: "1px solid #1a1a1a", paddingTop: 14, marginTop: 8 }}>
                        {selProced.contenido}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── MODAL CREAR/EDITAR ── */}
          {showModal && isAdmin && (
            <div style={S.overlay} onClick={e => e.target === e.currentTarget && setShowModal(false)}>
              <div style={S.modal}>
                <h2 style={{ margin: "0 0 20px", color: "#fff", fontSize: 17 }}>
                  {editTarget ? "Editar procedimiento" : "Nuevo procedimiento"}
                </h2>

                <form onSubmit={guardar}>
                  <div style={{ marginBottom: 14 }}>
                    <label style={S.label}>Título *</label>
                    <input style={S.input} required value={form.titulo}
                      onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} autoFocus />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                    <div>
                      <label style={S.label}>Proceso</label>
                      <select style={S.input} value={form.proceso_id}
                        onChange={e => setForm(f => ({ ...f, proceso_id: e.target.value }))}>
                        <option value="">— General —</option>
                        {procesos.map(p => (
                          <option key={p.id} value={p.id}>{p.icono} {p.nombre}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={S.label}>Visible para</label>
                      <select style={S.input} value={form.rol_visible}
                        onChange={e => setForm(f => ({ ...f, rol_visible: e.target.value }))}>
                        {ROLES.map(r => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 80px", gap: 10, marginBottom: 14 }}>
                    <div>
                      <label style={S.label}>Área</label>
                      <input style={S.input} placeholder="Ej: Laminación" value={form.area}
                        onChange={e => setForm(f => ({ ...f, area: e.target.value }))} />
                    </div>
                    <div>
                      <label style={S.label}>Orden</label>
                      <input type="number" style={S.input} value={form.orden}
                        onChange={e => setForm(f => ({ ...f, orden: e.target.value }))} />
                    </div>
                  </div>

                  <div style={{ marginBottom: 14 }}>
                    <label style={S.label}>Descripción breve</label>
                    <input style={S.input} value={form.descripcion}
                      onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
                  </div>

                  {/* Pasos dinámicos */}
                  <div style={{ marginBottom: 14 }}>
                    <label style={S.label}>Pasos del procedimiento</label>
                    {pasosForm.map((paso, i) => (
                      <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center" }}>
                        <span style={{ width: 20, opacity: 0.35, fontSize: 12, textAlign: "right", flexShrink: 0 }}>
                          {i + 1}.
                        </span>
                        <input style={{ ...S.input, flex: 1 }} placeholder={`Paso ${i + 1}…`}
                          value={paso}
                          onChange={e => {
                            const n = [...pasosForm];
                            n[i] = e.target.value;
                            setPasosForm(n);
                          }} />
                        <button type="button" style={S.btnSm}
                          onClick={() => setPasosForm(p => p.filter((_, j) => j !== i))}>✕</button>
                      </div>
                    ))}
                    <button type="button" style={{ ...S.btnSm, marginTop: 4 }}
                      onClick={() => setPasosForm(p => [...p, ""])}>
                      + Agregar paso
                    </button>
                  </div>

                  <div style={{ marginBottom: 20 }}>
                    <label style={S.label}>Notas adicionales (texto libre)</label>
                    <textarea style={S.textarea} value={form.contenido}
                      onChange={e => setForm(f => ({ ...f, contenido: e.target.value }))} />
                  </div>

                  {err && <div style={{ color: "#ff6b6b", fontSize: 12, marginBottom: 10 }}>{err}</div>}

                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="submit" style={S.btnPrim}>
                      {editTarget ? "Guardar cambios" : "Crear procedimiento"}
                    </button>
                    <button type="button" style={S.btn} onClick={() => setShowModal(false)}>
                      Cancelar
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}
