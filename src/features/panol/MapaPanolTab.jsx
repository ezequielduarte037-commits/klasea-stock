import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Layers, MapPin, Move, PackageOpen, Search, Warehouse, X } from "lucide-react";
import { C } from "@/theme";
import { supabase } from "@/supabaseClient";
import { ZONA_COLORS, parseUbicacion, zonaColor } from "./ubicacionUtils";

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
  const svgRef = useRef(null);
  const dragRef = useRef(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [estRes, matRes, totRes] = await Promise.all([
        supabase.from("panol_estanterias").select("*").eq("activo", true).order("codigo"),
        supabase.from("panol_materiales").select("id, descripcion, ubicacion, ubicacion_obs").not("ubicacion", "is", null).eq("activo", true),
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

  const afuera = useMemo(() => materiales.filter((m) => parseUbicacion(m.ubicacion).afuera), [materiales]);

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

  // ── Drag (modo edición) ──
  function svgPoint(evt) {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    return {
      x: ((evt.clientX - rect.left) / rect.width) * VIEWBOX.w + VIEWBOX.x,
      y: ((evt.clientY - rect.top) / rect.height) * VIEWBOX.h + VIEWBOX.y,
    };
  }

  function onPointerDown(evt, est) {
    if (!editMode) { setSel(est.codigo === sel ? null : est.codigo); return; }
    const p = svgPoint(evt);
    if (!p) return;
    dragRef.current = { codigo: est.codigo, offX: p.x - est.x_cm, offY: p.y - est.y_cm, moved: false };
    evt.target.setPointerCapture?.(evt.pointerId);
  }

  function onPointerMove(evt) {
    const drag = dragRef.current;
    if (!drag) return;
    const p = svgPoint(evt);
    if (!p) return;
    drag.moved = true;
    setEstanterias((prev) => prev.map((e) => e.codigo === drag.codigo
      ? { ...e, x_cm: Math.round(Math.max(0, Math.min(ROOM_W - e.w_cm, p.x - drag.offX))), y_cm: Math.round(Math.max(0, Math.min(ROOM_H - e.h_cm, p.y - drag.offY))) }
      : e));
  }

  async function onPointerUp() {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag?.moved) return;
    const est = estanterias.find((e) => e.codigo === drag.codigo);
    if (!est) return;
    const { error } = await supabase.from("panol_estanterias").update({ x_cm: est.x_cm, y_cm: est.y_cm, updated_at: new Date().toISOString() }).eq("codigo", est.codigo);
    if (error) toast?.error("No se pudo guardar la posición.");
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
          {canEdit && (
            <button type="button" onClick={() => setEditMode(!editMode)} style={{ display: "flex", alignItems: "center", gap: 6, border: `1px solid ${editMode ? C.blueB : C.border}`, background: editMode ? C.blueL : C.panelSolid, color: editMode ? C.blue : C.text, borderRadius: 10, padding: "8px 12px", cursor: "pointer", fontSize: 12.5, fontWeight: 800, fontFamily: C.sans }}>
              <Move size={14} /> {editMode ? "Editando · arrastrá" : "Editar plano"}
            </button>
          )}
        </div>

        {/* ── Leyenda de zonas ── */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {zonas.map(([z, count]) => {
            const color = ZONA_COLORS[z] || "#64748b";
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
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: isMobile || !selEst ? "1fr" : "1fr 320px", alignItems: "start" }}>
          <div style={{ display: "grid", gap: 10 }}>
            {loading ? (
              <div style={{ padding: 50, textAlign: "center", color: C.dim, fontSize: 13 }}>Cargando el plano...</div>
            ) : !estanterias.length ? (
              <div style={{ padding: "40px 20px", textAlign: "center", color: C.dim, border: `1px dashed ${C.border}`, borderRadius: 14, fontSize: 13 }}>
                No hay estanterías cargadas. Corré el SQL del mapa del pañol y recargá.
              </div>
            ) : (
              <div style={{ border: `1px solid ${C.border}`, background: C.panelSolid, borderRadius: 18, padding: 12, overflow: "hidden", boxShadow: "0 14px 40px -24px rgba(0,0,0,0.35)" }}>
                <svg ref={svgRef} viewBox={`${VIEWBOX.x} ${VIEWBOX.y} ${VIEWBOX.w} ${VIEWBOX.h}`} style={{ width: "100%", height: "auto", display: "block", touchAction: editMode ? "none" : "auto" }}
                  onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp}>
                  <defs>
                    <pattern id="mapaGrid" width={100} height={100} patternUnits="userSpaceOnUse">
                      <path d="M 100 0 L 0 0 0 100" fill="none" stroke="var(--grid-line)" strokeWidth={1.5} />
                    </pattern>
                    <linearGradient id="mapaFloor" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="rgba(148,163,184,0.06)" />
                      <stop offset="100%" stopColor="rgba(148,163,184,0.015)" />
                    </linearGradient>
                    <filter id="mapaShadow" x="-30%" y="-30%" width="160%" height="160%">
                      <feDropShadow dx="0" dy="5" stdDeviation="7" floodColor="#000" floodOpacity="0.22" />
                    </filter>
                  </defs>

                  {/* Piso — pared gruesa gris como el plano */}
                  <rect x={0} y={0} width={ROOM_W} height={ROOM_H} fill="url(#mapaFloor)" stroke="none" rx={8} />
                  <rect x={0} y={0} width={ROOM_W} height={ROOM_H} fill="url(#mapaGrid)" stroke="none" rx={8} />

                  <g>
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
                  <g>
                    <rect x={105} y={ROOM_H - WALL - 4} width={285} height={12} fill={C.amber} rx={5} />
                    <text x={247.5} y={ROOM_H + 34} textAnchor="middle" fontSize={22} fill={C.dim} fontFamily={C.sans} fontWeight={700}>PUERTA</text>
                    <rect x={485} y={ROOM_H - WALL - 4} width={195} height={12} fill="#38bdf8" rx={5} />
                    <text x={582.5} y={ROOM_H + 34} textAnchor="middle" fontSize={22} fill={C.dim} fontFamily={C.sans} fontWeight={700}>VENTANA</text>
                    <rect x={1542} y={ROOM_H - WALL - 4} width={275} height={12} fill={C.amber} rx={5} />
                    <path d={`M 1542 ${ROOM_H - WALL - 4} A 205 205 0 0 1 1747 ${ROOM_H - WALL - 209}`} fill="none" stroke={C.amber} strokeWidth={3} strokeDasharray="14 12" opacity={0.5} />
                    <text x={1679.5} y={ROOM_H + 34} textAnchor="middle" fontSize={22} fill={C.dim} fontFamily={C.sans} fontWeight={700}>PUERTA</text>
                  </g>

                  {/* Estanterías */}
                  {estanterias.map((est) => {
                    const color = zonaColor(est.codigo);
                    const isSel = sel === est.codigo;
                    const isHit = highlighted?.has(est.codigo);
                    const dim = highlighted && !isHit;
                    const nMats = (matsPorEstanteria.get(String(est.codigo).toUpperCase()) || []).length;
                    const small = est.w_cm < 75 && est.h_cm < 105;
                    return (
                      <g key={est.codigo} className={`mapa-est${isHit ? " mapa-hit" : ""}`} onPointerDown={(e) => onPointerDown(e, est)} style={{ cursor: editMode ? "grab" : "pointer" }} opacity={dim ? 0.18 : 1} filter={isSel || isHit ? "url(#mapaShadow)" : undefined}>
                        <rect x={est.x_cm} y={est.y_cm} width={est.w_cm} height={est.h_cm} rx={7}
                          fill={isHit ? "rgba(245,158,11,0.5)" : `${color}2e`}
                          stroke={isSel ? C.blue : isHit ? "#f59e0b" : color}
                          strokeWidth={isSel ? 9 : isHit ? 8 : 3.5} />
                        {/* borde interior sutil (profundidad) */}
                        <rect x={est.x_cm + 6} y={est.y_cm + 6} width={Math.max(4, est.w_cm - 12)} height={Math.max(4, est.h_cm - 12)} rx={4} fill="none" stroke={color} strokeOpacity={0.25} strokeWidth={2} />
                        <text x={est.x_cm + est.w_cm / 2} y={est.y_cm + est.h_cm / 2 + (nMats > 0 && !small ? 0 : 10)}
                          textAnchor="middle" fontSize={small ? 27 : 34} fontWeight={900}
                          fill={isHit ? "#92400e" : color} fontFamily={C.sans}>{est.codigo}</text>
                        {nMats > 0 && !small && (
                          <text x={est.x_cm + est.w_cm / 2} y={est.y_cm + est.h_cm / 2 + 34} textAnchor="middle" fontSize={21} fontWeight={700} fill={C.dim} fontFamily={C.sans}>{nMats} ítems</text>
                        )}
                        <title>{`${est.codigo} · ${est.alto_cm || "?"}×${est.largo_cm || "?"}×${est.prof_cm || "?"} cm · ${nMats} producto${nMats === 1 ? "" : "s"}`}</title>
                      </g>
                    );
                  })}

                  {/* Escala (abajo izquierda) + rótulo (arriba derecha) */}
                  <g transform={`translate(20, ${ROOM_H + 30})`}>
                    <line x1={0} y1={0} x2={100} y2={0} stroke={C.dim} strokeWidth={4} />
                    <line x1={0} y1={-7} x2={0} y2={7} stroke={C.dim} strokeWidth={4} />
                    <line x1={100} y1={-7} x2={100} y2={7} stroke={C.dim} strokeWidth={4} />
                    <text x={112} y={8} fontSize={24} fill={C.dim} fontFamily={C.sans}>1 m</text>
                  </g>
                  <text x={ROOM_W - 10} y={-20} textAnchor="end" fontSize={24} fill={C.dim} fontFamily={C.sans}>Pañol Chubut 2120 · plano rotado 90° · {(ROOM_H / 100).toFixed(2).replace(".", ",")} × {(ROOM_W / 100).toFixed(2).replace(".", ",")} m</text>
                </svg>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "8px 6px 2px", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, color: C.dim }}>{editMode ? "Arrastrá una estantería y la posición se guarda sola." : "Tocá una estantería para ver sus estantes y productos."}</span>
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

          {selEst && <EstanteriaPanel est={selEst} mats={selMats} onClose={() => setSel(null)} />}
        </div>
      </div>
    </div>
  );
}

// ── Ficha de estantería: vista frontal a escala + productos por estante ──
function EstanteriaPanel({ est, mats, onClose }) {
  const color = zonaColor(est.codigo);
  const niveles = Array.isArray(est.niveles_cm) ? est.niveles_cm : [];
  const alto = est.alto_cm || (niveles.length ? Math.max(...niveles) : 200);
  const largo = est.largo_cm || 90;
  const VW = 264;
  const scale = VW / Math.max(largo, 1);
  const VH = Math.max(90, alto * scale);

  const matsPorNivel = useMemo(() => {
    const map = new Map();
    for (const m of mats) {
      const { nivel } = parseUbicacion(m.ubicacion);
      const key = nivel || 0; // 0 = sin estante específico
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(m);
    }
    return map;
  }, [mats]);

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
          <button type="button" onClick={onClose} style={{ border: "none", background: "transparent", color: C.dim, cursor: "pointer", padding: 4 }}><X size={16} /></button>
        </div>

        {/* Vista frontal a escala */}
        {niveles.length > 0 && (
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 10px 6px" }}>
            <div style={{ fontSize: 10, color: C.dim, fontWeight: 850, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Vista frontal · alturas reales</div>
            <svg viewBox={`-44 -10 ${VW + 88} ${VH + 34}`} style={{ width: "100%", height: "auto", display: "block" }}>
              <rect x={0} y={0} width={VW} height={VH} rx={4} fill={`${color}14`} stroke={color} strokeWidth={2.5} />
              {niveles.map((n, i) => {
                const y = VH - n * scale;
                const count = (matsPorNivel.get(i + 1) || []).length;
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
          <div style={{ fontSize: 10, color: C.dim, fontWeight: 850, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Productos ({mats.length})</div>
          {mats.length === 0 ? (
            <div style={{ fontSize: 12, color: C.dim, border: `1px dashed ${C.border}`, borderRadius: 10, padding: "12px 10px", textAlign: "center" }}>
              Sin productos asignados. Se cargan en el conteo o al recibir: ubicación <span style={{ fontFamily: C.mono, color }}>{est.codigo}-2</span> = 2º estante.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 6, maxHeight: 280, overflowY: "auto" }}>
              {[...matsPorNivel.entries()].sort((a, b) => b[0] - a[0]).map(([nivel, items]) => (
                <div key={nivel}>
                  <div style={{ fontSize: 10.5, color, fontWeight: 900, marginBottom: 3 }}>{nivel === 0 ? "Sin estante específico" : `${nivel}º estante`}</div>
                  {items.map((m) => (
                    <div key={m.id} style={{ display: "flex", gap: 7, alignItems: "baseline", fontSize: 12.5, padding: "4px 8px", background: C.panel, borderRadius: 8, marginBottom: 3 }}>
                      <span style={{ color: C.text, minWidth: 0 }}>{m.descripcion}</span>
                      {m.ubicacion_obs && <span style={{ color: C.dim, fontSize: 11 }}>· {m.ubicacion_obs}</span>}
                    </div>
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
