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
  const [err,     setErr]     = useState("");
  const [msg,     setMsg]     = useState("");

  // Modales
  const [selItem,    setSelItem]    = useState(null); 
  const [showModal,  setShowModal]  = useState(false); 
  const [editTarget, setEditTarget] = useState(null);

  const [form, setForm] = useState({ titulo: "", descripcion: "", contenido: "", rol_visible: "todos", pdf_url: "" });
  const [pasos, setPasos] = useState([""]);
  
  // Estado para el archivo PDF
  const [fileToUpload, setFileToUpload] = useState(null);
  const [uploading, setUploading]       = useState(false);

  async function cargar() {
    setLoading(true);
    const { data, error } = await supabase
      .from("procedimientos")
      .select("id,titulo,descripcion,contenido,pasos,rol_visible,orden,activo,created_at,pdf_url")
      .eq("activo", true)
      .order("created_at", { ascending: false });

    if (error) {
      setErr(error.message);
      setLoading(false);
      return;
    }

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

  const filtrados = useMemo(() => {
    const qq = q.toLowerCase();
    if (!qq) return items;
    return items.filter(p => 
      (p.titulo || "").toLowerCase().includes(qq) || 
      (p.descripcion || "").toLowerCase().includes(qq)
    );
  }, [items, q]);

  function abrirNuevo() {
    setEditTarget(null);
    setForm({ titulo: "", descripcion: "", contenido: "", rol_visible: "todos", pdf_url: "" });
    setPasos([""]);
    setFileToUpload(null);
    setShowModal(true);
  }

  function abrirEditar(p) {
    setSelItem(null); 
    setEditTarget(p.id);
    setForm({
      titulo:      p.titulo ?? "",
      descripcion: p.descripcion ?? "",
      contenido:   p.contenido ?? "",
      pdf_url:     p.pdf_url ?? "",
      rol_visible: Array.isArray(p.rol_visible) ? (p.rol_visible[0] ?? "todos") : "todos",
    });
    setPasos(Array.isArray(p.pasos) && p.pasos.length ? p.pasos.map(s => s.texto ?? s) : [""]);
    setFileToUpload(null);
    setShowModal(true);
  }

  async function guardar(e) {
    e.preventDefault();
    if (!form.titulo.trim()) return setErr("El título es obligatorio.");
    
    setUploading(true);
    setErr("");
    
    let currentPdfUrl = form.pdf_url;

    if (fileToUpload) {
      const fileExt = fileToUpload.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(2,9)}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from("documentos")
        .upload(fileName, fileToUpload);

      if (uploadError) {
        setErr("Error subiendo PDF: " + uploadError.message);
        setUploading(false);
        return;
      }
      
      const { data: publicUrlData } = supabase.storage.from("documentos").getPublicUrl(fileName);
      currentPdfUrl = publicUrlData.publicUrl;
    }

    const payload = {
      titulo:      form.titulo.trim(),
      descripcion: form.descripcion.trim() || null,
      contenido:   form.contenido.trim() || null,
      pdf_url:     currentPdfUrl || null,
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

    setUploading(false);

    if (error) return setErr(error.message);
    setMsg(editTarget ? "✅ Actualizado." : "✅ Documento creado.");
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
    page:    { background: "#000", minHeight: "100vh", color: "#d0d0d0", fontFamily: "Roboto, 'Helvetica Neue', sans-serif" },
    layout:  { display: "grid", gridTemplateColumns: "280px 1fr", minHeight: "100vh" },
    main:    { padding: "24px", overflow: "auto" },
    content: { width: "100%", maxWidth: 1400, margin: "0 auto" },
    input:   { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", padding: "10px 14px", borderRadius: 10, fontSize: 13, outline: "none", width: "100%" },
    label:   { fontSize: 11, letterSpacing: 1, opacity: 0.6, display: "block", marginBottom: 6, textTransform: "uppercase", fontWeight: 600 },
    btnPrim: { border: "none", background: "#fff", color: "#000", padding: "10px 20px", borderRadius: 10, cursor: "pointer", fontWeight: 800, fontSize: 13 },
    btnSm:   { border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "#fff", padding: "6px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12 },
    
    grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 20, marginTop: 20 },
    docCard: {
      background: "#1e1e1e", border: "1px solid #333", borderRadius: 10, overflow: "hidden", cursor: "pointer",
      display: "flex", flexDirection: "column", height: 260, transition: "background 0.2s, border-color 0.2s",
      position: "relative"
    },
    docHeader: { padding: "12px 14px", display: "flex", alignItems: "center", gap: 10, background: "#1e1e1e" },
    docPreview: { flex: 1, background: "#28292c", padding: "12px", display: "flex", justifyContent: "center", position: "relative" },
    hojaBlanca: {
      background: "#fff", width: "100%", height: "100%", borderRadius: 4, boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
      padding: "14px", overflow: "hidden", position: "relative"
    },
    docTitle: { color: "#e8eaed", fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 },
    
    overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(5px)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 9999, padding: "20px" },
    modalForm: { background: "#111", border: "1px solid #333", borderRadius: 16, padding: 30, width: "100%", maxWidth: 540, maxHeight: "90vh", overflowY: "auto" },
  };

  return (
    <div style={S.page}>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #printable-doc, #printable-doc * { visibility: visible; }
          #printable-doc {
            position: absolute; left: 0; top: 0; width: 100%; padding: 0;
            background: white !important; color: black !important; border: none !important;
          }
          .no-print { display: none !important; }
        }
      `}</style>
      
      <div style={S.layout} className="no-print">
        <Sidebar profile={profile} signOut={signOut} />
        
        <main style={S.main}>
          <div style={S.content}>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
              <h1 style={{ fontFamily: "Montserrat, system-ui", fontSize: 24, margin: 0, color: "#fff", fontWeight: 700 }}>
                Procedimientos
              </h1>
              {isAdmin && <button style={S.btnPrim} onClick={abrirNuevo}>+ Nuevo documento</button>}
            </div>

            <div style={{ maxWidth: 400, marginBottom: 20 }}>
              <input style={S.input} placeholder="🔍 Buscar documento en Drive..." value={q} onChange={e => setQ(e.target.value)} />
            </div>

            {err && <div style={{ padding: 12, background: "rgba(255,69,58,0.1)", border: "1px solid #ff453a", color: "#ff453a", borderRadius: 8, marginBottom: 16 }}>{err}</div>}
            {msg && <div style={{ padding: 12, background: "rgba(48,209,88,0.1)", border: "1px solid #30d158", color: "#30d158", borderRadius: 8, marginBottom: 16 }}>{msg}</div>}

            {loading ? (
              <div style={{ color: "#666", marginTop: 40 }}>Cargando documentos...</div>
            ) : filtrados.length === 0 ? (
              <div style={{ color: "#666", marginTop: 40 }}>No hay documentos para mostrar.</div>
            ) : (
              <div style={S.grid}>
                {filtrados.map(p => (
                  <div 
                    key={p.id} 
                    style={S.docCard} 
                    onClick={() => setSelItem(p)}
                    onMouseEnter={e => e.currentTarget.style.borderColor = "#666"}
                    onMouseLeave={e => e.currentTarget.style.borderColor = "#333"}
                  >
                    <div style={S.docHeader}>
                      <div style={{ background: p.pdf_url ? "#e05050" : "#4285F4", width: 16, height: 16, borderRadius: 2, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 10, flexShrink: 0 }}>
                        {p.pdf_url ? "PDF" : "📄"}
                      </div>
                      <div style={S.docTitle} title={p.titulo}>{p.titulo}</div>
                      <div style={{ color: "#9aa0a6", fontSize: 18, lineHeight: 0, paddingBottom: 6 }}>⋮</div>
                    </div>
                    
                    <div style={S.docPreview}>
                      <div style={{...S.hojaBlanca, padding: p.pdf_url ? 0 : "14px"}}>
                        
                        {p.pdf_url ? (
                           <>
                             {/* TRUCO VISUAL: Iframe embebido que simula la miniatura del PDF */}
                             <iframe 
                               src={`${p.pdf_url}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
                               style={{
                                 position: "absolute", top: 0, left: 0,
                                 width: "400%", height: "400%", // Se hace gigante
                                 transform: "scale(0.25)",      // Se encoge por CSS
                                 transformOrigin: "top left",
                                 border: "none",
                                 pointerEvents: "none"          // Bloquea interacción del usuario (actúa como foto)
                               }}
                               title={`preview-${p.id}`}
                               tabIndex={-1}
                             />
                             {/* Capa invisible para atrapar el clic y evitar que el iframe moleste */}
                             <div style={{ position: "absolute", inset: 0, zIndex: 10, cursor: "pointer" }} />
                           </>
                        ) : (
                          <>
                            <div style={{ fontSize: 8, fontWeight: 800, color: "#000", marginBottom: 4 }}>{p.titulo}</div>
                            <div style={{ fontSize: 6, color: "#333", lineHeight: 1.4 }}>
                              {p.descripcion ? p.descripcion : "Procedimiento operativo estándar."}
                              <br/><br/>
                              {Array.isArray(p.pasos) && p.pasos.map((paso, i) => (
                                <div key={i} style={{ marginBottom: 3 }}>{i+1}. {typeof paso === "string" ? paso : paso.texto}</div>
                              ))}
                            </div>
                            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 30, background: "linear-gradient(transparent, #fff)" }} />
                          </>
                        )}
                        
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

          </div>
        </main>
      </div>

      {/* ── VISOR DE LECTURA ── */}
      {selItem && (
        <div style={{...S.overlay, zIndex: 9990}} onClick={e => e.target === e.currentTarget && setSelItem(null)} className="no-print">
          
          <div className="no-print" style={{ position: "absolute", top: 0, left: 0, right: 0, height: 60, background: "rgba(0,0,0,0.6)", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 20px" }}>
            <div style={{ color: "#fff", fontSize: 16, display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ color: selItem.pdf_url ? "#e05050" : "#4285F4" }}>{selItem.pdf_url ? "PDF" : "📄"}</span> {selItem.titulo}
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              {selItem.pdf_url ? (
                 <a href={selItem.pdf_url} target="_blank" rel="noreferrer" style={{...S.btnSm, textDecoration: "none", display: "inline-block"}}>↗ Abrir en pestaña nueva</a>
              ) : (
                 <button style={S.btnSm} onClick={imprimirPDF}>📥 Descargar PDF / Imprimir</button>
              )}
              
              {isAdmin && (
                <>
                  <button style={S.btnSm} onClick={() => abrirEditar(selItem)}>✏️ Editar</button>
                  <button style={{ ...S.btnSm, color: "#ff453a", borderColor: "rgba(255,69,58,0.3)" }} onClick={() => archivar(selItem.id)}>🗑 Borrar</button>
                </>
              )}
              <button style={{ background: "transparent", border: "none", color: "#fff", fontSize: 24, cursor: "pointer", marginLeft: 10 }} onClick={() => setSelItem(null)}>✕</button>
            </div>
          </div>

          {selItem.pdf_url ? (
            <iframe 
              src={`${selItem.pdf_url}#toolbar=0`} 
              style={{ width: "100%", maxWidth: 1000, height: "85vh", marginTop: 60, border: "none", borderRadius: 8, background: "#fff" }} 
              title="Visor PDF"
            />
          ) : (
            <div id="printable-doc" style={{ background: "#fff", width: "100%", maxWidth: 800, marginTop: 60, padding: "50px 60px", borderRadius: 4, boxShadow: "0 4px 20px rgba(0,0,0,0.5)", color: "#000", minHeight: "80vh" }}>
              <div style={{ borderBottom: "2px solid #000", paddingBottom: 10, marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                 <div>
                   <h1 style={{ margin: 0, fontSize: 24, textTransform: "uppercase", fontFamily: "Arial, sans-serif" }}>{selItem.titulo}</h1>
                   <div style={{ fontSize: 12, color: "#555", marginTop: 4 }}>PROCEDIMIENTO OPERATIVO ESTÁNDAR</div>
                 </div>
                 <img src="/logo-k.png" alt="Klase A" style={{ height: 30, opacity: 0.8 }} />
              </div>

              {selItem.descripcion && (
                <div style={{ marginBottom: 20, fontSize: 14 }}>
                  <strong>OBJETIVO: </strong> {selItem.descripcion}
                </div>
              )}

              {Array.isArray(selItem.pasos) && selItem.pasos.length > 0 && (
                <div style={{ marginBottom: 30 }}>
                  <div style={{ background: "#eee", padding: "6px 10px", fontWeight: "bold", fontSize: 13, borderTop: "1px solid #000", borderBottom: "1px solid #000", marginBottom: 15 }}>
                    DESARROLLO / PASOS
                  </div>
                  <ol style={{ paddingLeft: 24, margin: 0, fontSize: 14, lineHeight: 1.6 }}>
                    {selItem.pasos.map((paso, i) => (
                      <li key={i} style={{ marginBottom: 8 }}>{typeof paso === "string" ? paso : paso.texto}</li>
                    ))}
                  </ol>
                </div>
              )}

              {selItem.contenido && (
                <div>
                  <div style={{ background: "#eee", padding: "6px 10px", fontWeight: "bold", fontSize: 13, borderTop: "1px solid #000", borderBottom: "1px solid #000", marginBottom: 15 }}>
                    NOTAS ADICIONALES
                  </div>
                  <div style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{selItem.contenido}</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── MODAL NUEVO / EDITAR ── */}
      {showModal && (
        <div className="no-print" style={{...S.overlay, zIndex: 9995}} onClick={e => !uploading && e.target === e.currentTarget && setShowModal(false)}>
          <div style={S.modalForm}>
            <h2 style={{ margin: "0 0 20px", color: "#fff", fontSize: 18 }}>
              {editTarget ? "Editar Documento" : "Nuevo Documento"}
            </h2>
            <form onSubmit={guardar}>
              <div style={{ marginBottom: 16 }}>
                <label style={S.label}>Título del documento *</label>
                <input style={S.input} required value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} autoFocus />
              </div>

              <div style={{ marginBottom: 16, padding: "14px", background: "rgba(66, 133, 244, 0.05)", border: "1px dashed rgba(66, 133, 244, 0.3)", borderRadius: 10 }}>
                <label style={{...S.label, color: "#4285F4"}}>Subir Archivo PDF (Opcional)</label>
                <input 
                  type="file" 
                  accept="application/pdf"
                  onChange={e => setFileToUpload(e.target.files[0])}
                  style={{ color: "#fff", fontSize: 12, marginTop: 4 }}
                />
                {form.pdf_url && !fileToUpload && <div style={{ fontSize: 11, color: "#888", marginTop: 6 }}>Ya tiene un PDF guardado. Subir uno nuevo lo reemplazará.</div>}
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={S.label}>Visible para</label>
                <select style={S.input} value={form.rol_visible} onChange={e => setForm(f => ({ ...f, rol_visible: e.target.value }))}>
                  {ROLES.map(r => <option key={r} value={r}>{r === "todos" ? "Todos los roles" : r}</option>)}
                </select>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={S.label}>Descripción / Objetivo</label>
                <input style={S.input} placeholder="Resumen en una línea..." value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={S.label}>Pasos a seguir (Solo si NO subís un PDF)</label>
                {pasos.map((p, i) => (
                  <div key={i} style={{ display: "flex", gap: 6, marginBottom: 8, alignItems: "center" }}>
                    <span style={{ width: 20, opacity: 0.5, fontSize: 12, textAlign: "right" }}>{i + 1}.</span>
                    <input
                      style={{ ...S.input, flex: 1 }}
                      placeholder={`Escribir paso ${i + 1}...`}
                      value={p}
                      onChange={e => { const n = [...pasos]; n[i] = e.target.value; setPasos(n); }}
                    />
                    <button type="button" style={{...S.btnSm, background: "transparent", border: "none", color: "#666"}} onClick={() => setPasos(prev => prev.filter((_, j) => j !== i))}>✕</button>
                  </div>
                ))}
                <button type="button" style={{ ...S.btnSm, marginTop: 4 }} onClick={() => setPasos(p => [...p, ""])}>+ Agregar Paso</button>
              </div>

              <div style={{ marginBottom: 24 }}>
                <label style={S.label}>Notas técnicas extras (opcional)</label>
                <textarea style={{...S.input, minHeight: 60, resize: "vertical"}} placeholder="Advertencias, aclaraciones..." value={form.contenido} onChange={e => setForm(f => ({ ...f, contenido: e.target.value }))} />
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button type="submit" disabled={uploading} style={{...S.btnPrim, opacity: uploading ? 0.6 : 1}}>
                  {uploading ? "Subiendo archivo..." : (editTarget ? "Guardar cambios" : "Crear Documento")}
                </button>
                <button type="button" disabled={uploading} style={{...S.btnPrim, background: "#333", color: "#fff", border: "none"}} onClick={() => setShowModal(false)}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}