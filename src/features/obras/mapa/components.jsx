import { useState, useMemo, useRef, useCallback, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { C } from "@/theme";
import logoKlaseaImg from "@/assets/logos/logo-klasea.png";
import logoKImg from "@/assets/logos/logo-k.png";
import { GLASS, VB_W, VB_H, KPI_W, KPI_W_COLLAPSED, MEMORIAS_DB, ZONAS, WALLS, BOAT_IMGS, LEGEND } from "@/features/obras/mapa/mapData";
import { IC, getLineaTipo, MEMORIA_FIELDS_BY_TIPO } from "@/features/obras/mapa/memoriaFields";

/* ═══════════════════════════════════════════════════════════════
   ADD OBRA MODAL
═══════════════════════════════════════════════════════════════ */
function AddObraModal({puestoId,puestos,obras,assignedObraIds=new Set(),pendingObraIds=[],onAssign,onClose}){
  const [q,setQ]=useState("");
  const [selIdx,setSelIdx]=useState(-1);
  const inputRef=useRef(null);
  const listRef=useRef(null);
  const p=puestos.find(x=>x.id===puestoId);
  /* Triple defensa contra obras ya asignadas:
     1. !o.puesto_mapa           — campo DB (requiere que el SELECT lo incluya)
     2. !assignedObraIds.has(id) — cross-check vs obraByPuesto en vivo (cubre si puesto_mapa falta en el SELECT)
     3. !pendingObraIds.includes — excluye asignaciones optimistas pendientes de Supabase */
  const list=useMemo(()=>obras.filter(o=>
    !o.puesto_mapa &&
    !assignedObraIds.has(o.id) &&
    !pendingObraIds.includes(o.id) &&
    ["activa","pausada","terminada"].includes(o.estado) &&
    [o.codigo,o.descripcion].some(s=>s?.toLowerCase().includes(q.toLowerCase()))
  ),[obras,assignedObraIds,pendingObraIds,q]);
  useEffect(()=>{inputRef.current?.focus();},[]);
  useEffect(()=>{setSelIdx(-1);},[q]);
  const handleKeyDown=(e)=>{
    if(e.key==="ArrowDown"){e.preventDefault();setSelIdx(i=>Math.min(i+1,list.length-1));}
    else if(e.key==="ArrowUp"){e.preventDefault();setSelIdx(i=>Math.max(i-1,0));}
    else if(e.key==="Enter"&&selIdx>=0&&list[selIdx]){onAssign(puestoId,list[selIdx].id);}
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
                <span style={{fontSize:11,letterSpacing:1.1,color:"#a78bfa",textTransform:"uppercase",fontWeight: 700}}>Asignar Obra</span>
              </div>
              <span style={{fontFamily:C.mono,fontSize:14,color:C.t2}}>→ Puesto {p?.label??puestoId}</span>
            </div>
            <button onClick={onClose} style={{background:"transparent",border:"none",color:C.t2,fontSize:16,cursor:"pointer",padding:4,borderRadius:6,lineHeight:1}} onMouseEnter={e=>e.currentTarget.style.color=C.t0} onMouseLeave={e=>e.currentTarget.style.color=C.t2}>✕</button>
          </div>
          <input ref={inputRef} value={q} onChange={e=>setQ(e.target.value)} onKeyDown={handleKeyDown} placeholder="Buscar obra... (↑↓ navegar, Enter asignar)" style={{width:"100%",boxSizing:"border-box",padding:"12px 14px",borderRadius:8,background:"rgba(0,0,0,0.3)",border:`1px solid rgba(255,255,255,0.08)`,color:C.t0,fontSize:14,fontFamily:C.sans,outline:"none"}} onFocus={e=>e.currentTarget.style.border="1px solid rgba(167,139,250,0.5)"} onBlur={e=>e.currentTarget.style.border="1px solid rgba(255,255,255,0.08)"}/>
        </div>
        <div ref={listRef} style={{flex:1,overflowY:"auto",padding:"8px",display:"flex",flexDirection:"column",gap:4}}>
          {!list.length&&<div style={{textAlign:"center",padding:"32px 8px",fontSize:14,color:C.t2}}>{q?"No se encontraron obras":"No hay obras pendientes de asignar"}</div>}
          {list.map((obra,i)=>{
            const oC=C.obra[obra.estado]??C.obra.vacio;
            const isSel=i===selIdx;
            return(<div key={obra.id} onClick={()=>onAssign(puestoId,obra.id)} style={{padding:"12px 16px",borderRadius:10,cursor:"pointer",display:"flex",flexDirection:"column",gap:6,transition:"all 0.12s",background:isSel?"rgba(167,139,250,0.08)":"transparent",border:`1px solid ${isSel?"rgba(167,139,250,0.3)":"transparent"}`}} onMouseEnter={()=>setSelIdx(i)}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontFamily:C.mono,fontSize:15,color:C.t0,fontWeight:600}}>{obra.codigo}</span>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <div style={{width:6,height:6,borderRadius:3,background:oC.glow,boxShadow:`0 0 8px ${oC.glow}`}}/>
                  <span style={{fontSize:11,letterSpacing:1,textTransform:"uppercase",color:oC.glow,fontWeight: 700}}>{oC.label}</span>
                </div>
              </div>
              {obra.descripcion&&<div style={{fontSize:13,color:C.t1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{obra.descripcion}</div>}
            </div>);
          })}
        </div>
        <div style={{padding:"8px 16px",borderTop:`1px solid ${C.b0}`,fontSize:11,color:C.t2,display:"flex",gap:12,alignItems:"center"}}>
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
      base.push({id:"memoria", icon:"□",label:"Memoria",  color:"#a78bfa"});
      base.push({id:"detail",  icon:"≡",label:"Etapas",   color:"#60a5fa"});
      if(obra.estado==="activa")   base.push({id:"pausar",   icon:"⏸",label:"Pausar",   color:"#fbbf24"});
      if(obra.estado==="pausada")  base.push({id:"reanudar", icon:"▶",label:"Reanudar", color:"#34d399"});
      if(!["terminada","cancelada"].includes(obra.estado)) base.push({id:"terminar",icon:"✓",label:"Terminar",color:"#10b981"});
      base.push({id:"desasignar",icon:"⇌",label:"Desvinc.",color:"#f87171"});
    } else {
      base.push({id:"asignar",icon:"+",label:"Asignar",color:"#a78bfa"});
    }
    if(editMode) base.push({id:"delete",icon:"×",label:"Eliminar",color:"#ef4444"});
    return base;
  },[obra,editMode]);
  const step=360/actions.length;
  const handleAction=(id)=>{
    if(id==="memoria")      { onFocus();   onClose(); }
    else if(id==="detail")  { onDetail();  onClose(); }
    else if(id==="asignar") { onAssign();  onClose(); }
    else if(id==="delete")  { onClose();  onDelete(); }
    else if(id==="desasignar")   { onChangeEstado?.(obra.id,"desasignar"); onClose(); }
    else if(id==="pausar")       { onChangeEstado?.(obra.id,"pausada");    onClose(); }
    else if(id==="reanudar")     { onChangeEstado?.(obra.id,"activa");     onClose(); }
    else if(id==="terminar")     { onChangeEstado?.(obra.id,"terminada");  onClose(); }
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
      {type:"action",id:"reset-view", icon:"⌂",label:"Resetear Vista",       sub:"R",    color:"var(--muted)"},
      {type:"action",id:"toggle-edit",icon:"◩",label:"Activar Modo Edición", sub:"E",    color:"#fbbf24"},
      {type:"action",id:"zoom-in",    icon:"+",label:"Acercar Zoom",          sub:"+ / =",color:"var(--muted)"},
      {type:"action",id:"zoom-out",   icon:"−",label:"Alejar Zoom",           sub:"−",    color:"var(--muted)"},
    ].filter(a=>!q||a.label.toLowerCase().includes(ql));
    if(quickActions.length) result.push({group:"Acciones",items:quickActions});
    const freePuestos=puestosLibres.filter(p=>!q||`puesto ${p.label}`.includes(ql)||p.label.includes(q)).slice(0,6).map(p=>({type:"puesto-libre",id:p.id,icon:"◻",label:`Puesto ${p.label}`,sub:"Disponible",color:"#6366f1",p}));
    if(freePuestos.length) result.push({group:"Puestos Disponibles",items:freePuestos});
    const unassigned=obras.filter(o=>!o.puesto_mapa&&[o.codigo,o.descripcion].some(s=>s?.toLowerCase().includes(ql))).slice(0,8).map(o=>({type:"obra-libre",id:o.id,icon:"●",label:o.codigo,sub:o.descripcion??"Sin descripción",color:C.obra[o.estado]?.glow??"var(--muted)",obra:o}));
    if(unassigned.length) result.push({group:"Obras Sin Asignar",items:unassigned});
    const assigned=obras.filter(o=>o.puesto_mapa&&[o.codigo,o.descripcion].some(s=>s?.toLowerCase().includes(ql))).slice(0,6).map(o=>{const p=puestos.find(px=>px.id===o.puesto_mapa);return{type:"obra-asignada",id:o.id,icon:"◉",label:o.codigo,sub:`Puesto ${p?.label??"?"}`,color:C.obra[o.estado]?.glow??"var(--muted)",obra:o,p};});
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
          <span style={{fontSize:10,color:C.t2,letterSpacing:1.1,fontFamily:C.mono,background:"rgba(255,255,255,0.05)",padding:"3px 7px",borderRadius:5,border:`1px solid ${C.b0}`}}>ESC</span>
        </div>
        <div ref={listRef} style={{flex:1,overflowY:"auto",padding:"8px"}}>
          {groups.length===0&&<div style={{padding:"32px 16px",textAlign:"center",color:C.t2,fontSize:14}}>Sin resultados para "{q}"</div>}
          {groups.map(({group,items})=>(
            <div key={group} style={{marginBottom:4}}>
              <div style={{padding:"6px 12px 4px",fontSize:10,letterSpacing:1.3,textTransform:"uppercase",color:C.t2,fontWeight: 700}}>{group}</div>
              {items.map((item)=>{
                const idx=flatIdx++;
                const isSel=idx===selIdx;
                return(<div key={item.id} data-idx={idx} onClick={()=>{onAction(item);onClose();}} onMouseEnter={()=>setSelIdx(idx)} style={{display:"flex",alignItems:"center",gap:12,padding:"9px 12px",borderRadius:9,cursor:"pointer",background:isSel?"rgba(255,255,255,0.06)":"transparent",border:`1px solid ${isSel?C.b1:"transparent"}`,marginBottom:2,transition:"background 0.08s"}}>
                  <span style={{width:22,height:22,borderRadius:6,background:`${item.color}18`,border:`1px solid ${item.color}30`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:item.color,flexShrink:0}}>{item.icon}</span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:14,color:C.t0,fontWeight:500,fontFamily:item.type.startsWith("obra")?C.mono:C.sans}}>{item.label}</div>
                    {item.sub&&<div style={{fontSize:12,color:C.t2,marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.sub}</div>}
                  </div>
                  {item.sub&&item.type==="action"&&<span style={{fontSize:10,color:C.t2,fontFamily:C.mono,background:"rgba(255,255,255,0.04)",padding:"2px 7px",borderRadius:5,border:`1px solid ${C.b0}`,flexShrink:0}}>{item.sub}</span>}
                </div>);
              })}
            </div>
          ))}
        </div>
        <div style={{padding:"8px 16px",borderTop:`1px solid ${C.b0}`,display:"flex",gap:16,fontSize:11,color:C.t2}}>
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
function CinematicCallouts({p, obra, oC}){
  // Solo decoración SVG: brackets en esquinas, sin rects superpuestos
  const PAD = 14, L = 20;
  const x0 = p.cx - p.w/2 - PAD, y0 = p.cy - p.h/2 - PAD;
  const x1 = p.cx + p.w/2 + PAD, y1 = p.cy + p.h/2 + PAD;
  const corners = [
    {x:x0, y:y0, dx:L,  dy:L },
    {x:x1, y:y0, dx:-L, dy:L },
    {x:x0, y:y1, dx:L,  dy:-L},
    {x:x1, y:y1, dx:-L, dy:-L},
  ];
  return(
    <g transform={`rotate(${p.rot||0},${p.cx},${p.cy})`} style={{pointerEvents:"none"}}>
      {/* Dashed scan border — muy sutil */}
      <rect x={x0} y={y0} width={x1-x0} height={y1-y0}
        rx={(x1-x0)*0.06} fill="none"
        stroke={`${oC.glow}18`} strokeWidth="0.6" strokeDasharray="8 8"
        style={{animation:"focusScan 5s linear infinite"}}/>
      {/* Corner brackets */}
      {corners.map((c,i)=>(
        <g key={i} stroke={oC.glow} strokeWidth="2" strokeLinecap="round"
          style={{
            opacity:0, animation:`focusBracket 0.4s cubic-bezier(0.34,1.4,0.64,1) ${i*60}ms forwards`,
            filter:`drop-shadow(0 0 5px ${oC.glow}90)`,
          }}>
          <line x1={c.x} y1={c.y} x2={c.x+c.dx} y2={c.y}/>
          <line x1={c.x} y1={c.y} x2={c.x}       y2={c.y+c.dy}/>
        </g>
      ))}
      {/* Crosshair central mínimo */}
      <g stroke={`${oC.glow}20`} strokeWidth="0.5" style={{animation:"focusIn 0.6s ease 0.3s both", opacity:0}}>
        <line x1={p.cx-18} y1={p.cy} x2={p.cx+18} y2={p.cy}/>
        <line x1={p.cx} y1={p.cy-18} x2={p.cx} y2={p.cy+18}/>
      </g>
    </g>
  );
}

