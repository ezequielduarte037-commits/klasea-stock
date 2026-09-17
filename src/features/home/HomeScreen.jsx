/**
 * HomeScreen — el inicio del personal interno.
 *
 * Arriba, una franja con el oleaje de la marca, la fecha, el saludo y los
 * números que importan (obras y stock crítico), que llevan a su pantalla.
 * Abajo, los módulos que le tocan a cada rol.
 *
 * Antes era la "Full Animation Edition": partículas en canvas, logo con un
 * brillo animado con filter, reloj con segundos (redibujaba toda la pantalla
 * cada segundo), una línea de escaneo, un ticker que se encimaba en el celular
 * y tarjetas con inclinación 3D, ondas y esquinas animadas. Siete animaciones
 * que no paraban nunca en una pantalla que queda abierta todo el día. Ahora el
 * único movimiento continuo es el agua, y se frena sola cuando nadie usa la PC.
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Anchor, Armchair, ArrowLeftRight, BarChart3, BookOpen, ClipboardList, Gem, Layers,
  LayoutList, NotebookText, PackageCheck, Route, Settings, Ship, ShoppingCart, TreePine, Truck, Wrench,
} from "lucide-react";
import { supabase } from "@/supabaseClient";
import { hasAdminAccess } from "@/lib/permissions";
import { fechaLarga, primerNombre, saludoSegunHora } from "@/lib/saludo";
import { useAhora } from "@/hooks/useAhora";
import { BuscarPortada, Indicador, Portada, PortadaHero, SeccionPortada, TarjetaModulo } from "@/components/ui/Portada";

// ─── MÓDULOS ───────────────────────────────────────────────────
const MODULOS = [
  { href:"/torneria",         label:"Tornería",          desc:"Materiales de Mecánica, talleres y regresos parciales", tono:"azul",    Icono:Wrench,         roles:["mecanica","tecnica","oficina","admin","compras"] },
  { href:"/panol",            label:"Maderas",           desc:"Ingresos, egresos y stock de madera",                    tono:"teal",    Icono:TreePine,       roles:["panol","oficina","admin"] },
  { href:"/laminacion",       label:"Laminación",        desc:"Stock y movimientos de materiales de laminación",        tono:"verde",   Icono:Layers,         roles:["panol","oficina","admin","laminacion"] },
  { href:"/obras",            label:"Obras",             desc:"Mapa de producción y estado de barcos",                  tono:"azul",    Icono:Ship,           roles:["oficina","admin"] },
  { href:"/memorias",         label:"Memorias",          desc:"Memorias descriptivas activas por barco",                tono:"azul",    Icono:NotebookText,   roles:["oficina","admin"] },
  { href:"/marmoleria",       label:"Marmolería",        desc:"Seguimiento de piezas y líneas de mármol",               tono:"azul",    Icono:Gem,            roles:["oficina","admin"] },
  { href:"/muebles",          label:"Muebles",           desc:"Fabricación, enchapado, herrajes y recepción",           tono:"azul",    Icono:Armchair,       roles:["oficina","admin","muebles","compras"] },
  { href:"/obras-laminacion", label:"Por Obra",          desc:"Laminación desglosada por obra",                         tono:"verde",   Icono:LayoutList,     roles:["oficina","admin"] },
  { href:"/admin",            label:"Inventario",        desc:"KPIs de stock y alertas de materiales de madera",        tono:"teal",    Icono:BarChart3,      roles:["oficina","admin"] },
  { href:"/movimientos",      label:"Movimientos",       desc:"Ingresos y egresos de maderas del depósito",             tono:"teal",    Icono:ArrowLeftRight, roles:["oficina","admin"] },
  { href:"/pedidos",          label:"Pedidos",           desc:"Órdenes de compra de materiales de madera",              tono:"teal",    Icono:ClipboardList,  roles:["oficina","admin"] },
  { href:"/compras",          label:"Compras",           desc:"Solicitudes internas y seguimiento de compras",          tono:"violeta", Icono:ShoppingCart,   roles:["panol","oficina","admin","compras"] },
  { href:"/cadete",           label:"Hoja de ruta",      desc:"Rutas del cadete: paradas, retiros y su caja chica",     tono:"violeta", Icono:Route,          roles:["oficina","admin","compras"] },
  { href:"/calendario",       label:"Logística",         desc:"Solicitudes, coordinación y agenda de transportes",      tono:"violeta", Icono:Truck,          roles:["admin","tecnica","administracion","compras"] },
  { href:"/recepcion-panol",  label:"Recepción y egresos", desc:"Envíos a pañol: recepción, faltantes, egresos y seguimiento por sede", tono:"cian",    Icono:PackageCheck, roles:["panol","oficina","admin","compras"] },
  { href:"/postventa",        label:"Barcos Entregados", desc:"Post venta y flota en el agua",                          tono:"cian",    Icono:Anchor,         roles:["oficina","admin"] },
  { href:"/configuracion",    label:"Configuración",     desc:"Usuarios, roles y configuración",                        tono:"rojo",    Icono:Settings,       roles:["admin"] },
  { href:"/procedimientos",   label:"Procedimientos",    desc:"Instructivos y guías de operación",                      tono:"neutro",  Icono:BookOpen,       roles:["panol","oficina","admin","laminacion","muebles","mecanica","electricidad"] },
];

const MODULE_ROLE_OVERRIDES = {
  "/panol": ["panol", "tecnica", "oficina", "admin"],
  "/laminacion": ["panol", "tecnica", "oficina", "admin", "laminacion"],
  "/obras": ["tecnica", "oficina", "admin"],
  "/memorias": ["tecnica", "oficina", "admin"],
  "/marmoleria": ["tecnica", "oficina", "admin"],
  "/muebles": ["tecnica", "oficina", "admin", "muebles", "compras"],
  "/obras-laminacion": ["tecnica", "oficina", "admin"],
  "/admin": ["tecnica", "oficina", "admin"],
  "/movimientos": ["tecnica", "oficina", "admin"],
  "/pedidos": ["tecnica", "oficina", "admin"],
  "/compras": ["panol", "tecnica", "oficina", "admin", "compras"],
  "/calendario": ["tecnica", "administracion", "admin", "compras"],
  "/recepcion-panol": ["panol", "tecnica", "oficina", "admin", "compras"],
  "/postventa": ["tecnica", "oficina", "admin"],
  "/procedimientos": ["tecnica", "oficina", "admin", "laminacion", "muebles", "mecanica", "electricidad"],
};

MODULOS.forEach((modulo) => {
  if (MODULE_ROLE_OVERRIDES[modulo.href]) modulo.roles = MODULE_ROLE_OVERRIDES[modulo.href];
  if (modulo.href === "/compras") modulo.label = "Pedidos a Compras";
});

// ─── ILUSTRACIONES POR MÓDULO ─────────────────────────────────
// Cada una es un SVG abstracto que representa visualmente el módulo. Se
// dibujan con currentColor: la tarjeta les pone el color de su área.
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

// ─── DATOS EN VIVO ─────────────────────────────────────────────
function useLiveData() {
  const [data, setData] = useState({ activas:0, pausadas:0, terminadas:0, criticos:0, loaded:false });
  const load = useCallback(async () => {
    try {
      const [activas, pausadas, terminadas, criticos] = await Promise.all([
        supabase.from("produccion_obras").select("id", { count: "exact", head: true }).eq("estado", "activa"),
        supabase.from("produccion_obras").select("id", { count: "exact", head: true }).eq("estado", "pausada"),
        supabase.from("produccion_obras").select("id", { count: "exact", head: true }).eq("estado", "terminada"),
        supabase.from("materiales_kpi").select("estado_ui", { count: "exact", head: true }).eq("estado_ui", "CRITICO"),
      ]);
      setData({
        activas: activas.count ?? 0,
        pausadas: pausadas.count ?? 0,
        terminadas: terminadas.count ?? 0,
        criticos: criticos.count ?? 0,
        loaded: true,
      });
    } catch { setData(d=>({...d, loaded:true})); }
  }, []);
  useEffect(()=>{
    const firstLoad = setTimeout(load, 0);
    const handleVisible = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", handleVisible);
    const id=setInterval(()=>{ if (document.visibilityState === "visible") void load(); },5*60*1000);
    return()=>{ clearTimeout(firstLoad); clearInterval(id); document.removeEventListener("visibilitychange", handleVisible); };
  }, [load]);
  return data;
}

export default function HomeScreen({ profile }) {
  const navigate = useNavigate();
  const live = useLiveData();
  // El saludo cambia con la hora del día; alcanza con revisarlo cada 10 minutos
  // (antes un reloj con segundos redibujaba toda la pantalla cada segundo).
  const ahora = useAhora();

  const role      = profile?.role ?? "invitado";
  const esDemo    = profile?.is_demo === true;
  const isAdmin   = hasAdminAccess(profile);
  const esTecnica = role==="tecnica" || role==="oficina" || esDemo;
  const esAdmin   = isAdmin || role==="admin";
  const esPanol   = role==="panol";
  const esCompras = role==="compras";

  const modulos = MODULOS.filter(m=>{
    if(esAdmin)   return true;
    if(esTecnica) return m.roles.includes("tecnica") || m.roles.includes("oficina");
    if(esPanol)   return m.roles.includes("panol");
    if(esCompras) return m.roles.includes("compras");
    return m.roles.includes(role);
  });
  const puedeIr = (href) => modulos.some((m) => m.href === href);

  const saludo = saludoSegunHora(ahora);
  const nombre = primerNombre(profile?.username);
  const fecha = fechaLarga(ahora);

  const cargando = !live.loaded;
  const indicadores = [
    { clave: "activas", label: "Obras activas", valor: live.activas, tono: "azul", href: "/obras" },
    { clave: "pausadas", label: "Pausadas", valor: live.pausadas, tono: "violeta", href: "/obras" },
    { clave: "terminadas", label: "Terminadas", valor: live.terminadas, tono: "verde", href: "/obras" },
    { clave: "criticos", label: "Stock crítico", valor: live.criticos, tono: "rojo", href: "/admin", destacar: live.criticos > 0 },
  ];

  return (
    <Portada>
      <PortadaHero
        eyebrow={fecha}
        titulo={nombre ? `${saludo},` : saludo}
        acento={nombre}
        bajada="Esto es lo que está pasando hoy en el astillero."
        acciones={<BuscarPortada />}
        indicadores={indicadores.map(({ clave, href, ...resto }) => (
          <Indicador
            key={clave}
            cargando={cargando}
            {...resto}
            onClick={puedeIr(href) ? () => navigate(href) : undefined}
          />
        ))}
      />
      <SeccionPortada titulo="Tus módulos" cantidad={modulos.length}>
        {modulos.map((mod, i) => (
          <TarjetaModulo
            key={mod.href}
            titulo={mod.label}
            descripcion={mod.desc}
            Icono={mod.Icono}
            tono={mod.tono}
            arte={CARD_ART[mod.href]}
            indice={i}
            onClick={() => navigate(mod.href)}
          />
        ))}
      </SeccionPortada>
    </Portada>
  );
}
