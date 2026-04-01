/**
 * PiezasLaminacionView v4
 *
 * CAMBIOS v4:
 * — Cada pieza con cant > 1 ahora tiene su propia fila (pieza_id "51/7")
 * — Columna "Cant" eliminada → columna "N° pieza" (ej: #51 · 7)
 * — Campo "Laminador" en modal + columna en tabla
 * — Upload de imágenes con manejo de error visible al usuario
 * — Identificador único: pieza_id (texto) en vez de pieza_num (int)
 *
 * SQL DE MIGRACIÓN (correr antes de usar v4):
 * ─────────────────────────────────────────────────────────────────
 * ALTER TABLE piezas_laminacion_seguimiento
 * ADD COLUMN IF NOT EXISTS pieza_id  text,
 * ADD COLUMN IF NOT EXISTS laminador text,
 * ADD COLUMN IF NOT EXISTS ubicacion text;
 *
 * UPDATE piezas_laminacion_seguimiento
 * SET pieza_id = pieza_num::text
 * WHERE pieza_id IS NULL;
 *
 * ALTER TABLE piezas_laminacion_seguimiento
 * DROP CONSTRAINT IF EXISTS piezas_laminacion_seguimiento_obra_id_pieza_num_key;
 * ALTER TABLE piezas_laminacion_seguimiento
 * ADD CONSTRAINT pls_obra_pieza_unique UNIQUE (obra_id, pieza_id);
 *
 * ALTER TABLE piezas_laminacion_imagenes
 * ADD COLUMN IF NOT EXISTS pieza_id text;
 * UPDATE piezas_laminacion_imagenes
 * SET pieza_id = pieza_num::text
 * WHERE pieza_id IS NULL;
 * ─────────────────────────────────────────────────────────────────
 */

import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { supabase } from "../supabaseClient";

const C = {
  bg:"#09090b", s0:"rgba(255,255,255,0.03)", s1:"rgba(255,255,255,0.06)",
  b0:"rgba(255,255,255,0.08)", b1:"rgba(255,255,255,0.15)",
  t0:"#f4f4f5", t1:"#a1a1aa", t2:"#71717a",
  mono:"'JetBrains Mono','IBM Plex Mono',monospace",
  sans:"'Outfit',system-ui,sans-serif",
  green:"#10b981", amber:"#f59e0b", red:"#ef4444", blue:"#3b82f6", purple:"#8b5cf6",
};

const GLASS = {
  backdropFilter:"blur(24px) saturate(130%)",
  WebkitBackdropFilter:"blur(24px) saturate(130%)",
};

const STORAGE_BUCKET = "piezas-laminacion";

const EST = {
  pendiente:  { label:"Pendiente",  color:C.t2,    bg:"rgba(113,113,122,.10)", border:"rgba(113,113,122,.22)" },
  en_proceso: { label:"En proceso", color:C.blue,  bg:"rgba(59,130,246,.10)",  border:"rgba(59,130,246,.25)"  },
  terminada:  { label:"Terminada",  color:C.green, bg:"rgba(16,185,129,.10)",  border:"rgba(16,185,129,.25)"  },
  entregada:  { label:"Entregada",  color:C.purple,bg:"rgba(139,92,246,.10)",  border:"rgba(139,92,246,.25)"  },
  problema:   { label:"Problema",   color:C.red,   bg:"rgba(239,68,68,.10)",   border:"rgba(239,68,68,.25)"   },
};

const OBRA_COLOR = {
  activa:"#3b82f6", pausada:"#f59e0b", terminada:"#10b981", cancelada:"#ef4444",
};

// ─── catalogo helpers ─────────────────────────────────────────────────────────
function makePiezaId(num, sub) { return sub != null ? `${num}/${sub}` : `${num}`; }

function expandCatalogo(raw) {
  const result = [];
  for (const r of raw) {
    if (r.cant === 1) {
      result.push({ pieza_id: makePiezaId(r.num, null), num: r.num, sub: null, desc: r.desc, matriz: r.matriz ?? null, variant: r.variant ?? null });
    } else {
      for (let i = 1; i <= r.cant; i++) {
        result.push({ pieza_id: makePiezaId(r.num, i), num: r.num, sub: i, desc: r.desc, matriz: r.matriz ?? null, variant: r.variant ?? null });
      }
    }
  }
  return result;
}

// ─── catálogos raw ────────────────────────────────────────────────────────────
const RAW_K43 = [
  { num:1,  desc:"Casco",                                        cant:1, matriz:null },
  { num:2,  desc:"Cubierta",                                     cant:1, matriz:null },
  { num:3,  desc:"Cabina",                                       cant:1, matriz:null },
  { num:5,  desc:"Planchada lado inferior",                      cant:1, matriz:null },
  { num:6,  desc:"Planchada Nueva",                              cant:2, matriz:null },
  { num:7,  desc:"Laterales de planchada nueva",                 cant:1, matriz:null },
  { num:8,  desc:"Piso de cockpit",                              cant:1, matriz:null },
  { num:9,  desc:"Tapa de sala de maquinas",                     cant:1, matriz:"Nueva #20" },
  { num:10, desc:"Tacho de mueble lateral de cockpit estribor",  cant:1, matriz:"Nueva #20" },
  { num:11, desc:"Tacho de mueble lateral de cockpit babor",     cant:1, matriz:"Nueva #20" },
  { num:12, desc:"Puerta del tacho lateral de cockpit Estribor", cant:1, matriz:null },
  { num:13, desc:"Puerta del tacho lateral de cockpit Babor",    cant:1, matriz:null },
  { num:14, desc:"Pasacabos de popa Estribor",                   cant:1, matriz:"Nueva #20" },
  { num:15, desc:"Pasacabos de popa Babor",                      cant:1, matriz:"Nueva #20" },
  { num:16, desc:"Tomas de aire",                                cant:2, matriz:null },
  { num:17, desc:"Sillon de cockpit",                            cant:1, matriz:"Nueva #20" },
  { num:18, desc:"Tapa de parrilla",                             cant:1, matriz:null },
  { num:19, desc:"Base de sillon de cockpit",                    cant:1, matriz:"Nueva #20" },
  { num:20, desc:"Tapa de tacho de planchada",                   cant:1, matriz:null },
  { num:21, desc:"Tapa de tacho de proa estribor",               cant:1, matriz:"Nueva #20" },
  { num:22, desc:"Tapa de tacho de proa Babor",                  cant:1, matriz:"Nueva #20" },
  { num:23, desc:"Tacho de proa",                                cant:1, matriz:null },
  { num:24, desc:"Tapa de malacate",                             cant:1, matriz:null },
  { num:25, desc:"Cuchara de extractores",                       cant:2, matriz:null },
  { num:26, desc:"Consola de fly",                               cant:1, matriz:"Nueva #20" },
  { num:27, desc:"Consola salon",                                cant:1, matriz:null },
  { num:28, desc:"Tapa escalera fly",                            cant:1, matriz:"Nueva #20" },
  { num:29, desc:"Base de butaca Fly",                           cant:1, matriz:"Nueva #20" },
  { num:30, desc:"Arco Radar",                                   cant:1, matriz:"Nueva #20" },
  { num:31, desc:"Tapa de arco Radar Central",                   cant:1, matriz:"Nueva #20" },
  { num:32, desc:"Tapa de arco Radar Estribor",                  cant:1, matriz:"Nueva #20" },
  { num:33, desc:"Tapa de arco Radar Babor",                     cant:1, matriz:"Nueva #20" },
  { num:34, desc:"Camarote de proa",                             cant:1, matriz:null },
  { num:35, desc:"Techo de camarote de proa",                    cant:1, matriz:null },
  { num:36, desc:"Baño de babor",                                cant:1, matriz:null },
  { num:37, desc:"Techo de baño de babor",                       cant:1, matriz:null },
  { num:38, desc:"Banda de baño de babor",                       cant:1, matriz:null },
  { num:39, desc:"Baño de estribor",                             cant:1, matriz:null },
  { num:40, desc:"Techo de baño de estribor",                    cant:1, matriz:null },
  { num:41, desc:"Banda baño estribor",                          cant:1, matriz:null },
  { num:42, desc:"Marco ventana baño estribor",                  cant:1, matriz:null },
  { num:43, desc:"Camarote de estribor",                         cant:1, matriz:null },
  { num:44, desc:"Techo camarote de estribor",                   cant:1, matriz:null },
  { num:45, desc:"Camarote de popa",                             cant:1, matriz:null },
  { num:46, desc:"Techo camarote de popa",                       cant:2, matriz:null },
  { num:47, desc:"Banda de salon proa estribor",                 cant:1, matriz:"Nueva #20" },
  { num:48, desc:"Banda de salon popa estribor",                 cant:1, matriz:"Nueva #20" },
  { num:49, desc:"Banda de salon popa Babor",                    cant:1, matriz:"Nueva #20" },
  { num:50, desc:"Banda de salon proa Babor",                    cant:1, matriz:"Nueva #20" },
  { num:51, desc:"Interior escalera Fly",                        cant:1, matriz:"Nueva #20" },
  { num:52, desc:"Moldura pasillo",                              cant:1, matriz:"Nueva #20" },
  { num:53, desc:"Contratecho cabina proa",                      cant:1, matriz:null },
  { num:54, desc:"Contratecho cockpit",                          cant:1, matriz:"Nueva #20" },
  { num:55, desc:"Cajon de baterías",                            cant:1, matriz:null },
  { num:56, desc:"Tapa Cajon de baterías",                       cant:1, matriz:null },
  { num:57, desc:"Tapa de escalera de planchada",                cant:1, matriz:"Nueva #20" },
  { num:58, desc:"Caja de selectoras",                           cant:1, matriz:null },
  { num:59, desc:"Mesa de fly",                                  cant:1, matriz:null },
  { num:60, desc:"Cenefa",                                       cant:2, matriz:null },
];