// HTML overlay cards — sin emojis, iconos SVG, animación direccional
function CinematicCards({p, obra, oC, memoriaOverride, vp, svgRef}){
  const db  = MEMORIAS_DB[obra?.codigo] ?? {};
  const mem = { ...db, ...(memoriaOverride??{}) };

  const propietario = obra?.propietario  ?? mem.propietario   ?? null;
  const constructor = obra?.constructor  ?? mem.constructor   ?? null;
  const motor       = obra?.motores      ?? mem.motorizacion  ?? null;
  const grupo       = obra?.grupo_electrogeno_det ?? (obra?.grupo_electrogeno ? "Sí" : null) ?? mem.grupo_electrogeno ?? null;
  const mesadas     = obra?.color_mesadas ?? mem.color_mesadas ?? null;
  const adicionales = mem.adicionales ?? null;

  // Iconos SVG — sin emojis
  const ICONS = {
    motor:   <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="2" y="8" width="20" height="10" rx="2"/><path d="M6 8V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/></svg>,
    bolt:    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
    user:    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>,
    hardhat: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M2 17h20v2a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-2z"/><path d="M12 3a9 9 0 0 1 9 9H3a9 9 0 0 1 9-9z"/></svg>,
    palette: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><circle cx="8" cy="10" r="1.5" fill="currentColor"/><circle cx="12" cy="7" r="1.5" fill="currentColor"/><circle cx="16" cy="10" r="1.5" fill="currentColor"/></svg>,
    notes:   <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  };

  const allSlots = [
    { key:"tl", label:"MOTOR",       val: motor,       icon: ICONS.motor,   ox:-1, oy:-1 },
    { key:"tr", label:"GRUPO ELECT.", val: grupo,       icon: ICONS.bolt,    ox: 1, oy:-1 },
    { key:"l",  label:"PROPIETARIO", val: propietario, icon: ICONS.user,    ox:-1, oy: 0 },
    { key:"r",  label:"CONSTRUCTOR", val: constructor, icon: ICONS.hardhat, ox: 1, oy: 0 },
    { key:"bl", label:"MESADAS",     val: mesadas,     icon: ICONS.palette, ox:-1, oy: 1 },
    { key:"br", label:"ADICIONALES", val: adicionales, icon: ICONS.notes,   ox: 1, oy: 1 },
  ].filter(s => s.val);

  if(!vp || !allSlots.length) return null;

  const svgRect = svgRef?.current?.getBoundingClientRect?.() ?? {left:0, top:0};
  const offX = svgRect.left, offY = svgRect.top;
  const sc = vp.scale;
  const scrX = p.cx * sc + vp.x + offX;
  const scrY = p.cy * sc + vp.y + offY;
  const hw = (p.w / 2) * sc, hh = (p.h / 2) * sc;

  const CARD_W = 158, CARD_H = 52, PAD = 42, HUD_W = 445;
  const cW = window.innerWidth, cH = window.innerHeight;

  const positioned = allSlots.map((slot, i) => {
    const { ox, oy } = slot;
    const anchorX = scrX + ox * hw;
    const anchorY = scrY + oy * hh;
    let cardX = anchorX + ox * PAD;
    let cardY = anchorY + oy * PAD - CARD_H / 2;
    if (ox < 0) cardX -= CARD_W;
    if (ox === 0) cardX -= CARD_W / 2;
    cardX = Math.max(8, Math.min(cW - HUD_W - CARD_W - 8, cardX));
    cardY = Math.max(8, Math.min(cH - CARD_H - 8, cardY));
    const tx = ox < 0 ? -12 : ox > 0 ? 12 : 0;
    const ty = oy < 0 ? -8  : oy > 0 ? 8  : 0;
    return { ...slot, anchorX, anchorY, cardX, cardY,
      cardCX: cardX + CARD_W / 2, cardCY: cardY + CARD_H / 2,
      delay: `${i * 0.07}s`, tx, ty };
  });

  return createPortal(
    <>
      <style>{`
        ${positioned.map(s=>`
          @keyframes cs_${s.key} {
            0%   { opacity:0; transform:translate(${s.tx}px,${s.ty}px) scale(0.88); filter:blur(3px); }
            60%  { opacity:1; transform:translate(${-s.tx*.05}px,0) scale(1.02); filter:blur(0); }
            100% { opacity:1; transform:translate(0,0) scale(1); filter:blur(0); }
          }
        `).join("")}
        @keyframes lineGrow { from{stroke-dashoffset:120;opacity:0} to{stroke-dashoffset:0;opacity:1} }
        @keyframes dotIn    { from{opacity:0;r:0} to{opacity:1;r:2.5} }
      `}</style>
      <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:900}}>
        <svg style={{position:"absolute",inset:0,width:"100%",height:"100%",overflow:"visible",pointerEvents:"none"}}>
          {positioned.map(s=>{
            const len = Math.hypot(s.cardCX-s.anchorX, s.cardCY-s.anchorY);
            return(
              <g key={`ln-${s.key}`}>
                <line x1={s.anchorX} y1={s.anchorY} x2={s.cardCX} y2={s.cardCY}
                  stroke={`${oC.glow}35`} strokeWidth="0.8"
                  strokeDasharray={len} strokeDashoffset={len}
                  style={{animation:`lineGrow 0.5s ease ${s.delay} forwards`}}/>
                <circle cx={s.anchorX} cy={s.anchorY} r="0" fill={oC.glow}
                  style={{animation:`dotIn 0.3s ease ${parseFloat(s.delay)+0.2}s forwards`}}/>
              </g>
            );
          })}
        </svg>
        {positioned.map(s => {
          const val = (s.val ?? "").length > 24 ? s.val.slice(0,22)+"…" : s.val;
          return (
            <div key={s.key} style={{
              position:"absolute", left:s.cardX, top:s.cardY,
              width:CARD_W, height:CARD_H,
              background:"rgba(6,8,24,0.96)",
              border:`1px solid ${oC.glow}25`,
              borderRadius:8,
              boxShadow:`0 4px 24px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.04)`,
              display:"flex", alignItems:"center", gap:9, padding:"0 12px",
              animation:`cs_${s.key} 0.5s cubic-bezier(0.22,1,0.36,1) ${s.delay} both`,
              fontFamily:"'Outfit',system-ui,sans-serif",
              backdropFilter:"blur(14px)", userSelect:"none",
            }}>
              <div style={{
                flexShrink:0, width:26, height:26, borderRadius:7,
                background:`${oC.glow}10`, border:`1px solid ${oC.glow}20`,
                display:"flex", alignItems:"center", justifyContent:"center",
                color:`${oC.glow}cc`,
              }}>{s.icon}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{
                  fontSize:6.5, letterSpacing:"1.3px", fontWeight:700,
                  fontFamily:"'JetBrains Mono',monospace",
                  color:`${oC.glow}65`, textTransform:"uppercase",
                  marginBottom:3, lineHeight:1,
                }}>{s.label}</div>
                <div style={{
                  fontSize:13, fontWeight:600,
                  color:"rgba(255,255,255,0.92)", lineHeight:1.2,
                  whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis",
                }}>{val}</div>
              </div>
            </div>
          );
        })}
      </div>
    </>,
    document.body
  );
}

