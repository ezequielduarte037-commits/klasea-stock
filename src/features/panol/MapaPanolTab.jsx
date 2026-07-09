import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Ban, ChevronRight, Layers, MapPin, Move, Package, PackageOpen, Search, Warehouse, X } from "lucide-react";
import { C } from "@/theme";
import { supabase } from "@/supabaseClient";
import { parseUbicacion } from "./ubicacionUtils";
import { fmtDate, rowIsAnulado, rowMovementAt } from "@/features/panol/panolMovimientos";

// Mapa digital del pañol (Chubut 2120) — plano a escala real (1965×950 cm).
// Buscás un producto y se ilumina la estantería donde vive; click → ficha con la
// vista frontal (estantes con alturas reales) y los productos por estante.
// Los productos con ubicacion = 'AFUERA' se listan como "Afuera del pañol".

const ROOM_W = 1965;
const ROOM_H = 950;
const WALL = 28;
const VIEWBOX = { x: -20, y: -54, w: ROOM_W + 40, h: ROOM_H + 128 };

// Plano físico original: 950 x 1965 cm, rotado 90 grados antihorario para usarlo
// cómodo en pantalla. Estas coordenadas son la fuente de verdad visual para las
// estanterías conocidas; la tabla conserva dimensiones/niveles/productos.
const REFERENCE_LAYOUT = {
  J3: { x_cm: 1828, y_cm: 38, w_cm: 90, h_cm: 292 },
  J2: { x_cm: 1828, y_cm: 330, w_cm: 90, h_cm: 292 },
  J1: { x_cm: 1828, y_cm: 622, w_cm: 90, h_cm: 292 },
  K1: { x_cm: 1334, y_cm: 38, w_cm: 494, h_cm: 44 },
  P1: { x_cm: 95, y_cm: 40, w_cm: 307, h_cm: 52 },
  A3: { x_cm: 22, y_cm: 40, w_cm: 73, h_cm: 289 },
  A2: { x_cm: 22, y_cm: 329, w_cm: 73, h_cm: 334 },
  A1: { x_cm: 22, y_cm: 663, w_cm: 73, h_cm: 252 },
  B2: { x_cm: 255, y_cm: 146, w_cm: 72, h_cm: 536 },
  B1: { x_cm: 184, y_cm: 146, w_cm: 72, h_cm: 476 },
  C4: { x_cm: 473, y_cm: 94, w_cm: 75, h_cm: 49 },
  C2: { x_cm: 473, y_cm: 146, w_cm: 75, h_cm: 536 },
  C1: { x_cm: 402, y_cm: 146, w_cm: 72, h_cm: 536 },
  C3: { x_cm: 473, y_cm: 683, w_cm: 75, h_cm: 56 },
  D4: { x_cm: 694, y_cm: 94, w_cm: 73, h_cm: 49 },
  D2: { x_cm: 694, y_cm: 146, w_cm: 73, h_cm: 536 },
  D1: { x_cm: 621, y_cm: 146, w_cm: 73, h_cm: 536 },
  D3: { x_cm: 694, y_cm: 683, w_cm: 73, h_cm: 56 },
  F2: { x_cm: 990, y_cm: 146, w_cm: 76, h_cm: 536 },
  F1: { x_cm: 841, y_cm: 146, w_cm: 78, h_cm: 536 },
  G1: { x_cm: 1141, y_cm: 146, w_cm: 154, h_cm: 340 },
  G3: { x_cm: 1219, y_cm: 486, w_cm: 76, h_cm: 100 },
  G5: { x_cm: 1219, y_cm: 585, w_cm: 76, h_cm: 96 },
  G2: { x_cm: 1141, y_cm: 486, w_cm: 78, h_cm: 100 },
  G4: { x_cm: 1141, y_cm: 585, w_cm: 78, h_cm: 96 },
  G6: { x_cm: 1141, y_cm: 683, w_cm: 154, h_cm: 56 },
  H2: { x_cm: 1450, y_cm: 146, w_cm: 78, h_cm: 159 },
  H4: { x_cm: 1450, y_cm: 305, w_cm: 78, h_cm: 116 },
  H6: { x_cm: 1450, y_cm: 422, w_cm: 78, h_cm: 127 },
  H8: { x_cm: 1450, y_cm: 549, w_cm: 78, h_cm: 133 },
  H1: { x_cm: 1370, y_cm: 146, w_cm: 79, h_cm: 159 },
  H3: { x_cm: 1370, y_cm: 305, w_cm: 79, h_cm: 116 },
  H5: { x_cm: 1370, y_cm: 422, w_cm: 79, h_cm: 127 },
  H7: { x_cm: 1370, y_cm: 549, w_cm: 79, h_cm: 133 },
  H9: { x_cm: 1370, y_cm: 683, w_cm: 157, h_cm: 56 },
  I2: { x_cm: 1604, y_cm: 95, w_cm: 83, h_cm: 44 },
  I1: { x_cm: 1604, y_cm: 146, w_cm: 83, h_cm: 536 },
  E2: { x_cm: 1683, y_cm: 576, w_cm: 53, h_cm: 106 },
  E1: { x_cm: 1679, y_cm: 874, w_cm: 148, h_cm: 40 },
  V3: { x_cm: 645, y_cm: 768, w_cm: 123, h_cm: 44 },
  V2: { x_cm: 645, y_cm: 812, w_cm: 123, h_cm: 44 },
  V5: { x_cm: 520, y_cm: 768, w_cm: 125, h_cm: 44 },
  V4: { x_cm: 520, y_cm: 812, w_cm: 125, h_cm: 44 },
  V7: { x_cm: 402, y_cm: 768, w_cm: 118, h_cm: 44 },
  V6: { x_cm: 402, y_cm: 812, w_cm: 118, h_cm: 44 },
  V8: { x_cm: 333, y_cm: 775, w_cm: 61, h_cm: 78 },
  V1: { x_cm: 768, y_cm: 873, w_cm: 151, h_cm: 40 },
};

function applyReferenceLayout(rows = []) {
  return rows.map((row) => {
    const code = String(row.codigo || "").trim().toUpperCase();
    const layout = REFERENCE_LAYOUT[code];
    return layout ? { ...row, ...layout, codigo: code } : row;
  });
}

