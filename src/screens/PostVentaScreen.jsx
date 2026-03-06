// PostVentaScreen — tickets vinculados a obras (no a texto libre)
// SINCRONIZACIÓN: Los clientes creados en ConfiguracionScreen aparecen
// automáticamente aquí. Los que no tienen GPS muestran un aviso para completar la ubicación.
import React, { useEffect, useState, useRef } from "react";
import {
  MapPin, Crosshair, Pencil, Ticket, ExternalLink,
  Phone, CheckCircle2, Link2, AlertTriangle, X as XIcon,
  Circle, Navigation
} from "lucide-react";
import { supabase } from "../supabaseClient";
import Sidebar from "../components/Sidebar";
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// ── ÍCONOS ───────────────────────────────────────────────────────────
function makeIcon(color, pulse) {
  return L.divIcon({
    className: "custom-modern-icon",
    html: `<div style="position:relative;width:28px;height:28px;display:flex;align-items:center;justify-content:center">
      <div style="width:10px;height:10px;border-radius:50%;background:${color};box-shadow:0 0 10px ${color}bb;position:relative;z-index:2"></div>
      <div style="position:absolute;inset:0;border-radius:50%;border:2px solid ${color}66;${pulse?`animation:pin-pulse 1.8s ease-out infinite;`:""}"></div>
    </div>`,
    iconSize:[28,28], iconAnchor:[14,14], popupAnchor:[0,-16],
  });
}
const ICON_GREEN  = makeIcon("#10b981", true);
const ICON_YELLOW = makeIcon("#f59e0b", true);
const ICON_RED    = makeIcon("#ef4444", true);
const ICON_NEW    = makeIcon("#4a90e2", false);

function getIcon(tickets) {
  if (!tickets || tickets.length===0) return ICON_GREEN;
  if (tickets.some(t=>t.estado==="pendiente")) return ICON_RED;
  if (tickets.some(t=>t.estado==="en_proceso")) return ICON_YELLOW;
  return ICON_GREEN;
}

// ── TOKENS ───────────────────────────────────────────────────────────
const C = {
  bg:"#09090b", s0:"rgba(255,255,255,0.03)", s1:"rgba(255,255,255,0.06)",
  b0:"rgba(255,255,255,0.08)", b1:"rgba(255,255,255,0.15)", b2:"rgba(255,255,255,0.25)",
  t0:"#f4f4f5", t1:"#a1a1aa", t2:"#71717a",
  mono:"'JetBrains Mono','IBM Plex Mono',monospace", sans:"'Outfit',system-ui,sans-serif",
  primary:"#3b82f6", amber:"#f59e0b", green:"#10b981", red:"#ef4444", blue:"#3b82f6",
};

// ── MAP HELPERS ───────────────────────────────────────────────────────
function MapEventsHandler({ isSelecting, onLocationSelected }) {
  useMapEvents({ click(e) { if(isSelecting) onLocationSelected(e.latlng.lat, e.latlng.lng); } });
  return null;
}
function MapResizer() {
  const map = useMap();
  useEffect(()=>{ setTimeout(()=>map.invalidateSize(),300); },[map]);
  return null;
}
function LocationPreview({ lat, lng }) {
  if (!lat || !lng) return null;
  const la=parseFloat(lat), ln=parseFloat(lng), d=0.008;
  const bbox=`${ln-d},${la-d},${ln+d},${la+d}`;
  const src=`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${la},${ln}`;
  return (
    <div style={{ borderRadius:10, overflow:"hidden", border:"1px solid rgba(61,206,106,0.25)", marginTop:10, position:"relative" }}>
      <iframe title="preview" src={src} width="100%" height="140" style={{ display:"block", border:"none", filter:"invert(0.88) hue-rotate(180deg) saturate(0.7) brightness(0.9)" }} loading="lazy" sandbox="allow-scripts allow-same-origin" />
      <div style={{ position:"absolute", bottom:6, left:6, background:"rgba(6,10,20,0.88)", border:"1px solid rgba(61,206,106,0.3)", borderRadius:6, padding:"3px 9px", fontFamily:C.mono, fontSize:10, color:C.green, backdropFilter:"blur(8px)", pointerEvents:"none" }}>
        {la.toFixed(5)}, {ln.toFixed(5)}
      </div>
    </div>
  );
}

// ── SELECTOR OBRA (linea → obras en cascada) ─────────────────────────
function ObraSelector({ value, onChange, obras }) {
  const INP = { width:"100%", boxSizing:"border-box", background:"rgba(255,255,255,0.05)", border:`1px solid ${C.b0}`, color:C.t0, padding:"9px 12px", borderRadius:9, fontSize:13, outline:"none", fontFamily:C.sans };
  const LBL = { fontSize:9, letterSpacing:2, color:C.t1, display:"block", marginBottom:6, textTransform:"uppercase", fontWeight:600 };
  const obraActual = obras.find(o=>o.id===value);
  return (
    <div style={{ padding:"14px 16px", borderRadius:10, background:"rgba(59,130,246,0.04)", border:"1px solid rgba(59,130,246,0.18)", marginBottom:14 }}>
      <div style={{ fontSize:9, letterSpacing:2.5, color:"#4a7aaa", textTransform:"uppercase", marginBottom:12, fontWeight:600 }}><Link2 size={11} style={{marginRight:5}}/> Obra vinculada</div>
      <div>
        <label style={LBL}>Código de obra</label>
        {obras.length === 0 ? (
          <div style={{ fontSize:11, color:"#52525b", fontStyle:"italic", padding:"8px 0" }}>No hay obras disponibles.</div>
        ) : (
          <select
            style={{ ...INP, color: value ? "#93c5fd" : C.t2, borderColor: value ? "rgba(59,130,246,0.4)" : C.b0 }}
            value={value}
            onChange={e=>onChange(e.target.value)}
          >
            <option value="">— Sin asignar —</option>
            {obras.map(o=>(
              <option key={o.id} value={o.id}>{o.codigo}</option>
            ))}
          </select>
        )}
      </div>
      {obraActual && (
        <div style={{ marginTop:8, padding:"6px 10px", borderRadius:7, background:"rgba(59,130,246,0.08)", border:"1px solid rgba(59,130,246,0.2)", fontSize:11, color:"#93c5fd" }}>
          <CheckCircle2 size={11} style={{marginRight:5,verticalAlign:"middle"}}/> Obra {obraActual.codigo}
        </div>
      )}
    </div>
  );
}

