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
  const [q,       setQ]       = useState("");
  const [filtCat, setFiltCat] = useState("todas");
  const [err,     setErr]     = useState("");
  const [msg,     setMsg]     = useState("");

  // Modales
  const [selItem,    setSelItem]    = useState(null); // Para leer el doc
  const [showModal,  setShowModal]  = useState(false); // Para crear/editar
  const [editTarget, setEditTarget] = useState(null);

  const [form, setForm] = useState({ titulo: "", descripcion: "", contenido: "", categoria: "", rol_visible: "todos" });
  const [pasos, setPasos] = useState([""]);

  async function cargar() {
    setLoading(true);
    const { data } = await supabase
      .from("procedimientos")
      .select("id,titulo,descripcion,contenido,pasos,categoria,area,rol_visible,orden,activo,created_at")
      .eq("activo", true)
      .order("created_at", { ascending: false });

    let lista = data ?? [];
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

  function abrirNuevo() {
    setEditTarget(null);
    setForm({ titulo: "", descripcion: "", contenido: "", categoria: "", rol_visible: "todos" });
    setPasos([""]);
    setShowModal(true);
  }

  function abrirEditar(p) {
    setSelItem(null); // Cierra el visor
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
    cargar();
    setTimeout(() => setMsg(""), 2500);
  }

  async function archivar(id) {
    if (!window.confirm("¿Seguro que querés archivar este documento?")) return;
    await supabase.from("procedimientos").update({ activo: false }).eq("id", id);
    setSelItem(null);
    cargar();
  }

  function imprimirPDF() {
    window.print();
  }

  // ── ESTILOS ──────────────────────────────────────────────
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
    
    // Grilla estilo Drive
    grid: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
      gap: 20,
      marginTop: 20
    },
    docCard: {
      background: "#161616", border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 12, overflow: "hidden", cursor: "pointer",
      display: "flex", flexDirection: "column", height: 240,
      transition: "background 0.2s, border-color 0.2s",
    },
    docHeader: {
      padding: "12px 14px", display: "flex", alignItems: "center", gap: 10,
      borderBottom: "1px solid rgba(255,255,255,0.05)"
    },
    docPreview: {
      flex: 1, background: "#ffffff", margin: "14px 14px 0",
      borderRadius: "6px 6px 0 0", padding: "16px",
      overflow: "hidden", position: "relative",
      boxShadow: "0 -2px 10px rgba(0,0,0,0.2)"
    },
    docTitle: {
      color: "#fff", fontSize: 13, fontWeight: 600, 
      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"
    },
    
    // Modales
    overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)", display: "flex", justifyContent: "center", alignItems: "flex-start", zIndex: 9999, padding: "40px 20px", overflowY: "auto" },
    modalForm: { background: "rgba(8,8,8,0.98)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 18, padding: 28, width: "100%", maxWidth: 540, boxShadow: "0 30px 80px rgba(0,0,0,0.9)" },
    modalReader: { background: "#080808", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 18, padding: 40, width: "100%", maxWidth: 800, boxShadow: "0 30px 80px rgba(0,0,0,0.9)" },
    
    filterBtn: (act) => ({
      border:  act ? "1px solid rgba(255,255,255,0.2)" : "1px solid transparent",
      background: act ? "rgba(255,255,255,0.06)" : "transparent",
      color:   act ? "#fff" : "rgba(255,255,255,0.35)",
      padding: "5px 12px", borderRadius: 8, cursor: "pointer",
      fontSize: 12, fontWeight: act ? 700 : 400, whiteSpace: "nowrap",
    }),
  };

  return (
    <div style={S.page}>
        
      {/* MAGIA PDF: Solo se imprime el visor del documento */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #printable-doc, #printable-doc * { visibility: visible; }
          #printable-doc {
            position: absolute; left: 0; top: 0; width: 100%; padding: 0;
            background: white !important; color: black !important;
          }
          .no-print { display: none !important; }
        }
      `}</style>

      <NotificacionesBell profile={profile} />
      
      <div style={S.layout} className="no-print">
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

            {err && <div style={{ ...S.card, borderColor: "rgba(255,69,58,0.3)", color: "#ff6b6b" }}>{err}</div>}
            {msg && <div style={{ ...S.card, borderColor: "rgba(48,209,88,0.3)", color: "#a6ffbf" }}>{msg}</div>}

            {/* Búsqueda y Filtros */}
            <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
              <input style={{ ...S.input, width: 250 }} placeholder="Buscar procedimiento…" value={q} onChange={e => setQ(e.target.value)} />
              <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.1)", margin: "0 5px" }} />
              {categorias.map(cat => (
                <button key={cat} style={S.filterBtn(filtCat === cat)} onClick={() => setFiltCat(cat)}>
                  {cat === "todas" ? "Todas las categorías" : cat}
                </button>
              ))}
            </div>

            {loading && <div style={{ textAlign: "center", opacity: 0.4, padding: 40 }}>Cargando documentos…</div>}
            
            {!loading && filtrados.length === 0 && (
              <div style={{ textAlign: "center", opacity: 0.35, padding: 60 }}>
                No hay procedimientos para mostrar.
              </div>
            )}

            {/* GRILLA TIPO DRIVE */}
            <div style={S.grid}>
              {filtrados.map(p => {
                const cat = (p.categoria || p.area || "General").trim();
                return (
                  <div 
                    key={p.id} 
                    style={S.docCard} 
                    onClick={() => setSelItem(p)}
                    onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.3)"}
                    onMouseLeave={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"}
                  >
                    {/* Icono + Título */}
                    <div style={S.docHeader}>
                      <div style={{ background: "#0a84ff", width: 18, height: 18, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#fff", flexShrink: 0 }}>
                        P
                      </div>
                      <div style={S.docTitle} title={p.titulo}>{p.titulo}</div>
                    </div>
                    
                    {/* Vista previa (Hoja Blanca) */}
                    <div style={S.docPreview}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: "#111", marginBottom: 6 }}>{p.titulo}</div>
                      <div style={{ fontSize: 9, color: "#666", lineHeight: 1.5, maxHeight: 100, overflow: "hidden" }}>
                        {p.descripcion ? p.descripcion : "Procedimiento operativo estándar."}
                        <br/><br/>
                        {Array.isArray(p.pasos) && p.pasos.map((paso, i) => (
                          <div key={i} style={{ marginBottom: 4 }}>{i+1}. {typeof paso === "string" ? paso : paso.texto}</div>
                        ))}
                      </div>
                      {/* Degradado para difuminar el texto hacia abajo */}
                      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 40, background: "linear-gradient(transparent, #ffffff)" }} />
                    </div>
                  </div>
                );
              })}
            </div>

          </div>
        </main>
      </div>

      {/* ── VISOR DE LECTURA (Reemplaza al panel derecho) ── */}
      {selItem && (
        <div style={{...S.overlay, zIndex: 9990}} onClick={e => e.target === e.currentTarget && setSelItem(null)} className="no-print">
          <div style={S.modalReader} id="printable-doc">
            
            {/* Header del Visor */}
            <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: 20, marginBottom: 20 }}>
              <div style={{ display: "flex", gap: 10 }}>
                {isAdmin && (
                  <>
                    <button style={S.btnSm} onClick={() => abrirEditar(selItem)}>✏️ Editar</button>
                    <button style={{ ...S.btnSm, color: "#ff453a", borderColor: "rgba(255,69,58,0.2)" }} onClick={() => archivar(selItem.id)}>🗑 Archivar</button>
                  </>
                )}
                <button style={{ ...S.btnSm, color: "#fff", borderColor: "#fff" }} onClick={imprimirPDF}>📥 Descargar PDF</button>
              </div>
              <button style={{ ...S.btnSm, fontSize: 18, padding: "2px 10px", border: "none" }} onClick={() => setSelItem(null)}>✕</button>
            </div>

            {/* Contenido del Documento */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: "#0a84ff", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8 }}>
                {(selItem.categoria || selItem.area || "General").trim()}
              </div>
              <h1 style={{ margin: "0 0 10px", color: "#fff", fontSize: 28, fontFamily: "Montserrat, system-ui", fontWeight: 900 }}>
                {selItem.titulo}
              </h1>
              {selItem.descripcion && (
                <p style={{ margin: "0 0 30px", fontSize: 14, opacity: 0.6, lineHeight: 1.6 }}>{selItem.descripcion}</p>
              )}

              {/* Pasos */}
              {Array.isArray(selItem.pasos) && selItem.pasos.length > 0 && (
                <div style={{ marginBottom: 30 }}>
                  <div style={{ fontSize: 11, opacity: 0.4, letterSpacing: 1.5, marginBottom: 16, textTransform: "uppercase", fontWeight: 700 }}>Pasos operativos</div>
                  {selItem.pasos.map((paso, i) => {
                    const texto = typeof paso === "string" ? paso : paso.texto;
                    return (
                      <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 12 }}>
                        <div style={{
                          width: 24, height: 24, borderRadius: "50%", background: "rgba(255,255,255,0.05)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 11, fontWeight: 800, color: "#fff", flexShrink: 0
                        }}>
                          {i + 1}
                        </div>
                        <div style={{ paddingTop: 3, fontSize: 15, lineHeight: 1.6, color: "#d0d0d0" }}>
                          {texto}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Contenido / Notas */}
              {selItem.contenido && (
                <div style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                  <div style={{ fontSize: 11, opacity: 0.4, letterSpacing: 1.5, marginBottom: 12, textTransform: "uppercase", fontWeight: 700 }}>Notas adicionales</div>
                  <div style={{ fontSize: 14, lineHeight: 1.7, whiteSpace: "pre-wrap", color: "#b0b0b0" }}>{selItem.contenido}</div>
                </div>
              )}
            </div>
            
          </div>
        </div>
      )}

      {/* ── MODAL NUEVO / EDITAR ── */}
      {showModal && (
        <div className="no-print" style={{...S.overlay, zIndex: 9995}} onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div style={S.modalForm}>
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
                <label style={S.label}>Contenido / notas (opcional)</label>
                <textarea style={{ ...S.textarea, width: "100%" }} placeholder="Detalles técnicos, advertencias…" value={form.contenido} onChange={e => setForm(f => ({ ...f, contenido: e.target.value }))} />
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

    </div>
  );
}