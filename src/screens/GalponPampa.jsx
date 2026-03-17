/**
 * GalponPampa.jsx  v17 - FOCO TOTAL 🚀
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useMemo, useRef, useCallback, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import k37Img  from "./k37.png";
import k42Img  from "./k42.png";
import k43Img  from "./k43.png";
import k52Img  from "./k52.png";
import k55Img  from "./k55.png";
import k64Img  from "./k64.png";
import k85Img  from "./K85.png";

// IMPORTAMOS EL PNG
import planoFondo from "./galpon_pampa.png"; 

/* ─── PALETA ───────────────────────── */
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

// Coincide exactamente con las dimensiones del PNG galpon_pampa.png (2000×1414)
const VB_W=2000, VB_H=1414;

const BOAT_IMGS={k37:k37Img,k42:k42Img,k43:k43Img,k52:k52Img,k55:k55Img,k64:k64Img,k85:k85Img};

/* ─── PUESTOS INICIALES ─────────────────────────────────────────
   Nave central: x≈596–1331, y≈110–1180 en espacio VB 2000×1414
   Dos k85 de arranque, uno por mitad de nave.
─────────────────────────────────────────────────────────────── */
let _nextN=4;
const genId=()=>`pp-${String(_nextN++).padStart(2,"0")}`;

const PUESTOS_INITIAL=[
  {id:"pp-01",label:"01",cx:780,  cy:580, w:120, h:280, rot:0, tipo:"k85"},
  {id:"pp-02",label:"02",cx:1150, cy:580, w:120, h:280, rot:0, tipo:"k85"},
];

// LLAVE V17 PARA BORRAR LA CACHÉ
const LS_KEY      ="pampa_puestos_v17";
const LS_NOTAS_KEY="pampa_notas_v17";
const LS_MEM_KEY  ="pampa_memorias_v17";

function loadPuestos(){
  try{const r=localStorage.getItem(LS_KEY);if(r){const p=JSON.parse(r);if(p?.length){p.forEach(x=>{const n=parseInt((x.id||"").replace("pp-",""),10);if(!isNaN(n)&&n>=_nextN)_nextN=n+1;});return p;}}}catch{}
  return PUESTOS_INITIAL;
}
function savePuestos(p){try{localStorage.setItem(LS_KEY,JSON.stringify(p));}catch{}}
function loadNotas(){try{const r=localStorage.getItem(LS_NOTAS_KEY);return r?JSON.parse(r):{};}catch{return{};}}
function saveNotas(n){try{localStorage.setItem(LS_NOTAS_KEY,JSON.stringify(n));}catch{}}
function loadMemorias(){try{const r=localStorage.getItem(LS_MEM_KEY);return r?JSON.parse(r):{};}catch{return{};}}
function saveMemorias(m){try{localStorage.setItem(LS_MEM_KEY,JSON.stringify(m));}catch{}}

const LEGEND=[
  {key:"activa",   color:"#3b82f6"},
  {key:"pausada",  color:"#f59e0b"},
  {key:"terminada",color:"#10b981"},
  {key:"cancelada",color:"#ef4444"},
  {key:"vacio",    color:"#6366f1",isWire:true},
];

