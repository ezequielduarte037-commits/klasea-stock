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
  { href:"/laminacion",       label:"Laminación",        desc:"Stock y movimientos de materiales",           color:"#818cf8", roles:["panol","oficina","admin","laminacion"] },
  { href:"/obras",            label:"Obras",             desc:"Mapa de producción y estado de barcos",       color:"#60a5fa", roles:["oficina","admin"] },
  { href:"/marmoleria",       label:"Marmolería",        desc:"Seguimiento de piezas y líneas de mármol",    color:"#60a5fa", roles:["oficina","admin"] },
  { href:"/muebles",          label:"Muebles",           desc:"Plan, checklist y avance por obra",           color:"#60a5fa", roles:["oficina","admin","muebles"] },
  { href:"/obras-laminacion", label:"Por Obra",          desc:"Laminación desglosada por obra",              color:"#34d399", roles:["oficina","admin"] },
  { href:"/admin",            label:"Inventario",        desc:"KPIs de stock, alertas y pedidos sugeridos",  color:"#fbbf24", roles:["oficina","admin"] },
  { href:"/movimientos",      label:"Movimientos",       desc:"Historial de ingresos y egresos",             color:"#fbbf24", roles:["oficina","admin"] },
  { href:"/pedidos",          label:"Pedidos",           desc:"Órdenes de compra de materiales",             color:"#fbbf24", roles:["oficina","admin"] },
  { href:"/postventa",        label:"Barcos Entregados", desc:"Post venta y flota en el agua",               color:"#67e8f9", roles:["oficina","admin"] },
  { href:"/configuracion",    label:"Configuración",     desc:"Usuarios, roles y configuración",             color:"#f87171", roles:["admin"] },
  { href:"/procedimientos",   label:"Procedimientos",    desc:"Instructivos y guías de operación",           color:"#94a3b8", roles:["panol","oficina","admin","laminacion","muebles","mecanica","electricidad"] },
];

