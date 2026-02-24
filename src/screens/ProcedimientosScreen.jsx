import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import Sidebar from "../components/Sidebar";

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
    page:    { background: "#03050c", minHeight: "100vh", color: "#dde2ea",
      fontFamily: "'Outfit', 'IBM Plex Sans', system-ui, sans-serif" },
    layout:  { display: "grid", gridTemplateColumns: "280px 1fr", minHeight: "100vh" },
    main:    { padding: "24px 28px", overflow: "auto" },
    content: { width: "100%", maxWidth: 1400, margin: "0 auto" },

    input: {
      background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)",
      color: "#dde2ea", padding: "10px 14px", borderRadius: 9, fontSize: 13,
      outline: "none", width: "100%", boxSizing: "border-box",
      transition: "border-color 0.15s",
    },
    label: {
      fontSize: 9, letterSpacing: 2, color: "#566070", display: "block",
      marginBottom: 6, textTransform: "uppercase", fontWeight: 600,
    },
    btnPrim: {
      border: "1px solid rgba(255,255,255,0.2)",
      background: "rgba(255,255,255,0.9)", color: "#080c14",
      padding: "9px 20px", borderRadius: 9, cursor: "pointer",
      fontWeight: 700, fontSize: 13, transition: "opacity 0.15s",
    },
    btnSm: {
      border: "1px solid rgba(255,255,255,0.09)",
      background: "rgba(255,255,255,0.04)", color: "#a8b4c4",
      padding: "6px 14px", borderRadius: 8, cursor: "pointer", fontSize: 12,
      transition: "border-color 0.15s, color 0.15s",
      textDecoration: "none", display: "inline-block",
    },
    btnDanger: {
      border: "1px solid rgba(224,72,72,0.25)",
      background: "rgba(224,72,72,0.08)", color: "#e04848",
      padding: "6px 14px", borderRadius: 8, cursor: "pointer", fontSize: 12,
    },

    grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14, marginTop: 20 },
    docCard: {
      background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 14, overflow: "hidden", cursor: "pointer",
      display: "flex", flexDirection: "column", height: 280,
      transition: "border-color 0.15s, background 0.15s",
      backdropFilter: "blur(20px)",
    },
    docPreview: {
      flex: 1, background: "rgba(255,255,255,0.015)",
      display: "flex", justifyContent: "center", alignItems: "center",
      overflow: "hidden", position: "relative",
    },
    hojaBlanca: {
      background: "#fff", width: "calc(100% - 20px)", height: "calc(100% - 16px)",
      borderRadius: 4, boxShadow: "0 2px 12px rgba(0,0,0,0.6)",
      padding: "12px", overflow: "hidden", position: "relative",
    },
    docTitle: {
      color: "#dde2ea", fontSize: 13, fontWeight: 600,
      overflow: "hidden", textOverflow: "ellipsis",
      display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
    },

    overlay: {
      position: "fixed", inset: 0,
      background: "rgba(3,5,12,0.9)",
      backdropFilter: "blur(32px) saturate(140%)",
      WebkitBackdropFilter: "blur(32px) saturate(140%)",
      display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center",
      zIndex: 9999, padding: "20px",
    },
    modalForm: {
      background: "rgba(6,10,22,0.96)",
      backdropFilter: "blur(60px)",
      WebkitBackdropFilter: "blur(60px)",
      border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: 18, padding: "28px 26px", width: "100%", maxWidth: 540,
      maxHeight: "90vh", overflowY: "auto",
      boxShadow: "0 32px 80px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.06)",
    },
  };

  return (
    <div style={S.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 3px; height: 3px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 99px; }
        .doc-card:hover { border-color: rgba(255,255,255,0.15) !important; background: rgba(255,255,255,0.045) !important; }
        .btn-sm-h:hover { border-color: rgba(255,255,255,0.18) !important; color: #dde2ea !important; }
        input:focus, select:focus, textarea:focus { border-color: rgba(255,255,255,0.2) !important; }
        select option { background: #080c18; color: #dde2ea; }
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

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
              <div>
                <div style={{ fontSize: 18, color: "#dde2ea", fontWeight: 700, letterSpacing: 0.4 }}>Procedimientos</div>
                <div style={{ fontSize: 11, color: "#566070", marginTop: 3 }}>
                  {filtrados.length} documento{filtrados.length !== 1 ? "s" : ""}
                </div>
              </div>
              {isAdmin && <button style={S.btnPrim} onClick={abrirNuevo}>+ Nuevo</button>}
            </div>

            <div style={{ maxWidth: 380, marginBottom: 22, position: "relative" }}>
              <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "#566070", pointerEvents: "none" }}>⌕</span>
              <input
                style={{ ...S.input, paddingLeft: 36 }}
                placeholder="Buscar documentos…"
                value={q} onChange={e => setQ(e.target.value)}
              />
            </div>

            {err && <div style={{ padding: 12, background: "rgba(255,69,58,0.1)", border: "1px solid #ff453a", color: "#ff453a", borderRadius: 8, marginBottom: 16 }}>{err}</div>}
            {msg && <div style={{ padding: 12, background: "rgba(48,209,88,0.1)", border: "1px solid #30d158", color: "#30d158", borderRadius: 8, marginBottom: 16 }}>{msg}</div>}

            {loading ? (
              <div style={{ fontSize: 11, color: "#2c3040", letterSpacing: 2, textTransform: "uppercase", marginTop: 40, fontFamily: "'JetBrains Mono',monospace" }}>Cargando…</div>
            ) : filtrados.length === 0 ? (
              <div style={{ fontSize: 11, color: "#2c3040", letterSpacing: 2, textTransform: "uppercase", marginTop: 40 }}>Sin documentos</div>
            ) : (
              <div style={S.grid}>
                {filtrados.map(p => {
                  const isPdf = !!p.pdf_url;
                  const pasoCount = Array.isArray(p.pasos) ? p.pasos.filter(x => (typeof x === "string" ? x : x?.texto)?.trim()).length : 0;
                  const dateStr = p.created_at ? new Date(p.created_at).toLocaleDateString("es-AR", { day:"2-digit", month:"short", year:"numeric" }) : "";
                  const rolLabel = Array.isArray(p.rol_visible)
                    ? (p.rol_visible[0] === "todos" || !p.rol_visible[0] ? null : p.rol_visible[0])
                    : null;
                  return (
                    <div
                      key={p.id}
                      style={S.docCard}
                      className="doc-card"
                      onClick={() => setSelItem(p)}
                    >
                      {/* ── Preview área ── */}
                      <div style={S.docPreview}>
                        {isPdf ? (
                          <div style={S.hojaBlanca}>
                            <iframe
                              src={`${p.pdf_url}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
                              style={{
                                position: "absolute", top: 0, left: 0,
                                width: "400%", height: "400%",
                                transform: "scale(0.25)", transformOrigin: "top left",
                                border: "none", pointerEvents: "none",
                              }}
                              title={`preview-${p.id}`}
                              tabIndex={-1}
                            />
                            <div style={{ position: "absolute", inset: 0, zIndex: 10 }} />
                          </div>
                        ) : (
                          <div style={S.hojaBlanca}>
                            <div style={{ fontSize: 7, fontWeight: 800, color: "#1a1a2e", marginBottom: 5, letterSpacing: 0.3, lineHeight: 1.3 }}>{p.titulo}</div>
                            {p.descripcion && (
                              <div style={{ fontSize: 5.5, color: "#555", lineHeight: 1.5, marginBottom: 4 }}>{p.descripcion}</div>
                            )}
                            {pasoCount > 0 && (
                              <div style={{ fontSize: 5.5, color: "#333", lineHeight: 1.5 }}>
                                {p.pasos.slice(0, 6).map((paso, i) => (
                                  <div key={i} style={{ marginBottom: 2, display: "flex", gap: 3 }}>
                                    <span style={{ opacity: 0.5 }}>{i+1}.</span>
                                    <span>{typeof paso === "string" ? paso : paso.texto}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 36, background: "linear-gradient(transparent, #fff)" }} />
                          </div>
                        )}
                      </div>

                      {/* ── Info footer ── */}
                      <div style={{ padding: "12px 14px 13px", borderTop: "1px solid rgba(255,255,255,0.05)", flexShrink: 0 }}>
                        <div style={S.docTitle}>{p.titulo}</div>
                        {p.descripcion && (
                          <div style={{ fontSize: 11, color: "#566070", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {p.descripcion}
                          </div>
                        )}
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 7 }}>
                          <div style={{
                            padding: "2px 7px", borderRadius: 5, fontSize: 9, fontWeight: 700,
                            letterSpacing: 0.8, textTransform: "uppercase",
                            background: isPdf ? "rgba(224,72,72,0.1)" : "rgba(74,144,226,0.1)",
                            color: isPdf ? "#e04848" : "#4a90e2",
                            border: isPdf ? "1px solid rgba(224,72,72,0.2)" : "1px solid rgba(74,144,226,0.2)",
                          }}>
                            {isPdf ? "PDF" : `${pasoCount} pasos`}
                          </div>
                          {rolLabel && (
                            <div style={{ fontSize: 9, color: "#2c3040", letterSpacing: 0.8, textTransform: "uppercase" }}>
                              · {rolLabel}
                            </div>
                          )}
                          <div style={{ marginLeft: "auto", fontSize: 9, color: "#2c3040", fontFamily: "'JetBrains Mono',monospace" }}>
                            {dateStr}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

          </div>
        </main>
      </div>

      {/* ── VISOR DE LECTURA ── */}
      {selItem && (
        <div style={{...S.overlay, zIndex: 9990}} onClick={e => e.target === e.currentTarget && setSelItem(null)} className="no-print">
          
          <div className="no-print" style={{
            position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)",
            maxWidth: 900, width: "calc(100% - 40px)",
            background: "rgba(6,10,22,0.92)",
            backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 12, height: 52,
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "0 16px", zIndex: 10,
            boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
              <div style={{
                padding: "2px 8px", borderRadius: 5, fontSize: 9, fontWeight: 700, letterSpacing: 1,
                background: selItem.pdf_url ? "rgba(224,72,72,0.12)" : "rgba(74,144,226,0.12)",
                color: selItem.pdf_url ? "#e04848" : "#4a90e2",
                border: selItem.pdf_url ? "1px solid rgba(224,72,72,0.2)" : "1px solid rgba(74,144,226,0.2)",
                flexShrink: 0,
              }}>
                {selItem.pdf_url ? "PDF" : "DOC"}
              </div>
              <span style={{ color: "#dde2ea", fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {selItem.titulo}
              </span>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0, marginLeft: 12 }}>
              {selItem.pdf_url ? (
                <a href={selItem.pdf_url} target="_blank" rel="noreferrer" style={{...S.btnSm}} className="btn-sm-h">↗ Abrir</a>
              ) : (
                <button style={S.btnSm} className="btn-sm-h" onClick={imprimirPDF}>↓ Imprimir</button>
              )}
              {isAdmin && (
                <>
                  <button style={S.btnSm} className="btn-sm-h" onClick={() => abrirEditar(selItem)}>Editar</button>
                  <button style={S.btnDanger} onClick={() => archivar(selItem.id)}>Archivar</button>
                </>
              )}
              <button style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.4)", fontSize: 18, lineHeight:1, cursor: "pointer", padding: "4px 9px", borderRadius: 7, marginLeft: 4 }} onClick={() => setSelItem(null)}>×</button>
            </div>
          </div>

          {selItem.pdf_url ? (
            <iframe 
              src={`${selItem.pdf_url}#toolbar=0`} 
              style={{ width: "100%", maxWidth: 1000, height: "80vh", marginTop: 84, border: "none", borderRadius: 10, background: "#fff" }} 
              title="Visor PDF"
            />
          ) : (
            <div id="printable-doc" style={{ background: "#fff", width: "100%", maxWidth: 800, marginTop: 84, padding: "50px 60px", borderRadius: 10, boxShadow: "0 8px 40px rgba(0,0,0,0.6)", color: "#000", minHeight: "80vh" }}>
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
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
              <div>
                <div style={{ fontSize: 16, color: "#dde2ea", fontWeight: 700 }}>
                  {editTarget ? "Editar documento" : "Nuevo documento"}
                </div>
                <div style={{ fontSize: 11, color: "#566070", marginTop: 3 }}>Procedimiento operativo</div>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", color: "rgba(255,255,255,0.4)", width: 28, height: 28, borderRadius: "50%", cursor: "pointer", fontSize: 18, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}
              >×</button>
            </div>

            <form onSubmit={guardar}>
              {/* Título */}
              <div style={{ marginBottom: 14 }}>
                <label style={S.label}>Título *</label>
                <input style={S.input} required value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} autoFocus placeholder="Nombre del procedimiento" />
              </div>

              {/* Descripción */}
              <div style={{ marginBottom: 14 }}>
                <label style={S.label}>Descripción / objetivo</label>
                <input style={S.input} placeholder="Resumen en una línea…" value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
              </div>

              {/* Visible para + PDF en fila */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={S.label}>Visible para</label>
                  <select style={S.input} value={form.rol_visible} onChange={e => setForm(f => ({ ...f, rol_visible: e.target.value }))}>
                    {ROLES.map(r => <option key={r} value={r}>{r === "todos" ? "Todos" : r}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ ...S.label, color: "#4a90e2" }}>Adjuntar PDF</label>
                  <div style={{ padding: "7px 10px", background: "rgba(74,144,226,0.05)", border: "1px solid rgba(74,144,226,0.2)", borderRadius: 9 }}>
                    <input
                      type="file" accept="application/pdf"
                      onChange={e => setFileToUpload(e.target.files[0])}
                      style={{ color: "#a8b4c4", fontSize: 11, width: "100%" }}
                    />
                  </div>
                  {form.pdf_url && !fileToUpload && (
                    <div style={{ fontSize: 10, color: "#566070", marginTop: 4 }}>PDF guardado · nuevo reemplaza</div>
                  )}
                  {fileToUpload && (
                    <div style={{ fontSize: 10, color: "#4a90e2", marginTop: 4 }}>← {fileToUpload.name}</div>
                  )}
                </div>
              </div>

              {/* Pasos — solo si no hay PDF */}
              {!fileToUpload && (
                <div style={{ marginBottom: 14 }}>
                  <label style={S.label}>Pasos {form.pdf_url ? "(ya tiene PDF)" : ""}</label>
                  {pasos.map((p, i) => (
                    <div key={i} style={{ display: "flex", gap: 6, marginBottom: 7, alignItems: "center" }}>
                      <span style={{ width: 18, fontSize: 10, color: "#2c3040", textAlign: "right", fontFamily: "'JetBrains Mono',monospace", flexShrink: 0 }}>{i + 1}</span>
                      <input
                        style={{ ...S.input, flex: 1 }}
                        placeholder={`Paso ${i + 1}…`}
                        value={p}
                        onChange={e => { const n = [...pasos]; n[i] = e.target.value; setPasos(n); }}
                      />
                      <button type="button"
                        style={{ background: "transparent", border: "none", color: "#2c3040", cursor: "pointer", fontSize: 16, padding: "0 4px", lineHeight: 1, flexShrink: 0 }}
                        onClick={() => setPasos(prev => prev.filter((_, j) => j !== i))}
                      >×</button>
                    </div>
                  ))}
                  <button type="button" style={{ ...S.btnSm, marginTop: 4, fontSize: 11 }} onClick={() => setPasos(p => [...p, ""])}>+ Paso</button>
                </div>
              )}

              {/* Notas extra */}
              <div style={{ marginBottom: 22 }}>
                <label style={S.label}>Notas adicionales</label>
                <textarea
                  style={{ ...S.input, minHeight: 60, resize: "vertical" }}
                  placeholder="Advertencias, aclaraciones…"
                  value={form.contenido}
                  onChange={e => setForm(f => ({ ...f, contenido: e.target.value }))}
                />
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button type="submit" disabled={uploading} style={{ ...S.btnPrim, flex: 1, padding: "12px", opacity: uploading ? 0.6 : 1 }}>
                  {uploading ? "Subiendo…" : (editTarget ? "Guardar cambios" : "Crear documento")}
                </button>
                <button type="button" disabled={uploading} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.09)", color: "#566070", padding: "12px 20px", borderRadius: 9, cursor: "pointer", fontWeight: 600, fontSize: 13 }} onClick={() => setShowModal(false)}>
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}