import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import Sidebar from "../components/Sidebar";
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// ── ÍCONO MINIMALISTA Y PROFESIONAL ──
const ModernIcon = L.divIcon({
  className: "custom-modern-icon",
  html: `<div style="
    width: 16px; 
    height: 16px; 
    background: #ffffff; 
    border: 4px solid #32d74b; 
    border-radius: 50%; 
    box-shadow: 0 4px 10px rgba(0,0,0,0.6);
  "></div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  popupAnchor: [0, -14]
});

// ── TOKENS DE DISEÑO PREMIUM ──────────────────
const C = {
  bg: "#000000",
  s0: "#050505",
  s1: "#0a0a0a",
  b0: "rgba(255,255,255,0.06)",
  b1: "rgba(255,255,255,0.12)",
  t0: "#e0e0e0",
  t1: "#8a8a8a",
  t2: "#545454",
  accent: "#ffffff",
};

// ── COMPONENTE PARA CAPTURAR CLICS EN EL MAPA ──
function MapEventsHandler({ isSelecting, onLocationSelected }) {
  useMapEvents({
    click(e) {
      if (isSelecting) {
        onLocationSelected(e.latlng.lat, e.latlng.lng);
      }
    }
  });
  return null;
}

// ── PARCHE DE RESIZE PARA EL MAPA FULLSCREEN ──
function MapResizer() {
  const map = useMap();
  useEffect(() => {
    setTimeout(() => map.invalidateSize(), 300);
  }, [map]);
  return null;
}

export default function PostVentaScreen({ profile, signOut }) {
  const [flota, setFlota] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("");
  const [mapaRef, setMapaRef] = useState(null);
  
  const [isSelecting, setIsSelecting] = useState(false);
  const [showModal, setShowModal] = useState(false);
  
  const [form, setForm] = useState({
    nombre_barco: "", propietario: "", ubicacion_general: "", 
    detalle_ubicacion: "", latitud: "", longitud: "", link_maps: ""
  });

  const mapCenter = [-34.418, -58.585];

  useEffect(() => {
    cargarFlota();
  }, []);

  async function cargarFlota() {
    setLoading(true);
    const { data, error } = await supabase.from("postventa_flota").select("*").order("created_at", { ascending: false });
    if (!error && data) setFlota(data);
    setLoading(false);
  }

  // ── AUTOCOMPLETADO INTELIGENTE DESDE GOOGLE MAPS ──
  function handleMapsInput(e) {
    const val = e.target.value;
    let lat = form.latitud;
    let lng = form.longitud;

    // Detecta coordenadas en el link o pegadas en crudo
    const matchAt = val.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    const matchBang = val.match(/3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
    const matchRaw = val.match(/(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)/);

    if (matchAt) { lat = matchAt[1]; lng = matchAt[2]; }
    else if (matchBang) { lat = matchBang[1]; lng = matchBang[2]; }
    else if (matchRaw && !val.includes("http")) { lat = matchRaw[1]; lng = matchRaw[2]; }

    setForm(prev => ({ ...prev, link_maps: val, latitud: lat, longitud: lng }));

    // Si encontró coordenadas, mueve el mapa para mostrarte dónde cayó
    if (lat && lng && mapaRef) {
      mapaRef.flyTo([lat, lng], 16, { duration: 1.5 });
    }
  }

  // Cuando hacés clic en el mapa en modo selección
  function handleLocationSelected(lat, lng) {
    setIsSelecting(false);
    setForm(prev => ({ ...prev, latitud: lat.toFixed(6), longitud: lng.toFixed(6), link_maps: "" }));
    setShowModal(true);
    if (mapaRef) mapaRef.flyTo([lat, lng], 16, { duration: 1.2 });
  }

  async function registrarBarco(e) {
    e.preventDefault();
    if (!form.latitud || !form.longitud) {
      return alert("Falta la ubicación (Latitud y Longitud).");
    }

    const { error } = await supabase.from("postventa_flota").insert([{
      nombre_barco: form.nombre_barco,
      propietario: form.propietario,
      ubicacion_general: form.ubicacion_general,
      detalle_ubicacion: form.detalle_ubicacion,
      latitud: parseFloat(String(form.latitud).replace(',', '.')),
      longitud: parseFloat(String(form.longitud).replace(',', '.'))
    }]);

    if (error) {
      alert("Error al registrar: " + error.message);
    } else {
      setShowModal(false);
      setForm({ nombre_barco: "", propietario: "", ubicacion_general: "", detalle_ubicacion: "", latitud: "", longitud: "", link_maps: "" });
      cargarFlota();
    }
  }

  async function eliminarBarco(e, id, nombre) {
    e.stopPropagation();
    if (!window.confirm(`¿Confirmás la eliminación de "${nombre}"?\nEsta acción es irreversible.`)) return;
    const { error } = await supabase.from("postventa_flota").delete().eq("id", id);
    if (!error) setFlota(prev => prev.filter(b => b.id !== id));
  }

  function centrarMapa(lat, lng) {
    if (mapaRef && lat && lng) {
      mapaRef.flyTo([lat, lng], 16, { duration: 1.2, easeLinearity: 0.25 });
    }
  }

  function compartirWhatsApp(e, b) {
    e.stopPropagation();
    const mapUrl = `https://www.google.com/maps?q=${b.latitud},${b.longitud}`;
    const msj = `*Embarcación:* ${b.nombre_barco}\n*Propietario:* ${b.propietario || '-'}\n*Lugar:* ${b.ubicacion_general}\n*Detalle:* ${b.detalle_ubicacion || '-'}\n\n*Ubicación exacta:*\n${mapUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msj)}`, '_blank');
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
    page: { position: "fixed", inset: 0, background: C.bg, color: C.t0, fontFamily: "'Inter', -apple-system, sans-serif", overflow: "hidden" },
    mapLayer: { position: "absolute", inset: 0, zIndex: 0 },
    
    uiLayer: { position: "absolute", inset: 0, zIndex: 10, display: "flex", pointerEvents: "none" },
    sidebarWrap: { width: "280px", height: "100%", pointerEvents: "auto", background: C.bg },
    
    mainUI: { flex: 1, position: "relative", pointerEvents: "none" },
    topbar: {
      position: "absolute", top: 0, left: 0, right: 0, height: "70px",
      background: "linear-gradient(180deg, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0) 100%)",
      display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 32px", pointerEvents: "auto"
    },
    
    glassPanel: {
      position: "absolute", top: 80, left: 24, bottom: 24, width: 380,
      background: "rgba(10, 10, 10, 0.7)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
      border: `1px solid ${C.b1}`, borderRadius: 16, display: "flex", flexDirection: "column",
      pointerEvents: "auto", boxShadow: "0 20px 40px rgba(0,0,0,0.6)"
    },

    card: { padding: "18px 20px", borderBottom: `1px solid ${C.b0}`, cursor: "pointer", transition: "all 0.2s ease", background: "transparent" },
    searchInput: { width: "100%", background: "rgba(255,255,255,0.05)", border: `1px solid ${C.b0}`, color: "#fff", padding: "12px 16px", borderRadius: 10, fontSize: 13, outline: "none", transition: "border 0.2s" },
    btnGhost: { background: "rgba(0,0,0,0.5)", border: `1px solid ${C.b1}`, color: C.t0, padding: "6px 14px", borderRadius: 8, fontSize: 11, fontWeight: 500, cursor: "pointer", transition: "all 0.2s", display: "flex", alignItems: "center", gap: 6 },
    btnPrimary: { background: C.accent, color: "#000", border: "none", padding: "10px 20px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", transition: "transform 0.1s", boxShadow: "0 4px 12px rgba(255,255,255,0.2)" },

    modalOverlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, pointerEvents: "auto" },
    modalBox: { background: "#0a0a0a", border: `1px solid ${C.b1}`, padding: 32, borderRadius: 16, width: "100%", maxWidth: 520, boxShadow: "0 24px 50px rgba(0,0,0,0.8)", maxHeight: "90vh", overflowY: "auto" },
    input: { width: "100%", background: "rgba(255,255,255,0.03)", border: `1px solid ${C.b0}`, color: "#fff", padding: "12px 14px", borderRadius: 8, fontSize: 13, outline: "none", marginBottom: 16 },
    label: { fontSize: 10, letterSpacing: 1.5, color: C.t1, display: "block", marginBottom: 8, textTransform: "uppercase", fontWeight: 600 },
    
    badgeUrl: { background: "rgba(50, 100, 255, 0.08)", border: "1px dashed rgba(50, 100, 255, 0.3)", padding: "16px", borderRadius: 12, marginBottom: 16 },
    
    selectBanner: {
      position: "absolute", top: 80, left: "50%", transform: "translateX(-50%)",
      background: "#32d74b", color: "#000", padding: "12px 24px", borderRadius: 99,
      fontWeight: 700, fontSize: 14, pointerEvents: "auto", boxShadow: "0 10px 30px rgba(50,215,75,0.3)",
      display: "flex", alignItems: "center", gap: 10, zIndex: 9999, cursor: "pointer"
    },

    btnSelectMap: { width: "100%", background: "rgba(255,255,255,0.05)", border: `1px solid ${C.b1}`, color: "#fff", padding: "12px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "background 0.2s", marginBottom: 16 }
  };

  return (
    <div style={S.page}>
      <style>{`
        .glass-card:hover { background: rgba(255,255,255,0.05) !important; }
        .btn-hover:hover { background: rgba(255,255,255,0.15) !important; border-color: rgba(255,255,255,0.3) !important; color: #fff !important; }
        .btn-wsp:hover { background: rgba(37, 211, 102, 0.2) !important; border-color: rgba(37, 211, 102, 0.4) !important; color: #25D366 !important; }
        .btn-map-hover:hover { background: rgba(255,255,255,0.1) !important; }
        
        .leaflet-popup-content-wrapper { background: rgba(15,15,15,0.95); backdrop-filter: blur(10px); color: #e0e0e0; border: 1px solid rgba(255,255,255,0.15); border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.8); }
        .leaflet-popup-tip { background: rgba(15,15,15,0.95); }
        .leaflet-container a.leaflet-popup-close-button { color: #aaa; top: 12px; right: 12px; font-size: 16px; }
        
        ${isSelecting ? '.leaflet-container { cursor: crosshair !important; }' : ''}
      `}</style>

      {/* ── 1. EL MAPA DE FONDO ── */}
      <div style={S.mapLayer}>
        <MapContainer center={mapCenter} zoom={13} style={{ width: "100%", height: "100%" }} ref={setMapaRef} zoomControl={false}>
          <MapResizer />
          <MapEventsHandler isSelecting={isSelecting} onLocationSelected={handleLocationSelected} />
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='© OpenStreetMap'
          />
          
          {barcosFiltrados.map(barco => (
            barco.latitud && barco.longitud && (
              <Marker key={barco.id} position={[barco.latitud, barco.longitud]} icon={ModernIcon}>
                <Popup>
                  <div style={{ padding: "4px 2px", minWidth: 180 }}>
                    <strong style={{ fontSize: 16, color: "#fff", display: "block", marginBottom: 8, letterSpacing: 0.5 }}>{barco.nombre_barco}</strong>
                    <div style={{ fontSize: 12, lineHeight: 1.6, color: "#b0b0b0" }}>
                      <span style={{ color: "#777", fontSize: 10, letterSpacing: 1 }}>PROPIETARIO</span><br/>
                      <span style={{ color: "#fff", marginBottom: 6, display: "block" }}>{barco.propietario || '-'}</span>
                      <span style={{ color: "#777", fontSize: 10, letterSpacing: 1 }}>LUGAR</span><br/>
                      <span style={{ color: "#fff" }}>{barco.ubicacion_general}</span><br/>
                      <span style={{ color: "#fff" }}>{barco.detalle_ubicacion || '-'}</span>
                    </div>
                  </div>
                </Popup>
              </Marker>
            )
          ))}
          
          {/* Marcador temporal cuando estamos completando el form */}
          {form.latitud && form.longitud && showModal && (
            <Marker position={[form.latitud, form.longitud]} icon={ModernIcon} />
          )}
        </MapContainer>
      </div>

      {/* ── 2. LA INTERFAZ POR ENCIMA ── */}
      <div style={S.uiLayer}>
        <div style={S.sidebarWrap}>
          <Sidebar profile={profile} signOut={signOut} />
        </div>

        <div style={S.mainUI}>

          {isSelecting && (
            <div style={S.selectBanner} onClick={() => { setIsSelecting(false); setShowModal(true); }}>
              📍 Hacé clic en la ubicación exacta del mapa (Tocar acá para cancelar)
            </div>
          )}

          {!isSelecting && (
            <div style={S.topbar}>
              <div style={{ fontWeight: 800, letterSpacing: 4, fontSize: 14, textTransform: "uppercase", color: "#fff" }}>
                Flota Activa <span style={{ color: C.t1, fontWeight: 400, letterSpacing: 2 }}>— {barcosFiltrados.length} Registros</span>
              </div>
              <button 
                style={S.btnPrimary} 
                onClick={() => {
                  setForm({ nombre_barco: "", propietario: "", ubicacion_general: "", detalle_ubicacion: "", latitud: "", longitud: "", link_maps: "" });
                  setShowModal(true);
                }}
              >
                + Registrar Embarcación
              </button>
            </div>
          )}

          {!isSelecting && (
            <div style={S.glassPanel}>
              <div style={{ padding: "20px", borderBottom: `1px solid ${C.b0}` }}>
                <input 
                  type="text" placeholder="Filtrar embarcación, cliente, lugar..." style={S.searchInput}
                  value={filtro} onChange={(e) => setFiltro(e.target.value)}
                  onFocus={(e) => e.target.style.borderColor = "rgba(255,255,255,0.3)"}
                  onBlur={(e) => e.target.style.borderColor = C.b0}
                />
              </div>
              
              <div style={{ flex: 1, overflowY: "auto" }}>
                {loading ? (
                  <div style={{ padding: 40, color: C.t1, fontSize: 13, textAlign: "center" }}>Sincronizando flota...</div>
                ) : barcosFiltrados.length === 0 ? (
                  <div style={{ padding: 40, color: C.t1, fontSize: 13, textAlign: "center" }}>No se encontraron registros.</div>
                ) : (
                  barcosFiltrados.map(b => (
                    <div key={b.id} style={S.card} className="glass-card" onClick={() => centrarMapa(b.latitud, b.longitud)}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                        <div style={{ fontSize: 16, color: "#fff", fontWeight: 700, letterSpacing: 0.5 }}>{b.nombre_barco}</div>
                        <button 
                          onClick={(e) => eliminarBarco(e, b.id, b.nombre_barco)}
                          style={{ background: "transparent", border: "none", color: C.t2, cursor: "pointer", fontSize: 18, transition: "color 0.2s", padding: "0 4px" }}
                          onMouseEnter={(e) => e.target.style.color = "#ff4a4a"} onMouseLeave={(e) => e.target.style.color = C.t2} title="Eliminar registro"
                        >✕</button>
                      </div>
                      <div style={{ fontSize: 12, color: "#ccc", marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{opacity: 0.6}}>👤</span> {b.propietario || "Sin dueño asignado"}
                      </div>
                      <div style={{ fontSize: 12, color: C.t1, marginBottom: 18, display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{opacity: 0.6}}>📍</span> {b.ubicacion_general} {b.detalle_ubicacion ? `— ${b.detalle_ubicacion}` : ""}
                      </div>
                      <div style={{ display: "flex", gap: 10 }}>
                        <button style={S.btnGhost} className="btn-hover" onClick={(e) => { e.stopPropagation(); centrarMapa(b.latitud, b.longitud); }}>Centrar</button>
                        <button style={S.btnGhost} className="btn-wsp" onClick={(e) => compartirWhatsApp(e, b)}>WhatsApp Técnico</button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── 3. MODAL DE REGISTRO ── */}
      {showModal && (
        <div style={S.modalOverlay} onClick={(e) => e.target === e.currentTarget && setShowModal(false)}>
          <div style={S.modalBox}>
            <div style={{ fontSize: 20, color: "#fff", fontWeight: 700, marginBottom: 24, letterSpacing: 0.5 }}>Registrar Embarcación</div>
            
            {/* OPCIONES DE UBICACIÓN */}
            <div style={S.badgeUrl}>
              <label style={{ ...S.label, color: "#80a8ff" }}>📌 Opción 1: Pegar ubicación de Google Maps</label>
              <input 
                style={{ ...S.input, marginBottom: 6, background: "rgba(0,0,0,0.4)", borderColor: "rgba(50,100,255,0.4)", color: "#80a8ff" }} 
                placeholder="Pegá un link o coordenadas acá (Ej: -34.41, -58.58)" 
                value={form.link_maps} 
                onChange={handleMapsInput} 
              />
              {form.link_maps && !form.latitud && (
                <div style={{ fontSize: 11, color: "#ff8c8c" }}>❌ Formato no reconocido. Asegurate de copiar las coordenadas o usar el link largo.</div>
              )}
            </div>

            <div style={{ textAlign: "center", color: "#666", fontSize: 11, fontWeight: 700, letterSpacing: 1, marginBottom: 16 }}>
              — O SI NO TENÉS EL LINK —
            </div>

            <button type="button" style={S.btnSelectMap} className="btn-map-hover" onClick={() => { setShowModal(false); setIsSelecting(true); }}>
              📍 Opción 2: Elegir a ojo en el mapa
            </button>

            <form onSubmit={registrarBarco}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div><label style={S.label}>Embarcación *</label><input required style={S.input} placeholder="Ej: K37 Margarita" value={form.nombre_barco} onChange={e => setForm({...form, nombre_barco: e.target.value})} autoFocus /></div>
                <div><label style={S.label}>Propietario</label><input style={S.input} placeholder="Nombre completo" value={form.propietario} onChange={e => setForm({...form, propietario: e.target.value})} /></div>
              </div>
              
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div><label style={S.label}>Lugar general *</label><input required style={S.input} placeholder="Ej: Marina del Norte" value={form.ubicacion_general} onChange={e => setForm({...form, ubicacion_general: e.target.value})} /></div>
                <div><label style={S.label}>Detalle libre (Amarras, Lotes)</label><input style={S.input} placeholder="Ej: Lote 45 / Galpón 3" value={form.detalle_ubicacion} onChange={e => setForm({...form, detalle_ubicacion: e.target.value})} /></div>
              </div>

              {/* Campos de lat/lng ocultos a menos que haya datos */}
              <div style={{ display: form.latitud ? "grid" : "none", gridTemplateColumns: "1fr 1fr", gap: 16, background: "rgba(50,215,75,0.05)", border: "1px solid rgba(50,215,75,0.2)", padding: 12, borderRadius: 8, marginBottom: 16 }}>
                <div><label style={{...S.label, color: "#32d74b", marginBottom: 2}}>Latitud capturada</label><input required style={{...S.input, marginBottom: 0, background: "transparent", border: "none", padding: 0, color: "#aaa"}} value={form.latitud} readOnly /></div>
                <div><label style={{...S.label, color: "#32d74b", marginBottom: 2}}>Longitud capturada</label><input required style={{...S.input, marginBottom: 0, background: "transparent", border: "none", padding: 0, color: "#aaa"}} value={form.longitud} readOnly /></div>
              </div>

              <div style={{ display: "flex", gap: 12 }}>
                <button type="submit" style={{ ...S.btnPrimary, flex: 1, padding: "14px", fontSize: 14 }}>Guardar Registro</button>
                <button type="button" onClick={() => setShowModal(false)} style={{ background: "transparent", color: C.t0, padding: "14px", borderRadius: 8, border: `1px solid ${C.b1}`, flex: 1, cursor: "pointer", fontWeight: 600 }}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}