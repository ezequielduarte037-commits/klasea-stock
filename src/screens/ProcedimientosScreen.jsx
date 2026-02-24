import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import Sidebar from "../components/Sidebar";

// ─── PALETA ──────────────────────────────────────────────────────────────────
const C = {
  bg:   "#09090b",
  s0:   "rgba(255,255,255,0.03)",
  s1:   "rgba(255,255,255,0.06)",
  b0:   "rgba(255,255,255,0.08)",
  b1:   "rgba(255,255,255,0.15)",
  t0:   "#f4f4f5",
  t1:   "#a1a1aa",
  t2:   "#71717a",
  mono: "'JetBrains Mono', 'IBM Plex Mono', monospace",
  sans: "'Outfit', system-ui, sans-serif",
  primary: "#3b82f6",
  amber:   "#f59e0b",
  green:   "#10b981",
  red:     "#ef4444",
};
const GLASS = {
  backdropFilter: "blur(32px) saturate(130%)",
  WebkitBackdropFilter: "blur(32px) saturate(130%)",
};
const INP = {
  background: "rgba(255,255,255,0.04)", border: `1px solid ${C.b0}`,
  color: C.t0, padding: "9px 12px", borderRadius: 8, fontSize: 12,
  outline: "none", width: "100%", fontFamily: "'Outfit', system-ui",
  boxSizing: "border-box",
};
const LABEL = {
  fontSize: 9, letterSpacing: 2, color: C.t1, display: "block",
  marginBottom: 6, textTransform: "uppercase", fontWeight: 600,
};

const ROLES = ["todos", "admin", "oficina", "laminacion", "muebles", "panol", "mecanica", "electricidad"];