// ─── MINI PREVIEWS SVG (réplicas fieles de cada pantalla) ──────
const PREVIEWS = {
  "/panol": ({c}) => (
    <svg viewBox="0 0 200 110" fill="none">
      <rect width="200" height="110" fill="#09090b"/>
      <rect width="200" height="20" fill="rgba(255,255,255,0.04)"/>
      <rect x="8" y="6" width="50" height="8" rx="2" fill="rgba(255,255,255,0.12)"/>
      <rect x="140" y="5" width="30" height="10" rx="5" fill={`${c}30`}/>
      {[0,1,2,3,4].map(i=>(
        <g key={i}>
          <rect x="8" y={26+i*16} width="184" height="13" rx="2" fill={i%2===0?"rgba(255,255,255,0.025)":"transparent"}/>
          <rect x="12" y={30+i*16} width="40" height="5" rx="1" fill="rgba(255,255,255,0.18)"/>
          <rect x="58" y={30+i*16} width="28" height="5" rx="1" fill="rgba(255,255,255,0.08)"/>
          <rect x="92" y={29+i*16} width="22" height="7" rx="3" fill={i===0?`${C.green}35`:i===1?`${C.amber}35`:`${C.red}25`}/>
          <rect x="122" y={30+i*16} width="18" height="5" rx="1" fill="rgba(255,255,255,0.12)"/>
          <rect x="148" y={30+i*16} width="14" height="5" rx="1" fill="rgba(255,255,255,0.07)"/>
        </g>
      ))}
    </svg>
  ),
  "/laminacion": ({c}) => (
    <svg viewBox="0 0 200 110" fill="none">
      <rect width="200" height="110" fill="#09090b"/>
      <rect width="200" height="20" fill="rgba(255,255,255,0.03)"/>
      {["Ing","Egr","Stock","Ped"].map((_,i)=>(
        <rect key={i} x={8+i*46} y="4" width="40" height="12" rx="2"
          fill={i===0?`${c}20`:"transparent"} stroke={i===0?c:"rgba(255,255,255,0.07)"} strokeWidth="0.5"/>
      ))}
      {[C.green,C.amber,C.red,c].map((col,i)=>(
        <g key={i}>
          <rect x={4+i*48} y="24" width="44" height="28" rx="4" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.07)" strokeWidth="0.5"/>
          <circle cx={26+i*48} cy="38" r="8" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="2"/>
          <circle cx={26+i*48} cy="38" r="8" fill="none" stroke={col} strokeWidth="2"
            strokeDasharray={`${[25,16,10,20][i]*0.5} 50`} strokeLinecap="round"
            style={{transformOrigin:`${26+i*48}px 38px`, transform:"rotate(-90deg)"}}/>
          <rect x={14+i*48} y="44" width="22" height="4" rx="1" fill="rgba(255,255,255,0.1)"/>
        </g>
      ))}
      {[0,1,2].map(i=>(
        <g key={i}>
          <rect x="4" y={58+i*16} width="192" height="13" rx="2" fill={i%2===0?"rgba(255,255,255,0.025)":"transparent"}/>
          <rect x="8"  y={62+i*16} width="55" height="5" rx="1" fill="rgba(255,255,255,0.15)"/>
          <rect x="70" y={62+i*16} width="30" height="5" rx="1" fill="rgba(255,255,255,0.07)"/>
          <rect x="106" y={61+i*16} width="44" height="7" rx="2" fill="rgba(255,255,255,0.04)"/>
          <rect x="106" y={61+i*16} width={[28,14,40][i]} height="7" rx="2" fill={`${c}50`}/>
        </g>
      ))}
    </svg>
  ),
  "/obras": ({c}) => (
    <svg viewBox="0 0 200 110" fill="none">
      <rect width="200" height="110" fill="#05050a"/>
      {[0,1,2,3,4,5].map(i=>(
        <line key={`h${i}`} x1="0" y1={i*22} x2="200" y2={i*22} stroke="rgba(255,255,255,0.04)" strokeWidth="0.5"/>
      ))}
      {[0,1,2,3,4,5,6,7,8].map(i=>(
        <line key={`v${i}`} x1={i*25} y1="0" x2={i*25} y2="110" stroke="rgba(255,255,255,0.04)" strokeWidth="0.5"/>
      ))}
      {[
        {x:14, y:18, w:14,h:44,col:C.blue },
        {x:32, y:18, w:14,h:44,col:C.green},
        {x:52, y:14, w:18,h:52,col:C.amber},
        {x:76, y:12, w:20,h:58,col:C.blue },
        {x:100,y:12, w:20,h:58,col:C.blue },
        {x:126,y:10, w:22,h:62,col:C.green},
        {x:154,y:10, w:22,h:62,col:C.indigo},
      ].map((b,i)=>(
        <g key={i}>
          <rect x={b.x} y={b.y} width={b.w} height={b.h} rx="3"
            fill={`${b.col}15`} stroke={b.col} strokeWidth="0.7" strokeOpacity="0.55"/>
          <rect x={b.x+b.w/2-10} y={b.y+b.h+3} width="20" height="6" rx="3"
            fill="rgba(0,0,0,0.8)" stroke={`${b.col}50`} strokeWidth="0.4"/>
        </g>
      ))}
      <rect x="4" y="4" width="88" height="10" rx="3" fill="rgba(0,0,0,0.55)"/>
      {[C.blue,C.amber,C.green,C.red].map((col,i)=>(
        <g key={i}><circle cx={10+i*22} cy="9" r="2.5" fill={col}/>
          <rect x={14+i*22} y="6.5" width="12" height="4" rx="1" fill="rgba(255,255,255,0.14)"/></g>
      ))}
    </svg>
  ),
  "/marmoleria": ({c}) => (
    <svg viewBox="0 0 200 110" fill="none">
      <rect width="200" height="110" fill="#09090b"/>
      <rect width="200" height="20" fill="rgba(255,255,255,0.03)"/>
      <rect x="8" y="6" width="55" height="8" rx="2" fill="rgba(255,255,255,0.12)"/>
      {[0,1,2,3,4,5].map(i=>(
        <g key={i}>
          <rect x={8+(i%3)*63} y={24+Math.floor(i/3)*42} width="57" height="38" rx="4"
            fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.07)" strokeWidth="0.5"/>
          {[0,1,2].map(j=>(
            <g key={j}>
              <rect x={12+(i%3)*63} y={30+Math.floor(i/3)*42+j*9} width="44" height="3" rx="1" fill="rgba(255,255,255,0.05)"/>
              <rect x={12+(i%3)*63} y={30+Math.floor(i/3)*42+j*9} width={[38,22,44,30,16,42][i]} height="3" rx="1" fill={`${c}65`}/>
            </g>
          ))}
          <circle cx={57+(i%3)*63} cy={28+Math.floor(i/3)*42} r="2.5"
            fill={[C.blue,C.green,C.amber,C.blue,C.green,C.green][i]}/>
        </g>
      ))}
    </svg>
  ),
  "/muebles": ({c}) => (
    <svg viewBox="0 0 200 110" fill="none">
      <rect width="200" height="110" fill="#09090b"/>
      <rect width="200" height="20" fill="rgba(255,255,255,0.03)"/>
      <rect x="8" y="6" width="45" height="8" rx="2" fill="rgba(255,255,255,0.12)"/>
      <rect x="8" y="24" width="64" height="82" rx="4" fill="rgba(255,255,255,0.025)" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5"/>
      {[0,1,2,3,4].map(i=>(
        <g key={i}>
          <rect x="10" y={28+i*15} width="60" height="12" rx="2" fill={i===1?"rgba(255,255,255,0.05)":"transparent"}/>
          <rect x="14" y={31+i*15} width="30" height="4" rx="1" fill="rgba(255,255,255,0.18)"/>
          <circle cx="65" cy={34+i*15} r="2" fill={[C.blue,C.amber,C.green,C.blue,C.green][i]}/>
        </g>
      ))}
      <rect x="78" y="24" width="114" height="82" rx="4" fill="rgba(255,255,255,0.025)" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5"/>
      {[0,1,2,3,4,5].map(i=>(
        <g key={i}>
          <rect x="82" y={28+i*12} width="7" height="7" rx="1"
            fill={i<3?`${C.green}30`:"rgba(255,255,255,0.04)"} stroke={i<3?C.green:"rgba(255,255,255,0.1)"} strokeWidth="0.6"/>
          {i<3&&<path d={`M84,${31.5+i*12} l2,2 l3,-3`} stroke={C.green} strokeWidth="0.9" strokeLinecap="round"/>}
          <rect x="94" y={30+i*12} width={[58,48,68,44,52,38][i]} height="4" rx="1" fill="rgba(255,255,255,0.1)"/>
        </g>
      ))}
    </svg>
  ),
  "/obras-laminacion": ({c}) => (
    <svg viewBox="0 0 200 110" fill="none">
      <rect width="200" height="110" fill="#09090b"/>
      <rect width="200" height="20" fill="rgba(255,255,255,0.03)"/>
      <rect x="8" y="6" width="65" height="8" rx="2" fill="rgba(255,255,255,0.12)"/>
      {[0,1,2,3,4].map(i=>(
        <g key={i}>
          <rect x="8" y={24+i*18} width="184" height="15" rx="3"
            fill={i===1?"rgba(255,255,255,0.04)":"rgba(255,255,255,0.02)"} stroke="rgba(255,255,255,0.06)" strokeWidth="0.5"/>
          <rect x="14" y={28+i*18} width="28" height="5" rx="1" fill={`${c}85`}/>
          <rect x="48" y={28+i*18} width="80" height="5" rx="2" fill="rgba(255,255,255,0.04)"/>
          <rect x="48" y={28+i*18} width={[58,38,72,18,50][i]} height="5" rx="2" fill={`${c}55`}/>
          <rect x="136" y={28+i*18} width="30" height="5" rx="1" fill="rgba(255,255,255,0.08)"/>
        </g>
      ))}
    </svg>
  ),
  "/admin": ({c}) => (
    <svg viewBox="0 0 200 110" fill="none">
      <rect width="200" height="110" fill="#09090b"/>
      {[{col:C.green,n:82},{col:C.amber,n:14},{col:C.red,n:6},{col:c,n:28}].map((k,i)=>(
        <g key={i}>
          <rect x={4+i*48} y="6" width="44" height="32" rx="5"
            fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.07)" strokeWidth="0.5"/>
          <circle cx={26+i*48} cy="22" r="9" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="2.5"/>
          <circle cx={26+i*48} cy="22" r="9" fill="none" stroke={k.col} strokeWidth="2.5"
            strokeDasharray={`${k.n*0.565} 56.5`} strokeLinecap="round"
            style={{transformOrigin:`${26+i*48}px 22px`,transform:"rotate(-90deg)"}}/>
          <text x={26+i*48} y="24" textAnchor="middle" fill={k.col} fontSize="6" fontFamily="monospace" fontWeight="700">{k.n}</text>
        </g>
      ))}
      {[0,1,2,3,4].map(i=>(
        <g key={i}>
          <rect x="4" y={44+i*13} width="192" height="11" rx="2" fill={i%2===0?"rgba(255,255,255,0.025)":"transparent"}/>
          <rect x="8"  y={47+i*13} width="55" height="4" rx="1" fill="rgba(255,255,255,0.18)"/>
          <rect x="70" y={47+i*13} width="25" height="4" rx="1" fill="rgba(255,255,255,0.07)"/>
          <rect x="102" y={46+i*13} width="20" height="6" rx="3"
            fill={[`${C.green}30`,`${C.amber}30`,`${C.red}30`,`${C.green}30`,`${C.amber}30`][i]}/>
          <rect x="130" y={47+i*13} width="16" height="4" rx="1" fill="rgba(255,255,255,0.12)"/>
          <rect x="154" y={47+i*13} width="14" height="4" rx="1" fill="rgba(255,255,255,0.07)"/>
        </g>
      ))}
    </svg>
  ),
  "/movimientos": ({c}) => (
    <svg viewBox="0 0 200 110" fill="none">
      <rect width="200" height="110" fill="#09090b"/>
      <rect width="200" height="20" fill="rgba(255,255,255,0.03)"/>
      <rect x="8" y="6" width="55" height="8" rx="2" fill="rgba(255,255,255,0.12)"/>
      <rect x="8" y="24" width="90" height="56" rx="4" fill="rgba(255,255,255,0.025)" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5"/>
      {[0,1,2,3,4,5,6].map(i=>(
        <g key={i}>
          <rect x={14+i*11} y={74-[18,32,13,42,28,22,38][i]} width="4" height={[18,32,13,42,28,22,38][i]} rx="1" fill={`${C.green}65`}/>
          <rect x={18+i*11} y={74-[10,20,8,28,16,12,25][i]} width="4" height={[10,20,8,28,16,12,25][i]} rx="1" fill={`${C.red}65`}/>
        </g>
      ))}
      {[0,1,2,3,4].map(i=>(
        <g key={i}>
          <rect x="104" y={24+i*15} width="88" height="12" rx="2" fill={i%2===0?"rgba(255,255,255,0.025)":"transparent"}/>
          <rect x="106" y={27+i*15} width="14" height="6" rx="3" fill={i%2===0?`${C.green}25`:`${C.red}25`}/>
          <rect x="124" y={28+i*15} width="30" height="4" rx="1" fill="rgba(255,255,255,0.14)"/>
          <rect x="162" y={28+i*15} width="22" height="4" rx="1" fill="rgba(255,255,255,0.08)"/>
        </g>
      ))}
    </svg>
  ),
  "/pedidos": ({c}) => (
    <svg viewBox="0 0 200 110" fill="none">
      <rect width="200" height="110" fill="#09090b"/>
      <rect width="200" height="20" fill="rgba(255,255,255,0.03)"/>
      <rect x="8" y="6" width="40" height="8" rx="2" fill="rgba(255,255,255,0.12)"/>
      {[{l:"Pendiente",col:C.amber},{l:"En camino",col:c},{l:"Recibida",col:C.green}].map((s,i)=>(
        <rect key={i} x={8+i*62} y="24" width="56" height="9" rx="4" fill={`${s.col}15`} stroke={s.col} strokeWidth="0.5"/>
      ))}
      {[0,1,2,3,4].map(i=>(
        <g key={i}>
          <rect x="8" y={38+i*14} width="184" height="12" rx="3"
            fill="rgba(255,255,255,0.025)" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5"/>
          <circle cx="14" cy={44+i*14} r="3" fill={[C.red,C.amber,C.green,C.blue,C.amber][i]}/>
          <rect x="20" y={41+i*14} width="44" height="4" rx="1" fill="rgba(255,255,255,0.18)"/>
          <rect x="20" y={46+i*14} width="28" height="3" rx="1" fill="rgba(255,255,255,0.07)"/>
          <rect x="100" y={42+i*14} width="30" height="5" rx="2"
            fill={[`${C.red}25`,`${C.amber}25`,`${C.green}25`,`${C.blue}25`,`${C.amber}25`][i]}/>
          <rect x="148" y={41+i*14} width="20" height="4" rx="1" fill="rgba(255,255,255,0.1)"/>
        </g>
      ))}
    </svg>
  ),
  "/postventa": ({c}) => (
    <svg viewBox="0 0 200 110" fill="none">
      <rect width="200" height="110" fill="#09090b"/>
      <rect width="200" height="20" fill="rgba(255,255,255,0.03)"/>
      <rect x="8" y="6" width="70" height="8" rx="2" fill="rgba(255,255,255,0.12)"/>
      {[0,1,2,3,4,5].map(i=>(
        <g key={i}>
          <rect x={8+(i%3)*63} y={24+Math.floor(i/3)*42} width="57" height="38" rx="5"
            fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.07)" strokeWidth="0.5"/>
          <rect x={22+(i%3)*63} y={28+Math.floor(i/3)*42} width="16" height="24" rx="3"
            fill={`${c}18`} stroke={c} strokeWidth="0.6"/>
          <rect x={10+(i%3)*63} y={55+Math.floor(i/3)*42} width="38" height="4" rx="1" fill="rgba(255,255,255,0.14)"/>
          <circle cx={57+(i%3)*63} cy={28+Math.floor(i/3)*42} r="2.5"
            fill={[C.green,C.green,C.amber,C.green,C.blue,C.green][i]}/>
        </g>
      ))}
    </svg>
  ),
  "/configuracion": ({c}) => (
    <svg viewBox="0 0 200 110" fill="none">
      <rect width="200" height="110" fill="#09090b"/>
      <rect width="200" height="20" fill="rgba(255,255,255,0.03)"/>
      <rect x="8" y="6" width="60" height="8" rx="2" fill="rgba(255,255,255,0.12)"/>
      <rect x="8" y="24" width="52" height="82" rx="4" fill="rgba(255,255,255,0.025)" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5"/>
      {["Usuarios","Config","Modelos","Barcos"].map((s,i)=>(
        <g key={i}>
          <rect x="10" y={28+i*18} width="48" height="14" rx="3" fill={i===0?`${c}18`:"transparent"}/>
          <rect x="14" y={32+i*18} width="26" height="4" rx="1" fill={i===0?"rgba(255,255,255,0.5)":"rgba(255,255,255,0.12)"}/>
        </g>
      ))}
      <rect x="66" y="24" width="126" height="82" rx="4" fill="rgba(255,255,255,0.025)" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5"/>
      {[0,1,2,3,4].map(i=>(
        <g key={i}>
          <circle cx="78" cy={34+i*15} r="5" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.1)" strokeWidth="0.5"/>
          <rect x="87" y={30+i*15} width="35" height="4" rx="1" fill="rgba(255,255,255,0.18)"/>
          <rect x="87" y={36+i*15} width="22" height="3" rx="1" fill="rgba(255,255,255,0.07)"/>
          <rect x="134" y={31+i*15} width="24" height="6" rx="3"
            fill={[`${c}25`,`${C.blue}25`,"rgba(255,255,255,0.07)",`${C.green}25`,"rgba(255,255,255,0.07)"][i]}/>
          <circle cx="180" cy={34+i*15} r="2.5"
            fill={[C.green,C.green,"rgba(255,255,255,0.18)",C.green,"rgba(255,255,255,0.18)"][i]}/>
        </g>
      ))}
    </svg>
  ),
  "/procedimientos": ({c}) => (
    <svg viewBox="0 0 200 110" fill="none">
      <rect width="200" height="110" fill="#09090b"/>
      <rect width="200" height="20" fill="rgba(255,255,255,0.03)"/>
      <rect x="8" y="6" width="65" height="8" rx="2" fill="rgba(255,255,255,0.12)"/>
      {[0,1,2,3,4].map(i=>(
        <g key={i}>
          <rect x="8" y={24+i*17} width="184" height="14" rx="3"
            fill={i===1?"rgba(255,255,255,0.04)":"rgba(255,255,255,0.02)"} stroke="rgba(255,255,255,0.05)" strokeWidth="0.5"/>
          <rect x="12" y={27+i*17} width="8" height="9" rx="1" fill={`${c}28`} stroke={c} strokeWidth="0.5"/>
          <rect x="13.5" y={29+i*17} width="5" height="1.5" rx="0.5" fill={c}/>
          <rect x="13.5" y={31.5+i*17} width="5" height="1.5" rx="0.5" fill={c} fillOpacity="0.6"/>
          <rect x="24" y={27+i*17} width={[68,88,52,78,62][i]} height="5" rx="1" fill="rgba(255,255,255,0.2)"/>
          <rect x="24" y={34+i*17} width={[38,48,28,52,40][i]} height="3" rx="1" fill="rgba(255,255,255,0.07)"/>
          <rect x={[110,128,98,118,108][i]} y={28+i*17} width="20" height="6" rx="3" fill={`${c}18`} stroke={`${c}40`} strokeWidth="0.4"/>
        </g>
      ))}
    </svg>
  ),
};