/* ═══════════════════════════════════════════════════════════════
   MEMORIA DESCRIPTIVA HUD — Panel principal del Modo Foco
   Editable campo por campo. Se guarda en localStorage y/o
   callback externo para sincronización entre usuarios.
═══════════════════════════════════════════════════════════════ */

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
      <div style={{ display:"flex", alignItems:"center", gap:5, color:isEditing?"rgba(255,255,255,0.75)":"rgba(255,255,255,0.45)" }}>
        <span style={{ display:"flex", alignItems:"center", flexShrink:0 }}>{field.icon}</span>
        <span style={{ fontSize:10, letterSpacing:1.4, textTransform:"uppercase", fontFamily:"'JetBrains Mono',monospace", fontWeight:700, lineHeight:1 }}>
          {field.label}
        </span>
        {!isEditing && !empty && (
          <span style={{ marginLeft:"auto", color:"rgba(255,255,255,0.3)", display:"flex", alignItems:"center" }}>{IC.pencil}</span>
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
            color:"var(--text)", fontSize:14, fontFamily:"'Outfit',system-ui,sans-serif",
            resize:"none", lineHeight:1.5, padding:0,
          }}
        />
      ) : (
        <div style={{
          fontSize:14, lineHeight:1.5,
          color: empty ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.95)",
          fontStyle: empty ? "italic" : "normal",
          fontWeight: empty ? 400 : 500,
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

  // ── Derivar plantilla de campos según línea de producción ──────────────────
  const lineaTipo  = getLineaTipo(obra, puesto);
  const memoFields = MEMORIA_FIELDS_BY_TIPO[lineaTipo] ?? MEMORIA_FIELDS_BY_TIPO.default;

  const base = {
    propietario:        obra?.propietario  ?? db.propietario        ?? "",
    constructor:        obra?.constructor  ?? db.constructor        ?? "",
    nombre_barco:       db.nombre_barco    ?? "",
    motorizacion:       obra?.motores      ?? db.motorizacion       ?? "",
    grupo_electrogeno:  obra?.grupo_electrogeno_det ?? (obra?.grupo_electrogeno?"Sí":null) ?? db.grupo_electrogeno ?? "",
    cabina:             obra?.tipo_cabina  ?? db.cabina             ?? "",
    color_casco:        obra?.color_casco  ?? db.color_casco        ?? "",
    madera_muebles:     obra?.madera_muebles ?? db.madera_muebles   ?? "",
    piso:               obra?.piso         ?? db.piso               ?? "",
    alfombra:           db.alfombra        ?? "",
    color_cerramientos: db.color_cerramientos ?? "",
    color_mesadas:      obra?.color_mesadas?? db.color_mesadas      ?? "",
    tapiceria_mamparos: db.tapiceria_mamparos ?? "",
    tapiceria_dinette:  db.tapiceria_dinette  ?? "",
    tapiceria_respaldos:db.tapiceria_respaldos?? "",
    tapiceria_exterior: db.tapiceria_exterior ?? "",
    color_acolchados:   db.color_acolchados   ?? "",
    loneria_toldo_proa: db.loneria_toldo_proa ?? "",
    loneria_cobertor:   db.loneria_cobertor   ?? "",
    loneria_otros:      db.loneria_otros      ?? "",
    electronica:        obra?.electronica  ?? db.electronica        ?? "",
    audio:              db.audio           ?? "",
    fabricadora_hielo:  db.fabricadora_hielo  ?? "",
    radar:              db.radar              ?? "",
    pluma:              db.pluma              ?? "",
    adicionales:        db.adicionales        ?? "",
    starlink:           obra?.starlink     ?? db.starlink     ?? false,
    teca_tipo:          obra?.teca_tipo    ?? db.teca_tipo    ?? null,
    sternthruster:      obra?.sternthruster?? db.sternthruster?? false,
    mesa_fly:           db.mesa_fly           ?? false,
    aire_acondicionado: db.aire_acondicionado ?? false,
    calefactor:         db.calefactor         ?? false,
    bow_thruster:       db.bow_thruster       ?? false,
    plotter:            db.plotter            ?? false,
    faro:               db.faro               ?? false,
    flaps:              db.flaps              ?? false,
    tv_camarote:        db.tv_camarote        ?? "",
    tv_cockpit:         db.tv_cockpit         ?? "",
  };

  const [fields,    setFields]    = useState({ ...base, ...(memoriaOverride??{}) });
  // Sync fields cuando los datos de Supabase lleguen después del primer render
  const prevOverrideRef = useRef(null);
  useEffect(()=>{
    if(!memoriaOverride) return;
    const key = JSON.stringify(memoriaOverride);
    if(key === prevOverrideRef.current) return;
    prevOverrideRef.current = key;
    setFields(f=>({ ...f, ...memoriaOverride }));
  },[memoriaOverride]);
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
    const logoHdr = logoKlaseaImg;
    const logoFtr = logoKImg;
    const ac      = oC.glow;
    const pct     = obra?._pct ?? 0;
    const fecha   = new Date().toLocaleDateString("es-AR",{day:"2-digit",month:"long",year:"numeric"});
    const cod     = obra?.codigo ?? ("Puesto " + (puesto?.label ?? "—"));
    const estadoLbl = (obra?.estado ?? "vacío").toUpperCase();

    // ── Iconos SVG como strings (14×14, stroke solo, para usar inline en HTML) ──
    const SVG = {
      user:    `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>`,
      hardhat: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 17h20v2a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-2z"/><path d="M12 3a9 9 0 0 1 9 9H3a9 9 0 0 1 9-9z"/><line x1="12" y1="3" x2="12" y2="12"/></svg>`,
      engine:  `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="8" width="20" height="10" rx="2"/><path d="M6 8V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/></svg>`,
      bolt:    `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
      ship:    `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 17l1.5-9L12 3l7.5 5L21 17"/><path d="M3 17c0 2 4 3 9 3s9-1 9-3"/><line x1="12" y1="3" x2="12" y2="17"/></svg>`,
      brush:   `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18.37 2.63L14 7l-1.59-1.59a2 2 0 0 0-2.82 0L8 7l9 9 1.59-1.59a2 2 0 0 0 0-2.82L17 10l4.37-4.37a2.12 2.12 0 0 0-3-3z"/><path d="M9 8c-2 3-4 3.5-7 4l8 10c2-1 6-5 6-7"/></svg>`,
      wood:    `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="6" width="18" height="12" rx="1"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="3" y1="14" x2="21" y2="14"/><line x1="9" y1="6" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="18"/></svg>`,
      floor:   `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/></svg>`,
      palette: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><circle cx="8" cy="10" r="1.5" fill="currentColor"/><circle cx="12" cy="7" r="1.5" fill="currentColor"/><circle cx="16" cy="10" r="1.5" fill="currentColor"/></svg>`,
      sofa:    `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 9V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v2"/><path d="M2 11v5a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5"/><path d="M4 11a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2H4v-2z"/></svg>`,
      door:    `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 20V6a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v14"/><line x1="2" y1="20" x2="22" y2="20"/><circle cx="15" cy="13" r="1" fill="currentColor"/></svg>`,
      notes:   `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
      signal:  `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><circle cx="12" cy="20" r="1" fill="currentColor"/></svg>`,
      anchor:  `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="5" r="3"/><line x1="12" y1="8" x2="12" y2="22"/><path d="M5 12H2a10 10 0 0 0 20 0h-3"/></svg>`,
      snow:    `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="2" x2="12" y2="22"/><path d="M17 7l-5-5-5 5"/><path d="M17 17l-5 5-5-5"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M7 7l-5 5 5 5"/><path d="M17 7l5 5-5 5"/></svg>`,
      radar:   `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/><line x1="12" y1="2" x2="12" y2="6"/></svg>`,
      plank:   `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="10" width="20" height="4" rx="1"/><line x1="6" y1="10" x2="6" y2="14"/><line x1="12" y1="10" x2="12" y2="14"/><line x1="18" y1="10" x2="18" y2="14"/></svg>`,
      crane:   `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="22" x2="12" y2="2"/><path d="M12 2l8 6H4l8-6z"/><line x1="12" y1="8" x2="20" y2="8"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="17" y1="14" x2="20" y2="14"/></svg>`,
      check:   `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>`,
    };

    // Mapa field.key → icono
    const FIELD_ICONS = {
      propietario: SVG.user,    constructor: SVG.hardhat,
      motorizacion: SVG.engine, grupo_electrogeno: SVG.bolt,
      cabina: SVG.ship,         color_casco: SVG.brush,
      madera_muebles: SVG.wood, piso: SVG.floor,
      alfombra: SVG.floor,      color_mesadas: SVG.palette,
      tapiceria_mamparos: SVG.sofa, tapiceria_dinette: SVG.sofa,
      tapiceria_respaldos: SVG.sofa, tapiceria_exterior: SVG.sofa,
      color_acolchados: SVG.sofa,
      loneria_toldo_proa: SVG.ship, loneria_cobertor: SVG.ship,
      color_cerramientos: SVG.door, loneria_otros: SVG.notes,
      electronica: SVG.signal,
      fabricadora_hielo: SVG.snow, radar: SVG.radar,
      pluma: SVG.crane, planchada: SVG.plank,
      adicionales: SVG.notes,
      sternthruster: SVG.anchor,
    };

    // Mapa section → color de acento para la franja
    const SEC_COLORS = {
      "Identificación": "#2563eb",
      "Estructura":     "#0891b2",
      "Interiores":     "#059669",
      "Tapicería":      "#7c3aed",
      "Lonería":        "#b45309",
      "Electrónica":    "#db2777",
      "Equipamiento":   ac,
      "Adicionales":    ac,
    };

    // ── Equipamiento: grid de checkboxes estilo memoria real ─────────────
    const equipItems = [];
    const activeToggles = memoFields.filter(f => f.type==="toggle" && fields[f.key]);
    const tecaVal = fields.teca_tipo;
    if (tecaVal) equipItems.push({ label: tecaVal==="infinity" ? "Infinity" : "Teca", val: "", isCheck: true });
    activeToggles.forEach(f => {
      const obs = fields[f.key+"_obs"];
      equipItems.push({ label: f.label, val: obs||"", isCheck: true });
    });

    // ── Adicionales: texto libre en un solo bloque ────────────────────────
    const adicionalesText = [
      fields.adicionales,
      fields.tv_camarote ? "TV Camarote: " + fields.tv_camarote : null,
      fields.tv_cockpit  ? "TV Cockpit: "  + fields.tv_cockpit  : null,
    ].filter(Boolean).join("\n");

    // ── Equipamiento HTML ─────────────────────────────────────────────────
    const buildEquipHtml = () => {
      if (!equipItems.length) return "";
      let rows = "";
      for (let i = 0; i < equipItems.length; i += 2) {
        const a = equipItems[i], b = equipItems[i+1];
        const cellA = `<td class="eq-lbl">${a.isCheck ? "<span class='eq-chk'>✓</span>" : ""}${a.label}</td>`
                    + `<td class="eq-val">${a.val}</td>`;
        const cellB = b
          ? `<td class="eq-lbl">${b.isCheck ? "<span class='eq-chk'>✓</span>" : ""}${b.label}</td>`
          + `<td class="eq-val">${b.val}</td>`
          : `<td class="eq-lbl" style="background:#fff;border-color:transparent;"></td><td class="eq-val" style="border-color:transparent;"></td>`;
        rows += "<tr>" + cellA + cellB + "</tr>";
      }
      return "<tr class=\"sec-hd\"><td colspan=\"4\">EQUIPAMIENTO</td></tr>"
           + `<tr><td colspan="4" style="padding:0;border:none;"><table class="eq-table"><tbody>${rows}</tbody></table></td></tr>`;
    };

    // ── Filas de campos de texto ──────────────────────────────────────────
    const buildDataRows = (blank) => {
      const SKIP_TYPES = new Set(["toggle","selector"]);
      const SKIP_KEYS  = new Set(["adicionales","tv_camarote","tv_cockpit","grupo_electrogeno"]);
      const secs = [...new Set(memoFields.map(f => f.section))];
      return secs.map(sec => {
        const secFields = memoFields.filter(f =>
          f.section === sec && !SKIP_TYPES.has(f.type) && !SKIP_KEYS.has(f.key)
        );
        // Equipamiento: manejada por buildEquipHtml
        if (sec === "Equipamiento") return buildEquipHtml();
        const rows = secFields.map(f => {
          const v = fields[f.key];
          const ico = FIELD_ICONS[f.key] || "";
          const icoCell = ico ? `<span class="ico">${ico}</span>` : "";
          if (blank) {
            return `<tr><td class="lbl">${icoCell}${f.label}</td><td class="val"><span class="blank-val"></span></td></tr>`;
          }
          if (!v && v !== 0) return "";
          const displayV = String(v).replace(/\n/g,"<br/>");
          const obs = fields[f.key+"_obs"];
          return `<tr><td class="lbl">${icoCell}${f.label}</td><td class="val">${displayV}${obs ? ` <span class="obs-val">· ${obs}</span>` : ""}</td></tr>`;
        }).join("");
        if (!rows.trim()) return "";
        return `<tr class="sec-hd"><td colspan="2"><span class="sec-lbl">${sec.toUpperCase()}</span></td></tr>` + rows;
      }).join("");
    };

    // ── Notas ─────────────────────────────────────────────────────────────
    const notasHtml = notas.length
      ? notas.map(n => `<tr><td class="lbl nd">${n.fecha}</td><td class="val">${n.texto}</td></tr>`).join("")
      : "";

    // ── Adicionales HTML — lista con bullets, separados por coma o punto y coma
    const adicionalesHtml = (() => {
      if (!adicionalesText) return "";
      // Dividir por coma o punto y coma para listar cada ítem
      const items = adicionalesText
        .split(/[,;\n]+/)
        .map(s => s.trim())
        .filter(Boolean);
      if (!items.length) return "";
      const listHtml = items.length === 1
        ? `<tr><td colspan="2" class="val adic">${items[0]}</td></tr>`
        : `<tr><td colspan="2" class="val adic-list"><ul>${items.map(i=>`<li>${i}</li>`).join("")}</ul></td></tr>`;
      return `<tr class="sec-hd"><td colspan="2"><span class="sec-lbl">ADICIONALES</span></td></tr>` + listHtml;
    })();

    // ── Cabecera: propietario, constructor, nombre barco ─────────────────
    const propietario = fields.propietario || obra?.propietario || "";
    const constructor = fields.constructor  || obra?.constructor  || "";
    const nombreBarco = fields.nombre_barco || "";

    const css = [
      "@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@500;600;700&display=swap');",
      "*{box-sizing:border-box;margin:0;padding:0;}",
      "html,body{background:#e8eaed;font-family:'Inter',sans-serif;font-size:12px;-webkit-print-color-adjust:exact;print-color-adjust:exact;}",
      "@page{size:A4;margin:12mm 12mm;}",
      ".page{width:100%;background:#fff;display:flex;flex-direction:column;}",

      // Header
      ".hdr{background:#0d1117;padding:0;}",
      ".hdr-inner{display:flex;align-items:stretch;border-bottom:3px solid " + ac + ";}",
      ".hdr-num{text-align:center;padding:10px 24px;min-width:130px;border-right:1px solid rgba(255,255,255,.1);display:flex;flex-direction:column;justify-content:center;}",
      ".hdr-lbl{font-size:6px;letter-spacing:3px;text-transform:uppercase;color:rgba(255,255,255,.3);font-family:'JetBrains Mono',monospace;margin-bottom:4px;}",
      ".hdr-cod{font-size:28px;font-weight:900;font-family:'JetBrains Mono',monospace;color:#fff;letter-spacing:-1px;line-height:1;}",
      ".hdr-meta{flex:1;padding:10px 18px;display:flex;flex-direction:column;gap:5px;justify-content:center;}",
      ".hdr-prop{font-size:15px;font-weight:700;color:#fff;letter-spacing:-0.2px;}",
      ".hdr-sub{display:flex;align-items:center;gap:10px;font-size:10px;color:rgba(255,255,255,.45);}",
      ".hdr-sub b{color:rgba(255,255,255,.75);font-weight:600;}",
      ".hdr-sep-v{width:1px;height:12px;background:rgba(255,255,255,.15);}",
      ".hdr-logo{height:26px;mix-blend-mode:screen;align-self:center;margin:10px 16px 10px auto;}",

      // Tabla principal
      ".wrap{flex:1;}",
      "table.main{width:100%;border-collapse:collapse;}",
      "table.main td{vertical-align:middle;}",
      "td.lbl{width:38%;font-size:10px;color:#555;padding:5px 10px;line-height:1.3;font-weight:700;background:#f5f6f8;border:1px solid #e0e3e8;text-transform:uppercase;letter-spacing:0.3px;}",
      "td.val{font-size:11px;color:#111;padding:5px 10px;line-height:1.5;background:#fff;border:1px solid #e0e3e8;white-space:pre-wrap;}",
      "td.val.adic{font-size:11px;color:#222;padding:10px;line-height:1.6;}",
      ".obs-val{color:#888;font-style:italic;}",
      ".blank-val{border-bottom:1px solid #bbb;min-height:14px;display:block;}",

      // Section headers
      "tr.sec-hd td{background:#1a1f2e;color:rgba(255,255,255,.88);font-size:7px;letter-spacing:3px;text-transform:uppercase;font-family:'JetBrains Mono',monospace;font-weight:700;padding:5px 10px;border:none;}",
      ".sec-lbl{display:inline-block;padding-left:2px;}",
      ".ico{display:inline-block;vertical-align:middle;margin-right:5px;opacity:0.6;width:14px;height:14px;}",
      ".ico svg{vertical-align:top;}",
      "td.val.adic{font-size:11px;color:#222;padding:10px 12px;line-height:1.7;}",
      "td.val.adic-list{padding:6px 12px;}",
      "td.val.adic-list ul{margin:0;padding-left:16px;list-style:disc;}",
      "td.val.adic-list ul li{font-size:11px;color:#222;line-height:1.7;padding:1px 0;}",

      // Equipamiento grid
      "table.eq-table{width:100%;border-collapse:collapse;}",
      "td.eq-lbl{width:38%;font-size:10px;color:#555;padding:5px 10px;background:#f5f6f8;border:1px solid #e0e3e8;font-weight:700;text-transform:uppercase;letter-spacing:0.3px;}",
      "td.eq-val{width:12%;font-size:11px;color:#111;padding:5px 10px;background:#fff;border:1px solid #e0e3e8;font-weight:700;}",
      ".eq-chk{display:inline-block;width:12px;height:12px;background:" + ac + ";border-radius:2px;margin-right:6px;vertical-align:middle;text-align:center;line-height:12px;font-size:10px;color:#fff;font-weight:900;}",

      // Notas
      "td.nd{font-size:10px;font-family:'JetBrains Mono',monospace;color:#999;white-space:nowrap;width:80px;}",

      // Footer
      ".ftr{border-top:1px solid #e0e3e8;padding:7px 12px;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;}",
      ".ftr-l{display:flex;align-items:center;gap:8px;}",
      ".ftr-logo{height:16px;filter:invert(0.6);opacity:.5;}",
      ".ftr-sep{width:1px;height:10px;background:#ccc;}",
      ".ftr-txt{font-size:7px;color:#aaa;font-family:'JetBrains Mono',monospace;text-transform:uppercase;letter-spacing:.5px;}",
      ".ftr-cod{font-size:7px;color:#aaa;font-family:'JetBrains Mono',monospace;}",

      "@media screen{.page{width:210mm;min-height:297mm;box-shadow:0 8px 40px rgba(0,0,0,.18);margin:20px auto;}}",
      "@media print{html,body{background:#fff;}.noprint{display:none!important;}.page{width:100%;box-shadow:none;margin:0;}}",
    ].join("");

    const subMeta = [
      constructor ? "<b>" + constructor + "</b> (Constructor)" : null,
      nombreBarco ? "&#187; <b>" + nombreBarco + "</b>" : null,
    ].filter(Boolean).join("<span class='hdr-sep-v'></span>");

    const html =
      "<!DOCTYPE html><html lang='es'><head><meta charset='UTF-8'/>"
      + "<title>" + cod + "</title>"
      + "<style>" + css + "</style></head><body>"
      + "<div class='page'>"

        // ── HEADER ──
        + "<div class='hdr'>"
          + "<div class='hdr-inner'>"
            + "<div class='hdr-num'>"
              + "<div class='hdr-lbl'>N&#186; de barco</div>"
              + "<div class='hdr-cod'>" + cod + "</div>"
            + "</div>"
            + "<div class='hdr-meta'>"
              + (propietario ? "<div class='hdr-prop'>" + propietario + "</div>" : "")
              + (subMeta ? "<div class='hdr-sub'>" + subMeta + "</div>" : "")
            + "</div>"
            + "<img class='hdr-logo' src='" + logoHdr + "' alt='Klase A'/>"
          + "</div>"
        + "</div>"

        // ── TABLA ──
        + "<div class='wrap'><table class='main' id='main-table'>"
          + buildDataRows(false)
          + adicionalesHtml
          + (notasHtml ? "<tr class='sec-hd'><td colspan='2'>NOTAS</td></tr>" + notasHtml : "")
        + "</table></div>"

        // ── FOOTER ──
        + "<div class='ftr'>"
          + "<div class='ftr-l'>"
            + "<img class='ftr-logo' src='" + logoFtr + "' alt='K'/>"
            + "<div class='ftr-sep'></div>"
            + "<div class='ftr-txt'>Klase A Astillero</div>"
          + "</div>"
          + "<div class='ftr-cod'>" + cod + (propietario ? " · " + propietario : "") + "</div>"
        + "</div>"

      + "</div>"
      + "<div class='noprint' style='position:fixed;bottom:16px;left:50%;transform:translateX(-50%);display:flex;gap:8px;z-index:999;filter:drop-shadow(0 2px 12px rgba(0,0,0,.28));'>"
        + "<button onclick='window.print()' style='padding:10px 28px;background:#111;color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;font-family:Inter,sans-serif;'>Descargar PDF</button>"
        + "<button onclick='window.close()' style='padding:10px 14px;background:#fff;color:#777;border:1px solid #ccc;border-radius:6px;font-size:13px;cursor:pointer;font-family:Inter,sans-serif;'>Cerrar</button>"
      + "</div>"
      + "</body></html>";

    const win = window.open("","_blank","width=900,height=960");
    if(!win){ alert("Habilit\u00e1 las ventanas emergentes para imprimir."); return; }
    win.document.write(html);
    win.document.close();
  };
  // Badges: todos los fields de tipo toggle en este perfil de línea (sin duplicados por key)
  const badgeFields = useMemo(()=>{
    const seen=new Set();
    return memoFields.filter(f=>{
      if(f.type!=="toggle") return false;
      if(seen.has(f.key)) return false;
      seen.add(f.key); return true;
    });
  },[memoFields]);

  // Selector teca (type:"selector") si está en este perfil
  const tecaField = memoFields.find(f=>f.key==="teca_tipo"&&f.type==="selector");

  // Estado gear: key del badge con detalle abierto
  const [gearOpen, setGearOpen] = useState(null);

  // Agrupar por sección para el render (excluir toggles y selector — van en el header)
  const sections = [...new Set(memoFields.map(f=>f.section))];

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
        .mem-input{background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:#fff;font-size:13px;padding:8px 12px;outline:none;font-family:'Outfit',sans-serif;width:100%;box-sizing:border-box;transition:border-color 0.15s;}
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
              <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:20,color:"var(--text)",fontWeight:800,letterSpacing:0.5}}>
                {obra?.codigo??`Puesto ${puesto?.label}`}
              </span>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:10,letterSpacing:1.3,textTransform:"uppercase",color:oC.glow,fontWeight:700,
                background:`${oC.glow}12`,padding:"2px 8px",borderRadius:4,border:`1px solid ${oC.glow}25`}}>
                {obra?.estado?.toUpperCase()??"VACÍO"}
              </span>
              <span style={{fontSize:10,color:"rgba(255,255,255,0.2)",fontFamily:"'JetBrains Mono',monospace",letterSpacing:1}}>
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
            <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,color:oC.glow,fontWeight:700,minWidth:28}}>{obra._pct??0}%</span>
          </div>
        )}

        {/* ── Equipment pills — derivados dinámicamente del perfil de línea ── */}
        <div style={{display:"flex",gap:5,flexWrap:"wrap",alignItems:"flex-start"}}>

          {/* Toggles: un pill por campo type:"toggle" en este perfil */}
          {badgeFields.map(b=>{
            const on  = fields[b.key]===true;
            const col = b.color??"#94a3b8";
            const obsKey = b.key+"_obs";
            const gearOn = gearOpen===b.key;
            return(
              <div key={b.key} style={{display:"flex",flexDirection:"column",gap:3}}>
                <div style={{display:"flex",alignItems:"center",gap:2}}>
                  {/* Pill principal */}
                  <button onClick={()=>toggleBadge(b.key)}
                    style={{display:"flex",alignItems:"center",gap:5,padding:"4px 9px",borderRadius:6,cursor:"pointer",
                      border:`1px solid ${on?col+"45":"rgba(255,255,255,0.07)"}`,
                      background:on?`${col}12`:"rgba(255,255,255,0.02)",
                      color:on?col:"rgba(255,255,255,0.22)",
                      transition:"all 0.15s",fontSize:11,fontFamily:"'Outfit',sans-serif",height:26}}>
                    <span style={{display:"flex",alignItems:"center"}}>{b.icon}</span>
                    {b.label}
                    {on&&<span style={{display:"flex",alignItems:"center",opacity:0.7}}>{IC.check}</span>}
                  </button>
                  {/* Engranaje — solo visible cuando el toggle está activo */}
                  {on&&(
                    <button onClick={()=>setGearOpen(gearOn?null:b.key)}
                      title="Agregar detalle"
                      style={{width:22,height:26,display:"flex",alignItems:"center",justifyContent:"center",
                        borderRadius:5,cursor:"pointer",border:`1px solid ${gearOn?col+"50":"rgba(255,255,255,0.06)"}`,
                        background:gearOn?`${col}14`:"rgba(255,255,255,0.02)",
                        color:gearOn?col:"rgba(255,255,255,0.28)",transition:"all 0.15s"}}>
                      {IC.gear}
                    </button>
                  )}
                </div>
                {/* Input de detalle — se despliega al hacer click en el engranaje */}
                {on&&gearOn&&(
                  <input className="mem-input"
                    placeholder="Detalle / modelo..."
                    value={fields[obsKey]??""}
                    onChange={e=>{setFields(f=>({...f,[obsKey]:e.target.value}));setDirty(true);}}
                    style={{fontSize:12,padding:"4px 8px",borderRadius:6,height:28}}
                  />
                )}
              </div>
            );
          })}

          {/* Selector teca — aparece solo si el perfil lo incluye */}
          {tecaField&&(
            <div style={{display:"flex",borderRadius:6,overflow:"hidden",border:"1px solid rgba(255,255,255,0.08)",height:26,flexShrink:0}}>
              {tecaField.opts.map(opt=>{
                const active = fields.teca_tipo===opt.val;
                const col = tecaField.color;
                return(
                  <button key={String(opt.val)} onClick={()=>{setFields(f=>({...f,teca_tipo:opt.val}));setDirty(true);}}
                    style={{padding:"0 9px",border:"none",cursor:"pointer",
                      fontSize:11,fontWeight:active?700:400,fontFamily:"'Outfit',sans-serif",
                      background:active&&opt.val?`${col}18`:"rgba(255,255,255,0.02)",
                      color:active&&opt.val?col:active?"rgba(255,255,255,0.18)":"rgba(255,255,255,0.22)",
                      borderRight:"1px solid rgba(255,255,255,0.06)",transition:"all 0.15s"}}>
                    {opt.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── SCROLLABLE BODY ── */}
      <div className="mem-scroll" style={{flex:1,overflowY:"auto",padding:"10px 22px",display:"flex",flexDirection:"column",gap:4,position:"relative",zIndex:1}}>

        <div style={{fontSize:10,color:"rgba(255,255,255,0.16)",letterSpacing:1.1,textAlign:"center",marginBottom:4,textTransform:"uppercase",fontFamily:"'JetBrains Mono',monospace",display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>
          {IC.pencil} <span>Clic en cada campo para editar</span>
        </div>

        {/* Render por secciones — toggles y selectores van en el header, no aquí */}
        {sections.map(sec=>{
          const HEADER_TYPES = new Set(["toggle","selector"]);
          const secFields = memoFields.filter(f=>f.section===sec && !HEADER_TYPES.has(f.type));
          const secGrid   = secFields.filter(f=>!f.wide);
          const secWide   = secFields.filter(f=>f.wide);
          // Si la sección solo tenía toggles/selectores, no renderizar título
          if(secGrid.length===0 && secWide.length===0) return null;
          return(
            <div key={sec}>
              {/* Título de sección */}
              <div style={{display:"flex",alignItems:"center",gap:6,margin:"8px 0 5px"}}>
                <div style={{height:1,flex:1,background:`linear-gradient(90deg,${oC.glow}30,transparent)`}}/>
                <span style={{fontSize:10,letterSpacing:1.3,textTransform:"uppercase",color:`${oC.glow}80`,fontFamily:"'JetBrains Mono',monospace",fontWeight:700,flexShrink:0}}>{sec}</span>
                <div style={{height:1,flex:1,background:`linear-gradient(270deg,${oC.glow}30,transparent)`}}/>
              </div>
              {/* Grid 2 cols */}
              {secGrid.length>0&&(
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5,marginBottom:4}}>
                  {secGrid.map(f=>(
                    <FieldBox key={f.key+"-"+sec} field={f}
                      isEditing={editingKey===f.key} val={fields[f.key]} editVal={editVal}
                      editRef={editingKey===f.key?editRef:null}
                      onStartEdit={startEdit} onChangeVal={onChangeVal} onCommit={commitEdit}/>
                  ))}
                </div>
              )}
              {/* Campos anchos */}
              {secWide.map(f=>(
                <FieldBox key={f.key+"-wide"} field={f}
                  isEditing={editingKey===f.key} val={fields[f.key]} editVal={editVal}
                  editRef={editingKey===f.key?editRef:null}
                  onStartEdit={startEdit} onChangeVal={onChangeVal} onCommit={commitEdit}/>
              ))}
            </div>
          );
        })}

        {/* Divider */}
        <div style={{height:1,background:`linear-gradient(90deg,transparent,${oC.glow}25,transparent)`,margin:"8px 0 4px"}}/>

        {/* Notes section */}
        <div style={{display:"flex",alignItems:"center",gap:5,color:"rgba(255,255,255,0.25)",marginBottom:6}}>
          {IC.msgcircle}
          <span style={{fontSize:10,letterSpacing:1.3,textTransform:"uppercase",fontFamily:"'JetBrains Mono',monospace",fontWeight: 700}}>
            Notas del Equipo
          </span>
          {notas.length>0&&<span style={{marginLeft:"auto",fontSize:10,color:oC.glow,background:`${oC.glow}12`,padding:"1px 7px",borderRadius:10,border:`1px solid ${oC.glow}25`}}>{notas.length}</span>}
        </div>

        {notas.map(n=>(
          <div key={n.id} className="nota-row" style={{display:"flex",gap:8,padding:"9px 11px",borderRadius:8,
            background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.05)",animation:"notaPop 0.2s ease both"}}>
            <span style={{color:oC.glow,fontSize:10,marginTop:2,flexShrink:0}}>◆</span>
            <div style={{flex:1}}>
              <div style={{fontSize:13,color:"rgba(255,255,255,0.75)",lineHeight:1.5}}>{n.texto}</div>
              <div style={{fontSize:10,color:"rgba(255,255,255,0.2)",marginTop:2,fontFamily:"'JetBrains Mono',monospace"}}>{n.fecha}</div>
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
          color:dirty?oC.glow:"rgba(255,255,255,0.28)",cursor:"pointer",fontSize:13,fontWeight:700,
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
        <span style={{display:"flex",alignItems:"center",fontSize:10,color:"rgba(255,255,255,0.12)",fontFamily:"'JetBrains Mono',monospace"}}>Esc</span>
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
    <div style={{position:"absolute",bottom:88,right:268,width:W,height:H,...GLASS,borderRadius:10,overflow:"hidden",zIndex:10,display:"none"}}>
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



/**
 * Props para persistencia compartida entre usuarios:
 *   sharedPuestos      → layout desde tu backend (array de puestos)
 *   onSaveLayout(arr)  → llamado al cambiar el layout (ej: POST a tu API)
 *   sharedNotas        → notas desde tu backend ({ [obraId]: [...] })
 *   onSaveNotas(obj)   → llamado al cambiar notas
 * Si no se pasan, se usa localStorage (solo local, no compartido).
 */
/* ═══════════════════════════════════════════════════════════════
   KPI PANEL — flotante derecha, compacto e interactivo
═══════════════════════════════════════════════════════════════ */
function KPIPanel({ obras, puestos, obraByPuesto, collapsed, onCollapse, onFocusPuesto, memoriasEdit, onDesasignar }) {
  const [activeTab, setActiveTab] = useState("alertas");
  const [hoveredAlert, setHoveredAlert] = useState(null);

  /* ── métricas ── */
  const total           = puestos.length;
  const ocupados        = puestos.filter(p => obraByPuesto[p.id]).length;
  const libres          = total - ocupados;
  const ocupPct         = total > 0 ? Math.round((ocupados / total) * 100) : 0;
  const obrasActivas    = obras.filter(o => o.estado === "activa");
  const obrasPausadas   = obras.filter(o => o.estado === "pausada");
  const obrasTerminadas = obras.filter(o => o.estado === "terminada");
  const progPct         = obrasActivas.length > 0
    ? Math.round(obrasActivas.reduce((s,o)=>s+(o._pct??0),0)/obrasActivas.length) : 0;

  /* ── obras fantasma: tienen puesto_mapa pero ese puesto no existe en el layout ── */
  const puestoIds = new Set(puestos.map(p => p.id));
  const obrasFantasma = obras.filter(o =>
    o.puesto_mapa &&
    !puestoIds.has(o.puesto_mapa) &&
    ["activa","pausada"].includes(o.estado)
  );

  /* ── alertas ── */
  const CAMPOS_CRITICOS = [
    {key:"propietario",label:"propietario"},{key:"motores",label:"motorización"},
    {key:"color_casco",label:"casco"},{key:"madera_muebles",label:"madera"},
  ];
  const obrasConMapa = obras.filter(o=>o.puesto_mapa&&["activa","pausada"].includes(o.estado));
  const alertasMemoria = obrasConMapa.flatMap(o=>{
    const db = (memoriasEdit??{})[o.codigo] ?? (memoriasEdit??{})[o.id] ?? {};
    const faltantes = CAMPOS_CRITICOS.filter(c=>{
      const v=o[c.key]??db[c.key.replace("motores","motorizacion")]??db[c.key];
      return !v;
    });
    if(!faltantes.length) return [];
    const esVacia = faltantes.length===CAMPOS_CRITICOS.length;
    return [{tipo:"memoria",codigo:o.codigo,estado:o.estado,
      etiqueta:esVacia?"Sin info":"Incompleta",
      detalle:esVacia?null:faltantes.map(f=>f.label).join(", "),
      color:esVacia?"#ef4444":"#f59e0b",severity:faltantes.length}];
  }).sort((a,b)=>b.severity-a.severity);

  const alertasPausadas = obrasPausadas.filter(o=>o.puesto_mapa).map(o=>({
    tipo:"pausada",codigo:o.codigo,etiqueta:"Pausada",detalle:null,color:"#f59e0b",severity:0,
  }));
  const alertas = [...alertasPausadas,...alertasMemoria];
  const hasCrit = alertas.some(a=>a.color==="#ef4444");

  /* ── ring ── */
  const OcupRing = () => {
    const r=28,sw=3.5,circ=2*Math.PI*r;
    const col=ocupPct>80?"#f59e0b":"#6366f1";
    return(
      <svg width={r*2+sw*2} height={r*2+sw*2} style={{flexShrink:0}}>
        <circle cx={r+sw} cy={r+sw} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={sw}/>
        <circle cx={r+sw} cy={r+sw} r={r} fill="none" stroke={col} strokeWidth={sw}
          strokeLinecap="round"
          strokeDasharray={`${(ocupPct/100)*circ} ${circ}`}
          strokeDashoffset={circ*0.25}
          style={{transition:"stroke-dasharray 0.9s cubic-bezier(0.22,1,0.36,1)",filter:`drop-shadow(0 0 5px ${col}99)`}}/>
        <text x={r+sw} y={r+sw+0.5} textAnchor="middle" dominantBaseline="central"
          fill="#fff" fontSize="10" fontWeight="800" fontFamily="'JetBrains Mono',monospace">{ocupPct}%</text>
      </svg>
    );
  };

  /* ── collapsed strip ── */
  if(collapsed) return(
    <div onClick={()=>onCollapse(false)} style={{
      position:"absolute",top:0,right:0,bottom:0,width:KPI_W_COLLAPSED,zIndex:9,
      background:"rgba(7,7,12,0.80)",backdropFilter:"blur(24px)",
      WebkitBackdropFilter:"blur(24px)",
      borderLeft:"1px solid rgba(255,255,255,0.07)",
      display:"flex",flexDirection:"column",alignItems:"center",paddingTop:14,gap:10,
      cursor:"pointer",
    }}>
      {alertas.length>0&&(
        <div style={{width:7,height:7,borderRadius:"50%",
          background:hasCrit?"#ef4444":"#f59e0b",
          boxShadow:`0 0 8px ${hasCrit?"#ef4444":"#f59e0b"}`,
          animation:"beacon 1.8s ease-in-out infinite"}}/>
      )}
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
        stroke="rgba(255,255,255,0.25)" strokeWidth="2.5" strokeLinecap="round">
        <polyline points="15 18 9 12 15 6"/>
      </svg>
    </div>
  );

  /* ── full panel ── */
  return(
    <div style={{
      position:"absolute",top:0,right:0,bottom:0,width:KPI_W,zIndex:9,
      display:"flex",flexDirection:"column",
      background:"rgba(6,6,11,0.82)",
      backdropFilter:"blur(32px) saturate(150%)",
      WebkitBackdropFilter:"blur(32px) saturate(150%)",
      borderLeft:"1px solid rgba(255,255,255,0.07)",
      animation:"kpi-slideIn 0.3s cubic-bezier(0.22,1,0.36,1)",
      fontFamily:"'Outfit',system-ui,sans-serif",
    }}>
      <style>{`
        .kpi-sc::-webkit-scrollbar{width:2px}
        .kpi-sc::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.07);border-radius:2px}
        .kpi-tab{flex:1;padding:9px 4px;font-size:10px;letter-spacing:.5px;background:transparent;border:none;
          cursor:pointer;transition:all .18s;font-family:'JetBrains Mono',monospace;}
        .kpi-row{display:flex;align-items:center;justify-content:space-between;
          padding:8px 12px;border-radius:9px;transition:background .15s,border-color .15s;cursor:pointer;}
        .kpi-row:hover{background:rgba(255,255,255,0.04)!important;}
        .kpi-alert{border-radius:9px;padding:9px 12px;cursor:pointer;transition:all .15s;}
      `}</style>

      {/* ────── HEADER ────── */}
      <div style={{padding:"14px 16px 10px",borderBottom:"1px solid rgba(255,255,255,0.06)",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
          <span style={{fontSize:10,letterSpacing:3,textTransform:"uppercase",
            color:"rgba(255,255,255,0.22)",fontFamily:"'JetBrains Mono',monospace",fontWeight:700}}>
            Resumen
          </span>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            {alertas.length>0&&(
              <div onClick={()=>setActiveTab("alertas")} style={{
                display:"flex",alignItems:"center",gap:4,
                padding:"3px 9px",borderRadius:20,cursor:"pointer",
                background:hasCrit?"rgba(239,68,68,0.15)":"rgba(245,158,11,0.12)",
                border:`1px solid ${hasCrit?"rgba(239,68,68,0.4)":"rgba(245,158,11,0.3)"}`,
                color:hasCrit?"#fca5a5":"#fcd34d",
                fontSize:10,fontWeight:700,fontFamily:"'JetBrains Mono',monospace",
                boxShadow:hasCrit?"0 0 12px rgba(239,68,68,0.25)":"none",
                animation:"beacon 2s ease-in-out infinite",
              }}>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                {alertas.length}
              </div>
            )}
            <div onClick={()=>onCollapse(true)} title="Colapsar" style={{
              width:22,height:22,borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",
              cursor:"pointer",border:"1px solid rgba(255,255,255,0.08)",
              background:"rgba(255,255,255,0.02)",color:"rgba(255,255,255,0.3)",
              transition:"all .15s",
            }}
              onMouseEnter={e=>{e.currentTarget.style.background="rgba(255,255,255,0.07)";e.currentTarget.style.color="#fff";}}
              onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,0.02)";e.currentTarget.style.color="rgba(255,255,255,0.3)";}}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </div>
          </div>
        </div>

        {/* Ocupación hero */}
        <div style={{display:"flex",alignItems:"center",gap:14,
          padding:"12px 14px",borderRadius:10,
          background:"rgba(255,255,255,0.025)",border:"1px solid rgba(255,255,255,0.05)"}}>
          <OcupRing/>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:7,color:"rgba(255,255,255,0.22)",letterSpacing:1.3,
              textTransform:"uppercase",marginBottom:5,fontFamily:"'JetBrains Mono',monospace"}}>
              Puestos
            </div>
            <div style={{display:"flex",alignItems:"baseline",gap:4}}>
              <span style={{fontSize:28,fontWeight:800,color:"#a5b4fc",
                fontFamily:"'JetBrains Mono',monospace",lineHeight:1}}>{ocupados}</span>
              <span style={{fontSize:14,color:"rgba(255,255,255,0.2)",fontFamily:"'JetBrains Mono',monospace"}}>
                /{total}
              </span>
            </div>
            <div style={{display:"flex",gap:10,marginTop:4}}>
              <span style={{fontSize:10,color:"#34d399",fontWeight: 700}}>
                {libres} libre{libres!==1?"s":""}
              </span>
              {obrasActivas.length>0&&(
                <span style={{fontSize:10,color:"rgba(255,255,255,0.25)"}}>
                  avg <span style={{color:"#3b82f6",fontWeight:700}}>{progPct}%</span>
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ────── TABS ────── */}
      <div style={{display:"flex",borderBottom:"1px solid rgba(255,255,255,0.06)",flexShrink:0}}>
        {[
          ["stats","Stats","#6366f1"],
          ["alertas",alertas.length>0?`Alertas · ${alertas.length}`:"Alertas",
            hasCrit?"#ef4444":alertas.length>0?"#f59e0b":"var(--subtle)"]
        ].map(([key,label,ac])=>(
          <button key={key} className="kpi-tab" onClick={()=>setActiveTab(key)} style={{
            color:activeTab===key?"#fff":"rgba(255,255,255,0.3)",
            borderBottom:`2px solid ${activeTab===key?ac:"transparent"}`,
            boxShadow:activeTab===key&&key==="alertas"&&alertas.length>0?`0 2px 10px ${ac}30`:"none",
          }}>{label}</button>
        ))}
      </div>

      {/* ────── BODY ────── */}
      <div className="kpi-sc" style={{flex:1,overflowY:"auto",padding:"14px 14px 18px"}}>

        {/* ── STATS TAB ── */}
        {activeTab==="stats"&&(<>
          {/* Barra progreso promedio */}
          <div style={{marginBottom:16}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
              <span style={{fontSize:10,color:"rgba(255,255,255,0.3)",letterSpacing:.5}}>Progreso promedio</span>
              <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:14,fontWeight:800,
                color:"#3b82f6"}}>{progPct}%</span>
            </div>
            <div style={{height:4,borderRadius:3,background:"rgba(255,255,255,0.05)",overflow:"hidden"}}>
              <div style={{height:"100%",width:`${progPct}%`,borderRadius:3,
                background:"linear-gradient(90deg,#3b82f6,#6366f1)",
                boxShadow:"0 0 8px #3b82f666",transition:"width 0.8s cubic-bezier(0.22,1,0.36,1)"}}/>
            </div>
          </div>

          {/* Estado rows */}
          <div style={{display:"flex",flexDirection:"column",gap:3}}>
            {[
              {label:"Activas",   n:obrasActivas.length,    c:"#3b82f6",pct:obrasActivas.length/Math.max(1,total)*100},
              {label:"Pausadas",  n:obrasPausadas.length,   c:"#f59e0b",pct:obrasPausadas.length/Math.max(1,total)*100},
              {label:"Terminadas",n:obrasTerminadas.length, c:"#10b981",pct:obrasTerminadas.length/Math.max(1,total)*100},
              {label:"Libres",    n:libres,                 c:"var(--subtle)",pct:libres/Math.max(1,total)*100,muted:true},
            ].map(({label,n,c,pct,muted})=>(
              <div key={label} style={{
                display:"flex",alignItems:"center",padding:"9px 12px",borderRadius:9,
                background:n>0&&!muted?`${c}09`:"rgba(255,255,255,0.015)",
                border:`1px solid ${n>0&&!muted?c+"20":"rgba(255,255,255,0.04)"}`,
                borderLeft:`3px solid ${n>0?c:"rgba(255,255,255,0.07)"}`,
              }}>
                <span style={{fontSize:11,flex:1,
                  color:n>0&&!muted?"rgba(255,255,255,0.65)":"rgba(255,255,255,0.2)",fontWeight:500}}>
                  {label}
                </span>
                {/* mini barra */}
                <div style={{width:40,height:3,borderRadius:2,
                  background:"rgba(255,255,255,0.06)",marginRight:10,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${pct}%`,background:c,borderRadius:2,
                    opacity:muted?0.3:1,transition:"width 0.6s ease"}}/>
                </div>
                <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:15,fontWeight:800,
                  color:n>0?c:"rgba(255,255,255,0.1)",minWidth:20,textAlign:"right"}}>{n}</span>
              </div>
            ))}
          </div>
        </>)}

        {/* ── ALERTAS TAB ── */}
        {activeTab==="alertas"&&(<>
          {/* Obras fantasma — asignadas a puestos inexistentes */}
          {obrasFantasma.length>0&&(
            <div style={{marginBottom:10}}>
              <div style={{fontSize:10,letterSpacing:1.3,textTransform:"uppercase",color:"#ef444490",
                fontFamily:"'JetBrains Mono',monospace",fontWeight:700,marginBottom:6,
                display:"flex",alignItems:"center",gap:5}}>
                <div style={{width:5,height:5,borderRadius:"50%",background:"#ef4444",
                  boxShadow:"0 0 6px #ef4444",animation:"beacon 1.8s ease-in-out infinite"}}/>
                Obras sin puesto válido
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:4}}>
                {obrasFantasma.map(o=>(
                  <div key={o.id} style={{
                    display:"flex",alignItems:"center",gap:8,
                    padding:"8px 10px",borderRadius:9,
                    background:"rgba(239,68,68,0.07)",
                    border:"1px solid rgba(239,68,68,0.25)",
                    borderLeft:"3px solid #ef4444",
                  }}>
                    <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:13,
                      fontWeight:700,color:"#fca5a5",flex:1,
                      overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                      {o.codigo}
                    </span>
                    <button onClick={()=>onDesasignar?.(o.id)} style={{
                      fontSize:10,padding:"3px 8px",borderRadius:5,
                      background:"rgba(239,68,68,0.15)",
                      border:"1px solid rgba(239,68,68,0.35)",
                      color:"#f87171",cursor:"pointer",fontFamily:"'Outfit',sans-serif",
                      fontWeight:600,flexShrink:0,letterSpacing:0.3,
                    }}>
                      Desasignar
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {alertas.length===0&&obrasFantasma.length===0?(
            <div style={{textAlign:"center",padding:"32px 0",display:"flex",
              flexDirection:"column",alignItems:"center",gap:8}}>
              <div style={{width:36,height:36,borderRadius:"50%",
                background:"rgba(16,185,129,0.1)",border:"1px solid rgba(16,185,129,0.2)",
                display:"flex",alignItems:"center",justifyContent:"center",color:"#10b981",fontSize:18}}>
                ✓
              </div>
              <div style={{fontSize:11,color:"rgba(255,255,255,0.2)",letterSpacing:1,
                fontFamily:"'JetBrains Mono',monospace"}}>Sin alertas</div>
            </div>
          ):(
            <div style={{display:"flex",flexDirection:"column",gap:5}}>
              {alertas.map((a,i)=>{
                const isCrit=a.color==="#ef4444";
                const isHov=hoveredAlert===i;
                return(
                  <div key={i} className="kpi-alert"
                    onClick={()=>onFocusPuesto?.(a.codigo)}
                    onMouseEnter={()=>setHoveredAlert(i)}
                    onMouseLeave={()=>setHoveredAlert(null)}
                    style={{
                      background:isHov?`${a.color}1e`:isCrit?"rgba(239,68,68,0.07)":
                        `${a.color}08`,
                      border:`1px solid ${a.color}${isHov?"45":isCrit?"2a":"16"}`,
                      borderLeft:`3px solid ${a.color}`,
                      animation:`fadeUp 0.3s cubic-bezier(0.22,1,0.36,1) ${i*0.04}s both`,
                    }}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      {/* dot */}
                      <div style={{position:"relative",flexShrink:0}}>
                        {isCrit&&<div style={{position:"absolute",inset:-4,borderRadius:"50%",
                          border:`1px solid ${a.color}44`,animation:"beacon 2s ease-out infinite"}}/>}
                        <div style={{width:6,height:6,borderRadius:"50%",
                          background:a.color,boxShadow:`0 0 8px ${a.color}`}}/>
                      </div>
                      {/* codigo */}
                      <span style={{fontSize:13,fontWeight:700,
                        fontFamily:"'JetBrains Mono',monospace",flex:1,
                        color:isCrit?"#fca5a5":"rgba(255,255,255,0.9)",
                        overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                        {a.codigo}
                      </span>
                      {/* etiqueta */}
                      <span style={{fontSize:10,color:a.color,fontWeight:700,
                        flexShrink:0,textTransform:"uppercase",letterSpacing:.5,
                        background:`${a.color}10`,padding:"1px 6px",borderRadius:4,
                        border:`1px solid ${a.color}20`}}>
                        {a.etiqueta}
                      </span>
                    </div>
                    {a.detalle&&(
                      <div style={{fontSize:10,color:"rgba(255,255,255,0.28)",
                        paddingLeft:14,marginTop:4,lineHeight:1.5,letterSpacing:.2}}>
                        {a.detalle}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>)}
      </div>
    </div>
  );
}

export { AddObraModal, RadialMenu, CommandPalette, CinematicCallouts, CinematicCards, FieldBox, MemoriaHUD, RadarHUD, KPIPanel };