// ── MODAL EDITAR BARCO ────────────────────────────────────────────────
function EditModal({ barco, obras, onSave, onClose, autoFocusGps = false }) {
  const [form, setForm] = useState({
    nombre_barco:       barco.nombre_barco      ?? "",
    propietario:        barco.propietario        ?? "",
    ubicacion_general:  barco.ubicacion_general  ?? "",
    detalle_ubicacion:  barco.detalle_ubicacion  ?? "",
    latitud:            String(barco.latitud     ?? ""),
    longitud:           String(barco.longitud    ?? ""),
    link_maps:          "",
    obra_id:            barco.obra_id            ?? "",
  });
  const [saving,   setSaving]   = useState(false);
  const [err,      setErr]      = useState("");
  const [showPrev, setShowPrev] = useState(false);
  const gpsRef = useRef(null);

  // Auto-focus en el campo GPS si se abre desde "Completar ubicación"
  useEffect(() => {
    if (autoFocusGps && gpsRef.current) {
      setTimeout(() => gpsRef.current?.focus(), 200);
    }
  }, [autoFocusGps]);

  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  function handleMapsInput(e) {
    const val = e.target.value;
    let lat=form.latitud, lng=form.longitud;
    const matchAt   = val.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    const matchBang = val.match(/3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
    const matchRaw  = val.match(/(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)/);
    if      (matchAt)                           { lat=matchAt[1];   lng=matchAt[2];   }
    else if (matchBang)                         { lat=matchBang[1]; lng=matchBang[2]; }
    else if (matchRaw && !val.includes("http")) { lat=matchRaw[1];  lng=matchRaw[2];  }
    setForm(f=>({...f,link_maps:val,latitud:lat,longitud:lng}));
    setShowPrev(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true); setErr("");
    const upd = {
      nombre_barco:      form.nombre_barco.trim(),
      propietario:       form.propietario.trim() || null,
      ubicacion_general: form.ubicacion_general.trim() || null,
      detalle_ubicacion: form.detalle_ubicacion.trim() || null,
      obra_id:           form.obra_id || null,
    };
    // Solo actualizar coords si se ingresaron
    if (form.latitud && form.longitud) {
      upd.latitud  = parseFloat(String(form.latitud).replace(",","."));
      upd.longitud = parseFloat(String(form.longitud).replace(",","."));
    }
    const { error } = await supabase.from("postventa_flota").update(upd).eq("id", barco.id);
    if (error) { setErr(error.message); setSaving(false); return; }
    onSave();
  }

  const INP = { width:"100%", boxSizing:"border-box", background:"rgba(255,255,255,0.05)", border:`1px solid ${C.b0}`, color:C.t0, padding:"10px 14px", borderRadius:9, fontSize:13, outline:"none", marginBottom:14, transition:"border-color 0.15s", fontFamily:C.sans };
  const LBL = { fontSize:9, letterSpacing:2, color:C.t1, display:"block", marginBottom:6, textTransform:"uppercase", fontWeight:600 };
  const hasCoords = form.latitud && form.longitud;

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(3,5,12,0.88)", backdropFilter:"blur(24px)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:9999 }}
      onClick={e=>e.target===e.currentTarget && onClose()}>
      <div style={{ background:"rgba(6,10,20,0.97)", backdropFilter:"blur(60px)", border:`1px solid ${C.b1}`, padding:"28px 28px", borderRadius:18, width:"100%", maxWidth:540, boxShadow:"0 32px 80px rgba(0,0,0,0.8)", maxHeight:"92vh", overflowY:"auto" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:22 }}>
          <div>
            <div style={{ fontSize:16, color:C.t0, fontWeight:700 }}>Editar embarcación</div>
            <div style={{ fontSize:11, color:C.t1, marginTop:4, fontFamily:C.mono }}>{barco.nombre_barco}</div>
          </div>
          <button onClick={onClose} style={{ background:"transparent", border:"none", color:C.t1, cursor:"pointer", fontSize:20, padding:"4px 8px" }}>×</button>
        </div>

        {/* Aviso GPS pendiente */}
        {!barco.latitud && !barco.longitud && (
          <div style={{ padding:"10px 14px", borderRadius:9, background:"rgba(245,158,11,0.08)", border:"1px solid rgba(245,158,11,0.3)", fontSize:12, color:"#fcd34d", marginBottom:16, display:"flex", alignItems:"center", gap:8 }}>
            <MapPin size={14} color="#f59e0b" style={{flexShrink:0}}/>
            <span>Este barco fue creado desde Configuración. Completá la ubicación GPS para que aparezca en el mapa.</span>
          </div>
        )}

        {err && <div style={{ padding:"10px 14px", borderRadius:9, background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.25)", fontSize:12, color:"#fca5a5", marginBottom:16 }}>{err}</div>}

        <form onSubmit={handleSubmit}>
          <div style={{ fontSize:9, letterSpacing:2, color:C.t1, textTransform:"uppercase", fontWeight:600, marginBottom:12 }}>Datos</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:2 }}>
            <div><label style={LBL}>Nombre *</label><input required style={INP} value={form.nombre_barco} onChange={e=>set("nombre_barco",e.target.value)} /></div>
            <div><label style={LBL}>Propietario</label><input style={INP} value={form.propietario} onChange={e=>set("propietario",e.target.value)} /></div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
            <div><label style={LBL}>Lugar</label><input style={INP} value={form.ubicacion_general} onChange={e=>set("ubicacion_general",e.target.value)} /></div>
            <div><label style={LBL}>Detalle</label><input style={INP} value={form.detalle_ubicacion} onChange={e=>set("detalle_ubicacion",e.target.value)} /></div>
          </div>
          <ObraSelector value={form.obra_id} onChange={v=>set("obra_id",v)} obras={obras} />

          {/* Ubicación GPS — autoFocus si viene de "Completar GPS" */}
          <div style={{ fontSize:9, letterSpacing:2, color:C.t1, textTransform:"uppercase", fontWeight:600, marginBottom:12 }}>
            Ubicación GPS {!barco.latitud ? <span style={{ color:"#f59e0b", fontWeight:700 }}>— PENDIENTE</span> : "(actualizar)"}
          </div>
          <label style={LBL}>Pegar link o coordenadas de Google Maps</label>
          <input
            ref={gpsRef}
            style={{ ...INP, borderColor: hasCoords ? "rgba(61,206,106,0.5)" : "rgba(245,158,11,0.4)", background: hasCoords ? "rgba(61,206,106,0.04)" : "rgba(245,158,11,0.04)", color: hasCoords ? C.green : C.t0 }}
            placeholder="Ej: -34.4183, -58.5846  ó  link largo de Maps"
            value={form.link_maps} onChange={handleMapsInput}
          />
          {hasCoords && form.link_maps && showPrev && <LocationPreview lat={form.latitud} lng={form.longitud} />}

          <div style={{ display:"flex", gap:10, marginTop:16 }}>
            <button type="submit" disabled={saving} style={{ flex:1, background:"rgba(255,255,255,0.92)", color:"#080c14", border:"none", padding:"11px 20px", borderRadius:9, fontSize:13, fontWeight:700, cursor:saving?"not-allowed":"pointer" }}>
              {saving ? "Guardando…" : "Guardar cambios"}
            </button>
            <button type="button" onClick={onClose} style={{ background:"transparent", color:C.t1, padding:"11px 20px", borderRadius:9, border:`1px solid ${C.b0}`, cursor:"pointer", fontWeight:600, fontSize:13 }}>Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── POPUP DE TICKET EN EL MAPA ────────────────────────────────────────
