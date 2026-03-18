/**
 * HomeScreen.jsx  v5  ─ "Full Animation Edition"
 *
 * Widgets:
 *  ① Canvas particles en el fondo
 *  ② Logo con glow pulsante y efecto de aparición blur→focus
 *  ③ Typewriter en el saludo
 *  ④ KPI rings animados (stroke-dasharray CSS)
 *  ⑤ Activity feed live (últimos eventos en Supabase)
 *  ⑥ Ticker horizontal con datos en vivo
 *  ⑦ Cards con ripple on-click + preview SVG + hover elevation
 *  ⑧ Scan-line que baja lento
 *  ⑨ Stagger de entrada escalonado por sección
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import Sidebar from "../components/Sidebar";
import logoKlasea from "../assets/logo-klasea.png";
import logoK      from "../assets/logo-k.png";

// ─── PALETA ────────────────────────────────────────────────────
const C = {
  bg:   "#09090b", s0:"rgba(255,255,255,0.03)", s1:"rgba(255,255,255,0.055)",
  b0:   "rgba(255,255,255,0.08)", b1:"rgba(255,255,255,0.14)",
  t0:   "#f4f4f5", t1:"#a1a1aa", t2:"#52525b",
  sans: "'Outfit', system-ui, sans-serif",
  mono: "'JetBrains Mono', monospace",
  blue:"#3b82f6", cyan:"#22d3ee", green:"#10b981",
  amber:"#f59e0b", red:"#ef4444", indigo:"#818cf8", teal:"#67e8f9",
};

// ─── MÓDULOS ───────────────────────────────────────────────────
const MODULOS = [
  { href:"/panol",            label:"Maderas",           desc:"Ingresos, egresos y stock de madera",         color:"#818cf8", roles:["panol","oficina","admin"] },
  { href:"/laminacion",       label:"Laminación",        desc:"Stock y movimientos de materiales de laminación",           color:"#818cf8", roles:["panol","oficina","admin","laminacion"] },
  { href:"/obras",            label:"Obras",             desc:"Mapa de producción y estado de barcos",       color:"#60a5fa", roles:["oficina","admin"] },
  { href:"/marmoleria",       label:"Marmolería",        desc:"Seguimiento de piezas y líneas de mármol",    color:"#60a5fa", roles:["oficina","admin"] },
  { href:"/muebles",          label:"Muebles",           desc:"Plan, checklist y avance por obra",           color:"#60a5fa", roles:["oficina","admin","muebles"] },
  { href:"/obras-laminacion", label:"Por Obra",          desc:"Laminación desglosada por obra",              color:"#34d399", roles:["oficina","admin"] },
  { href:"/admin",            label:"Inventario",        desc:"KPIs de stock y alertas de materiales de madera",  color:"#fbbf24", roles:["oficina","admin"] },
  { href:"/movimientos",      label:"Movimientos",       desc:"Ingresos y egresos de maderas del depósito",             color:"#fbbf24", roles:["oficina","admin"] },
  { href:"/pedidos",          label:"Pedidos",           desc:"Órdenes de compra de materiales de madera",             color:"#fbbf24", roles:["oficina","admin"] },
  { href:"/postventa",        label:"Barcos Entregados", desc:"Post venta y flota en el agua",               color:"#67e8f9", roles:["oficina","admin"] },
  { href:"/configuracion",    label:"Configuración",     desc:"Usuarios, roles y configuración",             color:"#f87171", roles:["admin"] },
  { href:"/procedimientos",   label:"Procedimientos",    desc:"Instructivos y guías de operación",           color:"#94a3b8", roles:["panol","oficina","admin","laminacion","muebles","mecanica","electricidad"] },
];

// ─── CARD CON IFRAME PREVIEW REAL ────────────────────────────
// Escala la pantalla real al vuelo usando transform: scale().
// El iframe comparte el localStorage de Supabase (mismo origen),
// así que el usuario ya está autenticado y ve la pantalla real.
// ─── CARD ──────────────────────────────────────────────────────
// ─── CARD ──────────────────────────────────────────────────────
// ─── ILUSTRACIONES POR MÓDULO ─────────────────────────────────
// Cada una es un SVG abstracto que representa visualmente el módulo.
// Viven en el fondo de la card, semi-transparentes.
const CARD_ART = {

  "/panol": (c) => (
    <svg viewBox="0 0 240 140" fill="none" style={{position:"absolute",inset:0,width:"100%",height:"100%",opacity:0.18}}>
      {/* Estantes / filas de inventario */}
      {[0,1,2,3,4].map(i=>(
        <g key={i}>
          <line x1="20" y1={28+i*22} x2="220" y2={28+i*22} stroke={c} strokeWidth="1.2" strokeOpacity="0.6"/>
          {[0,1,2,3,4,5].map(j=>(
            <rect key={j} x={24+j*32} y={16+i*22} width={22} height={10} rx="2"
              fill={c} fillOpacity={0.12+(j%3)*0.08}/>
          ))}
        </g>
      ))}
      {/* soporte vertical */}
      <line x1="20" y1="18" x2="20" y2="128" stroke={c} strokeWidth="1.5" strokeOpacity="0.5"/>
      <line x1="220" y1="18" x2="220" y2="128" stroke={c} strokeWidth="1.5" strokeOpacity="0.5"/>
    </svg>
  ),

  "/laminacion": (c) => (
    <svg viewBox="0 0 240 140" fill="none" style={{position:"absolute",inset:0,width:"100%",height:"100%",opacity:0.18}}>
      {/* Trama de fibra de vidrio: diagonales cruzadas */}
      {[0,1,2,3,4,5,6,7,8,9,10,11,12].map(i=>(
        <line key={`a${i}`} x1={-20+i*22} y1="0" x2={i*22-120} y2="140"
          stroke={c} strokeWidth="0.8" strokeOpacity="0.35"/>
      ))}
      {[0,1,2,3,4,5,6,7,8,9,10,11,12].map(i=>(
        <line key={`b${i}`} x1={-20+i*22} y1="140" x2={i*22-120} y2="0"
          stroke={c} strokeWidth="0.8" strokeOpacity="0.2"/>
      ))}
      {/* rombos en las intersecciones */}
      {[0,1,2,3,4,5].map(i=>(
        [0,1,2,3].map(j=>(
          <rect key={`r${i}${j}`}
            x={-2+i*40} y={-2+j*36}
            width="4" height="4" rx="1"
            fill={c} fillOpacity="0.55"
            style={{transform:`rotate(45deg)`,transformOrigin:`${i*40}px ${j*36}px`}}/>
        ))
      ))}
      {/* barras de stock tipo inventario */}
      {[0,1,2,3].map(i=>(
        <rect key={`s${i}`} x={180} y={20+i*28} width={[38,24,42,18][i]} height="12" rx="3"
          fill={c} fillOpacity="0.18" stroke={c} strokeWidth="0.7" strokeOpacity="0.5"/>
      ))}
      {[0,1,2,3].map(i=>(
        <rect key={`sf${i}`} x={180} y={20+i*28} width={[28,14,36,8][i]} height="12" rx="3"
          fill={c} fillOpacity="0.35"/>
      ))}
    </svg>
  ),

  "/obras": (c) => (
    <svg viewBox="0 0 240 140" fill="none" style={{position:"absolute",inset:0,width:"100%",height:"100%",opacity:0.18}}>
      {/* Siluetas de barcos */}
      {[
        {x:20, y:40, w:36, h:70, r:4},
        {x:62, y:30, w:40, h:80, r:4},
        {x:110,y:25, w:44, h:90, r:4},
        {x:162,y:35, w:38, h:72, r:4},
        {x:206,y:42, w:30, h:58, r:4},
      ].map((b,i)=>(
        <g key={i}>
          <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={b.r}
            fill={c} fillOpacity={0.12+i*0.03} stroke={c} strokeWidth="0.8" strokeOpacity="0.5"/>
          {/* ventanas */}
          {[0,1].map(j=>(
            <rect key={j} x={b.x+6+j*12} y={b.y+10} width="8" height="5" rx="1"
              fill={c} fillOpacity="0.4"/>
          ))}
          {/* quilla */}
          <line x1={b.x+b.w/2} y1={b.y+b.h-4} x2={b.x+b.w/2} y2={b.y+b.h+8}
            stroke={c} strokeWidth="1" strokeOpacity="0.4"/>
        </g>
      ))}
      {/* agua */}
      <path d="M10,125 Q60,118 120,125 Q180,132 230,125" fill="none" stroke={c} strokeWidth="1.2" strokeOpacity="0.4"/>
      <path d="M10,132 Q60,126 120,132 Q180,138 230,132" fill="none" stroke={c} strokeWidth="0.7" strokeOpacity="0.25"/>
    </svg>
  ),

  "/marmoleria": (c) => (
    <svg viewBox="0 0 240 140" fill="none" style={{position:"absolute",inset:0,width:"100%",height:"100%",opacity:0.18}}>
      {/* Grid de piezas de mesada / mármol cortado */}
      {[
        {x:12, y:12, w:80, h:34},
        {x:98, y:12, w:60, h:34},
        {x:164,y:12, w:64, h:34},
        {x:12, y:52, w:50, h:38},
        {x:68, y:52, w:90, h:38},
        {x:164,y:52, w:64, h:38},
        {x:12, y:96, w:130,h:32},
        {x:148,y:96, w:80, h:32},
      ].map((p,i)=>(
        <g key={i}>
          <rect x={p.x} y={p.y} width={p.w} height={p.h} rx="2"
            fill={c} fillOpacity={0.08+i%3*0.04}
            stroke={c} strokeWidth="0.9" strokeOpacity="0.45"/>
          {/* veta interna */}
          <path d={`M${p.x+6},${p.y+p.h*0.4} Q${p.x+p.w*0.4},${p.y+p.h*0.2} ${p.x+p.w-6},${p.y+p.h*0.55}`}
            fill="none" stroke={c} strokeWidth="0.6" strokeOpacity="0.3"/>
          {/* estado dot */}
          <circle cx={p.x+p.w-8} cy={p.y+8} r="3"
            fill={c} fillOpacity={[0.7,0.4,0.7,0.4,0.7,0.7,0.4,0.7][i]}/>
        </g>
      ))}
    </svg>
  ),

  "/muebles": (c) => (
    <svg viewBox="0 0 240 140" fill="none" style={{position:"absolute",inset:0,width:"100%",height:"100%",opacity:0.18}}>
      {/* Checklist con ticks */}
      {[0,1,2,3,4].map(i=>(
        <g key={i}>
          <rect x="20" y={20+i*22} width="14" height="14" rx="3"
            fill={c} fillOpacity={i<3?0.25:0.08} stroke={c} strokeWidth="1" strokeOpacity="0.6"/>
          {i<3&&<path d={`M23,${27+i*22} l4,4 l6,-7`} stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>}
          <rect x="42" y={23+i*22} width={[100,85,110,75,90][i]} height="4" rx="2"
            fill={c} fillOpacity={0.25}/>
          <rect x="42" y={30+i*22} width={[60,50,70,45,55][i]} height="3" rx="1"
            fill={c} fillOpacity="0.12"/>
        </g>
      ))}
      {/* Barra de progreso grande */}
      <rect x="160" y="25" width="60" height="90" rx="6" fill={c} fillOpacity="0.06" stroke={c} strokeWidth="0.8" strokeOpacity="0.3"/>
      <rect x="163" y="28" width="54" height={62} rx="4" fill={c} fillOpacity="0.18"/>
      <text x="187" y="102" textAnchor="middle" fill={c} fontSize="10" fontFamily="monospace" fontWeight="700" fillOpacity="0.7">74%</text>
    </svg>
  ),

  "/obras-laminacion": (c) => (
    <svg viewBox="0 0 240 140" fill="none" style={{position:"absolute",inset:0,width:"100%",height:"100%",opacity:0.18}}>
      {/* Barras de gantt tipo acordeón */}
      {[0,1,2,3,4].map(i=>(
        <g key={i}>
          <rect x="20" y={18+i*23} width={[170,130,190,110,150][i]} height="14" rx="3"
            fill={c} fillOpacity={0.12+i*0.04}/>
          <rect x="20" y={18+i*23} width={[120,80,160,60,110][i]} height="14" rx="3"
            fill={c} fillOpacity="0.28"/>
          {/* label */}
          <rect x="24" y={22+i*23} width="28" height="4" rx="1" fill={c} fillOpacity="0.6"/>
        </g>
      ))}
      {/* línea de tiempo */}
      <line x1="20" y1="10" x2="20" y2="130" stroke={c} strokeWidth="1" strokeOpacity="0.3"/>
      <line x1="120" y1="10" x2="120" y2="130" stroke={c} strokeWidth="1.5" strokeOpacity="0.5" strokeDasharray="4 3"/>
      {/* hoy label */}
      <rect x="110" y="6" width="20" height="7" rx="2" fill={c} fillOpacity="0.35"/>
    </svg>
  ),

  "/admin": (c) => (
    <svg viewBox="0 0 240 140" fill="none" style={{position:"absolute",inset:0,width:"100%",height:"100%",opacity:0.18}}>
      {/* 4 rings de KPI */}
      {[{cx:50,cy:65,r:30,pct:0.82},{cx:120,cy:65,r:30,pct:0.45},{cx:190,cy:65,r:30,pct:0.18}].map((k,i)=>{
        const circ = 2*Math.PI*k.r;
        return (
          <g key={i}>
            <circle cx={k.cx} cy={k.cy} r={k.r} fill="none" stroke={c} strokeWidth="3" strokeOpacity="0.12"/>
            <circle cx={k.cx} cy={k.cy} r={k.r} fill="none" stroke={c} strokeWidth="3"
              strokeDasharray={`${circ*k.pct} ${circ}`} strokeLinecap="round" strokeOpacity="0.65"
              style={{transform:`rotate(-90deg)`,transformOrigin:`${k.cx}px ${k.cy}px`}}/>
            <circle cx={k.cx} cy={k.cy} r="5" fill={c} fillOpacity="0.5"/>
          </g>
        );
      })}
      {/* líneas de tabla */}
      {[0,1,2,3].map(i=>(
        <line key={i} x1="20" y1={105+i*8} x2="220" y2={105+i*8}
          stroke={c} strokeWidth="0.8" strokeOpacity={0.3-i*0.05}/>
      ))}
    </svg>
  ),

  "/movimientos": (c) => (
    <svg viewBox="0 0 240 140" fill="none" style={{position:"absolute",inset:0,width:"100%",height:"100%",opacity:0.18}}>
      {/* Gráfico de barras apiladas */}
      {[0,1,2,3,4,5,6,7].map(i=>(
        <g key={i}>
          {/* barra ingreso */}
          <rect x={20+i*26} y={130-[55,40,70,35,60,45,80,50][i]} width="10" height={[55,40,70,35,60,45,80,50][i]}
            rx="2" fill={c} fillOpacity="0.45"/>
          {/* barra egreso */}
          <rect x={32+i*26} y={130-[30,25,45,20,38,28,52,32][i]} width="10" height={[30,25,45,20,38,28,52,32][i]}
            rx="2" fill={c} fillOpacity="0.22"/>
        </g>
      ))}
      {/* línea baseline */}
      <line x1="15" y1="130" x2="225" y2="130" stroke={c} strokeWidth="1" strokeOpacity="0.4"/>
      {/* eje Y */}
      <line x1="15" y1="20" x2="15" y2="130" stroke={c} strokeWidth="0.8" strokeOpacity="0.3"/>
      {/* línea de tendencia */}
      <path d="M25,105 C55,85 85,95 115,72 S175,68 215,55"
        fill="none" stroke={c} strokeWidth="1.5" strokeOpacity="0.6" strokeDasharray="5 3"/>
    </svg>
  ),

  "/pedidos": (c) => (
    <svg viewBox="0 0 240 140" fill="none" style={{position:"absolute",inset:0,width:"100%",height:"100%",opacity:0.18}}>
      {/* Stack de documentos/órdenes */}
      {[3,2,1,0].map(i=>(
        <rect key={i} x={30+i*6} y={20+i*4} width="160" height="100" rx="6"
          fill={c} fillOpacity={0.04+i*0.04} stroke={c} strokeWidth="0.8" strokeOpacity={0.2+i*0.1}/>
      ))}
      {/* contenido del doc frontal */}
      <rect x="36" y="36" width="60" height="6" rx="2" fill={c} fillOpacity="0.45"/>
      {[0,1,2,3,4].map(i=>(
        <g key={i}>
          <circle cx="44" cy={52+i*14} r="3" fill={c} fillOpacity={[0.7,0.5,0.8,0.4,0.6][i]}/>
          <rect x="52" y={49+i*14} width={[80,65,90,55,70][i]} height="4" rx="1" fill={c} fillOpacity="0.25"/>
        </g>
      ))}
      {/* sello / stamp */}
      <circle cx="175" cy="95" r="22" fill="none" stroke={c} strokeWidth="1.5" strokeOpacity="0.4" strokeDasharray="5 3"/>
      <circle cx="175" cy="95" r="16" fill={c} fillOpacity="0.08"/>
    </svg>
  ),

  "/postventa": (c) => (
    <svg viewBox="0 0 240 140" fill="none" style={{position:"absolute",inset:0,width:"100%",height:"100%",opacity:0.18}}>
      {/* Mapa estilo calles */}
      <line x1="0"   y1="55"  x2="240" y2="55"  stroke={c} strokeWidth="2"   strokeOpacity="0.35"/>
      <line x1="0"   y1="90"  x2="240" y2="90"  stroke={c} strokeWidth="1.2" strokeOpacity="0.25"/>
      <line x1="60"  y1="0"   x2="60"  y2="140" stroke={c} strokeWidth="1.8" strokeOpacity="0.3"/>
      <line x1="130" y1="0"   x2="130" y2="140" stroke={c} strokeWidth="1.2" strokeOpacity="0.25"/>
      <line x1="185" y1="0"   x2="185" y2="140" stroke={c} strokeWidth="1"   strokeOpacity="0.2"/>
      {/* bloques de manzanas */}
      {[[10,10,44,38],[70,10,54,38],[140,10,38,38],[14,66,40,18],[70,66,54,18],[135,66,44,18],[188,66,44,18]].map(([x,y,w,h],i)=>(
        <rect key={i} x={x} y={y} width={w} height={h} rx="2" fill={c} fillOpacity="0.1"/>
      ))}
      {/* marcadores de barcos */}
      {[[55,50],[128,48],[82,85],[160,78],[195,52]].map(([x,y],i)=>(
        <g key={i}>
          <circle cx={x} cy={y} r="6" fill={c} fillOpacity="0.3" stroke={c} strokeWidth="1.2" strokeOpacity="0.7"/>
          <circle cx={x} cy={y} r="2.5" fill={c} fillOpacity="0.9"/>
          {/* señal de pulso */}
          <circle cx={x} cy={y} r="10" fill="none" stroke={c} strokeWidth="0.8" strokeOpacity="0.3"/>
        </g>
      ))}
      {/* río */}
      <path d="M0,115 Q60,108 120,116 Q180,124 240,112" fill={c} fillOpacity="0.1" stroke={c} strokeWidth="1" strokeOpacity="0.4"/>
    </svg>
  ),

  "/configuracion": (c) => (
    <svg viewBox="0 0 240 140" fill="none" style={{position:"absolute",inset:0,width:"100%",height:"100%",opacity:0.18}}>
      {/* Engranajes */}
      {[[75,65,38],[165,60,28],[118,105,20]].map(([cx,cy,r],i)=>{
        const teeth = [8,7,6][i];
        const pts = Array.from({length:teeth*2},(_,j)=>{
          const a = (j*Math.PI)/teeth - Math.PI/2;
          const rr = j%2===0 ? r+7 : r;
          return `${cx+Math.cos(a)*rr},${cy+Math.sin(a)*rr}`;
        }).join(' ');
        return (
          <g key={i}>
            <polygon points={pts} fill="none" stroke={c} strokeWidth="1.2" strokeOpacity="0.5"/>
            <circle cx={cx} cy={cy} r={r*0.55} fill="none" stroke={c} strokeWidth="1" strokeOpacity="0.4"/>
            <circle cx={cx} cy={cy} r="4" fill={c} fillOpacity="0.5"/>
          </g>
        );
      })}
      {/* líneas de conexión */}
      <line x1="107" y1="65" x2="137" y2="65" stroke={c} strokeWidth="0.8" strokeOpacity="0.3" strokeDasharray="3 2"/>
      <line x1="100" y1="85" x2="115" y2="100" stroke={c} strokeWidth="0.8" strokeOpacity="0.3" strokeDasharray="3 2"/>
    </svg>
  ),

  "/procedimientos": (c) => (
    <svg viewBox="0 0 240 140" fill="none" style={{position:"absolute",inset:0,width:"100%",height:"100%",opacity:0.18}}>
      {/* Ícono de documento grande */}
      <rect x="55" y="12" width="100" height="120" rx="6" fill={c} fillOpacity="0.08" stroke={c} strokeWidth="1.2" strokeOpacity="0.4"/>
      {/* doblez esquina */}
      <path d="M135,12 L155,32 L135,32 Z" fill={c} fillOpacity="0.2"/>
      <path d="M135,12 L155,32" fill="none" stroke={c} strokeWidth="1" strokeOpacity="0.5"/>
      {/* líneas de texto */}
      {[0,1,2,3,4,5,6,7].map(i=>(
        <rect key={i} x="67" y={42+i*11} width={[70,55,75,45,68,52,60,40][i]} height="4" rx="2"
          fill={c} fillOpacity={i===0?0.5:0.2}/>
      ))}
      {/* números de paso */}
      {[0,2,5].map(i=>(
        <circle key={i} cx="62" cy={44+i*11} r="4" fill={c} fillOpacity="0.35"/>
      ))}
      {/* stack de docs detrás */}
      <rect x="46" y="20" width="100" height="120" rx="6" fill="none" stroke={c} strokeWidth="0.7" strokeOpacity="0.2"/>
      <rect x="38" y="28" width="100" height="120" rx="6" fill="none" stroke={c} strokeWidth="0.5" strokeOpacity="0.12"/>
    </svg>
  ),
};

