/**
 * MapaProduccion.jsx  v12 — "PNG Blueprint Edition"
 * ─────────────────────────────────────────────────────────────────────────────
 * MAPEO DE PLANOS REALES (PNG fondo negro, blend: screen):
 *   k37  Express Sport Cruiser  → líneas cyan
 *   k42  Open Sport Runabout    → líneas cyan
 *   k43  Utility / Fishing      → líneas naranja/dorado
 *   k52  Motor Cruiser Cabina   → líneas verde
 *   k55  Sport Cruiser 55'      → líneas blanco/plata
 *   k64  Yate Clásico Largo     → líneas rosa/lila
 *
 * FEATURES v12 (= v11 + PNGs reales):
 *  ① Menú Radial Contextual (click derecho)
 *  ② Command Palette ⌘K
 *  ③ Modo Cinemático / Foco (F)
 *  ④ Ping Sonar en obras pausadas
 *  ⑤ Radar HUD minimap
 *  ⑥ Keyboard shortcuts (E R ± F Esc ⌘K)
 *  ⑦ Center-on-puesto desde palette
 *  ⑧ PNG blend-mode screen (fondo negro = transparente)
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useState, useMemo, useRef, useCallback, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import k37Img from "./k37.png";
import k42Img from "./k42.png";
import k43Img from "./k43.png";
import k52Img from "./k52.png";
import k55Img from "./k55.png";
import k64Img from "./k64.png";

/* ─── PALETA ─────────────────────────────────────────────────── */
const C = {
  bg:"#05050a", b0:"rgba(255,255,255,0.06)", b1:"rgba(255,255,255,0.12)",
  s0:"rgba(255,255,255,0.03)", s1:"rgba(255,255,255,0.07)",
  t0:"#ffffff", t1:"#a1a1aa", t2:"#52525b",
  sans:"'Outfit', system-ui, sans-serif",
  mono:"'JetBrains Mono', 'Fira Code', monospace",
  obra:{
    activa:   {top:"#1d4ed8",glow:"#3b82f6",label:"Activa"},
    pausada:  {top:"#92400e",glow:"#f59e0b",label:"Pausada"},
    terminada:{top:"#065f46",glow:"#10b981",label:"Terminada"},
    cancelada:{top:"#7f1d1d",glow:"#ef4444",label:"Cancelada"},
    vacio:    {top:"transparent",glow:"#6366f1",label:"Disponible"},
  },
};
const GLASS={
  background:"rgba(10,10,15,0.88)",
  backdropFilter:"blur(24px) saturate(160%)",
  WebkitBackdropFilter:"blur(24px) saturate(160%)",
  border:`1px solid ${C.b0}`,
  boxShadow:"0 8px 32px -4px rgba(0,0,0,0.7),inset 0 1px 0 rgba(255,255,255,0.05)",
};

const VB_W=1900, VB_H=840;

/* ─── MEMORIAS DESCRIPTIVAS (mock — inyectá tu CSV aquí por obra.codigo) ──────
   Clave: codigo de obra tal como viene en el prop `obras` (ej: "37-21").
   Los campos que ya existen en el objeto `obra` del padre tienen prioridad;
   este dict actúa como fallback / datos extra del CSV.
   Para poblarlo desde tus CSVs: importá el JSON generado y mezclalo aquí.
─────────────────────────────────────────────────────────────────────────────── */
const MEMORIAS_DB = {
  "37-21": {
    motorizacion:      "2 × Mercury 450 HP fuera de borda, nafta",
    grupo_electrogeno: "Kohler 9 kva",
    propietario:       "Darío Rosenthal",
    constructor:       null,
    madera_muebles:    "Gris Terso",
    color_mesadas:     "Cocina y baño: Olimpo — Cockpit: Niagara Pulido",
    color_casco:       "Blanco",
    piso:              "La Europea White",
    starlink:          true,
    teca_cockpit:      true,
    sternthruster:     false,
    electronica:       "Simrad NSX 9\" + GO9",
    audio_exterior:    "Fusion con RGB",
    color_acolchados:  "Shani 07",
    color_exterior:    "Vertigo Gris claro",
  },
  "37-22": {
    motorizacion:      null,
    grupo_electrogeno: null,
    propietario:       "Ariel",
    constructor:       null,
    madera_muebles:    null,
    color_mesadas:     null,
    starlink:          true,
    teca_cockpit:      false,
    sternthruster:     false,
  },
  "37-23": {
    motorizacion:      null,
    grupo_electrogeno: null,
    propietario:       "Gustavo Borrajo",
    constructor:       null,
    madera_muebles:    null,
    color_mesadas:     "Baño cockpit: Niagara — Cocina: Olimpo",
    starlink:          true,
    teca_cockpit:      true,
    sternthruster:     true,
    color_acolchados:  "Anila 01",
    color_exterior:    "Gris claro / Pranna Gris Oscuro",
  },
  "37-30": {
    motorizacion:      "2 × Volvo D3-270 HP",
    grupo_electrogeno: "Onan 6 kva",
    propietario:       "Agustín Trosman",
    constructor:       "Roberto González",
    madera_muebles:    "Nogal Italiano Rayado",
    color_mesadas:     "Prima Travertino Navona",
    color_casco:       null,
    piso:              "Europea Nature Álamo",
    starlink:          true,
    teca_cockpit:      false,
    sternthruster:     true,
    electronica:       null,
    color_cerramientos:"Charcoal",
    color_exterior:    "Cuerina Blanca Rivete Blanco",
    color_acolchados:  null,
    adicionales:       "Sillón más grande (Curvo) · Griferías negras FV Epuyén",
  },
  // ── Agregá más barcos aquí siguiendo el mismo esquema ──
  // "37-31": { ... },
};

/* ─── ZONAS ──────────────────────────────────────────────────── */
const ZONAS=[
  {id:"z-elec",  x:5,   y:5,  w:55, h:72, label:"ELEC.\n(PB)",                                          bc:"#3b82f6",dim:true},
  {id:"z-vid",   x:355, y:5,  w:85, h:112,label:"DEPÓSITO\nVIDRIOS",                                    bc:"#ef4444"},
  {id:"z-pan",   x:720, y:5,  w:450,h:148,label:"P.B.: PAÑOL / DEPÓSITO\n1° PISO: OFICINA Y TAPICERÍA",bc:"#3b82f6"},
  {id:"z-tanq",  x:1170,y:5,  w:98, h:148,label:"ALMAC.\nTANQ.",                                        dim:true},
  {id:"z-acceso",x:1268,y:5,  w:78, h:195,label:"ACCESO\nVEHICULAR\nPROV.",                             bc:"#22c55e",dim:true,dashed:true},
  {id:"z-mec",   x:1660,y:5,  w:235,h:145,label:"MECÁNICA\n(PLANTA BAJA)",                              bc:"#06b6d4"},
  {id:"z-ptp",   x:1010,y:153,w:75, h:65, label:"Portón\npañol",                                        dim:true,small:true},
  {id:"z-dp",    x:1087,y:153,w:75, h:65, label:"Descarga\nPañol",                                      dim:true,small:true,dashed:true},
  {id:"z-mot",   x:295, y:330,w:240,h:185,label:"ZONA\nALMACÉN MOTORES\nY GENERADORES"},
  {id:"z-mad",   x:740, y:155,w:380,h:168,label:"DEPÓSITO MADERAS\n(PLANTA BAJA)"},
  {id:"z-laq",   x:5,   y:635,w:138,h:200,label:"LAQUEADOR\n(Planta Baja)",                             dim:true},
  {id:"z-carp",  x:720, y:618,w:305,h:217,label:"P.B.: CARPINTERÍA\n1° PISO: BAÑOS Y RESTO LIBRE"},
];
const WALLS=[
  [5,77,155,77],[155,5,155,330],[355,77,355,530],[5,530,560,530],
  [720,153,1170,153],[1170,5,1170,153],[1268,153,1660,153],[1268,200,1268,5],
  [1660,150,1895,150],[740,153,740,323],[157,635,157,835],[720,618,1025,618],
  [1025,618,1025,835],[560,525,740,525],[1305,5,1305,835],
];

/* ─── BOAT IMAGE MAP ─────────────────────────────────────────────
   Los PNG tienen fondo negro. Con mixBlendMode:"screen" sobre el
   fondo oscuro del SVG (#05050a) el negro desaparece y solo
   quedan visibles las líneas de color del plano.
─────────────────────────────────────────────────────────────────── */
const BOAT_IMGS = {
  k37: k37Img,
  k42: k42Img,
  k43: k43Img,
  k52: k52Img,
  k55: k55Img,
  k64: k64Img,
};

/* ─── PUESTOS INICIALES ──────────────────────────────────────── */
let _nextN=23;
const genId=()=>`puesto-${String(_nextN++).padStart(2,"0")}`;
const PUESTOS_INITIAL=[
  {id:"puesto-01", label:"01", cx:72,   cy:172, w:92,  h:178, rot:0, tipo:"k52"},
  {id:"puesto-02", label:"02", cx:72,   cy:375, w:92,  h:178, rot:0, tipo:"k52"},
  {id:"puesto-03", label:"03", cx:72,   cy:578, w:92,  h:178, rot:0, tipo:"k52"},
  {id:"puesto-04", label:"04", cx:195,  cy:172, w:75,  h:158, rot:0, tipo:"k43"},
  {id:"puesto-05", label:"05", cx:195,  cy:350, w:75,  h:158, rot:0, tipo:"k43"},
  {id:"puesto-06", label:"06", cx:218,  cy:716, w:58,  h:110, rot:0, tipo:"k37"},
  {id:"puesto-07", label:"07", cx:305,  cy:716, w:58,  h:110, rot:0, tipo:"k37"},
  {id:"puesto-08", label:"08", cx:400,  cy:716, w:58,  h:110, rot:0, tipo:"k37"},
  {id:"puesto-09", label:"09", cx:543,  cy:72,  w:75,  h:140, rot:0, tipo:"k42"},
  {id:"puesto-10", label:"10", cx:543,  cy:235, w:75,  h:140, rot:0, tipo:"k42"},
  {id:"puesto-11", label:"11", cx:543,  cy:398, w:75,  h:140, rot:0, tipo:"k42"},
  {id:"puesto-12", label:"12", cx:543,  cy:545, w:75,  h:130, rot:0, tipo:"k42"},
  {id:"puesto-13", label:"13", cx:548,  cy:716, w:63,  h:114, rot:0, tipo:"k42"},
  {id:"puesto-13b",label:"13b",cx:646,  cy:716, w:63,  h:114, rot:0, tipo:"k42"},
  {id:"puesto-13c",label:"13c",cx:742,  cy:716, w:63,  h:114, rot:0, tipo:"k42"},
  {id:"puesto-14", label:"14", cx:875,  cy:706, w:97,  h:208, rot:0, tipo:"k52"},
  {id:"puesto-15", label:"15", cx:990,  cy:706, w:97,  h:208, rot:0, tipo:"k52"},
  {id:"puesto-16", label:"16", cx:1105, cy:706, w:97,  h:208, rot:0, tipo:"k52"},
  {id:"puesto-17", label:"17", cx:1220, cy:706, w:97,  h:208, rot:0, tipo:"k52"},
  {id:"puesto-18", label:"18", cx:1335, cy:706, w:97,  h:208, rot:0, tipo:"k52"},
  {id:"puesto-19", label:"19", cx:1450, cy:706, w:97,  h:208, rot:0, tipo:"k52"},
  {id:"puesto-20", label:"20", cx:1590, cy:490, w:128, h:285, rot:0, tipo:"k64"},
  {id:"puesto-21", label:"21", cx:1710, cy:490, w:128, h:285, rot:0, tipo:"k64"},
].filter(p=>p.w>0&&p.h>0);

const LEGEND=[
  {key:"activa",   color:"#3b82f6"},
  {key:"pausada",  color:"#f59e0b"},
  {key:"terminada",color:"#10b981"},
  {key:"cancelada",color:"#ef4444"},
  {key:"vacio",    color:"#6366f1",isWire:true},
];

