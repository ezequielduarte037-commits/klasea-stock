import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import Sidebar from "../components/Sidebar";
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// ── ÍCONOS DEL MARCADOR ──────────────────────────────────────
const ModernIcon = L.divIcon({
  className: "custom-modern-icon",
  html: `<div class="map-pin-outer">
    <div class="map-pin-inner"></div>
    <div class="map-pin-ring"></div>
  </div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  popupAnchor: [0, -16],
});

const NewIcon = L.divIcon({
  className: "custom-modern-icon",
  html: `<div class="map-pin-outer new-pin">
    <div class="map-pin-inner new-pin-inner"></div>
    <div class="map-pin-ring new-pin-ring"></div>
  </div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  popupAnchor: [0, -16],
});

// ── TOKENS ───────────────────────────────────────────────────
const C = {
  bg:      "#09090b",
  s0:      "rgba(255,255,255,0.03)",
  s1:      "rgba(255,255,255,0.06)",
  b0:      "rgba(255,255,255,0.08)",
  b1:      "rgba(255,255,255,0.15)",
  b2:      "rgba(255,255,255,0.25)",
  t0:      "#f4f4f5",
  t1:      "#a1a1aa",
  t2:      "#71717a",
  mono:    "'JetBrains Mono', 'IBM Plex Mono', monospace",
  sans:    "'Outfit', system-ui, sans-serif",
  primary: "#3b82f6",
  amber:   "#f59e0b",
  green:   "#10b981",
  red:     "#ef4444",
  blue:    "#3b82f6",
};

// ── CAPTURA DE CLICS EN EL MAPA ──────────────────────────────
function MapEventsHandler({ isSelecting, onLocationSelected }) {
  useMapEvents({
    click(e) {
      if (isSelecting) onLocationSelected(e.latlng.lat, e.latlng.lng);
    }
  });
  return null;
}

function MapResizer() {
  const map = useMap();
  useEffect(() => { setTimeout(() => map.invalidateSize(), 300); }, [map]);
  return null;
}

