/**
 * ObrasHome — la entrada de Obras.
 *
 * Cuántas obras hay activas, pausadas y terminadas, y una tarjeta por vista de
 * ObrasScreen. onEnterMapa(vista, { estado }) abre esa vista; desde un
 * indicador, con ese estado filtrado.
 *
 * Usa las mismas piezas que el Home (components/ui/Portada). Antes tenía reloj
 * con segundos, un saludo que se tipeaba letra por letra, partículas en canvas,
 * una línea de escaneo, un ticker "LIVE" y tarjetas con inclinación 3D, todo
 * animado sin parar; y volvía a consultar a la base números que ObrasScreen ya
 * tenía cargados.
 */
import { useMemo } from "react";
import { CalendarClock, ChartGantt, Layers, Map as IconoMapa, Milestone } from "lucide-react";
import { Indicador, Portada, PortadaHero, SeccionPortada, TarjetaModulo } from "@/components/ui/Portada";

// ─── VISTAS ──────────────────────────────────────────────────────
// art: dibujo abstracto de cada vista; la tarjeta le pasa el color.
const VISTAS = [
  {
    view:"obras", label:"Obras", tono:"azul",    Icono:ChartGantt,
    desc:"Gantt, etapas y tareas por barco",
    art:(c)=>(
      <svg viewBox="0 0 240 140" fill="none" style={{position:"absolute",inset:0,width:"100%",height:"100%",opacity:0.18}}>
        {[0,1,2,3,4].map(i=>(
          <g key={i}>
            <rect x="20" y={18+i*23} width={[170,130,190,110,150][i]} height="14" rx="3"
              fill={c} fillOpacity={0.1+i*0.03}/>
            <rect x="20" y={18+i*23} width={[120,80,160,60,110][i]} height="14" rx="3"
              fill={c} fillOpacity="0.28"/>
            <rect x="24" y={22+i*23} width="32" height="4" rx="1" fill={c} fillOpacity="0.7"/>
            <circle cx={[192,152,212,132,172][i]+4} cy={25+i*23} r="3"
              fill={c} fillOpacity={[0.9,0.5,0.9,0.4,0.7][i]}/>
          </g>
        ))}
        <line x1="20" y1="10" x2="20" y2="130" stroke={c} strokeWidth="1" strokeOpacity="0.3"/>
        <line x1="120" y1="10" x2="120" y2="130" stroke={c} strokeWidth="1.5" strokeOpacity="0.5" strokeDasharray="4 3"/>
        <rect x="110" y="6" width="20" height="7" rx="2" fill={c} fillOpacity="0.35"/>
      </svg>
    ),
  },
  {
    view:"mapa", label:"Mapa", tono:"violeta", Icono:IconoMapa,
    desc:"Plano del galpón con información y memorias descriptivas de los barcos",
    art:(c)=>(
      <svg viewBox="0 0 240 140" fill="none" style={{position:"absolute",inset:0,width:"100%",height:"100%",opacity:0.18}}>
        <rect x="8" y="8" width="224" height="124" rx="4" stroke={c} strokeWidth="1.2" strokeOpacity="0.6"/>
        <rect x="8"  y="8" width="30" height="22" rx="2" fill={c} fillOpacity="0.08" stroke={c} strokeWidth="0.7" strokeOpacity="0.4"/>
        <rect x="44" y="8" width="60" height="22" rx="2" fill={c} fillOpacity="0.05" stroke={c} strokeWidth="0.7" strokeOpacity="0.3"/>
        <rect x="110" y="8" width="80" height="22" rx="2" fill={c} fillOpacity="0.05" stroke={c} strokeWidth="0.7" strokeOpacity="0.3"/>
        {[0,1,2].map(i=>(
          <g key={i}>
            <rect x="12" y={36+i*30} width="22" height="26" rx="2"
              fill={c} fillOpacity={0.08+i*0.03} stroke={c} strokeWidth="0.8" strokeOpacity={0.4+i*0.1}/>
            <rect x="15" y={40+i*30} width="16" height="5" rx="1" fill={c} fillOpacity="0.25"/>
          </g>
        ))}
        {[0,1,2,3,4,5].map(i=>(
          <rect key={i} x={44+i*26} y={105} width="20" height="24" rx="2"
            fill={c} fillOpacity={[0.15,0.1,0.18,0.08,0.12,0.1][i]}
            stroke={c} strokeWidth="0.8" strokeOpacity="0.4"/>
        ))}
        {[0,1].map(i=>(
          <rect key={i} x={182+i*22} y={50} width="18" height="46" rx="2"
            fill={c} fillOpacity={0.1+i*0.05} stroke={c} strokeWidth="0.8" strokeOpacity="0.45"/>
        ))}
        <circle cx="120" cy="70" r="20" fill="none" stroke={c} strokeWidth="0.6" strokeOpacity="0.25"/>
        <circle cx="120" cy="70" r="35" fill="none" stroke={c} strokeWidth="0.4" strokeOpacity="0.14"/>
        <circle cx="120" cy="70" r="3"  fill={c} fillOpacity="0.6"/>
      </svg>
    ),
  },
  {
    view:"piezas_lam", label:"Piezas de laminación", tono:"verde",   Icono:Layers,
    desc:"Piezas de laminación por obra",
    art:(c)=>(
      <svg viewBox="0 0 240 140" fill="none" style={{position:"absolute",inset:0,width:"100%",height:"100%",opacity:0.18}}>
        {[0,1,2,3,4,5,6,7,8,9,10].map(i=>(
          <line key={`a${i}`} x1={-10+i*24} y1="0" x2={i*24-110} y2="140"
            stroke={c} strokeWidth="0.7" strokeOpacity="0.3"/>
        ))}
        {[0,1,2,3,4,5,6,7,8,9,10].map(i=>(
          <line key={`b${i}`} x1={-10+i*24} y1="140" x2={i*24-110} y2="0"
            stroke={c} strokeWidth="0.7" strokeOpacity="0.18"/>
        ))}
        {[
          {x:14,y:12,w:50,h:30},{x:70,y:12,w:35,h:30},{x:112,y:12,w:55,h:30},{x:174,y:12,w:50,h:30},
          {x:14,y:50,w:35,h:38},{x:55,y:50,w:65,h:38},{x:126,y:50,w:42,h:38},{x:174,y:50,w:50,h:38},
          {x:14,y:96,w:90,h:30},{x:112,y:96,w:112,h:30},
        ].map((p,i)=>(
          <g key={i}>
            <rect x={p.x} y={p.y} width={p.w} height={p.h} rx="2"
              fill={c} fillOpacity={0.06+i%3*0.04} stroke={c} strokeWidth="0.9" strokeOpacity="0.4"/>
            <circle cx={p.x+p.w-7} cy={p.y+7} r="2.5"
              fill={c} fillOpacity={[0.7,0.35,0.8,0.4,0.7,0.5,0.85,0.4,0.7,0.5][i]}/>
          </g>
        ))}
      </svg>
    ),
  },
  {
    view:"timeline", label:"Cronograma", tono:"teal",    Icono:Milestone,
    desc:"Etapas de cada obra ubicadas antes y después del desmolde",
    art:(c)=>(
      <svg viewBox="0 0 240 140" fill="none" style={{position:"absolute",inset:0,width:"100%",height:"100%",opacity:0.2}}>
        <line x1="20" y1="28" x2="222" y2="28" stroke={c} strokeWidth="1" strokeOpacity="0.45"/>
        <line x1="20" y1="70" x2="222" y2="70" stroke={c} strokeWidth="1" strokeOpacity="0.45"/>
        <line x1="20" y1="112" x2="222" y2="112" stroke={c} strokeWidth="1" strokeOpacity="0.45"/>
        {[30,70,110,150,190,220].map((x)=>(
          <line key={x} x1={x} y1="16" x2={x} y2="126" stroke={c} strokeWidth="0.7" strokeOpacity="0.2" strokeDasharray="3 3"/>
        ))}
        <line x1="110" y1="10" x2="110" y2="130" stroke={c} strokeWidth="2" strokeOpacity="0.8"/>
        <rect x="26" y="20" width="54" height="16" rx="4" fill={c} fillOpacity="0.22" stroke={c} strokeOpacity="0.55"/>
        <rect x="87" y="20" width="48" height="16" rx="4" fill={c} fillOpacity="0.42" stroke={c} strokeOpacity="0.8"/>
        <rect x="144" y="20" width="62" height="16" rx="4" fill={c} fillOpacity="0.16" stroke={c} strokeOpacity="0.45"/>
        <rect x="54" y="62" width="71" height="16" rx="4" fill={c} fillOpacity="0.28" stroke={c} strokeOpacity="0.65"/>
        <rect x="134" y="62" width="40" height="16" rx="4" fill={c} fillOpacity="0.18" stroke={c} strokeOpacity="0.48"/>
        <rect x="94" y="104" width="56" height="16" rx="4" fill={c} fillOpacity="0.38" stroke={c} strokeOpacity="0.78"/>
        <circle cx="110" cy="8" r="4" fill={c} fillOpacity="0.9"/>
        <text x="103" y="137" fill={c} fillOpacity="0.85" fontSize="7" fontFamily="monospace">S0</text>
      </svg>
    ),
  },
  {
    view:"fechas", label:"Fechas", tono:"cian",    Icono:CalendarClock,
    desc:"Cuándo pedir o hacer cada cosa según el desmolde de cada barco",
    art:(c)=>(
      <svg viewBox="0 0 240 140" fill="none" style={{position:"absolute",inset:0,width:"100%",height:"100%",opacity:0.18}}>
        {/* cuerpo del calendario */}
        <rect x="40" y="26" width="160" height="104" rx="8" fill={c} fillOpacity="0.05" stroke={c} strokeWidth="1.2" strokeOpacity="0.5"/>
        {/* cabecera */}
        <rect x="40" y="26" width="160" height="20" rx="8" fill={c} fillOpacity="0.16"/>
        <rect x="40" y="38" width="160" height="8" fill={c} fillOpacity="0.16"/>
        {/* anillas */}
        <rect x="68"  y="16" width="6" height="20" rx="3" fill={c} fillOpacity="0.6"/>
        <rect x="166" y="16" width="6" height="20" rx="3" fill={c} fillOpacity="0.6"/>
        {/* grilla de días */}
        {[0,1,2,3].map(r=>(
          [0,1,2,3,4,5].map(col=>(
            <rect key={`${r}${col}`} x={50+col*25} y={56+r*16} width="18" height="11" rx="2"
              fill={c} fillOpacity={(r*6+col)%5===0?0.5:0.09}/>
          ))
        ))}
        {/* marcador "fecha clave" */}
        <circle cx="59" cy="61.5" r="8" fill="none" stroke={c} strokeWidth="1.4" strokeOpacity="0.75"/>
      </svg>
    ),
  },
];