// ─── HOOKS ─────────────────────────────────────────────────────
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

// ─── TYPEWRITER ────────────────────────────────────────────────
function Typewriter({ text, delay = 0, speed = 38 }) {
  const [shown, setShown] = useState("");
  const [started, setStarted] = useState(false);
  useEffect(()=>{
    const t0 = setTimeout(()=>setStarted(true), delay);
    return ()=>clearTimeout(t0);
  },[delay]);
  useEffect(()=>{
    if(!started) return;
    if(shown.length >= text.length) return;
    const id = setTimeout(()=>setShown(text.slice(0, shown.length+1)), speed);
    return ()=>clearTimeout(id);
  },[started, shown, text, speed]);
  return (
    <span>
      {shown}
      {shown.length < text.length && started && (
        <span style={{ animation:"cursorBlink .7s step-end infinite", borderRight:`1.5px solid currentColor`, marginLeft:1 }}/>
      )}
    </span>
  );
}

// ─── NÚMERO ANIMADO ────────────────────────────────────────────
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

// ─── KPI RING ──────────────────────────────────────────────────
function Ring({ value, total, color, size=52, label, delay=0 }) {
  const pct = total>0 ? Math.min(value/total,1) : 0;
  const r = (size-6)/2;
  const circ = 2*Math.PI*r;
  const [animated, setAnimated] = useState(false);
  useEffect(()=>{ const t=setTimeout(()=>setAnimated(true), delay+200); return()=>clearTimeout(t); },[delay]);
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6,
      animation:`fadeSlideUp 0.5s ease ${delay}ms both` }}>
      <div style={{ position:"relative", width:size, height:size }}>
        <svg width={size} height={size} style={{transform:"rotate(-90deg)", display:"block"}}>
          <circle cx={size/2} cy={size/2} r={r} fill="none"
            stroke="rgba(255,255,255,0.05)" strokeWidth="3.5"/>
          <circle cx={size/2} cy={size/2} r={r} fill="none"
            stroke={color} strokeWidth="3.5" strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={animated ? circ*(1-pct) : circ}
            style={{ transition:"stroke-dashoffset 1.4s cubic-bezier(0.22,1,0.36,1)", filter:`drop-shadow(0 0 4px ${color}88)` }}/>
        </svg>
        <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center",
          justifyContent:"center", fontFamily:C.mono, fontSize:12, fontWeight:700, color }}>
          <AnimNum to={value} color={color}/>
        </div>
      </div>
      <span style={{ fontSize:8.5, color:C.t2, letterSpacing:2, textTransform:"uppercase", fontFamily:C.mono }}>
        {label}
      </span>
    </div>
  );
}

