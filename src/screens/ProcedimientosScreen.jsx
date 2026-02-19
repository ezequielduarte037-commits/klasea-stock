import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import Sidebar from "../components/Sidebar";
import NotificacionesBell from "../components/NotificacionesBell";

const ROLES = ["todos", "admin", "oficina", "laminacion", "muebles", "panol", "mecanica", "electricidad"];

export default function ProcedimientosScreen({ profile, signOut }) {
  const role    = profile?.role ?? "invitado";
  const isAdmin = !!profile?.is_admin || role === "admin";

  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [selId,   setSelId]   = useState(null);
  const [q,       setQ]       = useState("");
  const [filtCat, setFiltCat] = useState("todas");
  const [err,     setErr]     = useState("");
  const [msg,     setMsg]     = useState("");

  const [showModal,  setShowModal]  = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [form, setForm] = useState({ titulo: "", descripcion: "", contenido: "", categoria: "", rol_visible: "todos" });
  const [pasos, setPasos] = useState([""]);

  async function cargar() {
    setLoading(true);
    const { data } = await supabase
      .from("procedimientos")
      .select("id,titulo,descripcion,contenido,pasos,categoria,area,rol_visible,orden,activo,created_at")
      .eq("activo", true)
      .order("orden", { ascending: true, nullsFirst: false });

    let lista = data ?? [];
    // Filtrar por rol si no es admin
    if (!isAdmin) {
      lista = lista.filter(p => {
        const rv = Array.isArray(p.rol_visible) ? p.rol_visible : [p.rol_visible ?? "todos"];
        return rv.includes(role) || rv.includes("todos");
      });
    }
    setItems(lista);
    setLoading(false);
  }

  useEffect(() => { cargar(); }, []);

  // Categorías únicas de los procedimientos existentes
  const categorias = useMemo(() => {
    const cats = new Set(items.map(p => (p.categoria || p.area || "General").trim()).filter(Boolean));
    return ["todas", ...Array.from(cats).sort()];
  }, [items]);

  const filtrados = useMemo(() => {
    const qq = q.toLowerCase();
    return items.filter(p => {
      const cat = (p.categoria || p.area || "General").trim();
      if (filtCat !== "todas" && cat !== filtCat) return false;
      if (qq && !p.titulo.toLowerCase().includes(qq) && !(p.descripcion ?? "").toLowerCase().includes(qq)) return false;
      return true;
    });
  }, [items, q, filtCat]);

  const selItem = useMemo(() => items.find(p => p.id === selId), [items, selId]);

  function abrirNuevo() {
    setEditTarget(null);
    setForm({ titulo: "", descripcion: "", contenido: "", categoria: "", rol_visible: "todos" });
    setPasos([""]);
    setShowModal(true);
  }

  function abrirEditar(p) {
    setEditTarget(p.id);
    setForm({
      titulo:      p.titulo ?? "",
      descripcion: p.descripcion ?? "",
      contenido:   p.contenido ?? "",
      categoria:   p.categoria || p.area || "",
      rol_visible: Array.isArray(p.rol_visible) ? (p.rol_visible[0] ?? "todos") : "todos",
    });
    setPasos(Array.isArray(p.pasos) && p.pasos.length ? p.pasos.map(s => s.texto ?? s) : [""]);
    setShowModal(true);
  }

  async function guardar(e) {
    e.preventDefault();
    if (!form.titulo.trim()) return setErr("El título es obligatorio.");

    const payload = {
      titulo:      form.titulo.trim(),
      descripcion: form.descripcion.trim() || null,
      contenido:   form.contenido.trim() || null,
      categoria:   form.categoria.trim() || null,
      area:        form.categoria.trim() || null,
      rol_visible: [form.rol_visible],
      pasos:       pasos.filter(p => p.trim()).map((texto, i) => ({ orden: i + 1, texto })),
      activo:      true,
    };

    let error;
    if (editTarget) {
      ({ error } = await supabase.from("procedimientos").update(payload).eq("id", editTarget));
    } else {
      ({ error } = await supabase.from("procedimientos").insert(payload));
    }

    if (error) return setErr(error.message);
    setMsg(editTarget ? "✅ Actualizado." : "✅ Procedimiento creado.");
    setShowModal(false);
    setSelId(null);
    cargar();
    setTimeout(() => setMsg(""), 2500);
  }

  async function archivar(id) {
    await supabase.from("procedimientos").update({ activo: false }).eq("id", id);
    setSelId(null);
    cargar();
  }

  const S = {
    page:    { background: "#000", minHeight: "100vh", color: "#d0d0d0", fontFamily: "-apple-system, 'Helvetica Neue', sans-serif" },
    layout:  { display: "grid", gridTemplateColumns: "280px 1fr", minHeight: "100vh" },
    main:    { padding: "20px 24px", overflow: "auto" },
    content: { width: "min(1300px,100%)", margin: "0 auto" },
    card:    { border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, background: "rgba(255,255,255,0.02)", padding: 16, marginBottom: 12 },
    input:   { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", padding: "8px 12px", borderRadius: 10, fontSize: 13, outline: "none" },
    textarea:{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", padding: "8px 12px", borderRadius: 10, fontSize: 13, outline: "none", resize: "vertical", minHeight: 100 },
    label:   { fontSize: 10, letterSpacing: 1.5, opacity: 0.4, display: "block", marginBottom: 5, textTransform: "uppercase", fontWeight: 600 },
    btn:     { border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "#fff", padding: "8px 14px", borderRadius: 10, cursor: "pointer", fontWeight: 600, fontSize: 13 },
    btnPrim: { border: "1px solid rgba(255,255,255,0.2)", background: "#fff", color: "#000", padding: "8px 18px", borderRadius: 10, cursor: "pointer", fontWeight: 800, fontSize: 13 },
    btnSm:   { border: "1px solid rgba(255,255,255,0.08)", background: "transparent", color: "#888", padding: "4px 10px", borderRadius: 7, cursor: "pointer", fontSize: 11 },
    small:   { fontSize: 11, opacity: 0.4 },
    split:   { display: "grid", gridTemplateColumns: "300px 1fr", gap: 16, alignItems: "start" },

    catBadge: { fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 6, background: "rgba(10,132,255,0.12)", color: "#0a84ff", border: "1px solid rgba(10,132,255,0.2)" },
    rolBadge: { fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 6, background: "rgba(255,255,255,0.05)", color: "#888", border: "1px solid rgba(255,255,255,0.08)" },

    filterBtn: (act) => ({
      border:  act ? "1px solid rgba(255,255,255,0.2)" : "1px solid transparent",
      background: act ? "rgba(255,255,255,0.06)" : "transparent",
      color:   act ? "#fff" : "rgba(255,255,255,0.35)",
      padding: "5px 12px", borderRadius: 8, cursor: "pointer",
      fontSize: 12, fontWeight: act ? 700 : 400, whiteSpace: "nowrap",
    }),
    itemCard: (sel) => ({
      border: sel ? "1px solid rgba(255,255,255,0.15)" : "1px solid rgba(255,255,255,0.05)",
      borderRadius: 12, background: sel ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.01)",
      padding: "12px 14px", cursor: "pointer", marginBottom: 7, transition: "all 0.15s",
    }),
    paso: (done) => ({
      display: "flex", alignItems: "flex-start", gap: 12,
      padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.04)",
    }),
    overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)", display: "flex", justifyContent: "center", alignItems: "flex-start", zIndex: 9999, padding: "40px 20px", overflowY: "auto" },
    modal:   { background: "rgba(8,8,8,0.98)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 18, padding: 28, width: "100%", maxWidth: 540, boxShadow: "0 30px 80px rgba(0,0,0,0.9)" },
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
                <div style={{ fontSize: 10, letterSpacing: 3, opacity: 0.3, marginBottom: 5, textTransform: "uppercase", fontWeight: 600 }}>Instrucciones</div>
                <h1 style={{ fontFamily: "Montserrat, system-ui", fontSize: 24, margin: 0, color: "#fff", fontWeight: 900, letterSpacing: -0.5 }}>
                  Procedimientos
                </h1>
              </div>
              {isAdmin && <button style={S.btnPrim} onClick={abrirNuevo}>+ Nuevo</button>}
            </div>

            {err && <div style={{ ...S.card, borderColor: "rgba(255,69,58,0.3)", color: "#ff6b6b", background: "rgba(255,69,58,0.05)" }}>{err}</div>}
            {msg && <div style={{ ...S.card, borderColor: "rgba(48,209,88,0.3)", color: "#a6ffbf", background: "rgba(48,209,88,0.05)" }}>{msg}</div>}

            {/* Filtros */}
            <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
              {categorias.map(cat => (
                <button key={cat} style={S.filterBtn(filtCat === cat)} onClick={() => setFiltCat(cat)}>
                  {cat === "todas" ? "Todas las categorías" : cat}
                </button>
              ))}
            </div>

            <div style={S.split}>

              {/* ── LISTA ── */}
              <div>
                <input style={{ ...S.input, width: "100%", marginBottom: 10 }} placeholder="Buscar…" value={q} onChange={e => setQ(e.target.value)} />

                {loading && <div style={{ ...S.card, textAlign: "center", opacity: 0.4 }}>Cargando…</div>}

                {!loading && filtrados.length === 0 && (
                  <div style={{ ...S.card, textAlign: "center", opacity: 0.35, padding: 30 }}>
                    {items.length === 0
                      ? isAdmin
                        ? "Aún no hay procedimientos. Hacé clic en "+ Nuevo" para crear el primero."
                        : "No hay procedimientos disponibles para tu rol."
                      : "Sin resultados para este filtro."
                    }
                  </div>
                )}

                {filtrados.map(p => {
                  const cat = (p.categoria || p.area || "General").trim();
                  const rv  = Array.isArray(p.rol_visible) ? p.rol_visible : [p.rol_visible ?? "todos"];
                  const sel = selId === p.id;
                  return (
                    <div key={p.id} style={S.itemCard(sel)} onClick={() => setSelId(sel ? null : p.id)}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{p.titulo}</div>
                          {p.descripcion && <div style={{ ...S.small, marginTop: 3, lineHeight: 1.4 }}>{p.descripcion}</div>}
                        </div>
                        <span style={S.catBadge}>{cat}</span>
                      </div>
                      <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                        {Array.isArray(p.pasos) && p.pasos.length > 0 && (
                          <span style={S.small}>{p.pasos.length} paso{p.pasos.length > 1 ? "s" : ""}</span>
                        )}
                        {!rv.includes("todos") && rv.map(r => (
                          <span key={r} style={S.rolBadge}>{r}</span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* ── DETALLE ── */}
              <div>
                {!selItem ? (
                  <div style={{ ...S.card, textAlign: "center", opacity: 0.3, padding: 60 }}>
                    Seleccioná un procedimiento para leerlo
                  </div>
                ) : (
                  <div style={S.card}>
                    {/* Header */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                      <div style={{ flex: 1, marginRight: 12 }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
                          <span style={S.catBadge}>{(selItem.categoria || selItem.area || "General").trim()}</span>
                          {(() => {
                            const rv = Array.isArray(selItem.rol_visible) ? selItem.rol_visible : [selItem.rol_visible ?? "todos"];
                            return !rv.includes("todos") ? rv.map(r => <span key={r} style={S.rolBadge}>{r}</span>) : null;
                          })()}
                        </div>
                        <h2 style={{ margin: 0, color: "#fff", fontSize: 20, fontFamily: "Montserrat, system-ui", fontWeight: 900 }}>
                          {selItem.titulo}
                        </h2>
                        {selItem.descripcion && (
                          <p style={{ margin: "8px 0 0", fontSize: 13, opacity: 0.55, lineHeight: 1.6 }}>{selItem.descripcion}</p>
                        )}
                      </div>
                      {isAdmin && (
                        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                          <button style={S.btnSm} onClick={() => abrirEditar(selItem)}>✏️ Editar</button>
                          <button style={{ ...S.btnSm, color: "#ff453a", borderColor: "rgba(255,69,58,0.2)" }} onClick={() => archivar(selItem.id)}>🗑</button>
                        </div>
                      )}
                    </div>

                    {/* Descripción larga */}
                    {selItem.contenido && (
                      <div style={{ marginBottom: 20, padding: "12px 16px", background: "rgba(255,255,255,0.02)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.05)" }}>
                        <div style={{ fontSize: 10, opacity: 0.4, letterSpacing: 1.5, marginBottom: 8, textTransform: "uppercase", fontWeight: 600 }}>Descripción</div>
                        <div style={{ fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap", color: "#c8c8c8" }}>{selItem.contenido}</div>
                      </div>
                    )}

                    {/* Pasos */}
                    {Array.isArray(selItem.pasos) && selItem.pasos.length > 0 && (
                      <div>
                        <div style={{ fontSize: 10, opacity: 0.4, letterSpacing: 1.5, marginBottom: 12, textTransform: "uppercase", fontWeight: 600 }}>
                          Pasos ({selItem.pasos.length})
                        </div>
                        {selItem.pasos.map((paso, i) => {
                          const texto = typeof paso === "string" ? paso : paso.texto;
                          return (
                            <div key={i} style={S.paso()}>
                              <div style={{
                                width: 26, height: 26, borderRadius: "50%",
                                border: "1px solid rgba(255,255,255,0.1)",
                                background: "rgba(255,255,255,0.04)",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontSize: 11, fontWeight: 800, color: "#fff",
                                flexShrink: 0, fontFamily: "Montserrat, system-ui",
                              }}>
                                {i + 1}
                              </div>
                              <div style={{ flex: 1, paddingTop: 4, fontSize: 14, lineHeight: 1.5, color: "#d0d0d0" }}>
                                {texto}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Vacío */}
                    {!selItem.contenido && (!Array.isArray(selItem.pasos) || !selItem.pasos.length) && (
                      <div style={{ textAlign: "center", opacity: 0.3, padding: "30px 0", fontSize: 13 }}>
                        Este procedimiento no tiene contenido aún.
                        {isAdmin && <span> Hacé clic en "Editar" para agregarlo.</span>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── MODAL NUEVO / EDITAR ── */}
          {showModal && (
            <div style={S.overlay} onClick={e => e.target === e.currentTarget && setShowModal(false)}>
              <div style={S.modal}>
                <h2 style={{ margin: "0 0 20px", color: "#fff", fontSize: 16, fontFamily: "Montserrat, system-ui", fontWeight: 800 }}>
                  {editTarget ? "Editar procedimiento" : "Nuevo procedimiento"}
                </h2>
                <form onSubmit={guardar}>
                  <div style={{ marginBottom: 12 }}>
                    <label style={S.label}>Título *</label>
                    <input style={{ ...S.input, width: "100%" }} required value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} autoFocus />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                    <div>
                      <label style={S.label}>Categoría</label>
                      <input
                        style={{ ...S.input, width: "100%" }}
                        placeholder="Ej: Seguridad, Calidad…"
                        list="cats-list"
                        value={form.categoria}
                        onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}
                      />
                      <datalist id="cats-list">
                        {categorias.filter(c => c !== "todas").map(c => <option key={c} value={c} />)}
                      </datalist>
                    </div>
                    <div>
                      <label style={S.label}>Visible para</label>
                      <select style={{ ...S.input, width: "100%" }} value={form.rol_visible} onChange={e => setForm(f => ({ ...f, rol_visible: e.target.value }))}>
                        {ROLES.map(r => <option key={r} value={r}>{r === "todos" ? "Todos" : r}</option>)}
                      </select>
                    </div>
                  </div>

                  <div style={{ marginBottom: 12 }}>
                    <label style={S.label}>Descripción breve</label>
                    <input style={{ ...S.input, width: "100%" }} placeholder="Resumen en una línea…" value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
                  </div>

                  <div style={{ marginBottom: 14 }}>
                    <label style={S.label}>Contenido / notas</label>
                    <textarea style={{ ...S.textarea, width: "100%" }} placeholder="Detalles, advertencias, notas técnicas…" value={form.contenido} onChange={e => setForm(f => ({ ...f, contenido: e.target.value }))} />
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <label style={S.label}>Pasos</label>
                    {pasos.map((p, i) => (
                      <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center" }}>
                        <span style={{ width: 20, opacity: 0.3, fontSize: 11, flexShrink: 0, textAlign: "right" }}>{i + 1}.</span>
                        <input
                          style={{ ...S.input, flex: 1 }}
                          placeholder={`Paso ${i + 1}…`}
                          value={p}
                          onChange={e => { const n = [...pasos]; n[i] = e.target.value; setPasos(n); }}
                        />
                        <button type="button" style={S.btnSm} onClick={() => setPasos(prev => prev.filter((_, j) => j !== i))}>✕</button>
                      </div>
                    ))}
                    <button type="button" style={{ ...S.btnSm, marginTop: 4 }} onClick={() => setPasos(p => [...p, ""])}>+ Paso</button>
                  </div>

                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="submit" style={S.btnPrim}>{editTarget ? "Guardar cambios" : "Crear"}</button>
                    <button type="button" style={S.btn} onClick={() => setShowModal(false)}>Cancelar</button>
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