const INDICADORES = [
  { estado: "activa", label: "Activas", tono: "azul" },
  { estado: "pausada", label: "Pausadas", tono: "violeta" },
  { estado: "terminada", label: "Terminadas", tono: "verde" },
];

export default function ObrasHome({ obras = [], cargando = false, onEnterMapa }) {
  const conteo = useMemo(() => {
    const cuantas = (estado) => obras.filter((obra) => obra.estado === estado).length;
    return { activa: cuantas("activa"), pausada: cuantas("pausada"), terminada: cuantas("terminada") };
  }, [obras]);

  return (
    <Portada>
      <PortadaHero
        eyebrow="Producción"
        titulo="Obras de"
        acento="producción"
        bajada="Mapa operativo, cronograma, fechas y piezas por barco."
        indicadores={INDICADORES.map(({ estado, label, tono }) => (
          <Indicador
            key={estado}
            label={label}
            valor={conteo[estado]}
            tono={tono}
            cargando={cargando}
            onClick={() => onEnterMapa("obras", { estado })}
          />
        ))}
      />
      <SeccionPortada titulo="Vistas" cantidad={VISTAS.length}>
        {VISTAS.map((vista, i) => (
          <TarjetaModulo
            key={vista.view}
            titulo={vista.label}
            descripcion={vista.desc}
            Icono={vista.Icono}
            tono={vista.tono}
            arte={vista.art}
            indice={i}
            onClick={() => onEnterMapa(vista.view)}
          />
        ))}
      </SeccionPortada>
    </Portada>
  );
}
