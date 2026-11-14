/* ═══════════════════════════════════════════════════════════════
   Manual del propietario · postventa
   Misma tabla (tickets) y el mismo bucket (ticket-attachments) que el
   panel anterior: postventa sigue viendo los reportes donde siempre.
═══════════════════════════════════════════════════════════════ */
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Play, RefreshCw, Upload, X } from "lucide-react";
import { supabase } from "@/supabaseClient";
import { useToast } from "@/components/ui/Toast";
import { AREAS_SOPORTE, ESTADOS_TICKET } from "./contenido";
import { Reveal } from "./piezas";

const VACIO = { area: "", desc: "", phone: "", ubi: "" };

export default function Postventa({ clienteId, nombreBarco }) {
  const toast = useToast();
  const [fm, setFm] = useState(VACIO);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [tickets, setTickets] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [archivos, setArchivos] = useState([]);
  const [arrastre, setArrastre] = useState(false);
  const [foto, setFoto] = useState(null);
  const inputRef = useRef(null);

  const cargar = useCallback(async () => {
    if (!clienteId) { setCargando(false); return; }
    setCargando(true);
    const { data, error } = await supabase
      .from("tickets").select("*").eq("cliente_id", clienteId)
      .order("fecha_creacion", { ascending: false }).limit(20);
    if (!error) setTickets(data || []);
    setCargando(false);
  }, [clienteId]);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    if (!foto) return undefined;
    const onKey = e => { if (e.key === "Escape") setFoto(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [foto]);

  // Las vistas previas usan object URLs: se liberan al sacar el archivo o al salir.
  const archivosRef = useRef(archivos);
  archivosRef.current = archivos;
  useEffect(() => () => archivosRef.current.forEach(a => URL.revokeObjectURL(a.url)), []);

  const agregar = (files) => {
    const validos = [...(files || [])].filter(f => f.type.startsWith("image/") || f.type.startsWith("video/"));
    if (!validos.length) return;
    setArchivos(p => [...p, ...validos.map(f => ({
      id: `${Date.now()}-${Math.random()}`, file: f, name: f.name, type: f.type, url: URL.createObjectURL(f),
    }))]);
  };
  const quitar = (id) => setArchivos(p => {
    const a = p.find(x => x.id === id);
    if (a) URL.revokeObjectURL(a.url);
    return p.filter(x => x.id !== id);
  });

  const subir = async (file, carpeta) => {
    const path = `tickets/${carpeta}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { error } = await supabase.storage.from("ticket-attachments").upload(path, file, { cacheControl: "3600", upsert: true });
    if (error) throw new Error(error.message || "No se pudo subir el archivo");
    return supabase.storage.from("ticket-attachments").getPublicUrl(path).data.publicUrl;
  };

  const enviar = async () => {
    if (!fm.area) { toast.warning("Elegí el área del problema"); return; }
    if (fm.desc.trim().length < 10) { toast.warning("Contanos un poco más: qué pasó y cuándo"); return; }
    if (!fm.phone.trim()) { toast.warning("Dejanos un WhatsApp para responderte"); return; }
    if (enviando) return;
    setEnviando(true);
    try {
      const urls = [];
      if (archivos.length) {
        const carpeta = `${clienteId}_${Date.now()}`;
        for (const a of archivos) {
          try { urls.push(await subir(a.file, carpeta)); }
          catch (e) { toast.error(`No se pudo subir ${a.name.slice(0, 28)}: ${e.message}`); }
        }
      }
      const { error } = await supabase.from("tickets").insert([{
        cliente_id: clienteId,
        area: fm.area,
        descripcion: fm.desc.trim(),
        telefono: fm.phone,
        ubicacion_barco: fm.ubi,
        nombre_barco_ticket: nombreBarco,
        estado: "pendiente",
        adjuntos: urls,
      }]);
      if (error) throw error;
      archivos.forEach(a => URL.revokeObjectURL(a.url));
      setFm(VACIO);
      setArchivos([]);
      setEnviado(true);
      cargar();
    } catch (e) {
      toast.error(`No se pudo enviar el reporte: ${e.message}`);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <section className="kx-bloque">
      <div className="kx-wrap kx-soporte">
        <div>
          <Reveal className="kx-eyebrow">Nuevo reporte</Reveal>
          {enviado ? (
            <div className="kx-enviado">
              <div className="kx-enviado-circ"><Check size={28} strokeWidth={1.5} /></div>
              <h2 className="kx-h2" style={{ marginTop: 28 }}>Recibimos tu reporte.</h2>
              <p className="kx-p" style={{ marginTop: 16, maxWidth: 420 }}>El equipo de postventa lo revisa y te escribe por WhatsApp. Podés seguir el estado acá al lado.</p>
              <button type="button" className="kx-btn kx-btn-linea" style={{ marginTop: 32 }} onClick={() => setEnviado(false)}>Enviar otro</button>
            </div>
          ) : (
            <div className="kx-form" style={{ marginTop: 24 }}>
              <Reveal className="kx-campo">
                <span className="kx-label" id="kx-area-l">Área del problema</span>
                <div className="kx-chips" role="group" aria-labelledby="kx-area-l" style={{ marginTop: 6 }}>
                  {AREAS_SOPORTE.map(a => (
                    <button key={a} type="button" className="kx-chip" aria-pressed={fm.area === a} onClick={() => setFm(f => ({ ...f, area: a }))}>{a}</button>
                  ))}
                </div>
              </Reveal>
              <Reveal className="kx-campo" d={1}>
                <label htmlFor="kx-desc">Qué pasa</label>
                <textarea id="kx-desc" className="kx-input" value={fm.desc} onChange={e => setFm(f => ({ ...f, desc: e.target.value }))} placeholder="Cuándo empezó, qué notás, qué estabas usando…" />
              </Reveal>
              <Reveal d={2} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 28 }}>
                <div className="kx-campo">
                  <label htmlFor="kx-ubi">Dónde está el barco</label>
                  <input id="kx-ubi" className="kx-input" value={fm.ubi} onChange={e => setFm(f => ({ ...f, ubi: e.target.value }))} placeholder="Marina · amarra" />
                </div>
                <div className="kx-campo">
                  <label htmlFor="kx-tel">WhatsApp</label>
                  <input id="kx-tel" className="kx-input" type="tel" value={fm.phone} onChange={e => setFm(f => ({ ...f, phone: e.target.value }))} placeholder="+54 9 ···· ··· ····" />
                </div>
              </Reveal>
              <Reveal className="kx-campo" d={3}>
                <span className="kx-label">Fotos o videos</span>
                {archivos.length > 0 && (
                  <div className="kx-adjuntos" style={{ margin: "6px 0 8px" }}>
                    {archivos.map(a => (
                      <div className="kx-adjunto" key={a.id} title={a.name}>
                        {a.type.startsWith("image/")
                          ? <img src={a.url} alt="" />
                          : <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center" }}><Play size={18} strokeWidth={1.5} /></div>}
                        <button type="button" aria-label={`Quitar ${a.name}`} onClick={() => quitar(a.id)}><X size={13} /></button>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  className="kx-subir"
                  data-arrastre={arrastre ? "1" : "0"}
                  onClick={() => inputRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); setArrastre(true); }}
                  onDragLeave={() => setArrastre(false)}
                  onDrop={e => { e.preventDefault(); setArrastre(false); agregar(e.dataTransfer.files); }}
                >
                  <Upload size={20} strokeWidth={1.25} />
                  <span style={{ fontSize: 15 }}>Tocá para sacar una foto o elegir archivos</span>
                </button>
                <input ref={inputRef} type="file" accept="image/*,video/*" multiple hidden onChange={e => { agregar(e.target.files); e.target.value = ""; }} />
              </Reveal>
              <div>
                <button type="button" className="kx-btn" disabled={enviando} onClick={enviar}>
                  {enviando ? "Enviando…" : <>Enviar reporte <ArrowRight size={15} strokeWidth={1.5} /></>}
                </button>
              </div>
            </div>
          )}
        </div>

        <div>
          <Reveal style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <span className="kx-eyebrow">Tus reportes</span>
            <button type="button" className="kx-link" onClick={cargar}><RefreshCw size={13} strokeWidth={1.5} /> Actualizar</button>
          </Reveal>
          <div style={{ marginTop: 16, borderTop: "1px solid var(--kx-line-2)" }}>
            {cargando ? (
              <div style={{ paddingTop: 16 }}>{[0, 1, 2].map(i => <div key={i} className="kx-esq" />)}</div>
            ) : !tickets.length ? (
              <p className="kx-p" style={{ padding: "32px 0" }}>Todavía no enviaste ningún reporte. Cuando lo hagas, vas a ver acá cómo avanza.</p>
            ) : tickets.map((t, i) => (
              <Reveal className="kx-ticket" key={t.id} d={i % 5}>
                <div className="kx-ticket-cab">
                  <strong style={{ fontSize: 18, fontWeight: 400 }}>{t.area}</strong>
                  <span className="kx-estado" data-e={t.estado}><i />{ESTADOS_TICKET[t.estado] || ESTADOS_TICKET.pendiente}</span>
                </div>
                <p className="kx-p" style={{ marginTop: 8 }}>{t.descripcion?.length > 160 ? `${t.descripcion.slice(0, 160)}…` : t.descripcion}</p>
                {t.adjuntos?.length > 0 && (
                  <div className="kx-adjuntos" style={{ marginTop: 12 }}>
                    {t.adjuntos.map(url => (
                      <button type="button" key={url} className="kx-adjunto" style={{ width: 56, height: 56 }} onClick={() => setFoto(url)} aria-label="Ver adjunto">
                        <img src={url} alt="" loading="lazy" onError={e => { e.currentTarget.style.display = "none"; }} />
                      </button>
                    ))}
                  </div>
                )}
                <div className="kx-celda-v" style={{ marginTop: 12 }}>
                  {t.fecha_creacion && new Date(t.fecha_creacion).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" })}
                </div>
                {t.seguimiento && (
                  <div className="kx-respuesta">
                    <div className="kx-eyebrow" style={{ marginBottom: 6 }}>Respuesta de postventa</div>
                    {t.seguimiento}
                  </div>
                )}
              </Reveal>
            ))}
          </div>
        </div>
      </div>

      {foto && (
        <div className="kx-capa" role="dialog" aria-modal="true" aria-label="Adjunto" onMouseDown={e => { if (e.target === e.currentTarget) setFoto(null); }}>
          <button type="button" className="kx-capa-cerrar" aria-label="Cerrar" onClick={() => setFoto(null)}><X size={20} strokeWidth={1.5} /></button>
          <img src={foto} alt="" className="kx-capa-cuerpo" style={{ width: "auto", maxWidth: "92vw", maxHeight: "86vh", objectFit: "contain" }} />
        </div>
      )}
    </section>
  );
}