/* ═══════════════════════════════════════════════════════════════
   ADD OBRA MODAL
═══════════════════════════════════════════════════════════════ */
function AddObraModal({puestoId,puestos,obras,onAssign,onClose}){
  const [q,setQ]=useState("");
  const [selIdx,setSelIdx]=useState(0);
  const inputRef=useRef(null);
  const listRef=useRef(null);
  const p=puestos.find(x=>x.id===puestoId);
  const list=useMemo(()=>obras.filter(o=>!o.puesto_mapa&&["activa","pausada","terminada"].includes(o.estado)&&[o.codigo,o.descripcion].some(s=>s?.toLowerCase().includes(q.toLowerCase()))),[obras,q]);
  useEffect(()=>{inputRef.current?.focus();},[]);
  useEffect(()=>{setSelIdx(0);},[q]);
  const handleKeyDown=(e)=>{
    if(e.key==="ArrowDown"){e.preventDefault();setSelIdx(i=>Math.min(i+1,list.length-1));}
    else if(e.key==="ArrowUp"){e.preventDefault();setSelIdx(i=>Math.max(i-1,0));}
    else if(e.key==="Enter"&&list[selIdx]){onAssign(puestoId,list[selIdx].id);}
    else if(e.key==="Escape"){onClose();}
  };
  useEffect(()=>{const el=listRef.current?.children[selIdx];el?.scrollIntoView({block:"nearest"});},[selIdx]);
  return(
    <div style={{position:"fixed",inset:0,zIndex:500,background:"rgba(0,0,0,0.6)",display:"flex",alignItems:"flex-start",justifyContent:"center",paddingTop:"12vh",animation:"fadeIn 0.15s ease"}} onClick={onClose}>
      <div style={{width:420,maxHeight:"60vh",display:"flex",flexDirection:"column",...GLASS,borderRadius:16,overflow:"hidden",border:"1px solid rgba(255,255,255,0.1)",boxShadow:"0 24px 48px -12px rgba(0,0,0,0.9)"}} onClick={e=>e.stopPropagation()}>
        <div style={{padding:"16px",borderBottom:`1px solid ${C.b0}`,display:"flex",flexDirection:"column",gap:12}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <div style={{padding:"4px 8px",background:"rgba(167,139,250,0.15)",borderRadius:6,border:"1px solid rgba(167,139,250,0.3)"}}>
                <span style={{fontSize:10,letterSpacing:1.5,color:"#a78bfa",textTransform:"uppercase",fontWeight:600}}>Asignar Obra</span>
              </div>
              <span style={{fontFamily:C.mono,fontSize:13,color:C.t2}}>→ Puesto {p?.label??puestoId}</span>
            </div>
            <button onClick={onClose} style={{background:"transparent",border:"none",color:C.t2,fontSize:16,cursor:"pointer",padding:4,borderRadius:6,lineHeight:1}} onMouseEnter={e=>e.currentTarget.style.color=C.t0} onMouseLeave={e=>e.currentTarget.style.color=C.t2}>✕</button>
          </div>
          <input ref={inputRef} value={q} onChange={e=>setQ(e.target.value)} onKeyDown={handleKeyDown} placeholder="Buscar obra... (↑↓ navegar, Enter asignar)" style={{width:"100%",boxSizing:"border-box",padding:"12px 14px",borderRadius:8,background:"rgba(0,0,0,0.3)",border:`1px solid rgba(255,255,255,0.08)`,color:C.t0,fontSize:14,fontFamily:C.sans,outline:"none"}} onFocus={e=>e.currentTarget.style.border="1px solid rgba(167,139,250,0.5)"} onBlur={e=>e.currentTarget.style.border="1px solid rgba(255,255,255,0.08)"}/>
        </div>
        <div ref={listRef} style={{flex:1,overflowY:"auto",padding:"8px",display:"flex",flexDirection:"column",gap:4}}>
          {!list.length&&<div style={{textAlign:"center",padding:"32px 8px",fontSize:13,color:C.t2}}>{q?"No se encontraron obras":"No hay obras pendientes de asignar"}</div>}
          {list.map((obra,i)=>{
            const oC=C.obra[obra.estado]??C.obra.vacio;
            const isSel=i===selIdx;
            return(<div key={obra.id} onClick={()=>onAssign(puestoId,obra.id)} style={{padding:"12px 16px",borderRadius:10,cursor:"pointer",display:"flex",flexDirection:"column",gap:6,transition:"all 0.12s",background:isSel?"rgba(167,139,250,0.08)":"transparent",border:`1px solid ${isSel?"rgba(167,139,250,0.3)":"transparent"}`}} onMouseEnter={()=>setSelIdx(i)}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontFamily:C.mono,fontSize:15,color:C.t0,fontWeight:600}}>{obra.codigo}</span>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <div style={{width:6,height:6,borderRadius:3,background:oC.glow,boxShadow:`0 0 8px ${oC.glow}`}}/>
                  <span style={{fontSize:10,letterSpacing:1,textTransform:"uppercase",color:oC.glow,fontWeight:500}}>{oC.label}</span>
                </div>
              </div>
              {obra.descripcion&&<div style={{fontSize:12,color:C.t1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{obra.descripcion}</div>}
            </div>);
          })}
        </div>
        <div style={{padding:"8px 16px",borderTop:`1px solid ${C.b0}`,fontSize:10,color:C.t2,display:"flex",gap:12,alignItems:"center"}}>
          <span>↑↓ navegar</span><span>↵ asignar</span><span>Esc cerrar</span>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MENÚ RADIAL CONTEXTUAL
═══════════════════════════════════════════════════════════════ */
function RadialMenu({x,y,puesto,obra,editMode,onClose,onAssign,onFocus,onDetail,onChangeEstado,onDelete}){
  const menuRef=useRef(null);
  const RADIUS=76;
  useEffect(()=>{
    const h=(e)=>{if(!menuRef.current?.contains(e.target))onClose();};
    const t=setTimeout(()=>window.addEventListener("mousedown",h),60);
    return()=>{clearTimeout(t);window.removeEventListener("mousedown",h);};
  },[onClose]);
  const actions=useMemo(()=>{
    const base=[];
    if(obra){
      base.push({id:"focus", icon:"⊙",label:"Enfocar",  color:"#e2e8f0"});
      base.push({id:"detail",icon:"≡",label:"Detalle",  color:"#60a5fa"});
      if(obra.estado==="activa")   base.push({id:"pausar",   icon:"⏸",label:"Pausar",   color:"#fbbf24"});
      if(obra.estado==="pausada")  base.push({id:"reanudar", icon:"▶",label:"Reanudar", color:"#34d399"});
      if(!["terminada","cancelada"].includes(obra.estado)) base.push({id:"terminar",icon:"✓",label:"Terminar",color:"#10b981"});
      base.push({id:"desasignar",icon:"⇌",label:"Desvincular",color:"#f87171"});
    } else {
      base.push({id:"asignar",icon:"+",label:"Asignar",color:"#a78bfa"});
    }
    if(editMode) base.push({id:"delete",icon:"×",label:"Eliminar",color:"#ef4444"});
    return base;
  },[obra,editMode]);
  const step=360/actions.length;
  const handleAction=(id)=>{
    if(id==="focus")        onFocus();
    else if(id==="detail")       onDetail();
    else if(id==="asignar")      onAssign();
    else if(id==="delete")       onDelete();
    else if(id==="desasignar")   onChangeEstado?.(obra.id,"desasignar");
    else if(id==="pausar")       onChangeEstado?.(obra.id,"pausada");
    else if(id==="reanudar")     onChangeEstado?.(obra.id,"activa");
    else if(id==="terminar")     onChangeEstado?.(obra.id,"terminada");
    onClose();
  };
  return(
    <div ref={menuRef} style={{position:"fixed",left:x,top:y,zIndex:1000,pointerEvents:"none"}}>
      <svg style={{position:"absolute",left:-(RADIUS+28),top:-(RADIUS+28),width:(RADIUS+28)*2,height:(RADIUS+28)*2,pointerEvents:"none",overflow:"visible"}} aria-hidden>
        <circle cx={RADIUS+28} cy={RADIUS+28} r={RADIUS} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" strokeDasharray="3 3"/>
        <circle cx={RADIUS+28} cy={RADIUS+28} r="5" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.3)" strokeWidth="1"/>
      </svg>
      {actions.map((action,i)=>{
        const angle=(-90+i*step)*(Math.PI/180);
        const ax=Math.cos(angle)*RADIUS, ay=Math.sin(angle)*RADIUS;
        return(
          <button key={action.id} onClick={()=>handleAction(action.id)}
            style={{position:"absolute",left:ax-24,top:ay-24,width:48,height:48,borderRadius:24,background:"rgba(8,8,12,0.97)",border:`1.5px solid ${action.color}35`,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",cursor:"pointer",pointerEvents:"auto",fontFamily:C.sans,boxShadow:`0 4px 16px rgba(0,0,0,0.6),0 0 0 1px ${action.color}12`,animation:`radialPop 0.22s cubic-bezier(0.34,1.56,0.64,1) ${i*28}ms both`,transition:"background 0.12s,border-color 0.12s,transform 0.12s"}}
            onMouseEnter={e=>{e.currentTarget.style.background=`${action.color}1a`;e.currentTarget.style.borderColor=action.color;e.currentTarget.style.transform="scale(1.14)";e.currentTarget.style.boxShadow=`0 6px 20px rgba(0,0,0,0.7),0 0 12px ${action.color}30`;}}
            onMouseLeave={e=>{e.currentTarget.style.background="rgba(8,8,12,0.97)";e.currentTarget.style.borderColor=`${action.color}35`;e.currentTarget.style.transform="scale(1)";e.currentTarget.style.boxShadow=`0 4px 16px rgba(0,0,0,0.6),0 0 0 1px ${action.color}12`;}}>
            <span style={{fontSize:15,color:action.color,lineHeight:1,pointerEvents:"none"}}>{action.icon}</span>
            <span style={{fontSize:7,color:"rgba(255,255,255,0.38)",marginTop:2,letterSpacing:0.4,lineHeight:1,pointerEvents:"none"}}>{action.label.split(" ")[0].toUpperCase()}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   COMMAND PALETTE ⌘K
═══════════════════════════════════════════════════════════════ */
function CommandPalette({obras,puestos,obraByPuesto,onClose,onAction}){
  const [q,setQ]=useState("");
  const [selIdx,setSelIdx]=useState(0);
  const inputRef=useRef(null);
  const listRef=useRef(null);
  useEffect(()=>{inputRef.current?.focus();},[]);
  const puestosLibres=useMemo(()=>puestos.filter(p=>!obraByPuesto[p.id]),[puestos,obraByPuesto]);
  const groups=useMemo(()=>{
    const ql=q.toLowerCase(), result=[];
    const quickActions=[
      {type:"action",id:"reset-view", icon:"⌂",label:"Resetear Vista",       sub:"R",    color:"#a1a1aa"},
      {type:"action",id:"toggle-edit",icon:"◩",label:"Activar Modo Edición", sub:"E",    color:"#fbbf24"},
      {type:"action",id:"zoom-in",    icon:"+",label:"Acercar Zoom",          sub:"+ / =",color:"#a1a1aa"},
      {type:"action",id:"zoom-out",   icon:"−",label:"Alejar Zoom",           sub:"−",    color:"#a1a1aa"},
    ].filter(a=>!q||a.label.toLowerCase().includes(ql));
    if(quickActions.length) result.push({group:"Acciones",items:quickActions});
    const freePuestos=puestosLibres.filter(p=>!q||`puesto ${p.label}`.includes(ql)||p.label.includes(q)).slice(0,6).map(p=>({type:"puesto-libre",id:p.id,icon:"◻",label:`Puesto ${p.label}`,sub:"Disponible",color:"#6366f1",p}));
    if(freePuestos.length) result.push({group:"Puestos Disponibles",items:freePuestos});
    const unassigned=obras.filter(o=>!o.puesto_mapa&&[o.codigo,o.descripcion].some(s=>s?.toLowerCase().includes(ql))).slice(0,8).map(o=>({type:"obra-libre",id:o.id,icon:"●",label:o.codigo,sub:o.descripcion??"Sin descripción",color:C.obra[o.estado]?.glow??"#a1a1aa",obra:o}));
    if(unassigned.length) result.push({group:"Obras Sin Asignar",items:unassigned});
    const assigned=obras.filter(o=>o.puesto_mapa&&[o.codigo,o.descripcion].some(s=>s?.toLowerCase().includes(ql))).slice(0,6).map(o=>{const p=puestos.find(px=>px.id===o.puesto_mapa);return{type:"obra-asignada",id:o.id,icon:"◉",label:o.codigo,sub:`Puesto ${p?.label??"?"}`,color:C.obra[o.estado]?.glow??"#a1a1aa",obra:o,p};});
    if(assigned.length) result.push({group:"Obras en Mapa",items:assigned});
    return result;
  },[q,obras,puestosLibres,puestos,obraByPuesto]);
  const flat=useMemo(()=>groups.flatMap(g=>g.items),[groups]);
  useEffect(()=>{setSelIdx(0);},[q]);
  useEffect(()=>{const el=listRef.current?.querySelector(`[data-idx="${selIdx}"]`);el?.scrollIntoView({block:"nearest"});},[selIdx]);
  const handleKeyDown=(e)=>{
    if(e.key==="ArrowDown"){e.preventDefault();setSelIdx(i=>Math.min(i+1,flat.length-1));}
    else if(e.key==="ArrowUp"){e.preventDefault();setSelIdx(i=>Math.max(i-1,0));}
    else if(e.key==="Enter"){e.preventDefault();if(flat[selIdx]){onAction(flat[selIdx]);onClose();}}
    else if(e.key==="Escape"){onClose();}
  };
  let flatIdx=0;
  return(
    <div style={{position:"fixed",inset:0,zIndex:900,background:"rgba(0,0,0,0.55)",display:"flex",alignItems:"flex-start",justifyContent:"center",paddingTop:"10vh",animation:"fadeIn 0.12s ease",backdropFilter:"blur(4px)"}} onClick={onClose}>
      <div style={{width:520,maxHeight:"70vh",display:"flex",flexDirection:"column",...GLASS,borderRadius:16,overflow:"hidden",border:"1px solid rgba(255,255,255,0.12)",boxShadow:"0 32px 64px -12px rgba(0,0,0,0.95)"}} onClick={e=>e.stopPropagation()}>
        <div style={{padding:"14px 16px",display:"flex",alignItems:"center",gap:12,borderBottom:`1px solid ${C.b0}`}}>
          <span style={{fontSize:16,color:C.t2}}>⌘</span>
          <input ref={inputRef} value={q} onChange={e=>setQ(e.target.value)} onKeyDown={handleKeyDown} placeholder="Buscar obras, puestos, acciones..." style={{flex:1,background:"transparent",border:"none",outline:"none",color:C.t0,fontSize:15,fontFamily:C.sans}}/>
          <span style={{fontSize:9,color:C.t2,letterSpacing:1.5,fontFamily:C.mono,background:"rgba(255,255,255,0.05)",padding:"3px 7px",borderRadius:5,border:`1px solid ${C.b0}`}}>ESC</span>
        </div>
        <div ref={listRef} style={{flex:1,overflowY:"auto",padding:"8px"}}>
          {groups.length===0&&<div style={{padding:"32px 16px",textAlign:"center",color:C.t2,fontSize:13}}>Sin resultados para "{q}"</div>}
          {groups.map(({group,items})=>(
            <div key={group} style={{marginBottom:4}}>
              <div style={{padding:"6px 12px 4px",fontSize:9,letterSpacing:2,textTransform:"uppercase",color:C.t2,fontWeight:600}}>{group}</div>
              {items.map((item)=>{
                const idx=flatIdx++;
                const isSel=idx===selIdx;
                return(<div key={item.id} data-idx={idx} onClick={()=>{onAction(item);onClose();}} onMouseEnter={()=>setSelIdx(idx)} style={{display:"flex",alignItems:"center",gap:12,padding:"9px 12px",borderRadius:9,cursor:"pointer",background:isSel?"rgba(255,255,255,0.06)":"transparent",border:`1px solid ${isSel?C.b1:"transparent"}`,marginBottom:2,transition:"background 0.08s"}}>
                  <span style={{width:22,height:22,borderRadius:6,background:`${item.color}18`,border:`1px solid ${item.color}30`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:item.color,flexShrink:0}}>{item.icon}</span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,color:C.t0,fontWeight:500,fontFamily:item.type.startsWith("obra")?C.mono:C.sans}}>{item.label}</div>
                    {item.sub&&<div style={{fontSize:11,color:C.t2,marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.sub}</div>}
                  </div>
                  {item.sub&&item.type==="action"&&<span style={{fontSize:9,color:C.t2,fontFamily:C.mono,background:"rgba(255,255,255,0.04)",padding:"2px 7px",borderRadius:5,border:`1px solid ${C.b0}`,flexShrink:0}}>{item.sub}</span>}
                </div>);
              })}
            </div>
          ))}
        </div>
        <div style={{padding:"8px 16px",borderTop:`1px solid ${C.b0}`,display:"flex",gap:16,fontSize:10,color:C.t2}}>
          <span>↑↓ navegar</span><span>↵ seleccionar</span><span style={{marginLeft:"auto"}}>{flat.length} resultados</span>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   CINEMATIC CALLOUTS SVG — solo outline + corner marks
   El texto/data se muestra en MemoriaHUD
═══════════════════════════════════════════════════════════════ */
function CinematicCallouts({p,obra,oC}){
  return(
    <g style={{pointerEvents:"none"}}>
      {/* Dashed outer rect */}
      <rect x={p.cx-p.w/2-10} y={p.cy-p.h/2-10} width={p.w+20} height={p.h+20}
        fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="0.5" strokeDasharray="3 3"
        style={{animation:"focusIn 0.4s ease both"}}/>
      {/* Corner dots */}
      {[[p.cx-p.w/2,p.cy-p.h/2],[p.cx+p.w/2,p.cy-p.h/2],[p.cx-p.w/2,p.cy+p.h/2],[p.cx+p.w/2,p.cy+p.h/2]].map(([cx,cy],i)=>(
        <circle key={i} cx={cx} cy={cy} r="2.5" fill="rgba(255,255,255,0.4)"
          style={{animation:`focusIn 0.3s ease ${i*40}ms both`}}/>
      ))}
      {/* Center crosshair */}
      <g style={{animation:"focusIn 0.4s ease 0.15s both"}}>
        <line x1={p.cx-18} y1={p.cy} x2={p.cx+18} y2={p.cy} stroke="rgba(255,255,255,0.16)" strokeWidth="0.5"/>
        <line x1={p.cx} y1={p.cy-18} x2={p.cx} y2={p.cy+18} stroke="rgba(255,255,255,0.16)" strokeWidth="0.5"/>
        <circle cx={p.cx} cy={p.cy} r="4" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="0.6"/>
      </g>
      {/* Glow outline */}
      <rect x={p.cx-(p.w+16)/2} y={p.cy-(p.h+16)/2} width={p.w+16} height={p.h+16}
        rx={Math.min(p.w,p.h)*0.18} fill="none" stroke={oC.glow} strokeWidth="1.5" strokeOpacity="0.45"
        style={{animation:"focusIn 0.4s ease both",filter:`drop-shadow(0 0 8px ${oC.glow})`}}/>
    </g>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MEMORIA DESCRIPTIVA HUD — Panel principal del Modo Foco
   Editable campo por campo. Se guarda en localStorage y/o
   callback externo para sincronización entre usuarios.
═══════════════════════════════════════════════════════════════ */
/* ── Inline SVG icons (16×16, stroke=currentColor) ── */
const IC = {
  user:    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>,
  hardhat:<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 17h20v2a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-2z"/><path d="M12 3a9 9 0 0 1 9 9H3a9 9 0 0 1 9-9z"/><line x1="12" y1="3" x2="12" y2="12"/></svg>,
  engine: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="8" width="20" height="10" rx="2"/><path d="M6 8V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="8" y1="12" x2="8" y2="16"/><line x1="16" y1="12" x2="16" y2="16"/></svg>,
  bolt:   <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  wood:   <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="6" width="18" height="12" rx="1"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="3" y1="14" x2="21" y2="14"/><line x1="9" y1="6" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="18"/></svg>,
  floor:  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/></svg>,
  palette:<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="8" cy="10" r="1.5" fill="currentColor"/><circle cx="12" cy="7" r="1.5" fill="currentColor"/><circle cx="16" cy="10" r="1.5" fill="currentColor"/><path d="M12 22c0-4 4-6 4-10"/></svg>,
  ship:   <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 20h20"/><path d="M5 20V10l7-7 7 7v10"/><line x1="12" y1="3" x2="12" y2="20"/></svg>,
  signal: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><circle cx="12" cy="20" r="1" fill="currentColor"/></svg>,
  door:   <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 20V6a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v14"/><line x1="2" y1="20" x2="22" y2="20"/><circle cx="15" cy="13" r="1" fill="currentColor"/></svg>,
  sofa:   <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 9V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v2"/><path d="M2 11v5a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5"/><path d="M4 11a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2H4v-2z"/><line x1="4" y1="18" x2="4" y2="20"/><line x1="20" y1="18" x2="20" y2="20"/></svg>,
  brush:  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18.37 2.63L14 7l-1.59-1.59a2 2 0 0 0-2.82 0L8 7l9 9 1.59-1.59a2 2 0 0 0 0-2.82L17 10l4.37-4.37a2.12 2.12 0 0 0-3-3z"/><path d="M9 8c-2 3-4 3.5-7 4l8 10c2-1 6-5 6-7"/></svg>,
  notes:  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,
  pencil: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  save:   <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>,
  print:  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>,
  check:  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  satellite:<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M6.3 6.3a8 8 0 0 0 0 11.31"/><path d="M17.7 6.3a8 8 0 0 1 0 11.31"/><path d="M3.05 9A13 13 0 0 0 3 12"/><path d="M21 12a13 13 0 0 0-.05-3"/></svg>,
  anchor: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="5" r="3"/><line x1="12" y1="8" x2="12" y2="22"/><path d="M5 12H2a10 10 0 0 0 20 0h-3"/></svg>,
  teca:   <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 8C8 10 5.9 16.17 3.82 19"/><path d="M12 3a4 4 0 0 0-4 4c0 1.5.5 3 2 4"/><path d="M21 3a9 9 0 0 1-9 9"/><circle cx="12" cy="20" r="2"/></svg>,
  msgcircle:<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  plus:   <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  trash:  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>,
  x:      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
};

const MEMORIA_FIELDS = [
  { key:"propietario",        label:"Propietario",                     icon:IC.user,    col:1 },
  { key:"constructor",        label:"Constructor",                     icon:IC.hardhat, col:1 },
  { key:"motorizacion",       label:"Motorización",                    icon:IC.engine,  col:1 },
  { key:"grupo_electrogeno",  label:"Grupo Electrógeno",               icon:IC.bolt,    col:1 },
  { key:"madera_muebles",     label:"Madera Muebles",                  icon:IC.wood,    col:2 },
  { key:"piso",               label:"Piso",                            icon:IC.floor,   col:2 },
  { key:"color_mesadas",      label:"Mesadas (baño, cocina, ext.)",    icon:IC.palette, col:2, wide:true },
  { key:"color_casco",        label:"Color de Casco",                  icon:IC.ship,    col:2 },
  { key:"electronica",        label:"Electrónica",                     icon:IC.signal,  col:1 },
  { key:"color_cerramientos", label:"Cerramientos",                    icon:IC.door,    col:1 },
  { key:"color_acolchados",   label:"Tapicería / Acolchados",          icon:IC.sofa,    col:2 },
  { key:"color_exterior",     label:"Color Exterior",                  icon:IC.brush,   col:2 },
  { key:"adicionales",        label:"Adicionales",                     icon:IC.notes,   col:1, wide:true },
];

/* ── FieldBox fuera del componente para evitar remount en cada keystroke ── */
function FieldBox({ field, isEditing, val, editVal, editRef, onStartEdit, onChangeVal, onCommit }) {
  const empty = !val;
  return (
    <div
      onClick={()=>!isEditing&&onStartEdit(field.key)}
      style={{
        padding:"10px 12px", borderRadius:8, cursor:isEditing?"default":"text",
        border:`1px solid ${isEditing?"rgba(255,255,255,0.18)":empty?"rgba(255,255,255,0.04)":"rgba(255,255,255,0.08)"}`,
        background: isEditing?"rgba(255,255,255,0.06)":empty?"rgba(255,255,255,0.02)":"rgba(255,255,255,0.04)",
        transition:"border-color 0.15s, background 0.15s",
        display:"flex", flexDirection:"column", gap:5,
      }}
    >
      {/* Label row */}
      <div style={{ display:"flex", alignItems:"center", gap:5, color:isEditing?"rgba(255,255,255,0.55)":"rgba(255,255,255,0.25)" }}>
        <span style={{ display:"flex", alignItems:"center", flexShrink:0 }}>{field.icon}</span>
        <span style={{ fontSize:9, letterSpacing:1.4, textTransform:"uppercase", fontFamily:"'JetBrains Mono',monospace", fontWeight:600, lineHeight:1 }}>
          {field.label}
        </span>
        {!isEditing && !empty && (
          <span style={{ marginLeft:"auto", color:"rgba(255,255,255,0.15)", display:"flex", alignItems:"center" }}>{IC.pencil}</span>
        )}
      </div>

      {/* Value / input */}
      {isEditing ? (
        <textarea
          ref={editRef}
          value={editVal}
          onChange={e=>onChangeVal(e.target.value)}
          onBlur={onCommit}
          rows={field.wide ? 3 : 2}
          style={{
            width:"100%", background:"transparent", border:"none", outline:"none",
            color:"#fff", fontSize:12, fontFamily:"'Outfit',system-ui,sans-serif",
            resize:"none", lineHeight:1.5, padding:0,
          }}
        />
      ) : (
        <div style={{
          fontSize:12, lineHeight:1.5,
          color: empty ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.85)",
          fontStyle: empty ? "italic" : "normal",
          minHeight: field.wide ? 32 : 16,
        }}>
          {empty ? "Completar..." : val}
        </div>
      )}
    </div>
  );
}

function MemoriaHUD({ obra, puesto, oC, memoriaOverride, onSaveMemoria, notas=[], onAddNota, onDeleteNota, onClose }) {
  const db = MEMORIAS_DB[obra?.codigo] ?? {};
  const base = {
    propietario:        obra?.propietario  ?? db.propietario        ?? "",
    constructor:        obra?.constructor  ?? db.constructor        ?? "",
    motorizacion:       obra?.motores      ?? db.motorizacion       ?? "",
    grupo_electrogeno:  obra?.grupo_electrogeno_det ?? (obra?.grupo_electrogeno?"Sí":null) ?? db.grupo_electrogeno ?? "",
    madera_muebles:     obra?.madera_muebles ?? db.madera_muebles   ?? "",
    piso:               obra?.piso         ?? db.piso               ?? "",
    color_mesadas:      obra?.color_mesadas?? db.color_mesadas      ?? "",
    color_casco:        obra?.color_casco  ?? db.color_casco        ?? "",
    electronica:        obra?.electronica  ?? db.electronica        ?? "",
    color_cerramientos: db.color_cerramientos ?? "",
    color_acolchados:   db.color_acolchados   ?? "",
    color_exterior:     db.color_exterior     ?? "",
    adicionales:        db.adicionales        ?? "",
    starlink:           obra?.starlink     ?? db.starlink     ?? false,
    teca_cockpit:       obra?.teca_cockpit ?? db.teca_cockpit ?? false,
    sternthruster:      obra?.sternthruster?? db.sternthruster?? false,
  };

  const [fields,    setFields]    = useState({ ...base, ...(memoriaOverride??{}) });
  const [editingKey,setEditingKey]= useState(null);
  const [editVal,   setEditVal]   = useState("");
  const [newNota,   setNewNota]   = useState("");
  const [dirty,     setDirty]     = useState(false);
  const editRef = useRef(null);

  useEffect(()=>{ if(editingKey && editRef.current){ editRef.current.focus(); editRef.current.select(); } },[editingKey]);

  const startEdit  = useCallback((key)=>{ setEditingKey(key); setEditVal(fields[key]??""); },[fields]);
  const onChangeVal= useCallback((v)=>setEditVal(v),[]);
  const commitEdit = useCallback(()=>{
    setEditingKey(k=>{ if(!k) return k;
      setFields(f=>({...f,[k]:editVal}));
      setDirty(true);
      return null;
    });
  },[editVal]);

  const saveAll    = ()=>{ onSaveMemoria?.(obra?.id??puesto?.id, fields); setDirty(false); };
  const toggleBadge= (key)=>{ setFields(f=>({...f,[key]:!f[key]})); setDirty(true); };
  const handleAddNota=()=>{
    const txt=newNota.trim(); if(!txt) return;
    onAddNota?.(obra?.id??puesto?.id,{id:Date.now(),texto:txt,fecha:new Date().toLocaleDateString("es-AR")});
    setNewNota("");
  };

  // Global keyboard shortcuts for the panel
  useEffect(()=>{
    const h=(e)=>{
      if(e.target.tagName==="TEXTAREA"||e.target.tagName==="INPUT") return;
      if(e.key==="Escape") onClose();
    };
    window.addEventListener("keydown",h);
    return()=>window.removeEventListener("keydown",h);
  },[onClose]);

  const handlePrint = () => {
    const accentHex = oC.glow;
    const badgeList = [
      fields.starlink      && "Starlink",
      fields.teca_cockpit  && "Teca/Infinity",
      fields.sternthruster && "Sternthruster",
    ].filter(Boolean);
    const rows = MEMORIA_FIELDS.map(f=>{
      const val=fields[f.key]; if(!val) return "";
      return `<tr><td class="label">${f.label}</td><td class="val">${String(val).replace(/\n/g,"<br/>")}</td></tr>`;
    }).join("");
    const notasHTML = notas.length ? notas.map(n=>`
      <div class="nota"><span class="nb">◆</span><div><div class="nt">${n.texto}</div><div class="nd">${n.fecha}</div></div></div>`
    ).join("") : `<p class="empty">Sin notas registradas.</p>`;
    const html=`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>
<title>Memoria — ${obra?.codigo??`Puesto ${puesto?.label}`}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&family=JetBrains+Mono:wght@400;700&display=swap');
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'Outfit',sans-serif;background:#fff;color:#1a1a2e;}
@page{size:A4;margin:18mm 16mm;}
.page{max-width:760px;margin:0 auto;padding:32px 36px;}
.header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:16px;border-bottom:2px solid ${accentHex};margin-bottom:22px;}
.company{font-size:8px;letter-spacing:3px;text-transform:uppercase;color:#999;margin-bottom:6px;font-family:'JetBrains Mono',monospace;}
.codigo{font-size:30px;font-weight:800;font-family:'JetBrains Mono',monospace;letter-spacing:1px;line-height:1;}
.subtitle{font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#999;margin-top:5px;}
.estado{display:inline-block;padding:4px 12px;border-radius:20px;font-size:9px;letter-spacing:2px;font-weight:700;text-transform:uppercase;background:${accentHex}15;color:${accentHex};border:1.5px solid ${accentHex}40;margin-bottom:6px;}
.fecha{font-size:8px;color:#bbb;font-family:'JetBrains Mono',monospace;}
.stitle{font-size:7.5px;letter-spacing:3px;text-transform:uppercase;color:#bbb;font-family:'JetBrains Mono',monospace;margin:18px 0 10px;padding-bottom:5px;border-bottom:1px solid #f0f0f0;}
table{width:100%;border-collapse:collapse;}
tr{border-bottom:1px solid #f5f5f5;} tr:last-child{border-bottom:none;}
td{padding:8px 6px;vertical-align:top;}
td.label{width:36%;font-size:9.5px;color:#999;text-transform:uppercase;letter-spacing:1px;font-weight:600;padding-right:12px;}
td.val{font-size:12.5px;color:#1a1a2e;font-weight:500;line-height:1.5;}
.badges{display:flex;gap:7px;flex-wrap:wrap;margin:10px 0;}
.badge{padding:3px 11px;border-radius:20px;font-size:9px;font-weight:600;background:#f4f4f8;color:#555;border:1px solid #e0e0e8;}
.nota{display:flex;gap:10px;padding:8px 0;border-bottom:1px solid #f4f4f4;} .nota:last-child{border-bottom:none;}
.nb{color:${accentHex};font-size:9px;margin-top:3px;flex-shrink:0;}
.nt{font-size:12px;color:#333;line-height:1.5;} .nd{font-size:8px;color:#ccc;margin-top:2px;font-family:'JetBrains Mono',monospace;}
.empty{font-size:11px;color:#ccc;font-style:italic;padding:8px 0;}
.footer{margin-top:28px;padding-top:12px;border-top:1px solid #eee;display:flex;justify-content:space-between;align-items:center;}
.fl{font-size:8px;color:#ccc;font-family:'JetBrains Mono',monospace;letter-spacing:1px;}
.bar{width:36px;height:2.5px;background:${accentHex};border-radius:2px;}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;} .noprint{display:none!important;}}
</style></head><body><div class="page">
<div class="header">
<div><div class="company">Astillero Klasea · Plano de Producción</div>
<div class="codigo">${obra?.codigo??`Puesto ${puesto?.label}`}</div>
<div class="subtitle">Memoria Descriptiva · Puesto ${puesto?.label} · ${puesto?.tipo?.toUpperCase()??""}</div></div>
<div style="text-align:right"><div class="estado">${obra?.estado?.toUpperCase()??"VACÍO"}</div>
<div class="fecha">Emitido: ${new Date().toLocaleDateString("es-AR",{day:"2-digit",month:"long",year:"numeric"})}</div>
${obra?._pct!=null?`<div class="fecha" style="margin-top:3px">Progreso: <strong>${obra._pct}%</strong></div>`:""}
</div></div>
<div class="stitle">Especificaciones Técnicas</div>
<table>${rows}</table>
${badgeList.length?`<div class="stitle">Equipamiento</div><div class="badges">${badgeList.map(b=>`<span class="badge">${b}</span>`).join("")}</div>`:""}
<div class="stitle">Notas del Equipo</div><div>${notasHTML}</div>
<div class="footer"><div class="fl">KLASEA · ${new Date().toLocaleDateString("es-AR")}</div><div class="bar"></div></div>
</div>
<div class="noprint" style="position:fixed;bottom:20px;left:50%;transform:translateX(-50%);display:flex;gap:10px;z-index:999;">
<button onclick="window.print()" style="padding:10px 28px;background:${accentHex};color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;font-family:Outfit,sans-serif;">Imprimir / Guardar PDF</button>
<button onclick="window.close()" style="padding:10px 18px;background:#f4f4f8;color:#555;border:1px solid #e0e0e8;border-radius:8px;font-size:12px;cursor:pointer;">Cerrar</button>
</div></body></html>`;
    const win=window.open("","_blank","width=860,height=900");
    if(!win){alert("Habilitá las ventanas emergentes para imprimir.");return;}
    win.document.write(html); win.document.close();
  };

  const col1 = MEMORIA_FIELDS.filter(f=>f.col===1&&!f.wide);
  const col2 = MEMORIA_FIELDS.filter(f=>f.col===2&&!f.wide);
  const wide  = MEMORIA_FIELDS.filter(f=>f.wide);
  const BADGES=[
    {key:"starlink",     icon:IC.satellite,label:"Starlink",     color:"#a5b4fc"},
    {key:"teca_cockpit", icon:IC.teca,     label:"Teca/Infinity",color:"#d4b483"},
    {key:"sternthruster",icon:IC.anchor,   label:"Sternthruster",color:"#7dd3fc"},
  ];

  return (
    <div style={{
      position:"fixed", top:0, right:0, bottom:0, width:420, zIndex:2000,
      background:"rgba(4,4,12,0.98)",
      backdropFilter:"blur(32px) saturate(180%)",
      WebkitBackdropFilter:"blur(32px) saturate(180%)",
      borderLeft:`1px solid ${oC.glow}22`,
      boxShadow:`-32px 0 80px rgba(0,0,0,0.95), inset 1px 0 0 ${oC.glow}08`,
      display:"flex", flexDirection:"column",
      animation:"hudSlideInRight 0.3s cubic-bezier(0.16,1,0.3,1) both",
      fontFamily:"'Outfit',system-ui,sans-serif",
    }}>
      <style>{`
        @keyframes hudSlideInRight{from{opacity:0;transform:translateX(32px)}to{opacity:1;transform:translateX(0)}}
        @keyframes notaPop{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
        .mem-scroll::-webkit-scrollbar{width:3px}
        .mem-scroll::-webkit-scrollbar-track{background:transparent}
        .mem-scroll::-webkit-scrollbar-thumb{background:${oC.glow}30;border-radius:2px}
        .mem-input{background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:#fff;font-size:12px;padding:8px 12px;outline:none;font-family:'Outfit',sans-serif;width:100%;box-sizing:border-box;transition:border-color 0.15s;}
        .mem-input:focus{border-color:${oC.glow}60;}
        .mem-input::placeholder{color:rgba(255,255,255,0.18);}
        .nota-row:hover .nota-del{opacity:1!important;}
      `}</style>

      {/* Subtle scan-line texture */}
      <div style={{position:"absolute",inset:0,pointerEvents:"none",zIndex:0,
        background:`repeating-linear-gradient(0deg,transparent,transparent 3px,${oC.glow}025 3px,${oC.glow}025 4px)`}}/>

      {/* ── HEADER ── */}
      <div style={{padding:"20px 22px 16px",borderBottom:`1px solid rgba(255,255,255,0.06)`,flexShrink:0,position:"relative",zIndex:1}}>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:12}}>
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{width:8,height:8,borderRadius:4,background:oC.glow,boxShadow:`0 0 12px ${oC.glow}`}}/>
              <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:20,color:"#fff",fontWeight:800,letterSpacing:0.5}}>
                {obra?.codigo??`Puesto ${puesto?.label}`}
              </span>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:oC.glow,fontWeight:700,
                background:`${oC.glow}12`,padding:"2px 8px",borderRadius:4,border:`1px solid ${oC.glow}25`}}>
                {obra?.estado?.toUpperCase()??"VACÍO"}
              </span>
              <span style={{fontSize:9,color:"rgba(255,255,255,0.2)",fontFamily:"'JetBrains Mono',monospace",letterSpacing:1}}>
                PUESTO {puesto?.label} · {puesto?.tipo?.toUpperCase()}
              </span>
            </div>
          </div>
          <button onClick={onClose} style={{background:"transparent",border:"1px solid rgba(255,255,255,0.09)",borderRadius:8,
            color:"rgba(255,255,255,0.3)",cursor:"pointer",width:30,height:30,display:"flex",alignItems:"center",justifyContent:"center",
            flexShrink:0,transition:"all 0.15s"}}
            onMouseEnter={e=>{e.currentTarget.style.borderColor="rgba(255,255,255,0.25)";e.currentTarget.style.color="#fff";}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(255,255,255,0.09)";e.currentTarget.style.color="rgba(255,255,255,0.3)";}}>
            {IC.x}
          </button>
        </div>

        {/* Progress bar */}
        {obra&&(
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
            <div style={{flex:1,height:2,background:"rgba(255,255,255,0.06)",borderRadius:2,overflow:"hidden"}}>
              <div style={{height:"100%",width:`${obra._pct??0}%`,background:oC.glow,boxShadow:`0 0 6px ${oC.glow}`,borderRadius:2,transition:"width 0.4s"}}/>
            </div>
            <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10,color:oC.glow,fontWeight:700,minWidth:28}}>{obra._pct??0}%</span>
          </div>
        )}

        {/* Equipment badges */}
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {BADGES.map(b=>(
            <button key={b.key} onClick={()=>toggleBadge(b.key)}
              style={{display:"flex",alignItems:"center",gap:5,padding:"4px 10px",borderRadius:6,cursor:"pointer",
                border:`1px solid ${fields[b.key]?b.color+"40":"rgba(255,255,255,0.07)"}`,
                background:fields[b.key]?`${b.color}10`:"rgba(255,255,255,0.02)",
                color:fields[b.key]?b.color:"rgba(255,255,255,0.22)",
                transition:"all 0.15s",fontSize:10,fontFamily:"'Outfit',sans-serif"}}>
              <span style={{display:"flex",alignItems:"center"}}>{b.icon}</span>
              {b.label}
              {fields[b.key]&&<span style={{display:"flex",alignItems:"center",opacity:0.7}}>{IC.check}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* ── SCROLLABLE BODY ── */}
      <div className="mem-scroll" style={{flex:1,overflowY:"auto",padding:"14px 22px",display:"flex",flexDirection:"column",gap:6,position:"relative",zIndex:1}}>

        <div style={{fontSize:8,color:"rgba(255,255,255,0.16)",letterSpacing:1.5,textAlign:"center",marginBottom:2,textTransform:"uppercase",fontFamily:"'JetBrains Mono',monospace",display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>
          {IC.pencil} <span>Clic en cada campo para editar</span>
        </div>

        {/* 2-column grid */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
          {col1.map((f,i)=>(
            <FieldBox key={f.key} field={f}
              isEditing={editingKey===f.key} val={fields[f.key]} editVal={editVal}
              editRef={editingKey===f.key?editRef:null}
              onStartEdit={startEdit} onChangeVal={onChangeVal} onCommit={commitEdit}/>
          ))}
          {col2.map((f,i)=>(
            <FieldBox key={f.key} field={f}
              isEditing={editingKey===f.key} val={fields[f.key]} editVal={editVal}
              editRef={editingKey===f.key?editRef:null}
              onStartEdit={startEdit} onChangeVal={onChangeVal} onCommit={commitEdit}/>
          ))}
        </div>

        {/* Wide fields */}
        {wide.map(f=>(
          <FieldBox key={f.key} field={f}
            isEditing={editingKey===f.key} val={fields[f.key]} editVal={editVal}
            editRef={editingKey===f.key?editRef:null}
            onStartEdit={startEdit} onChangeVal={onChangeVal} onCommit={commitEdit}/>
        ))}

        {/* Divider */}
        <div style={{height:1,background:`linear-gradient(90deg,transparent,${oC.glow}25,transparent)`,margin:"6px 0"}}/>

        {/* Notes section */}
        <div style={{display:"flex",alignItems:"center",gap:5,color:"rgba(255,255,255,0.25)",marginBottom:6}}>
          {IC.msgcircle}
          <span style={{fontSize:8,letterSpacing:2,textTransform:"uppercase",fontFamily:"'JetBrains Mono',monospace",fontWeight:600}}>
            Notas del Equipo
          </span>
          {notas.length>0&&<span style={{marginLeft:"auto",fontSize:9,color:oC.glow,background:`${oC.glow}12`,padding:"1px 7px",borderRadius:10,border:`1px solid ${oC.glow}25`}}>{notas.length}</span>}
        </div>

        {notas.map(n=>(
          <div key={n.id} className="nota-row" style={{display:"flex",gap:8,padding:"9px 11px",borderRadius:8,
            background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.05)",animation:"notaPop 0.2s ease both"}}>
            <span style={{color:oC.glow,fontSize:8,marginTop:2,flexShrink:0}}>◆</span>
            <div style={{flex:1}}>
              <div style={{fontSize:12,color:"rgba(255,255,255,0.75)",lineHeight:1.5}}>{n.texto}</div>
              <div style={{fontSize:8,color:"rgba(255,255,255,0.2)",marginTop:2,fontFamily:"'JetBrains Mono',monospace"}}>{n.fecha}</div>
            </div>
            <button className="nota-del" onClick={()=>onDeleteNota?.(obra?.id??puesto?.id,n.id)}
              style={{background:"transparent",border:"none",color:"rgba(239,68,68,0.5)",cursor:"pointer",
                padding:"0 2px",flexShrink:0,display:"flex",alignItems:"center",opacity:0,transition:"opacity 0.15s"}}>
              {IC.trash}
            </button>
          </div>
        ))}

        <div style={{display:"flex",gap:6,marginTop:2}}>
          <input className="mem-input" placeholder="Agregar nota..." value={newNota}
            onChange={e=>setNewNota(e.target.value)}
            onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();handleAddNota();}}}/>
          <button onClick={handleAddNota}
            style={{padding:"0 12px",borderRadius:8,border:`1px solid ${oC.glow}30`,background:`${oC.glow}10`,
              color:oC.glow,cursor:"pointer",flexShrink:0,display:"flex",alignItems:"center"}}>
            {IC.plus}
          </button>
        </div>
      </div>

      {/* ── FOOTER ── */}
      <div style={{padding:"12px 22px",borderTop:"1px solid rgba(255,255,255,0.06)",flexShrink:0,zIndex:1,display:"flex",gap:8}}>
        <button onClick={saveAll} style={{flex:1,padding:"10px",borderRadius:9,
          border:`1px solid ${dirty?oC.glow+"45":"rgba(255,255,255,0.07)"}`,
          background:dirty?`${oC.glow}14`:"rgba(255,255,255,0.03)",
          color:dirty?oC.glow:"rgba(255,255,255,0.28)",cursor:"pointer",fontSize:12,fontWeight:700,
          transition:"all 0.2s",boxShadow:dirty?`0 0 18px ${oC.glow}18`:"none",
          fontFamily:"'Outfit',sans-serif",display:"flex",alignItems:"center",justifyContent:"center",gap:7}}>
          {dirty ? <>{IC.save} Guardar cambios</> : <>{IC.check} Sin cambios</>}
        </button>
        <button onClick={handlePrint} title="Imprimir / Guardar PDF"
          style={{padding:"10px 13px",borderRadius:9,border:"1px solid rgba(255,255,255,0.1)",
            background:"rgba(255,255,255,0.04)",color:"rgba(255,255,255,0.45)",cursor:"pointer",
            flexShrink:0,display:"flex",alignItems:"center",transition:"all 0.15s"}}
          onMouseEnter={e=>{e.currentTarget.style.background="rgba(255,255,255,0.09)";e.currentTarget.style.color="#fff";}}
          onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,0.04)";e.currentTarget.style.color="rgba(255,255,255,0.45)";}}>
          {IC.print}
        </button>
        <span style={{display:"flex",alignItems:"center",fontSize:9,color:"rgba(255,255,255,0.12)",fontFamily:"'JetBrains Mono',monospace"}}>Esc</span>
      </div>
    </div>
  );
}


function RadarHUD({puestos,obraByPuesto,vp,containerW,containerH}){
  const W=192,H=132,PAD=10;
  const scX=(W-PAD*2)/VB_W, scY=(H-PAD*2)/VB_H;
  const visLeft=Math.max(PAD,(-vp.x/vp.scale)*scX+PAD);
  const visTop=Math.max(PAD,(-vp.y/vp.scale)*scY+PAD);
  const visW=Math.min((containerW/vp.scale)*scX,W-PAD*2);
  const visH=Math.min((containerH/vp.scale)*scY,H-PAD*2);
  return(
    <div style={{position:"absolute",bottom:88,right:24,width:W,height:H,...GLASS,borderRadius:10,overflow:"hidden",zIndex:10}}>
      <svg width={W} height={H} style={{display:"block",overflow:"visible"}}>
        <rect width={W} height={H} fill="rgba(0,12,6,0.7)"/>
        {[0.25,0.5,0.75,1].map(r=><circle key={r} cx={W/2} cy={H/2} r={(Math.min(W,H)/2-6)*r} fill="none" stroke="rgba(0,255,100,0.07)" strokeWidth="0.4"/>)}
        {ZONAS.map(z=><rect key={z.id} x={z.x*scX+PAD} y={z.y*scY+PAD} width={z.w*scX} height={z.h*scY} fill={z.bc?`${z.bc}08`:"rgba(255,255,255,0.015)"} stroke={z.bc?`${z.bc}30`:"rgba(255,255,255,0.06)"} strokeWidth="0.3"/>)}
        <g>
          <path d={`M ${W/2} ${H/2} L ${W/2} ${PAD}`} stroke="rgba(0,255,100,0.7)" strokeWidth="1.2" style={{transformOrigin:`${W/2}px ${H/2}px`}}>
            <animateTransform attributeName="transform" type="rotate" from={`0 ${W/2} ${H/2}`} to={`360 ${W/2} ${H/2}`} dur="4s" repeatCount="indefinite"/>
          </path>
          <path d={`M ${W/2} ${H/2} L ${W/2} ${PAD}`} stroke="rgba(0,255,100,0.12)" strokeWidth="5" style={{transformOrigin:`${W/2}px ${H/2}px`}}>
            <animateTransform attributeName="transform" type="rotate" from={`0 ${W/2} ${H/2}`} to={`360 ${W/2} ${H/2}`} dur="4s" repeatCount="indefinite"/>
          </path>
        </g>
        {puestos.map(p=>{
          const obra=obraByPuesto[p.id];
          const color=obra?C.obra[obra.estado]?.glow:"#374151";
          const r=Math.max(1.8,(p.w*scX)/2.8);
          return<circle key={p.id} cx={p.cx*scX+PAD} cy={p.cy*scY+PAD} r={r} fill={color} fillOpacity={obra?0.85:0.22} stroke={obra?color:"none"} strokeWidth="0.4" strokeOpacity="0.5"/>;
        })}
        <rect x={visLeft} y={visTop} width={Math.max(4,visW)} height={Math.max(4,visH)} fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.45)" strokeWidth="0.6" strokeDasharray="2 2"/>
        <rect x="0.5" y="0.5" width={W-1} height={H-1} rx="9" fill="none" stroke="rgba(0,255,100,0.18)" strokeWidth="0.5"/>
        <text x="8" y={H-6} fill="rgba(0,255,100,0.45)" fontSize="7" fontFamily="monospace" letterSpacing="1">RADAR · {puestos.length} PUESTOS</text>
      </svg>
    </div>
  );
}

const LS_KEY = "klasea_mapa_puestos_v1";
const LS_NOTAS_KEY = "klasea_mapa_notas_v1";
const LS_MEMORIAS_KEY = "klasea_mapa_memorias_v1";

function loadNotas() {
  try { const r=localStorage.getItem(LS_NOTAS_KEY); return r?JSON.parse(r):{}; } catch { return {}; }
}
function saveNotas(notas) {
  try { localStorage.setItem(LS_NOTAS_KEY, JSON.stringify(notas)); } catch {}
}
function loadMemorias() {
  try { const r=localStorage.getItem(LS_MEMORIAS_KEY); return r?JSON.parse(r):{}; } catch { return {}; }
}
function saveMemorias(m) {
  try { localStorage.setItem(LS_MEMORIAS_KEY, JSON.stringify(m)); } catch {}
}

function loadPuestos() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Actualizar _nextN para que genId() no colisione
        parsed.forEach(p => {
          const n = parseInt(p.id.replace("puesto-", ""), 10);
          if (!isNaN(n) && n >= _nextN) _nextN = n + 1;
        });
        return parsed;
      }
    }
  } catch {}
  return PUESTOS_INITIAL;
}

function savePuestos(puestos) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(puestos)); } catch {}
}
/**
 * Props para persistencia compartida entre usuarios:
 *   sharedPuestos      → layout desde tu backend (array de puestos)
 *   onSaveLayout(arr)  → llamado al cambiar el layout (ej: POST a tu API)
 *   sharedNotas        → notas desde tu backend ({ [obraId]: [...] })
 *   onSaveNotas(obj)   → llamado al cambiar notas
 * Si no se pasan, se usa localStorage (solo local, no compartido).
 */