// variant: "softop" | "hardtop" | null (null = ambos)
const RAW_K52 = [
  { num:1,  desc:"Casco",                                                  cant:1,  variant:null      },
  { num:2,  desc:"Cubierta",                                               cant:1,  variant:null      },
  { num:3,  desc:"Interior de popa",                                       cant:1,  variant:null      },
  { num:4,  desc:"Interior de proa",                                       cant:1,  variant:null      },
  { num:5,  desc:"Mamparo de baño de popa",                                cant:1,  variant:null      },
  { num:6,  desc:"Mamparo de baño de proa",                                cant:1,  variant:null      },
  { num:7,  desc:"Techo de baño de popa",                                  cant:1,  variant:null      },
  { num:8,  desc:"Techo de baño de proa",                                  cant:1,  variant:null      },
  { num:9,  desc:"Cenefa de baño, baño de popa y proa",                    cant:2,  variant:null      },
  { num:10, desc:"Moldura de entrada de salón",                            cant:1,  variant:null      },
  { num:11, desc:"Moldura de ventana de babor, salón",                     cant:1,  variant:null      },
  { num:12, desc:"Moldura de ventana de estribor, salón",                  cant:1,  variant:null      },
  { num:13, desc:"Cenefa de babor, salón",                                 cant:3,  variant:null      },
  { num:14, desc:"Cenefa de estribor, salón",                              cant:1,  variant:null      },
  { num:15, desc:"Moldura de ventana de babor, camarote de popa",          cant:1,  variant:null      },
  { num:16, desc:"Moldura de ventana de estribor, camarote de popa",       cant:1,  variant:null      },
  { num:17, desc:"Cenefa, camarote de proa",                               cant:1,  variant:null      },
  { num:18, desc:"Moldura de ventana de estribor, camarote de proa",       cant:1,  variant:null      },
  { num:19, desc:"Moldura de ventana de babor, camarote de proa",          cant:1,  variant:null      },
  { num:22, desc:"Sobre apoyo de consola",                                 cant:1,  variant:null      },
  { num:23, desc:"Moldura de pasamanos de sobre apoyo de consola",         cant:1,  variant:null      },
  { num:24, desc:"Consola",                                                cant:1,  variant:null      },
  { num:25, desc:"Máscara tapizada de cleopatra, cockpit",                 cant:1,  variant:null      },
  { num:26, desc:"Máscara tapizada de dinnette, cockpit",                  cant:1,  variant:null      },
  { num:27, desc:"Mueble de cockpit",                                      cant:1,  variant:null      },
  { num:28, desc:"Tapa de tele de mueble de cockpit",                      cant:1,  variant:null      },
  { num:29, desc:"Tapa de parrilla de mueble de cockpit",                  cant:1,  variant:null      },
  { num:30, desc:"Puertita de popa de mueble de cockpit",                  cant:1,  variant:null      },
  { num:31, desc:"Puertita de proa de mueble de cockpit",                  cant:1,  variant:null      },
  { num:32, desc:"Caja de selectoras, cockpit",                            cant:1,  variant:null      },
  { num:33, desc:"Softop",                                                 cant:1,  variant:"softop"  },
  { num:34, desc:"Hardtop",                                                cant:1,  variant:"hardtop" },
  { num:35, desc:"Cáscara de planchada tender",                            cant:1,  variant:null      },
  { num:36, desc:"Planchada fija",                                         cant:1,  variant:null      },
  { num:37, desc:"Túnel de escape de planchada fija",                      cant:2,  variant:null      },
  { num:38, desc:"Cacha de estribor de planchada",                         cant:1,  variant:null      },
  { num:39, desc:"Cacha de babor de planchada",                            cant:1,  variant:null      },
  { num:40, desc:"Baúl, cara inferior",                                    cant:1,  variant:null      },
  { num:41, desc:"Baúl, cara superior",                                    cant:1,  variant:null      },
  { num:42, desc:"Tapa de baúl",                                           cant:1,  variant:null      },
  { num:43, desc:"Toma de aire de babor",                                  cant:1,  variant:null      },
  { num:44, desc:"Toma de aire de estribor",                               cant:1,  variant:null      },
  { num:45, desc:"Base de brújula",                                        cant:1,  variant:null      },
  { num:46, desc:"Tapa de caja de cadenas",                                cant:1,  variant:null      },
  { num:47, desc:"Tapa de escalera de planchada",                          cant:1,  variant:null      },
  { num:48, desc:"Cajón de baterías grande",                               cant:1,  variant:null      },
  { num:49, desc:"Cajón de baterías chico 1",                              cant:1,  variant:null      },
  { num:50, desc:"Cajón de baterías chico 2",                              cant:1,  variant:null      },
  { num:51, desc:"Imbornales altos",                                       cant:12, variant:null      },
  { num:52, desc:"Caja de aire acondicionado 1",                           cant:1,  variant:null      },
  { num:53, desc:"Caja de aire acondicionado 2",                           cant:1,  variant:null      },
  { num:54, desc:"Contratecho softop",                                     cant:1,  variant:"softop"  },
  { num:55, desc:"Contratecho hardtop",                                    cant:1,  variant:"hardtop" },
  { num:56, desc:"Laminado de cuadernas transversales",                    cant:1,  variant:null      },
  { num:57, desc:"Laminado de largueros longitudinales",                   cant:1,  variant:null      },
  { num:58, desc:"Laminado de grilla de softop",                           cant:1,  variant:"softop"  },
  { num:59, desc:"Laminado de grilla de cubierta",                         cant:1,  variant:null      },
  { num:60, desc:"Tambucho de proa",                                       cant:1,  variant:null      },
  { num:61, desc:"Tapa de sala de máquinas",                               cant:1,  variant:null      },
  { num:62, desc:"Pata de estribor de hardtop",                            cant:1,  variant:"hardtop" },
  { num:63, desc:"Pata de babor de hardtop",                               cant:1,  variant:"hardtop" },
  { num:64, desc:"Moldura de ventana de baño de proa",                     cant:1,  variant:null      },
  { num:65, desc:"Moldura de ventana de baño de popa",                     cant:1,  variant:null      },
  { num:66, desc:"Cara 1 de parante longitudinal de estribor, softop",     cant:1,  variant:"softop"  },
  { num:67, desc:"Cara 2 de parante longitudinal de estribor, softop",     cant:1,  variant:"softop"  },
  { num:68, desc:"Cara 1 de parante longitudinal de babor, softop",        cant:1,  variant:"softop"  },
  { num:69, desc:"Cara 2 de parante longitudinal de babor, softop",        cant:1,  variant:"softop"  },
  { num:70, desc:"Cara 1 de parante transversal de softop",                cant:1,  variant:"softop"  },
  { num:71, desc:"Cara 2 de parante transversal de softop",                cant:1,  variant:"softop"  },
];

const RAW_K37 = [
  { num:  1, desc: "Casco",                                       cant: 1, matriz: null },
  { num:  2, desc: "Postizo de ventana de babor",                 cant: 1, matriz: null },
  { num:  3, desc: "Postizo de ventana de estribor",              cant: 1, matriz: null },
  { num:  4, desc: "Postizo cajón",                               cant: 1, matriz: null },
  { num:  5, desc: "Cubierta",                                    cant: 1, matriz: null },
  { num:  6, desc: "Techo ST",                                    cant: 4, matriz: null },
  { num:  7, desc: "Plafón de techo",                             cant: 1, matriz: null },
  { num:  8, desc: "Interior (piso)",                             cant: 1, matriz: null },
  { num:  9, desc: "Mesa de cockpit",                             cant: 1, matriz: "Compartida K42/K43" },
  { num: 10, desc: "Consola",                                     cant: 2, matriz: null },
  { num: 11, desc: "Solarium de popa",                            cant: 5, matriz: null },
  { num: 12, desc: "Tapa de parrilla",                            cant: 1, matriz: null },
  { num: 13, desc: "Tacho de parrilla",                           cant: 1, matriz: null },
  { num: 14, desc: "Tapa entrada a S.M. solarium de popa",        cant: 1, matriz: null },
  { num: 15, desc: "Tacho de solarium de popa",                   cant: 1, matriz: null },
  { num: 16, desc: "Tapa entrada a sala de máquinas grande",      cant: 1, matriz: null },
  { num: 17, desc: "Cajón de baterías",                           cant: 1, matriz: "Compartida K42/K43" },
  { num: 18, desc: "Tapa cajón de baterías",                      cant: 1, matriz: "Compartida K42/K43" },
  { num: 19, desc: "Mueble de cockpit",                           cant: 4, matriz: null },
  { num: 20, desc: "Tapa malacate",                               cant: 2, matriz: null },
  { num: 21, desc: "Caja selectora",                              cant: 1, matriz: null },
  { num: 22, desc: "Toma de aire de estribor",                    cant: 1, matriz: null },
  { num: 23, desc: "Toma de aire de babor",                       cant: 1, matriz: null },
  { num: 24, desc: "Tapa cajón de planchada",                     cant: 1, matriz: null },
  { num: 25, desc: "Tapa escalera de sala de máquinas",           cant: 1, matriz: null },
  { num: 26, desc: "Liner de ventana conejera estribor",          cant: 1, matriz: null },
  { num: 27, desc: "Liner de ventana conejera babor",             cant: 1, matriz: null },
  { num: 28, desc: "Liner de ventana cocina estribor",            cant: 1, matriz: null },
  { num: 29, desc: "Liner de ventana salón babor",                cant: 1, matriz: null },
  { num: 30, desc: "Liner de ventana baño estribor",              cant: 1, matriz: null },
  { num: 31, desc: "Liner de ventana camarote de proa estribor",  cant: 1, matriz: null },
  { num: 32, desc: "Liner de ventana camarote de proa babor",     cant: 1, matriz: null },
  { num: 33, desc: "Mamparo de baño",                             cant: 1, matriz: null },
];