// ── MINI MAPA DE PREVISUALIZACIÓN (iframe OSM, sin API key) ──
function LocationPreview({ lat, lng }) {
  if (!lat || !lng) return null;
  const la = parseFloat(lat);
  const ln = parseFloat(lng);
  const delta = 0.008;
  const bbox = `${ln - delta},${la - delta},${ln + delta},${la + delta}`;
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${la},${ln}`;
  return (
    <div style={{
      borderRadius: 10,
      overflow: "hidden",
      border: "1px solid rgba(61,206,106,0.25)",
      marginTop: 10,
      position: "relative",
    }}>
      <iframe
        title="preview"
        src={src}
        width="100%"
        height="140"
        style={{ display: "block", border: "none", filter: "invert(0.88) hue-rotate(180deg) saturate(0.7) brightness(0.9)" }}
        loading="lazy"
        sandbox="allow-scripts allow-same-origin"
      />
      {/* Badge de coords encima del mapa */}
      <div style={{
        position: "absolute",
        bottom: 6, left: 6,
        background: "rgba(6,10,20,0.88)",
        border: "1px solid rgba(61,206,106,0.3)",
        borderRadius: 6,
        padding: "3px 9px",
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 10,
        color: C.green,
        backdropFilter: "blur(8px)",
        pointerEvents: "none",
      }}>
        {la.toFixed(5)}, {ln.toFixed(5)}
      </div>
    </div>
  );
}

// ── MODAL DE EDICIÓN DE BARCO ─────────────────────────────────
function EditModal({ barco, onSave, onClose }) {
  const [form, setForm] = useState({
    nombre_barco:      barco.nombre_barco      ?? "",
    propietario:       barco.propietario       ?? "",
    ubicacion_general: barco.ubicacion_general ?? "",
    detalle_ubicacion: barco.detalle_ubicacion ?? "",
    latitud:           String(barco.latitud    ?? ""),
    longitud:          String(barco.longitud   ?? ""),
    link_maps:         "",
  });
  const [saving,   setSaving]   = useState(false);
  const [err,      setErr]      = useState("");
  const [showPrev, setShowPrev] = useState(true);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  function handleMapsInput(e) {
    const val = e.target.value;
    let lat = form.latitud;
    let lng = form.longitud;

    const matchAt   = val.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    const matchBang = val.match(/3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
    const matchRaw  = val.match(/(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)/);

    if      (matchAt)                         { lat = matchAt[1];   lng = matchAt[2];   }
    else if (matchBang)                       { lat = matchBang[1]; lng = matchBang[2]; }
    else if (matchRaw && !val.includes("http")){ lat = matchRaw[1];  lng = matchRaw[2];  }

    setForm(f => ({ ...f, link_maps: val, latitud: lat, longitud: lng }));
    setShowPrev(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.latitud || !form.longitud) { setErr("Falta la ubicación."); return; }
    setSaving(true); setErr("");
    const { error } = await supabase.from("postventa_flota").update({
      nombre_barco:      form.nombre_barco.trim(),
      propietario:       form.propietario.trim()       || null,
      ubicacion_general: form.ubicacion_general.trim() || null,
      detalle_ubicacion: form.detalle_ubicacion.trim() || null,
      latitud:  parseFloat(String(form.latitud).replace(",", ".")),
      longitud: parseFloat(String(form.longitud).replace(",", ".")),
    }).eq("id", barco.id);
    if (error) { setErr(error.message); setSaving(false); return; }
    onSave();
  }

  const INP = {
    width: "100%", boxSizing: "border-box",
    background: "rgba(255,255,255,0.05)",
    border: `1px solid ${C.b0}`,
    color: C.t0, padding: "10px 14px",
    borderRadius: 9, fontSize: 13, outline: "none", marginBottom: 14,
    transition: "border-color 0.15s", fontFamily: C.sans,
  };
  const LBL = { fontSize: 9, letterSpacing: 2, color: C.t1, display: "block", marginBottom: 6, textTransform: "uppercase", fontWeight: 600 };

  const hasCoords = form.latitud && form.longitud;

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(3,5,12,0.88)", backdropFilter: "blur(24px) saturate(140%)", WebkitBackdropFilter: "blur(24px) saturate(140%)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: "rgba(6,10,20,0.97)", backdropFilter: "blur(60px)", WebkitBackdropFilter: "blur(60px)", border: `1px solid ${C.b1}`, padding: "28px 28px", borderRadius: 18, width: "100%", maxWidth: 520, boxShadow: "0 32px 80px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.06)", maxHeight: "92vh", overflowY: "auto" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22 }}>
          <div>
            <div style={{ fontSize: 16, color: C.t0, fontWeight: 700, letterSpacing: 0.3 }}>Editar embarcación</div>
            <div style={{ fontSize: 11, color: C.t1, marginTop: 4, fontFamily: C.mono }}>{barco.nombre_barco}</div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: C.t1, cursor: "pointer", fontSize: 20, lineHeight: 1, padding: "4px 8px" }}>×</button>
        </div>

        {err && (
          <div style={{ padding: "10px 14px", borderRadius: 9, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", fontSize: 12, color: "#fca5a5", marginBottom: 16 }}>{err}</div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Datos del barco */}
          <div style={{ fontSize: 9, letterSpacing: 2, color: C.t1, textTransform: "uppercase", fontWeight: 600, marginBottom: 12 }}>Datos de la embarcación</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 2 }}>
            <div>
              <label style={LBL}>Nombre *</label>
              <input required style={INP} value={form.nombre_barco} onChange={e => set("nombre_barco", e.target.value)} />
            </div>
            <div>
              <label style={LBL}>Propietario</label>
              <input style={INP} placeholder="Nombre completo" value={form.propietario} onChange={e => set("propietario", e.target.value)} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={LBL}>Lugar</label>
              <input style={INP} placeholder="Marina del Norte" value={form.ubicacion_general} onChange={e => set("ubicacion_general", e.target.value)} />
            </div>
            <div>
              <label style={LBL}>Detalle</label>
              <input style={INP} placeholder="Lote 45 / Galpón 3" value={form.detalle_ubicacion} onChange={e => set("detalle_ubicacion", e.target.value)} />
            </div>
          </div>

          {/* Ubicación */}
          <div style={{ borderTop: `1px solid ${C.b0}`, paddingTop: 18, marginTop: 4, marginBottom: 16 }}>
            <div style={{ fontSize: 9, letterSpacing: 2, color: C.t1, textTransform: "uppercase", fontWeight: 600, marginBottom: 12 }}>Ubicación GPS</div>

            <label style={LBL}>Pegar link o coordenadas de Google Maps</label>
            <input
              style={{ ...INP, borderColor: hasCoords ? "rgba(61,206,106,0.3)" : C.b0, background: hasCoords ? "rgba(61,206,106,0.04)" : "rgba(255,255,255,0.05)" }}
              placeholder="Ej: -34.4183, -58.5846  ó  link largo de Maps"
              value={form.link_maps}
              onChange={handleMapsInput}
            />

            {/* Mini-mapa de preview */}
            {hasCoords && showPrev && (
              <>
                <div style={{ fontSize: 9, letterSpacing: 2, color: C.green, textTransform: "uppercase", fontWeight: 600, marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 5, height: 5, borderRadius: "50%", background: C.green, boxShadow: `0 0 6px ${C.green}` }} />
                  Vista previa de la ubicación
                </div>
                <LocationPreview lat={form.latitud} lng={form.longitud} />
                <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
                  <a
                    href={`https://www.google.com/maps?q=${form.latitud},${form.longitud}`}
                    target="_blank" rel="noreferrer"
                    style={{ fontSize: 10, padding: "4px 12px", borderRadius: 6, border: "1px solid rgba(59,130,246,0.3)", background: "rgba(59,130,246,0.07)", color: "#60a5fa", textDecoration: "none", fontFamily: C.sans }}
                  >
                    ↗ Verificar en Google Maps
                  </a>
                  <button type="button" onClick={() => { setShowPrev(false); setForm(f => ({ ...f, latitud: "", longitud: "", link_maps: "" })); }}
                    style={{ fontSize: 10, padding: "4px 12px", borderRadius: 6, border: `1px solid ${C.b0}`, background: "transparent", color: C.t2, cursor: "pointer", fontFamily: C.sans }}>
                    Cambiar
                  </button>
                </div>
              </>
            )}

            {/* Coordenadas manuales */}
            {!hasCoords && (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "4px 0 10px" }}>
                  <div style={{ flex: 1, height: 1, background: C.b0 }} />
                  <span style={{ fontSize: 9, color: C.t2, letterSpacing: 2, textTransform: "uppercase" }}>o ingresar manualmente</span>
                  <div style={{ flex: 1, height: 1, background: C.b0 }} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={LBL}>Latitud</label>
                    <input style={INP} placeholder="-34.4183" value={form.latitud} onChange={e => { set("latitud", e.target.value); setShowPrev(true); }} />
                  </div>
                  <div>
                    <label style={LBL}>Longitud</label>
                    <input style={INP} placeholder="-58.5846" value={form.longitud} onChange={e => { set("longitud", e.target.value); setShowPrev(true); }} />
                  </div>
                </div>
                {form.latitud && form.longitud && showPrev && (
                  <>
                    <LocationPreview lat={form.latitud} lng={form.longitud} />
                    <a href={`https://www.google.com/maps?q=${form.latitud},${form.longitud}`} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 8, fontSize: 10, padding: "4px 12px", borderRadius: 6, border: "1px solid rgba(59,130,246,0.3)", background: "rgba(59,130,246,0.07)", color: "#60a5fa", textDecoration: "none", fontFamily: C.sans }}>
                      ↗ Verificar en Google Maps
                    </a>
                  </>
                )}
              </>
            )}
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button type="submit" disabled={saving} style={{ flex: 1, padding: "12px", background: "rgba(255,255,255,0.92)", color: "#080c14", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.6 : 1 }}>
              {saving ? "Guardando…" : "Guardar cambios"}
            </button>
            <button type="button" onClick={onClose} style={{ background: "transparent", color: C.t1, padding: "12px 20px", borderRadius: 9, border: `1px solid ${C.b0}`, cursor: "pointer", fontWeight: 600, fontSize: 13 }}>Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── COMPONENTE PRINCIPAL ──────────────────────────────────────