export default function ProcedimientosScreen({ profile, signOut }) {
  const role    = profile?.role ?? "invitado";
  const isAdmin = !!profile?.is_admin || role === "admin";

  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [q,       setQ]       = useState("");
  const [err,     setErr]     = useState("");
  const [msg,     setMsg]     = useState("");

  const [selItem,    setSelItem]    = useState(null);
  const [showModal,  setShowModal]  = useState(false);
  const [editTarget, setEditTarget] = useState(null);

  const [form, setForm] = useState({ titulo: "", descripcion: "", contenido: "", rol_visible: "todos", pdf_url: "" });
  const [pasos, setPasos] = useState([""]);

  const [fileToUpload, setFileToUpload] = useState(null);
  const [uploading,    setUploading]    = useState(false);

  async function cargar() {
    setLoading(true);
    const { data, error } = await supabase
      .from("procedimientos")
      .select("id,titulo,descripcion,contenido,pasos,rol_visible,orden,activo,created_at,pdf_url")
      .eq("activo", true)
      .order("created_at", { ascending: false });

    if (error) { setErr(error.message); setLoading(false); return; }

    let lista = data ?? [];
    if (!isAdmin) {
      lista = lista.filter(p => {
        const rv = Array.isArray(p.rol_visible) ? p.rol_visible : [p.rol_visible ?? "todos"];
        return rv.includes(role) || rv.includes("todos");
      });
    }
    setItems(lista); setLoading(false);
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
    setPasos([""]); setFileToUpload(null); setShowModal(true);
  }

  function abrirEditar(p) {
    setSelItem(null); setEditTarget(p.id);
    setForm({
      titulo:      p.titulo ?? "",
      descripcion: p.descripcion ?? "",
      contenido:   p.contenido ?? "",
      pdf_url:     p.pdf_url ?? "",
      rol_visible: Array.isArray(p.rol_visible) ? (p.rol_visible[0] ?? "todos") : "todos",
    });
    setPasos(Array.isArray(p.pasos) && p.pasos.length ? p.pasos.map(s => s.texto ?? s) : [""]);
    setFileToUpload(null); setShowModal(true);
  }

  async function guardar(e) {
    e.preventDefault();
    if (!form.titulo.trim()) return setErr("El título es obligatorio.");
    setUploading(true); setErr("");

    let currentPdfUrl = form.pdf_url;
    if (fileToUpload) {
      const fileExt = fileToUpload.name.split(".").pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from("documentos").upload(fileName, fileToUpload);
      if (uploadError) { setErr("Error subiendo PDF: " + uploadError.message); setUploading(false); return; }
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
    if (editTarget) { ({ error } = await supabase.from("procedimientos").update(payload).eq("id", editTarget)); }
    else             { ({ error } = await supabase.from("procedimientos").insert(payload)); }

    setUploading(false);
    if (error) return setErr(error.message);
    setMsg(editTarget ? "✅ Actualizado." : "✅ Documento creado.");
    setShowModal(false); cargar();
    setTimeout(() => setMsg(""), 2500);
  }

  async function archivar(id) {
    if (!window.confirm("¿Seguro que querés archivar este documento?")) return;
    await supabase.from("procedimientos").update({ activo: false }).eq("id", id);
    setSelItem(null); cargar();
  }

  function imprimirPDF() { window.print(); }

  // Estilos específicos del componente
  const DOCCARD = {
    background: C.s0, border: `1px solid ${C.b0}`,
    borderRadius: 12, overflow: "hidden", cursor: "pointer",
    display: "flex", flexDirection: "column", height: 280,
    transition: "border-color 0.15s, background 0.15s",
  };
  const MODAL = {
    background: "rgba(9,9,11,0.97)", ...GLASS,
    border: `1px solid ${C.b1}`,
    borderRadius: 16, padding: "26px 24px", width: "100%", maxWidth: 520,
    maxHeight: "90vh", overflowY: "auto",
    boxShadow: "0 32px 80px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.06)",
  };

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
        button:not([disabled]):hover { opacity: 0.8; }
        .bg-glow {
          position: fixed; inset: 0; pointer-events: none; z-index: 0;
          background:
            radial-gradient(ellipse 70% 38% at 50% -6%, rgba(59,130,246,0.07) 0%, transparent 65%),
            radial-gradient(ellipse 40% 28% at 92% 88%, rgba(245,158,11,0.02) 0%, transparent 55%);
        }
        .doc-card:hover { border-color: rgba(255,255,255,0.14) !important; background: rgba(255,255,255,0.05) !important; }
        @media print {
          body * { visibility: hidden; }
          #printable-doc, #printable-doc * { visibility: visible; }
          #printable-doc { position: absolute; left: 0; top: 0; width: 100%; padding: 0; background: white !important; color: black !important; border: none !important; }
          .no-print { display: none !important; }
        }
      `}</style>
      <div className="bg-glow" />

      <div className="no-print" style={{ display: "grid", gridTemplateColumns: "280px 1fr", minHeight: "100vh", position: "relative", zIndex: 1 }}>
        <Sidebar profile={profile} signOut={signOut} />

        <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>

          {/* ── TOPBAR ── */}
          <div style={{
            height: 50, background: "rgba(12,12,14,0.92)", ...GLASS,
            borderBottom: `1px solid ${C.b0}`, padding: "0 18px",
            display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.t0 }}>Procedimientos</div>
              <div style={{ fontSize: 9, color: C.t2, letterSpacing: 1.5, textTransform: "uppercase", marginTop: 1 }}>
                {filtrados.length} documento{filtrados.length !== 1 ? "s" : ""}
              </div>
            </div>

            <div style={{
              display: "flex", alignItems: "center", gap: 5, padding: "4px 10px",
              borderRadius: 7, background: C.s0, border: `1px solid ${C.b0}`,
              borderLeft: `2px solid ${C.primary}`,
            }}>
              <span style={{ fontFamily: C.mono, fontSize: 15, fontWeight: 700, color: C.primary }}>{items.length}</span>
              <span style={{ fontSize: 8, color: C.t1, letterSpacing: 1.5, textTransform: "uppercase" }}>Total</span>
            </div>

            {isAdmin && (
              <button onClick={abrirNuevo} style={{
                border: "1px solid rgba(59,130,246,0.35)", background: "rgba(59,130,246,0.15)",
                color: "#60a5fa", padding: "7px 18px", borderRadius: 8, cursor: "pointer",
                fontSize: 12, fontWeight: 600, fontFamily: C.sans,
              }}>
                + Nuevo
              </button>
            )}
          </div>

          {/* ── SEARCH ── */}
          <div style={{
            height: 44, background: "rgba(12,12,14,0.85)", ...GLASS,
            borderBottom: `1px solid ${C.b0}`, padding: "0 18px",
            display: "flex", alignItems: "center", flexShrink: 0,
          }}>
            <input
              style={{
                background: "transparent", border: "none",
                color: C.t0, fontSize: 12, fontFamily: C.sans,
                outline: "none", width: "100%", maxWidth: 400,
              }}
              placeholder="⌕  Buscar documentos…"
              value={q} onChange={e => setQ(e.target.value)}
            />
          </div>

          {/* ── CONTENT ── */}
          <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px" }}>

            {err && (
              <div style={{ padding: "10px 14px", borderRadius: 8, marginBottom: 14,
                background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", color: C.red, fontSize: 12 }}>
                {err}
              </div>
            )}
            {msg && (
              <div style={{ padding: "10px 14px", borderRadius: 8, marginBottom: 14,
                background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.25)", color: C.green, fontSize: 12 }}>
                {msg}
              </div>
            )}

            {loading ? (
              <div style={{ textAlign: "center", color: C.t2, padding: 40, fontSize: 11,
                letterSpacing: 2, textTransform: "uppercase", fontFamily: C.mono }}>
                Cargando…
              </div>
            ) : filtrados.length === 0 ? (
              <div style={{ textAlign: "center", color: C.t2, padding: 40, fontSize: 12 }}>
                Sin documentos
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
                {filtrados.map(p => {
                  const isPdf     = !!p.pdf_url;
                  const pasoCount = Array.isArray(p.pasos) ? p.pasos.filter(x => (typeof x === "string" ? x : x?.texto)?.trim()).length : 0;
                  const dateStr   = p.created_at ? new Date(p.created_at).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" }) : "";
                  const rolLabel  = Array.isArray(p.rol_visible) ? (p.rol_visible[0] === "todos" || !p.rol_visible[0] ? null : p.rol_visible[0]) : null;

                  return (
                    <div key={p.id} style={DOCCARD} className="doc-card" onClick={() => setSelItem(p)}>
                      {/* Preview */}
                      <div style={{ flex: 1, background: "rgba(255,255,255,0.015)", display: "flex",
                        justifyContent: "center", alignItems: "center", overflow: "hidden", position: "relative" }}>
                        {isPdf ? (
                          <div style={{ background: "#fff", width: "calc(100% - 20px)", height: "calc(100% - 16px)",
                            borderRadius: 4, boxShadow: "0 2px 12px rgba(0,0,0,0.6)", padding: 12, overflow: "hidden", position: "relative" }}>
                            <iframe
                              src={`${p.pdf_url}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
                              style={{ position: "absolute", top: 0, left: 0, width: "400%", height: "400%",
                                transform: "scale(0.25)", transformOrigin: "top left", border: "none", pointerEvents: "none" }}
                              title={`preview-${p.id}`} tabIndex={-1}
                            />
                            <div style={{ position: "absolute", inset: 0, zIndex: 10 }} />
                          </div>
                        ) : (
                          <div style={{ background: "#fff", width: "calc(100% - 20px)", height: "calc(100% - 16px)",
                            borderRadius: 4, boxShadow: "0 2px 12px rgba(0,0,0,0.6)", padding: 12, overflow: "hidden", position: "relative" }}>
                            <div style={{ fontSize: 7, fontWeight: 800, color: "#1a1a2e", marginBottom: 5, lineHeight: 1.3 }}>{p.titulo}</div>
                            {p.descripcion && <div style={{ fontSize: 5.5, color: "#555", lineHeight: 1.5, marginBottom: 4 }}>{p.descripcion}</div>}
                            {pasoCount > 0 && (
                              <div style={{ fontSize: 5.5, color: "#333", lineHeight: 1.5 }}>
                                {p.pasos.slice(0, 6).map((paso, i) => (
                                  <div key={i} style={{ marginBottom: 2, display: "flex", gap: 3 }}>
                                    <span style={{ opacity: 0.5 }}>{i + 1}.</span>
                                    <span>{typeof paso === "string" ? paso : paso.texto}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 36, background: "linear-gradient(transparent, #fff)" }} />
                          </div>
                        )}
                      </div>

                      {/* Footer */}
                      <div style={{ padding: "11px 14px 12px", borderTop: `1px solid ${C.b0}`, flexShrink: 0 }}>
                        <div style={{ color: C.t0, fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis",
                          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                          {p.titulo}
                        </div>
                        {p.descripcion && (
                          <div style={{ fontSize: 11, color: C.t2, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {p.descripcion}
                          </div>
                        )}
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 7 }}>
                          <span style={{
                            padding: "2px 7px", borderRadius: 5, fontSize: 9, fontWeight: 700,
                            letterSpacing: 0.8, textTransform: "uppercase",
                            background: isPdf ? "rgba(239,68,68,0.1)" : "rgba(59,130,246,0.1)",
                            color: isPdf ? C.red : C.primary,
                            border: isPdf ? "1px solid rgba(239,68,68,0.2)" : "1px solid rgba(59,130,246,0.2)",
                          }}>
                            {isPdf ? "PDF" : `${pasoCount} pasos`}
                          </span>
                          {rolLabel && <span style={{ fontSize: 9, color: C.t2, letterSpacing: 0.8, textTransform: "uppercase" }}>· {rolLabel}</span>}
                          <span style={{ marginLeft: "auto", fontSize: 9, color: C.t2, fontFamily: C.mono }}>{dateStr}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── VISOR ── */}
      {selItem && (
        <div className="no-print"
          style={{ position: "fixed", inset: 0, zIndex: 9990, background: "rgba(0,0,0,0.88)", ...GLASS,
            display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 16px", overflowY: "auto" }}
          onClick={e => e.target === e.currentTarget && setSelItem(null)}
        >
          {/* Toolbar del visor */}
          <div style={{
            position: "sticky", top: 0,
            width: "100%", maxWidth: 900,
            background: "rgba(9,9,11,0.95)", ...GLASS,
            border: `1px solid ${C.b0}`, borderRadius: 10, height: 50,
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "0 14px", zIndex: 10, marginBottom: 16,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
              <span style={{
                padding: "2px 8px", borderRadius: 5, fontSize: 9, fontWeight: 700, letterSpacing: 1,
                background: selItem.pdf_url ? "rgba(239,68,68,0.12)" : "rgba(59,130,246,0.12)",
                color: selItem.pdf_url ? C.red : C.primary,
                border: selItem.pdf_url ? "1px solid rgba(239,68,68,0.2)" : "1px solid rgba(59,130,246,0.2)",
                flexShrink: 0,
              }}>
                {selItem.pdf_url ? "PDF" : "DOC"}
              </span>
              <span style={{ color: C.t0, fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {selItem.titulo}
              </span>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0, marginLeft: 12 }}>
              {selItem.pdf_url ? (
                <a href={selItem.pdf_url} target="_blank" rel="noreferrer" style={{
                  border: `1px solid ${C.b0}`, background: C.s0, color: C.t1,
                  padding: "5px 12px", borderRadius: 7, cursor: "pointer", fontSize: 11, textDecoration: "none",
                }}>↗ Abrir</a>
              ) : (
                <button style={{ border: `1px solid ${C.b0}`, background: C.s0, color: C.t1,
                  padding: "5px 12px", borderRadius: 7, cursor: "pointer", fontSize: 11, fontFamily: C.sans }}
                  onClick={imprimirPDF}>↓ Imprimir</button>
              )}
              {isAdmin && (
                <>
                  <button style={{ border: `1px solid ${C.b0}`, background: C.s0, color: C.t1,
                    padding: "5px 12px", borderRadius: 7, cursor: "pointer", fontSize: 11, fontFamily: C.sans }}
                    onClick={() => abrirEditar(selItem)}>Editar</button>
                  <button style={{ border: "1px solid rgba(239,68,68,0.25)", background: "rgba(239,68,68,0.08)",
                    color: C.red, padding: "5px 12px", borderRadius: 7, cursor: "pointer", fontSize: 11, fontFamily: C.sans }}
                    onClick={() => archivar(selItem.id)}>Archivar</button>
                </>
              )}
              <button style={{ background: "transparent", border: `1px solid ${C.b0}`, color: C.t2,
                fontSize: 18, lineHeight: 1, cursor: "pointer", padding: "4px 9px", borderRadius: 7, marginLeft: 4 }}
                onClick={() => setSelItem(null)}>×</button>
            </div>
          </div>

          {selItem.pdf_url ? (
            <iframe
              src={`${selItem.pdf_url}#toolbar=0`}
              style={{ width: "100%", maxWidth: 1000, height: "80vh", border: "none", borderRadius: 10, background: "#fff" }}
              title="Visor PDF"
            />
          ) : (
            <div id="printable-doc" style={{
              background: "#fff", width: "100%", maxWidth: 800,
              padding: "50px 60px", borderRadius: 10, boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
              color: "#000", minHeight: "80vh",
            }}>
              <div style={{ borderBottom: "2px solid #000", paddingBottom: 10, marginBottom: 20,
                display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                <div>
                  <h1 style={{ margin: 0, fontSize: 24, textTransform: "uppercase", fontFamily: "Arial, sans-serif" }}>{selItem.titulo}</h1>
                  <div style={{ fontSize: 12, color: "#555", marginTop: 4 }}>PROCEDIMIENTO OPERATIVO ESTÁNDAR</div>
                </div>
                <img src="/logo-k.png" alt="Klase A" style={{ height: 30, opacity: 0.8 }} />
              </div>
              {selItem.descripcion && (
                <div style={{ marginBottom: 20, fontSize: 14 }}>
                  <strong>OBJETIVO: </strong>{selItem.descripcion}
                </div>
              )}
              {Array.isArray(selItem.pasos) && selItem.pasos.length > 0 && (
                <div style={{ marginBottom: 30 }}>
                  <div style={{ background: "#eee", padding: "6px 10px", fontWeight: "bold", fontSize: 13,
                    borderTop: "1px solid #000", borderBottom: "1px solid #000", marginBottom: 15 }}>DESARROLLO / PASOS</div>
                  <ol style={{ paddingLeft: 24, margin: 0, fontSize: 14, lineHeight: 1.6 }}>
                    {selItem.pasos.map((paso, i) => (
                      <li key={i} style={{ marginBottom: 8 }}>{typeof paso === "string" ? paso : paso.texto}</li>
                    ))}
                  </ol>
                </div>
              )}
              {selItem.contenido && (
                <div>
                  <div style={{ background: "#eee", padding: "6px 10px", fontWeight: "bold", fontSize: 13,
                    borderTop: "1px solid #000", borderBottom: "1px solid #000", marginBottom: 15 }}>NOTAS ADICIONALES</div>
                  <div style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{selItem.contenido}</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── MODAL NUEVO / EDITAR ── */}
      {showModal && (
        <div className="no-print"
          style={{ position: "fixed", inset: 0, zIndex: 9995, background: "rgba(0,0,0,0.88)", ...GLASS,
            display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "40px 16px", overflowY: "auto" }}
          onClick={e => !uploading && e.target === e.currentTarget && setShowModal(false)}
        >
          <div style={MODAL}>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22 }}>
              <div>
                <div style={{ fontSize: 15, color: C.t0, fontWeight: 700 }}>
                  {editTarget ? "Editar documento" : "Nuevo documento"}
                </div>
                <div style={{ fontSize: 11, color: C.t2, marginTop: 3 }}>Procedimiento operativo</div>
              </div>
              <button type="button" onClick={() => setShowModal(false)} style={{
                background: C.s0, border: `1px solid ${C.b0}`, color: C.t2,
                width: 28, height: 28, borderRadius: "50%", cursor: "pointer",
                fontSize: 17, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center",
              }}>×</button>
            </div>

            <form onSubmit={guardar}>
              {/* Título */}
              <div style={{ marginBottom: 12 }}>
                <label style={LABEL}>Título *</label>
                <input style={INP} required value={form.titulo} autoFocus placeholder="Nombre del procedimiento"
                  onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} />
              </div>

              {/* Descripción */}
              <div style={{ marginBottom: 12 }}>
                <label style={LABEL}>Descripción / objetivo</label>
                <input style={INP} placeholder="Resumen en una línea…" value={form.descripcion}
                  onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
              </div>

              {/* Visible para + PDF */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                <div>
                  <label style={LABEL}>Visible para</label>
                  <select style={INP} value={form.rol_visible} onChange={e => setForm(f => ({ ...f, rol_visible: e.target.value }))}>
                    {ROLES.map(r => <option key={r} value={r}>{r === "todos" ? "Todos" : r}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ ...LABEL, color: C.primary }}>Adjuntar PDF</label>
                  <div style={{ padding: "7px 10px", background: "rgba(59,130,246,0.05)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: 8 }}>
                    <input type="file" accept="application/pdf"
                      onChange={e => setFileToUpload(e.target.files[0])}
                      style={{ color: C.t1, fontSize: 11, width: "100%" }} />
                  </div>
                  {form.pdf_url && !fileToUpload && (
                    <div style={{ fontSize: 10, color: C.t2, marginTop: 4 }}>PDF guardado · nuevo reemplaza</div>
                  )}
                  {fileToUpload && (
                    <div style={{ fontSize: 10, color: C.primary, marginTop: 4 }}>← {fileToUpload.name}</div>
                  )}
                </div>
              </div>

              {/* Pasos */}
              {!fileToUpload && (
                <div style={{ marginBottom: 12 }}>
                  <label style={LABEL}>Pasos {form.pdf_url ? "(ya tiene PDF)" : ""}</label>
                  {pasos.map((p, i) => (
                    <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center" }}>
                      <span style={{ width: 18, fontSize: 10, color: C.t2, textAlign: "right", fontFamily: C.mono, flexShrink: 0 }}>{i + 1}</span>
                      <input style={{ ...INP, flex: 1 }} placeholder={`Paso ${i + 1}…`} value={p}
                        onChange={e => { const n = [...pasos]; n[i] = e.target.value; setPasos(n); }} />
                      <button type="button"
                        style={{ background: "transparent", border: "none", color: C.t2, cursor: "pointer", fontSize: 16, padding: "0 4px", flexShrink: 0 }}
                        onClick={() => setPasos(prev => prev.filter((_, j) => j !== i))}>×</button>
                    </div>
                  ))}
                  <button type="button"
                    style={{ border: `1px solid ${C.b0}`, background: C.s0, color: C.t1,
                      padding: "5px 12px", borderRadius: 7, cursor: "pointer", fontSize: 11, fontFamily: C.sans, marginTop: 4 }}
                    onClick={() => setPasos(p => [...p, ""])}>+ Paso</button>
                </div>
              )}

              {/* Notas */}
              <div style={{ marginBottom: 20 }}>
                <label style={LABEL}>Notas adicionales</label>
                <textarea style={{ ...INP, minHeight: 60, resize: "vertical" }} placeholder="Advertencias, aclaraciones…"
                  value={form.contenido} onChange={e => setForm(f => ({ ...f, contenido: e.target.value }))} />
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button type="submit" disabled={uploading} style={{
                  flex: 1, border: "1px solid rgba(59,130,246,0.35)", background: "rgba(59,130,246,0.15)",
                  color: "#60a5fa", padding: "11px", borderRadius: 8, cursor: "pointer",
                  fontSize: 13, fontWeight: 600, fontFamily: C.sans, opacity: uploading ? 0.6 : 1,
                }}>
                  {uploading ? "Subiendo…" : (editTarget ? "Guardar cambios" : "Crear documento")}
                </button>
                <button type="button" disabled={uploading} onClick={() => setShowModal(false)} style={{
                  background: "transparent", border: `1px solid ${C.b0}`, color: C.t2,
                  padding: "11px 20px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontFamily: C.sans,
                }}>
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