function normText(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Paleta sobria y armónica para el plano (más apagada que ZONA_COLORS, que se
// usa en los chips). Mantiene la distinción por zona pero con tono calmo, tipo
// plano técnico. Solo local al mapa.
const MAPA_ZONA_COLOR = {
  A: "#5b7aa8", B: "#8478ab", C: "#4f9aa2", D: "#5fa384", E: "#c09a52",
  F: "#b8748f", G: "#87a05c", H: "#bd8757", I: "#579c93", J: "#7377b4",
  K: "#9776ad", P: "#bd7373", V: "#b0a057",
};
function mapaColor(codigo) {
  return MAPA_ZONA_COLOR[String(codigo || "").charAt(0).toUpperCase()] || "#7c8798";
}

function KpiChip({ icon, label, value, color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, border: `1px solid ${C.border}`, background: C.panelSolid, borderRadius: 13, padding: "9px 13px", boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
      <div style={{ width: 30, height: 30, borderRadius: 9, display: "grid", placeItems: "center", background: `${color}18`, border: `1px solid ${color}44`, color, flexShrink: 0 }}>
        {icon}
      </div>
      <div>
        <div style={{ fontFamily: C.mono, fontSize: 16, fontWeight: 950, color: C.text, lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 10, color: C.dim, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.7 }}>{label}</div>
      </div>
    </div>
  );
}

export default function MapaPanolTab({ isMobile = false, toast, canEdit = false }) {
  const [estanterias, setEstanterias] = useState([]);
  const [materiales, setMateriales] = useState([]);
  const [totalCatalogo, setTotalCatalogo] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState(null);
  const [q, setQ] = useState("");
  const [zonaFiltro, setZonaFiltro] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [detalleMat, setDetalleMat] = useState(null); // Nuevo estado para el modal
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 }); // zoom + pan del plano
  const [hover, setHover] = useState(null); // ficha flotante: { codigo, x, y }
  const [iso, setIso] = useState(false); // vista 3D isométrica (bloques extruidos)
  const svgRef = useRef(null);
  const dragRef = useRef(null);
  const panRef = useRef(null);
  const wrapRef = useRef(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [estRes, matRes, totRes] = await Promise.all([
        supabase.from("panol_estanterias").select("*").eq("activo", true).order("codigo"),
        supabase.from("panol_materiales").select("id, descripcion, ubicacion, ubicacion_obs, codigo").not("ubicacion", "is", null).eq("activo", true),
        supabase.from("panol_materiales").select("id", { count: "exact", head: true }).eq("activo", true),
      ]);
      if (estRes.error) throw estRes.error;
      setEstanterias(applyReferenceLayout(estRes.data ?? []));
      setMateriales(matRes.data ?? []);
      setTotalCatalogo(totRes.count ?? 0);
    } catch (e) {
      toast?.error(e.message?.includes("panol_estanterias") ? "Falta correr el SQL del mapa del pañol." : (e.message || "No se pudo cargar el mapa."));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { cargar(); }, [cargar]);

  const matsPorEstanteria = useMemo(() => {
    const map = new Map();
    for (const m of materiales) {
      const { cod, afuera } = parseUbicacion(m.ubicacion);
      if (!cod || afuera) continue;
      if (!map.has(cod)) map.set(cod, []);
      map.get(cod).push(m);
    }
    return map;
  }, [materiales]);

  // Máximo de ítems en una estantería → para normalizar el heat-glow (el pañol
  // se "enciende" más fuerte donde hay más stock).
  const maxMats = useMemo(() => Math.max(1, ...[...matsPorEstanteria.values()].map((a) => a.length)), [matsPorEstanteria]);

  const afuera = useMemo(() => materiales.filter((m) => parseUbicacion(m.ubicacion).afuera), [materiales]);

  // En 3D los bloques se pintan de fondo hacia frente (norte→sur) para que la
  // extrusión del de adelante tape al de atrás (painter's algorithm).
  const shelvesToRender = useMemo(
    () => (iso ? [...estanterias].sort((a, b) => (a.y_cm - b.y_cm) || (a.x_cm - b.x_cm)) : estanterias),
    [estanterias, iso],
  );

  const zonas = useMemo(() => {
    const set = new Map();
    for (const est of estanterias) {
      const z = String(est.codigo).charAt(0).toUpperCase();
      if (!set.has(z)) set.set(z, 0);
      set.set(z, set.get(z) + (matsPorEstanteria.get(est.codigo)?.length || 0));
    }
    return [...set.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [estanterias, matsPorEstanteria]);

  const highlighted = useMemo(() => {
    const term = normText(q).trim();
    const set = new Set();
    if (zonaFiltro) {
      for (const est of estanterias) if (String(est.codigo).charAt(0).toUpperCase() === zonaFiltro) set.add(est.codigo);
    }
    if (term) {
      for (const est of estanterias) if (normText(est.codigo).includes(term)) set.add(est.codigo);
      for (const m of materiales) {
        if (normText(m.descripcion).includes(term)) {
          const { cod, afuera: isAfuera } = parseUbicacion(m.ubicacion);
          if (cod && !isAfuera) set.add(cod);
        }
      }
    }
    return (term || zonaFiltro) ? set : null;
  }, [q, zonaFiltro, estanterias, materiales]);

  const selEst = useMemo(() => estanterias.find((e) => e.codigo === sel) || null, [estanterias, sel]);
  const selMats = useMemo(() => (sel ? matsPorEstanteria.get(String(sel).toUpperCase()) || [] : []), [sel, matsPorEstanteria]);

  // ── Coordenadas ──
  // svgPoint → coords en el viewBox (sin transform). worldPoint → coords reales
  // del plano descontando el zoom/pan (el transform vive en el <g> interno).
  function svgPoint(evt) {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    return {
      x: ((evt.clientX - rect.left) / rect.width) * VIEWBOX.w + VIEWBOX.x,
      y: ((evt.clientY - rect.top) / rect.height) * VIEWBOX.h + VIEWBOX.y,
    };
  }
  function worldPoint(evt) {
    const p = svgPoint(evt);
    if (!p) return null;
    return { x: (p.x - view.tx) / view.scale, y: (p.y - view.ty) / view.scale };
  }

  // Zoom con la rueda (listener nativo no-pasivo para poder frenar el scroll).
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheelNative = (evt) => {
      evt.preventDefault();
      const rect = svg.getBoundingClientRect();
      const px = ((evt.clientX - rect.left) / rect.width) * VIEWBOX.w + VIEWBOX.x;
      const py = ((evt.clientY - rect.top) / rect.height) * VIEWBOX.h + VIEWBOX.y;
      setView((v) => {
        const factor = evt.deltaY < 0 ? 1.15 : 1 / 1.15;
        const scale = Math.max(1, Math.min(6, v.scale * factor));
        if (scale === 1) return { scale: 1, tx: 0, ty: 0 };
        const worldX = (px - v.tx) / v.scale;
        const worldY = (py - v.ty) / v.scale;
        return { scale, tx: px - worldX * scale, ty: py - worldY * scale };
      });
    };
    svg.addEventListener("wheel", onWheelNative, { passive: false });
    return () => svg.removeEventListener("wheel", onWheelNative);
  }, []);

  function zoomBy(factor) {
    setView((v) => {
      const scale = Math.max(1, Math.min(6, v.scale * factor));
      if (scale === 1) return { scale: 1, tx: 0, ty: 0 };
      // zoom hacia el centro del viewBox
      const cx = VIEWBOX.x + VIEWBOX.w / 2;
      const cy = VIEWBOX.y + VIEWBOX.h / 2;
      const worldX = (cx - v.tx) / v.scale;
      const worldY = (cy - v.ty) / v.scale;
      return { scale, tx: cx - worldX * scale, ty: cy - worldY * scale };
    });
  }

  // ── Pan (arrastrar el plano por el fondo) ──
  function onPanStart(evt) {
    if (editMode) return; // en edición el arrastre mueve estanterías, no paneás
    const p = svgPoint(evt);
    if (!p) return;
    panRef.current = { startX: p.x, startY: p.y, startTx: view.tx, startTy: view.ty };
    setHover(null);
    evt.currentTarget.setPointerCapture?.(evt.pointerId);
  }

  // ── Drag (modo edición) ──
  function onPointerDown(evt, est) {
    if (!editMode) { setSel(est.codigo === sel ? null : est.codigo); return; }
    const p = worldPoint(evt);
    if (!p) return;
    dragRef.current = { codigo: est.codigo, offX: p.x - est.x_cm, offY: p.y - est.y_cm, moved: false };
    evt.target.setPointerCapture?.(evt.pointerId);
  }

  function onPointerMove(evt) {
    const pan = panRef.current;
    if (pan) {
      const p = svgPoint(evt);
      if (!p) return;
      setView((v) => ({ ...v, tx: pan.startTx + (p.x - pan.startX), ty: pan.startTy + (p.y - pan.startY) }));
      return;
    }
    const drag = dragRef.current;
    if (!drag) return;
    const p = worldPoint(evt);
    if (!p) return;
    drag.moved = true;
    setEstanterias((prev) => prev.map((e) => e.codigo === drag.codigo
      ? { ...e, x_cm: Math.round(Math.max(0, Math.min(ROOM_W - e.w_cm, p.x - drag.offX))), y_cm: Math.round(Math.max(0, Math.min(ROOM_H - e.h_cm, p.y - drag.offY))) }
      : e));
  }

  async function onPointerUp() {
    if (panRef.current) { panRef.current = null; return; }
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag?.moved) return;
    const est = estanterias.find((e) => e.codigo === drag.codigo);
    if (!est) return;
    const { error } = await supabase.from("panol_estanterias").update({ x_cm: est.x_cm, y_cm: est.y_cm, updated_at: new Date().toISOString() }).eq("codigo", est.codigo);
    if (error) toast?.error("No se pudo guardar la posición.");
  }

  function onShelfHover(evt, est) {
    if (editMode || panRef.current) return;
    const wrap = wrapRef.current;
    if (!wrap) return;
    const r = wrap.getBoundingClientRect();
    setHover({ codigo: est.codigo, x: evt.clientX - r.left, y: evt.clientY - r.top });
  }

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
      <style>{`
        @keyframes mapaPulse { 0%,100% { stroke-opacity: 1; } 50% { stroke-opacity: 0.35; } }
        .mapa-hit rect:first-of-type { animation: mapaPulse 1.2s ease-in-out infinite; }
        .mapa-est { transition: opacity .18s ease; }
        .mapa-est:hover rect:first-of-type { filter: brightness(1.25); }
      `}</style>
      <div style={{ padding: "14px 18px 34px", maxWidth: 1680, margin: "0 auto", display: "grid", gap: 12 }}>

        {/* ── KPIs ── */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, minmax(0,1fr))", gap: 10 }}>
          <KpiChip icon={<Warehouse size={15} />} label="Estanterías" value={estanterias.length} color={C.blue} />
          <KpiChip icon={<MapPin size={15} />} label="Productos ubicados" value={materiales.length - afuera.length} color={C.green} />
          <KpiChip icon={<PackageOpen size={15} />} label="Afuera del pañol" value={afuera.length} color={C.amber} />
          <KpiChip icon={<Layers size={15} />} label="Sin ubicar" value={Math.max(0, totalCatalogo - materiales.length)} color={C.dim} />
        </div>

        {/* ── Controles ── */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: "1 1 280px" }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.dim }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar producto o estantería (ej. abrazadera, G2)..." style={{ width: "100%", boxSizing: "border-box", background: C.panelSolid, border: `1px solid ${C.border}`, color: C.text, padding: "9px 30px 9px 32px", borderRadius: 10, fontSize: 13, fontFamily: C.sans, outline: "none" }} />
            {q && <button type="button" onClick={() => setQ("")} style={{ position: "absolute", right: 7, top: "50%", transform: "translateY(-50%)", border: "none", background: "transparent", color: C.dim, cursor: "pointer", padding: 3, display: "grid", placeItems: "center" }}><X size={13} /></button>}
          </div>
          <button type="button" onClick={() => setIso((v) => !v)} style={{ display: "flex", alignItems: "center", gap: 6, border: `1px solid ${iso ? C.blueB : C.border}`, background: iso ? C.blueL : C.panelSolid, color: iso ? C.blue : C.text, borderRadius: 10, padding: "8px 12px", cursor: "pointer", fontSize: 12.5, fontWeight: 800, fontFamily: C.sans }}>
            <Layers size={14} /> {iso ? "Vista 3D" : "Vista 2D"}
          </button>
          {canEdit && (
            <button type="button" onClick={() => setEditMode(!editMode)} style={{ display: "flex", alignItems: "center", gap: 6, border: `1px solid ${editMode ? C.blueB : C.border}`, background: editMode ? C.blueL : C.panelSolid, color: editMode ? C.blue : C.text, borderRadius: 10, padding: "8px 12px", cursor: "pointer", fontSize: 12.5, fontWeight: 800, fontFamily: C.sans }}>
              <Move size={14} /> {editMode ? "Editando · arrastrá" : "Editar plano"}
            </button>
          )}
        </div>

        {/* ── Leyenda de zonas ── */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {zonas.map(([z, count]) => {
            const color = MAPA_ZONA_COLOR[z] || "#7c8798";
            const active = zonaFiltro === z;
            return (
              <button key={z} type="button" onClick={() => setZonaFiltro(active ? "" : z)}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${active ? color : C.border}`, background: active ? `${color}1c` : C.panelSolid, color: active ? color : C.text, borderRadius: 999, padding: "4px 11px", cursor: "pointer", fontSize: 11.5, fontWeight: 850, fontFamily: C.sans }}>
                <span style={{ width: 9, height: 9, borderRadius: 3, background: color, display: "inline-block" }} />
                {z}{count > 0 ? ` · ${count}` : ""}
              </button>
            );
          })}
          {(zonaFiltro || q) && (
            <button type="button" onClick={() => { setZonaFiltro(""); setQ(""); }} style={{ border: "none", background: "transparent", color: C.dim, cursor: "pointer", fontSize: 11.5, fontWeight: 750, fontFamily: C.sans, textDecoration: "underline" }}>Limpiar</button>
          )}
        </div>

        {/* ── Plano + panel ── */}
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: isMobile || !selEst ? "1fr" : "minmax(0, 1fr) 320px", alignItems: "start" }}>
          <div style={{ display: "grid", gap: 10, minWidth: 0 }}>
            {loading ? (
              <div style={{ padding: 50, textAlign: "center", color: C.dim, fontSize: 13 }}>Cargando el plano...</div>
            ) : !estanterias.length ? (
              <div style={{ padding: "40px 20px", textAlign: "center", color: C.dim, border: `1px dashed ${C.border}`, borderRadius: 14, fontSize: 13 }}>
                No hay estanterías cargadas. Corré el SQL del mapa del pañol y recargá.
              </div>
            ) : (
              <div ref={wrapRef} style={{ position: "relative", border: `1px solid ${C.border}`, background: C.panelSolid, borderRadius: 18, padding: 12, overflow: "hidden", boxShadow: "0 14px 40px -24px rgba(0,0,0,0.35)" }}>
                <svg ref={svgRef} viewBox={`${VIEWBOX.x} ${VIEWBOX.y} ${VIEWBOX.w} ${VIEWBOX.h}`} style={{ width: "100%", height: "auto", display: "block", touchAction: "none", cursor: editMode ? "default" : panRef.current ? "grabbing" : view.scale > 1 ? "grab" : "default" }}
                  onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp}>
                  <defs>
                    <pattern id="mapaGrid" width={100} height={100} patternUnits="userSpaceOnUse">
                      <path d="M 100 0 L 0 0 0 100" fill="none" stroke="var(--grid-line)" strokeWidth={1.5} />
                    </pattern>
                    <pattern id="mapaSpeckle" width={26} height={26} patternUnits="userSpaceOnUse">
                      <circle cx={4} cy={6} r={1} fill="rgba(100,116,139,0.10)" />
                      <circle cx={18} cy={16} r={1} fill="rgba(100,116,139,0.07)" />
                      <circle cx={12} cy={22} r={0.8} fill="rgba(100,116,139,0.06)" />
                    </pattern>
                    <linearGradient id="mapaFloor" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="rgba(148,163,184,0.06)" />
                      <stop offset="100%" stopColor="rgba(148,163,184,0.015)" />
                    </linearGradient>
                    <radialGradient id="mapaVign" cx="50%" cy="44%" r="72%">
                      <stop offset="55%" stopColor="rgba(15,23,42,0)" />
                      <stop offset="100%" stopColor="rgba(15,23,42,0.09)" />
                    </radialGradient>
                    <filter id="mapaShadow" x="-30%" y="-30%" width="160%" height="160%">
                      <feDropShadow dx="0" dy="5" stdDeviation="7" floodColor="#000" floodOpacity="0.22" />
                    </filter>
                    <filter id="mapaShadowSoft" x="-20%" y="-20%" width="140%" height="140%">
                      <feDropShadow dx="0" dy="2.5" stdDeviation="3" floodColor="#0f172a" floodOpacity="0.14" />
                    </filter>
                    <filter id="mapaGlow" x="-60%" y="-60%" width="220%" height="220%">
                      <feGaussianBlur stdDeviation="11" />
                    </filter>
                  </defs>

                  {/* Capa que captura el arrastre para panear (detrás de todo) */}
                  <rect x={VIEWBOX.x} y={VIEWBOX.y} width={VIEWBOX.w} height={VIEWBOX.h} fill="transparent" onPointerDown={onPanStart} />

                  {/* Todo el plano vive dentro de este grupo → se aplica zoom + pan */}
                  <g transform={`translate(${view.tx} ${view.ty}) scale(${view.scale})`}>
                  {/* Piso — hormigón: base + grilla + moteado + viñeta (decorativo, sin eventos) */}
                  <g style={{ pointerEvents: "none" }}>
                    <rect x={0} y={0} width={ROOM_W} height={ROOM_H} fill="url(#mapaFloor)" rx={8} />
                    <rect x={0} y={0} width={ROOM_W} height={ROOM_H} fill="url(#mapaGrid)" rx={8} />
                    <rect x={0} y={0} width={ROOM_W} height={ROOM_H} fill="url(#mapaSpeckle)" rx={8} />
                    <rect x={0} y={0} width={ROOM_W} height={ROOM_H} fill="url(#mapaVign)" rx={8} />
                  </g>

                  <g style={{ pointerEvents: "none" }}>
                    <rect x={0} y={0} width={ROOM_W} height={WALL} fill="#cbd5e1" rx={8} />
                    <rect x={0} y={0} width={WALL} height={ROOM_H} fill="#cbd5e1" rx={8} />
                    <rect x={ROOM_W - WALL} y={0} width={WALL} height={ROOM_H} fill="#cbd5e1" rx={8} />
                    <rect x={0} y={ROOM_H - WALL} width={95} height={WALL} fill="#cbd5e1" rx={8} />
                    <rect x={402} y={ROOM_H - WALL} width={71} height={WALL} fill="#cbd5e1" />
                    <rect x={694} y={ROOM_H - WALL} width={834} height={WALL} fill="#cbd5e1" />
                    <rect x={1828} y={ROOM_H - WALL} width={ROOM_W - 1828} height={WALL} fill="#cbd5e1" rx={8} />
                    <rect x={WALL} y={WALL} width={ROOM_W - WALL * 2} height={ROOM_H - WALL * 2} fill="none" stroke="rgba(15,23,42,0.11)" strokeWidth={2} rx={2} />
                  </g>

                  {/* Aberturas — el plano real es vertical (950×1965); rotado 90° antihorario,
                      las puertas y ventanas del lateral derecho caen en el BORDE INFERIOR */}
                  <g style={{ pointerEvents: "none" }}>
                    {/* PUERTA izquierda — umbral que ocupa el hueco del muro + jambas */}
                    <rect x={105} y={ROOM_H - WALL} width={285} height={WALL} fill={C.amber} fillOpacity={0.2} />
                    <rect x={105} y={ROOM_H - WALL} width={285} height={3.5} fill={C.amber} />
                    <rect x={102} y={ROOM_H - WALL} width={6} height={WALL} fill="#cbd5e1" />
                    <rect x={387} y={ROOM_H - WALL} width={6} height={WALL} fill="#cbd5e1" />
                    <text x={247.5} y={ROOM_H + 34} textAnchor="middle" fontSize={22} fill={C.dim} fontFamily={C.sans} fontWeight={700}>PUERTA</text>
                    {/* VENTANA — doble línea (vidrio) en el espesor del muro */}
                    <rect x={485} y={ROOM_H - WALL} width={195} height={WALL} fill="#38bdf8" fillOpacity={0.16} />
                    <line x1={485} y1={ROOM_H - WALL * 0.62} x2={680} y2={ROOM_H - WALL * 0.62} stroke="#38bdf8" strokeWidth={2.5} />
                    <line x1={485} y1={ROOM_H - WALL * 0.38} x2={680} y2={ROOM_H - WALL * 0.38} stroke="#38bdf8" strokeWidth={2.5} />
                    <rect x={482} y={ROOM_H - WALL} width={6} height={WALL} fill="#cbd5e1" />
                    <rect x={677} y={ROOM_H - WALL} width={6} height={WALL} fill="#cbd5e1" />
                    <text x={582.5} y={ROOM_H + 34} textAnchor="middle" fontSize={22} fill={C.dim} fontFamily={C.sans} fontWeight={700}>VENTANA</text>
                    {/* PUERTA derecha — umbral + jambas + arco de barrido */}
                    <rect x={1542} y={ROOM_H - WALL} width={275} height={WALL} fill={C.amber} fillOpacity={0.2} />
                    <rect x={1542} y={ROOM_H - WALL} width={275} height={3.5} fill={C.amber} />
                    <rect x={1539} y={ROOM_H - WALL} width={6} height={WALL} fill="#cbd5e1" />
                    <rect x={1814} y={ROOM_H - WALL} width={6} height={WALL} fill="#cbd5e1" />
                    <path d={`M 1542 ${ROOM_H - WALL} A 205 205 0 0 1 1747 ${ROOM_H - WALL - 205}`} fill="none" stroke={C.amber} strokeWidth={2.5} strokeDasharray="12 10" opacity={0.4} />
                    <text x={1679.5} y={ROOM_H + 34} textAnchor="middle" fontSize={22} fill={C.dim} fontFamily={C.sans} fontWeight={700}>PUERTA</text>
                  </g>

                  {/* Estanterías */}
                  {shelvesToRender.map((est) => {
                    const color = mapaColor(est.codigo);
                    const isSel = sel === est.codigo;
                    const isHit = highlighted?.has(est.codigo);
                    const dim = highlighted && !isHit;
                    const nMats = (matsPorEstanteria.get(String(est.codigo).toUpperCase()) || []).length;
                    const small = est.w_cm < 75 && est.h_cm < 105;
                    // Extrusión 3D: altura del bloque según alto real, desplazamiento oblicuo (cavalier).
                    // Tope acotado para que los bloques altos no se salgan por arriba del viewBox.
                    const H = iso ? Math.max(24, Math.min(78, (est.alto_cm || 150) * 0.34)) : 0;
                    const tx = H * 0.5;
                    const ty = -H * 0.85;
                    const X = est.x_cm, Y = est.y_cm, W = est.w_cm, Hh = est.h_cm;
                    return (
                      <g key={est.codigo} className={`mapa-est${isHit ? " mapa-hit" : ""}`} onPointerDown={(e) => onPointerDown(e, est)} onMouseMove={(e) => onShelfHover(e, est)} onMouseLeave={() => setHover(null)} style={{ cursor: editMode ? "grab" : "pointer" }} opacity={dim ? 0.18 : 1} filter={isSel || isHit ? "url(#mapaShadow)" : "url(#mapaShadowSoft)"}>
                        {/* Caras extruidas (3D): lateral izquierda + frontal, con sombreado */}
                        {iso && (
                          <g style={{ pointerEvents: "none" }}>
                            <polygon points={`${X},${Y} ${X},${Y + Hh} ${X + tx},${Y + Hh + ty} ${X + tx},${Y + ty}`} fill={color} fillOpacity={nMats > 0 ? 0.85 : 0.5} />
                            <polygon points={`${X},${Y} ${X},${Y + Hh} ${X + tx},${Y + Hh + ty} ${X + tx},${Y + ty}`} fill="#0f172a" fillOpacity={0.3} />
                            <polygon points={`${X},${Y + Hh} ${X + W},${Y + Hh} ${X + W + tx},${Y + Hh + ty} ${X + tx},${Y + Hh + ty}`} fill={color} fillOpacity={nMats > 0 ? 0.72 : 0.42} />
                            <polygon points={`${X},${Y + Hh} ${X + W},${Y + Hh} ${X + W + tx},${Y + Hh + ty} ${X + tx},${Y + Hh + ty}`} fill="#0f172a" fillOpacity={0.14} />
                          </g>
                        )}
                        <g transform={iso ? `translate(${tx} ${ty})` : undefined}>
                        {/* Heat-glow: aura de color detrás, más fuerte cuanto más stock */}
                        {nMats > 0 && !isHit && (
                          <rect x={est.x_cm} y={est.y_cm} width={est.w_cm} height={est.h_cm} rx={9}
                            fill={color} opacity={0.1 + 0.34 * (nMats / maxMats)} filter="url(#mapaGlow)" style={{ pointerEvents: "none" }} />
                        )}
                        {/* Ocupadas: fill más saturado. Vacías: apenas un tinte → se
                            distingue de un vistazo dónde hay stock. */}
                        <rect x={est.x_cm} y={est.y_cm} width={est.w_cm} height={est.h_cm} rx={7}
                          fill={isHit ? "rgba(245,158,11,0.5)" : nMats > 0 ? `${color}30` : `${color}0f`}
                          stroke={isSel ? C.blue : isHit ? "#f59e0b" : color}
                          strokeWidth={isSel ? 9 : isHit ? 8 : 3.5}
                          strokeOpacity={nMats > 0 ? 1 : 0.5} />
                        {/* Canto superior (lip) — banda más saturada arriba = profundidad física */}
                        {!isHit && (
                          <path
                            d={`M ${est.x_cm + 1} ${est.y_cm + Math.min(15, est.h_cm * 0.3)} L ${est.x_cm + 1} ${est.y_cm + 7} Q ${est.x_cm + 1} ${est.y_cm + 1} ${est.x_cm + 7} ${est.y_cm + 1} L ${est.x_cm + est.w_cm - 7} ${est.y_cm + 1} Q ${est.x_cm + est.w_cm - 1} ${est.y_cm + 1} ${est.x_cm + est.w_cm - 1} ${est.y_cm + 7} L ${est.x_cm + est.w_cm - 1} ${est.y_cm + Math.min(15, est.h_cm * 0.3)} Z`}
                            fill={color} fillOpacity={nMats > 0 ? 0.42 : 0.16} />
                        )}
                        {/* borde interior sutil (profundidad) */}
                        <rect x={est.x_cm + 6} y={est.y_cm + 6} width={Math.max(4, est.w_cm - 12)} height={Math.max(4, est.h_cm - 12)} rx={4} fill="none" stroke={color} strokeOpacity={nMats > 0 ? 0.28 : 0.12} strokeWidth={2} />
                        <text x={est.x_cm + est.w_cm / 2} y={est.y_cm + est.h_cm / 2 + (small ? 9 : 11)}
                          textAnchor="middle" fontSize={small ? 27 : 34} fontWeight={900}
                          fill={isHit ? "#92400e" : color} fillOpacity={nMats > 0 ? 1 : 0.65} fontFamily={C.sans}>{est.codigo}</text>
                        {/* Badge de cantidad tipo notificación en la esquina sup. derecha */}
                        {nMats > 0 && (() => {
                          const r = Math.max(9, Math.min(15, est.w_cm / 4, est.h_cm / 4));
                          const cx = est.x_cm + est.w_cm - r - 4;
                          const cy = est.y_cm + r + 4;
                          return (
                            <g style={{ pointerEvents: "none" }}>
                              <circle cx={cx} cy={cy} r={r} fill={isHit ? "#b45309" : color} stroke="#fff" strokeWidth={1.5} />
                              <text x={cx} y={cy + r * 0.36} textAnchor="middle" fontSize={r * 1.15} fontWeight={900} fill="#fff" fontFamily={C.sans}>{nMats}</text>
                            </g>
                          );
                        })()}
                        </g>
                      </g>
                    );
                  })}
                  </g>

                  {/* Escala (abajo izquierda) + rótulo (arriba derecha) */}
                  <g transform={`translate(20, ${ROOM_H + 30})`}>
                    <line x1={0} y1={0} x2={100} y2={0} stroke={C.dim} strokeWidth={4} />
                    <line x1={0} y1={-7} x2={0} y2={7} stroke={C.dim} strokeWidth={4} />
                    <line x1={100} y1={-7} x2={100} y2={7} stroke={C.dim} strokeWidth={4} />
                    <text x={112} y={8} fontSize={24} fill={C.dim} fontFamily={C.sans}>1 m</text>
                  </g>
                  {!iso && <text x={0} y={-20} textAnchor="start" fontSize={24} fill={C.dim} fontFamily={C.sans}>Pañol Chubut 2120 · plano rotado 90° · {(ROOM_H / 100).toFixed(2).replace(".", ",")} × {(ROOM_W / 100).toFixed(2).replace(".", ",")} m</text>}
                </svg>

                {/* Controles de zoom (overlay) */}
                <div style={{ position: "absolute", top: 20, right: 20, display: "flex", flexDirection: "column", gap: 6 }}>
                  {[["+", () => zoomBy(1.4), "Acercar"], ["−", () => zoomBy(1 / 1.4), "Alejar"]].map(([lbl, fn, ti]) => (
                    <button key={ti} type="button" title={ti} onClick={fn} style={{ width: 32, height: 32, borderRadius: 9, border: `1px solid ${C.border}`, background: C.panelSolid, color: C.text, fontSize: 18, fontWeight: 800, lineHeight: 1, cursor: "pointer", display: "grid", placeItems: "center", boxShadow: "0 2px 6px rgba(0,0,0,0.08)" }}>{lbl}</button>
                  ))}
                  {view.scale > 1.01 && (
                    <button type="button" title="Restablecer vista" onClick={() => setView({ scale: 1, tx: 0, ty: 0 })} style={{ width: 32, height: 32, borderRadius: 9, border: `1px solid ${C.blueB}`, background: C.blueL, color: C.blue, cursor: "pointer", display: "grid", placeItems: "center", boxShadow: "0 2px 6px rgba(0,0,0,0.08)" }}><Move size={15} /></button>
                  )}
                </div>

                {/* Ficha flotante al hover */}
                {hover && !editMode && (() => {
                  const est = estanterias.find((e) => e.codigo === hover.codigo);
                  if (!est) return null;
                  const mats = matsPorEstanteria.get(String(hover.codigo).toUpperCase()) || [];
                  const color = mapaColor(hover.codigo);
                  const cardW = 232;
                  const wrapW = wrapRef.current?.clientWidth || 900;
                  const wrapH = wrapRef.current?.clientHeight || 600;
                  const left = Math.max(8, Math.min(hover.x + 16, wrapW - cardW - 8));
                  const top = Math.max(8, Math.min(hover.y + 16, wrapH - 168));
                  return (
                    <div style={{ position: "absolute", left, top, width: cardW, pointerEvents: "none", background: C.panelSolid, border: `1px solid ${color}55`, borderRadius: 13, boxShadow: "0 12px 32px -10px rgba(0,0,0,0.35)", overflow: "hidden", zIndex: 5 }}>
                      <div style={{ height: 4, background: color }} />
                      <div style={{ padding: "10px 12px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                          <span style={{ fontFamily: C.mono, fontWeight: 950, fontSize: 15, color, background: `${color}18`, border: `1px solid ${color}44`, borderRadius: 8, padding: "2px 8px" }}>{est.codigo}</span>
                          <span style={{ fontSize: 11, color: C.dim, fontFamily: C.mono }}>{est.alto_cm || "?"}×{est.largo_cm || "?"}×{est.prof_cm || "?"} cm</span>
                        </div>
                        <div style={{ fontSize: 11.5, fontWeight: 850, color: mats.length ? C.text : C.dim, marginBottom: mats.length ? 6 : 0 }}>
                          {mats.length ? `${mats.length} producto${mats.length === 1 ? "" : "s"}` : "Estantería vacía"}
                        </div>
                        {mats.slice(0, 4).map((m) => (
                          <div key={m.id} style={{ fontSize: 11.5, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.5 }}>
                            <span style={{ color, marginRight: 5 }}>•</span>{m.descripcion}
                          </div>
                        ))}
                        {mats.length > 4 && <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>+{mats.length - 4} más…</div>}
                      </div>
                    </div>
                  );
                })()}

                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "8px 6px 2px", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, color: C.dim }}>{editMode ? "Arrastrá una estantería y la posición se guarda sola." : "Tocá una estantería · rueda para zoom · arrastrá el fondo para moverte."}</span>
                  {highlighted && <span style={{ fontSize: 11, color: C.amber, fontWeight: 800 }}>{highlighted.size} estantería{highlighted.size === 1 ? "" : "s"} resaltada{highlighted.size === 1 ? "" : "s"}</span>}
                </div>
              </div>
            )}

            {/* Afuera del pañol */}
            {afuera.length > 0 && (
              <div style={{ border: `1px solid ${C.amberB}`, background: C.amberL, borderRadius: 14, padding: "11px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 7 }}>
                  <PackageOpen size={15} style={{ color: C.amber }} />
                  <span style={{ fontSize: 12.5, fontWeight: 900, color: C.text }}>Afuera del pañol ({afuera.length})</span>
                  <span style={{ fontSize: 11, color: C.dim }}>— material que vive fuera del depósito (galpón, exterior, barco)</span>
                </div>
                <div style={{ display: "grid", gap: 4, maxHeight: 180, overflowY: "auto" }}>
                  {afuera.map((m) => (
                    <div key={m.id} style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: 12.5, padding: "4px 8px", background: "rgba(255,255,255,0.35)", borderRadius: 8 }}>
                      <span style={{ color: C.text, minWidth: 0 }}>{m.descripcion}</span>
                      {m.ubicacion_obs && <span style={{ color: C.dim, fontSize: 11.5 }}>· {m.ubicacion_obs}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {selEst && <EstanteriaPanel est={selEst} mats={selMats} onClose={() => setSel(null)} onMatClick={setDetalleMat} />}
        </div>
      </div>
      {detalleMat && <MaterialDetalleModal material={detalleMat} onClose={() => setDetalleMat(null)} />}
    </div>
  );
}

// ── Ficha de estantería: vista frontal a escala + productos por estante ──
function EstanteriaPanel({ est, mats, onClose, onMatClick }) {
  const color = mapaColor(est.codigo);
  const niveles = Array.isArray(est.niveles_cm) ? est.niveles_cm : [];
  const alto = est.alto_cm || (niveles.length ? Math.max(...niveles) : 200);
  const largo = est.largo_cm || 90;
  const VW = 264;
  const scale = VW / Math.max(largo, 1);
  const VH = Math.max(90, alto * scale);
  const [filtro, setFiltro] = useState("");

  // Conteos por nivel sobre TODO el stock (la vista frontal y el resumen no
  // cambian al filtrar; el filtro solo afecta la lista de abajo).
  const nivelCount = useMemo(() => {
    const map = new Map();
    for (const m of mats) {
      const { nivel } = parseUbicacion(m.ubicacion);
      map.set(nivel || 0, (map.get(nivel || 0) || 0) + 1);
    }
    return map;
  }, [mats]);

  const filtered = useMemo(() => {
    const t = normText(filtro).trim();
    if (!t) return mats;
    return mats.filter((m) => normText(m.descripcion).includes(t) || normText(m.codigo).includes(t) || normText(m.ubicacion_obs).includes(t));
  }, [mats, filtro]);

  const matsPorNivel = useMemo(() => {
    const map = new Map();
    for (const m of filtered) {
      const { nivel } = parseUbicacion(m.ubicacion);
      const key = nivel || 0; // 0 = sin estante específico
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(m);
    }
    return map;
  }, [filtered]);

  return (
    <div style={{ border: `1px solid ${C.border}`, background: C.panelSolid, borderRadius: 16, overflow: "hidden", boxShadow: "0 14px 34px -18px rgba(0,0,0,0.4)", position: "sticky", top: 10 }}>
      <div style={{ height: 5, background: `linear-gradient(90deg, ${color}, ${color}55)` }} />
      <div style={{ padding: "13px 15px", display: "grid", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, display: "grid", placeItems: "center", background: `${color}1e`, border: `1px solid ${color}55`, color, fontWeight: 950, fontFamily: C.mono, fontSize: 15 }}>{est.codigo}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 900, color: C.text }}>Estantería {est.codigo}</div>
            <div style={{ fontSize: 11, color: C.dim, fontFamily: C.mono }}>
              {est.alto_cm || "?"} × {est.largo_cm || "?"} × {est.prof_cm || "?"} cm
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 9, border: `1px solid ${C.border}`, background: C.panel, color: C.dim, cursor: "pointer", display: "grid", placeItems: "center", transition: "all 0.15s" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = C.panelSolid; e.currentTarget.style.color = C.text; e.currentTarget.style.borderColor = color; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = C.panel; e.currentTarget.style.color = C.dim; e.currentTarget.style.borderColor = C.border; }}><X size={17} /></button>
        </div>

        {/* Resumen: chips de productos y niveles con stock */}
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: `${color}12`, border: `1px solid ${color}33`, borderRadius: 9, padding: "5px 10px" }}>
            <Package size={13} style={{ color }} />
            <span style={{ fontSize: 12.5, fontWeight: 900, color: C.text }}>{mats.length}</span>
            <span style={{ fontSize: 11, color: C.dim, fontWeight: 700 }}>{mats.length === 1 ? "producto" : "productos"}</span>
          </div>
          {nivelCount.size > 0 && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 9, padding: "5px 10px" }}>
              <Layers size={13} style={{ color: C.dim }} />
              <span style={{ fontSize: 12.5, fontWeight: 900, color: C.text }}>{nivelCount.size}</span>
              <span style={{ fontSize: 11, color: C.dim, fontWeight: 700 }}>{nivelCount.size === 1 ? "nivel" : "niveles"} con stock</span>
            </div>
          )}
        </div>

        {/* Vista frontal a escala */}
        {niveles.length > 0 && (
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 10px 6px" }}>
            <div style={{ fontSize: 10, color: C.dim, fontWeight: 850, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Vista frontal · alturas reales</div>
            <svg viewBox={`-44 -10 ${VW + 88} ${VH + 34}`} style={{ width: "100%", height: "auto", display: "block" }}>
              <rect x={0} y={0} width={VW} height={VH} rx={4} fill={`${color}14`} stroke={color} strokeWidth={2.5} />
              {niveles.map((n, i) => {
                const y = VH - n * scale;
                const count = nivelCount.get(i + 1) || 0;
                return (
                  <g key={i}>
                    <line x1={0} y1={y} x2={VW} y2={y} stroke={color} strokeWidth={2} strokeOpacity={0.75} />
                    <text x={-6} y={y + 4} textAnchor="end" fontSize={11} fontWeight={800} fill={C.dim} fontFamily={C.mono}>{i + 1}º·{n}</text>
                    {count > 0 && (
                      <g>
                        <rect x={VW + 6} y={y - 9} width={34} height={18} rx={9} fill={`${color}22`} stroke={color} strokeWidth={1.2} />
                        <text x={VW + 23} y={y + 4} textAnchor="middle" fontSize={11} fontWeight={900} fill={color} fontFamily={C.sans}>{count}</text>
                      </g>
                    )}
                  </g>
                );
              })}
              <line x1={0} y1={VH} x2={VW} y2={VH} stroke={color} strokeWidth={3.5} />
              <text x={VW / 2} y={VH + 20} textAnchor="middle" fontSize={11} fill={C.dim} fontFamily={C.mono}>{largo} cm</text>
            </svg>
          </div>
        )}

        {/* Productos por estante */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
            <span style={{ fontSize: 10, color: C.dim, fontWeight: 850, textTransform: "uppercase", letterSpacing: 1 }}>
              Productos {filtro ? `(${filtered.length}/${mats.length})` : `(${mats.length})`}
            </span>
          </div>

          {/* Buscador interno (aparece con muchos productos) */}
          {mats.length > 4 && (
            <div style={{ position: "relative", marginBottom: 8 }}>
              <Search size={13} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: C.dim }} />
              <input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Filtrar en esta estantería..." style={{ width: "100%", boxSizing: "border-box", background: C.panel, border: `1px solid ${C.border}`, color: C.text, padding: "7px 26px 7px 28px", borderRadius: 9, fontSize: 12, outline: "none", fontFamily: C.sans }} />
              {filtro && <button type="button" onClick={() => setFiltro("")} style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", border: "none", background: "transparent", color: C.dim, cursor: "pointer", padding: 2, display: "grid", placeItems: "center" }}><X size={12} /></button>}
            </div>
          )}

          {mats.length === 0 ? (
            <div style={{ fontSize: 12, color: C.dim, border: `1px dashed ${C.border}`, borderRadius: 10, padding: "12px 10px", textAlign: "center" }}>
              Sin productos asignados. Se cargan en el conteo o al recibir: ubicación <span style={{ fontFamily: C.mono, color }}>{est.codigo}-2</span> = 2º estante.
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ fontSize: 12, color: C.dim, border: `1px dashed ${C.border}`, borderRadius: 10, padding: "14px 10px", textAlign: "center" }}>
              Sin resultados para “{filtro}”.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 7, maxHeight: 420, overflowY: "auto", paddingRight: 2 }}>
              {[...matsPorNivel.entries()].sort((a, b) => b[0] - a[0]).map(([nivel, items]) => (
                <div key={nivel} style={{ display: "grid", gap: 7 }}>
                  {matsPorNivel.size > 1 && (
                    <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 2 }}>
                      <span style={{ fontSize: 10, color, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.4 }}>{nivel === 0 ? "Sin estante asignado" : `${nivel}º estante`}</span>
                      <span style={{ fontSize: 10, fontWeight: 800, color: C.dim, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 6, padding: "1px 6px" }}>{items.length}</span>
                      <div style={{ flex: 1, height: 1, background: C.border }} />
                    </div>
                  )}
                  {items.map((m) => (
                    <button key={m.id} type="button" onClick={() => onMatClick?.(m)} style={{ width: "100%", display: "flex", gap: 11, alignItems: "center", padding: "11px 12px", background: C.panel, borderRadius: 12, cursor: "pointer", border: `1px solid ${C.border}`, textAlign: "left", transition: "all 0.15s", boxShadow: "0 1px 2px rgba(0,0,0,0.03)" }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = color; e.currentTarget.style.background = `${color}10`; e.currentTarget.style.boxShadow = `0 6px 16px -8px ${color}80`; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = C.panel; e.currentTarget.style.boxShadow = "0 1px 2px rgba(0,0,0,0.03)"; }}>
                      <div style={{ width: 40, height: 40, borderRadius: 11, display: "grid", placeItems: "center", background: `${color}18`, border: `1px solid ${color}33`, color, flexShrink: 0 }}>
                        <Package size={18} strokeWidth={2.2} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 800, color: C.text, lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.descripcion}</div>
                        <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 5, minWidth: 0 }}>
                          {m.codigo
                            ? <span style={{ fontFamily: C.mono, fontSize: 10, fontWeight: 800, color: C.dim, background: C.panelSolid, border: `1px solid ${C.border}`, borderRadius: 5, padding: "1px 6px", flexShrink: 0 }}>{m.codigo}</span>
                            : <span style={{ fontSize: 11, color: C.dim, fontWeight: 600 }}>Ver stock por obra</span>}
                          {m.ubicacion_obs && <span style={{ fontSize: 11, color: C.dim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>· {m.ubicacion_obs}</span>}
                        </div>
                      </div>
                      <ChevronRight size={17} style={{ color: C.dim, flexShrink: 0 }} />
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
        {est.notas && <div style={{ fontSize: 11.5, color: C.dim }}>⚠ {est.notas}</div>}
      </div>
    </div>
  );
}

// ── Modal de Detalle de Material (Radiografía) ──
function movimientoQty(row) {
  const n = Number(row.cantidad_egresada || row.cantidad || 0);
  return Number.isFinite(n) ? Math.abs(n) : 0;
}

function movimientoMeta(row) {
  const source = String(row.source || "").toLowerCase();
  const anulado = rowIsAnulado(row);
  const isTransfer = source.includes("transferencia");
  const isOut = row.estado === "egresado" || source.startsWith("egreso") || source.startsWith("transferencia_egreso");
  if (anulado) return { label: "Anulado", color: C.dim, bg: C.panel, border: C.border, icon: Ban, sign: isOut ? "-" : "+" };
  if (isTransfer) return { label: "Transferencia", color: C.violet, bg: "rgba(124,58,237,0.10)", border: "rgba(124,58,237,0.26)", icon: Move, sign: isOut ? "-" : "+" };
  if (isOut) return { label: "Egreso", color: C.red, bg: C.redL, border: C.redB, icon: ArrowUpRight, sign: "-" };
  if (row.estado === "problema") return { label: "Problema", color: C.amber, bg: C.amberL, border: C.amberB, icon: AlertTriangle, sign: "" };
  return { label: "Ingreso / recepción", color: C.green, bg: C.greenL, border: C.greenB, icon: ArrowDownLeft, sign: "+" };
}

function MovimientoTimelineRow({ row }) {
  const meta = movimientoMeta(row);
  const Icon = meta.icon;
  const anulado = rowIsAnulado(row);
  const obra = row.obra;
  const detalle = [
    row.retirado_por ? `Retira: ${row.retirado_por}` : "",
    row.egreso_nota || row.notas || "",
  ].filter(Boolean).join(" · ");
  return (
    <div style={{ display: "grid", gridTemplateColumns: "34px minmax(0, 1fr) auto", gap: 10, alignItems: "start", padding: "11px 0", borderBottom: `1px solid ${C.b0}`, opacity: anulado ? 0.52 : 1, textDecoration: anulado ? "line-through" : "none" }}>
      <div style={{ width: 30, height: 30, borderRadius: 9, display: "grid", placeItems: "center", color: meta.color, background: meta.bg, border: `1px solid ${meta.border}` }}>
        <Icon size={15} strokeWidth={2.4} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, fontWeight: 900, color: meta.color }}>{meta.label}</span>
          <span style={{ fontSize: 11, color: C.t2, fontFamily: C.mono }}>{fmtDate(rowMovementAt(row))}</span>
        </div>
        <div style={{ fontSize: 12, color: C.t1, marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {obra ? `${obra.codigo}${obra.linea_nombre ? ` · ${obra.linea_nombre}` : ""}` : "Stock general"}
        </div>
        {detalle && (
          <div style={{ fontSize: 11.5, color: C.t2, lineHeight: 1.35, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis" }}>
            {detalle}
          </div>
        )}
      </div>
      <div style={{ color: meta.color, fontFamily: C.mono, fontSize: 13, fontWeight: 950, whiteSpace: "nowrap", paddingTop: 1 }}>
        {meta.sign}{movimientoQty(row)}
      </div>
    </div>
  );
}

function MaterialDetalleModal({ material, onClose }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ total: 0, general: 0, separados: [], movimientos: [] });

  useEffect(() => {
    async function load() {
      try {
        // Estados que cuentan para el balance del pañol (incluye egresados para restarlos)
        const STOCK_ESTADOS = ["en_panol", "recibido", "parcial", "egresado"];
        const MOVIMIENTO_ESTADOS = ["en_panol", "recibido", "parcial", "egresado", "problema"];
        // NO incluir produccion_obras en el select — PostgREST falla por FK ambiguo (PGRST201)
        const selectFields = "id,obra_id,cantidad,cantidad_egresada,estado,source,descripcion,created_at,updated_at,egreso_at,retirado_por,egreso_nota,notas,material_id";

        let snaps = [];

        // 1) Buscar por material_id (vínculo directo al catálogo)
        if (material.id) {
          const { data: byId, error: errId } = await supabase.from("panol_obra_materiales_snapshot")
            .select(selectFields)
            .eq("material_id", material.id)
            .in("estado", MOVIMIENTO_ESTADOS);
          if (!errId) snaps = byId ?? [];
        }

        // 2) Fallback: buscar por descripción exacta (items huérfanos sin material_id)
        if (!snaps.length && material.descripcion) {
          const { data: byDesc, error: errDesc } = await supabase.from("panol_obra_materiales_snapshot")
            .select(selectFields)
            .ilike("descripcion", material.descripcion)
            .in("estado", MOVIMIENTO_ESTADOS);
          if (!errDesc) snaps = byDesc ?? [];
        }

        // 3) Fallback fuzzy: palabras clave de la descripción
        if (!snaps.length && material.descripcion) {
          const palabras = material.descripcion.split(/\s+/).filter(w => w.length > 2).slice(0, 4);
          if (palabras.length) {
            const fuzzy = `%${palabras.join("%")}%`;
            const { data: byFuzzy, error: errFuzzy } = await supabase.from("panol_obra_materiales_snapshot")
              .select(selectFields)
              .ilike("descripcion", fuzzy)
              .in("estado", MOVIMIENTO_ESTADOS);
            if (!errFuzzy) snaps = byFuzzy ?? [];
          }
        }

        // Obtener info de obras para los obra_ids encontrados
        const obraIds = [...new Set(snaps.map(s => s.obra_id).filter(Boolean))];
        const obrasMap = new Map();
        if (obraIds.length) {
          const { data: obras } = await supabase.from("produccion_obras")
            .select("id, codigo, linea_nombre")
            .in("id", obraIds);
          for (const o of obras ?? []) obrasMap.set(o.id, o);
        }

        let total = 0;
        let general = 0;
        const separadosMap = new Map();
        const stockSnaps = snaps.filter((s) => STOCK_ESTADOS.includes(s.estado));

        for (const s of stockSnaps) {
          if (s.estado === "egresado") {
            const src = String(s.source || "").trim();
            if (src.startsWith("egreso") || src.startsWith("transferencia_egreso") || !s.obra_id) {
              const qtyEgresada = Math.abs(Number(s.cantidad_egresada || s.cantidad || 0));
              total -= qtyEgresada;
              if (!s.obra_id) {
                general -= qtyEgresada;
              } else {
                const k = s.obra_id;
                if (separadosMap.has(k)) {
                  separadosMap.get(k).cantidad -= qtyEgresada;
                } else {
                  const obra = obrasMap.get(k);
                  separadosMap.set(k, {
                    obra: obra?.codigo || "Obra sin código",
                    linea: obra?.linea_nombre || "",
                    cantidad: -qtyEgresada,
                  });
                }
              }
            }
          } else {
            const qty = Number(s.cantidad || 0);
            total += qty;

            if (!s.obra_id) {
              general += qty;
            } else {
              const k = s.obra_id;
              if (!separadosMap.has(k)) {
                const obra = obrasMap.get(k);
                separadosMap.set(k, {
                  obra: obra?.codigo || "Obra sin código",
                  linea: obra?.linea_nombre || "",
                  cantidad: 0,
                });
              }
              separadosMap.get(k).cantidad += qty;
            }
          }
        }

        const separadosArray = [...separadosMap.values()].filter(o => o.cantidad > 0).sort((a, b) => a.obra.localeCompare(b.obra));
        const movimientos = snaps
          .map((s) => ({ ...s, obra: s.obra_id ? obrasMap.get(s.obra_id) || null : null }))
          .sort((a, b) => new Date(rowMovementAt(b) || 0) - new Date(rowMovementAt(a) || 0));

        setData({ total: Math.max(0, total), general: Math.max(0, general), separados: separadosArray, movimientos });
      } catch (err) {
        console.error("Error cargando detalle:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [material.id, material.descripcion]);

  const isZero = data.total === 0;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", justifyContent: "flex-end" }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(15,23,42,0.6)", backdropFilter: "blur(4px)", animation: "fadeIn 0.2s ease" }} onClick={onClose} />
      
      <div style={{ position: "relative", width: 460, maxWidth: "100%", background: C.bg, borderLeft: `1px solid ${C.b0}`, display: "flex", flexDirection: "column", boxShadow: "-20px 0 50px rgba(0,0,0,0.3)", animation: "slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1)" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: `1px solid ${C.b0}`, background: C.s0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: C.blueL, color: C.blue, display: "grid", placeItems: "center", boxShadow: `0 4px 12px ${C.blueL}80` }}>
              <PackageOpen size={22} strokeWidth={2.5} />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 900, color: C.t0, letterSpacing: "-0.3px" }}>Radiografía del Estante</div>
              <div style={{ fontSize: 13, color: C.t2, fontWeight: 500 }}>Contenido físico registrado</div>
            </div>
          </div>
          <button type="button" onClick={onClose} style={{ border: "none", background: "transparent", color: C.t2, cursor: "pointer", padding: 8, borderRadius: "50%", transition: "all 0.15s" }} onMouseEnter={e => e.currentTarget.style.background = C.b0} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
            <X size={22} />
          </button>
        </div>

        <div style={{ padding: 24, flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 28 }}>
          {/* Material Header */}
          <div>
            <div style={{ fontSize: 20, fontWeight: 900, color: C.t0, lineHeight: 1.3, marginBottom: 12 }}>{material.descripcion}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {material.codigo && <span style={{ padding: "4px 10px", background: C.s0, color: C.t1, border: `1px solid ${C.b0}`, borderRadius: 8, fontSize: 12, fontWeight: 700, fontFamily: C.mono, display: "flex", alignItems: "center", gap: 6 }}><Search size={14} /> COD: {material.codigo}</span>}
              <span style={{ padding: "4px 10px", background: `${C.blue}15`, color: C.blue, border: `1px solid ${C.blue}30`, borderRadius: 8, fontSize: 12, fontWeight: 800, display: "flex", alignItems: "center", gap: 6 }}><MapPin size={14} /> UBICACIÓN: {material.ubicacion}</span>
            </div>
          </div>

          {loading ? (
            <div style={{ padding: 60, textAlign: "center", color: C.dim, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
              <div style={{ width: 24, height: 24, border: `3px solid ${C.b0}`, borderTopColor: C.blue, borderRadius: "50%", animation: "spin 1s linear infinite" }} />
              <span style={{ fontWeight: 600, fontSize: 14 }}>Calculando inventario y cargando movimientos...</span>
            </div>
          ) : (
            <>
              {/* Total Stock Box */}
              <div style={{ 
                position: "relative",
                overflow: "hidden",
                background: isZero ? C.s0 : `linear-gradient(135deg, ${C.green}15, ${C.green}05)`, 
                border: `1px solid ${isZero ? C.b0 : `${C.green}40`}`, 
                borderRadius: 16, 
                padding: "24px",
                boxShadow: isZero ? "none" : `0 8px 24px -8px ${C.green}30`,
                transition: "all 0.3s ease"
              }}>
                {!isZero && <div style={{ position: "absolute", top: 0, right: 0, width: 140, height: 140, background: `radial-gradient(circle, ${C.green}20 0%, transparent 70%)`, transform: "translate(30%, -30%)" }} />}
                
                <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontSize: 13, color: isZero ? C.dim : C.green, fontWeight: 850, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Total Físico en Pañol</div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                      <span style={{ fontSize: 48, fontWeight: 950, color: isZero ? C.t1 : C.green, fontFamily: C.mono, lineHeight: 1, letterSpacing: "-1.5px" }}>
                        {data.total}
                      </span>
                      <span style={{ fontSize: 16, fontWeight: 700, color: isZero ? C.dim : `${C.green}99` }}>
                        {data.total === 1 ? "unidad" : "unidades"}
                      </span>
                    </div>
                  </div>
                  <div style={{ width: 56, height: 56, borderRadius: "50%", background: isZero ? C.bg : `${C.green}15`, color: isZero ? C.t2 : C.green, display: "grid", placeItems: "center", border: `1px solid ${isZero ? C.b0 : `${C.green}30`}` }}>
                    <Layers size={28} strokeWidth={2.5} />
                  </div>
                </div>
              </div>

              {/* Breakdown */}
              {data.total > 0 && (
                <div>
                  <div style={{ fontSize: 13, color: C.t1, fontWeight: 850, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
                    <Warehouse size={16} /> Desglose de asignaciones
                  </div>
                  
                  <div style={{ display: "grid", gap: 12 }}>
                    {/* General Stock */}
                    {data.general > 0 && (
                      <div style={{ position: "relative", padding: "16px", background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 12, overflow: "hidden" }}>
                        <div style={{ position: "absolute", left: 0, bottom: 0, height: 4, background: C.t2, width: `${(data.general / data.total) * 100}%`, transition: "width 0.5s ease-out" }} />
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <div>
                            <div style={{ fontSize: 15, fontWeight: 800, color: C.t0 }}>Stock General</div>
                            <div style={{ fontSize: 13, color: C.t2, marginTop: 2 }}>Disponible, sin asignar</div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 18, fontWeight: 900, color: C.t0, fontFamily: C.mono }}>{data.general}</div>
                            <div style={{ fontSize: 12, color: C.t2, fontWeight: 700 }}>{data.general === 1 ? "ud" : "uds"}</div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Separated Stock */}
                    {data.separados.map((o, i) => (
                      <div key={i} style={{ position: "relative", padding: "16px", background: `${C.blue}08`, border: `1px solid ${C.blue}20`, borderRadius: 12, overflow: "hidden" }}>
                        <div style={{ position: "absolute", left: 0, bottom: 0, height: 4, background: C.blue, width: `${(o.cantidad / data.total) * 100}%`, transition: "width 0.5s ease-out" }} />
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <div>
                            <div style={{ fontSize: 15, fontWeight: 800, color: C.t0 }}>Reserva {o.obra}</div>
                            <div style={{ fontSize: 13, color: C.t2, marginTop: 2 }}>{o.linea}</div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 18, fontWeight: 900, color: C.blue, fontFamily: C.mono }}>{o.cantidad}</div>
                            <div style={{ fontSize: 12, color: C.blue, opacity: 0.8, fontWeight: 700 }}>{o.cantidad === 1 ? "ud" : "uds"}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Empty State */}
              {data.total === 0 && (
                <div style={{ padding: "24px 20px", textAlign: "center", background: `#f59e0b10`, border: `1px dashed #f59e0b40`, borderRadius: 16 }}>
                  <div style={{ width: 48, height: 48, margin: "0 auto 16px", background: `#f59e0b20`, color: `#d97706`, borderRadius: "50%", display: "grid", placeItems: "center" }}>
                    <Search size={24} strokeWidth={2.5} />
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: C.t0, marginBottom: 8 }}>¿Ves el material en el estante?</div>
                  <div style={{ fontSize: 14, color: C.t2, lineHeight: 1.5 }}>
                    El sistema marca <b>0 unidades</b> físicas aquí. Si el material está en la estantería significa que aún no ingresó al sistema o no se hizo el conteo.
                  </div>
                </div>
              )}

              <div style={{ border: `1px solid ${C.b0}`, background: C.s0, borderRadius: 16, overflow: "hidden" }}>
                <div style={{ padding: "15px 16px", borderBottom: `1px solid ${C.b0}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 13, color: C.t1, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.6 }}>Movimientos</div>
                    <div style={{ fontSize: 12, color: C.t2, marginTop: 2 }}>Kardex del material: ingresos, recepciones, egresos y transferencias.</div>
                  </div>
                  <span style={{ border: `1px solid ${C.b0}`, background: C.bg, color: C.t1, borderRadius: 999, padding: "4px 9px", fontSize: 11, fontWeight: 850 }}>
                    {data.movimientos.length}
                  </span>
                </div>
                <div style={{ padding: "0 16px" }}>
                  {data.movimientos.length ? (
                    data.movimientos.map((mov, index) => (
                      <MovimientoTimelineRow key={mov.id || `${mov.estado}-${index}`} row={mov} />
                    ))
                  ) : (
                    <div style={{ padding: "22px 0", textAlign: "center", color: C.t2, fontSize: 13, fontWeight: 650 }}>
                      Sin movimientos registrados
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <style>{`
          @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
          @keyframes slideInRight { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
          @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        `}</style>
      </div>
    </div>
  );
}