export default function PostVentaScreen({ profile, signOut }) {
  const [flota,       setFlota]      = useState([]);
  const [loading,     setLoading]    = useState(true);
  const [filtro,      setFiltro]     = useState("");
  const [mapaRef,     setMapaRef]    = useState(null);
  const [isSelecting, setIsSelecting]= useState(false);
  const [showModal,   setShowModal]  = useState(false);
  const [editBarco,   setEditBarco]  = useState(null); // ← edición
  const [showLocPrev, setShowLocPrev]= useState(false); // preview en modal nuevo

  const [form, setForm] = useState({
    nombre_barco: "", propietario: "", ubicacion_general: "",
    detalle_ubicacion: "", latitud: "", longitud: "", link_maps: ""
  });

  const mapCenter = [-34.418, -58.585];

  useEffect(() => { cargarFlota(); }, []);

  async function cargarFlota() {
    setLoading(true);
    const { data, error } = await supabase.from("postventa_flota").select("*").order("created_at", { ascending: false });
    if (!error && data) setFlota(data);
    setLoading(false);
  }

  // ── PARSEO DE LINK / COORDENADAS ─────────────────────────────
  function parseCoordsFromValue(val) {
    const matchAt   = val.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    const matchBang = val.match(/3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
    const matchRaw  = val.match(/(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)/);
    if (matchAt)                          return { lat: matchAt[1],   lng: matchAt[2]   };
    if (matchBang)                        return { lat: matchBang[1], lng: matchBang[2] };
    if (matchRaw && !val.includes("http")) return { lat: matchRaw[1],  lng: matchRaw[2]  };
    return null;
  }

  function handleMapsInput(e) {
    const val    = e.target.value;
    const coords = parseCoordsFromValue(val);
    const lat    = coords?.lat ?? form.latitud;
    const lng    = coords?.lng ?? form.longitud;
    setForm(prev => ({ ...prev, link_maps: val, latitud: lat, longitud: lng }));
    setShowLocPrev(true);
    if (coords?.lat && coords?.lng && mapaRef) {
      mapaRef.flyTo([parseFloat(coords.lat), parseFloat(coords.lng)], 16, { duration: 1.5 });
    }
  }

  function handleLocationSelected(lat, lng) {
    setIsSelecting(false);
    setForm(prev => ({ ...prev, latitud: lat.toFixed(6), longitud: lng.toFixed(6), link_maps: "" }));
    setShowLocPrev(true);
    setShowModal(true);
    if (mapaRef) mapaRef.flyTo([lat, lng], 16, { duration: 1.2 });
  }

  async function registrarBarco(e) {
    e.preventDefault();
    if (!form.latitud || !form.longitud) { alert("Falta la ubicación."); return; }
    const { error } = await supabase.from("postventa_flota").insert([{
      nombre_barco:      form.nombre_barco,
      propietario:       form.propietario,
      ubicacion_general: form.ubicacion_general,
      detalle_ubicacion: form.detalle_ubicacion,
      latitud:  parseFloat(String(form.latitud).replace(",", ".")),
      longitud: parseFloat(String(form.longitud).replace(",", ".")),
    }]);
    if (error) { alert("Error al registrar: " + error.message); return; }
    setShowModal(false);
    setShowLocPrev(false);
    setForm({ nombre_barco: "", propietario: "", ubicacion_general: "", detalle_ubicacion: "", latitud: "", longitud: "", link_maps: "" });
    cargarFlota();
  }

  async function eliminarBarco(e, id, nombre) {
    e.stopPropagation();
    if (!window.confirm(`¿Eliminás "${nombre}"? Esta acción es irreversible.`)) return;
    const { error } = await supabase.from("postventa_flota").delete().eq("id", id);
    if (!error) setFlota(prev => prev.filter(b => b.id !== id));
  }

  function centrarMapa(lat, lng) {
    if (mapaRef && lat && lng) mapaRef.flyTo([lat, lng], 16, { duration: 1.2, easeLinearity: 0.25 });
  }

  function compartirWhatsApp(e, b) {
    e.stopPropagation();
    const mapUrl = `https://www.google.com/maps?q=${b.latitud},${b.longitud}`;
    const msj    = `*Embarcación:* ${b.nombre_barco}\n*Propietario:* ${b.propietario || '-'}\n*Lugar:* ${b.ubicacion_general}\n*Detalle:* ${b.detalle_ubicacion || '-'}\n\n*Ubicación exacta:*\n${mapUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msj)}`, "_blank");
  }

  const barcosFiltrados = flota.filter(b => {
    const q = filtro.toLowerCase();
    return (
      b.nombre_barco?.toLowerCase().includes(q) ||
      b.propietario?.toLowerCase().includes(q) ||
      b.ubicacion_general?.toLowerCase().includes(q) ||
      b.detalle_ubicacion?.toLowerCase().includes(q)
    );
  });

  const S = {
    page:       { position: "fixed", inset: 0, background: C.bg, color: C.t0, fontFamily: C.sans, overflow: "hidden" },
    mapLayer:   { position: "absolute", inset: 0, zIndex: 0 },
    uiLayer:    { position: "absolute", inset: 0, zIndex: 10, display: "flex", pointerEvents: "none" },
    sidebarWrap:{ width: "280px", height: "100%", pointerEvents: "auto", background: "#09090b" },
    mainUI:     { flex: 1, position: "relative", pointerEvents: "none" },
    topbar: {
      position: "absolute", top: 0, left: 0, right: 0, height: 64,
      background: "linear-gradient(180deg, rgba(3,5,12,0.92) 0%, rgba(3,5,12,0) 100%)",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0 28px", pointerEvents: "auto",
    },
    glassPanel: {
      position: "absolute", top: 76, left: 20, bottom: 20, width: 368,
      background: "rgba(3,5,12,0.82)",
      backdropFilter: "blur(48px) saturate(140%)",
      WebkitBackdropFilter: "blur(48px) saturate(140%)",
      border: `1px solid ${C.b1}`,
      borderRadius: 16, display: "flex", flexDirection: "column",
      pointerEvents: "auto",
      boxShadow: "0 24px 60px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.06)",
    },
    panelHeader: { padding: "18px 20px 16px", borderBottom: `1px solid ${C.b0}`, flexShrink: 0 },
    card: { padding: "16px 20px", borderBottom: `1px solid rgba(255,255,255,0.05)`, cursor: "pointer", transition: "background 0.15s", background: "transparent" },
    searchInput: { width: "100%", background: "rgba(255,255,255,0.05)", border: `1px solid ${C.b0}`, color: C.t0, padding: "10px 14px 10px 38px", borderRadius: 10, fontSize: 13, outline: "none", transition: "border-color 0.2s", boxSizing: "border-box" },
    btnGhost: { background: "rgba(255,255,255,0.04)", border: `1px solid ${C.b0}`, color: C.t1, padding: "5px 12px", borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: "pointer", transition: "all 0.15s", display: "flex", alignItems: "center", gap: 5 },
    btnGreen: { background: "rgba(61,206,106,0.1)", border: "1px solid rgba(61,206,106,0.3)", color: C.green, padding: "5px 12px", borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: "pointer", transition: "all 0.15s", display: "flex", alignItems: "center", gap: 5 },
    btnBlue:  { background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.25)", color: "#60a5fa", padding: "5px 12px", borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: "pointer", transition: "all 0.15s", display: "flex", alignItems: "center", gap: 5 },
    btnPrimary: { background: "rgba(255,255,255,0.92)", color: "#080c14", border: "1px solid rgba(255,255,255,0.25)", padding: "9px 20px", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: "pointer", letterSpacing: 0.2, boxShadow: "0 4px 16px rgba(255,255,255,0.1)", transition: "opacity 0.15s" },
    modalOverlay: { position: "fixed", inset: 0, background: "rgba(3,5,12,0.88)", backdropFilter: "blur(24px) saturate(140%)", WebkitBackdropFilter: "blur(24px) saturate(140%)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, pointerEvents: "auto" },
    modalBox: { background: "rgba(6,10,20,0.97)", backdropFilter: "blur(60px)", WebkitBackdropFilter: "blur(60px)", border: `1px solid ${C.b1}`, padding: "32px 28px", borderRadius: 18, width: "100%", maxWidth: 520, boxShadow: "0 32px 80px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.06)", maxHeight: "92vh", overflowY: "auto" },
    input: { width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.05)", border: `1px solid ${C.b0}`, color: C.t0, padding: "10px 14px", borderRadius: 9, fontSize: 13, outline: "none", marginBottom: 14, transition: "border-color 0.15s" },
    label: { fontSize: 9, letterSpacing: 2, color: C.t1, display: "block", marginBottom: 6, textTransform: "uppercase", fontWeight: 600 },
    locationOption: { padding: "14px 16px", borderRadius: 12, marginBottom: 10, border: `1px solid ${C.b0}`, background: "rgba(255,255,255,0.02)", transition: "border-color 0.15s" },
    locationOptionActive: { padding: "14px 16px", borderRadius: 12, marginBottom: 10, border: "1px solid rgba(61,206,106,0.3)", background: "rgba(61,206,106,0.05)" },
    selectBanner: { position: "absolute", top: 76, left: "50%", transform: "translateX(-50%)", background: C.green, color: "#000", padding: "12px 26px", borderRadius: 99, fontWeight: 700, fontSize: 13, pointerEvents: "auto", boxShadow: `0 8px 32px rgba(61,206,106,0.4)`, display: "flex", alignItems: "center", gap: 10, zIndex: 9999, cursor: "pointer", letterSpacing: 0.3 },
    btnSelectMap: { width: "100%", background: "rgba(255,255,255,0.04)", border: `1px solid ${C.b1}`, color: C.t0, padding: "12px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "background 0.2s", marginBottom: 14, textAlign: "left", display: "flex", alignItems: "center", gap: 10 },
  };

  const hasNewCoords = form.latitud && form.longitud;

  return (
    <div style={S.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');
        * { box-sizing: border-box; }

        .map-pin-outer { position: relative; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; }
        .map-pin-inner { width: 10px; height: 10px; border-radius: 50%; background: #3dce6a; position: relative; z-index: 2; box-shadow: 0 0 10px rgba(61,206,106,0.7); }
        .map-pin-ring  { position: absolute; inset: 0; border-radius: 50%; border: 2px solid rgba(61,206,106,0.4); animation: pin-pulse 2.2s ease-out infinite; }
        @keyframes pin-pulse { 0% { transform: scale(0.5); opacity: 0.8; } 100% { transform: scale(1.6); opacity: 0; } }
        .new-pin-inner { background: #4a90e2 !important; box-shadow: 0 0 10px rgba(74,144,226,0.7) !important; }
        .new-pin-ring  { border-color: rgba(74,144,226,0.4) !important; }

        .boat-card:hover { background: rgba(255,255,255,0.04) !important; }
        .btn-ghost-h:hover { border-color: rgba(255,255,255,0.22) !important; color: #dde2ea !important; background: rgba(255,255,255,0.07) !important; }
        .btn-green-h:hover { background: rgba(61,206,106,0.18) !important; border-color: rgba(61,206,106,0.5) !important; }
        .btn-blue-h:hover  { background: rgba(59,130,246,0.16) !important; border-color: rgba(59,130,246,0.4) !important; }
        .btn-del:hover { color: #e04848 !important; }
        .btn-select-map:hover { background: rgba(255,255,255,0.08) !important; border-color: rgba(255,255,255,0.22) !important; }

        .leaflet-popup-content-wrapper { background: rgba(6,10,20,0.96) !important; backdrop-filter: blur(20px); color: #dde2ea; border: 1px solid rgba(255,255,255,0.14) !important; border-radius: 14px !important; box-shadow: 0 16px 48px rgba(0,0,0,0.9) !important; padding: 0 !important; }
        .leaflet-popup-content { margin: 0 !important; }
        .leaflet-popup-tip-container { display: none; }
        .leaflet-container a.leaflet-popup-close-button { color: rgba(255,255,255,0.3) !important; top: 14px !important; right: 14px !important; font-size: 18px !important; z-index: 10; }
        .leaflet-container a.leaflet-popup-close-button:hover { color: rgba(255,255,255,0.8) !important; }

        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 99px; }

        ${isSelecting ? ".leaflet-container { cursor: crosshair !important; }" : ""}
        select option { background: #0f0f12; color: #a1a1aa; }
        input:focus { border-color: rgba(59,130,246,0.35) !important; }
      `}</style>

      {/* ── 1. MAPA ── */}
      <div style={S.mapLayer}>
        <MapContainer center={mapCenter} zoom={13} style={{ width: "100%", height: "100%" }} ref={setMapaRef} zoomControl={false}>
          <MapResizer />
          <MapEventsHandler isSelecting={isSelecting} onLocationSelected={handleLocationSelected} />
          <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" attribution="© OpenStreetMap" />

          {barcosFiltrados.map(barco =>
            barco.latitud && barco.longitud && (
              <Marker key={barco.id} position={[barco.latitud, barco.longitud]} icon={ModernIcon}>
                <Popup>
                  <div style={{ padding: "16px 18px", minWidth: 200 }}>
                    <div style={{ fontSize: 15, color: "#dde2ea", fontWeight: 700, marginBottom: 12, letterSpacing: 0.4, fontFamily: "'Outfit', sans-serif" }}>{barco.nombre_barco}</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <div>
                        <div style={{ fontSize: 9, color: "#566070", letterSpacing: 2, textTransform: "uppercase", marginBottom: 2 }}>Propietario</div>
                        <div style={{ fontSize: 12, color: "#a8b4c0" }}>{barco.propietario || "—"}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 9, color: "#566070", letterSpacing: 2, textTransform: "uppercase", marginBottom: 2 }}>Ubicación</div>
                        <div style={{ fontSize: 12, color: "#a8b4c0" }}>{barco.ubicacion_general}</div>
                        {barco.detalle_ubicacion && <div style={{ fontSize: 11, color: "#566070", marginTop: 1 }}>{barco.detalle_ubicacion}</div>}
                      </div>
                      <div style={{ paddingTop: 6, borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                        <div style={{ fontSize: 9, color: "#3a4050", fontFamily: "monospace" }}>{barco.latitud?.toFixed(5)}, {barco.longitud?.toFixed(5)}</div>
                      </div>
                    </div>
                  </div>
                </Popup>
              </Marker>
            )
          )}

          {/* Marcador temporal de nueva entrada */}
          {hasNewCoords && showModal && (
            <Marker position={[parseFloat(form.latitud), parseFloat(form.longitud)]} icon={NewIcon} />
          )}
        </MapContainer>
      </div>

      {/* ── 2. UI LAYER ── */}
      <div style={S.uiLayer}>
        <div style={S.sidebarWrap}><Sidebar profile={profile} signOut={signOut} /></div>

        <div style={S.mainUI}>
          {isSelecting && (
            <div style={S.selectBanner} onClick={() => { setIsSelecting(false); setShowModal(true); }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#000", opacity: 0.5 }} />
              Hacé clic en la ubicación exacta del barco
              <span style={{ opacity: 0.6, fontSize: 11, marginLeft: 4 }}>· toque para cancelar</span>
            </div>
          )}

          {!isSelecting && (
            <div style={S.topbar}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: 0.5, color: C.t0 }}>Post Venta</span>
                <span style={{ fontSize: 11, color: C.t1, letterSpacing: 2, textTransform: "uppercase" }}>· Flota</span>
                <div style={{ marginLeft: 8, padding: "2px 10px", borderRadius: 99, background: "rgba(61,206,106,0.1)", border: "1px solid rgba(61,206,106,0.25)", fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: C.green, fontWeight: 600 }}>
                  {barcosFiltrados.length}
                </div>
              </div>
              <button style={S.btnPrimary} onClick={() => { setForm({ nombre_barco: "", propietario: "", ubicacion_general: "", detalle_ubicacion: "", latitud: "", longitud: "", link_maps: "" }); setShowLocPrev(false); setShowModal(true); }}>
                + Nueva embarcación
              </button>
            </div>
          )}

          {!isSelecting && (
            <div style={S.glassPanel}>
              {/* Buscador */}
              <div style={S.panelHeader}>
                <div style={{ position: "relative" }}>
                  <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: C.t1, pointerEvents: "none", lineHeight: 1 }}>⌕</span>
                  <input
                    type="text"
                    placeholder="Buscar embarcación, propietario, lugar…"
                    style={S.searchInput}
                    value={filtro}
                    onChange={e => setFiltro(e.target.value)}
                    onFocus={e => e.target.style.borderColor = "rgba(255,255,255,0.22)"}
                    onBlur={e => e.target.style.borderColor = C.b0}
                  />
                </div>
              </div>

              {/* Lista */}
              <div style={{ flex: 1, overflowY: "auto" }}>
                {loading ? (
                  <div style={{ padding: "50px 20px", color: C.t2, fontSize: 11, textAlign: "center", letterSpacing: 2, textTransform: "uppercase", fontFamily: "'JetBrains Mono', monospace" }}>Sincronizando…</div>
                ) : barcosFiltrados.length === 0 ? (
                  <div style={{ padding: "50px 20px", textAlign: "center" }}>
                    <div style={{ fontSize: 11, color: C.t2, letterSpacing: 2, textTransform: "uppercase", fontFamily: "'JetBrains Mono', monospace" }}>Sin registros</div>
                    {filtro && <button onClick={() => setFiltro("")} style={{ marginTop: 10, background: "transparent", border: `1px solid ${C.b0}`, color: C.t1, padding: "5px 14px", borderRadius: 8, cursor: "pointer", fontSize: 11 }}>Limpiar filtro</button>}
                  </div>
                ) : (
                  barcosFiltrados.map(b => (
                    <div key={b.id} style={S.card} className="boat-card" onClick={() => centrarMapa(b.latitud, b.longitud)}>
                      {/* Header */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                        <div>
                          <div style={{ fontSize: 14, color: C.t0, fontWeight: 700, letterSpacing: 0.4, lineHeight: 1.2 }}>{b.nombre_barco}</div>
                          <div style={{ fontSize: 11, color: C.t1, marginTop: 4, display: "flex", alignItems: "center", gap: 5 }}>
                            <div style={{ width: 5, height: 5, borderRadius: "50%", background: b.propietario ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.1)", flexShrink: 0 }} />
                            {b.propietario || <span style={{ opacity: 0.4, fontStyle: "italic" }}>Sin propietario</span>}
                          </div>
                        </div>
                        <button onClick={e => eliminarBarco(e, b.id, b.nombre_barco)} className="btn-del" style={{ background: "transparent", border: "none", color: C.t2, cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "2px 4px", transition: "color 0.15s" }} title="Eliminar">×</button>
                      </div>

                      {/* Ubicación */}
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
                          <div style={{ width: 4, height: 4, borderRadius: "50%", background: C.green, flexShrink: 0, marginTop: 5, boxShadow: `0 0 4px ${C.green}88` }} />
                          <div>
                            <span style={{ fontSize: 12, color: "#8a9aaa" }}>{b.ubicacion_general}</span>
                            {b.detalle_ubicacion && <span style={{ fontSize: 11, color: C.t1, marginLeft: 5 }}>· {b.detalle_ubicacion}</span>}
                          </div>
                        </div>
                      </div>

                      {/* Acciones */}
                      <div style={{ display: "flex", gap: 6 }}>
                        <button style={S.btnGhost} className="btn-ghost-h" onClick={e => { e.stopPropagation(); centrarMapa(b.latitud, b.longitud); }}>⌖ Centrar</button>
                        {/* ← BOTÓN EDITAR */}
                        <button style={S.btnBlue} className="btn-blue-h" onClick={e => { e.stopPropagation(); setEditBarco(b); }}>✎ Editar</button>
                        <button style={S.btnGreen} className="btn-green-h" onClick={e => compartirWhatsApp(e, b)}>↗ WhatsApp</button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── 3. MODAL NUEVA EMBARCACIÓN ── */}
      {showModal && (
        <div style={S.modalOverlay} onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div style={S.modalBox}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 26 }}>
              <div>
                <div style={{ fontSize: 17, color: C.t0, fontWeight: 700, letterSpacing: 0.3 }}>Nueva embarcación</div>
                <div style={{ fontSize: 11, color: C.t1, marginTop: 4 }}>Completá los datos y la ubicación</div>
              </div>
              <button onClick={() => setShowModal(false)} style={{ background: "transparent", border: "none", color: C.t1, cursor: "pointer", fontSize: 20, lineHeight: 1, padding: "4px 8px" }}>×</button>
            </div>

            {/* Ubicación GPS */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 9, letterSpacing: 2, color: C.t1, textTransform: "uppercase", fontWeight: 600, marginBottom: 10 }}>Ubicación GPS</div>

              {/* Opción A — pegar link */}
              <div style={hasNewCoords && form.link_maps ? S.locationOptionActive : S.locationOption}>
                <label style={{ ...S.label, marginBottom: 8, color: C.blue }}>Opción A · Pegar link o coordenadas de Google Maps</label>
                <input
                  style={{ ...S.input, marginBottom: 0, borderColor: "rgba(74,144,226,0.3)", background: "rgba(74,144,226,0.04)", color: hasNewCoords ? C.green : C.t0 }}
                  placeholder="Ej: -34.4183, -58.5846  ó  link largo de Maps"
                  value={form.link_maps}
                  onChange={handleMapsInput}
                />
                {form.link_maps && !hasNewCoords && (
                  <div style={{ fontSize: 11, color: "#e04848", marginTop: 6 }}>Formato no reconocido — intentá con el link largo o coordenadas.</div>
                )}

                {/* ← MINI-MAPA DE CONFIRMACIÓN */}
                {hasNewCoords && form.link_maps && showLocPrev && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 9, letterSpacing: 2, color: C.green, textTransform: "uppercase", fontWeight: 600, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ width: 5, height: 5, borderRadius: "50%", background: C.green, boxShadow: `0 0 6px ${C.green}` }} />
                      Confirmá la ubicación antes de guardar
                    </div>
                    <LocationPreview lat={form.latitud} lng={form.longitud} />
                    <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
                      <a href={`https://www.google.com/maps?q=${form.latitud},${form.longitud}`} target="_blank" rel="noreferrer" style={{ fontSize: 10, padding: "4px 12px", borderRadius: 6, border: "1px solid rgba(59,130,246,0.3)", background: "rgba(59,130,246,0.07)", color: "#60a5fa", textDecoration: "none", fontFamily: C.sans }}>
                        ↗ Verificar en Google Maps
                      </a>
                      <button type="button" onClick={() => { setForm(f => ({ ...f, latitud: "", longitud: "", link_maps: "" })); setShowLocPrev(false); }}
                        style={{ fontSize: 10, padding: "4px 12px", borderRadius: 6, border: `1px solid ${C.b0}`, background: "transparent", color: C.t2, cursor: "pointer", fontFamily: C.sans }}>
                        Cambiar
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "4px 0 8px" }}>
                <div style={{ flex: 1, height: 1, background: C.b0 }} />
                <span style={{ fontSize: 9, color: C.t2, letterSpacing: 2, textTransform: "uppercase" }}>o</span>
                <div style={{ flex: 1, height: 1, background: C.b0 }} />
              </div>

              {/* Opción B — marcar en mapa */}
              <button type="button" style={S.btnSelectMap} className="btn-select-map" onClick={() => { setShowModal(false); setIsSelecting(true); }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(255,255,255,0.06)", border: `1px solid ${C.b0}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>⌖</div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.t0, lineHeight: 1.3 }}>Opción B · Marcar en el mapa</div>
                  <div style={{ fontSize: 11, color: C.t1, marginTop: 2 }}>Hacé clic directo en el lugar exacto</div>
                </div>
              </button>

              {/* Coords capturadas del mapa */}
              {hasNewCoords && !form.link_maps && (
                <>
                  <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(61,206,106,0.05)", border: "1px solid rgba(61,206,106,0.2)", display: "flex", alignItems: "center", gap: 8, marginBottom: 0 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.green, flexShrink: 0, boxShadow: `0 0 6px ${C.green}` }} />
                    <div>
                      <div style={{ fontSize: 9, color: C.green, letterSpacing: 2, textTransform: "uppercase", fontWeight: 600 }}>Ubicación capturada del mapa</div>
                      <div style={{ fontSize: 11, color: "#8a9aaa", marginTop: 2, fontFamily: "'JetBrains Mono', monospace" }}>{parseFloat(form.latitud).toFixed(6)}, {parseFloat(form.longitud).toFixed(6)}</div>
                    </div>
                  </div>
                  {/* Mini-mapa también para la opción B */}
                  {showLocPrev && (
                    <div style={{ marginTop: 8 }}>
                      <LocationPreview lat={form.latitud} lng={form.longitud} />
                      <div style={{ marginTop: 6, display: "flex", gap: 6 }}>
                        <a href={`https://www.google.com/maps?q=${form.latitud},${form.longitud}`} target="_blank" rel="noreferrer" style={{ fontSize: 10, padding: "4px 12px", borderRadius: 6, border: "1px solid rgba(59,130,246,0.3)", background: "rgba(59,130,246,0.07)", color: "#60a5fa", textDecoration: "none", fontFamily: C.sans }}>
                          ↗ Verificar en Google Maps
                        </a>
                        <button type="button" onClick={() => { setIsSelecting(true); setShowModal(false); }}
                          style={{ fontSize: 10, padding: "4px 12px", borderRadius: 6, border: `1px solid ${C.b0}`, background: "transparent", color: C.t2, cursor: "pointer", fontFamily: C.sans }}>
                          ↩ Re-seleccionar
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Datos */}
            <div style={{ borderTop: `1px solid ${C.b0}`, paddingTop: 20 }}>
              <div style={{ fontSize: 9, letterSpacing: 2, color: C.t1, textTransform: "uppercase", fontWeight: 600, marginBottom: 14 }}>Datos de la embarcación</div>
              <form onSubmit={registrarBarco}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div><label style={S.label}>Nombre *</label><input required style={S.input} placeholder="K37 Margarita" value={form.nombre_barco} onChange={e => setForm({ ...form, nombre_barco: e.target.value })} autoFocus /></div>
                  <div><label style={S.label}>Propietario</label><input style={S.input} placeholder="Nombre completo" value={form.propietario} onChange={e => setForm({ ...form, propietario: e.target.value })} /></div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div><label style={S.label}>Lugar *</label><input required style={S.input} placeholder="Marina del Norte" value={form.ubicacion_general} onChange={e => setForm({ ...form, ubicacion_general: e.target.value })} /></div>
                  <div><label style={S.label}>Detalle</label><input style={S.input} placeholder="Lote 45 / Galpón 3" value={form.detalle_ubicacion} onChange={e => setForm({ ...form, detalle_ubicacion: e.target.value })} /></div>
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                  <button type="submit" style={{ ...S.btnPrimary, flex: 1, padding: "13px", fontSize: 14 }}>Guardar</button>
                  <button type="button" onClick={() => setShowModal(false)} style={{ background: "transparent", color: C.t1, padding: "13px 20px", borderRadius: 9, border: `1px solid ${C.b0}`, cursor: "pointer", fontWeight: 600, fontSize: 13 }}>Cancelar</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ── 4. MODAL DE EDICIÓN ── */}
      {editBarco && (
        <EditModal
          barco={editBarco}
          onSave={() => { setEditBarco(null); cargarFlota(); }}
          onClose={() => setEditBarco(null)}
        />
      )}
    </div>
  );
}