function TicketPopupContent({ barco, tickets, onVerTodos }) {
  const pendientes = tickets.filter(t=>t.estado==="pendiente");
  const enProceso  = tickets.filter(t=>t.estado==="en_proceso");
  const top        = [...pendientes,...enProceso][0];
  return (
    <div style={{ padding:"16px 18px", minWidth:230, fontFamily:C.sans }}>
      <div style={{ fontSize:15, color:"#dde2ea", fontWeight:700, marginBottom:4 }}>{barco.nombre_barco}</div>
      {barco.obras && (
        <div style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"2px 8px", borderRadius:5, background:"rgba(59,130,246,0.12)", border:"1px solid rgba(59,130,246,0.25)", marginBottom:8 }}>
          <span style={{ fontFamily:C.mono, fontSize:10, color:"#93c5fd", fontWeight:700 }}>Obra {barco.obras.codigo}</span>
          
        </div>
      )}
      <div style={{ fontSize:11, color:"#566070", marginBottom:10 }}>{barco.propietario} · {barco.ubicacion_general}</div>
      {tickets.length > 0 ? (
        <>
          <div style={{ display:"flex", gap:8, marginBottom:12, flexWrap:"wrap" }}>
            {pendientes.length > 0 && (
              <span style={{ padding:"3px 10px", borderRadius:99, background:"rgba(239,68,68,0.15)", border:"1px solid rgba(239,68,68,0.35)", color:"#ef4444", fontSize:10, fontWeight:700 }}>
                <Circle size={7} color="#ef4444" fill="#ef4444" style={{marginRight:4}}/> {pendientes.length} pendiente{pendientes.length>1?"s":""}
              </span>
            )}
            {enProceso.length > 0 && (
              <span style={{ padding:"3px 10px", borderRadius:99, background:"rgba(245,158,11,0.15)", border:"1px solid rgba(245,158,11,0.35)", color:"#f59e0b", fontSize:10, fontWeight:700 }}>
                <Circle size={7} color="#f59e0b" fill="#f59e0b" style={{marginRight:4}}/> {enProceso.length} en proceso
              </span>
            )}
          </div>
          {top && (
            <div style={{ padding:"10px 12px", borderRadius:8, background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.1)", marginBottom:10 }}>
              <div style={{ fontSize:9, color:"#566070", letterSpacing:2, textTransform:"uppercase", marginBottom:4 }}>{top.area}</div>
              <div style={{ fontSize:12, color:"#a8b4c0", lineHeight:1.5 }}>{top.descripcion?.slice(0,80)}{top.descripcion?.length>80?"…":""}</div>
              {top.telefono && <div style={{ fontSize:10, color:"#566070", marginTop:6, display:"flex", alignItems:"center", gap:4 }}><Phone size={9}/> {top.telefono}</div>}
            </div>
          )}
          <button onClick={onVerTodos} style={{ width:"100%", padding:"8px 12px", background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.25)", color:"#ef4444", borderRadius:8, cursor:"pointer", fontSize:11, fontWeight:700 }}>
            Ver todos los tickets ({tickets.length})
          </button>
        </>
      ) : (
        <div style={{ fontSize:11, color:"#3a4050", display:"flex", alignItems:"center", gap:6 }}>
          <span style={{ width:7, height:7, borderRadius:"50%", background:C.green, boxShadow:`0 0 6px ${C.green}` }} />
          Sin tickets activos
        </div>
      )}
      <div style={{ paddingTop:10, marginTop:10, borderTop:"1px solid rgba(255,255,255,0.07)" }}>
        <div style={{ fontSize:9, color:"#3a4050", fontFamily:"monospace" }}>{barco.latitud?.toFixed(5)}, {barco.longitud?.toFixed(5)}</div>
      </div>
    </div>
  );
}