// ─── CARD ──────────────────────────────────────────────────────
function Card({ mod, delay, onClick }) {
  const [hov,      setHov]      = useState(false);
  const [ripples,  setRipples]  = useState([]);
  const [tilt,     setTilt]     = useState({ x:0, y:0 });
  const [shimmer,  setShimmer]  = useState(false);
  const cardRef   = useRef(null);
  const shimmerRef = useRef(null);
  const Art = CARD_ART[mod.href];

  const onMouseMove = e => {
    const el = cardRef.current; if(!el) return;
    const r  = el.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width/2))  / (r.width/2);
    const dy = (e.clientY - (r.top  + r.height/2)) / (r.height/2);
    setTilt({ x: dy * -7, y: dx * 7 });
  };

  const onMouseEnter = e => {
    setHov(true); onMouseMove(e);
    clearTimeout(shimmerRef.current);
    shimmerRef.current = setTimeout(() => setShimmer(true), 40);
  };
  const onMouseLeave = () => { setHov(false); setTilt({x:0,y:0}); setShimmer(false); };

  const handleClick = e => {
    const rect = cardRef.current.getBoundingClientRect();
    const id = Date.now();
    setRipples(r => [...r, { id, x: e.clientX-rect.left, y: e.clientY-rect.top }]);
    setTimeout(() => setRipples(r => r.filter(rr => rr.id !== id)), 700);
    onClick();
  };

  useEffect(() => () => clearTimeout(shimmerRef.current), []);

  const transform = hov
    ? `perspective(900px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) translateY(-5px) scale(1.018)`
    : "perspective(900px) rotateX(0deg) rotateY(0deg) translateY(0) scale(1)";

  const BL = 14;

  return (
    <button
      ref={cardRef}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onMouseMove={hov ? onMouseMove : undefined}
      onClick={handleClick}
      style={{
        display:"flex", flexDirection:"column", justifyContent:"flex-end",
        padding:"18px 18px 16px",
        background: hov
          ? `rgba(255,255,255,0.05)`
          : "rgba(255,255,255,0.025)",
        border:`1px solid ${hov ? mod.color+"65" : "rgba(255,255,255,0.07)"}`,
        borderRadius:14, cursor:"pointer", textAlign:"left",
        fontFamily:"'Outfit',system-ui,sans-serif",
        transition:"transform 0.18s cubic-bezier(0.22,1,0.36,1), box-shadow 0.22s, border-color 0.22s, background 0.2s",
        transform,
        boxShadow: hov
          ? `0 28px 65px rgba(0,0,0,0.6), 0 0 0 1px ${mod.color}25, inset 0 0 60px ${mod.color}08`
          : "0 2px 12px rgba(0,0,0,0.4)",
        animation:`cardIn 0.55s cubic-bezier(0.22,1,0.36,1) ${delay}ms both`,
        position:"relative", overflow:"hidden", height:"100%",
        willChange:"transform",
      }}
    >
      {/* ── Ilustración SVG de fondo ── */}
      <div style={{
        position:"absolute", inset:0, pointerEvents:"none",
        transition:"opacity 0.3s",
        opacity: hov ? 1 : 0.65,
      }}>
        {Art && Art(mod.color)}
      </div>

      {/* ── Gradiente de legibilidad sobre el arte ── */}
      <div style={{
        position:"absolute", inset:0, pointerEvents:"none",
        background:`linear-gradient(to top, ${hov?"rgba(9,9,11,0.82)":"rgba(9,9,11,0.72)"} 0%, rgba(9,9,11,0.1) 55%, transparent 100%)`,
        transition:"background 0.25s",
      }}/>

      {/* ── Glow ambiental top-right ── */}
      <div style={{
        position:"absolute", top:-40, right:-40, width:130, height:130,
        borderRadius:"50%",
        background:`${mod.color}${hov?"1a":"0e"}`,
        filter:"blur(35px)", pointerEvents:"none",
        transition:"background 0.3s, transform 0.4s",
        transform: hov ? "scale(1.3)" : "scale(1)",
      }}/>

      {/* ── Ripples ── */}
      {ripples.map(rip => (
        <div key={rip.id} style={{
          position:"absolute", left:rip.x-70, top:rip.y-70,
          width:140, height:140, borderRadius:"50%", pointerEvents:"none",
          background:`radial-gradient(circle, ${mod.color}30 0%, transparent 70%)`,
          animation:"bigRipple 0.7s cubic-bezier(0.22,1,0.36,1) forwards", zIndex:12,
        }}/>
      ))}

      {/* ── Shimmer sweep ── */}
      {shimmer && (
        <div style={{
          position:"absolute", top:0, left:"-100%", width:"60%", height:"100%",
          background:`linear-gradient(105deg, transparent 25%, ${mod.color}15 50%, transparent 75%)`,
          animation:"cardShimmer 0.7s cubic-bezier(0.22,1,0.36,1) forwards",
          pointerEvents:"none", zIndex:8,
        }}/>
      )}

      {/* ── Corner brackets ── */}
      {hov && (
        <svg style={{position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none",zIndex:9,overflow:"visible"}}>
          {[
            `M ${BL},4 L 4,4 L 4,${BL}`,
            `M calc(100% - ${BL}),4 L calc(100% - 4),4 L calc(100% - 4),${BL}`,
            `M 4,calc(100% - ${BL}) L 4,calc(100% - 4) L ${BL},calc(100% - 4)`,
            `M calc(100% - ${BL}),calc(100% - 4) L calc(100% - 4),calc(100% - 4) L calc(100% - 4),calc(100% - ${BL})`,
          ].map((d,i)=>(
            <path key={i} d={d} fill="none" stroke={mod.color} strokeWidth="1.8" strokeLinecap="round"
              style={{
                filter:`drop-shadow(0 0 5px ${mod.color})`,
                strokeDasharray:BL*2+4, strokeDashoffset:BL*2+4,
                animation:`bracketDraw 0.22s ease ${i*0.04}s forwards`,
              }}/>
          ))}
        </svg>
      )}

      {/* ── Contenido textual (sobre el arte) ── */}
      <div style={{ position:"relative", zIndex:10 }}>

        {/* Dot + label */}
        <div style={{ display:"flex", alignItems:"center", gap:9, marginBottom:7 }}>
          <div style={{ position:"relative", flexShrink:0 }}>
            {hov && (
              <div style={{
                position:"absolute", inset:-5, borderRadius:"50%",
                border:`1px solid ${mod.color}55`,
                animation:"ringExpand 1.2s ease-out infinite",
              }}/>
            )}
            <div style={{
              width:9, height:9, borderRadius:"50%", background:mod.color,
              boxShadow: hov
                ? `0 0 0 2px rgba(0,0,0,0.5), 0 0 18px ${mod.color}, 0 0 36px ${mod.color}55`
                : `0 0 9px ${mod.color}80`,
              transition:"box-shadow 0.25s",
            }}/>
          </div>

          <span style={{
            fontSize:14, fontWeight:700, letterSpacing:"0.2px",
            ...(hov ? {
              background:`linear-gradient(90deg,#fff 0%,#fff 35%,${mod.color} 52%,#fff 68%,#fff 100%)`,
              backgroundSize:"200% auto",
              WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent",
              animation:"labelShimmer 1.2s linear 0.08s 1 forwards",
            } : { color:"#f4f4f5" }),
          }}>
            {mod.label}
          </span>
        </div>

        {/* Descripción */}
        <div style={{
          fontSize:11, lineHeight:1.6,
          color: hov ? "#9ca3af" : "#52525b",
          transition:"color 0.2s",
          paddingRight:28,
        }}>
          {mod.desc}
        </div>
      </div>

      {/* ── Flecha ── */}
      <div style={{
        position:"absolute", bottom:16, right:14, zIndex:10,
        fontSize:15, fontWeight:700,
        color: hov ? mod.color : "rgba(255,255,255,0.08)",
        transition:"all 0.2s cubic-bezier(0.22,1,0.36,1)",
        transform: hov ? "translate(0,0) scale(1.2)" : "translate(3px,3px) scale(1)",
        filter: hov ? `drop-shadow(0 0 8px ${mod.color})` : "none",
      }}>→</div>

      {/* ── Línea inferior que crece desde el centro ── */}
      <div style={{
        position:"absolute", bottom:0,
        left: hov ? 0 : "50%",
        right: hov ? 0 : "50%",
        height:2, borderRadius:2,
        background:`linear-gradient(90deg,transparent 0%,${mod.color} 50%,transparent 100%)`,
        opacity: hov ? 1 : 0,
        transition:"left 0.38s cubic-bezier(0.22,1,0.36,1), right 0.38s cubic-bezier(0.22,1,0.36,1), opacity 0.2s",
        boxShadow:`0 0 12px ${mod.color}90`,
      }}/>
    </button>
  );
}

// ─── DATOS EN VIVO ─────────────────────────────────────────────
function useLiveData() {
  const [data, setData] = useState({ activas:0, pausadas:0, terminadas:0, criticos:0, loaded:false });
  const load = useCallback(async () => {
    try {
      const [r1, r2] = await Promise.all([
        supabase.from("produccion_obras").select("estado"),
        supabase.from("materiales_kpi").select("estado_ui").eq("estado_ui","CRITICO"),
      ]);
      const obras = r1.data ?? [];
      setData({
        activas:    obras.filter(o=>o.estado==="activa").length,
        pausadas:   obras.filter(o=>o.estado==="pausada").length,
        terminadas: obras.filter(o=>o.estado==="terminada").length,
        criticos:   (r2.data??[]).length,
        loaded: true,
      });
    } catch { setData(d=>({...d, loaded:true})); }
  }, []);
  useEffect(()=>{ load(); const id=setInterval(load,30000); return()=>clearInterval(id); }, [load]);
  return data;
}

function useClock() {
  const [t, setT] = useState(new Date());
  useEffect(()=>{ const id=setInterval(()=>setT(new Date()),1000); return()=>clearInterval(id); },[]);
  return t;
}

function Typewriter({ text, delay = 0, speed = 38 }) {
  const [shown, setShown] = useState("");
  const [started, setStarted] = useState(false);
  useEffect(()=>{ const t0=setTimeout(()=>setStarted(true),delay); return()=>clearTimeout(t0); },[delay]);
  useEffect(()=>{
    if(!started||shown.length>=text.length) return;
    const id=setTimeout(()=>setShown(text.slice(0,shown.length+1)),speed);
    return()=>clearTimeout(id);
  },[started,shown,text,speed]);
  return (
    <span>
      {shown}
      {shown.length<text.length&&started&&(
        <span style={{animation:"cursorBlink .7s step-end infinite",borderRight:"1.5px solid currentColor",marginLeft:1}}/>
      )}
    </span>
  );
}

function AnimNum({ to, color }) {
  const [v, setV] = useState(0);
  const prev = useRef(0);
  useEffect(()=>{
    if(!to) return;
    const from=prev.current, start=performance.now();
    const tick=now=>{ const p=Math.min((now-start)/1100,1), e=1-Math.pow(1-p,3);
      setV(Math.round(from+(to-from)*e)); if(p<1) requestAnimationFrame(tick); else prev.current=to; };
    requestAnimationFrame(tick);
  },[to]);
  return <span style={{color}}>{v}</span>;
}

function Ring({ value, total, color, size=52, label, delay=0 }) {
  const pct = total>0 ? Math.min(value/total,1) : 0;
  const r = (size-6)/2;
  const circ = 2*Math.PI*r;
  const [animated, setAnimated] = useState(false);
  useEffect(()=>{ const t=setTimeout(()=>setAnimated(true),delay+200); return()=>clearTimeout(t); },[delay]);
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6,
      animation:`fadeSlideUp 0.5s ease ${delay}ms both` }}>
      <div style={{ position:"relative", width:size, height:size }}>
        <svg width={size} height={size} style={{transform:"rotate(-90deg)",display:"block"}}>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="3.5"/>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="3.5"
            strokeLinecap="round" strokeDasharray={circ}
            strokeDashoffset={animated?circ*(1-pct):circ}
            style={{transition:"stroke-dashoffset 1.4s cubic-bezier(0.22,1,0.36,1)",filter:`drop-shadow(0 0 4px ${color}88)`}}/>
        </svg>
        <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center",
          justifyContent:"center", fontFamily:"'JetBrains Mono',monospace", fontSize:12, fontWeight:700, color }}>
          <AnimNum to={value} color={color}/>
        </div>
      </div>
      <span style={{ fontSize:8.5, color:"#52525b", letterSpacing:2, textTransform:"uppercase",
        fontFamily:"'JetBrains Mono',monospace" }}>{label}</span>
    </div>
  );
}

