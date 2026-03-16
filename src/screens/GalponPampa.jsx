/**
 * GalponPampa.jsx
 * Vista del Galpón Pampa — Laminación · Plásticos · K85
 * Mapa SVG basado en el plano del galpón.
 * Se importa desde MapaProduccion y se renderiza como vista alternativa.
 */
import { useState, useRef, useCallback, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import k85Img from "./K85.jpg";

/* ── Colores compartidos (copiados de MapaProduccion para no crear dependencia circular) ── */
const C = {
  bg:"#05050a", b0:"rgba(255,255,255,0.06)", b1:"rgba(255,255,255,0.12)",
  t0:"#ffffff", t1:"#a1a1aa", t2:"#52525b",
  sans:"'Outfit', system-ui, sans-serif",
  mono:"'JetBrains Mono', 'Fira Code', monospace",
  obra:{
    activa:   {glow:"#3b82f6",label:"Activa"},
    pausada:  {glow:"#f59e0b",label:"Pausada"},
    terminada:{glow:"#10b981",label:"Terminada"},
    cancelada:{glow:"#ef4444",label:"Cancelada"},
    vacio:    {glow:"#6366f1",label:"Disponible"},
  },
};
const GLASS={
  background:"rgba(10,10,15,0.88)",
  backdropFilter:"blur(24px) saturate(160%)",
  WebkitBackdropFilter:"blur(24px) saturate(160%)",
  border:`1px solid ${C.b0}`,
  boxShadow:"0 8px 32px -4px rgba(0,0,0,0.7),inset 0 1px 0 rgba(255,255,255,0.05)",
};

/* ── Icono SVG back ── */
const IcBack = ()=>(
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6"/>
  </svg>
);
const IcBoat = ()=>(
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <path d="M3 17l1.5-9L12 3l7.5 5L21 17"/>
    <path d="M3 17c0 2 4 3 9 3s9-1 9-3"/>
    <line x1="12" y1="3" x2="12" y2="17"/>
  </svg>
);

/* ── Zonas del plano (basado en PDF del galpón) ──
   El plano es apaisado ~4700 de ancho.
   Coordenadas en unidades relativas (viewBox 2000×900).
   Distribución según el PDF:
   - Frente: Oficina, Baño, Vestuario, Comedor, Motores
   - Centro principal: zona de producción K85 (3 bahías)
   - Lados: Fibra, Tanques, Carpintería, Pintura
   - Fondo: Depósito muebles, Depósito piezas plásticas, Pañol
*/
const VBW = 2000, VBH = 900;

const ZONAS = [
  // ── Frente (lado derecho en el plano) ──
  {id:"oficina",    x:1720, y:20,  w:260, h:120, label:"Oficina",      fill:"rgba(99,102,241,0.08)",  stroke:"#6366f1", dim:true},
  {id:"bano_f",     x:1720, y:150, w:120, h:80,  label:"Baño",         fill:"rgba(99,102,241,0.05)",  stroke:"#6366f1", dim:true, small:true},
  {id:"vestuario",  x:1720, y:240, w:120, h:100, label:"Vestuario",    fill:"rgba(99,102,241,0.05)",  stroke:"#6366f1", dim:true, small:true},
  {id:"comedor",    x:1850, y:150, w:130, h:190, label:"Comedor",      fill:"rgba(99,102,241,0.05)",  stroke:"#6366f1", dim:true, small:true},
  {id:"oficina_dep",x:1720, y:350, w:260, h:100, label:"Oficina Dep.",  fill:"rgba(99,102,241,0.06)",  stroke:"#6366f1", dim:true, small:true},
  {id:"motores",    x:1720, y:460, w:260, h:160, label:"Motores",       fill:"rgba(245,158,11,0.07)",  stroke:"#f59e0b", dim:true},
  {id:"almacen",    x:1720, y:630, w:260, h:120, label:"Almacén",       fill:"rgba(245,158,11,0.05)",  stroke:"#f59e0b", dim:true, small:true},
  {id:"bano_t",     x:1720, y:760, w:130, h:120, label:"Baño",          fill:"rgba(99,102,241,0.04)",  stroke:"#6366f1", dim:true, small:true},
  {id:"paniol_1",   x:1850, y:760, w:130, h:120, label:"Pañol 1°P",     fill:"rgba(99,102,241,0.04)",  stroke:"#6366f1", dim:true, small:true},

  // ── Lateral izquierdo ──
  {id:"fibra",      x:20,  y:20,  w:200, h:260, label:"Fibra",         fill:"rgba(16,185,129,0.07)",  stroke:"#10b981", dim:true},
  {id:"tanques",    x:20,  y:290, w:200, h:300, label:"Tanques",        fill:"rgba(16,185,129,0.05)",  stroke:"#10b981", dim:true},
  {id:"mecanica",   x:20,  y:600, w:200, h:150, label:"Mecánica",       fill:"rgba(245,158,11,0.07)",  stroke:"#f59e0b", dim:true},
  {id:"paniol_t",   x:20,  y:760, w:200, h:120, label:"Pañol",          fill:"rgba(99,102,241,0.04)",  stroke:"#6366f1", dim:true, small:true},

  // ── Superior ──
  {id:"carpinteria",x:230, y:20,  w:380, h:150, label:"Carpintería",    fill:"rgba(180,140,60,0.07)",  stroke:"#d4b483", dim:true},
  {id:"pintura",    x:620, y:20,  w:300, h:150, label:"Pintura",        fill:"rgba(239,68,68,0.07)",   stroke:"#f87171", dim:true},
  {id:"vidrios",    x:930, y:20,  w:200, h:150, label:"Vidrios",        fill:"rgba(147,197,253,0.07)", stroke:"#93c5fd", dim:true},

  // ── Fondo ──
  {id:"dep_muebles",x:230, y:760, w:360, h:120, label:"Depósito Muebles",fill:"rgba(180,140,60,0.06)", stroke:"#d4b483", dim:true},
  {id:"dep_plastico",x:600,y:760, w:530, h:120, label:"Dep. Piezas Plásticas", fill:"rgba(147,197,253,0.06)",stroke:"#93c5fd",dim:true},
  {id:"paniol_2p",  x:1140,y:760, w:200, h:120, label:"Pañol 2°P",      fill:"rgba(99,102,241,0.04)",  stroke:"#6366f1", dim:true, small:true},
  {id:"montacargas",x:1350,y:760, w:180, h:120, label:"Montacargas",    fill:"rgba(245,158,11,0.06)",  stroke:"#f59e0b", dim:true, small:true},
];

/* ── Bahías K85 — zona central de producción ── */
const BAHIAS_PAMPA = [
  {id:"bahia-1", label:"Bahía 1", cx:530,  cy:450, w:280, h:540},
  {id:"bahia-2", label:"Bahía 2", cx:860,  cy:450, w:280, h:540},
  {id:"bahia-3", label:"Bahía 3", cx:1190, cy:450, w:280, h:540},
  {id:"bahia-4", label:"Bahía 4", cx:1480, cy:450, w:200, h:540},
];

/* ─────────────────────────────────────────────────────────
   MINIATURA HUD (panel derecho en modo focus)
   Reutiliza el mismo patrón de MemoriaHUD pero importado
   externamente — pasamos MemoriaHUD como prop.
───────────────────────────────────────────────────────── */

export default function GalponPampa({ obras=[], onBack, MemoriaHUD, sharedMemorias, sharedNotas, onSaveMemorias, onSaveNotas }) {

  /* ── Viewport SVG ── */
  const svgRef   = useRef(null);
  const vpRef    = useRef({x:0,y:0,scale:1});
  const [vp, setVp]         = useState({x:0,y:0,scale:1});
  const [isDragging,setDrag]= useState(false);
  const dragRef             = useRef(null);

  /* ── Estado foco ── */
  const [focused,  setFocused]  = useState(null); // bahia id
  const [hovered,  setHovered]  = useState(null);

  /* ── Memorias / notas locales con sync ── */
  const [memorias, setMemorias] = useState(()=>{
    try { return JSON.parse(localStorage.getItem("pampa_memorias")||"{}"); } catch { return {}; }
  });
  const [notas, setNotas] = useState(()=>{
    try { return JSON.parse(localStorage.getItem("pampa_notas")||"{}"); } catch { return {}; }
  });

  useEffect(()=>{ if(sharedMemorias) setMemorias(sharedMemorias); },[sharedMemorias]);
  useEffect(()=>{ if(sharedNotas)    setNotas(sharedNotas);    },[sharedNotas]);

  const saveMemoria = (id,f) => {
    setMemorias(prev=>{ const n={...prev,[id]:f}; localStorage.setItem("pampa_memorias",JSON.stringify(n)); onSaveMemorias?.(n); return n; });
  };
  const addNota = (id,nota) => {
    setNotas(prev=>{ const n={...prev,[id]:[...(prev[id]??[]),nota]}; localStorage.setItem("pampa_notas",JSON.stringify(n)); onSaveNotas?.(n); return n; });
  };
  const delNota = (id,nid) => {
    setNotas(prev=>{ const n={...prev,[id]:(prev[id]??[]).filter(x=>x.id!==nid)}; localStorage.setItem("pampa_notas",JSON.stringify(n)); onSaveNotas?.(n); return n; });
  };

  /* ── Fit inicial ── */
  useLayoutEffect(()=>{
    const fit = ()=>{
      const el=svgRef.current; if(!el) return;
      const {width,height}=el.getBoundingClientRect();
      if(!width||!height) return;
      const scale=Math.min(width*0.9/VBW, height*0.9/VBH);
      const next={x:(width-VBW*scale)/2, y:(height-VBH*scale)/2, scale};
      vpRef.current=next; setVp(next);
    };
    fit(); const t=setTimeout(fit,120); return()=>clearTimeout(t);
  },[]);

  /* ── Pan ── */
  const onMouseDown = useCallback(e=>{
    if(e.button!==0) return;
    dragRef.current={type:"pan",lastX:e.clientX,lastY:e.clientY,moved:false};
    setDrag(true);
  },[]);
  useEffect(()=>{
    if(!isDragging) return;
    const onMove = e=>{
      const d=dragRef.current; if(!d) return;
      if(Math.hypot(e.clientX-d.lastX,e.clientY-d.lastY)>3) d.moved=true;
      const dx=e.clientX-d.lastX, dy=e.clientY-d.lastY;
      d.lastX=e.clientX; d.lastY=e.clientY;
      setVp(v=>{ const n={...v,x:v.x+dx,y:v.y+dy}; vpRef.current=n; return n; });
    };
    const onUp = ()=>{ setDrag(false); dragRef.current=null; };
    window.addEventListener("mousemove",onMove);
    window.addEventListener("mouseup",onUp);
    return()=>{ window.removeEventListener("mousemove",onMove); window.removeEventListener("mouseup",onUp); };
  },[isDragging]);

  /* ── Zoom ── */
  const onWheel = useCallback(e=>{
    e.preventDefault();
    const rect=svgRef.current?.getBoundingClientRect(); if(!rect) return;
    const mx=e.clientX-rect.left, my=e.clientY-rect.top;
    const f=e.deltaY<0?1.12:0.88;
    setVp(v=>{ const ns=Math.min(6,Math.max(0.15,v.scale*f)); const n={x:mx-(mx-v.x)*(ns/v.scale),y:my-(my-v.y)*(ns/v.scale),scale:ns}; vpRef.current=n; return n; });
  },[]);
  useEffect(()=>{ const el=svgRef.current; if(!el) return; el.addEventListener("wheel",onWheel,{passive:false}); return()=>el.removeEventListener("wheel",onWheel); },[onWheel]);
  const zoomBtn = f=>{ const rect=svgRef.current?.getBoundingClientRect(); if(!rect) return; const cx=rect.width/2,cy=rect.height/2; setVp(v=>{ const ns=Math.min(6,Math.max(0.15,v.scale*f)); const n={x:cx-(cx-v.x)*(ns/v.scale),y:cy-(cy-v.y)*(ns/v.scale),scale:ns}; vpRef.current=n; return n; }); };
  const resetVp = ()=>{ const el=svgRef.current; if(!el) return; const {width,height}=el.getBoundingClientRect(); const scale=Math.min(width*0.9/VBW,height*0.9/VBH); const n={x:(width-VBW*scale)/2,y:(height-VBH*scale)/2,scale}; vpRef.current=n; setVp(n); };

  /* ── Focus en bahía ── */
  const focusOnBahia = useCallback(b=>{
    const el=svgRef.current; if(!el) return;
    const {width,height}=el.getBoundingClientRect();
    const scale=Math.min(width*0.5/b.w, height*0.5/b.h, 3);
    const n={x:width/2-b.cx*scale, y:height/2-b.cy*scale, scale};
    vpRef.current=n; setVp(n);
  },[]);

  /* ── Obras por bahía ── */
  const obraByBahia = {};
  obras.forEach(o=>{ if(o.bahia_pampa) obraByBahia[o.bahia_pampa]=o; });

  /* ── Focused state derivado ── */
  const focusedBahia = focused ? BAHIAS_PAMPA.find(b=>b.id===focused) : null;
  const focusedObra  = focusedBahia ? (obraByBahia[focused] ?? null) : null;
  const focusedOC    = C.obra[focusedObra?.estado??"vacio"];

  /* ── Dot grid offset ── */
  const gsz=60*vp.scale;
  const gsx=((vp.x%gsz)+gsz)%gsz, gsy=((vp.y%gsz)+gsz)%gsz;

  /* ── Stats ── */
  const totalK85 = obras.filter(o=>o.modelo==="K85"||o.tipo_mapa==="k85").length;
  const ocupados = BAHIAS_PAMPA.filter(b=>obraByBahia[b.id]).length;

  return (
    <div style={{width:"100%",height:"100%",display:"flex",flexDirection:"column",background:C.bg,fontFamily:C.sans,position:"relative",overflow:"hidden"}}>

      <style>{`
        @keyframes pampaFadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pampaPulse{0%,100%{opacity:0.7}50%{opacity:0.3}}
        .pampa-glass-btn{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);color:${C.t1};transition:all 0.2s;cursor:pointer;}
        .pampa-glass-btn:hover{background:rgba(255,255,255,0.08);color:${C.t0};border-color:rgba(255,255,255,0.2);}
      `}</style>

      {/* ── Topbar ── */}
      <div style={{
        display:"flex",alignItems:"center",gap:12,
        padding:"10px 20px",
        borderBottom:`1px solid ${C.b0}`,
        flexShrink:0, zIndex:10,
        ...GLASS,
      }}>
        {/* Volver */}
        <button onClick={onBack} className="pampa-glass-btn"
          style={{display:"flex",alignItems:"center",gap:6,padding:"7px 14px",borderRadius:8,fontSize:11,fontWeight:600}}>
          <IcBack/> Mapa Principal
        </button>

        <div style={{width:1,height:20,background:C.b0}}/>

        {/* Título */}
        <div>
          <span style={{fontSize:9,letterSpacing:3,textTransform:"uppercase",color:C.t2,fontFamily:C.mono}}>Galpón Externo · </span>
          <span style={{fontSize:14,fontWeight:800,color:C.t0,letterSpacing:0.5}}>Pampa</span>
          <span style={{fontSize:10,color:C.t2,marginLeft:8}}>Laminación · Plásticos · K85</span>
        </div>

        <div style={{flex:1}}/>

        {/* Stats */}
        {[
          {l:"Bahías",   v:BAHIAS_PAMPA.length, c:C.t1},
          {l:"Ocupadas", v:ocupados,            c:"#60a5fa"},
          {l:"K85",      v:totalK85,            c:"#34d399"},
        ].map(({l,v,c})=>(
          <div key={l} style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"4px 14px",borderRadius:7,...GLASS}}>
            <span style={{fontFamily:C.mono,fontSize:16,fontWeight:800,color:c}}>{v}</span>
            <span style={{fontSize:8,letterSpacing:2,textTransform:"uppercase",color:C.t2,fontWeight:600}}>{l}</span>
          </div>
        ))}

        {/* Zoom */}
        <div style={{display:"flex",gap:4}}>
          {[{i:"+",f:()=>zoomBtn(1.25)},{i:"−",f:()=>zoomBtn(0.8)},{i:"⌂",f:resetVp}].map(({i,f})=>(
            <button key={i} onClick={f} className="pampa-glass-btn"
              style={{width:30,height:30,borderRadius:7,fontSize:i==="⌂"?14:20,display:"flex",alignItems:"center",justifyContent:"center"}}>
              {i}
            </button>
          ))}
        </div>
      </div>

      {/* ── Mapa SVG ── */}
      <div style={{flex:1,position:"relative",overflow:"hidden"}}>
        <svg ref={svgRef}
          style={{position:"absolute",inset:0,width:"100%",height:"100%",display:"block",cursor:isDragging?"grabbing":"grab"}}
          onMouseDown={onMouseDown}>

          <defs>
            <pattern id="pampaDots" x={gsx} y={gsy} width={gsz} height={gsz} patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="1.2" fill="rgba(255,255,255,0.07)"/>
            </pattern>
            {BAHIAS_PAMPA.map(b=>(
              <clipPath key={`pclip-${b.id}`} id={`pclip-${b.id}`}>
                <rect x={b.cx-b.w/2} y={b.cy-b.h/2} width={b.w} height={b.h} rx={b.w*0.04}/>
              </clipPath>
            ))}
          </defs>

          {/* Fondo */}
          <rect width="100%" height="100%" fill={C.bg}/>
          <rect width="100%" height="100%" fill="url(#pampaDots)"/>

          <g transform={`translate(${vp.x},${vp.y}) scale(${vp.scale})`}>

            {/* Borde exterior galpón */}
            <rect x={10} y={10} width={VBW-20} height={VBH-20} rx={6}
              fill="rgba(255,255,255,0.008)" stroke="rgba(255,255,255,0.12)" strokeWidth={2}/>

            {/* ── Zonas del plano (áreas departamentos) ── */}
            {ZONAS.map(z=>(
              <g key={z.id}>
                <rect x={z.x} y={z.y} width={z.w} height={z.h} rx={4}
                  fill={z.fill} stroke={z.stroke}
                  strokeOpacity={z.dim?0.35:0.7} strokeWidth={z.dim?0.8:1.2}
                  strokeDasharray={z.dim?"6 4":"none"}/>
                <text x={z.x+z.w/2} y={z.y+z.h/2} textAnchor="middle" dominantBaseline="middle"
                  fill={z.stroke} fillOpacity={z.small?0.45:0.55}
                  fontSize={z.small?8:9} fontFamily={C.mono}
                  fontWeight="600" letterSpacing="1"
                  style={{userSelect:"none",pointerEvents:"none"}}>
                  {z.label}
                </text>
              </g>
            ))}

            {/* ── Dim overlay cuando hay foco ── */}
            {focused && (
              <rect x={-9999} y={-9999} width={29999} height={29999}
                fill="rgba(0,0,0,0.65)" style={{pointerEvents:"all",cursor:"default"}}
                onClick={()=>setFocused(null)}/>
            )}

            {/* ── Bahías K85 ── */}
            {BAHIAS_PAMPA.map(b=>{
              const obra   = obraByBahia[b.id];
              const oC     = C.obra[obra?.estado??"vacio"];
              const isHov  = hovered===b.id;
              const isFoc  = focused===b.id;
              const isEmpty= !obra;
              const ix=b.cx-b.w/2, iy=b.cy-b.h/2;

              return (
                <g key={b.id}
                  style={{cursor:"pointer"}}
                  onMouseEnter={()=>setHovered(b.id)}
                  onMouseLeave={()=>setHovered(null)}
                  onClick={()=>{ setFocused(b.id); if(!isEmpty) focusOnBahia(b); }}>

                  {/* Fondo bahía */}
                  <rect x={ix} y={iy} width={b.w} height={b.h} rx={b.w*0.05}
                    fill={isEmpty?"rgba(255,255,255,0.02)":`rgba(5,7,18,0.9)`}
                    stroke={oC.glow}
                    strokeOpacity={isEmpty?0.12:(isHov||isFoc)?0.8:0.35}
                    strokeWidth={isFoc?2:(isHov?1.5:1)}
                    style={{
                      filter:isFoc?`drop-shadow(0 0 18px ${oC.glow}60)`:isHov?`drop-shadow(0 0 10px ${oC.glow}40)`:"none",
                      transition:"stroke-opacity 0.2s, stroke-width 0.2s",
                    }}/>

                  {/* Imagen K85 */}
                  <g clipPath={`url(#pclip-${b.id})`}>
                    {/* Shadow */}
                    <image href={k85Img} x={ix+4} y={iy+8} width={b.w} height={b.h}
                      preserveAspectRatio="xMidYMid meet" opacity={0.12}
                      style={{filter:"blur(6px)"}}/>
                    {/* Main */}
                    <image href={k85Img} x={ix} y={iy} width={b.w} height={b.h}
                      preserveAspectRatio="xMidYMid meet"
                      opacity={isEmpty?0.12:0.65}
                      style={{mixBlendMode:"screen",
                        filter:isEmpty?"grayscale(1)":`drop-shadow(0 0 8px ${oC.glow}70)`}}/>
                    {/* Color tint */}
                    {!isEmpty&&<rect x={ix} y={iy} width={b.w} height={b.h} rx={b.w*0.05}
                      fill={oC.glow} fillOpacity={isHov?0.12:0.06}
                      style={{mixBlendMode:"screen"}}/>}
                  </g>

                  {/* Hover ring */}
                  {isHov&&!isFoc&&<rect x={ix-4} y={iy-4} width={b.w+8} height={b.h+8} rx={b.w*0.06}
                    fill="none" stroke={oC.glow} strokeOpacity="0.45" strokeWidth="1.2" strokeDasharray="6 4"/>}

                  {/* Etiqueta bahía */}
                  <g style={{pointerEvents:"none"}}>
                    {/* Pill en la parte inferior */}
                    {(()=>{
                      const lbl = obra?.codigo ?? b.label;
                      const pw  = Math.max(52, lbl.length*8+20);
                      const py  = iy+b.h+14;
                      return(<>
                        <rect x={b.cx-pw/2} y={py-10} width={pw} height={20} rx={10}
                          fill="rgba(4,4,10,0.92)" stroke={`${oC.glow}55`} strokeWidth={1}
                          style={{filter:"drop-shadow(0 2px 5px rgba(0,0,0,0.85))"}}/>
                        <text x={b.cx} y={py+1} textAnchor="middle" dominantBaseline="middle"
                          fill="#fff" fontSize={11} fontFamily={C.mono} fontWeight="800" letterSpacing="0.5"
                          style={{userSelect:"none"}}>{lbl}</text>
                      </>);
                    })()}
                    {/* Badge estado */}
                    {obra&&(
                      <rect x={ix+b.w-46} y={iy+8} width={38} height={14} rx={4}
                        fill={`${oC.glow}22`} stroke={`${oC.glow}60`} strokeWidth={0.8}/>
                    )}
                    {obra&&<text x={ix+b.w-27} y={iy+16} textAnchor="middle" dominantBaseline="middle"
                      fill={oC.glow} fontSize={7} fontFamily={C.mono} fontWeight="700" letterSpacing="0.5"
                      style={{userSelect:"none"}}>{obra.estado?.toUpperCase()?.slice(0,4)}</text>}
                    {/* Barra de progreso */}
                    {obra&&obra._pct!=null&&(()=>{
                      const bw=b.w*0.72, bh=3, bx=b.cx-bw/2, by=iy+b.h-12;
                      return(<>
                        <rect x={bx} y={by} width={bw} height={bh} rx={1.5} fill="rgba(0,0,0,0.6)"/>
                        <rect x={bx} y={by} width={bw*(obra._pct/100)} height={bh} rx={1.5}
                          fill={oC.glow} style={{filter:`drop-shadow(0 0 3px ${oC.glow})`}}/>
                      </>);
                    })()}
                    {/* Empty cross */}
                    {isEmpty&&<>
                      <line x1={b.cx-12} y1={b.cy} x2={b.cx+12} y2={b.cy} stroke="rgba(255,255,255,0.2)" strokeWidth={1}/>
                      <line x1={b.cx} y1={b.cy-12} x2={b.cx} y2={b.cy+12} stroke="rgba(255,255,255,0.2)" strokeWidth={1}/>
                    </>}
                  </g>
                </g>
              );
            })}

            {/* ── Focus brackets ── */}
            {focused && focusedBahia && (()=>{
              const b=focusedBahia, oC=C.obra[focusedObra?.estado??"vacio"];
              const PAD=16, L=20;
              const x0=b.cx-b.w/2-PAD, y0=b.cy-b.h/2-PAD;
              const x1=b.cx+b.w/2+PAD, y1=b.cy+b.h/2+PAD;
              return(
                <g style={{pointerEvents:"none"}}>
                  <rect x={x0} y={y0} width={x1-x0} height={y1-y0}
                    rx={(x1-x0)*0.05} fill="none"
                    stroke={`${oC.glow}18`} strokeWidth={0.7} strokeDasharray="8 8"/>
                  {[[x0,y0,L,L],[x1,y0,-L,L],[x0,y1,L,-L],[x1,y1,-L,-L]].map(([cx,cy,dx,dy],i)=>(
                    <g key={i} stroke={oC.glow} strokeWidth={2.2} strokeLinecap="round"
                      style={{filter:`drop-shadow(0 0 4px ${oC.glow}80)`}}>
                      <line x1={cx} y1={cy} x2={cx+dx} y2={cy}/>
                      <line x1={cx} y1={cy} x2={cx}    y2={cy+dy}/>
                    </g>
                  ))}
                </g>
              );
            })()}

          </g>{/* end transform */}
        </svg>

        {/* ── MemoriaHUD en modo focus ── */}
        {focused && focusedBahia && MemoriaHUD && createPortal(
          <MemoriaHUD
            obra={focusedObra ?? {id:focused, codigo:focusedBahia.label, estado:"vacio"}}
            puesto={{id:focused, label:focusedBahia.label, tipo:"k85"}}
            oC={focusedOC}
            memoriaOverride={memorias[focused]}
            onSaveMemoria={saveMemoria}
            notas={notas[focused]??[]}
            onAddNota={addNota}
            onDeleteNota={delNota}
            onClose={()=>setFocused(null)}
          />,
          document.body
        )}

        {/* ── Leyenda ── */}
        <div style={{position:"absolute",bottom:16,left:16,display:"flex",gap:8,pointerEvents:"none"}}>
          {Object.entries(C.obra).filter(([k])=>k!=="vacio").map(([k,v])=>(
            <div key={k} style={{display:"flex",alignItems:"center",gap:5,
              padding:"3px 10px",borderRadius:6,...GLASS}}>
              <div style={{width:8,height:8,borderRadius:4,background:v.glow,boxShadow:`0 0 8px ${v.glow}80`}}/>
              <span style={{fontSize:9,color:C.t1,fontWeight:500,letterSpacing:0.5}}>{v.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