export default function MapaProduccion({obras=[],onPuestoClick,onAsignarObra,onChangeEstado,esGestion=false,sharedPuestos,onSaveLayout,sharedNotas,onSaveNotas}){
  const svgRef=useRef(null);
  const vpRef=useRef({x:0,y:0,scale:1});
  const [vp,setVp]=useState({x:0,y:0,scale:1});
  const [puestos,setPuestos]=useState(()=>sharedPuestos&&sharedPuestos.length>0?sharedPuestos:loadPuestos());
  const [notasExtra,setNotasExtra]=useState(()=>sharedNotas??loadNotas());
  const [memoriasEdit,setMemoriasEdit]=useState(()=>loadMemorias());
  const [hovered,setHovered]=useState(null);
  const [tooltip,setTooltip]=useState(null);
  const [editMode,setEditMode]=useState(false);
  const [addObraFor,setAddObraFor]=useState(null);
  const [confirmDel,setConfirmDel]=useState(null);
  const [pulseKey,setPulseKey]=useState(0);
  const [isDragging,setIsDragging]=useState(false);
  const [obraDragPos,setObraDragPos]=useState(null);
  const [obraDragOver,setObraDragOver]=useState(null);
  const [newPuestoSize,setNewPuestoSize]=useState("mediano");
  const [containerSize,setContainerSize]=useState({w:0,h:0});
  const [contextMenu,setContextMenu]=useState(null);
  const [cmdPaletteOpen,setCmdPaletteOpen]=useState(false);
  const [focusedPuesto,setFocusedPuesto]=useState(null);
  const dragRef=useRef(null);
  const obraDragOverRef=useRef(null);
  const stateRef=useRef({});

  useEffect(()=>{stateRef.current={editMode,cmdPaletteOpen,focusedPuesto,addObraFor,confirmDel,contextMenu,hovered,puestos};},[editMode,cmdPaletteOpen,focusedPuesto,addObraFor,confirmDel,contextMenu,hovered,puestos]);
  useEffect(()=>{vpRef.current=vp;},[vp]);
  // Persistir puestos en localStorage al cambiar + callback para backend compartido
  useEffect(()=>{ savePuestos(puestos); onSaveLayout?.(puestos); },[puestos]);
  // Persistir notas
  useEffect(()=>{ saveNotas(notasExtra); onSaveNotas?.(notasExtra); },[notasExtra]);
  // Persistir memorias editadas
  useEffect(()=>{ saveMemorias(memoriasEdit); },[memoriasEdit]);

  function handleSaveMemoria(obraOrPuestoId, fields) {
    setMemoriasEdit(prev=>({...prev,[obraOrPuestoId]:fields}));
  }
  useEffect(()=>{const id=setInterval(()=>setPulseKey(k=>k+1),3000);return()=>clearInterval(id);},[]);
  useEffect(()=>{
    const el=svgRef.current; if(!el) return;
    const update=()=>setContainerSize({w:el.clientWidth,h:el.clientHeight});
    update(); window.addEventListener("resize",update);
    return()=>window.removeEventListener("resize",update);
  },[]);

  useLayoutEffect(()=>{
    const fit=()=>{
      const el=svgRef.current; if(!el) return;
      const {width,height}=el.getBoundingClientRect();
      if(!width||!height) return;
      const scale=Math.min(width*0.88/VB_W,height*0.88/VB_H);
      const next={x:(width-VB_W*scale)/2,y:(height-VB_H*scale)/2,scale};
      vpRef.current=next; setVp(next);
    };
    fit(); const t=setTimeout(fit,150); return()=>clearTimeout(t);
  },[]);

  const obraByPuesto=useMemo(()=>{const m={};obras.forEach(o=>{if(o.puesto_mapa)m[o.puesto_mapa]=o;});return m;},[obras]);
  const stats=useMemo(()=>({total:puestos.length,ocupados:puestos.filter(p=>obraByPuesto[p.id]).length,libres:puestos.filter(p=>!obraByPuesto[p.id]).length}),[obraByPuesto,puestos]);

  const onWheel=useCallback(e=>{
    e.preventDefault();
    const rect=svgRef.current?.getBoundingClientRect(); if(!rect) return;
    const mx=e.clientX-rect.left, my=e.clientY-rect.top, f=e.deltaY<0?1.15:0.85;
    setVp(v=>{const ns=Math.min(8,Math.max(0.15,v.scale*f));const next={x:mx-(mx-v.x)*(ns/v.scale),y:my-(my-v.y)*(ns/v.scale),scale:ns};vpRef.current=next;return next;});
  },[]);
  useEffect(()=>{const el=svgRef.current;if(!el)return;el.addEventListener("wheel",onWheel,{passive:false});return()=>el.removeEventListener("wheel",onWheel);},[onWheel]);

  const zoomBtn=useCallback((f)=>{
    const rect=svgRef.current?.getBoundingClientRect();if(!rect)return;
    const cx=rect.width/2,cy=rect.height/2;
    setVp(v=>{const ns=Math.min(8,Math.max(0.15,v.scale*f));const next={x:cx-(cx-v.x)*(ns/v.scale),y:cy-(cy-v.y)*(ns/v.scale),scale:ns};vpRef.current=next;return next;});
  },[]);

  const resetVp=useCallback(()=>{
    const el=svgRef.current;if(!el)return;
    const {width,height}=el.getBoundingClientRect();
    const scale=Math.min(width*0.88/VB_W,height*0.88/VB_H);
    const next={x:(width-VB_W*scale)/2,y:(height-VB_H*scale)/2,scale};
    vpRef.current=next;setVp(next);
  },[]);

  const centerOnPuesto=useCallback((p)=>{
    const el=svgRef.current;if(!el)return;
    const {width,height}=el.getBoundingClientRect();
    const scale=Math.min(Math.min(width,height)*0.55/Math.max(p.w,p.h),3.5);
    const next={x:width/2-p.cx*scale,y:height/2-p.cy*scale,scale};
    vpRef.current=next;setVp(next);
  },[]);

  /* Keyboard shortcuts */
  useEffect(()=>{
    const handler=(e)=>{
      const st=stateRef.current;
      if((e.metaKey||e.ctrlKey)&&e.key==="k"){e.preventDefault();setCmdPaletteOpen(v=>!v);return;}
      if(e.key==="Escape"){
        if(st.contextMenu){setContextMenu(null);return;}
        if(st.cmdPaletteOpen){setCmdPaletteOpen(false);return;}
        if(st.addObraFor){setAddObraFor(null);return;}
        if(st.confirmDel){setConfirmDel(null);return;}
        if(st.focusedPuesto){setFocusedPuesto(null);return;}
        return;
      }
      if(e.target.tagName==="INPUT"||e.target.tagName==="TEXTAREA") return;
      if(st.addObraFor||st.confirmDel||st.cmdPaletteOpen) return;
      if(e.key==="e"||e.key==="E") setEditMode(v=>!v);
      if(e.key==="r"||e.key==="R") resetVp();
      if(e.key==="+"||e.key==="=") zoomBtn(1.3);
      if(e.key==="-") zoomBtn(0.77);
      if((e.key==="f"||e.key==="F")&&st.hovered){
        const p=stateRef.current.puestos?.find?.(x=>x.id===st.hovered)??null;
        setFocusedPuesto(st.hovered);
        if(p) centerOnPuesto(p);
      }
    };
    window.addEventListener("keydown",handler);
    return()=>window.removeEventListener("keydown",handler);
  },[resetVp,zoomBtn]);

  const startPan=useCallback(e=>{if(e.button!==0)return;dragRef.current={type:"pan",lastX:e.clientX,lastY:e.clientY,vx:0,vy:0,startX:e.clientX,startY:e.clientY,moved:false};setIsDragging(true);},[]);
  const startPuestoDrag=useCallback((e,p)=>{
    if(e.button!==0)return;e.stopPropagation();
    if(editMode){dragRef.current={type:"puesto",puestoId:p.id,startCX:p.cx,startCY:p.cy,startX:e.clientX,startY:e.clientY,moved:false};setIsDragging(true);return;}
    const obra=obraByPuesto[p.id];
    if(obra){dragRef.current={type:"obra",obra,puesto:p,fromId:p.id,startX:e.clientX,startY:e.clientY,lastX:e.clientX,lastY:e.clientY,moved:false};obraDragOverRef.current=null;setIsDragging(true);}
    else{dragRef.current={type:"empty",puestoId:p.id,startX:e.clientX,startY:e.clientY,moved:false};setIsDragging(true);}
  },[editMode,obraByPuesto]);

  useEffect(()=>{
    if(!isDragging)return;
    document.body.style.cursor="grabbing";
    const onMove=e=>{
      const d=dragRef.current;if(!d)return;
      if(Math.hypot(e.clientX-d.startX,e.clientY-d.startY)>4)d.moved=true;
      if(d.type==="pan"){const dx=e.clientX-d.lastX,dy=e.clientY-d.lastY;d.vx=dx;d.vy=dy;d.lastX=e.clientX;d.lastY=e.clientY;setVp(v=>{const n={...v,x:v.x+dx,y:v.y+dy};vpRef.current=n;return n;});}
      else if(d.type==="puesto"&&d.moved){const v=vpRef.current;setPuestos(prev=>prev.map(p=>p.id===d.puestoId?{...p,cx:d.startCX+(e.clientX-d.startX)/v.scale,cy:d.startCY+(e.clientY-d.startY)/v.scale}:p));}
      else if(d.type==="obra"){setObraDragPos({x:e.clientX,y:e.clientY});}
    };
    const onUp=()=>{
      const d=dragRef.current;document.body.style.cursor="";
      if(d?.type==="pan"){let vx=d.vx,vy=d.vy;const step=()=>{vx*=0.85;vy*=0.85;if(Math.abs(vx)<0.3&&Math.abs(vy)<0.3)return;setVp(v=>{const n={...v,x:v.x+vx,y:v.y+vy};vpRef.current=n;return n;});requestAnimationFrame(step);};requestAnimationFrame(step);}
      else if(d?.type==="obra"){if(!d.moved){onPuestoClick?.({puesto:d.puesto,obra:d.obra});}else{const target=obraDragOverRef.current;if(target&&d.obra&&onAsignarObra)onAsignarObra(target,d.obra.id);}obraDragOverRef.current=null;setObraDragPos(null);setObraDragOver(null);}
      else if(d?.type==="empty"&&!d?.moved){setAddObraFor(d.puestoId);}
      setIsDragging(false);dragRef.current=null;
    };
    window.addEventListener("mousemove",onMove);window.addEventListener("mouseup",onUp);
    return()=>{window.removeEventListener("mousemove",onMove);window.removeEventListener("mouseup",onUp);};
  },[isDragging,onAsignarObra,onPuestoClick]);

  function addPuesto(){
    const v=vpRef.current,rect=svgRef.current?.getBoundingClientRect();
    const cx=rect?(rect.width/2-v.x)/v.scale:VB_W/2,cy=rect?(rect.height/2-v.y)/v.scale:VB_H/2;
    const sizes={chico:{w:60,h:112,tipo:"k37"},mediano:{w:80,h:155,tipo:"k42"},utility:{w:75,h:158,tipo:"k43"},grande:{w:94,h:185,tipo:"k52"},crucero:{w:110,h:228,tipo:"k55"},xl:{w:128,h:285,tipo:"k64"}};
    setPuestos(prev=>[...prev,{id:genId(),label:String(_nextN-1).padStart(2,"0"),cx,cy,rot:0,...sizes[newPuestoSize]}]);
  }
  function removePuesto(id){setPuestos(prev=>prev.filter(p=>p.id!==id));setConfirmDel(null);}
  function toggleRot(id){setPuestos(prev=>prev.map(p=>p.id===id?{...p,rot:(p.rot+90)%360}:p));}
  function resetLayout(){if(!window.confirm("¿Resetear el layout al estado original? Se perderán todas las posiciones personalizadas."))return;localStorage.removeItem(LS_KEY);_nextN=23;setPuestos(PUESTOS_INITIAL);}
  async function handleModalAssign(pId,oId){if(!onAsignarObra)return;try{await onAsignarObra(pId,oId);}finally{setAddObraFor(null);}}
  function handlePuestoClick(p){if(editMode)return;const obra=obraByPuesto[p.id];if(!obra)setAddObraFor(p.id);else onPuestoClick?.({puesto:p,obra});}
  const handleContextMenu=useCallback((e,p)=>{e.preventDefault();e.stopPropagation();setContextMenu({x:e.clientX,y:e.clientY,puestoId:p.id});setTooltip(null);},[]);
  const handlePaletteAction=useCallback((item)=>{
    if(item.type==="action"){if(item.id==="reset-view")resetVp();else if(item.id==="toggle-edit")setEditMode(v=>!v);else if(item.id==="zoom-in")zoomBtn(1.3);else if(item.id==="zoom-out")zoomBtn(0.77);}
    else if(item.type==="puesto-libre"){centerOnPuesto(item.p);setAddObraFor(item.p.id);}
    else if(item.type==="obra-libre"){const libre=puestos.find(p=>!obraByPuesto[p.id]);if(libre){centerOnPuesto(libre);setAddObraFor(libre.id);}}
    else if(item.type==="obra-asignada"&&item.p){centerOnPuesto(item.p);setFocusedPuesto(item.p.id);}
  },[resetVp,zoomBtn,centerOnPuesto,puestos,obraByPuesto]);

  // Sincronizar notas desde prop externo cuando cambia
  useEffect(()=>{ if(sharedNotas) setNotasExtra(sharedNotas); },[sharedNotas]);

  function handleAddNota(obraId, nota) {
    if(!obraId) return;
    setNotasExtra(prev=>({ ...prev, [obraId]:[...(prev[obraId]??[]), nota] }));
  }
  function handleDeleteNota(obraId, notaId) {
    setNotasExtra(prev=>({ ...prev, [obraId]:(prev[obraId]??[]).filter(n=>n.id!==notaId) }));
  }
  const gsz=60*vp.scale;
  const gsx=((vp.x%gsz)+gsz)%gsz, gsy=((vp.y%gsz)+gsz)%gsz;
  const focusedP=focusedPuesto?puestos.find(p=>p.id===focusedPuesto):null;
  const focusedObra=focusedP?obraByPuesto[focusedP.id]:null;
  const focusedOC=C.obra[focusedObra?.estado??"vacio"];
  const ctxPuesto=contextMenu?puestos.find(p=>p.id===contextMenu.puestoId):null;
  const ctxObra=ctxPuesto?obraByPuesto[ctxPuesto.id]:null;
  const nonFocusedPuestos=focusedPuesto?puestos.filter(p=>p.id!==focusedPuesto):puestos;

  const renderBoat=(p)=>{
    const obra=obraByPuesto[p.id],oC=C.obra[obra?.estado??"vacio"];
    const isHov=hovered===p.id,isEmpty=!obra,isAct=obra?.estado==="activa",isPaused=obra?.estado==="pausada";
    const canDrop=!!obraDragPos&&isEmpty&&p.id!==dragRef.current?.fromId;
    const isDrop=obraDragOver===p.id;
    const sc=(isHov&&!editMode&&!isDragging)?1.03:1;
    const imgSrc=BOAT_IMGS[p.tipo]??BOAT_IMGS.k52;
    const ix=p.cx-p.w/2, iy=p.cy-p.h/2;
    const clipId=`clip-${p.id}`;

    /* ── Orientación correcta para PNGs horizontales en puestos verticales ──
       Todos los PNG son horizontales (proa a la izquierda).
       Si el puesto es vertical (h > w), rotamos la imagen 90° sobre su centro
       para que encaje sin deformarse.
       width  del <image> = lado largo  = Math.max(p.w, p.h)
       height del <image> = lado corto  = Math.min(p.w, p.h)
       x      del <image> = p.cx - Math.max(p.w, p.h) / 2
       y      del <image> = p.cy - Math.min(p.w, p.h) / 2
       Usamos preserveAspectRatio="none" para que llene exactamente la caja.
    ─────────────────────────────────────────────────────────────────────── */
    const isVertical = p.h > p.w;
    const imgW = Math.max(p.w, p.h);
    const imgH = Math.min(p.w, p.h);
    const imgX = p.cx - imgW / 2;
    const imgY = p.cy - imgH / 2;
    const imgRot = isVertical ? `rotate(90,${p.cx},${p.cy})` : undefined;

    const glowFilter=isEmpty
      ? "none"
      : isHov
        ? `drop-shadow(0 0 14px ${oC.glow}) drop-shadow(0 0 5px ${oC.glow}) drop-shadow(0 5px 12px rgba(0,0,0,0.9))`
        : `drop-shadow(0 0 6px ${oC.glow}90) drop-shadow(0 4px 10px rgba(0,0,0,0.85))`;

    /* Helper que devuelve el <image> listo, con orientación corregida.
       La rotación va en un <g> contenedor — más fiable cross-browser que
       poner transform directo en <image> (especialmente en puestos verticales). */
    const BoatImage = ({opacity=1, dx=0, dy=0, blur=false}) => {
      const img = (
        <image
          href={imgSrc}
          x={imgX+dx} y={imgY+dy} width={imgW} height={imgH}
          preserveAspectRatio="none"
          opacity={opacity}
          draggable={false}
          style={{pointerEvents:"none", userSelect:"none", mixBlendMode:"screen",
                  ...(blur?{filter:"blur(4px)"}:{})}}
        />
      );
      /* Para puestos verticales envolvemos en un <g> que rota 90°.
         Esto evita bugs de renderizado SVG con transform en <image>. */
      return isVertical
        ? <g transform={imgRot}>{img}</g>
        : img;
    };

    /* Posición del bloque info (pill + barra) — debajo de la caja, siempre horizontal.
       Usamos la transformación inversa a p.rot para anular la rotación del <g> padre. */
    const infoY = p.cy + Math.max(p.w,p.h)/2 + 18;

    return(
      <g key={p.id} transform={`rotate(${p.rot||0},${p.cx},${p.cy})`} style={{cursor:editMode?"grab":canDrop?"copy":"pointer"}}
        onMouseDown={e=>startPuestoDrag(e,p)}
        onMouseEnter={()=>{setHovered(p.id);if(canDrop){obraDragOverRef.current=p.id;setObraDragOver(p.id);}}}
        onMouseLeave={()=>{setHovered(null);setTooltip(null);if(obraDragOverRef.current===p.id){obraDragOverRef.current=null;setObraDragOver(null);}}}
        onMouseMove={e=>!obraDragPos&&setTooltip({cx:e.clientX,cy:e.clientY,puesto:p})}
        onClick={e=>{if(dragRef.current&&!dragRef.current.moved){e.stopPropagation();handlePuestoClick(p);}}}
        onContextMenu={e=>handleContextMenu(e,p)}>
      {/* Rect transparente de hit-area — único elemento que captura eventos del mouse */}
      <rect x={ix} y={iy} width={p.w} height={p.h} fill="transparent" style={{cursor:"inherit"}}/>
      <g transform={sc!==1?`translate(${p.cx*(1-sc)},${p.cy*(1-sc)}) scale(${sc})`:undefined} style={{transition:"transform 0.2s cubic-bezier(0.175,0.885,0.32,1.275)"}}>

          {/* Sonar ping para pausadas */}
          {isPaused&&(
            <g style={{pointerEvents:"none", userSelect:"none"}}>
              <circle cx={p.cx} cy={p.cy} r="0" fill="none" stroke="#f59e0b" strokeWidth="1.5" style={{animation:"sonarPing 2.8s ease-out infinite"}}/>
              <circle cx={p.cx} cy={p.cy} r="0" fill="none" stroke="#f59e0b" strokeWidth="1"   style={{animation:"sonarPing 2.8s ease-out 0.9s infinite"}}/>
              <g transform={`translate(${p.cx+p.w*0.28},${p.cy-p.h*0.52})`}>
                <circle r="8" fill="rgba(245,158,11,0.9)" stroke="rgba(0,0,0,0.5)" strokeWidth="1.5"/>
                <text textAnchor="middle" dominantBaseline="middle" y="0.5" fill="#000" fontSize="9" fontWeight="800" fontFamily="system-ui" style={{pointerEvents:"none",userSelect:"none"}}>!</text>
              </g>
            </g>
          )}

          {isEmpty?(
            /* ── PUESTO VACÍO ── */
            <g style={{pointerEvents:"none", userSelect:"none"}} clipPath={`url(#${clipId})`}>
              <BoatImage opacity={0.60}/>
              <rect x={ix} y={iy} width={p.w} height={p.h} rx={Math.min(p.w,p.h)*0.06}
                fill="none" stroke="rgba(255,255,255,0.20)" strokeWidth="1.2"
                strokeDasharray="6 4" style={{animation:"scan-line 15s linear infinite"}}/>
              <path d={`M${p.cx-10},${p.cy} L${p.cx+10},${p.cy} M${p.cx},${p.cy-10} L${p.cx},${p.cy+10}`}
                stroke="rgba(255,255,255,0.35)" strokeWidth="1.2"/>
              {canDrop&&<text x={p.cx} y={p.cy} textAnchor="middle" dominantBaseline="middle" fill="rgba(167,139,250,0.9)" fontSize={Math.min(p.w,p.h)*0.35} fontWeight="300">⊕</text>}
              {canDrop&&<rect x={ix-6} y={iy-6} width={p.w+12} height={p.h+12} rx={Math.min(p.w,p.h)*0.08}
                fill="rgba(167,139,250,0.04)" stroke="#a78bfa" strokeWidth="1.5"
                strokeDasharray="8 6" style={{animation:"dash-run .5s linear infinite"}}/>}
            </g>
          ):(
            /* ── PUESTO OCUPADO ── */
            <g style={{pointerEvents:"none", userSelect:"none"}}>
              {/* Sombra desplazada */}
              <g clipPath={`url(#${clipId})`}>
                <BoatImage opacity={0.20} dx={3} dy={5} blur={true}/>
              </g>
              {/* Imagen principal con glow de estado */}
              <g style={{filter:glowFilter, transition:"filter 0.25s ease"}} clipPath={`url(#${clipId})`}>
                <BoatImage opacity={1}/>
              </g>
              {/* Tint de color de estado */}
              <rect x={ix} y={iy} width={p.w} height={p.h} rx={Math.min(p.w,p.h)*0.05}
                fill={oC.glow} fillOpacity={isHov?0.15:0.07}
                style={{mixBlendMode:"screen",transition:"fill-opacity 0.2s"}}/>
              {isHov&&<rect x={ix-1} y={iy-1} width={p.w+2} height={p.h+2} rx={Math.min(p.w,p.h)*0.06}
                fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="0.8"/>}
              {isHov&&<rect x={ix-6} y={iy-6} width={p.w+12} height={p.h+12} rx={Math.min(p.w,p.h)*0.08}
                fill="none" stroke={oC.glow} strokeWidth="1.5" strokeOpacity="0.5"
                filter={`url(#gl-${obra.estado})`}/>}

              {/* ── INFO BLOCK: pill + barra ──
                  Contra-rotado respecto a p.rot para que siempre quede horizontal.
                  Posicionado DEBAJO del bounding box del puesto. */}
              <g transform={`rotate(${-(p.rot||0)},${p.cx},${p.cy})`}>
                <g transform={`translate(${p.cx},${infoY})`}>
                  {(()=>{
                    const codigo=obra.codigo??"";
                    const minSide=Math.min(p.w,p.h);
                    const pillW=Math.max(52, Math.min(codigo.length*8+20, minSide*0.9));
                    const pillH=20; const fs=Math.max(8,Math.min(12, pillW/(Math.max(codigo.length,1)+1)));
                    const bw=Math.min(minSide*0.72,88), bh=3;
                    return(<>
                      {/* Pill código */}
                      <rect x={-pillW/2} y={-pillH/2} width={pillW} height={pillH} rx={pillH/2}
                        fill="rgba(4,4,10,0.92)" stroke={`${oC.glow}55`} strokeWidth="1"
                        style={{filter:"drop-shadow(0 2px 5px rgba(0,0,0,0.85))"}}/>
                      <text x={0} y={1} textAnchor="middle" dominantBaseline="middle"
                        fill="#fff" fontSize={fs} fontFamily={C.mono} fontWeight="800" letterSpacing="0.8"
                        style={{userSelect:"none"}}>{codigo}</text>
                      {/* Barra de progreso — debajo de la pill */}
                      <rect x={-bw/2} y={pillH/2+4} width={bw} height={bh} rx="1.5" fill="rgba(0,0,0,0.6)"/>
                      <rect x={-bw/2} y={pillH/2+4} width={bw*(obra._pct??0)/100} height={bh} rx="1.5"
                        fill={oC.glow} style={{filter:`drop-shadow(0 0 3px ${oC.glow})`}}/>
                    </>);
                  })()}
                </g>
              </g>

              {/* Beacon activa */}
              {isAct&&(<>
                <circle cx={p.cx} cy={p.cy} r="0" fill="none" stroke={oC.glow}
                  style={{animation:"pulse-r 3s cubic-bezier(0.1,0.8,0.3,1) infinite"}}/>
                <circle cx={p.cx} cy={p.cy} r="4" fill={oC.glow}
                  style={{animation:"beacon 2.5s ease-in-out infinite",filter:`drop-shadow(0 0 6px ${oC.glow})`}}/>
              </>)}
            </g>
          )}

          {/* ── EDIT MODE OVERLAY ── */}
          {editMode&&(<>
            <rect x={ix} y={iy} width={p.w} height={p.h} rx={Math.min(p.w,p.h)*0.07} fill="rgba(251,191,36,0.06)" stroke="rgba(251,191,36,0.38)" strokeWidth="1.3" strokeDasharray="4 3" style={{pointerEvents:"none"}}/>
            {/* Botón ELIMINAR — esquina sup. izquierda, contra-rotado */}
            <g transform={`rotate(${-(p.rot||0)},${ix+11},${iy+11})`} style={{cursor:"pointer"}} onClick={e=>{e.stopPropagation();setConfirmDel(p.id);}}>
              <circle cx={ix+11} cy={iy+11} r="10" fill="rgba(239,68,68,0.93)" stroke="rgba(0,0,0,0.4)" strokeWidth="1"/>
              <text x={ix+11} y={iy+12} textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize="12" fontFamily="system-ui" fontWeight="700" style={{userSelect:"none"}}>×</text>
            </g>
            {/* Botón ROTAR — esquina sup. derecha, contra-rotado */}
            <g transform={`rotate(${-(p.rot||0)},${ix+p.w-11},${iy+11})`} style={{cursor:"pointer"}} onClick={e=>{e.stopPropagation();toggleRot(p.id);}}>
              <circle cx={ix+p.w-11} cy={iy+11} r="10" fill="rgba(251,191,36,0.93)" stroke="rgba(0,0,0,0.4)" strokeWidth="1"/>
              <text x={ix+p.w-11} y={iy+12} textAnchor="middle" dominantBaseline="middle" fill="#000" fontSize="11" fontFamily="system-ui" fontWeight="700" style={{userSelect:"none"}}>↻</text>
            </g>
          </>)}
        </g>
      </g>
    );
  };

  return(
    <div style={{width:"100%",height:"100%",position:"relative",overflow:"hidden",fontFamily:C.sans,background:C.bg}}>
      <style>{`
        @keyframes pulse-r  {0%{r:0;opacity:0.8;stroke-width:2}70%{r:36;opacity:0;stroke-width:0}100%{r:40;opacity:0}}
        @keyframes beacon   {0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.5;transform:scale(0.85)}}
        @keyframes dash-run {to{stroke-dashoffset:-32}}
        @keyframes scan-line{0%{stroke-dashoffset:100}100%{stroke-dashoffset:0}}
        @keyframes fadeUp   {from{opacity:0;transform:translateY(8px) scale(0.98)}to{opacity:1;transform:translateY(0) scale(1)}}
        @keyframes fadeIn   {from{opacity:0}to{opacity:1}}
        @keyframes sonarPing{0%{r:0;opacity:0.7;stroke-width:2}80%{r:48;opacity:0;stroke-width:0.5}100%{r:52;opacity:0}}
        @keyframes radialPop{from{opacity:0;transform:scale(0.15)}to{opacity:1;transform:scale(1)}}
        @keyframes focusIn  {from{opacity:0}to{opacity:1}}
        @keyframes dimIn    {from{opacity:0}to{opacity:1}}
        .glass-btn{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);color:${C.t1};transition:all 0.2s;}
        .glass-btn:hover{background:rgba(255,255,255,0.08);color:${C.t0};border-color:rgba(255,255,255,0.2);}
      `}</style>

      <svg ref={svgRef} style={{position:"absolute",inset:0,width:"100%",height:"100%",display:"block",cursor:isDragging?"grabbing":"grab"}} onMouseDown={startPan} onContextMenu={e=>e.preventDefault()}>
        <defs>
          {["activa","pausada","terminada","cancelada"].map(k=>(
            <filter key={k} id={`gl-${k}`} x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="12" result="blur1"/>
              <feGaussianBlur in="SourceGraphic" stdDeviation="24" result="blur2"/>
              <feMerge><feMergeNode in="blur2"/><feMergeNode in="blur1"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          ))}
          <filter id="sh" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="8" stdDeviation="12" floodColor="rgba(0,0,0,0.85)"/></filter>
          {/* ClipPaths por puesto para recortar el PNG sobredimensionado */}
          {puestos.map(p=>(
            <clipPath key={`clip-${p.id}`} id={`clip-${p.id}`}>
              <rect x={p.cx-p.w/2} y={p.cy-p.h/2} width={p.w} height={p.h} rx={p.w*0.05}/>
            </clipPath>
          ))}
          <pattern id="dotGrid" x={gsx} y={gsy} width={gsz} height={gsz} patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.5" fill="rgba(255,255,255,0.08)"/>
            <circle cx={gsz/2} cy={gsz/2} r="1" fill="rgba(255,255,255,0.03)"/>
          </pattern>
          <linearGradient id="hl" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%"   stopColor="#ffffff" stopOpacity="0.15"/>
            <stop offset="40%"  stopColor="#ffffff" stopOpacity="0.02"/>
            <stop offset="100%" stopColor="#000000" stopOpacity="0.30"/>
          </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill={C.bg}/>
        <rect width="100%" height="100%" fill="url(#dotGrid)"/>
        <g transform={`translate(${vp.x},${vp.y}) scale(${vp.scale})`}>
          <rect x="5" y="5" width={VB_W-10} height={VB_H-10} rx="8" fill="rgba(255,255,255,0.01)" stroke="rgba(255,255,255,0.15)" strokeWidth="2"/>
          {ZONAS.map(z=>{const bc=z.bc||"rgba(255,255,255,0.15)";return(
            <g key={z.id}>
              <rect x={z.x} y={z.y} width={z.w} height={z.h} rx="4" fill={`rgba(255,255,255,${z.dim?0.01:0.02})`} stroke={bc} strokeOpacity={z.bc?0.8:0.4} strokeWidth={z.bc?1.5:1} strokeDasharray={z.dashed?"8 6":"none"}/>
              <text x={z.x+z.w/2} y={z.y+z.h/2-(z.label.split("\n").length-1)*6} textAnchor="middle" fill={z.bc?bc:"rgba(255,255,255,0.4)"} fontSize={z.small?"7":"9"} fontFamily={C.sans} fontWeight={z.bc?"600":"500"} letterSpacing="1" style={{userSelect:"none",pointerEvents:"none"}}>
                {z.label.split("\n").map((l,i)=><tspan key={i} x={z.x+z.w/2} dy={i===0?0:12}>{l}</tspan>)}
              </text>
            </g>
          );})}
          {WALLS.map(([x1,y1,x2,y2],i)=><line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255,255,255,0.12)" strokeWidth="1.5"/>)}

          <g style={{opacity:focusedPuesto?0.10:1,transition:"opacity 0.4s ease",pointerEvents:focusedPuesto?"none":"auto"}}>
            {nonFocusedPuestos.map(p=>renderBoat(p))}
          </g>

          {focusedPuesto&&focusedP&&(<>
            <rect x={-9999} y={-9999} width={29999} height={29999} fill="rgba(0,0,0,0.68)" style={{pointerEvents:"all",cursor:"default",animation:"dimIn 0.35s ease both"}} onClick={()=>setFocusedPuesto(null)}/>
            <g style={{pointerEvents:"auto"}}>{renderBoat(focusedP)}</g>
            <CinematicCallouts p={focusedP} obra={focusedObra} oC={focusedOC}/>
          </>)}
        </g>
      </svg>

      {/* MEMORIA DESCRIPTIVA HUD — portal a document.body para escapar overflow:hidden */}
      {focusedPuesto&&focusedP&&createPortal(
        <MemoriaHUD
          obra={focusedObra??null}
          puesto={focusedP}
          oC={focusedOC}
          memoriaOverride={memoriasEdit[focusedObra?.id??focusedP.id]}
          onSaveMemoria={handleSaveMemoria}
          notas={focusedObra?.id ? (notasExtra[focusedObra.id]??[]) : (notasExtra[focusedP.id]??[])}
          onAddNota={handleAddNota}
          onDeleteNota={handleDeleteNota}
          onClose={()=>setFocusedPuesto(null)}
        />,
        document.body
      )}

      {/* TOP BAR */}
      <div style={{position:"absolute",top:10,left:10,right:10,zIndex:10,display:"flex",alignItems:"center",gap:6,pointerEvents:"none"}}>
        <div style={{display:"flex",gap:5,pointerEvents:"auto"}}>
          {[{v:stats.total,l:"Total",c:C.t0},{v:stats.ocupados,l:"Ocupados",c:"#60a5fa"},{v:stats.libres,l:"Libres",c:"#34d399"}].map(({v,l,c})=>(
            <div key={l} style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"4px 16px",borderRadius:8,...GLASS}}>
              <span style={{fontFamily:C.mono,fontSize:18,fontWeight:800,color:c,textShadow:`0 0 12px ${c}40`}}>{v}</span>
              <span style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:C.t2,fontWeight:600}}>{l}</span>
            </div>
          ))}
        </div>
        <div style={{flex:1}}/>
        <div style={{display:"flex",gap:16,alignItems:"center",pointerEvents:"auto",...GLASS,borderRadius:12,padding:"8px 12px"}}>
          <div style={{display:"flex",gap:12,paddingRight:16,borderRight:`1px solid ${C.b0}`}}>
            {LEGEND.map(({key,color,isWire})=>(
              <div key={key} style={{display:"flex",alignItems:"center",gap:6}}>
                <div style={{width:10,height:10,borderRadius:isWire?2:5,background:isWire?"transparent":color,border:`1.5px solid ${color}`,boxShadow:isWire?"none":`0 0 10px ${color}80`}}/>
                <span style={{fontSize:10,color:C.t1,fontWeight:500,letterSpacing:0.5}}>{C.obra[key].label}</span>
              </div>
            ))}
          </div>
          <div style={{display:"flex",gap:8}}>
            <button className="glass-btn" onClick={()=>setEditMode(v=>!v)} style={{padding:"8px 16px",borderRadius:8,cursor:"pointer",fontSize:11,fontFamily:C.sans,fontWeight:600,display:"flex",alignItems:"center",gap:6,background:editMode?"rgba(251,191,36,0.15)":"",borderColor:editMode?"rgba(251,191,36,0.4)":""}}>
              <span style={{color:editMode?"#fbbf24":""}}>{editMode?"● Editando Layout":"◩ Editar Layout"}</span>
            </button>
            <button className="glass-btn" onClick={()=>setCmdPaletteOpen(true)} style={{padding:"8px 14px",borderRadius:8,cursor:"pointer",fontSize:11,fontFamily:C.sans,fontWeight:600,display:"flex",alignItems:"center",gap:8}}>
              <span>⌘</span>
              <span style={{color:C.t2,fontFamily:C.mono,fontSize:10,background:"rgba(255,255,255,0.05)",border:`1px solid ${C.b0}`,padding:"1px 6px",borderRadius:5}}>K</span>
            </button>
            {editMode&&(
              <div style={{display:"flex",gap:4,alignItems:"center",background:"rgba(0,0,0,0.3)",borderRadius:8,padding:"4px",border:"1px solid rgba(16,185,129,0.3)"}}>
                {[{key:"chico",l:"37'"},{key:"mediano",l:"42'"},{key:"utility",l:"43'"},{key:"grande",l:"52'"},{key:"crucero",l:"55'"},{key:"xl",l:"64'"}].map(({key,l})=>(
                  <button key={key} onClick={()=>setNewPuestoSize(key)} style={{padding:"4px 10px",borderRadius:6,cursor:"pointer",fontSize:10,fontFamily:C.mono,fontWeight:600,border:"none",background:newPuestoSize===key?"rgba(16,185,129,0.2)":"transparent",color:newPuestoSize===key?"#34d399":C.t2,transition:"all .2s"}}>{l}</button>
                ))}
                <div style={{width:1,height:16,background:C.b1,margin:"0 4px"}}/>
                <button onClick={addPuesto} style={{padding:"4px 12px",borderRadius:6,cursor:"pointer",fontSize:11,fontWeight:700,border:"none",background:"#10b981",color:"#000",boxShadow:"0 4px 12px rgba(16,185,129,0.4)"}}>+ Agregar</button>
                <div style={{width:1,height:16,background:C.b1,margin:"0 4px"}}/>
                <button onClick={resetLayout} style={{padding:"4px 10px",borderRadius:6,cursor:"pointer",fontSize:10,fontWeight:600,border:"1px solid rgba(239,68,68,0.3)",background:"rgba(239,68,68,0.08)",color:"#f87171"}}>↺ Reset</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ZOOM */}
      <div style={{position:"absolute",bottom:24,right:24,zIndex:10,display:"flex",gap:16,alignItems:"flex-end"}}>
        <div style={{display:"flex",flexDirection:"column",gap:6,...GLASS,padding:"6px",borderRadius:12}}>
          {[{i:"+",f:()=>zoomBtn(1.3)},{i:"−",f:()=>zoomBtn(0.77)},{i:"⌂",f:resetVp}].map(({i,f})=>(
            <button key={i} className="glass-btn" onClick={f} style={{width:36,height:36,borderRadius:8,fontSize:i==="⌂"?16:22,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",paddingBottom:i==="+"?2:0}}>{i}</button>
          ))}
          <div style={{marginTop:4,textAlign:"center",fontFamily:C.mono,fontSize:10,color:C.t1,fontWeight:600}}>{Math.round(vp.scale*100)}%</div>
        </div>
      </div>

      <RadarHUD puestos={puestos} obraByPuesto={obraByPuesto} vp={vp} containerW={containerSize.w} containerH={containerSize.h}/>

      {/* TOOLTIP */}
      {tooltip&&!obraDragPos&&!focusedPuesto&&(()=>{
        const obra=obraByPuesto[tooltip.puesto.id],oC=C.obra[obra?.estado??"vacio"];
        const rect=svgRef.current?.getBoundingClientRect();if(!rect)return null;
        const tx=Math.min(tooltip.cx-rect.left+24,rect.width-310),ty=Math.max(24,Math.min(tooltip.cy-rect.top-24,rect.height-220));
        const hasFicha=obra&&(obra.propietario||obra.motores||obra.grupo_electrogeno||obra.teca_cockpit||obra.madera_muebles||obra.color_casco);
        const SpecRow=({label,val})=>val?(<div style={{display:"flex",gap:6,alignItems:"baseline"}}><span style={{fontSize:9,color:"rgba(255,255,255,0.3)",letterSpacing:1,textTransform:"uppercase",fontFamily:C.mono,minWidth:46,flexShrink:0}}>{label}</span><span style={{fontSize:11,color:"rgba(255,255,255,0.7)",lineHeight:1.3}}>{val}</span></div>):null;
        return(
          <div style={{position:"absolute",left:tx,top:ty,zIndex:20,...GLASS,borderRadius:12,padding:"16px",minWidth:250,maxWidth:310,pointerEvents:"none",animation:"fadeUp 0.15s cubic-bezier(0.16,1,0.3,1)"}}>
            {/* Header */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:hasFicha?10:12}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{width:10,height:10,borderRadius:5,background:oC.glow,boxShadow:obra?`0 0 12px ${oC.glow}`:"none"}}/>
                <span style={{fontFamily:C.mono,fontSize:15,color:C.t0,fontWeight:700}}>{obra?obra.codigo:`Puesto ${tooltip.puesto.label}`}</span>
                {obra?.tipo_cabina&&<span style={{fontSize:8,letterSpacing:1,color:"rgba(255,255,255,0.3)",background:"rgba(255,255,255,0.06)",padding:"1px 5px",borderRadius:3}}>{obra.tipo_cabina}</span>}
              </div>
              <span style={{fontSize:9,letterSpacing:1.5,textTransform:"uppercase",color:oC.glow,fontWeight:600,background:`${oC.glow}15`,padding:"2px 6px",borderRadius:4}}>{oC.label}</span>
            </div>

            {/* Propietario / Constructor */}
            {obra?.propietario&&(
              <div style={{fontSize:11,color:C.t0,marginBottom:8,fontWeight:600,display:"flex",alignItems:"center",gap:5}}>
                <span style={{fontSize:10}}>👤</span>
                <span>{obra.propietario}</span>
                {obra.constructor&&<span style={{color:C.t2,fontWeight:400,fontSize:10}}>· {obra.constructor}</span>}
              </div>
            )}
            {obra?.descripcion&&!obra?.propietario&&<div style={{fontSize:12,color:C.t1,marginBottom:10,lineHeight:1.5}}>{obra.descripcion}</div>}

            {/* Ficha técnica */}
            {hasFicha&&(
              <div style={{display:"flex",flexDirection:"column",gap:5,marginBottom:10,paddingBottom:10,borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
                <SpecRow label="Motor"  val={obra.motores}/>
                <SpecRow label="Chapa"  val={obra.madera_muebles}/>
                <SpecRow label="Casco"  val={obra.color_casco}/>
                {/* Badges de equipamiento */}
                <div style={{display:"flex",gap:5,flexWrap:"wrap",marginTop:3}}>
                  {obra.grupo_electrogeno&&<span style={{fontSize:9,padding:"2px 7px",borderRadius:4,background:"rgba(245,158,11,0.12)",color:"#fcd34d",border:"1px solid rgba(245,158,11,0.2)"}}>⚡ {obra.grupo_electrogeno_det||"Grupo elect."}</span>}
                  {obra.teca_cockpit&&<span style={{fontSize:9,padding:"2px 7px",borderRadius:4,background:"rgba(180,140,60,0.12)",color:"#d4b483",border:"1px solid rgba(180,140,60,0.2)"}}>🪵 {obra.teca_cockpit_det||"Teca/Infinity"}</span>}
                  {obra.starlink&&<span style={{fontSize:9,padding:"2px 7px",borderRadius:4,background:"rgba(99,102,241,0.12)",color:"#a5b4fc",border:"1px solid rgba(99,102,241,0.2)"}}>🛰 Starlink</span>}
                  {obra.sternthruster&&<span style={{fontSize:9,padding:"2px 7px",borderRadius:4,background:"rgba(56,189,248,0.12)",color:"#7dd3fc",border:"1px solid rgba(56,189,248,0.2)"}}>⚓ Stern</span>}
                </div>
              </div>
            )}

            {/* Progreso */}
            {obra?(
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:10,fontFamily:C.mono,color:C.t1}}>
                  <span>Progreso</span><span style={{color:oC.glow,fontWeight:700}}>{obra._pct??0}%</span>
                </div>
                <div style={{width:"100%",height:4,background:"rgba(255,255,255,0.08)",borderRadius:2,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${obra._pct??0}%`,background:oC.glow,boxShadow:`0 0 10px ${oC.glow}`}}/>
                </div>
                <div style={{fontSize:10,color:C.t2,marginTop:4}}>Click-derecho → menú · F → enfocar</div>
              </div>
            ):<div style={{fontSize:11,color:C.t2}}>{editMode?"✦ Arrastrá, ↻ rotar, × eliminar":"✦ Click para asignar · F para enfocar"}</div>}
          </div>
        );
      })()}

      {/* DRAG GHOST */}
      {obraDragPos&&dragRef.current?.obra&&(()=>{
        const {obra}=dragRef.current,oC=C.obra[obra.estado]??C.obra.vacio;
        const rect=svgRef.current?.getBoundingClientRect();if(!rect)return null;
        return(<div style={{position:"absolute",left:obraDragPos.x-rect.left-80,top:obraDragPos.y-rect.top-30,zIndex:50,pointerEvents:"none",...GLASS,borderColor:oC.glow,borderRadius:12,padding:"12px 20px",boxShadow:`0 16px 32px rgba(0,0,0,0.6),0 0 0 1px ${oC.glow} inset,0 0 20px ${oC.glow}40`}}>
          <div style={{fontSize:9,color:oC.glow,letterSpacing:2,textTransform:"uppercase",marginBottom:4,fontWeight:600}}>Reubicando</div>
          <div style={{fontFamily:C.mono,fontSize:16,color:C.t0,fontWeight:800}}>{obra.codigo}</div>
          <div style={{fontSize:11,color:C.t1,marginTop:6}}>{obraDragOver?"↓ Soltar para asignar":"Buscando puesto libre..."}</div>
        </div>);
      })()}

      {/* STATUS BAR */}
      <div style={{position:"absolute",bottom:16,left:"50%",transform:"translateX(-50%)",zIndex:5,pointerEvents:"none",userSelect:"none"}}>
        {focusedPuesto?(
          <div style={{padding:"8px 24px",borderRadius:30,background:"rgba(59,130,246,0.12)",border:"1px solid rgba(59,130,246,0.35)",fontSize:11,color:"#60a5fa",letterSpacing:1.2,fontWeight:600,backdropFilter:"blur(8px)"}}>
            ◎ MODO FOCO — Click en área oscura o <span style={{fontFamily:C.mono,background:"rgba(96,165,250,0.15)",padding:"1px 6px",borderRadius:4}}>Esc</span> para salir
          </div>
        ):editMode?(
          <div style={{padding:"8px 24px",borderRadius:30,background:"rgba(251,191,36,0.12)",border:"1px solid rgba(251,191,36,0.4)",fontSize:11,color:"#fbbf24",letterSpacing:1.5,fontWeight:600,backdropFilter:"blur(8px)"}}>
            ✏️ MODO EDICIÓN — <span style={{fontFamily:C.mono,background:"rgba(251,191,36,0.15)",padding:"1px 5px",borderRadius:4}}>E</span> para salir
          </div>
        ):(
          <div style={{display:"flex",gap:12,alignItems:"center",padding:"6px 18px",borderRadius:30,background:"rgba(0,0,0,0.4)",border:`1px solid ${C.b0}`,backdropFilter:"blur(8px)"}}>
            {[["RUEDA","Zoom"],["DRAG","Pan"],["CLICK","Gestionar"],["CLICK-DER","Menú Radial"],["F","Enfocar"],["⌘K","Buscar"]].map(([key,label])=>(
              <span key={key} style={{fontSize:9,color:C.t2,letterSpacing:1.5}}>
                <span style={{fontFamily:C.mono,color:C.t1,background:"rgba(255,255,255,0.05)",padding:"1px 5px",borderRadius:4,fontSize:9}}>{key}</span>{" "}{label}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* RADIAL MENU */}
      {contextMenu&&ctxPuesto&&(
        <RadialMenu x={contextMenu.x} y={contextMenu.y} puesto={ctxPuesto} obra={ctxObra} editMode={editMode}
          onClose={()=>setContextMenu(null)}
          onAssign={()=>setAddObraFor(ctxPuesto.id)}
          onFocus={()=>{setFocusedPuesto(ctxPuesto.id);centerOnPuesto(ctxPuesto);}}
          onDetail={()=>ctxObra&&onPuestoClick?.({puesto:ctxPuesto,obra:ctxObra})}
          onChangeEstado={onChangeEstado}
          onDelete={()=>setConfirmDel(ctxPuesto.id)}/>
      )}

      {/* COMMAND PALETTE */}
      {cmdPaletteOpen&&(
        <CommandPalette obras={obras} puestos={puestos} obraByPuesto={obraByPuesto}
          onClose={()=>setCmdPaletteOpen(false)} onAction={handlePaletteAction}/>
      )}

      {/* ADD OBRA MODAL */}
      {addObraFor&&(
        <AddObraModal puestoId={addObraFor} puestos={puestos} obras={obras}
          onAssign={handleModalAssign} onClose={()=>setAddObraFor(null)}/>
      )}

      {/* CONFIRM DELETE */}
      {confirmDel&&(
        <div style={{position:"fixed",inset:0,zIndex:600,background:"rgba(0,0,0,0.8)",display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(4px)"}} onClick={()=>setConfirmDel(null)}>
          <div style={{...GLASS,border:"1px solid rgba(239,68,68,0.4)",borderRadius:16,padding:"24px",width:320,animation:"fadeUp 0.15s ease",boxShadow:"0 24px 48px rgba(0,0,0,0.9),0 0 0 1px rgba(239,68,68,0.2) inset"}} onClick={e=>e.stopPropagation()}>
            <div style={{width:40,height:40,borderRadius:20,background:"rgba(239,68,68,0.15)",display:"flex",alignItems:"center",justifyContent:"center",color:"#ef4444",fontSize:20,marginBottom:16,border:"1px solid rgba(239,68,68,0.3)"}}>!</div>
            <div style={{fontSize:16,color:C.t0,fontWeight:600,marginBottom:8}}>Eliminar Puesto</div>
            <div style={{fontSize:13,color:C.t1,marginBottom:16,lineHeight:1.5}}>¿Eliminar el puesto <strong style={{color:C.t0}}>{confirmDel}</strong>?</div>
            {obraByPuesto[confirmDel]&&<div style={{fontSize:12,color:"#f59e0b",marginBottom:24,padding:"10px 12px",borderRadius:8,background:"rgba(245,158,11,0.1)",border:"1px solid rgba(245,158,11,0.3)"}}>La obra asignada quedará sin puesto en el plano.</div>}
            <div style={{display:"flex",gap:12}}>
              <button onClick={()=>setConfirmDel(null)} className="glass-btn" style={{flex:1,padding:"10px",borderRadius:8,cursor:"pointer",fontSize:13,fontWeight:600}}>Cancelar</button>
              <button onClick={()=>removePuesto(confirmDel)} style={{flex:1,padding:"10px",borderRadius:8,border:"none",background:"#ef4444",color:"#fff",cursor:"pointer",fontSize:13,fontWeight:600,boxShadow:"0 4px 12px rgba(239,68,68,0.4)"}}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