const CATALOGOS = {
  k37: expandCatalogo(RAW_K37),
  k43: expandCatalogo(RAW_K43),
  k52: expandCatalogo(RAW_K52),
};

function detectarLinea(obra) {
  if (!obra) return null;
  const cod = (obra.codigo ?? "").toLowerCase();
  const lin = (obra.linea_nombre ?? "").toLowerCase();
  if (cod.includes("52") || lin.includes("52")) return "k52";
  if (cod.includes("43") || lin.includes("43")) return "k43";
  if (cod.includes("37") || lin.includes("37")) return "k37";
  return null;
}

// ─── icons ────────────────────────────────────────────────────────────────────
const IconCamera = ({ size=14, color="currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 7.5C2 6.4 2.9 5.5 4 5.5h1.17a1 1 0 0 0 .77-.36l1.12-1.28A1 1 0 0 1 7.83 3.5h4.34a1 1 0 0 1 .77.36l1.12 1.28a1 1 0 0 0 .77.36H16c1.1 0 2 .9 2 2v7c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2v-7Z"/>
    <circle cx="10" cy="11" r="2.5"/>
  </svg>
);
const IconCheck = ({ size=10 }) => (
  <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="2,7 5.5,10.5 12,3"/>
  </svg>
);

// ─── atoms ────────────────────────────────────────────────────────────────────
function Dot({ color, size=6, pulse=false }) {
  return <div style={{ width:size, height:size, borderRadius:"50%", background:color, flexShrink:0, animation:pulse?"plv-pulse 2s ease infinite":"none", boxShadow:pulse?`0 0 5px ${color}70`:"none" }} />;
}
function Chip({ estado, sm=false }) {
  const e = EST[estado] ?? EST.pendiente;
  return <span style={{ fontSize:sm?8:9, letterSpacing:1.5, textTransform:"uppercase", padding:sm?"2px 6px":"3px 9px", borderRadius:99, fontWeight:700, background:e.bg, color:e.color, border:`1px solid ${e.border}`, whiteSpace:"nowrap", fontFamily:C.sans }}>{e.label}</span>;
}
function ProgressRing({ pct, size=44, stroke=3.5, color=C.green }) {
  const r = (size-stroke*2)/2, circ = 2*Math.PI*r;
  return (
    <svg width={size} height={size} style={{ transform:"rotate(-90deg)", flexShrink:0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={`${(pct/100)*circ} ${circ}`} style={{ transition:"stroke-dasharray .7s cubic-bezier(.22,1,.36,1)" }} />
    </svg>
  );
}
function KpiCard({ label, value, total, color, delay=0 }) {
  const p = total > 0 ? Math.round(value/total*100) : 0;
  return (
    <div style={{ background:C.s0, border:`1px solid ${C.b0}`, borderRadius:11, padding:"11px 13px", display:"flex", alignItems:"center", gap:10, borderLeft:`2px solid ${color}`, animation:`plv-kpi .35s ${delay}s ease both` }}>
      <ProgressRing pct={p} color={color} size={38} stroke={3} />
      <div>
        <div style={{ fontSize:8, letterSpacing:2, textTransform:"uppercase", color:C.t2, marginBottom:3 }}>{label}</div>
        <div style={{ fontFamily:C.mono, fontSize:20, fontWeight:700, color, lineHeight:1 }}>{value}</div>
        <div style={{ fontSize:9, color:C.t2, marginTop:2 }}>{p}%</div>
      </div>
    </div>
  );
}

// ─── lightbox ────────────────────────────────────────────────────────────────
function Lightbox({ url, onClose }) {
  useEffect(() => {
    const fn = e => e.key === "Escape" && onClose();
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [onClose]);
  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, zIndex:9999, background:"rgba(0,0,0,0.94)", ...GLASS, display:"flex", alignItems:"center", justifyContent:"center", padding:20, cursor:"zoom-out" }}>
      <img src={url} alt="" style={{ maxWidth:"92vw", maxHeight:"88vh", borderRadius:8, objectFit:"contain", boxShadow:"0 32px 80px rgba(0,0,0,0.8)" }} />
    </div>
  );
}

// ─── modal pieza ─────────────────────────────────────────────────────────────
function PiezaModal({ pieza, lineaKey, obraId, segRow, imagenes:imgInit=[], onSave, onClose }) {
  const [estado,    setEstado]    = useState(segRow?.estado ?? "pendiente");
  const [obs,       setObs]       = useState(segRow?.observaciones ?? "");
  const [ubicacion, setUbicacion] = useState(segRow?.ubicacion ?? "");
  const [laminador, setLaminador] = useState(segRow?.laminador ?? "");
  const [saving,    setSaving]    = useState(false);
  const [imagenes,  setImagenes]  = useState(imgInit);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState("");
  const [lightbox,  setLightbox]  = useState(null);
  const fileRef = useRef();

  async function guardar() {
    setSaving(true);
    const { data:{ user } } = await supabase.auth.getUser().catch(() => ({ data:{ user:null } }));
    const { error } = await supabase.from("piezas_laminacion_seguimiento").upsert({
      obra_id: obraId, pieza_id: pieza.pieza_id, pieza_num: pieza.num,
      estado, observaciones: obs.trim()||null, ubicacion: ubicacion.trim()||null,
      laminador: laminador.trim()||null,
      updated_at: new Date().toISOString(), updated_by: user?.id ?? null,
    }, { onConflict: "obra_id,pieza_id" });
    setSaving(false);
    if (error) { setUploadErr("Error al guardar: " + error.message); return; }
    onSave();
  }

  async function subirImagen(file) {
    if (!file) return;
    setUploading(true); setUploadErr("");
    try {
      const { data:{ user } } = await supabase.auth.getUser().catch(() => ({ data:{ user:null } }));
      const ext  = file.name.split(".").pop().toLowerCase();
      const safe = pieza.pieza_id.replace(/\//g, "_");
      const path = `${obraId}/${lineaKey ?? "x"}/${safe}/${Date.now()}.${ext}`;

      const { error: upErr } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, { upsert:false });
      if (upErr) { setUploadErr("Error al subir: " + upErr.message); setUploading(false); if (fileRef.current) fileRef.current.value=""; return; }

      const { error: insErr } = await supabase.from("piezas_laminacion_imagenes").insert({
        obra_id: obraId, pieza_id: pieza.pieza_id, pieza_num: pieza.num,
        storage_path: path, nombre: file.name, created_by: user?.id ?? null,
      });
      if (insErr) {
        await supabase.storage.from(STORAGE_BUCKET).remove([path]);
        setUploadErr("Imagen subida pero no se pudo registrar: " + insErr.message);
        setUploading(false); if (fileRef.current) fileRef.current.value=""; return;
      }
      const { data: signed } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrl(path, 3600);
      setImagenes(prev => [...prev, { storage_path:path, nombre:file.name, url:signed?.signedUrl ?? null }]);
    } catch(e) { setUploadErr("Error inesperado: " + e.message); }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function eliminarImagen(img) {
    await supabase.storage.from(STORAGE_BUCKET).remove([img.storage_path]);
    await supabase.from("piezas_laminacion_imagenes").delete().eq("storage_path", img.storage_path);
    setImagenes(prev => prev.filter(i => i.storage_path !== img.storage_path));
  }

  const showUbicacion = ["en_proceso","terminada","entregada"].includes(estado);
  const piezaLabel = pieza.sub != null ? `#${String(pieza.num).padStart(2,"0")} · ${pieza.sub}` : `#${String(pieza.num).padStart(2,"0")}`;

  const INP = {
    background:C.s0, border:`1px solid ${C.b0}`, color:C.t0,
    padding:"9px 12px", borderRadius:8, fontSize:12, outline:"none",
    width:"100%", fontFamily:C.sans, boxSizing:"border-box", transition:"border-color .15s",
  };

  return (
    <div onClick={e => e.target===e.currentTarget && onClose()} style={{ position:"fixed", inset:0, zIndex:9100, background:"rgba(0,0,0,0.88)", ...GLASS, display:"flex", alignItems:"flex-start", justifyContent:"center", padding:"40px 20px", overflowY:"auto" }}>
      {lightbox && <Lightbox url={lightbox} onClose={() => setLightbox(null)} />}
      <div style={{ background:"rgba(13,13,17,0.98)", border:`1px solid ${C.b1}`, borderRadius:14, width:"100%", maxWidth:540, fontFamily:C.sans, boxShadow:"0 32px 80px rgba(0,0,0,0.8)", animation:"plv-slideup .18s ease", marginBottom:40 }}>

        {/* header */}
        <div style={{ padding:"18px 20px 14px", borderBottom:`1px solid ${C.b0}`, display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
          <div>
            <div style={{ fontSize:8, letterSpacing:2, textTransform:"uppercase", color:C.t2, marginBottom:5 }}>
              {(lineaKey ?? "").toUpperCase()} · Pieza {piezaLabel}
              {pieza.matriz && <span style={{ marginLeft:8, color:C.amber }}>✦ {pieza.matriz}</span>}
            </div>
            <div style={{ fontSize:17, fontWeight:700, color:C.t0, lineHeight:1.3 }}>{pieza.desc}</div>
          </div>
          <button onClick={onClose} style={{ background:"transparent", border:"none", color:C.t2, cursor:"pointer", fontSize:20, lineHeight:1, padding:"2px 6px", marginLeft:10 }}>×</button>
        </div>

        {/* body */}
        <div style={{ padding:"18px 20px 22px", display:"flex", flexDirection:"column", gap:14 }}>

          {uploadErr && (
            <div style={{ padding:"8px 12px", borderRadius:7, background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.25)", fontSize:12, color:"#fca5a5" }}>
              ⚠ {uploadErr}
            </div>
          )}

          {/* estado */}
          <div>
            <label style={{ fontSize:9, letterSpacing:2, color:C.t1, display:"block", marginBottom:8, textTransform:"uppercase", fontWeight:600 }}>Estado</label>
            <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
              {Object.entries(EST).map(([key,e]) => (
                <button key={key} onClick={() => setEstado(key)} style={{ padding:"6px 13px", borderRadius:99, fontSize:11, fontWeight:600, cursor:"pointer", border:estado===key?`1px solid ${e.border}`:`1px solid ${C.b0}`, background:estado===key?e.bg:"transparent", color:estado===key?e.color:C.t2, transition:"all .15s", fontFamily:C.sans }}>
                  {e.label}
                </button>
              ))}
            </div>
          </div>

          {/* laminador */}
          <div>
            <label style={{ fontSize:9, letterSpacing:2, color:C.t1, display:"block", marginBottom:6, textTransform:"uppercase", fontWeight:600 }}>Laminador</label>
            <input value={laminador} onChange={e => setLaminador(e.target.value)} placeholder="Nombre del laminador responsable…" style={INP}
              onFocus={e => e.currentTarget.style.borderColor="rgba(59,130,246,0.4)"} onBlur={e => e.currentTarget.style.borderColor=C.b0} />
          </div>

          {/* ubicación */}
          {showUbicacion && (
            <div style={{ animation:"plv-fadeup .2s ease" }}>
              <label style={{ fontSize:9, letterSpacing:2, color:C.t1, display:"block", marginBottom:6, textTransform:"uppercase", fontWeight:600 }}>¿Dónde está?</label>
              <input value={ubicacion} onChange={e => setUbicacion(e.target.value)} placeholder="Planta Pampa, enviada al astillero, en depósito, montada…" style={INP}
                onFocus={e => e.currentTarget.style.borderColor="rgba(59,130,246,0.4)"} onBlur={e => e.currentTarget.style.borderColor=C.b0} />
            </div>
          )}

          {/* observaciones */}
          <div>
            <label style={{ fontSize:9, letterSpacing:2, color:C.t1, display:"block", marginBottom:6, textTransform:"uppercase", fontWeight:600 }}>Observaciones</label>
            <textarea value={obs} onChange={e => setObs(e.target.value)} rows={3} placeholder="Fecha, problema encontrado, detalles…"
              style={{ ...INP, resize:"vertical", lineHeight:1.6 }}
              onFocus={e => e.currentTarget.style.borderColor="rgba(59,130,246,0.4)"} onBlur={e => e.currentTarget.style.borderColor=C.b0} />
          </div>

          {/* imágenes */}
          <div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
              <label style={{ fontSize:9, letterSpacing:2, color:C.t1, textTransform:"uppercase", fontWeight:600 }}>Imágenes ({imagenes.length})</label>
              <button onClick={() => { setUploadErr(""); fileRef.current?.click(); }} disabled={uploading}
                style={{ border:`1px solid ${C.b0}`, background:C.s0, color:uploading?C.t2:C.t0, padding:"4px 12px", borderRadius:6, cursor:uploading?"not-allowed":"pointer", fontSize:11, fontFamily:C.sans, display:"flex", alignItems:"center", gap:5 }}>
                {uploading ? "↑ Subiendo…" : <><IconCamera size={12} color="currentColor"/> &nbsp;Agregar foto</>}
              </button>
              <input ref={fileRef} type="file" accept="image/*,image/heic,image/heif" style={{ display:"none" }}
                onChange={e => { if (e.target.files?.[0]) subirImagen(e.target.files[0]); }} />
            </div>

            {imagenes.length === 0 && !uploading ? (
              <div onClick={() => { setUploadErr(""); fileRef.current?.click(); }}
                style={{ border:`1px dashed ${C.b0}`, borderRadius:10, padding:"24px 16px", textAlign:"center", color:C.t2, fontSize:12, cursor:"pointer", transition:"border-color .15s", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}
                onMouseEnter={e => e.currentTarget.style.borderColor=C.b1}
                onMouseLeave={e => e.currentTarget.style.borderColor=C.b0}>
                <IconCamera size={16} color={C.t2} /><span>Hacé click para agregar una imagen</span>
              </div>
            ) : (
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(100px,1fr))", gap:8 }}>
                {imagenes.map((img,i) => (
                  <div key={img.storage_path??i} style={{ position:"relative", borderRadius:8, overflow:"hidden", aspectRatio:"1", background:C.s1, border:`1px solid ${C.b0}` }}>
                    {img.url
                      ? <img src={img.url} alt={img.nombre} onClick={() => setLightbox(img.url)} style={{ width:"100%", height:"100%", objectFit:"cover", cursor:"zoom-in", display:"block" }} />
                      : <div style={{ width:"100%", height:"100%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, color:C.t2 }}>sin preview</div>}
                    <button onClick={() => eliminarImagen(img)} style={{ position:"absolute", top:4, right:4, background:"rgba(0,0,0,0.75)", border:"none", color:"#fff", width:20, height:20, borderRadius:"50%", cursor:"pointer", fontSize:12, display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>
                    {img.nombre && <div style={{ position:"absolute", bottom:0, left:0, right:0, background:"rgba(0,0,0,0.65)", padding:"3px 5px", fontSize:9, color:"#ccc", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{img.nombre}</div>}
                  </div>
                ))}
                <div onClick={() => { setUploadErr(""); fileRef.current?.click(); }}
                  style={{ aspectRatio:"1", border:`1px dashed ${C.b0}`, borderRadius:8, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:4, cursor:"pointer", color:C.t2, transition:"border-color .15s" }}
                  onMouseEnter={e => e.currentTarget.style.borderColor=C.b1}
                  onMouseLeave={e => e.currentTarget.style.borderColor=C.b0}>
                  <span style={{ fontSize:18 }}>+</span><span style={{ fontSize:9, letterSpacing:1 }}>FOTO</span>
                </div>
              </div>
            )}
          </div>

          {/* acciones */}
          <div style={{ display:"flex", gap:8, justifyContent:"flex-end", paddingTop:2 }}>
            <button onClick={onClose} style={{ border:`1px solid ${C.b0}`, background:"transparent", color:C.t1, padding:"7px 16px", borderRadius:8, cursor:"pointer", fontSize:12, fontFamily:C.sans }}>Cancelar</button>
            <button onClick={guardar} disabled={saving} style={{ border:"1px solid rgba(59,130,246,0.35)", background:"rgba(59,130,246,0.15)", color:"#60a5fa", padding:"7px 20px", borderRadius:8, cursor:saving?"not-allowed":"pointer", fontSize:12, fontWeight:600, fontFamily:C.sans, opacity:saving?0.5:1 }}>
              {saving ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── main ─────────────────────────────────────────────────────────────────────
export default function PiezasLaminacionView({ obras=[], esGestion=false }) {
  const [obraSelId,   setObraSelId]   = useState(null);
  const [seguimiento, setSeguimiento] = useState([]);
  const [imagenesMap, setImagenesMap] = useState({});
  const [loading,     setLoading]     = useState(false);
  const [piezaModal,  setPiezaModal]  = useState(null);
  const [q,           setQ]           = useState("");
  const [filtroEst,   setFiltroEst]   = useState("todos");
  const [filtroMat,   setFiltroMat]   = useState("todos");
  const [saving,      setSaving]      = useState(false);
  const [flash,       setFlash]       = useState(null);
  const [qObra,       setQObra]       = useState("");
  const [selected,    setSelected]    = useState(new Set());
  const [k52Variant,  setK52Variant]  = useState(null); // null | "softop" | "hardtop"

  const obraSel  = useMemo(() => obras.find(o => o.id === obraSelId) ?? null, [obras, obraSelId]);
  const lineaKey = useMemo(() => detectarLinea(obraSel), [obraSel]);
  const catalogo = useMemo(() => lineaKey ? CATALOGOS[lineaKey] : null, [lineaKey]);

  useEffect(() => { if (!obraSelId && obras.length > 0) setObraSelId(obras[0].id); }, [obras, obraSelId]);
  useEffect(() => { setSelected(new Set()); setQ(""); setFiltroEst("todos"); setK52Variant(null); }, [obraSelId]);

  const cargar = useCallback(async () => {
    if (!obraSelId) return;
    setLoading(true);
    const [{ data:seg }, { data:imgs }] = await Promise.all([
      supabase.from("piezas_laminacion_seguimiento").select("*").eq("obra_id", obraSelId),
      supabase.from("piezas_laminacion_imagenes").select("*").eq("obra_id", obraSelId),
    ]);
    setSeguimiento(seg ?? []);
    const rawImgs = imgs ?? [];
    if (rawImgs.length > 0) {
      const withUrls = await Promise.all(
        rawImgs.map(img =>
          supabase.storage.from(STORAGE_BUCKET).createSignedUrl(img.storage_path, 3600)
            .then(({ data }) => ({ ...img, url: data?.signedUrl ?? null }))
        )
      );
      const map = {};
      for (const img of withUrls) {
        const key = img.pieza_id ?? String(img.pieza_num);
        if (!map[key]) map[key] = [];
        map[key].push(img);
      }
      setImagenesMap(map);
    } else { setImagenesMap({}); }
    setLoading(false);
  }, [obraSelId]);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    if (!obraSelId) return;
    const ch = supabase.channel(`plv-${obraSelId}`)
      .on("postgres_changes", { event:"*", schema:"public", table:"piezas_laminacion_seguimiento", filter:`obra_id=eq.${obraSelId}` }, cargar)
      .on("postgres_changes", { event:"*", schema:"public", table:"piezas_laminacion_imagenes",    filter:`obra_id=eq.${obraSelId}` }, cargar)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [obraSelId, cargar]);

  // MOVIDO PARA EVITAR TEMPORAL DEAD ZONE
  const segMap = useMemo(() => {
    const m = {};
    for (const r of seguimiento) { const key = r.pieza_id ?? String(r.pieza_num); m[key] = r; }
    return m;
  }, [seguimiento]);

  const obrasFiltradas = useMemo(() => {
    const qq = qObra.trim().toLowerCase();
    if (!qq) return obras;
    return obras.filter(o => (o.codigo??o.nombre??"").toLowerCase().includes(qq) || (o.linea_nombre??"").toLowerCase().includes(qq));
  }, [obras, qObra]);

  const catalogoFiltradoVariant = useMemo(() => {
    if (!catalogo) return [];
    if (lineaKey !== "k52" || !k52Variant) return catalogo;
    return catalogo.filter(p => p.variant === null || p.variant === k52Variant);
  }, [catalogo, lineaKey, k52Variant]);

  const TOTAL = catalogoFiltradoVariant.length;

  const stats = useMemo(() => {
    if (!catalogoFiltradoVariant.length) return { byEst:{}, terminadas:0, pct:0 };
    const byEst = {};
    for (const k of Object.keys(EST)) byEst[k] = 0;
    for (const p of catalogoFiltradoVariant) { 
        const est = segMap[p.pieza_id]?.estado ?? "pendiente"; 
        byEst[est] = (byEst[est]??0)+1; 
    }
    const terminadas = (byEst.terminada??0) + (byEst.entregada??0);
    return { byEst, terminadas, pct: TOTAL ? Math.round(terminadas/TOTAL*100) : 0 };
  }, [segMap, catalogoFiltradoVariant, TOTAL]);

  const piezasFiltradas = useMemo(() => {
    if (!catalogoFiltradoVariant.length) return [];
    const qq = q.trim().toLowerCase();
    return catalogoFiltradoVariant.filter(p => {
      const est = segMap[p.pieza_id]?.estado ?? "pendiente";
      if (filtroEst !== "todos" && est !== filtroEst) return false;
      if (filtroMat === "nueva"    && !p.matriz) return false;
      if (filtroMat === "estandar" &&  p.matriz) return false;
      if (qq && !p.desc.toLowerCase().includes(qq) && !p.pieza_id.includes(qq) && !String(p.num).includes(qq)) return false;
      return true;
    });
  }, [q, filtroEst, filtroMat, segMap, catalogoFiltradoVariant]);

  const selectedIds = useMemo(() => [...selected], [selected]);
  const allVisibleSelected = piezasFiltradas.length > 0 && piezasFiltradas.every(p => selected.has(p.pieza_id));
  const someSelected = selectedIds.length > 0;

  function toggleSelect(id) { setSelected(prev => { const n=new Set(prev); n.has(id)?n.delete(id):n.add(id); return n; }); }
  function toggleSelectAll() {
    if (allVisibleSelected) { setSelected(prev => { const n=new Set(prev); piezasFiltradas.forEach(p=>n.delete(p.pieza_id)); return n; }); }
    else { setSelected(prev => { const n=new Set(prev); piezasFiltradas.forEach(p=>n.add(p.pieza_id)); return n; }); }
  }
  function clearSelection() { setSelected(new Set()); }

  async function cambiarEstado(ids, nuevoEstado) {
    if (!obraSelId || !ids.length) return;
    setSaving(true);
    const { data:{ user } } = await supabase.auth.getUser().catch(() => ({ data:{ user:null } }));
    const byId = {};
    (catalogo??[]).forEach(p => { byId[p.pieza_id] = p; });

    const { error } = await supabase.from("piezas_laminacion_seguimiento").upsert(
      ids.map(id => ({ obra_id:obraSelId, pieza_id:id, pieza_num:byId[id]?.num??null, estado:nuevoEstado, updated_at:new Date().toISOString(), updated_by:user?.id??null })),
      { onConflict:"obra_id,pieza_id" }
    );

    setSaving(false);

    if (error) {
      // Columna pieza_id no existe todavía → mostrar SQL al usuario
      const esMigracion = error.message?.includes("pieza_id") || error.message?.includes("column") || error.code === "42703" || error.code === "23505";
      showFlash(
        esMigracion
          ? "⚠ Falta migración SQL. Ver comentario al inicio del archivo."
          : "✗ Error: " + error.message,
        true
      );
      return;
    }

    showFlash(`✓ ${ids.length} pieza${ids.length>1?"s":""} → ${EST[nuevoEstado].label}`);
    clearSelection(); cargar();
  }

  function showFlash(msg, isError = false) { setFlash({ msg, isError }); setTimeout(() => setFlash(null), 3500); }

  const avanceColor = stats.pct >= 80 ? C.green : stats.pct >= 40 ? C.amber : C.blue;
  const lineaLabel  = lineaKey==="k52"?"K52":lineaKey==="k43"?"K43":lineaKey==="k37"?"K37":null;
  const hasMat      = catalogoFiltradoVariant?.some(p => p.matriz);

  function exportCSV() {
    if (!catalogoFiltradoVariant.length) return;
    const obra = obraSel?.codigo ?? obraSel?.nombre ?? "obra";
    const varTag = k52Variant ? `_${k52Variant}` : "";
    const rows = [["N° Pieza","Descripción","Estado","Laminador","Ubicación","Observaciones","Matriz"]];
    for (const p of catalogoFiltradoVariant) {
      const seg = segMap[p.pieza_id];
      const est = seg?.estado ?? "pendiente";
      rows.push([
        p.sub != null ? `${p.num}.${p.sub}` : `${p.num}`,
        p.desc,
        EST[est]?.label ?? est,
        seg?.laminador ?? "",
        seg?.ubicacion ?? "",
        seg?.observaciones ?? "",
        p.matriz ?? "",
      ]);
    }
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type:"text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `piezas_${obra}${varTag}_${lineaKey}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  function exportPrint() {
    if (!catalogoFiltradoVariant.length) return;
    const obra = obraSel?.codigo ?? obraSel?.nombre ?? "Obra";
    const varLabel = k52Variant ? ` · ${k52Variant.charAt(0).toUpperCase()+k52Variant.slice(1)}` : "";
    const estColor = { pendiente:"#777", en_proceso:"#3b82f6", terminada:"#10b981", entregada:"#8b5cf6", problema:"#ef4444" };
    const rows = catalogoFiltradoVariant.map(p => {
      const seg = segMap[p.pieza_id];
      const est = seg?.estado ?? "pendiente";
      const numStr = p.sub != null ? `${String(p.num).padStart(2,"0")}.${p.sub}` : String(p.num).padStart(2,"0");
      const color = estColor[est] ?? "#777";
      return `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;font-family:monospace;font-size:11px;color:#444">${numStr}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:12px">${p.desc}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee">
          <span style="background:${color}22;color:${color};border:1px solid ${color}55;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700;white-space:nowrap">${EST[est]?.label??est}</span>
        </td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:11px;color:#555">${seg?.laminador??""}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:11px;color:#555">${seg?.ubicacion??""}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:11px;color:#555">${seg?.observaciones??""}</td>
      </tr>`;
    }).join("");
    const term = (stats.byEst.terminada??0)+(stats.byEst.entregada??0);
    const pct  = TOTAL ? Math.round(term/TOTAL*100) : 0;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Piezas ${obra}</title>
      <style>body{font-family:system-ui,sans-serif;color:#111;margin:0;padding:20px}
      h1{margin:0 0 2px;font-size:18px}p{margin:0 0 12px;font-size:11px;color:#666}
      table{width:100%;border-collapse:collapse}
      th{padding:7px 8px;background:#f4f4f5;text-align:left;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#666;border-bottom:2px solid #ddd}
      @media print{@page{size:A4 landscape;margin:15mm}}</style>
      </head><body>
      <h1>Piezas de Laminación · ${obra}${varLabel}</h1>
      <p>${lineaLabel ?? ""} · ${TOTAL} piezas · ${pct}% terminadas · Generado ${new Date().toLocaleDateString("es-AR")}</p>
      <table><thead><tr>
        <th>N°</th><th>Descripción</th><th>Estado</th><th>Laminador</th><th>Ubicación</th><th>Observaciones</th>
      </tr></thead><tbody>${rows}</tbody></table>
      <script>window.onload=()=>{window.print()}<\/script></body></html>`;
    const w = window.open("","_blank");
    if (w) { w.document.write(html); w.document.close(); }
  }

  // Prevenir crashes si no hay obras cargadas todavía.
  if (!obras || obras.length === 0) {
    return <div style={{ color: C.t2, padding: "40px", textAlign: "center", fontFamily: C.sans }}>Cargando datos...</div>;
  }

  return (
    <>
      <style>{`
        @keyframes plv-kpi     { from{opacity:0;transform:scale(.94)} to{opacity:1;transform:scale(1)} }
        @keyframes plv-fadeup  { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:none} }
        @keyframes plv-slideup { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:none} }
        @keyframes plv-pulse   { 0%,100%{opacity:1} 50%{opacity:.3} }
        .plv-row { animation:plv-fadeup .25s ease both; }
        .plv-row:hover td { background:rgba(255,255,255,0.018)!important; }
        .plv-row td { transition:background .12s; }
        .plv-obra-btn { transition:all .15s; }
        .plv-obra-btn:hover { background:rgba(255,255,255,0.04)!important; }
        .plv-thumb { transition:transform .18s,box-shadow .18s; cursor:zoom-in; }
        .plv-thumb:hover { transform:scale(1.07); box-shadow:0 4px 16px rgba(0,0,0,.5); }
        .plv-qbtn { transition:all .13s; }
        .plv-qbtn:hover { opacity:.8; }
        .plv-check { accent-color:#3b82f6; cursor:pointer; width:13px; height:13px; }
        .plv-row-sel td { background:rgba(59,130,246,0.05)!important; }
      `}</style>

      {flash && (
        <div style={{ position:"fixed", bottom:22, right:22, zIndex:9999, padding:"10px 18px", borderRadius:8, fontFamily:C.sans, fontSize:12, fontWeight:600, background: flash.isError ? "rgba(18,6,6,0.97)" : "rgba(6,18,12,0.97)", border: `1px solid ${flash.isError ? "rgba(239,68,68,.4)" : "rgba(16,185,129,.35)"}`, color: flash.isError ? C.red : C.green, animation:"plv-slideup .22s ease", boxShadow:"0 8px 32px rgba(0,0,0,.6)", maxWidth: 360 }}>
          {flash.msg}
        </div>
      )}

      <div style={{ display:"flex", flexDirection:"column", height:"100%", fontFamily:C.sans, minHeight:0 }}>

        {/* header */}
        <div style={{ padding:"16px 22px 14px", borderBottom:`1px solid ${C.b0}`, flexShrink:0 }}>
          <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12, marginBottom:obraSel&&catalogo?14:0 }}>
            <div>
              <div style={{ fontSize:9, letterSpacing:2, textTransform:"uppercase", color:C.t2, marginBottom:4 }}>Laminación · Seguimiento de piezas</div>
              <h2 style={{ margin:0, fontSize:19, fontWeight:700, color:C.t0, lineHeight:1.2, fontFamily:C.mono, letterSpacing:1 }}>
                {obraSel ? (obraSel.codigo??obraSel.nombre??"—") : "Piezas de Laminación"}
              </h2>
              {obraSel?.linea_nombre && <div style={{ fontSize:11, color:C.t2, marginTop:3, letterSpacing:1 }}>{obraSel.linea_nombre}</div>}
            </div>
            {obraSel && catalogo && (
              <div style={{ display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
                <ProgressRing pct={stats.pct} size={50} stroke={4} color={avanceColor} />
                <div>
                  <div style={{ fontFamily:C.mono, fontSize:20, fontWeight:700, color:avanceColor, lineHeight:1 }}>{stats.pct}%</div>
                  <div style={{ fontSize:10, color:C.t2, marginTop:2 }}>{stats.terminadas}/{TOTAL} listas</div>
                </div>
              </div>
            )}
          </div>
          {obraSel && catalogo && (
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))", gap:7 }}>
              <KpiCard label="Terminadas" value={stats.byEst.terminada??0}  total={TOTAL} color={C.green}  delay={0}    />
              <KpiCard label="En proceso" value={stats.byEst.en_proceso??0} total={TOTAL} color={C.blue}   delay={0.06} />
              <KpiCard label="Entregadas" value={stats.byEst.entregada??0}  total={TOTAL} color={C.purple} delay={0.12} />
              <KpiCard label="Problemas"  value={stats.byEst.problema??0}   total={TOTAL} color={C.red}    delay={0.18} />
              <KpiCard label="Pendientes" value={stats.byEst.pendiente??0}  total={TOTAL} color={C.t2}     delay={0.24} />
            </div>
          )}
        </div>

        {/* body */}
        <div style={{ flex:1, overflow:"hidden", display:"grid", gridTemplateColumns:"230px 1fr", minHeight:0 }}>

          {/* sidebar obras */}
          <div style={{ borderRight:`1px solid ${C.b0}`, display:"flex", flexDirection:"column", overflow:"hidden" }}>
            <div style={{ padding:"10px 10px 8px", borderBottom:`1px solid ${C.b0}`, flexShrink:0 }}>
              <input value={qObra} onChange={e => setQObra(e.target.value)} placeholder="Buscar obra…"
                style={{ background:C.s0, border:`1px solid ${C.b0}`, color:C.t0, padding:"6px 10px", borderRadius:7, fontSize:11, outline:"none", width:"100%", boxSizing:"border-box", fontFamily:C.sans }} />
            </div>
            <div style={{ flex:1, overflowY:"auto", padding:"6px" }}>
              {obrasFiltradas.length===0 && <div style={{ padding:"28px 12px", textAlign:"center", color:C.t2, fontSize:11 }}>Sin obras</div>}
              {obrasFiltradas.map(o => {
                const sel   = o.id === obraSelId;
                const color = OBRA_COLOR[o.estado] ?? C.t2;
                const lk    = detectarLinea(o);
                return (
                  <button key={o.id} onClick={() => setObraSelId(o.id)} className="plv-obra-btn"
                    style={{ width:"100%", textAlign:"left", padding:"9px 10px", borderRadius:8, marginBottom:3, cursor:"pointer", fontFamily:C.sans, background:sel?C.s1:"transparent", border:sel?`1px solid ${C.b1}`:"1px solid transparent", borderLeft:`2.5px solid ${sel?color:"transparent"}` }}>
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <Dot color={color} size={5} />
                      <span style={{ fontWeight:sel?700:500, fontSize:12, color:sel?C.t0:C.t1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1, fontFamily:C.mono, letterSpacing:0.5 }}>
                        {o.codigo??o.nombre??"—"}
                      </span>
                      {lk && (
                        <span style={{ fontSize:7, fontWeight:700, letterSpacing:1, padding:"1px 5px", borderRadius:3,
                          background: lk==="k52"?"rgba(139,92,246,0.12)":lk==="k37"?"rgba(20,184,166,0.12)":"rgba(245,158,11,0.1)",
                          color:      lk==="k52"?C.purple:lk==="k37"?"#2dd4bf":C.amber,
                          border:     `1px solid ${lk==="k52"?"rgba(139,92,246,0.25)":lk==="k37"?"rgba(20,184,166,0.25)":"rgba(245,158,11,0.2)"}`,
                        }}>
                          {lk.toUpperCase()}
                        </span>
                      )}
                    </div>
                    {o.linea_nombre && <div style={{ fontSize:9, color:C.t2, paddingLeft:11, marginTop:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{o.linea_nombre}</div>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* tabla piezas */}
          <div style={{ display:"flex", flexDirection:"column", overflow:"hidden", minWidth:0 }}>
            {!obraSel ? (
              <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center" }}>
                <div style={{ fontSize:11, color:C.t2, letterSpacing:2, textTransform:"uppercase" }}>Seleccioná una obra</div>
              </div>
            ) : !catalogo ? (
              <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:14, padding:40 }}>
                <div style={{ width:52, height:52, borderRadius:"50%", background:C.s0, border:`1px solid ${C.b0}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, color:C.t2 }}>◎</div>
                <div style={{ fontSize:15, fontWeight:700, color:C.t1 }}>Sin plantilla de piezas</div>
                <div style={{ fontSize:12, color:C.t2, textAlign:"center", maxWidth:340, lineHeight:1.6 }}>
                  Esta obra no tiene catálogo. Hay plantillas para K37, K43 y K52.
                </div>
                <div style={{ fontSize:10, color:C.t2, fontFamily:C.mono, padding:"6px 14px", borderRadius:6, background:C.s0, border:`1px solid ${C.b0}` }}>
                  Línea: {obraSel.linea_nombre??"sin asignar"} · Código: {obraSel.codigo??"—"}
                </div>
              </div>
            ) : (
              <>
                {/* toolbar */}
                <div style={{ padding:"9px 14px", borderBottom:`1px solid ${C.b0}`, display:"flex", gap:7, flexWrap:"wrap", alignItems:"center", flexShrink:0 }}>
                  {lineaLabel && (
                    <span style={{ fontSize:8, fontWeight:700, letterSpacing:1.5, padding:"3px 8px", borderRadius:4,
                      background: lineaKey==="k52"?"rgba(139,92,246,0.1)":lineaKey==="k37"?"rgba(20,184,166,0.1)":"rgba(245,158,11,0.08)",
                      color:      lineaKey==="k52"?C.purple:lineaKey==="k37"?"#2dd4bf":C.amber,
                      border:     `1px solid ${lineaKey==="k52"?"rgba(139,92,246,0.25)":lineaKey==="k37"?"rgba(20,184,166,0.25)":"rgba(245,158,11,0.2)"}`,
                    }}>
                      {lineaLabel} · {TOTAL} piezas
                    </span>
                  )}

                  {/* K52 variant selector */}
                  {lineaKey === "k52" && (
                    <div style={{ display:"flex", gap:3, background:"rgba(255,255,255,0.03)", border:`1px solid ${C.b0}`, borderRadius:7, padding:3 }}>
                      {[["todos", null, "Todos"], ["softop", "softop", "Softop"], ["hardtop", "hardtop", "Hardtop"]].map(([key, val, label]) => {
                        const active = k52Variant === val;
                        const col = val === "softop" ? "#22d3ee" : val === "hardtop" ? C.amber : C.t1;
                        return (
                          <button key={key} onClick={() => setK52Variant(val)}
                            style={{ padding:"3px 10px", borderRadius:5, border: active ? `1px solid ${col}50` : "1px solid transparent",
                              background: active ? `${col}18` : "transparent",
                              color: active ? col : C.t2, fontSize:10, fontWeight:active?700:500,
                              cursor:"pointer", fontFamily:C.sans, transition:"all .15s", whiteSpace:"nowrap" }}>
                            {val === "softop" && "⛵ "}{val === "hardtop" && "🔧 "}{label}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar pieza…"
                    style={{ background:C.s0, border:`1px solid ${C.b0}`, color:C.t0, padding:"5px 10px", borderRadius:6, fontSize:11, outline:"none", width:150, fontFamily:C.sans }} />
                  <select value={filtroEst} onChange={e => setFiltroEst(e.target.value)}
                    style={{ background:"#0f0f12", border:`1px solid ${C.b0}`, color:C.t1, padding:"5px 8px", borderRadius:6, fontSize:11, outline:"none", fontFamily:C.sans, cursor:"pointer" }}>
                    <option value="todos">Todos los estados</option>
                    {Object.entries(EST).map(([k,e]) => <option key={k} value={k}>{e.label} ({stats.byEst[k]??0})</option>)}
                  </select>
                  {hasMat && (
                    <select value={filtroMat} onChange={e => setFiltroMat(e.target.value)}
                      style={{ background:"#0f0f12", border:`1px solid ${C.b0}`, color:C.t1, padding:"5px 8px", borderRadius:6, fontSize:11, outline:"none", fontFamily:C.sans, cursor:"pointer" }}>
                      <option value="todos">Todas las matrices</option>
                      <option value="nueva">✦ Nueva</option>
                      <option value="estandar">Estándar</option>
                    </select>
                  )}
                  <div style={{ flex:1 }} />
                  <span style={{ fontSize:10, color:C.t2 }}>{piezasFiltradas.length}/{TOTAL}</span>

                  {/* export buttons */}
                  <div style={{ display:"flex", gap:4 }}>
                    <button onClick={exportCSV} title="Exportar CSV"
                      style={{ border:`1px solid rgba(16,185,129,0.3)`, background:"rgba(16,185,129,0.07)", color:"#34d399", padding:"4px 10px", borderRadius:6, cursor:"pointer", fontSize:10, fontWeight:600, fontFamily:C.sans, display:"flex", alignItems:"center", gap:4 }}>
                      ↓ CSV
                    </button>
                    <button onClick={exportPrint} title="Imprimir / Exportar PDF"
                      style={{ border:`1px solid rgba(59,130,246,0.3)`, background:"rgba(59,130,246,0.07)", color:"#60a5fa", padding:"4px 10px", borderRadius:6, cursor:"pointer", fontSize:10, fontWeight:600, fontFamily:C.sans, display:"flex", alignItems:"center", gap:4 }}>
                      🖨 PDF
                    </button>
                  </div>

                  {esGestion && someSelected && (
                    <div style={{ display:"flex", gap:5, alignItems:"center", padding:"3px 10px", borderRadius:7, background:"rgba(59,130,246,0.06)", border:"1px solid rgba(59,130,246,0.2)", animation:"plv-fadeup .18s ease" }}>
                      <span style={{ fontSize:10, color:C.blue, fontFamily:C.mono, marginRight:4 }}>{selectedIds.length} sel.</span>
                      {[["en_proceso","▶ En proceso","rgba(59,130,246,0.35)","rgba(59,130,246,0.12)","#60a5fa"],
                        ["terminada","✓ Terminadas","rgba(16,185,129,0.35)","rgba(16,185,129,0.1)","#34d399"],
                        ["entregada","↗ Entregadas","rgba(139,92,246,0.35)","rgba(139,92,246,0.1)","#a78bfa"],
                        ["pendiente","○ Pendiente",C.b0,"transparent",C.t2]
                      ].map(([est,lbl,border,bg,color]) => (
                        <button key={est} className="plv-qbtn" onClick={() => cambiarEstado(selectedIds, est)} disabled={saving}
                          style={{ border:`1px solid ${border}`, background:bg, color, padding:"3px 9px", borderRadius:5, cursor:"pointer", fontSize:10, fontWeight:600, fontFamily:C.sans }}>
                          {lbl}
                        </button>
                      ))}
                      <button onClick={clearSelection} style={{ background:"transparent", border:"none", color:C.t2, cursor:"pointer", fontSize:14, padding:"0 3px", lineHeight:1 }}>×</button>
                    </div>
                  )}

                  {esGestion && !someSelected && piezasFiltradas.length > 0 && (
                    <div style={{ display:"flex", gap:5 }}>
                      <button className="plv-qbtn" onClick={() => cambiarEstado(piezasFiltradas.map(p=>p.pieza_id),"en_proceso")} disabled={saving}
                        style={{ border:"1px solid rgba(59,130,246,0.3)", background:"rgba(59,130,246,0.07)", color:"#60a5fa", padding:"4px 10px", borderRadius:6, cursor:"pointer", fontSize:10, fontWeight:600, fontFamily:C.sans }}>→ En proceso</button>
                      <button className="plv-qbtn" onClick={() => cambiarEstado(piezasFiltradas.map(p=>p.pieza_id),"terminada")} disabled={saving}
                        style={{ border:"1px solid rgba(16,185,129,0.3)", background:"rgba(16,185,129,0.07)", color:"#34d399", padding:"4px 10px", borderRadius:6, cursor:"pointer", fontSize:10, fontWeight:600, fontFamily:C.sans }}>✓ Terminadas</button>
                    </div>
                  )}
                </div>

                {/* tabla */}
                <div style={{ flex:1, overflowY:"auto" }}>
                  {loading ? (
                    <div style={{ padding:"40px 20px", textAlign:"center", color:C.t2, fontSize:11, letterSpacing:2, textTransform:"uppercase" }}>Cargando…</div>
                  ) : (
                    <table style={{ width:"100%", borderCollapse:"collapse" }}>
                      <thead style={{ position:"sticky", top:0, zIndex:2 }}>
                        <tr style={{ background:"#0c0c0f" }}>
                          <th style={{ padding:"8px 10px 8px 14px", borderBottom:`1px solid ${C.b0}`, width:28 }}>
                            <input type="checkbox" className="plv-check" checked={allVisibleSelected} onChange={toggleSelectAll} />
                          </th>
                          {["N° pieza","Descripción",...(hasMat?["Matriz"]:[]),"Estado","Laminador","Ubicación","Fotos","Obs.",""].map(h => (
                            <th key={h} style={{ padding:"8px 12px", textAlign:"left", fontSize:8, color:C.t2, letterSpacing:2, textTransform:"uppercase", borderBottom:`1px solid ${C.b0}`, fontWeight:600, whiteSpace:"nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {piezasFiltradas.map(pieza => {
                          const seg       = segMap[pieza.pieza_id];
                          const estado    = seg?.estado ?? "pendiente";
                          const imgs      = imagenesMap[pieza.pieza_id] ?? [];
                          const isSel     = selected.has(pieza.pieza_id);
                          const ubicacion = seg?.ubicacion;
                          const laminador = seg?.laminador;
                          const estInfo   = EST[estado] ?? EST.pendiente;
                          const numLabel  = pieza.sub != null
                            ? <><span style={{ fontFamily:C.mono, fontSize:10, color:C.t2 }}>{String(pieza.num).padStart(2,"0")}</span><span style={{ color:C.amber, fontFamily:C.mono, fontSize:10 }}> · {pieza.sub}</span></>
                            : <span style={{ fontFamily:C.mono, fontSize:10, color:C.t2 }}>{String(pieza.num).padStart(2,"0")}</span>;
                          const variantBadge = pieza.variant === "softop"
                            ? <span style={{ fontSize:7, fontWeight:700, letterSpacing:1, padding:"1px 5px", borderRadius:3, background:"rgba(34,211,238,0.10)", color:"#22d3ee", border:"1px solid rgba(34,211,238,0.25)", marginLeft:4, whiteSpace:"nowrap" }}>SOFTOP</span>
                            : pieza.variant === "hardtop"
                            ? <span style={{ fontSize:7, fontWeight:700, letterSpacing:1, padding:"1px 5px", borderRadius:3, background:"rgba(245,158,11,0.10)", color:C.amber, border:"1px solid rgba(245,158,11,0.25)", marginLeft:4, whiteSpace:"nowrap" }}>HARDTOP</span>
                            : null;

                          return (
                            <tr key={pieza.pieza_id} className={`plv-row${isSel?" plv-row-sel":""}`}
                              style={{ background:estado==="problema"?"rgba(239,68,68,0.03)":"transparent" }}>

                              <td style={{ padding:"8px 10px 8px 14px", borderBottom:`1px solid rgba(255,255,255,0.04)`, verticalAlign:"middle", borderLeft:`2px solid ${estInfo.color}` }} onClick={e => e.stopPropagation()}>
                                <input type="checkbox" className="plv-check" checked={isSel} onChange={() => toggleSelect(pieza.pieza_id)} />
                              </td>
                              <td style={{ padding:"10px 10px", borderBottom:`1px solid rgba(255,255,255,0.04)`, verticalAlign:"middle", whiteSpace:"nowrap" }}>{numLabel}</td>
                              <td style={{ padding:"10px 12px", borderBottom:`1px solid rgba(255,255,255,0.04)`, verticalAlign:"middle", maxWidth:220 }}>
                                <button onClick={() => setPiezaModal(pieza)}
                                  style={{ background:"transparent", border:"none", cursor:"pointer", textAlign:"left", padding:0, fontFamily:C.sans, display:"flex", alignItems:"center", flexWrap:"wrap", gap:2 }}
                                  onMouseEnter={e => e.currentTarget.querySelector("span").style.color=C.t0}
                                  onMouseLeave={e => e.currentTarget.querySelector("span").style.color=C.t1}>
                                  <span style={{ fontSize:12, fontWeight:500, color:C.t1, display:"block", transition:"color .15s" }}>{pieza.desc}</span>
                                  {variantBadge}
                                </button>
                              </td>

                              {hasMat && (
                                <td style={{ padding:"10px 12px", borderBottom:`1px solid rgba(255,255,255,0.04)`, verticalAlign:"middle" }}>
                                  {pieza.matriz
                                    ? <span style={{ fontSize:8, letterSpacing:1, padding:"2px 7px", borderRadius:99, background:"rgba(245,158,11,0.09)", color:C.amber, border:"1px solid rgba(245,158,11,0.2)", fontWeight:700, whiteSpace:"nowrap" }}>✦ {pieza.matriz}</span>
                                    : <span style={{ opacity:0.15, fontSize:10 }}>—</span>}
                                </td>
                              )}

                              <td style={{ padding:"8px 12px", borderBottom:`1px solid rgba(255,255,255,0.04)`, verticalAlign:"middle" }}>
                                <div style={{ display:"flex", alignItems:"center", gap:5, flexWrap:"wrap" }}>
                                  <Dot color={EST[estado]?.color??C.t2} size={5} pulse={estado==="en_proceso"} />
                                  <Chip estado={estado} sm />
                                  {esGestion && (
                                    <div style={{ display:"flex", gap:2, marginLeft:2 }} onClick={e => e.stopPropagation()}>
                                      {estado !== "en_proceso" && (
                                        <button className="plv-qbtn" title="En proceso" onClick={() => cambiarEstado([pieza.pieza_id],"en_proceso")}
                                          style={{ width:20, height:20, border:"1px solid rgba(59,130,246,0.3)", background:"rgba(59,130,246,0.08)", color:"#60a5fa", borderRadius:4, cursor:"pointer", fontSize:9, display:"flex", alignItems:"center", justifyContent:"center" }}>▶</button>
                                      )}
                                      {estado !== "terminada" && (
                                        <button className="plv-qbtn" title="Terminada" onClick={() => cambiarEstado([pieza.pieza_id],"terminada")}
                                          style={{ width:20, height:20, border:"1px solid rgba(16,185,129,0.3)", background:"rgba(16,185,129,0.08)", color:"#34d399", borderRadius:4, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                                          <IconCheck size={10} />
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </td>

                              <td style={{ padding:"10px 12px", borderBottom:`1px solid rgba(255,255,255,0.04)`, verticalAlign:"middle", maxWidth:130 }}>
                                {laminador
                                  ? <span style={{ fontSize:11, color:C.t1, display:"block", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }} title={laminador}>{laminador}</span>
                                  : <span style={{ opacity:0.18, fontSize:11 }}>—</span>}
                              </td>

                              <td style={{ padding:"10px 12px", borderBottom:`1px solid rgba(255,255,255,0.04)`, verticalAlign:"middle", maxWidth:130 }}>
                                {ubicacion
                                  ? <span style={{ fontSize:10, color:C.t1, display:"block", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }} title={ubicacion}>{ubicacion}</span>
                                  : <span style={{ opacity:0.18, fontSize:10 }}>—</span>}
                              </td>

                              <td style={{ padding:"8px 12px", borderBottom:`1px solid rgba(255,255,255,0.04)`, verticalAlign:"middle" }}>
                                <div style={{ display:"flex", gap:4, alignItems:"center" }}>
                                  {imgs.slice(0,3).map((img,i) =>
                                    img.url ? <img key={i} src={img.url} alt="" className="plv-thumb" onClick={() => setPiezaModal(pieza)}
                                      style={{ width:28, height:28, borderRadius:5, objectFit:"cover", border:`1px solid ${C.b0}` }} /> : null
                                  )}
                                  {imgs.length>3 && <span style={{ fontSize:9, color:C.t2, background:C.s1, border:`1px solid ${C.b0}`, borderRadius:5, padding:"2px 5px", fontFamily:C.mono }}>+{imgs.length-3}</span>}
                                  <button onClick={() => setPiezaModal(pieza)}
                                    style={{ background:"transparent", border:`1px dashed ${C.b0}`, color:C.t2, width:28, height:28, borderRadius:5, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", transition:"border-color .15s", flexShrink:0 }}
                                    onMouseEnter={e => e.currentTarget.style.borderColor=C.b1}
                                    onMouseLeave={e => e.currentTarget.style.borderColor=C.b0}>
                                    {imgs.length===0 ? <IconCamera size={13} color={C.t2} /> : <span style={{ fontSize:13, lineHeight:1 }}>+</span>}
                                  </button>
                                </div>
                              </td>

                              <td style={{ padding:"10px 12px", borderBottom:`1px solid rgba(255,255,255,0.04)`, verticalAlign:"middle", maxWidth:150 }}>
                                {seg?.observaciones
                                  ? <span style={{ fontSize:11, color:C.t2, display:"block", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }} title={seg.observaciones}>{seg.observaciones}</span>
                                  : <span style={{ opacity:0.18, fontSize:11 }}>—</span>}
                              </td>

                              <td style={{ padding:"8px 12px", borderBottom:`1px solid rgba(255,255,255,0.04)`, verticalAlign:"middle" }}>
                                <button onClick={() => setPiezaModal(pieza)}
                                  style={{ border:`1px solid ${C.b0}`, background:"transparent", color:C.t2, padding:"3px 9px", borderRadius:5, cursor:"pointer", fontSize:10, fontFamily:C.sans, transition:"all .15s" }}
                                  onMouseEnter={e => { e.currentTarget.style.borderColor=C.b1; e.currentTarget.style.color=C.t0; }}
                                  onMouseLeave={e => { e.currentTarget.style.borderColor=C.b0; e.currentTarget.style.color=C.t2; }}>
                                  Detalle
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                  {!loading && piezasFiltradas.length===0 && (
                    <div style={{ padding:"40px 20px", textAlign:"center" }}>
                      <div style={{ fontSize:12, color:C.t2 }}>Sin resultados</div>
                      {(q||filtroEst!=="todos"||filtroMat!=="todos") && (
                        <button onClick={() => { setQ(""); setFiltroEst("todos"); setFiltroMat("todos"); }}
                          style={{ marginTop:10, border:`1px solid ${C.b0}`, background:"transparent", color:C.t1, padding:"5px 12px", borderRadius:6, cursor:"pointer", fontSize:11, fontFamily:C.sans }}>
                          Limpiar filtros
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* pie */}
                <div style={{ padding:"7px 14px", borderTop:`1px solid ${C.b0}`, flexShrink:0, display:"flex", alignItems:"center", gap:10 }}>
                  {someSelected && <span style={{ fontSize:10, color:C.blue, fontFamily:C.mono }}>{selectedIds.length} seleccionada{selectedIds.length>1?"s":""}</span>}
                  <div style={{ flex:1, height:3, background:"rgba(255,255,255,0.05)", borderRadius:99, overflow:"hidden" }}>
                    <div style={{ height:"100%", width:`${stats.pct}%`, background:`linear-gradient(90deg,${avanceColor}60,${avanceColor})`, borderRadius:99, transition:"width .6s ease" }} />
                  </div>
                  <span style={{ fontFamily:C.mono, fontSize:10, color:avanceColor, whiteSpace:"nowrap" }}>{stats.pct}% · {stats.terminadas}/{TOTAL}</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {piezaModal && (
        <PiezaModal
          pieza={piezaModal} lineaKey={lineaKey} obraId={obraSelId}
          segRow={segMap[piezaModal.pieza_id]}
          imagenes={imagenesMap[piezaModal.pieza_id] ?? []}
          onSave={() => { setPiezaModal(null); showFlash("✓ Guardado"); cargar(); }}
          onClose={() => setPiezaModal(null)}
        />
      )}
    </>
  );
}