// ─── PARTICLES CANVAS ──────────────────────────────────────────
function Particles() {
  const ref = useRef(null);
  useEffect(()=>{
    const canvas = ref.current; if(!canvas) return;
    const ctx = canvas.getContext("2d");
    let W, H, raf;
    const resize = ()=>{
      W = canvas.width  = canvas.offsetWidth;
      H = canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener("resize", resize);
    const N = 55;
    const pts = Array.from({length:N}, ()=>({
      x:Math.random()*W, y:Math.random()*H,
      vx:(Math.random()-.5)*.2, vy:(Math.random()-.5)*.2,
      r:Math.random()*1.1+.3,
    }));
    const draw = ()=>{
      ctx.clearRect(0,0,W,H);
      for(let i=0;i<N;i++) for(let j=i+1;j<N;j++){
        const dx=pts[i].x-pts[j].x, dy=pts[i].y-pts[j].y;
        const d=Math.sqrt(dx*dx+dy*dy);
        if(d<140){ ctx.beginPath(); ctx.moveTo(pts[i].x,pts[i].y); ctx.lineTo(pts[j].x,pts[j].y);
          ctx.strokeStyle=`rgba(255,255,255,${.022*(1-d/140)})`; ctx.lineWidth=.5; ctx.stroke(); }
      }
      pts.forEach(p=>{
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
        ctx.fillStyle="rgba(255,255,255,0.2)"; ctx.fill();
        p.x+=p.vx; p.y+=p.vy;
        if(p.x<0||p.x>W) p.vx*=-1;
        if(p.y<0||p.y>H) p.vy*=-1;
      });
      raf=requestAnimationFrame(draw);
    };
    draw();
    return()=>{ cancelAnimationFrame(raf); window.removeEventListener("resize",resize); };
  },[]);
  return <canvas ref={ref} style={{ position:"absolute", inset:0, width:"100%", height:"100%", pointerEvents:"none", opacity:.55 }}/>;
}

// ─── TICKER ────────────────────────────────────────────────────
function Ticker({ items }) {
  return (
    <div style={{ flexShrink:0, height:26, borderTop:`1px solid ${C.b0}`,
      overflow:"hidden", display:"flex", alignItems:"center",
      background:"rgba(0,0,0,0.35)", backdropFilter:"blur(8px)" }}>
      <div style={{ padding:"0 12px", borderRight:`1px solid ${C.b0}`, height:"100%",
        display:"flex", alignItems:"center", flexShrink:0 }}>
        <span style={{ fontSize:8, fontFamily:C.mono, color:C.t2, letterSpacing:2 }}>LIVE</span>
      </div>
      <div style={{ overflow:"hidden", flex:1 }}>
        <div style={{ display:"flex", whiteSpace:"nowrap", animation:"tickerScroll 32s linear infinite" }}>
          {[...items,...items].map((it,i)=>(
            <span key={i} style={{ display:"inline-flex", alignItems:"center", gap:7,
              fontFamily:C.mono, fontSize:9, color:C.t1, paddingRight:40 }}>
              <span style={{ color:it.color, fontSize:5 }}>◆</span>
              <span style={{ color:C.t2 }}>{it.label.toUpperCase()}</span>
              <span style={{ color:it.color, fontWeight:700 }}>{it.value}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── CARD CON RIPPLE + TOOLTIP FLOTANTE ────────────────────────
function Card({ mod, delay, onClick }) {
  const [hov, setHov]       = useState(false);
  const [ripple, setRipple] = useState(null);
  const [tip, setTip]       = useState(null);
  const btnRef              = useRef(null);
  const tipTimeout          = useRef(null);
  const Preview             = PREVIEWS[mod.href];

  const showTip = () => {
    clearTimeout(tipTimeout.current);
    const el = btnRef.current; if (!el) return;
    const r  = el.getBoundingClientRect();
    const TW = 370, TH = 270;
    const spaceRight = window.innerWidth - r.right - 12;
    const side = spaceRight >= TW ? "right" : "left";
    const x    = side === "right" ? r.right + 10 : r.left - TW - 10;
    const yRaw = r.top + r.height / 2 - TH / 2;
    const y    = Math.max(8, Math.min(yRaw, window.innerHeight - TH - 8));
    setTip({ x, y, side });
    setHov(true);
  };

  const hideTip = () => {
    tipTimeout.current = setTimeout(() => { setTip(null); setHov(false); }, 80);
  };

  const handleClick = e => {
    const rect = e.currentTarget.getBoundingClientRect();
    setRipple({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setTimeout(() => setRipple(null), 600);
    setTip(null); setHov(false);
    onClick();
  };

  useEffect(() => () => clearTimeout(tipTimeout.current), []);

  return (
    <>
      <button
        ref={btnRef}
        onMouseEnter={showTip}
        onMouseLeave={hideTip}
        onClick={handleClick}
        style={{
          display:"flex", flexDirection:"column",
          background: hov ? C.s1 : C.s0,
          border:`1px solid ${hov ? mod.color+"55" : C.b0}`,
          borderRadius:12, cursor:"pointer", textAlign:"left",
          fontFamily:C.sans, padding:0, overflow:"hidden",
          transition:"all 0.2s cubic-bezier(0.22,1,0.36,1)",
          transform: hov ? "translateY(-3px) scale(1.012)" : "none",
          boxShadow: hov
            ? `0 18px 45px rgba(0,0,0,0.45), 0 0 0 1px ${mod.color}20`
            : "0 2px 10px rgba(0,0,0,0.3)",
          animation:`cardIn 0.55s cubic-bezier(0.22,1,0.36,1) ${delay}ms both`,
          position:"relative",
        }}
      >
        {ripple && (
          <div style={{ position:"absolute", left:ripple.x-60, top:ripple.y-60,
            width:120, height:120, borderRadius:"50%",
            background:`${mod.color}25`, pointerEvents:"none",
            animation:"rippleAnim 0.55s ease-out forwards", zIndex:20 }}/>
        )}

        {/* Preview mini */}
        <div style={{ position:"relative", overflow:"hidden",
          borderBottom:`1px solid ${hov ? mod.color+"28" : C.b0}`, transition:"border-color 0.2s" }}>
          {Preview && <Preview c={mod.color}/>}
          <div style={{ position:"absolute", inset:0,
            background:`linear-gradient(to bottom, transparent 45%, ${C.bg} 100%)`, pointerEvents:"none" }}/>
          <div style={{ position:"absolute", inset:0, background:`${mod.color}06`,
            opacity:hov?1:0, transition:"opacity 0.2s", pointerEvents:"none" }}/>
          <div style={{ position:"absolute", top:8, right:8, width:7, height:7,
            borderRadius:"50%", background:mod.color,
            boxShadow: hov ? `0 0 14px ${mod.color}, 0 0 28px ${mod.color}55` : `0 0 6px ${mod.color}70`,
            transition:"box-shadow 0.2s" }}/>
        </div>

        {/* Texto */}
        <div style={{ padding:"12px 15px 13px", display:"flex", flexDirection:"column", gap:4 }}>
          <div style={{ fontSize:13, fontWeight:700, color:hov?"#fff":C.t0,
            transition:"color 0.15s", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            {mod.label}
            <span style={{ fontSize:13, color:hov?mod.color:C.t2, transition:"all 0.15s",
              transform:hov?"translateX(3px)":"none" }}>→</span>
          </div>
          <div style={{ fontSize:11, color:hov?C.t1:C.t2, lineHeight:1.5, transition:"color 0.15s" }}>
            {mod.desc}
          </div>
        </div>
      </button>

      {/* ── TOOLTIP FLOTANTE (position fixed, fuera del flujo) ── */}
      {tip && Preview && (
        <div
          onMouseEnter={() => { clearTimeout(tipTimeout.current); setHov(true); }}
          onMouseLeave={hideTip}
          style={{
            position:"fixed", left:tip.x, top:tip.y,
            width:370, zIndex:9999,
            background:"rgba(9,9,12,0.97)",
            border:`1px solid ${mod.color}40`,
            borderRadius:14,
            boxShadow:`0 30px 75px rgba(0,0,0,0.8), 0 0 0 1px ${mod.color}15, 0 0 50px ${mod.color}10`,
            overflow:"hidden",
            animation:"tooltipIn 0.17s cubic-bezier(0.22,1,0.36,1) both",
            transformOrigin: tip.side === "right" ? "left center" : "right center",
            backdropFilter:"blur(24px)",
          }}
        >
          {/* Línea accent top */}
          <div style={{ height:2,
            background:`linear-gradient(90deg, ${mod.color}, ${mod.color}50, transparent)`,
            boxShadow:`0 0 10px ${mod.color}80` }}/>

          {/* Header */}
          <div style={{ padding:"10px 14px 8px",
            display:"flex", alignItems:"center", justifyContent:"space-between",
            borderBottom:"1px solid rgba(255,255,255,0.055)" }}>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <div style={{ width:7, height:7, borderRadius:"50%",
                background:mod.color, boxShadow:`0 0 10px ${mod.color}` }}/>
              <span style={{ fontSize:12, fontWeight:700, color:"#fff", letterSpacing:".2px" }}>
                {mod.label}
              </span>
            </div>
            <span style={{ fontSize:8, color:mod.color, fontFamily:C.mono,
              letterSpacing:2, textTransform:"uppercase",
              background:`${mod.color}12`, padding:"2px 8px", borderRadius:4,
              border:`1px solid ${mod.color}22` }}>
              Vista previa
            </span>
          </div>

          {/* SVG preview ampliado */}
          <div style={{ position:"relative", overflow:"hidden", height:190 }}>
            <div style={{
              transform:"scale(1.82)",
              transformOrigin:"top left",
              width:"54.9%",  /* 100/1.82 */
              pointerEvents:"none",
            }}>
              <Preview c={mod.color}/>
            </div>
            {/* gradientes para fundir bordes */}
            <div style={{ position:"absolute", inset:0, pointerEvents:"none",
              background:`linear-gradient(to bottom, transparent 50%, rgba(9,9,12,0.96) 100%)` }}/>
            <div style={{ position:"absolute", inset:0, pointerEvents:"none",
              background:`linear-gradient(to right, transparent 60%, rgba(9,9,12,0.75) 100%)` }}/>
          </div>

          {/* Footer */}
          <div style={{ padding:"7px 14px 10px",
            display:"flex", alignItems:"center", justifyContent:"space-between",
            borderTop:"1px solid rgba(255,255,255,0.05)" }}>
            <span style={{ fontSize:10, color:C.t2, lineHeight:1.4, flex:1 }}>
              {mod.desc}
            </span>
            <span style={{ fontSize:9, color:mod.color, fontFamily:C.mono,
              whiteSpace:"nowrap", marginLeft:10, opacity:.8 }}>
              Click para abrir →
            </span>
          </div>
        </div>
      )}
    </>
  );
}

// ─── MAIN ──────────────────────────────────────────────────────
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
          <div className="hs-scroll" style={{ flex:1, overflowY:"auto",
            padding:"20px 28px 28px", position:"relative", zIndex:1 }}>

            <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:14,
              animation:"fadeSlideUp 0.4s ease 0.26s both" }}>
              <span style={{ fontSize:9, color:C.t2, letterSpacing:3,
                textTransform:"uppercase", fontFamily:C.mono }}>Acceso rápido</span>
              <div style={{ flex:1, height:1,
                background:`linear-gradient(90deg,${C.b0},transparent)` }}/>
            </div>

            <div style={{
              display:"grid",
              gridTemplateColumns:"repeat(auto-fill, minmax(210px, 1fr))",
              gap:10,
            }}>
              {modulos.map((mod,i) => (
                <Card key={mod.href} mod={mod} delay={i*42}
                  onClick={()=>navigate(mod.href)}/>
              ))}
            </div>

            <div style={{ marginTop:20, paddingTop:14,
              borderTop:"1px solid rgba(255,255,255,0.04)",
              display:"flex", justifyContent:"space-between",
              animation:`fadeSlideUp 0.4s ease ${modulos.length*42+60}ms both` }}>
              <span style={{ fontSize:9, color:"rgba(255,255,255,0.09)",
                fontFamily:C.mono, letterSpacing:2 }}>KLASE A · ASTILLERO</span>
              <span style={{ fontSize:9, color:"rgba(255,255,255,0.09)",
                fontFamily:C.mono }}>v9.0</span>
            </div>
          </div>

          {/* ── TICKER ── */}
          {live.loaded && <Ticker items={tickerItems}/>}
        </div>
      </div>
    </>
  );
}