function Particles() {
  const ref = useRef(null);
  useEffect(()=>{
    const canvas=ref.current; if(!canvas) return;
    const ctx=canvas.getContext("2d");
    let W,H,raf;
    const resize=()=>{ W=canvas.width=canvas.offsetWidth; H=canvas.height=canvas.offsetHeight; };
    resize(); window.addEventListener("resize",resize);
    const N=55;
    const pts=Array.from({length:N},()=>({
      x:Math.random()*W, y:Math.random()*H,
      vx:(Math.random()-.5)*.2, vy:(Math.random()-.5)*.2, r:Math.random()*1.1+.3,
    }));
    const draw=()=>{
      ctx.clearRect(0,0,W,H);
      for(let i=0;i<N;i++) for(let j=i+1;j<N;j++){
        const dx=pts[i].x-pts[j].x, dy=pts[i].y-pts[j].y, d=Math.sqrt(dx*dx+dy*dy);
        if(d<140){ ctx.beginPath(); ctx.moveTo(pts[i].x,pts[i].y); ctx.lineTo(pts[j].x,pts[j].y);
          ctx.strokeStyle=`rgba(255,255,255,${.022*(1-d/140)})`; ctx.lineWidth=.5; ctx.stroke(); }
      }
      pts.forEach(p=>{
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
        ctx.fillStyle="rgba(255,255,255,0.2)"; ctx.fill();
        p.x+=p.vx; p.y+=p.vy;
        if(p.x<0||p.x>W) p.vx*=-1; if(p.y<0||p.y>H) p.vy*=-1;
      });
      raf=requestAnimationFrame(draw);
    };
    draw();
    return()=>{ cancelAnimationFrame(raf); window.removeEventListener("resize",resize); };
  },[]);
  return <canvas ref={ref} style={{position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none",opacity:.55}}/>;
}

function Ticker({ items }) {
  return (
    <div style={{ flexShrink:0, height:26, borderTop:`1px solid rgba(255,255,255,0.08)`,
      overflow:"hidden", display:"flex", alignItems:"center",
      background:"rgba(0,0,0,0.35)", backdropFilter:"blur(8px)" }}>
      <div style={{ padding:"0 12px", borderRight:`1px solid rgba(255,255,255,0.08)`, height:"100%",
        display:"flex", alignItems:"center", flexShrink:0 }}>
        <span style={{ fontSize:8, fontFamily:"'JetBrains Mono',monospace", color:"#52525b", letterSpacing:2 }}>LIVE</span>
      </div>
      <div style={{ overflow:"hidden", flex:1 }}>
        <div style={{ display:"flex", whiteSpace:"nowrap", animation:"tickerScroll 32s linear infinite" }}>
          {[...items,...items].map((it,i)=>(
            <span key={i} style={{ display:"inline-flex", alignItems:"center", gap:7,
              fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:"#a1a1aa", paddingRight:40 }}>
              <span style={{ color:it.color, fontSize:5 }}>◆</span>
              <span style={{ color:"#52525b" }}>{it.label.toUpperCase()}</span>
              <span style={{ color:it.color, fontWeight:700 }}>{it.value}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function HomeScreen({ profile, signOut }) {
  const navigate = useNavigate();
  const live  = useLiveData();
  const clock = useClock();

  const role      = profile?.role ?? "invitado";
  const isAdmin   = !!profile?.is_admin;
  const username  = profile?.username ?? "—";
  const esGestion = isAdmin || role==="admin" || role==="oficina";
  const esAdmin   = isAdmin || role==="admin";
  const esPanol   = role==="panol";

  const modulos = MODULOS.filter(m=>{
    if(esAdmin)   return true;
    if(esGestion) return m.roles.some(r=>["oficina","admin","panol","laminacion","muebles"].includes(r));
    if(esPanol)   return m.roles.includes("panol");
    return m.roles.includes(role);
  });

  const hora     = clock.getHours();
  const greeting = `${hora<12?"Buenos días":hora<19?"Buenas tardes":"Buenas noches"}, ${username}`;
  const hh = String(clock.getHours()).padStart(2,"0");
  const mm = String(clock.getMinutes()).padStart(2,"0");
  const ss = String(clock.getSeconds()).padStart(2,"0");
  const fecha = clock.toLocaleDateString("es-AR",{weekday:"long",day:"2-digit",month:"long"});

  const total = live.activas + live.pausadas + live.terminadas;

  const tickerItems = [
    {label:"Obras activas",  value:live.activas,    color:C.blue  },
    {label:"Pausadas",       value:live.pausadas,   color:C.amber },
    {label:"Terminadas",     value:live.terminadas, color:C.green },
    {label:"Stock crítico",  value:live.criticos,   color:C.red   },
    {label:"Sistema",        value:"OK",            color:C.green },
    {label:"Módulos",        value:modulos.length,  color:C.indigo},
  ];

  return (
    <>
      <style>{`
        @keyframes cardIn       { from{opacity:0;transform:translateY(20px) scale(0.96)} to{opacity:1;transform:none} }
        @keyframes bigRipple    { from{transform:scale(0);opacity:1} to{transform:scale(4);opacity:0} }
        @keyframes cardShimmer  { from{left:-100%} to{left:200%} }
        @keyframes bracketDraw  { to{stroke-dashoffset:0} }
        @keyframes ringExpand   { 0%{transform:scale(1);opacity:0.7} 100%{transform:scale(2.4);opacity:0} }
        @keyframes labelShimmer { 0%{background-position:-200% center} 100%{background-position:200% center} }
        @keyframes fadeSlideUp  { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:none} }
        @keyframes headerIn     { from{opacity:0;transform:translateY(-16px)} to{opacity:1;transform:none} }
        @keyframes logoReveal   { from{opacity:0;transform:scale(0.86);filter:blur(10px)} to{opacity:1;transform:none;filter:blur(0)} }
        @keyframes lineExpand   { from{transform:scaleX(0);opacity:0} to{transform:scaleX(1);opacity:1} }
        @keyframes cursorBlink  { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes pulseOnline  { 0%,100%{box-shadow:0 0 0 0 #10b98155} 60%{box-shadow:0 0 0 7px #10b98100} }
        @keyframes dotBeat      { 0%,100%{transform:scale(1);opacity:1} 50%{transform:scale(1.9);opacity:.45} }
        @keyframes scanDown     { 0%{top:-1px;opacity:0} 4%{opacity:.28} 96%{opacity:.28} 100%{top:100%;opacity:0} }
        @keyframes rippleAnim   { from{transform:scale(0);opacity:1} to{transform:scale(3.5);opacity:0} }
        @keyframes tickerScroll { from{transform:translateX(0)} to{transform:translateX(-50%)} }
        @keyframes glowPulse    { 0%,100%{filter:brightness(1.05) drop-shadow(0 0 28px rgba(59,130,246,0.28))} 50%{filter:brightness(1.12) drop-shadow(0 0 44px rgba(59,130,246,0.48))} }
        @keyframes shimmer      { 0%{background-position:-200% center} 100%{background-position:200% center} }
        @keyframes tooltipIn    { from{opacity:0;transform:scale(0.93) translateY(4px)} to{opacity:1;transform:scale(1) translateY(0)} }

        .hs-scroll::-webkit-scrollbar{width:3px}
        .hs-scroll::-webkit-scrollbar-track{background:transparent}
        .hs-scroll::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.07);border-radius:2px}
      `}</style>

      <div style={{ display:"flex", width:"100vw", height:"100vh",
        background:C.bg, fontFamily:C.sans, overflow:"hidden" }}>
        <Sidebar profile={profile} signOut={signOut}/>

        <div style={{ flex:1, display:"flex", flexDirection:"column",
          overflow:"hidden", position:"relative" }}>

          {/* ── FONDO ── */}
          <Particles/>
          <div style={{ position:"absolute", inset:0, pointerEvents:"none",
            background:[
              "radial-gradient(ellipse at 65% 0%, rgba(59,130,246,0.07) 0%, transparent 48%)",
              "radial-gradient(ellipse at 8% 90%, rgba(16,185,129,0.05) 0%, transparent 42%)",
            ].join(",") }}/>
          <div style={{ position:"absolute", inset:0, pointerEvents:"none",
            backgroundImage:["linear-gradient(rgba(255,255,255,0.017) 1px,transparent 1px)",
              "linear-gradient(90deg,rgba(255,255,255,0.017) 1px,transparent 1px)"].join(","),
            backgroundSize:"72px 72px" }}/>

          {/* Scan line */}
          <div style={{ position:"absolute", left:0, right:0, height:1, zIndex:10,
            pointerEvents:"none", animation:"scanDown 16s linear infinite 1.5s",
            background:"linear-gradient(90deg,transparent,rgba(255,255,255,0.11),transparent)" }}/>

          {/* ── TOPBAR ── */}
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
            padding:"0 28px", height:46, flexShrink:0,
            borderBottom:`1px solid ${C.b0}`,
            background:"rgba(9,9,11,0.78)", backdropFilter:"blur(20px)",
            position:"relative", zIndex:2,
            animation:"headerIn 0.45s cubic-bezier(0.22,1,0.36,1) both" }}>

            {/* online */}
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <div style={{ width:7, height:7, borderRadius:"50%", background:C.green,
                animation:"pulseOnline 2.4s ease-out infinite" }}/>
              <span style={{ fontSize:9, color:C.t2, letterSpacing:2.5,
                textTransform:"uppercase", fontFamily:C.mono }}>Online</span>
            </div>

            {/* métricas */}
            {live.loaded && (
              <div style={{ display:"flex", alignItems:"center", gap:20 }}>
                {[
                  {v:live.activas,    c:C.blue,  l:"Activas"   },
                  {v:live.pausadas,   c:C.amber, l:"Pausadas"  },
                  {v:live.terminadas, c:C.green, l:"Terminadas"},
                  ...(live.criticos>0?[{v:live.criticos,c:C.red,l:"Críticos"}]:[]),
                ].map(k=>(
                  <div key={k.l} style={{ display:"flex", alignItems:"center", gap:5 }}>
                    <div style={{ width:4, height:4, borderRadius:"50%", background:k.c,
                      boxShadow:`0 0 7px ${k.c}`, animation:"dotBeat 2.6s ease-in-out infinite" }}/>
                    <span style={{ fontFamily:C.mono, fontSize:13, fontWeight:700, color:k.c }}>
                      <AnimNum to={k.v} color={k.c}/>
                    </span>
                    <span style={{ fontSize:9, color:C.t2, letterSpacing:1.5,
                      textTransform:"uppercase" }}>{k.l}</span>
                  </div>
                ))}
              </div>
            )}

            {/* reloj */}
            <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:1 }}>
              <div style={{ display:"flex", alignItems:"baseline", gap:2 }}>
                <span style={{ fontFamily:C.mono, fontSize:19, fontWeight:700,
                  color:C.t0, letterSpacing:2.5 }}>
                  {hh}<span style={{ opacity:.28, animation:"cursorBlink 1s step-end infinite" }}>:</span>{mm}
                </span>
                <span style={{ fontFamily:C.mono, fontSize:10, color:C.t2, marginLeft:2 }}>{ss}</span>
              </div>
              <span style={{ fontSize:8.5, color:C.t2, fontFamily:C.mono, letterSpacing:1.5 }}>
                {fecha.toUpperCase()}
              </span>
            </div>
          </div>

          {/* ── HERO ── */}
          <div style={{ padding:"28px 28px 22px", flexShrink:0,
            borderBottom:`1px solid ${C.b0}`, position:"relative", zIndex:1 }}>

            {/* saludo typewriter */}
            <div style={{ fontSize:10.5, color:C.t2, letterSpacing:3, textTransform:"uppercase",
              marginBottom:14, fontFamily:C.mono,
              animation:"fadeSlideUp 0.4s ease 0.05s both" }}>
              <Typewriter text={greeting} delay={300} speed={32}/>
            </div>

            <div style={{ display:"flex", alignItems:"flex-end",
              justifyContent:"space-between", gap:20 }}>

              {/* LOGO */}
              <div style={{ animation:"logoReveal 0.7s cubic-bezier(0.22,1,0.36,1) 0.12s both" }}>
                <img src={logoKlasea} alt="Klase A"
                  style={{ height:80, objectFit:"contain", display:"block",
                    animation:"glowPulse 4s ease-in-out 1.2s infinite" }}
                  onError={e=>{
                    e.currentTarget.src=logoK;
                    e.currentTarget.style.height="64px";
                  }}
                />

                {/* línea bajo logo */}
                <div style={{ height:1, width:300, marginTop:11,
                  background:`linear-gradient(90deg,${C.blue}95,${C.cyan}45,transparent)`,
                  transformOrigin:"left",
                  animation:"lineExpand 0.85s cubic-bezier(0.22,1,0.36,1) 0.55s both",
                  boxShadow:`0 0 12px ${C.blue}45` }}/>

                {/* subtítulo */}
                <div style={{ fontSize:10, color:C.t2, marginTop:9, letterSpacing:2.5,
                  textTransform:"uppercase", fontFamily:C.mono,
                  display:"flex", alignItems:"center", gap:10,
                  animation:"fadeSlideUp 0.4s ease 0.6s both" }}>
                  <span>Astillero · Sistema de Producción</span>
                  <span style={{ padding:"1px 8px", borderRadius:4,
                    background:"rgba(255,255,255,0.04)", border:`1px solid ${C.b0}`,
                    fontSize:9, letterSpacing:1.5, color:C.t2 }}>{role}</span>
                  <span style={{ padding:"1px 8px", borderRadius:4,
                    background:"rgba(16,185,129,0.08)", border:"1px solid rgba(16,185,129,0.2)",
                    fontSize:9, letterSpacing:1.5, color:C.green }}>{modulos.length} módulos</span>
                </div>
              </div>

              {/* KPI RINGS */}
              {live.loaded && total > 0 && (
                <div style={{ display:"flex", gap:24, flexShrink:0, paddingBottom:2 }}>
                  <Ring value={live.activas}    total={total} color={C.blue}  label="Activas"   delay={700}/>
                  <Ring value={live.pausadas}   total={total} color={C.amber} label="Pausadas"  delay={820}/>
                  <Ring value={live.terminadas} total={total} color={C.green} label="Terminadas"delay={940}/>
                  {live.criticos>0&&(
                    <Ring value={live.criticos} total={total} color={C.red} label="Críticos" delay={1060}/>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── CARDS ── */}
          <div style={{ flex:1, display:"flex", flexDirection:"column",
            padding:"16px 28px 20px", position:"relative", zIndex:1, overflow:"hidden" }}>

            <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:12, flexShrink:0,
              animation:"fadeSlideUp 0.4s ease 0.26s both" }}>
              <span style={{ fontSize:9, color:C.t2, letterSpacing:3,
                textTransform:"uppercase", fontFamily:C.mono }}>Acceso rápido</span>
              <div style={{ flex:1, height:1,
                background:`linear-gradient(90deg,${C.b0},transparent)` }}/>
              <span style={{ fontSize:9, color:"rgba(255,255,255,0.09)",
                fontFamily:C.mono, letterSpacing:2 }}>KLASE A · ASTILLERO · v9.0</span>
            </div>

            <div style={{
              flex:1,
              display:"grid",
              gridTemplateColumns:`repeat(${Math.min(modulos.length, 6)}, 1fr)`,
              gridTemplateRows:`repeat(${Math.ceil(modulos.length / Math.min(modulos.length, 6))}, 1fr)`,
              gap:10,
            }}>
              {modulos.map((mod,i) => (
                <Card key={mod.href} mod={mod} delay={i*42}
                  onClick={()=>navigate(mod.href)}/>
              ))}
            </div>
          </div>

          {/* ── TICKER ── */}
          {live.loaded && <Ticker items={tickerItems}/>}
        </div>
      </div>
    </>
  );
}