/* ═══════════════════════════════════════════════════════════════════
   ADD OBRA MODAL
══════════════════════════════════════════════════════════════════ */
function AddObraModal({puestoId,puestos,obras,onAssign,onClose}){
  const [q,setQ]=useState(""); const [selIdx,setSelIdx]=useState(0);
  const inputRef=useRef(null); const listRef=useRef(null);
  const p=puestos.find(x=>x.id===puestoId);
  const list=useMemo(()=>obras.filter(o=>
    !o.bahia_pampa&&
    ["activa","pausada","terminada"].includes(o.estado)&&
    [o.codigo,o.descripcion].some(s=>s?.toLowerCase().includes(q.toLowerCase()))
  ),[obras,q]);
  useEffect(()=>{inputRef.current?.focus();},[]);
  useEffect(()=>{setSelIdx(0);},[q]);
  const handleKeyDown=e=>{
    if(e.key==="ArrowDown"){e.preventDefault();setSelIdx(i=>Math.min(i+1,list.length-1));}
    else if(e.key==="ArrowUp"){e.preventDefault();setSelIdx(i=>Math.max(i-1,0));}
    else if(e.key==="Enter"&&list[selIdx])onAssign(puestoId,list[selIdx].id);
    else if(e.key==="Escape")onClose();
  };
  useEffect(()=>{listRef.current?.children[selIdx]?.scrollIntoView({block:"nearest"});},[selIdx]);
  return(
    <div style={{position:"fixed",inset:0,zIndex:500,background:"rgba(0,0,0,0.6)",display:"flex",alignItems:"flex-start",justifyContent:"center",paddingTop:"12vh",animation:"ppFadeIn 0.15s ease"}} onClick={onClose}>
      <div style={{width:420,maxHeight:"60vh",display:"flex",flexDirection:"column",...GLASS,borderRadius:16,overflow:"hidden",border:"1px solid rgba(255,255,255,0.1)",boxShadow:"0 24px 48px -12px rgba(0,0,0,0.9)"}} onClick={e=>e.stopPropagation()}>
        <div style={{padding:"16px",borderBottom:`1px solid ${C.b0}`,display:"flex",flexDirection:"column",gap:12}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <div style={{padding:"4px 8px",background:"rgba(167,139,250,0.15)",borderRadius:6,border:"1px solid rgba(167,139,250,0.3)"}}>
                <span style={{fontSize:10,letterSpacing:1.5,color:"#a78bfa",textTransform:"uppercase",fontWeight:600}}>Asignar Obra</span>
              </div>
              <span style={{fontFamily:C.mono,fontSize:13,color:C.t2}}>→ Puesto {p?.label??puestoId}</span>
            </div>
            <button onClick={onClose} style={{background:"transparent",border:"none",color:C.t2,fontSize:16,cursor:"pointer",padding:4,borderRadius:6,lineHeight:1}}>✕</button>
          </div>
          <input ref={inputRef} value={q} onChange={e=>setQ(e.target.value)} onKeyDown={handleKeyDown}
            placeholder="Buscar obra... (↑↓ navegar, Enter asignar)"
            style={{width:"100%",boxSizing:"border-box",padding:"12px 14px",borderRadius:8,background:"rgba(0,0,0,0.3)",border:`1px solid rgba(255,255,255,0.08)`,color:C.t0,fontSize:14,fontFamily:C.sans,outline:"none"}}
            onFocus={e=>e.currentTarget.style.border="1px solid rgba(167,139,250,0.5)"}
            onBlur={e=>e.currentTarget.style.border="1px solid rgba(255,255,255,0.08)"}/>
        </div>
        <div ref={listRef} style={{flex:1,overflowY:"auto",padding:"8px",display:"flex",flexDirection:"column",gap:4}}>
          {!list.length&&<div style={{textAlign:"center",padding:"32px 8px",fontSize:13,color:C.t2}}>{q?"No se encontraron obras":"No hay obras pendientes de asignar"}</div>}
          {list.map((obra,i)=>{
            const oC=C.obra[obra.estado]??C.obra.vacio,isSel=i===selIdx;
            return(<div key={obra.id} onClick={()=>onAssign(puestoId,obra.id)}
              style={{padding:"12px 16px",borderRadius:10,cursor:"pointer",display:"flex",flexDirection:"column",gap:6,transition:"all 0.12s",background:isSel?"rgba(167,139,250,0.08)":"transparent",border:`1px solid ${isSel?"rgba(167,139,250,0.3)":"transparent"}`}}
              onMouseEnter={()=>setSelIdx(i)}>
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

/* ═══════════════════════════════════════════════════════════════════
   RADIAL MENU 
══════════════════════════════════════════════════════════════════ */
function RadialMenu({x,y,puesto,obra,editMode,onClose,onAssign,onFocus,onDetail,onChangeEstado,onDelete}){
  const menuRef=useRef(null);
  const RADIUS=76;
  useEffect(()=>{
    const h=e=>{if(!menuRef.current?.contains(e.target))onClose();};
    const t=setTimeout(()=>window.addEventListener("mousedown",h),60);
    return()=>{clearTimeout(t);window.removeEventListener("mousedown",h);};
  },[onClose]);
  const actions=useMemo(()=>{
    const base=[];
    if(obra){
      base.push({id:"focus", icon:"⊙",label:"Enfocar",  color:"#e2e8f0"});
      base.push({id:"detail",icon:"≡",label:"Detalle",  color:"#60a5fa"});
      if(obra.estado==="activa")   base.push({id:"pausar",    icon:"⏸",label:"Pausar",    color:"#fbbf24"});
      if(obra.estado==="pausada")  base.push({id:"reanudar",  icon:"▶",label:"Reanudar",  color:"#34d399"});
      if(!["terminada","cancelada"].includes(obra.estado))
        base.push({id:"terminar",  icon:"✓",label:"Terminar",  color:"#10b981"});
      base.push({id:"desasignar",  icon:"⇌",label:"Desvincular",color:"#f87171"});
    }else{
      base.push({id:"asignar",     icon:"+",label:"Asignar",   color:"#a78bfa"});
    }
    if(editMode) base.push({id:"delete",icon:"×",label:"Eliminar",color:"#ef4444"});
    return base;
  },[obra,editMode]);
  const step=360/actions.length;
  const handleAction=id=>{
    if(id==="focus")       onFocus();
    else if(id==="detail") onDetail();
    else if(id==="asignar")onAssign();
    else if(id==="delete") onDelete();
    else if(id==="desasignar") onChangeEstado?.(obra.id,"desasignar");
    else if(id==="pausar")     onChangeEstado?.(obra.id,"pausada");
    else if(id==="reanudar")   onChangeEstado?.(obra.id,"activa");
    else if(id==="terminar")   onChangeEstado?.(obra.id,"terminada");
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
            style={{position:"absolute",left:ax-24,top:ay-24,width:48,height:48,borderRadius:24,background:"rgba(8,8,12,0.97)",border:`1.5px solid ${action.color}35`,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",cursor:"pointer",pointerEvents:"auto",fontFamily:C.sans,boxShadow:`0 4px 16px rgba(0,0,0,0.6),0 0 0 1px ${action.color}12`,animation:`ppRadialPop 0.22s cubic-bezier(0.34,1.56,0.64,1) ${i*28}ms both`,transition:"background 0.12s,border-color 0.12s,transform 0.12s"}}
            onMouseEnter={e=>{e.currentTarget.style.background=`${action.color}1a`;e.currentTarget.style.borderColor=action.color;e.currentTarget.style.transform="scale(1.14)";}}
            onMouseLeave={e=>{e.currentTarget.style.background="rgba(8,8,12,0.97)";e.currentTarget.style.borderColor=`${action.color}35`;e.currentTarget.style.transform="scale(1)";}}>
            <span style={{fontSize:15,color:action.color,lineHeight:1,pointerEvents:"none"}}>{action.icon}</span>
            <span style={{fontSize:7,color:"rgba(255,255,255,0.38)",marginTop:2,letterSpacing:0.4,lineHeight:1,pointerEvents:"none"}}>{action.label.split(" ")[0].toUpperCase()}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   COMMAND PALETTE 
══════════════════════════════════════════════════════════════════ */
function CommandPalette({obras,puestos,obraByPuesto,onClose,onAction}){
  const [q,setQ]=useState(""); const [selIdx,setSelIdx]=useState(0);
  const inputRef=useRef(null); const listRef=useRef(null);
  useEffect(()=>{inputRef.current?.focus();},[]);
  const puestosLibres=useMemo(()=>puestos.filter(p=>!obraByPuesto[p.id]),[puestos,obraByPuesto]);
  const groups=useMemo(()=>{
    const ql=q.toLowerCase(), result=[];
    const quick=[
      {type:"action",id:"reset-view", icon:"⌂",label:"Resetear Vista",    sub:"R",    color:"#a1a1aa"},
      {type:"action",id:"toggle-edit",icon:"◩",label:"Activar Modo Edición",sub:"E",  color:"#fbbf24"},
      {type:"action",id:"zoom-in",    icon:"+",label:"Acercar Zoom",       sub:"+ / =",color:"#a1a1aa"},
      {type:"action",id:"zoom-out",   icon:"−",label:"Alejar Zoom",        sub:"−",    color:"#a1a1aa"},
    ].filter(a=>!q||a.label.toLowerCase().includes(ql));
    if(quick.length) result.push({group:"Acciones",items:quick});
    const libre=puestosLibres.filter(p=>!q||`puesto ${p.label}`.includes(ql)||p.label.includes(q)).slice(0,6)
      .map(p=>({type:"puesto-libre",id:p.id,icon:"◻",label:`Puesto ${p.label}`,sub:"Disponible",color:"#6366f1",p}));
    if(libre.length) result.push({group:"Puestos Disponibles",items:libre});
    const unassigned=obras.filter(o=>!o.bahia_pampa&&[o.codigo,o.descripcion].some(s=>s?.toLowerCase().includes(ql))).slice(0,8)
      .map(o=>({type:"obra-libre",id:o.id,icon:"●",label:o.codigo,sub:o.descripcion??"Sin descripción",color:C.obra[o.estado]?.glow??"#a1a1aa",obra:o}));
    if(unassigned.length) result.push({group:"Obras Sin Asignar",items:unassigned});
    const assigned=obras.filter(o=>o.bahia_pampa&&[o.codigo,o.descripcion].some(s=>s?.toLowerCase().includes(ql))).slice(0,6)
      .map(o=>{const p=puestos.find(px=>px.id===o.bahia_pampa);return{type:"obra-asignada",id:o.id,icon:"◉",label:o.codigo,sub:`Puesto ${p?.label??"?"}`,color:C.obra[o.estado]?.glow??"#a1a1aa",obra:o,p};});
    if(assigned.length) result.push({group:"Obras en Mapa",items:assigned});
    return result;
  },[q,obras,puestosLibres,puestos,obraByPuesto]);
  const flat=useMemo(()=>groups.flatMap(g=>g.items),[groups]);
  useEffect(()=>{setSelIdx(0);},[q]);
  useEffect(()=>{listRef.current?.querySelector(`[data-idx="${selIdx}"]`)?.scrollIntoView({block:"nearest"});},[selIdx]);
  const handleKeyDown=e=>{
    if(e.key==="ArrowDown"){e.preventDefault();setSelIdx(i=>Math.min(i+1,flat.length-1));}
    else if(e.key==="ArrowUp"){e.preventDefault();setSelIdx(i=>Math.max(i-1,0));}
    else if(e.key==="Enter"){e.preventDefault();if(flat[selIdx]){onAction(flat[selIdx]);onClose();}}
    else if(e.key==="Escape")onClose();
  };
  let flatIdx=0;
  return(
    <div style={{position:"fixed",inset:0,zIndex:900,background:"rgba(0,0,0,0.55)",display:"flex",alignItems:"flex-start",justifyContent:"center",paddingTop:"10vh",animation:"ppFadeIn 0.12s ease",backdropFilter:"blur(4px)"}} onClick={onClose}>
      <div style={{width:520,maxHeight:"70vh",display:"flex",flexDirection:"column",...GLASS,borderRadius:16,overflow:"hidden",border:"1px solid rgba(255,255,255,0.12)",boxShadow:"0 32px 64px -12px rgba(0,0,0,0.95)"}} onClick={e=>e.stopPropagation()}>
        <div style={{padding:"14px 16px",display:"flex",alignItems:"center",gap:12,borderBottom:`1px solid ${C.b0}`}}>
          <span style={{fontSize:16,color:C.t2}}>⌘</span>
          <input ref={inputRef} value={q} onChange={e=>setQ(e.target.value)} onKeyDown={handleKeyDown}
            placeholder="Buscar obra, puesto o acción..."
            style={{flex:1,background:"transparent",border:"none",outline:"none",fontSize:15,color:C.t0,fontFamily:C.sans}}/>
          <kbd style={{padding:"2px 7px",borderRadius:5,background:"rgba(255,255,255,0.06)",border:`1px solid ${C.b0}`,fontSize:10,color:C.t2,fontFamily:C.mono}}>Esc</kbd>
        </div>
        <div ref={listRef} style={{flex:1,overflowY:"auto",padding:"8px"}}>
          {groups.map(g=>(
            <div key={g.group}>
              <div style={{padding:"10px 12px 4px",fontSize:9,letterSpacing:2,textTransform:"uppercase",color:C.t2,fontFamily:C.mono}}>{g.group}</div>
              {g.items.map(item=>{
                const idx=flatIdx++, isSel=idx===selIdx;
                return(
                  <div key={item.id} data-idx={idx} onClick={()=>{onAction(item);onClose();}} onMouseEnter={()=>setSelIdx(idx)}
                    style={{display:"flex",alignItems:"center",gap:12,padding:"10px 12px",borderRadius:8,cursor:"pointer",background:isSel?"rgba(255,255,255,0.06)":"transparent",marginBottom:2}}>
                    <div style={{width:28,height:28,borderRadius:8,background:`${item.color}14`,border:`1px solid ${item.color}22`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                      <span style={{fontSize:13,color:item.color}}>{item.icon}</span>
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,color:isSel?C.t0:C.t1,fontWeight:isSel?600:400}}>{item.label}</div>
                      {item.sub&&<div style={{fontSize:10,color:C.t2,marginTop:1}}>{item.sub}</div>}
                    </div>
                    {item.type==="action"&&<kbd style={{padding:"2px 7px",borderRadius:5,background:"rgba(255,255,255,0.06)",border:`1px solid ${C.b0}`,fontSize:10,color:C.t2,fontFamily:C.mono,flexShrink:0}}>{item.sub}</kbd>}
                  </div>
                );
              })}
            </div>
          ))}
          {!flat.length&&<div style={{textAlign:"center",padding:"32px 0",color:C.t2,fontSize:13}}>Sin resultados para "{q}"</div>}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   CINEMATIC CALLOUTS
═══════════════════════════════════════════════════════════════════ */
function CinematicCallouts({p,obra,oC}){
  const PAD=14,L=20;
  const x0=p.cx-p.w/2-PAD, y0=p.cy-p.h/2-PAD, x1=p.cx+p.w/2+PAD, y1=p.cy+p.h/2+PAD;
  return(
    <g transform={`rotate(${p.rot||0},${p.cx},${p.cy})`} style={{pointerEvents:"none"}}>
      <rect x={x0} y={y0} width={x1-x0} height={y1-y0} rx={(x1-x0)*0.06}
        fill="none" stroke={`${oC.glow}18`} strokeWidth="0.6" strokeDasharray="8 8"
        style={{animation:"ppFocusScan 5s linear infinite"}}/>
      {[[x0,y0,L,L],[x1,y0,-L,L],[x0,y1,L,-L],[x1,y1,-L,-L]].map((c,i)=>(
        <g key={i} stroke={oC.glow} strokeWidth="2" strokeLinecap="round"
          style={{opacity:0,animation:`ppFocusBracket 0.4s cubic-bezier(0.34,1.4,0.64,1) ${i*60}ms forwards`,filter:`drop-shadow(0 0 5px ${oC.glow}90)`}}>
          <line x1={c[0]} y1={c[1]} x2={c[0]+c[2]} y2={c[1]}/>
          <line x1={c[0]} y1={c[1]} x2={c[0]}       y2={c[1]+c[3]}/>
        </g>
      ))}
    </g>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   CINEMATIC CARDS
═══════════════════════════════════════════════════════════════════ */
function CinematicCards({p,obra,oC,memoriaOverride,vp,svgRef}){
  const mem={...(memoriaOverride??{})};
  const IC={
    motor:<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="2" y="8" width="20" height="10" rx="2"/><path d="M6 8V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/></svg>,
    bolt: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
    user: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>,
    hard: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M2 17h20v2a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-2z"/><path d="M12 3a9 9 0 0 1 9 9H3a9 9 0 0 1 9-9z"/></svg>,
    pal:  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="10"/></svg>,
    note: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  };
  const slots=[
    {key:"tl",label:"MOTOR",       val:obra?.motores??mem.motorizacion??null,                                  icon:IC.motor, ox:-1,oy:-1},
    {key:"tr",label:"GRUPO ELECT.",val:obra?.grupo_electrogeno_det??(obra?.grupo_electrogeno?"Sí":null)??mem.grupo_electrogeno??null, icon:IC.bolt,  ox:1, oy:-1},
    {key:"l", label:"PROPIETARIO", val:obra?.propietario??mem.propietario??null,                               icon:IC.user,  ox:-1,oy:0},
    {key:"r", label:"CONSTRUCTOR", val:obra?.constructor??mem.constructor??null,                               icon:IC.hard,  ox:1, oy:0},
    {key:"bl",label:"MESADAS",     val:obra?.color_mesadas??mem.color_mesadas??null,                           icon:IC.pal,   ox:-1,oy:1},
    {key:"br",label:"ADICIONALES", val:mem.adicionales??null,                                                  icon:IC.note,  ox:1, oy:1},
  ].filter(s=>s.val);
  if(!vp||!slots.length) return null;
  const svgRect=svgRef?.current?.getBoundingClientRect?.()??{left:0,top:0};
  const sc=vp.scale;
  const scrX=p.cx*sc+vp.x+svgRect.left, scrY=p.cy*sc+vp.y+svgRect.top;
  const hw=(p.w/2)*sc, hh=(p.h/2)*sc;
  const CARD_W=158,CARD_H=52,PAD=42,HUD_W=445;
  const cW=window.innerWidth, cH=window.innerHeight;
  const pos=slots.map((slot,i)=>{
    const{ox,oy}=slot;
    const anchorX=scrX+ox*hw, anchorY=scrY+oy*hh;
    let cardX=anchorX+ox*PAD, cardY=anchorY+oy*PAD-CARD_H/2;
    if(ox<0) cardX-=CARD_W; if(ox===0) cardX-=CARD_W/2;
    cardX=Math.max(8,Math.min(cW-HUD_W-CARD_W-8,cardX));
    cardY=Math.max(8,Math.min(cH-CARD_H-8,cardY));
    const tx=ox<0?-12:ox>0?12:0, ty=oy<0?-8:oy>0?8:0;
    return{...slot,anchorX,anchorY,cardX,cardY,cardCX:cardX+CARD_W/2,cardCY:cardY+CARD_H/2,delay:`${i*0.07}s`,tx,ty};
  });
  return createPortal(
    <>
     <style>
  {`
    ${pos.map(s => `@keyframes ppCS_${s.key}{0%{opacity:0;transform:translate(${s.tx}px,${s.ty}px) scale(0.88);filter:blur(3px)}60%{opacity:1;transform:translate(${-s.tx*.05}px,0) scale(1.02);filter:blur(0)}100%{opacity:1;transform:translate(0,0) scale(1);filter:blur(0)}}`).join("")}
    @keyframes ppLineGrow{from{stroke-dashoffset:120;opacity:0}to{stroke-dashoffset:0;opacity:1}}
    @keyframes ppDotIn{from{opacity:0;r:0}to{opacity:1;r:2.5}}
  `}
</style>
      <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:900}}>
        <svg style={{position:"absolute",inset:0,width:"100%",height:"100%",overflow:"visible",pointerEvents:"none"}}>
          {pos.map(s=>{const len=Math.hypot(s.cardCX-s.anchorX,s.cardCY-s.anchorY);return(
            <g key={`ln-${s.key}`}>
              <line x1={s.anchorX} y1={s.anchorY} x2={s.cardCX} y2={s.cardCY} stroke={`${oC.glow}35`} strokeWidth="0.8" strokeDasharray={len} strokeDashoffset={len} style={{animation:`ppLineGrow 0.5s ease ${s.delay} forwards`}}/>
              <circle cx={s.anchorX} cy={s.anchorY} r="0" fill={oC.glow} style={{animation:`ppDotIn 0.3s ease ${parseFloat(s.delay)+0.2}s forwards`}}/>
            </g>
          );})}
        </svg>
        {pos.map(s=>{
          const val=(s.val??"").length>24?s.val.slice(0,22)+"…":s.val;
          return(<div key={s.key} style={{position:"absolute",left:s.cardX,top:s.cardY,width:CARD_W,height:CARD_H,background:"rgba(6,8,24,0.96)",border:`1px solid ${oC.glow}25`,borderRadius:8,boxShadow:`0 4px 24px rgba(0,0,0,0.8),inset 0 1px 0 rgba(255,255,255,0.04)`,display:"flex",alignItems:"center",gap:9,padding:"0 12px",animation:`ppCS_${s.key} 0.5s cubic-bezier(0.22,1,0.36,1) ${s.delay} both`,fontFamily:"'Outfit',system-ui,sans-serif",backdropFilter:"blur(14px)",userSelect:"none"}}>
            <div style={{flexShrink:0,width:26,height:26,borderRadius:7,background:`${oC.glow}10`,border:`1px solid ${oC.glow}20`,display:"flex",alignItems:"center",justifyContent:"center",color:`${oC.glow}cc`}}>{s.icon}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:6.5,letterSpacing:"2px",fontWeight:700,fontFamily:"'JetBrains Mono',monospace",color:`${oC.glow}65`,textTransform:"uppercase",marginBottom:3,lineHeight:1}}>{s.label}</div>
              <div style={{fontSize:12.5,fontWeight:600,color:"rgba(255,255,255,0.92)",lineHeight:1.2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{val}</div>
            </div>
          </div>);
        })}
      </div>
    </>,
    document.body
  );
}

/* ═══════════════════════════════════════════════════════════════════
   RADAR HUD 
═══════════════════════════════════════════════════════════════════ */
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
        <g>
          <path d={`M ${W/2} ${H/2} L ${W/2} ${PAD}`} stroke="rgba(0,255,100,0.7)" strokeWidth="1.2" style={{transformOrigin:`${W/2}px ${H/2}px`}}>
            <animateTransform attributeName="transform" type="rotate" from={`0 ${W/2} ${H/2}`} to={`360 ${W/2} ${H/2}`} dur="4s" repeatCount="indefinite"/>
          </path>
          <path d={`M ${W/2} ${H/2} L ${W/2} ${PAD}`} stroke="rgba(0,255,100,0.12)" strokeWidth="5" style={{transformOrigin:`${W/2}px ${H/2}px`}}>
            <animateTransform attributeName="transform" type="rotate" from={`0 ${W/2} ${H/2}`} to={`360 ${W/2} ${H/2}`} dur="4s" repeatCount="indefinite"/>
          </path>
        </g>
        {puestos.map(p=>{const obra=obraByPuesto[p.id];const color=obra?C.obra[obra.estado]?.glow:"#374151";const r=Math.max(1.8,(Math.min(p.w,p.h)*scX)/2.8);return<circle key={p.id} cx={p.cx*scX+PAD} cy={p.cy*scY+PAD} r={r} fill={color} fillOpacity={obra?0.85:0.22} stroke={obra?color:"none"} strokeWidth="0.4" strokeOpacity="0.5"/>;
        })}
        <rect x={visLeft} y={visTop} width={Math.max(4,visW)} height={Math.max(4,visH)} fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.45)" strokeWidth="0.6" strokeDasharray="2 2"/>
        <rect x="0.5" y="0.5" width={W-1} height={H-1} rx="9" fill="none" stroke="rgba(0,255,100,0.18)" strokeWidth="0.5"/>
        <text x="8" y={H-6} fill="rgba(0,255,100,0.45)" fontSize="7" fontFamily="monospace" letterSpacing="1">RADAR · PAMPA</text>
      </svg>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL
═══════════════════════════════════════════════════════════════════ */
export default function GalponPampa({
  obras=[],
  onBack,
  MemoriaHUD,
  esGestion=false,
  onAsignarObra,      
  onChangeEstado,     
  onPuestoClick,      
  sharedPuestos,
  onSaveLayout,
  sharedNotas,
  onSaveNotas,
  sharedMemorias,
  onSaveMemorias,
}){
  const svgRef=useRef(null);
  const vpRef=useRef({x:0,y:0,scale:1});
  const [vp,setVp]=useState({x:0,y:0,scale:1});
  const [puestos,setPuestos]=useState(()=>sharedPuestos?.length?sharedPuestos:loadPuestos());
  const [notasExtra,setNotasExtra]=useState(()=>sharedNotas??loadNotas());
  const [memoriasEdit,setMemoriasEdit]=useState(()=>sharedMemorias??loadMemorias());
  const [hovered,setHovered]=useState(null);
  const [tooltip,setTooltip]=useState(null);
  const [editMode,setEditMode]=useState(false);
  const [addObraFor,setAddObraFor]=useState(null);
  const [confirmDel,setConfirmDel]=useState(null);
  const [isDragging,setIsDragging]=useState(false);
  const [obraDragPos,setObraDragPos]=useState(null);
  const [obraDragOver,setObraDragOver]=useState(null);
  const [newPuestoSize,setNewPuestoSize]=useState("k85");
  const [containerSize,setContainerSize]=useState({w:0,h:0});
  const [contextMenu,setContextMenu]=useState(null);
  const [cmdPaletteOpen,setCmdPaletteOpen]=useState(false);
  const [focusedPuesto,setFocusedPuesto]=useState(null);
  const [layoutSaved,setLayoutSaved]=useState(false);
  const canvasRef=useRef(null);
  const bgImgRef=useRef(null);
  const bgLoadedRef=useRef(false);
  const drawRafRef=useRef(null);
  const dragRef=useRef(null);
  const obraDragOverRef=useRef(null);
  const stateRef=useRef({});
  const puestoDragLiveRef=useRef(null);
  const dragRafRef=useRef(null);
  const [puestoDragLive,setPuestoDragLive]=useState(null);

  useEffect(()=>{stateRef.current={editMode,cmdPaletteOpen,focusedPuesto,addObraFor,confirmDel,contextMenu,hovered,puestos};},[editMode,cmdPaletteOpen,focusedPuesto,addObraFor,confirmDel,contextMenu,hovered,puestos]);
  useEffect(()=>{vpRef.current=vp;},[vp]);
  useEffect(()=>{savePuestos(puestos);},[puestos]);
  useEffect(()=>{saveNotas(notasExtra);onSaveNotas?.(notasExtra);},[notasExtra]);
  useEffect(()=>{saveMemorias(memoriasEdit);onSaveMemorias?.(memoriasEdit);},[memoriasEdit]);
  useEffect(()=>{if(sharedNotas)setNotasExtra(sharedNotas);},[sharedNotas]);
  useEffect(()=>{if(sharedPuestos?.length)setPuestos(sharedPuestos);},[sharedPuestos]);
  useEffect(()=>{if(sharedMemorias)setMemoriasEdit(sharedMemorias);},[sharedMemorias]);
  
  useEffect(()=>{
    const el=svgRef.current; if(!el) return;
    const update=()=>setContainerSize({w:el.clientWidth,h:el.clientHeight});
    update(); window.addEventListener("resize",update);
    return()=>window.removeEventListener("resize",update);
  },[]);

  function handleSaveMemoria(id,fields){setMemoriasEdit(prev=>({...prev,[id]:fields}));}
  function handleSaveLayoutClick(){onSaveLayout?.(puestos);setLayoutSaved(true);setTimeout(()=>setLayoutSaved(false),2500);}
  function handleAddNota(obraId,nota){if(!obraId)return;setNotasExtra(prev=>({...prev,[obraId]:[...(prev[obraId]??[]),nota]}));}
  function handleDeleteNota(obraId,notaId){setNotasExtra(prev=>({...prev,[obraId]:(prev[obraId]??[]).filter(n=>n.id!==notaId)}));}

  const drawBg=useCallback(()=>{
    const canvas=canvasRef.current;
    const img=bgImgRef.current;
    if(!canvas||!img||!bgLoadedRef.current)return;
    const v=vpRef.current;
    const dpr=window.devicePixelRatio||1;
    const w=canvas.offsetWidth, h=canvas.offsetHeight;
    if(!w||!h)return;
    if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){
      canvas.width=Math.round(w*dpr);
      canvas.height=Math.round(h*dpr);
    }
    const ctx=canvas.getContext("2d");
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.filter="invert(1)";
    ctx.globalAlpha=0.88;
    ctx.setTransform(dpr*v.scale,0,0,dpr*v.scale,dpr*v.x,dpr*v.y);
    ctx.drawImage(img,0,0,VB_W,VB_H);
    ctx.filter="none";
    ctx.globalAlpha=1;
  },[]);

  useEffect(()=>{
    const img=new Image();
    img.src=planoFondo;
    img.onload=()=>{bgImgRef.current=img;bgLoadedRef.current=true;drawBg();};
  },[drawBg]);

  useEffect(()=>{
    if(drawRafRef.current)cancelAnimationFrame(drawRafRef.current);
    drawRafRef.current=requestAnimationFrame(()=>{drawRafRef.current=null;drawBg();});
    return()=>{if(drawRafRef.current)cancelAnimationFrame(drawRafRef.current);};
  },[vp,containerSize,drawBg]);

  useLayoutEffect(()=>{
    const fit=()=>{
      const el=svgRef.current;if(!el)return;
      const{width,height}=el.getBoundingClientRect();if(!width||!height)return;
      const scale=Math.min(width*0.92/VB_W,height*0.92/VB_H);
      const next={x:(width-VB_W*scale)/2,y:(height-VB_H*scale)/2,scale};
      vpRef.current=next;setVp(next);
    };
    fit();const t=setTimeout(fit,150);return()=>clearTimeout(t);
  },[]);

  const obraByPuesto=useMemo(()=>{const m={};obras.forEach(o=>{if(o.bahia_pampa)m[o.bahia_pampa]=o;});return m;},[obras]);
  const stats=useMemo(()=>({total:puestos.length,ocupados:puestos.filter(p=>obraByPuesto[p.id]).length,libres:puestos.filter(p=>!obraByPuesto[p.id]).length}),[obraByPuesto,puestos]);

  const onWheel=useCallback(e=>{
    e.preventDefault();
    const rect=svgRef.current?.getBoundingClientRect();if(!rect)return;
    const mx=e.clientX-rect.left,my=e.clientY-rect.top,f=e.deltaY<0?1.15:0.85;
    setVp(v=>{const ns=Math.min(8,Math.max(0.15,v.scale*f));const next={x:mx-(mx-v.x)*(ns/v.scale),y:my-(my-v.y)*(ns/v.scale),scale:ns};vpRef.current=next;return next;});
  },[]);
  useEffect(()=>{const el=svgRef.current;if(!el)return;el.addEventListener("wheel",onWheel,{passive:false});return()=>el.removeEventListener("wheel",onWheel);},[onWheel]);

  const zoomBtn=useCallback(f=>{const rect=svgRef.current?.getBoundingClientRect();if(!rect)return;const cx=rect.width/2,cy=rect.height/2;setVp(v=>{const ns=Math.min(8,Math.max(0.15,v.scale*f));const next={x:cx-(cx-v.x)*(ns/v.scale),y:cy-(cy-v.y)*(ns/v.scale),scale:ns};vpRef.current=next;return next;});},[]);
  const resetVp=useCallback(()=>{const el=svgRef.current;if(!el)return;const{width,height}=el.getBoundingClientRect();const scale=Math.min(width*0.88/VB_W,height*0.88/VB_H);const next={x:(width-VB_W*scale)/2,y:(height-VB_H*scale)/2,scale};vpRef.current=next;setVp(next);},[]);
  const centerOnPuesto=useCallback(p=>{const el=svgRef.current;if(!el)return;const{width,height}=el.getBoundingClientRect();const scale=Math.min(Math.min(width,height)*0.38/Math.max(p.w,p.h),2.8);const next={x:width/2-p.cx*scale,y:height/2-p.cy*scale,scale};vpRef.current=next;setVp(next);},[]);

  /* Keyboard shortcuts */
  useEffect(()=>{
    const handler=e=>{
      const st=stateRef.current;
      if((e.metaKey||e.ctrlKey)&&e.key==="k"){e.preventDefault();setCmdPaletteOpen(v=>!v);return;}
      if(e.key==="Escape"){
        if(st.contextMenu){setContextMenu(null);return;}
        if(st.cmdPaletteOpen){setCmdPaletteOpen(false);return;}
        if(st.addObraFor){setAddObraFor(null);return;}
        if(st.confirmDel){setConfirmDel(null);return;}
        if(st.focusedPuesto){setFocusedPuesto(null);return;}
        onBack?.(); return;
      }
      if(e.target.tagName==="INPUT"||e.target.tagName==="TEXTAREA") return;
      if(st.addObraFor||st.confirmDel||st.cmdPaletteOpen) return;
      if(e.key==="e"||e.key==="E") setEditMode(v=>!v);
      if(e.key==="r"||e.key==="R") resetVp();
      if(e.key==="+"||e.key==="=") zoomBtn(1.3);
      if(e.key==="-") zoomBtn(0.77);
      if((e.key==="f"||e.key==="F")&&st.hovered){const p=st.puestos?.find?.(x=>x.id===st.hovered);if(p){setFocusedPuesto(p.id);centerOnPuesto(p);}}
    };
    window.addEventListener("keydown",handler);
    return()=>window.removeEventListener("keydown",handler);
  },[resetVp,zoomBtn,centerOnPuesto,onBack]);

  /* Pan */
  const startPan=useCallback(e=>{if(e.button!==0)return;dragRef.current={type:"pan",lastX:e.clientX,lastY:e.clientY,vx:0,vy:0,startX:e.clientX,startY:e.clientY,moved:false};setIsDragging(true);},[]);

  /* Puesto drag */
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
      if(Math.hypot(e.clientX-d.startX,e.clientY-d.startY)>4) d.moved=true;
      if(d.type==="pan"){const dx=e.clientX-d.lastX,dy=e.clientY-d.lastY;d.vx=dx;d.vy=dy;d.lastX=e.clientX;d.lastY=e.clientY;setVp(v=>{const n={...v,x:v.x+dx,y:v.y+dy};vpRef.current=n;return n;});}
      else if(d.type==="puesto"&&d.moved){
        const v=vpRef.current;
        const cx=d.startCX+(e.clientX-d.startX)/v.scale;
        const cy=d.startCY+(e.clientY-d.startY)/v.scale;
        puestoDragLiveRef.current={id:d.puestoId,cx,cy};
        if(!dragRafRef.current){
          dragRafRef.current=requestAnimationFrame(()=>{
            dragRafRef.current=null;
            const pos=puestoDragLiveRef.current;
            if(pos)setPuestoDragLive({...pos});
          });
        }
      }
      else if(d.type==="obra"){setObraDragPos({x:e.clientX,y:e.clientY});}
    };
    const onUp=()=>{
      const d=dragRef.current;document.body.style.cursor="";
      if(dragRafRef.current){cancelAnimationFrame(dragRafRef.current);dragRafRef.current=null;}
      if(d?.type==="pan"){let vx=d.vx,vy=d.vy;const step=()=>{vx*=0.85;vy*=0.85;if(Math.abs(vx)<0.3&&Math.abs(vy)<0.3)return;setVp(v=>{const n={...v,x:v.x+vx,y:v.y+vy};vpRef.current=n;return n;});requestAnimationFrame(step);};requestAnimationFrame(step);}
      else if(d?.type==="puesto"){
        const pos=puestoDragLiveRef.current;
        if(pos){setPuestos(prev=>prev.map(p=>p.id===pos.id?{...p,cx:pos.cx,cy:pos.cy}:p));}
        puestoDragLiveRef.current=null;setPuestoDragLive(null);
      }
      else if(d?.type==="obra"){if(!d.moved){onPuestoClick?.({puesto:d.puesto,obra:d.obra});}else{const target=obraDragOverRef.current;if(target&&d.obra&&onAsignarObra) onAsignarObra(target,d.obra.id);}obraDragOverRef.current=null;setObraDragPos(null);setObraDragOver(null);}
      else if(d?.type==="empty"&&!d?.moved){setAddObraFor(d.puestoId);}
      setIsDragging(false);dragRef.current=null;
    };
    window.addEventListener("mousemove",onMove);window.addEventListener("mouseup",onUp);
    return()=>{window.removeEventListener("mousemove",onMove);window.removeEventListener("mouseup",onUp);};
  },[isDragging,onAsignarObra,onPuestoClick]);

  function addPuesto(){
    const v=vpRef.current,rect=svgRef.current?.getBoundingClientRect();
    const cx=rect?(rect.width/2-v.x)/v.scale:VB_W/2,cy=rect?(rect.height/2-v.y)/v.scale:VB_H/2;
    const sizes={
      chico:  {w:50,  h:120, tipo:"k37"},
      mediano:{w:62,  h:152, tipo:"k42"},
      utility:{w:62,  h:152, tipo:"k43"},
      grande: {w:80,  h:192, tipo:"k52"},
      crucero:{w:92,  h:230, tipo:"k55"},
      xl:     {w:108, h:260, tipo:"k64"},
      k85:    {w:120, h:280, tipo:"k85"},
    };
    setPuestos(prev=>[...prev,{id:genId(),label:String(_nextN-1).padStart(2,"0"),cx,cy,rot:0,...sizes[newPuestoSize]}]);
  }
  function removePuesto(id){setPuestos(prev=>prev.filter(p=>p.id!==id));setConfirmDel(null);}
  function toggleRot(id){setPuestos(prev=>prev.map(p=>p.id===id?{...p,rot:(p.rot+90)%360}:p));}
  function resetLayout(){if(!window.confirm("¿Resetear el layout al estado original?"))return;localStorage.removeItem(LS_KEY);_nextN=4;setPuestos(PUESTOS_INITIAL);}
  async function handleModalAssign(pId,oId){if(!onAsignarObra)return;try{await onAsignarObra(pId,oId);}finally{setAddObraFor(null);}}
  function handlePuestoClick(p){if(editMode)return;const obra=obraByPuesto[p.id];if(!obra)setAddObraFor(p.id);else onPuestoClick?.({puesto:p,obra});}
  const handleContextMenu=useCallback((e,p)=>{e.preventDefault();e.stopPropagation();setContextMenu({x:e.clientX,y:e.clientY,puestoId:p.id});setTooltip(null);},[]);
  const handlePaletteAction=useCallback(item=>{
    if(item.type==="action"){if(item.id==="reset-view")resetVp();else if(item.id==="toggle-edit")setEditMode(v=>!v);else if(item.id==="zoom-in")zoomBtn(1.3);else if(item.id==="zoom-out")zoomBtn(0.77);}
    else if(item.type==="puesto-libre"){centerOnPuesto(item.p);setAddObraFor(item.p.id);}
    else if(item.type==="obra-libre"){const libre=puestos.find(p=>!obraByPuesto[p.id]);if(libre){centerOnPuesto(libre);setAddObraFor(libre.id);}}
    else if(item.type==="obra-asignada"&&item.p){centerOnPuesto(item.p);setFocusedPuesto(item.p.id);}
  },[resetVp,zoomBtn,centerOnPuesto,puestos,obraByPuesto]);

  const gsz=60*vp.scale, gsx=((vp.x%gsz)+gsz)%gsz, gsy=((vp.y%gsz)+gsz)%gsz;
  const focusedP=focusedPuesto?puestos.find(p=>p.id===focusedPuesto):null;
  const activeFocusId=focusedP?focusedPuesto:null;
  const focusedObra=focusedP?obraByPuesto[focusedP.id]:null;
  const focusedOC=C.obra[focusedObra?.estado??"vacio"];
  const ctxPuesto=contextMenu?puestos.find(p=>p.id===contextMenu.puestoId):null;
  const ctxObra=ctxPuesto?obraByPuesto[ctxPuesto.id]:null;

  /* renderBoat */
  const renderBoat=p=>{
    if(puestoDragLive?.id===p.id) p={...p,cx:puestoDragLive.cx,cy:puestoDragLive.cy};
    const obra=obraByPuesto[p.id], oC=C.obra[obra?.estado??"vacio"];
    const isHov=hovered===p.id, isEmpty=!obra, isAct=obra?.estado==="activa", isPaused=obra?.estado==="pausada";
    const canDrop=!!obraDragPos&&isEmpty&&p.id!==dragRef.current?.fromId;
    const sc=(isHov&&!editMode&&!isDragging)?1.03:1;
    const imgSrc=BOAT_IMGS[p.tipo]??BOAT_IMGS.k85;
    const ix=p.cx-p.w/2, iy=p.cy-p.h/2;
    const clipId=`ppclip-${p.id}`;
    const isVertical=p.h>p.w;
    const imgW=Math.max(p.w,p.h), imgH=Math.min(p.w,p.h);
    const imgX=p.cx-imgW/2, imgY=p.cy-imgH/2;
    const imgRot=isVertical?`rotate(90,${p.cx},${p.cy})`:undefined;
    
    const glowFilter = (isEmpty || isDragging) ? "none" : isHov ? `drop-shadow(0 0 14px ${oC.glow}) drop-shadow(0 0 5px ${oC.glow}) drop-shadow(0 5px 12px rgba(0,0,0,0.9))`:`drop-shadow(0 0 6px ${oC.glow}90) drop-shadow(0 4px 10px rgba(0,0,0,0.85))`;
    
    const isRotatedVertical=(p.rot||0)%180!==0;
    const bottomOffset=isRotatedVertical?p.w/2+18:p.h/2+18;
    const infoY=p.cy+bottomOffset;
    const BoatImage=({opacity=1,dx=0,dy=0,blur=false})=>{
      const img=<image href={imgSrc} x={imgX+dx} y={imgY+dy} width={imgW} height={imgH} preserveAspectRatio="none" opacity={opacity} draggable={false} style={{pointerEvents:"none",userSelect:"none",mixBlendMode:"screen",...(blur?{filter:"blur(4px)"}:{})}}/>;
      return isVertical?<g transform={imgRot}>{img}</g>:img;
    };
    return(
      <g key={p.id} transform={`rotate(${p.rot||0},${p.cx},${p.cy})`}
        style={{cursor:editMode?"grab":canDrop?"copy":"pointer"}}
        onMouseDown={e=>startPuestoDrag(e,p)}
        onMouseEnter={()=>{setHovered(p.id);if(canDrop){obraDragOverRef.current=p.id;setObraDragOver(p.id);}}}
        onMouseLeave={()=>{setHovered(null);setTooltip(null);if(obraDragOverRef.current===p.id){obraDragOverRef.current=null;setObraDragOver(null);}}}
        onMouseMove={e=>!obraDragPos&&setTooltip({cx:e.clientX,cy:e.clientY,puesto:p})}
        onClick={e=>{if(dragRef.current&&!dragRef.current.moved){e.stopPropagation();handlePuestoClick(p);}}}
        onContextMenu={e=>handleContextMenu(e,p)}>
        <rect x={ix} y={iy} width={p.w} height={p.h} fill="transparent" style={{cursor:"inherit"}}/>
        <g transform={sc!==1?`translate(${p.cx*(1-sc)},${p.cy*(1-sc)}) scale(${sc})`:undefined} style={{transition:"transform 0.2s cubic-bezier(0.175,0.885,0.32,1.275)"}}>
          {isPaused&&(
            <g style={{pointerEvents:"none",userSelect:"none"}}>
              <circle cx={p.cx} cy={p.cy} r="0" fill="none" stroke="#f59e0b" strokeWidth="1.5" style={{animation:"ppSonarPing 2.8s ease-out infinite"}}/>
              <circle cx={p.cx} cy={p.cy} r="0" fill="none" stroke="#f59e0b" strokeWidth="1"   style={{animation:"ppSonarPing 2.8s ease-out 0.9s infinite"}}/>
              <g transform={`translate(${p.cx+p.w*0.28},${p.cy-p.h*0.52})`}>
                <circle r="8" fill="rgba(245,158,11,0.9)" stroke="rgba(0,0,0,0.5)" strokeWidth="1.5"/>
                <text textAnchor="middle" dominantBaseline="middle" y="0.5" fill="#000" fontSize="9" fontWeight="800" fontFamily="system-ui" style={{pointerEvents:"none",userSelect:"none"}}>!</text>
              </g>
            </g>
          )}
          {isEmpty?(
            <g style={{pointerEvents:"none",userSelect:"none"}} clipPath={`url(#${clipId})`}>
              <BoatImage opacity={0.60}/>
              <rect x={ix} y={iy} width={p.w} height={p.h} rx={Math.min(p.w,p.h)*0.06} fill="none" stroke="rgba(255,255,255,0.20)" strokeWidth="1.2" strokeDasharray="6 4" style={{animation:"ppScanLine 15s linear infinite"}}/>
              <path d={`M${p.cx-10},${p.cy} L${p.cx+10},${p.cy} M${p.cx},${p.cy-10} L${p.cx},${p.cy+10}`} stroke="rgba(255,255,255,0.35)" strokeWidth="1.2"/>
              {canDrop&&<text x={p.cx} y={p.cy} textAnchor="middle" dominantBaseline="middle" fill="rgba(167,139,250,0.9)" fontSize={Math.min(p.w,p.h)*0.35} fontWeight="300">⊕</text>}
              {canDrop&&<rect x={ix-6} y={iy-6} width={p.w+12} height={p.h+12} rx={Math.min(p.w,p.h)*0.08} fill="rgba(167,139,250,0.04)" stroke="#a78bfa" strokeWidth="1.5" strokeDasharray="8 6" style={{animation:"ppDashRun .5s linear infinite"}}/>}
            </g>
          ):(
            <g style={{pointerEvents:"none",userSelect:"none"}}>
              <g clipPath={`url(#${clipId})`}><BoatImage opacity={0.20} dx={3} dy={5} blur={true}/></g>
              <g style={{filter:glowFilter,transition:"filter 0.25s ease"}} clipPath={`url(#${clipId})`}><BoatImage opacity={1}/></g>
              <rect x={ix} y={iy} width={p.w} height={p.h} rx={Math.min(p.w,p.h)*0.05} fill={oC.glow} fillOpacity={isHov?0.15:0.07} style={{mixBlendMode:"screen",transition:"fill-opacity 0.2s"}}/>
              {isHov&&<rect x={ix-1} y={iy-1} width={p.w+2} height={p.h+2} rx={Math.min(p.w,p.h)*0.06} fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="0.8"/>}
              {isHov&&<rect x={ix-6} y={iy-6} width={p.w+12} height={p.h+12} rx={Math.min(p.w,p.h)*0.08} fill="none" stroke={oC.glow} strokeWidth="1.5" strokeOpacity="0.5" filter={`url(#ppgl-${obra.estado})`}/>}
              <g transform={`rotate(${-(p.rot||0)},${p.cx},${p.cy})`}>
                <g transform={`translate(${p.cx},${infoY})`}>
                  {(()=>{
                    const codigo=obra.codigo??"";const minSide=Math.min(p.w,p.h);
                    const pillW=Math.max(52,Math.min(codigo.length*8+20,minSide*0.9));
                    const pillH=20;const fs=Math.max(8,Math.min(12,pillW/(Math.max(codigo.length,1)+1)));
                    const bw=Math.min(minSide*0.72,88),bh=3;
                    return(<>
                      <rect x={-pillW/2} y={-pillH/2} width={pillW} height={pillH} rx={pillH/2} fill="rgba(4,4,10,0.92)" stroke={`${oC.glow}55`} strokeWidth="1" style={{filter:"drop-shadow(0 2px 5px rgba(0,0,0,0.85))"}}/>
                      <text x={0} y={1} textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize={fs} fontFamily={C.mono} fontWeight="800" letterSpacing="0.8" style={{userSelect:"none"}}>{codigo}</text>
                      <rect x={-bw/2} y={pillH/2+4} width={bw} height={bh} rx="1.5" fill="rgba(0,0,0,0.6)"/>
                      <rect x={-bw/2} y={pillH/2+4} width={bw*(obra._pct??0)/100} height={bh} rx="1.5" fill={oC.glow} style={{filter:`drop-shadow(0 0 3px ${oC.glow})`}}/>
                    </>);
                  })()}
                </g>
              </g>
              {isAct&&(<>
                <circle cx={p.cx} cy={p.cy} r="0" fill="none" stroke={oC.glow} style={{animation:"ppPulseR 3s cubic-bezier(0.1,0.8,0.3,1) infinite"}}/>
                <circle cx={p.cx} cy={p.cy} r="4" fill={oC.glow} style={{animation:"ppBeacon 2.5s ease-in-out infinite",filter:`drop-shadow(0 0 6px ${oC.glow})`}}/>
              </>)}
            </g>
          )}
          {editMode&&(<>
            <rect x={ix} y={iy} width={p.w} height={p.h} rx={Math.min(p.w,p.h)*0.07} fill="rgba(251,191,36,0.06)" stroke="rgba(251,191,36,0.38)" strokeWidth="1.3" strokeDasharray="4 3" style={{pointerEvents:"none"}}/>
            <g transform={`rotate(${-(p.rot||0)},${ix+11},${iy+11})`} style={{cursor:"pointer"}} onClick={e=>{e.stopPropagation();setConfirmDel(p.id);}}>
              <circle cx={ix+11} cy={iy+11} r="10" fill="rgba(239,68,68,0.93)" stroke="rgba(0,0,0,0.4)" strokeWidth="1"/>
              <text x={ix+11} y={iy+12} textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize="12" fontFamily="system-ui" fontWeight="700" style={{userSelect:"none"}}>×</text>
            </g>
            <g transform={`rotate(${-(p.rot||0)},${ix+p.w-11},${iy+11})`} style={{cursor:"pointer"}} onClick={e=>{e.stopPropagation();toggleRot(p.id);}}>
              <circle cx={ix+p.w-11} cy={iy+11} r="10" fill="rgba(251,191,36,0.93)" stroke="rgba(0,0,0,0.4)" strokeWidth="1"/>
              <text x={ix+p.w-11} y={iy+12} textAnchor="middle" dominantBaseline="middle" fill="#000" fontSize="11" fontFamily="system-ui" fontWeight="700" style={{userSelect:"none"}}>↻</text>
            </g>
          </>)}
        </g>
      </g>
    );
  };

  /* ══════════════ RENDER ══════════════ */
  return(
    <div style={{width:"100%",height:"100%",position:"relative",overflow:"hidden",fontFamily:C.sans,background:C.bg}}>
      <style>{`
        @keyframes ppPulseR    {0%{r:0;opacity:0.8;stroke-width:2}70%{r:36;opacity:0;stroke-width:0}100%{r:40;opacity:0}}
        @keyframes ppBeacon    {0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.5;transform:scale(0.85)}}
        @keyframes ppDashRun   {to{stroke-dashoffset:-32}}
        @keyframes ppScanLine  {0%{stroke-dashoffset:100}100%{stroke-dashoffset:0}}
        @keyframes ppFadeUp    {from{opacity:0;transform:translateY(8px) scale(0.98)}to{opacity:1;transform:translateY(0) scale(1)}}
        @keyframes ppFadeIn    {from{opacity:0}to{opacity:1}}
        @keyframes ppSonarPing {0%{r:0;opacity:0.7;stroke-width:2}80%{r:48;opacity:0;stroke-width:0.5}100%{r:52;opacity:0}}
        @keyframes ppRadialPop {from{opacity:0;transform:scale(0.15)}to{opacity:1;transform:scale(1)}}
        @keyframes ppFocusScan {from{stroke-dashoffset:0}to{stroke-dashoffset:-160}}
        @keyframes ppFocusBracket{from{opacity:0;transform:scale(0.7)}to{opacity:1;transform:scale(1)}}
        @keyframes ppDimIn     {from{opacity:0}to{opacity:1}}
        .pp-glass-btn{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);color:${C.t1};transition:all 0.2s;}
        .pp-glass-btn:hover{background:rgba(255,255,255,0.08);color:${C.t0};border-color:rgba(255,255,255,0.2);}
      `}</style>

      {/* ── CANVAS: plano PNG con invert+screen ──────────────────────────
          ctx.filter="invert(1)" convierte fondo blanco→negro y líneas→blancas.
          mixBlendMode:"screen" hace que el negro sea transparente,
          dejando solo las líneas blancas visibles sobre el fondo oscuro.
      ──────────────────────────────────────────────────────────────── */}
      <canvas ref={canvasRef} style={{
        position:"absolute",inset:0,width:"100%",height:"100%",
        pointerEvents:"none",mixBlendMode:"screen",zIndex:1,
      }}/>

      <svg ref={svgRef}
        style={{position:"absolute",inset:0,width:"100%",height:"100%",display:"block",cursor:isDragging?"grabbing":"grab",zIndex:2}}
        onMouseDown={startPan} onContextMenu={e=>e.preventDefault()}>
        <defs>
          {["activa","pausada","terminada","cancelada"].map(k=>(
            <filter key={k} id={`ppgl-${k}`} x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="12" result="b1"/>
              <feGaussianBlur in="SourceGraphic" stdDeviation="24" result="b2"/>
              <feMerge><feMergeNode in="b2"/><feMergeNode in="b1"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          ))}
          {puestos.map(p=>(
            <clipPath key={`ppclip-${p.id}`} id={`ppclip-${p.id}`}>
              <rect x={p.cx-p.w/2} y={p.cy-p.h/2} width={p.w} height={p.h} rx={p.w*0.05}/>
            </clipPath>
          ))}
          <pattern id="ppDotGrid" x={gsx} y={gsy} width={gsz} height={gsz} patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.5" fill="rgba(255,255,255,0.08)"/>
            <circle cx={gsz/2} cy={gsz/2} r="1" fill="rgba(255,255,255,0.03)"/>
          </pattern>
        </defs>

        <rect width="100%" height="100%" fill="url(#ppDotGrid)" pointerEvents="none"/>

        <g transform={`translate(${vp.x},${vp.y}) scale(${vp.scale})`}>

          {/* ── DIM overlay cuando hay foco ── */}
          {activeFocusId&&focusedP&&(
            <rect x={-9999} y={-9999} width={29999} height={29999}
              fill="rgba(0,0,0,0.68)"
              style={{pointerEvents:"all",cursor:"default",animation:"ppDimIn 0.35s ease both"}}
              onClick={()=>setFocusedPuesto(null)}/>
          )}

          {/* ── BARCOS ── */}
          <g style={{opacity:(activeFocusId&&focusedP)?0.10:1,transition:"opacity 0.4s ease",pointerEvents:(activeFocusId&&focusedP)?"none":"auto"}}>
            {(activeFocusId?puestos.filter(p=>p.id!==activeFocusId):puestos).map(p=>renderBoat(p))}
          </g>
          {activeFocusId&&focusedP&&(<>
            <rect x={-9999} y={-9999} width={29999} height={29999} fill="rgba(0,0,0,0.68)" style={{pointerEvents:"all",cursor:"default",animation:"ppDimIn 0.35s ease both"}} onClick={()=>setFocusedPuesto(null)}/>
            <g style={{pointerEvents:"auto"}}>{renderBoat(focusedP)}</g>
            <CinematicCallouts p={focusedP} obra={focusedObra} oC={focusedOC}/>
          </>)}

        </g>{/* end transform */}
      </svg>

      {/* MemoriaHUD */}
      {activeFocusId&&focusedP&&MemoriaHUD&&createPortal(
        <MemoriaHUD
          obra={focusedObra??null} puesto={focusedP} oC={focusedOC}
          memoriaOverride={memoriasEdit[focusedObra?.id??focusedP.id]}
          onSaveMemoria={handleSaveMemoria}
          notas={focusedObra?.id?(notasExtra[focusedObra.id]??[]):(notasExtra[focusedP.id]??[])}
          onAddNota={handleAddNota} onDeleteNota={handleDeleteNota}
          onClose={()=>setFocusedPuesto(null)}/>,
        document.body
      )}
      {activeFocusId&&focusedP&&(
        <CinematicCards p={focusedP} obra={focusedObra} oC={focusedOC}
          memoriaOverride={memoriasEdit[focusedObra?.id??focusedP.id]}
          vp={vp} svgRef={svgRef}/>
      )}

      {/* ════ TOP BAR ════ */}
      <div style={{position:"absolute",top:10,left:10,right:10,zIndex:10,display:"flex",alignItems:"center",gap:6,pointerEvents:"none"}}>
        <div style={{display:"flex",gap:5,pointerEvents:"auto"}}>
          {/* Volver */}
          <button onClick={onBack} className="pp-glass-btn"
            style={{display:"flex",alignItems:"center",gap:6,padding:"7px 14px",borderRadius:8,cursor:"pointer",fontSize:11,fontFamily:C.sans,fontWeight:600}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            Mapa Principal
          </button>
          {/* Stats */}
          {[{v:stats.total,l:"Total",c:C.t0},{v:stats.ocupados,l:"Ocupados",c:"#60a5fa"},{v:stats.libres,l:"Libres",c:"#34d399"}].map(({v,l,c})=>(
            <div key={l} style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"4px 16px",borderRadius:8,...GLASS}}>
              <span style={{fontFamily:C.mono,fontSize:18,fontWeight:800,color:c,textShadow:`0 0 12px ${c}40`}}>{v}</span>
              <span style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:C.t2,fontWeight:600}}>{l}</span>
            </div>
          ))}
        </div>

        {/* Título */}
        <div style={{...GLASS,borderRadius:10,padding:"6px 14px",pointerEvents:"none",display:"flex",flexDirection:"column"}}>
          <span style={{fontSize:7,letterSpacing:3,textTransform:"uppercase",color:C.t2,fontFamily:C.mono}}>Galpón</span>
          <span style={{fontSize:14,fontWeight:800,color:C.t0,letterSpacing:0.5,lineHeight:1}}>Pampa</span>
        </div>

        <div style={{flex:1}}/>

        <div style={{display:"flex",gap:16,alignItems:"center",pointerEvents:"auto",...GLASS,borderRadius:12,padding:"8px 12px"}}>
          {/* Leyenda */}
          <div style={{display:"flex",gap:12,paddingRight:16,borderRight:`1px solid ${C.b0}`}}>
            {LEGEND.map(({key,color,isWire})=>(
              <div key={key} style={{display:"flex",alignItems:"center",gap:6}}>
                <div style={{width:10,height:10,borderRadius:isWire?2:5,background:isWire?"transparent":color,border:`1.5px solid ${color}`,boxShadow:isWire?"none":`0 0 10px ${color}80`}}/>
                <span style={{fontSize:10,color:C.t1,fontWeight:500,letterSpacing:0.5}}>{C.obra[key].label}</span>
              </div>
            ))}
          </div>
          {/* Controles */}
          <div style={{display:"flex",gap:8}}>
            <button className="pp-glass-btn" onClick={()=>setEditMode(v=>!v)}
              style={{padding:"8px 16px",borderRadius:8,cursor:"pointer",fontSize:11,fontFamily:C.sans,fontWeight:600,display:"flex",alignItems:"center",gap:6,background:editMode?"rgba(251,191,36,0.15)":"",borderColor:editMode?"rgba(251,191,36,0.4)":""}}>
              <span style={{color:editMode?"#fbbf24":""}}>{editMode?"● Editando Layout":"◩ Editar Layout"}</span>
            </button>
            <button className="pp-glass-btn" onClick={()=>setCmdPaletteOpen(true)}
              style={{padding:"8px 14px",borderRadius:8,cursor:"pointer",fontSize:11,fontFamily:C.sans,fontWeight:600,display:"flex",alignItems:"center",gap:8}}>
              <span>⌘</span>
              <span style={{color:C.t2,fontFamily:C.mono,fontSize:10,background:"rgba(255,255,255,0.05)",border:`1px solid ${C.b0}`,padding:"1px 6px",borderRadius:5}}>K</span>
            </button>
            {editMode&&(
              <div style={{display:"flex",gap:4,alignItems:"center",background:"rgba(0,0,0,0.3)",borderRadius:8,padding:"4px",border:"1px solid rgba(16,185,129,0.3)"}}>
                {[{key:"chico",l:"37'"},{key:"mediano",l:"42'"},{key:"utility",l:"43'"},{key:"grande",l:"52'"},{key:"crucero",l:"55'"},{key:"xl",l:"64'"},{key:"k85",l:"85'"}].map(({key,l})=>(
                  <button key={key} onClick={()=>setNewPuestoSize(key)}
                    style={{padding:"4px 10px",borderRadius:6,cursor:"pointer",fontSize:10,fontFamily:C.mono,fontWeight:600,border:"none",background:newPuestoSize===key?"rgba(16,185,129,0.2)":"transparent",color:newPuestoSize===key?"#34d399":C.t2,transition:"all .2s"}}>{l}</button>
                ))}
                <div style={{width:1,height:16,background:C.b1,margin:"0 4px"}}/>
                <button onClick={addPuesto} style={{padding:"4px 12px",borderRadius:6,cursor:"pointer",fontSize:11,fontWeight:700,border:"none",background:"#10b981",color:"#000",boxShadow:"0 4px 12px rgba(16,185,129,0.4)"}}>+ Agregar</button>
                <div style={{width:1,height:16,background:C.b1,margin:"0 4px"}}/>
                <button onClick={resetLayout} style={{padding:"4px 10px",borderRadius:6,cursor:"pointer",fontSize:10,fontWeight:600,border:"1px solid rgba(239,68,68,0.3)",background:"rgba(239,68,68,0.08)",color:"#f87171"}}>↺ Reset</button>
                <div style={{width:1,height:16,background:C.b1,margin:"0 4px"}}/>
                <button onClick={handleSaveLayoutClick}
                  style={{padding:"4px 14px",borderRadius:6,cursor:"pointer",fontSize:11,fontWeight:700,border:`1px solid ${layoutSaved?"rgba(16,185,129,0.5)":"rgba(99,102,241,0.4)"}`,background:layoutSaved?"rgba(16,185,129,0.15)":"rgba(99,102,241,0.15)",color:layoutSaved?"#34d399":"#a5b4fc",transition:"all 0.3s",display:"flex",alignItems:"center",gap:5}}>
                  {layoutSaved?<>✓ Guardado</>:<>💾 Guardar para todos</>}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ZOOM */}
      <div style={{position:"absolute",bottom:24,right:24,zIndex:10,display:"flex",gap:16,alignItems:"flex-end"}}>
        <div style={{display:"flex",flexDirection:"column",gap:6,...GLASS,padding:"6px",borderRadius:12}}>
          {[{i:"+",f:()=>zoomBtn(1.3)},{i:"−",f:()=>zoomBtn(0.77)},{i:"⌂",f:resetVp}].map(({i,f})=>(
            <button key={i} className="pp-glass-btn" onClick={f}
              style={{width:36,height:36,borderRadius:8,fontSize:i==="⌂"?16:22,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",paddingBottom:i==="+"?2:0}}>{i}</button>
          ))}
          <div style={{marginTop:4,textAlign:"center",fontFamily:C.mono,fontSize:10,color:C.t1,fontWeight:600}}>{Math.round(vp.scale*100)}%</div>
        </div>
      </div>

      {/* RADAR */}
      <RadarHUD puestos={puestos} obraByPuesto={obraByPuesto} vp={vp} containerW={containerSize.w} containerH={containerSize.h}/>

      {/* TOOLTIP */}
      {tooltip&&!obraDragPos&&!focusedPuesto&&(()=>{
        const obra=obraByPuesto[tooltip.puesto.id], oC=C.obra[obra?.estado??"vacio"];
        const rect=svgRef.current?.getBoundingClientRect(); if(!rect) return null;
        const tx=Math.min(tooltip.cx-rect.left+24,rect.width-310), ty=Math.max(24,Math.min(tooltip.cy-rect.top-24,rect.height-220));
        return(
          <div style={{position:"absolute",left:tx,top:ty,zIndex:20,...GLASS,borderRadius:12,padding:"16px",minWidth:250,maxWidth:310,pointerEvents:"none",animation:"ppFadeUp 0.15s cubic-bezier(0.16,1,0.3,1)"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{width:10,height:10,borderRadius:5,background:oC.glow,boxShadow:obra?`0 0 12px ${oC.glow}`:"none"}}/>
                <span style={{fontFamily:C.mono,fontSize:15,color:C.t0,fontWeight:700}}>{obra?obra.codigo:`Puesto ${tooltip.puesto.label}`}</span>
              </div>
              <span style={{fontSize:9,letterSpacing:1.5,textTransform:"uppercase",color:oC.glow,fontWeight:600,background:`${oC.glow}15`,padding:"2px 6px",borderRadius:4}}>{oC.label}</span>
            </div>
            {obra?.descripcion&&<div style={{fontSize:12,color:C.t1,marginBottom:8,lineHeight:1.5}}>{obra.descripcion}</div>}
            {obra&&(
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:10,fontFamily:C.mono,color:C.t1}}>
                  <span>Progreso</span><span style={{color:oC.glow,fontWeight:700}}>{obra._pct??0}%</span>
                </div>
                <div style={{width:"100%",height:4,background:"rgba(255,255,255,0.08)",borderRadius:2,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${obra._pct??0}%`,background:oC.glow,boxShadow:`0 0 10px ${oC.glow}`}}/>
                </div>
                <div style={{fontSize:10,color:C.t2,marginTop:4}}>Click-derecho → menú · F → enfocar</div>
              </div>
            )}
            {!obra&&<div style={{fontSize:11,color:C.t2}}>{editMode?"✦ Arrastrá, ↻ rotar, × eliminar":"✦ Click para asignar · F para enfocar"}</div>}
          </div>
        );
      })()}

      {/* DRAG GHOST */}
      {obraDragPos&&dragRef.current?.obra&&(()=>{
        const{obra}=dragRef.current, oC=C.obra[obra.estado]??C.obra.vacio;
        const rect=svgRef.current?.getBoundingClientRect(); if(!rect) return null;
        return(<div style={{position:"absolute",left:obraDragPos.x-rect.left-80,top:obraDragPos.y-rect.top-30,zIndex:50,pointerEvents:"none",...GLASS,borderColor:oC.glow,borderRadius:12,padding:"12px 20px",boxShadow:`0 16px 32px rgba(0,0,0,0.6),0 0 0 1px ${oC.glow} inset,0 0 20px ${oC.glow}40`}}>
          <div style={{fontSize:9,color:oC.glow,letterSpacing:2,textTransform:"uppercase",marginBottom:4,fontWeight:600}}>Reasignando</div>
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
          <div style={{...GLASS,border:"1px solid rgba(239,68,68,0.4)",borderRadius:16,padding:"24px",width:320,animation:"ppFadeUp 0.15s ease",boxShadow:"0 24px 48px rgba(0,0,0,0.9),0 0 0 1px rgba(239,68,68,0.2) inset"}} onClick={e=>e.stopPropagation()}>
            <div style={{width:40,height:40,borderRadius:20,background:"rgba(239,68,68,0.15)",display:"flex",alignItems:"center",justifyContent:"center",color:"#ef4444",fontSize:20,marginBottom:16,border:"1px solid rgba(239,68,68,0.3)"}}>!</div>
            <div style={{fontSize:16,color:C.t0,fontWeight:600,marginBottom:8}}>Eliminar Puesto</div>
            <div style={{fontSize:13,color:C.t1,marginBottom:16,lineHeight:1.5}}>¿Eliminar el puesto <strong style={{color:C.t0}}>{confirmDel}</strong>?</div>
            {obraByPuesto[confirmDel]&&<div style={{fontSize:12,color:"#f59e0b",marginBottom:24,padding:"10px 12px",borderRadius:8,background:"rgba(245,158,11,0.1)",border:"1px solid rgba(245,158,11,0.3)"}}>La obra asignada quedará sin puesto en el plano.</div>}
            <div style={{display:"flex",gap:12}}>
              <button onClick={()=>setConfirmDel(null)} className="pp-glass-btn" style={{flex:1,padding:"10px",borderRadius:8,cursor:"pointer",fontSize:13,fontWeight:600}}>Cancelar</button>
              <button onClick={()=>removePuesto(confirmDel)} style={{flex:1,padding:"10px",borderRadius:8,border:"none",background:"#ef4444",color:"#fff",cursor:"pointer",fontSize:13,fontWeight:600,boxShadow:"0 4px 12px rgba(239,68,68,0.4)"}}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}