// ── PANEL DE TICKETS (side drawer) ───────────────────────────────────
// Extrae el path de storage desde una URL pública o path directo
function TicketDrawer({ barco, tickets, onClose, onUpdateStatus }) {
  const [updating,      setUpdating]      = useState(null);
  const [filtroEst,     setFiltroEst]     = useState("activos");
  const [seguimientoId, setSeguimientoId] = useState(null); // ticket id en edición
  const [seguimientoTx, setSeguimientoTx] = useState("");   // texto del seguimiento
  const [savingSeg,     setSavingSeg]     = useState(false);

  // Bucket público → URL directa, sin signed URLs
  const resolveUrl = (url) => url;

  const abrirSeguimiento = (t) => {
    setSeguimientoId(t.id);
    setSeguimientoTx(t.seguimiento ?? "");
  };

  const guardarSeguimiento = async () => {
    if (!seguimientoId) return;
    setSavingSeg(true);
    await supabase.from("tickets").update({ seguimiento: seguimientoTx.trim() || null }).eq("id", seguimientoId);
    onUpdateStatus(seguimientoId, null, seguimientoTx.trim() || null);
    setSeguimientoId(null);
    setSeguimientoTx("");
    setSavingSeg(false);
  };
  const ESTADO = {
    pendiente:   { color:"#ef4444", label:"Pendiente"  },
    en_proceso:  { color:"#f59e0b", label:"En Proceso" },
    solucionado: { color:"#10b981", label:"Solucionado"},
  };
  const cambiarEstado = async (ticketId, nuevoEstado) => {
    setUpdating(ticketId);
    await supabase.from("tickets").update({ estado:nuevoEstado }).eq("id",ticketId);
    onUpdateStatus(ticketId, nuevoEstado);
    setUpdating(null);
  };
  const ticketsFiltrados = tickets.filter(t => {
    if (filtroEst === "activos")     return t.estado === "pendiente" || t.estado === "en_proceso";
    if (filtroEst === "solucionado") return t.estado === "solucionado";
    return true; // "todos"
  });
  const cntActivos = tickets.filter(t=>t.estado==="pendiente"||t.estado==="en_proceso").length;
  const cntSol     = tickets.filter(t=>t.estado==="solucionado").length;
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(3,5,12,0.88)", backdropFilter:"blur(20px)", display:"flex", alignItems:"flex-start", justifyContent:"flex-end", zIndex:9999, padding:16 }}
      onClick={e=>e.target===e.currentTarget && onClose()}>
      <div style={{ background:"rgba(6,10,20,0.98)", border:`1px solid ${C.b1}`, borderRadius:16, width:"min(480px,95vw)", maxHeight:"90vh", overflowY:"auto", boxShadow:"0 24px 60px rgba(0,0,0,0.8)" }}>
        <div style={{ padding:"20px 24px", borderBottom:`1px solid ${C.b0}`, position:"sticky", top:0, background:"rgba(6,10,20,0.98)" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
            <div>
              <div style={{ fontSize:16, color:C.t0, fontWeight:700 }}>{barco.nombre_barco}</div>
              <div style={{ display:"flex", gap:8, alignItems:"center", marginTop:4 }}>
                {barco.obras && (
                  <span style={{ fontFamily:C.mono, fontSize:10, padding:"1px 7px", borderRadius:5, background:"rgba(59,130,246,0.1)", border:"1px solid rgba(59,130,246,0.2)", color:"#93c5fd" }}>
                    Obra {barco.obras.codigo}
                  </span>
                )}
                <span style={{ fontSize:11, color:C.t1 }}>{barco.propietario}</span>
              </div>
            </div>
            <button onClick={onClose} style={{ background:"transparent", border:"none", color:C.t1, cursor:"pointer", fontSize:22 }}>×</button>
          </div>
          {/* Filtros de estado */}
          <div style={{ display:"flex", gap:6 }}>
            {[
              { key:"activos",     label:`Activos (${cntActivos})`,      color:"#f59e0b" },
              { key:"solucionado", label:`Solucionados (${cntSol})`,     color:"#10b981" },
              { key:"todos",       label:`Todos (${tickets.length})`,    color:"#60a5fa" },
            ].map(f=>(
              <button key={f.key} onClick={()=>setFiltroEst(f.key)}
                style={{ padding:"4px 10px", borderRadius:7, fontSize:10, cursor:"pointer", fontWeight: filtroEst===f.key?700:400,
                  background: filtroEst===f.key?`${f.color}18`:"transparent",
                  border: `1px solid ${filtroEst===f.key?f.color+"55":C.b0}`,
                  color: filtroEst===f.key?f.color:C.t2, transition:"all 0.15s" }}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ padding:"16px 24px", display:"flex", flexDirection:"column", gap:12 }}>
          {ticketsFiltrados.length === 0 && (
            <div style={{ fontSize:12, color:C.t2, textAlign:"center", padding:"24px 0", fontStyle:"italic" }}>
              Sin tickets en esta categoría
            </div>
          )}
          {ticketsFiltrados.map(t => {
            const est = ESTADO[t.estado] || ESTADO.pendiente;
            return (
              <div key={t.id} style={{ padding:16, borderRadius:12, border:`1px solid ${C.b0}`, background:"rgba(255,255,255,0.02)", borderLeft:`3px solid ${est.color}` }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
                  <div>
                    <span style={{ padding:"2px 10px", borderRadius:99, background:`${est.color}22`, border:`1px solid ${est.color}44`, color:est.color, fontSize:10, fontWeight:700 }}>
                      {est.label}
                    </span>
                    <div style={{ color:C.t0, fontWeight:600, fontSize:13, marginTop:8 }}>{t.area}</div>
                  </div>
                  <span style={{ color:C.t2, fontSize:10, fontFamily:C.mono }}>#{t.id}</span>
                </div>
                <p style={{ color:"#888", fontSize:12, margin:"0 0 12px", lineHeight:1.6 }}>{t.descripcion}</p>
                {t.ubicacion_barco && <div style={{ color:C.t2, fontSize:11, marginBottom:6 }}>{t.ubicacion_barco}</div>}
                {t.telefono        && <div style={{ color:C.t2, fontSize:11, marginBottom:8, fontFamily:C.mono }}>{t.telefono}</div>}
                {t.adjuntos?.length > 0 && (
                  <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:10 }}>
                    {t.adjuntos.map((url,i) => {
                      const isVideo = /\.(mp4|mov|webm|avi|mkv)$/i.test(url.split("?")[0]);
                      const isImage = /\.(jpg|jpeg|png|gif|webp|heic)$/i.test(url.split("?")[0]);
                      if (isVideo) return (
                        <video key={i} controls style={{ width:"100%", borderRadius:8, border:`1px solid ${C.b0}`, background:"#000", maxHeight:300 }}>
                          <source src={url} />
                        </video>
                      );
                      if (isImage) return (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                          <img src={url} alt={`adj ${i+1}`}
                            style={{ width:"100%", borderRadius:8, border:`1px solid ${C.b0}`, maxHeight:300, objectFit:"cover", display:"block", cursor:"zoom-in" }}
                            onError={e=>{ e.target.style.display="none"; e.target.nextSibling.style.display="flex"; }}
                          />
                          <a href={url} target="_blank" rel="noopener noreferrer"
                            style={{ display:"none", alignItems:"center", gap:8, padding:"8px 12px", borderRadius:8, border:`1px solid ${C.b0}`, fontSize:11, color:C.t1, textDecoration:"none", background:"rgba(255,255,255,0.03)" }}>
                            <span>📎</span><span>Adjunto {i+1}</span><span style={{ marginLeft:"auto", fontSize:10, color:C.t2 }}>↗ abrir</span>
                          </a>
                        </a>
                      );
                      return (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                          style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 12px", borderRadius:8, border:`1px solid ${C.b0}`, fontSize:11, color:C.t1, textDecoration:"none", background:"rgba(255,255,255,0.03)" }}>
                          <span style={{ fontSize:16 }}>📎</span>
                          <span>Adjunto {i+1}</span>
                          <span style={{ marginLeft:"auto", fontSize:10, color:C.t2 }}>↗ abrir</span>
                        </a>
                      );
                    })}
                  </div>
                )}
                {/* Seguimiento existente */}
                {seguimientoId !== t.id && t.seguimiento && (
                  <div style={{ padding:"10px 12px", borderRadius:8, background:"rgba(59,130,246,0.07)", border:"1px solid rgba(59,130,246,0.2)", marginBottom:10 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
                      <span style={{ fontSize:9, color:"#4a7aaa", letterSpacing:2, textTransform:"uppercase" }}>Seguimiento</span>
                      <button onClick={()=>abrirSeguimiento(t)} style={{ background:"transparent", border:"none", color:"#4a7aaa", cursor:"pointer", fontSize:10 }}>✎ editar</button>
                    </div>
                    <p style={{ fontSize:12, color:"#7aabdc", lineHeight:1.6, margin:0 }}>{t.seguimiento}</p>
                  </div>
                )}

                {/* Editor de seguimiento */}
                {seguimientoId === t.id ? (
                  <div style={{ marginBottom:10 }}>
                    <textarea
                      autoFocus
                      value={seguimientoTx}
                      onChange={e=>setSeguimientoTx(e.target.value)}
                      placeholder="Escribí el seguimiento para el cliente..."
                      style={{ width:"100%", boxSizing:"border-box", background:"rgba(59,130,246,0.06)", border:"1px solid rgba(59,130,246,0.3)", color:C.t0, padding:"10px 12px", borderRadius:8, fontSize:12, lineHeight:1.6, minHeight:80, resize:"vertical", outline:"none", fontFamily:C.sans }}
                    />
                    <div style={{ display:"flex", gap:6, marginTop:6 }}>
                      <button onClick={guardarSeguimiento} disabled={savingSeg}
                        style={{ flex:1, padding:"7px", borderRadius:7, background:"rgba(59,130,246,0.2)", border:"1px solid rgba(59,130,246,0.4)", color:"#93c5fd", fontSize:11, fontWeight:700, cursor:"pointer" }}>
                        {savingSeg ? "Guardando…" : "✓ Guardar seguimiento"}
                      </button>
                      <button onClick={()=>setSeguimientoId(null)}
                        style={{ padding:"7px 12px", borderRadius:7, background:"transparent", border:`1px solid ${C.b0}`, color:C.t2, fontSize:11, cursor:"pointer" }}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  !t.seguimiento && (
                    <button onClick={()=>abrirSeguimiento(t)}
                      style={{ width:"100%", padding:"6px", marginBottom:10, borderRadius:7, background:"transparent", border:`1px dashed ${C.b0}`, color:C.t2, fontSize:10, cursor:"pointer", textAlign:"left" }}>
                      + Agregar seguimiento
                    </button>
                  )
                )}

                {/* Cambiar estado */}
                <div style={{ display:"flex", gap:6 }}>
                  {["pendiente","en_proceso","solucionado"].map(s=>{
                    const col = ESTADO[s].color;
                    return (
                      <button key={s} disabled={t.estado===s || updating===t.id}
                        onClick={()=>cambiarEstado(t.id, s)}
                        style={{ flex:1, padding:"7px 8px", borderRadius:7, border:`1px solid ${col}44`, background:t.estado===s?`${col}22`:"transparent", color:t.estado===s?col:C.t2, fontSize:10, cursor:t.estado===s?"default":"pointer", fontWeight:t.estado===s?700:400, transition:"all 0.15s" }}>
                        {s==="pendiente"?"Pendiente":s==="en_proceso"?"En Proceso":"Solucionado"}
                      </button>
                    );
                  })}
                </div>
                <div style={{ fontSize:10, color:C.t2, marginTop:8, textAlign:"right", fontFamily:C.mono }}>
                  {new Date(t.fecha_creacion).toLocaleString("es-AR")}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── SCREEN PRINCIPAL ──────────────────────────────────────────────────
export default function PostVentaScreen({ profile, signOut }) {
  const [flota,        setFlota]        = useState([]);
  const [ticketMap,    setTicketMap]    = useState({});
  const [obras,        setObras]        = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [filtro,       setFiltro]       = useState("");
  const [soloActivos,  setSoloActivos]  = useState(false);
  // false = mostrar todos | true = solo los sin GPS
  const [soloSinGps,   setSoloSinGps]   = useState(false);
  const [showModal,    setShowModal]    = useState(false);
  const [isSelecting,  setIsSelecting]  = useState(false);
  // editBarco: { barco, autoFocusGps? }
  const [editBarco,    setEditBarco]    = useState(null);
  const [drawerBarco,  setDrawerBarco]  = useState(null);
  const [showLocPrev,  setShowLocPrev]  = useState(false);
  const [mapaRef,      setMapaRef]      = useState(null);
  const mapCenter = [-34.4193, -58.5512];
  const [form, setForm] = useState({ nombre_barco:"", propietario:"", ubicacion_general:"", detalle_ubicacion:"", latitud:"", longitud:"", link_maps:"", obra_id:"" });

  // ── Carga ─────────────────────────────────────────────────────────
  const cargarFlota = async () => {
    setLoading(true);
    const { data: flotaData, error: flotaErr } = await supabase
      .from("postventa_flota")
      .select("*")
      .order("nombre_barco");
    if (flotaErr) {
      console.error("postventa_flota error:", flotaErr.message);
      setFlota([]); setLoading(false); return;
    }
    const flotaBase = flotaData ?? [];

    // Enriquecer con obra: primero por obra_id directo, luego por cliente_id → clientes.obra_id
    let flotaFinal = flotaBase;
    try {
      const { data: flotaJoin } = await supabase
        .from("postventa_flota")
        .select("id, obra_id, obras(id, codigo), cliente_id, clientes(obra_id, obras(id, codigo))")
        .or("obra_id.not.is.null,cliente_id.not.is.null");
      if (flotaJoin) {
        const enrichMap = {};
        flotaJoin.forEach(b => {
          // Obra directa tiene prioridad; si no, la del cliente vinculado
          enrichMap[b.id] = b.obras ?? b.clientes?.obras ?? null;
        });
        flotaFinal = flotaBase.map(b => ({ ...b, obras: enrichMap[b.id] ?? null }));
      }
    } catch(e) { console.warn("join obras:", e.message); }
    setFlota(flotaFinal);

    // Todos los tickets (activos + solucionados)
    const { data: tData } = await supabase
      .from("tickets")
      .select("*")
      .order("fecha_creacion", { ascending: false });

    const map = {};
    const addMap = (key, ticket) => {
      if (!key) return;
      if (!map[key]) map[key] = [];
      if (!map[key].find(x => x.id === ticket.id)) map[key].push(ticket);
    };
    (tData ?? []).forEach(t => {
      // 1. Por cliente_id del ticket → matchea con postventa_flota.cliente_id
      if (t.cliente_id) addMap(`cli_${t.cliente_id}`, t);
      // 2. Por nombre del barco (fallback para registros sin cliente_id vinculado)
      const barcoName = t.nombre_barco_ticket?.trim().toLowerCase();
      if (barcoName) addMap(`nombre_${barcoName}`, t);
    });
    setTicketMap(map);

    // Obras — tabla real: id, codigo, activo (sin numero ni linea_proceso_id)
    try {
      const { data: rObras } = await supabase
        .from("obras")
        .select("id, codigo")
        .eq("activo", true)
        .order("codigo");
      setObras((rObras ?? []).map(o => ({ id: o.id, codigo: o.codigo })));
    } catch(e) {
      console.error("Error cargando obras:", e);
      setObras([]);
    }

    setLoading(false);
  };
  useEffect(()=>{ cargarFlota(); }, []);

  const getTickets = (barco) => {
    const results = new Map();
    const add = (arr) => (arr ?? []).forEach(t => results.set(t.id, t));

    // 1. Por cliente_id del barco (postventa_flota.cliente_id → ticket.cliente_id)
    if (barco.cliente_id) add(ticketMap[`cli_${barco.cliente_id}`]);
    // 2. Por nombre del barco (fallback — cuando cliente_id es null en postventa_flota)
    const barcoName = barco.nombre_barco?.trim().toLowerCase();
    if (barcoName) add(ticketMap[`nombre_${barcoName}`]);

    return [...results.values()];
  };

  function handleMapsInput(e) {
    const val=e.target.value;
    let lat=form.latitud, lng=form.longitud;
    const matchAt   = val.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    const matchBang = val.match(/3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
    const matchRaw  = val.match(/(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)/);
    if      (matchAt)                           { lat=matchAt[1];   lng=matchAt[2];   }
    else if (matchBang)                         { lat=matchBang[1]; lng=matchBang[2]; }
    else if (matchRaw && !val.includes("http")) { lat=matchRaw[1];  lng=matchRaw[2];  }
    setForm(f=>({...f,link_maps:val,latitud:lat,longitud:lng}));
    setShowLocPrev(true);
    if (lat && lng && mapaRef) mapaRef.flyTo([parseFloat(lat),parseFloat(lng)],16,{duration:1.5});
  }

  function handleLocationSelected(lat, lng) {
    setIsSelecting(false);
    setForm(prev=>({...prev,latitud:lat.toFixed(6),longitud:lng.toFixed(6),link_maps:""}));
    setShowLocPrev(true);
    setShowModal(true);
    if (mapaRef) mapaRef.flyTo([lat,lng],16,{duration:1.2});
  }

  async function registrarBarco(e) {
    e.preventDefault();
    if (!form.latitud || !form.longitud) { alert("Falta la ubicación."); return; }
    const { error } = await supabase.from("postventa_flota").insert([{
      nombre_barco:      form.nombre_barco,
      propietario:       form.propietario,
      ubicacion_general: form.ubicacion_general,
      detalle_ubicacion: form.detalle_ubicacion,
      latitud:           parseFloat(String(form.latitud).replace(",",".")),
      longitud:          parseFloat(String(form.longitud).replace(",",".")),
      obra_id: form.obra_id && obras.some(o => o.id === form.obra_id)
  ? form.obra_id
  : null,
    }]);
    if (error) { alert("Error al registrar: "+error.message); return; }
    setShowModal(false); setShowLocPrev(false);
    setForm({ nombre_barco:"", propietario:"", ubicacion_general:"", detalle_ubicacion:"", latitud:"", longitud:"", link_maps:"", obra_id:"" });
    cargarFlota();
  }

  async function eliminarBarco(e, id, nombre) {
    e.stopPropagation();
    if (!window.confirm(`¿Eliminás "${nombre}"?`)) return;
    const { error } = await supabase.from("postventa_flota").delete().eq("id",id);
    if (!error) setFlota(prev=>prev.filter(b=>b.id!==id));
  }

  function centrarMapa(lat, lng) {
    if (mapaRef && lat && lng) mapaRef.flyTo([lat,lng],16,{duration:1.2,easeLinearity:0.25});
  }

  function compartirWhatsApp(e, b) {
    e.stopPropagation();
    const tickets = getTickets(b);
    const ticketInfo = tickets.length > 0
      ? `\n\n*Tickets activos: ${tickets.length}*\n${tickets.map(t=>`• ${t.area}: ${t.descripcion?.slice(0,50)}…`).join("\n")}`
      : "";
    const obraInfo = b.obras ? `\n*Obra:* ${b.obras.codigo}` : "";
    const mapUrl = b.latitud ? `https://www.google.com/maps?q=${b.latitud},${b.longitud}` : "(sin ubicación)";
    const msj = `*Embarcación:* ${b.nombre_barco}\n*Propietario:* ${b.propietario||'-'}${obraInfo}\n*Lugar:* ${b.ubicacion_general||'-'}${ticketInfo}\n\n*Ubicación:*\n${mapUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msj)}`,"_blank");
  }

  const updateTicketStatus = (ticketId, nuevoEstado, nuevoSeguimiento) => {
    setTicketMap(prev => {
      const next = {...prev};
      Object.keys(next).forEach(k => {
        next[k] = next[k].map(t => {
          if (t.id !== ticketId) return t;
          const upd = {...t};
          if (nuevoEstado    !== null && nuevoEstado    !== undefined) upd.estado      = nuevoEstado;
          if (nuevoSeguimiento !== undefined) upd.seguimiento = nuevoSeguimiento;
          return upd;
        });
      });
      return next;
    });
  };

  const totalTicketsPendientes = Object.values(ticketMap).reduce((s,ts)=>s+ts.filter(t=>t.estado==="pendiente").length, 0);
  const sinGpsCount = flota.filter(b => !b.latitud || !b.longitud).length;

  const barcosFiltrados = flota.filter(b => {
    const q = filtro.toLowerCase();
    const matchText    = !q || b.nombre_barco?.toLowerCase().includes(q) || b.propietario?.toLowerCase().includes(q) || b.ubicacion_general?.toLowerCase().includes(q) || b.obras?.codigo?.toLowerCase().includes(q);
    const matchActivos = !soloActivos || getTickets(b).length > 0;
    const matchSinGps  = !soloSinGps  || (!b.latitud || !b.longitud);
    return matchText && matchActivos && matchSinGps;
  });

  // ── ESTILOS ───────────────────────────────────────────────────────
  const S = {
    page:         { position:"fixed", inset:0, background:C.bg, color:C.t0, fontFamily:C.sans, overflow:"hidden" },
    mapLayer:     { position:"absolute", inset:0, zIndex:0 },
    uiLayer:      { position:"absolute", inset:0, zIndex:10, display:"flex", pointerEvents:"none" },
    sidebarWrap:  { width:"280px", height:"100%", pointerEvents:"auto", background:"#09090b" },
    mainUI:       { flex:1, position:"relative", pointerEvents:"none" },
    topbar:       { position:"absolute", top:0, left:0, right:0, height:64, background:"linear-gradient(180deg,rgba(3,5,12,0.92) 0%,rgba(3,5,12,0) 100%)", display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 28px", pointerEvents:"auto" },
    glassPanel:   { position:"absolute", top:76, left:20, bottom:20, width:368, background:"rgba(3,5,12,0.82)", backdropFilter:"blur(48px) saturate(140%)", WebkitBackdropFilter:"blur(48px) saturate(140%)", border:`1px solid ${C.b1}`, borderRadius:16, display:"flex", flexDirection:"column", pointerEvents:"auto", boxShadow:"0 24px 60px rgba(0,0,0,0.7),inset 0 1px 0 rgba(255,255,255,0.06)" },
    card:         { padding:"12px 20px", borderBottom:`1px solid rgba(255,255,255,0.05)`, cursor:"pointer", transition:"background 0.15s", background:"transparent" },
    searchInput:  { width:"100%", background:"rgba(255,255,255,0.05)", border:`1px solid ${C.b0}`, color:C.t0, padding:"10px 14px 10px 38px", borderRadius:10, fontSize:13, outline:"none", transition:"border-color 0.2s", boxSizing:"border-box" },
    btnPrimary:   { background:"rgba(255,255,255,0.92)", color:"#080c14", border:"1px solid rgba(255,255,255,0.25)", padding:"9px 20px", borderRadius:9, fontSize:13, fontWeight:700, cursor:"pointer" },
    input:        { width:"100%", boxSizing:"border-box", background:"rgba(255,255,255,0.05)", border:`1px solid ${C.b0}`, color:C.t0, padding:"10px 14px", borderRadius:9, fontSize:13, outline:"none", marginBottom:14, transition:"border-color 0.15s" },
    label:        { fontSize:9, letterSpacing:2, color:C.t1, display:"block", marginBottom:6, textTransform:"uppercase", fontWeight:600 },
    modalOverlay: { position:"fixed", inset:0, background:"rgba(3,5,12,0.88)", backdropFilter:"blur(24px)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:9999, pointerEvents:"auto" },
    modalBox:     { background:"rgba(6,10,20,0.97)", backdropFilter:"blur(60px)", border:`1px solid ${C.b1}`, padding:"32px 28px", borderRadius:18, width:"100%", maxWidth:540, maxHeight:"92vh", overflowY:"auto" },
  };

  const hasNewCoords = form.latitud && form.longitud;

  return (
    <div style={S.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');
        * { box-sizing:border-box; }
        @keyframes pin-pulse { 0%{transform:scale(0.5);opacity:0.8} 100%{transform:scale(1.6);opacity:0} }
        .boat-card:hover { background:rgba(255,255,255,0.04) !important }
        .leaflet-popup-content-wrapper { background:rgba(6,10,20,0.96) !important;backdrop-filter:blur(20px);color:#dde2ea;border:1px solid rgba(255,255,255,0.14) !important;border-radius:14px !important;box-shadow:0 16px 48px rgba(0,0,0,0.9) !important;padding:0 !important }
        .leaflet-popup-content { margin:0 !important }
        .leaflet-popup-tip-container { display:none }
        .leaflet-container a.leaflet-popup-close-button { color:rgba(255,255,255,0.3) !important;top:14px !important;right:14px !important;font-size:18px !important;z-index:10 }
        ::-webkit-scrollbar { width:3px } ::-webkit-scrollbar-track { background:transparent } ::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.1);border-radius:99px }
        ${isSelecting ? ".leaflet-container { cursor:crosshair !important }" : ""}
        select option { background:#0f0f12;color:#a1a1aa }
        input:focus,select:focus { border-color:rgba(59,130,246,0.35) !important }
      `}</style>

      {/* MAPA */}
      <div style={S.mapLayer}>
        <MapContainer center={mapCenter} zoom={13} style={{ width:"100%", height:"100%" }} ref={setMapaRef} zoomControl={false}>
          <MapResizer />
          <MapEventsHandler isSelecting={isSelecting} onLocationSelected={handleLocationSelected} />
          <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" attribution="© OpenStreetMap" />
          {/* Solo pinear los barcos que tienen coords */}
          {barcosFiltrados.filter(b => b.latitud && b.longitud).map(barco => (
            <Marker key={barco.id} position={[barco.latitud, barco.longitud]} icon={getIcon(getTickets(barco))}>
              <Popup>
                <TicketPopupContent
                  barco={barco}
                  tickets={getTickets(barco)}
                  onVerTodos={()=>setDrawerBarco({ barco, tickets:getTickets(barco) })}
                />
              </Popup>
            </Marker>
          ))}
          {hasNewCoords && showModal && (
            <Marker position={[parseFloat(form.latitud), parseFloat(form.longitud)]} icon={ICON_NEW} />
          )}
        </MapContainer>
      </div>

      {/* UI LAYER */}
      <div style={S.uiLayer}>
        <div style={S.sidebarWrap}><Sidebar profile={profile} signOut={signOut} /></div>
        <div style={S.mainUI}>
          {isSelecting && (
            <div style={{ position:"absolute", top:76, left:"50%", transform:"translateX(-50%)", background:C.green, color:"#000", padding:"12px 26px", borderRadius:99, fontWeight:700, fontSize:13, pointerEvents:"auto", boxShadow:`0 8px 32px rgba(61,206,106,0.4)`, display:"flex", alignItems:"center", gap:10, zIndex:9999, cursor:"pointer" }}
              onClick={()=>{ setIsSelecting(false); setShowModal(true); }}>
              <div style={{ width:8, height:8, borderRadius:"50%", background:"#000", opacity:0.5 }} />
              Hacé clic en la ubicación exacta del barco
              <span style={{ opacity:0.6, fontSize:11 }}>· toque para cancelar</span>
            </div>
          )}

          {!isSelecting && (
            <div style={S.topbar}>
              <div style={{ display:"flex", alignItems:"baseline", gap:10 }}>
                <span style={{ fontWeight:700, fontSize:16, letterSpacing:0.5, color:C.t0 }}>Post Venta</span>
                <span style={{ fontSize:11, color:C.t1, letterSpacing:2, textTransform:"uppercase" }}>· Flota</span>
                <div style={{ marginLeft:8, padding:"2px 10px", borderRadius:99, background:"rgba(61,206,106,0.1)", border:"1px solid rgba(61,206,106,0.25)", fontSize:11, fontFamily:C.mono, color:C.green, fontWeight:600 }}>
                  {barcosFiltrados.length}
                </div>
                {totalTicketsPendientes > 0 && (
                  <div style={{ padding:"2px 10px", borderRadius:99, background:"rgba(239,68,68,0.15)", border:"1px solid rgba(239,68,68,0.35)", fontSize:11, fontFamily:C.mono, color:"#ef4444", fontWeight:700 }}>
                    <Circle size={7} color="#ef4444" fill="#ef4444" style={{marginRight:4}}/> {totalTicketsPendientes} pendiente{totalTicketsPendientes>1?"s":""}
                  </div>
                )}
                {/* Badge de barcos sin GPS */}
                {sinGpsCount > 0 && (
                  <div
                    onClick={() => setSoloSinGps(s => !s)}
                    style={{ padding:"2px 10px", borderRadius:99, background: soloSinGps ? "rgba(245,158,11,0.2)" : "rgba(245,158,11,0.08)", border: soloSinGps ? "1px solid rgba(245,158,11,0.6)" : "1px solid rgba(245,158,11,0.3)", fontSize:11, fontFamily:C.mono, color:"#f59e0b", fontWeight:600, cursor:"pointer", pointerEvents:"auto" }}
                    title="Barcos sin ubicación GPS — clic para filtrar"
                  >
                    <MapPin size={9} style={{marginRight:3}}/> {sinGpsCount} sin GPS
                  </div>
                )}
              </div>
              <button style={S.btnPrimary} onClick={()=>{ setForm({nombre_barco:"",propietario:"",ubicacion_general:"",detalle_ubicacion:"",latitud:"",longitud:"",link_maps:"",obra_id:""}); setShowLocPrev(false); setShowModal(true); }}>
                + Nueva embarcación
              </button>
            </div>
          )}

          {!isSelecting && (
            <div style={S.glassPanel}>
              {/* Barra de búsqueda y filtros */}
              <div style={{ padding:"14px 20px 12px", borderBottom:`1px solid ${C.b0}`, flexShrink:0 }}>
                <div style={{ position:"relative", marginBottom:10 }}>
                  <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", fontSize:14, color:C.t1, pointerEvents:"none" }}>⌕</span>
                  <input type="text" placeholder="Buscar barco, propietario, obra…" style={S.searchInput} value={filtro} onChange={e=>setFiltro(e.target.value)} />
                </div>
                <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                  <button onClick={()=>setSoloActivos(a=>!a)} style={{ display:"flex", alignItems:"center", gap:7, padding:"5px 12px", borderRadius:8, border:soloActivos?"1px solid rgba(239,68,68,0.5)":`1px solid ${C.b0}`, background:soloActivos?"rgba(239,68,68,0.12)":"transparent", color:soloActivos?"#ef4444":C.t1, fontSize:11, fontWeight:600, cursor:"pointer", transition:"all 0.15s" }}>
                    <span style={{ width:7, height:7, borderRadius:"50%", background:soloActivos?"#ef4444":C.t2 }} />
                    {soloActivos ? "Con tickets" : "Todos"}
                  </button>
                  {sinGpsCount > 0 && (
                    <button onClick={()=>setSoloSinGps(s=>!s)} style={{ display:"flex", alignItems:"center", gap:7, padding:"5px 12px", borderRadius:8, border:soloSinGps?"1px solid rgba(245,158,11,0.5)":`1px solid ${C.b0}`, background:soloSinGps?"rgba(245,158,11,0.12)":"transparent", color:soloSinGps?"#f59e0b":C.t1, fontSize:11, fontWeight:600, cursor:"pointer", transition:"all 0.15s" }}>
                      <MapPin size={9} style={{marginRight:3}}/> {soloSinGps ? `Sin GPS (${sinGpsCount})` : "Todos"}
                    </button>
                  )}
                </div>
              </div>

              {/* Lista de barcos */}
              <div style={{ flex:1, overflowY:"auto" }}>
                {loading ? (
                  <div style={{ padding:"50px 20px", color:C.t2, fontSize:11, textAlign:"center", letterSpacing:2, textTransform:"uppercase", fontFamily:C.mono }}>Sincronizando…</div>
                ) : barcosFiltrados.length === 0 ? (
                  <div style={{ padding:"50px 20px", textAlign:"center" }}>
                    <div style={{ fontSize:11, color:C.t2, letterSpacing:2, textTransform:"uppercase", fontFamily:C.mono }}>Sin registros</div>
                    {(filtro||soloActivos||soloSinGps) && <button onClick={()=>{ setFiltro(""); setSoloActivos(false); setSoloSinGps(false); }} style={{ marginTop:10, background:"transparent", border:`1px solid ${C.b0}`, color:C.t1, padding:"5px 14px", borderRadius:8, cursor:"pointer", fontSize:11 }}>Limpiar filtros</button>}
                  </div>
                ) : barcosFiltrados.map(b => {
                  const bTickets  = getTickets(b);
                  const pendCount = bTickets.filter(t=>t.estado==="pendiente").length;
                  const procCount = bTickets.filter(t=>t.estado==="en_proceso").length;
                  const solCount  = bTickets.filter(t=>t.estado==="solucionado").length;
                  const sinGps    = !b.latitud || !b.longitud;
                  return (
                    <div key={b.id} style={{ ...S.card, borderLeft: sinGps ? "2px solid rgba(245,158,11,0.4)" : "2px solid transparent" }} className="boat-card" onClick={()=>!sinGps && centrarMapa(b.latitud,b.longitud)}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:4 }}>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                            <span style={{ fontSize:13, color:C.t0, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                              {b.nombre_barco}
                            </span>
                            {sinGps && (
                              <span style={{ fontSize:9, padding:"1px 6px", borderRadius:4, background:"rgba(245,158,11,0.15)", border:"1px solid rgba(245,158,11,0.3)", color:"#f59e0b", flexShrink:0 }}>sin GPS</span>
                            )}
                          </div>
                          <div style={{ fontSize:11, color:C.t2, marginTop:1 }}>{b.propietario || "—"}</div>
                        </div>
                        <div style={{ display:"flex", gap:5, flexShrink:0, marginLeft:8 }}>
                          {pendCount > 0 && <span style={{ padding:"2px 8px", borderRadius:99, background:"rgba(239,68,68,0.15)", border:"1px solid rgba(239,68,68,0.35)", color:"#ef4444", fontSize:9, fontWeight:700 }}>{pendCount}</span>}
                          {procCount > 0 && <span style={{ padding:"2px 8px", borderRadius:99, background:"rgba(245,158,11,0.15)", border:"1px solid rgba(245,158,11,0.35)", color:"#f59e0b", fontSize:9, fontWeight:700 }}>{procCount}</span>}
                          {solCount  > 0 && <span style={{ padding:"2px 8px", borderRadius:99, background:"rgba(16,185,129,0.15)", border:"1px solid rgba(16,185,129,0.35)", color:"#10b981", fontSize:9, fontWeight:700 }}>✓{solCount}</span>}
                          <button onClick={e=>eliminarBarco(e,b.id,b.nombre_barco)} style={{ background:"transparent", border:"none", color:C.t2, cursor:"pointer", fontSize:16, padding:"2px 4px" }} title="Eliminar">×</button>
                        </div>
                      </div>

                      {/* Obra vinculada — obra directa, o heredada del cliente */}
                      {(b.obras || b.obra_id || b.cliente_id) ? (
                        <div style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"1px 7px", borderRadius:5, background:"rgba(59,130,246,0.08)", border:"1px solid rgba(59,130,246,0.2)", marginBottom:6 }}>
                          <span style={{ fontFamily:C.mono, fontSize:10, color:"#93c5fd", fontWeight:700 }}>
                            {b.obras ? `Obra ${b.obras.codigo}` : "Obra vinculada"}
                          </span>
                        </div>
                      ) : (
                        <div style={{ display:"inline-flex", padding:"1px 7px", borderRadius:5, background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.06)", marginBottom:6 }}>
                          <span style={{ fontSize:9, color:"#3a3a52" }}>Sin obra vinculada</span>
                        </div>
                      )}

                      <div style={{ marginBottom:8 }}>
                        {b.ubicacion_general
                          ? <span style={{ fontSize:12, color:"#8a9aaa" }}>{b.ubicacion_general}{b.detalle_ubicacion && <span style={{ fontSize:11, color:C.t1 }}> · {b.detalle_ubicacion}</span>}</span>
                          : <span style={{ fontSize:11, color:"#3a3a4a", fontStyle:"italic" }}>Sin lugar registrado</span>
                        }
                      </div>

                      <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                        {/* Si tiene GPS, mostrar centrar. Si no, ocultar centrar */}
                        {!sinGps && (
                          <button style={{ background:"rgba(255,255,255,0.04)", border:`1px solid ${C.b0}`, color:C.t1, padding:"5px 12px", borderRadius:7, fontSize:11, fontWeight:600, cursor:"pointer" }}
                            onClick={e=>{ e.stopPropagation(); centrarMapa(b.latitud,b.longitud); }}><Crosshair size={11} style={{marginRight:4}}/> Centrar</button>
                        )}

                        {/* Editar siempre visible */}
                        <button
                          style={{ background:"rgba(59,130,246,0.08)", border:"1px solid rgba(59,130,246,0.25)", color:"#60a5fa", padding:"5px 12px", borderRadius:7, fontSize:11, fontWeight:600, cursor:"pointer" }}
                          onClick={e=>{ e.stopPropagation(); setEditBarco({ barco: b, autoFocusGps: false }); }}>
                          ✎ Editar
                        </button>
                        {/* GPS pendiente como botón separado */}
                        {sinGps && (
                          <button
                            style={{ background:"rgba(245,158,11,0.12)", border:"1px solid rgba(245,158,11,0.4)", color:"#f59e0b", padding:"5px 12px", borderRadius:7, fontSize:11, fontWeight:700, cursor:"pointer" }}
                            onClick={e=>{ e.stopPropagation(); setEditBarco({ barco: b, autoFocusGps: true }); }}>
                            📍 GPS
                          </button>
                        )}

                        {bTickets.length > 0 && (
                          <button style={{ background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.25)", color:"#ef4444", padding:"5px 12px", borderRadius:7, fontSize:11, fontWeight:600, cursor:"pointer" }}
                            onClick={e=>{ e.stopPropagation(); setDrawerBarco({barco:b,tickets:bTickets}); }}>
                            🎫 Tickets ({bTickets.length})
                          </button>
                        )}
                        <button style={{ background:"rgba(61,206,106,0.1)", border:"1px solid rgba(61,206,106,0.3)", color:C.green, padding:"5px 10px", borderRadius:7, fontSize:11, cursor:"pointer" }}
                          onClick={e=>compartirWhatsApp(e,b)} title="Compartir por WhatsApp"><ExternalLink size={11}/></button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Leyenda */}
              <div style={{ padding:"12px 20px", borderTop:`1px solid ${C.b0}`, display:"flex", gap:14, flexShrink:0, flexWrap:"wrap" }}>
                {[
                  {color:C.green,  label:"Sin tickets"},
                  {color:C.amber,  label:"En proceso"},
                  {color:C.red,    label:"Pendiente"},
                  {color:"#f59e0b",label:"Sin GPS",   border:true},
                ].map(l=>(
                  <div key={l.label} style={{ display:"flex", alignItems:"center", gap:5 }}>
                    {l.border
                      ? <span style={{ width:7, height:7, borderRadius:2, border:`1px solid ${l.color}`, background:"transparent" }} />
                      : <span style={{ width:7, height:7, borderRadius:"50%", background:l.color, boxShadow:`0 0 5px ${l.color}88` }} />
                    }
                    <span style={{ fontSize:10, color:C.t2 }}>{l.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal nueva embarcación */}
      {showModal && (
        <div style={S.modalOverlay} onClick={e=>e.target===e.currentTarget && setShowModal(false)}>
          <div style={S.modalBox}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:26 }}>
              <div><div style={{ fontSize:17, color:C.t0, fontWeight:700 }}>Nueva embarcación</div><div style={{ fontSize:11, color:C.t1, marginTop:4 }}>Completá los datos y la ubicación</div></div>
              <button onClick={()=>setShowModal(false)} style={{ background:"transparent", border:"none", color:C.t1, cursor:"pointer", fontSize:20 }}>×</button>
            </div>
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:9, letterSpacing:2, color:C.t1, textTransform:"uppercase", fontWeight:600, marginBottom:10 }}>Ubicación GPS</div>
              <div style={{ padding:"14px 16px", borderRadius:12, marginBottom:10, border:hasNewCoords&&form.link_maps?"1px solid rgba(61,206,106,0.3)":`1px solid ${C.b0}`, background:hasNewCoords&&form.link_maps?"rgba(61,206,106,0.05)":"rgba(255,255,255,0.02)" }}>
                <label style={{ ...S.label, marginBottom:8, color:C.blue }}>Opción A · Pegar link o coordenadas de Google Maps</label>
                <input style={{ ...S.input, marginBottom:0, borderColor:"rgba(74,144,226,0.3)", background:"rgba(74,144,226,0.04)", color:hasNewCoords?C.green:C.t0 }} placeholder="Ej: -34.4183, -58.5846  ó  link largo de Maps" value={form.link_maps} onChange={handleMapsInput} />
                {hasNewCoords && form.link_maps && showLocPrev && <LocationPreview lat={form.latitud} lng={form.longitud} />}
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:10, margin:"4px 0 8px" }}>
                <div style={{ flex:1, height:1, background:C.b0 }} /><span style={{ fontSize:9, color:C.t2, letterSpacing:2, textTransform:"uppercase" }}>o</span><div style={{ flex:1, height:1, background:C.b0 }} />
              </div>
              <button type="button" style={{ width:"100%", background:"rgba(255,255,255,0.04)", border:`1px solid ${C.b1}`, color:C.t0, padding:"12px 16px", borderRadius:10, fontSize:13, fontWeight:600, cursor:"pointer", marginBottom:14, textAlign:"left", display:"flex", alignItems:"center", gap:10 }}
                onClick={()=>{ setShowModal(false); setIsSelecting(true); }}>
                <div style={{ width:28, height:28, borderRadius:8, background:"rgba(255,255,255,0.06)", border:`1px solid ${C.b0}`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}><Crosshair size={14}/></div>
                <div><div style={{ fontSize:12, fontWeight:600, color:C.t0 }}>Opción B · Marcar en el mapa</div><div style={{ fontSize:11, color:C.t1, marginTop:2 }}>Hacé clic directo en el lugar exacto</div></div>
              </button>
            </div>
            <div style={{ borderTop:`1px solid ${C.b0}`, paddingTop:20 }}>
              <div style={{ fontSize:9, letterSpacing:2, color:C.t1, textTransform:"uppercase", fontWeight:600, marginBottom:14 }}>Datos de la embarcación</div>
              <form onSubmit={registrarBarco}>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                  <div><label style={S.label}>Nombre *</label><input required style={S.input} placeholder="K37 Margarita" value={form.nombre_barco} onChange={e=>setForm({...form,nombre_barco:e.target.value})} /></div>
                  <div><label style={S.label}>Propietario</label><input style={S.input} placeholder="Nombre completo" value={form.propietario} onChange={e=>setForm({...form,propietario:e.target.value})} /></div>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                  <div><label style={S.label}>Lugar *</label><input required style={S.input} placeholder="Marina del Norte" value={form.ubicacion_general} onChange={e=>setForm({...form,ubicacion_general:e.target.value})} /></div>
                  <div><label style={S.label}>Detalle</label><input style={S.input} placeholder="Lote 45" value={form.detalle_ubicacion} onChange={e=>setForm({...form,detalle_ubicacion:e.target.value})} /></div>
                </div>
                <ObraSelector
                  value={form.obra_id}
                  onChange={v=>setForm(f=>({...f,obra_id:v}))}
                  obras={obras}
                />
                <div style={{ display:"flex", gap:10, marginTop:4 }}>
                  <button type="submit" style={{ ...S.btnPrimary, flex:1, padding:"13px", fontSize:14 }}>Guardar</button>
                  <button type="button" onClick={()=>setShowModal(false)} style={{ background:"transparent", color:C.t1, padding:"13px 20px", borderRadius:9, border:`1px solid ${C.b0}`, cursor:"pointer", fontWeight:600, fontSize:13 }}>Cancelar</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {editBarco && (
        <EditModal
          barco={editBarco.barco}
          obras={obras}
          autoFocusGps={editBarco.autoFocusGps}
          onSave={()=>{ setEditBarco(null); cargarFlota(); }}
          onClose={()=>setEditBarco(null)}
        />
      )}
      {drawerBarco && (
        <TicketDrawer
          barco={drawerBarco.barco}
          tickets={getTickets(drawerBarco.barco)}
          onClose={()=>setDrawerBarco(null)}
          onUpdateStatus={updateTicketStatus}
        />
      )}
    </div>
  );
}
