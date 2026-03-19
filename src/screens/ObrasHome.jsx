/**
 * ObrasHome.jsx — Landing de Obras
 * Cards estilo HomeScreen para navegar a cada vista de ObrasScreen.
 * onEnterMapa(view) → navega directamente a esa vista.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "../supabaseClient";
import logoKlasea from "../assets/logo-klasea.png";
import logoK      from "../assets/logo-k.png";

const C = {
  bg:   "#09090b",
  b0:   "rgba(255,255,255,0.08)",
  t0:   "#f4f4f5", t1:"#a1a1aa", t2:"#52525b",
  sans: "'Outfit', system-ui, sans-serif",
  mono: "'JetBrains Mono', monospace",
  blue: "#3b82f6", cyan:"#22d3ee", green:"#10b981",
  amber:"#f59e0b", red:"#ef4444",
};

// ─── VISTAS ──────────────────────────────────────────────────────
const VISTAS = [
  {
    view:"obras", label:"Obras", color:"#60a5fa",
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
    view:"mapa", label:"Mapa", color:"#a78bfa",
    desc:"Plano del galpón con puestos de trabajo",
    art:(c)=>(
      <svg viewBox="0 0 240 140" fill="none" style={{position:"absolute",inset:0,width:"100%",height:"100%",opacity:0.18}}>
        <rect x="8" y="8" width="224" height="124" rx="4" stroke={c} strokeWidth="1.2" strokeOpacity="0.6"/>
        <rect x="8"  y="8" width="30" height="22" rx="2" fill={c} fillOpacity="0.08" stroke={c} strokeWidth="0.7" strokeOpacity="0.4"/>
        <rect x="44" y="8" width="60" height="22" rx="2" fill={c} fillOpacity="0.05" stroke={c} strokeWidth="0.7" strokeOpacity="0.3"/>
        <rect x="110"y="8" width="80" height="22" rx="2" fill={c} fillOpacity="0.05" stroke={c} strokeWidth="0.7" strokeOpacity="0.3"/>
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
    view:"ordenes", label:"Compras", color:"#fbbf24",
    desc:"Órdenes de compra y proveedores",
    art:(c)=>(
      <svg viewBox="0 0 240 140" fill="none" style={{position:"absolute",inset:0,width:"100%",height:"100%",opacity:0.18}}>
        {[3,2,1,0].map(i=>(
          <rect key={i} x={28+i*5} y={16+i*4} width="165" height="108" rx="6"
            fill={c} fillOpacity={0.03+i*0.04} stroke={c} strokeWidth="0.8" strokeOpacity={0.18+i*0.1}/>
        ))}
        <rect x="34" y="34" width="65" height="7" rx="2" fill={c} fillOpacity="0.5"/>
        {[0,1,2,3,4].map(i=>(
          <g key={i}>
            <circle cx="42" cy={51+i*14} r="3" fill={c} fillOpacity={[0.7,0.5,0.85,0.4,0.6][i]}/>
            <rect x="50" y={48+i*14} width={[88,68,95,55,72][i]} height="4" rx="1" fill={c} fillOpacity="0.22"/>
          </g>
        ))}
        <circle cx="178" cy="98" r="24" fill="none" stroke={c} strokeWidth="1.5" strokeOpacity="0.4" strokeDasharray="5 3"/>
        <circle cx="178" cy="98" r="17" fill={c} fillOpacity="0.07"/>
        <circle cx="178" cy="98" r="6"  fill={c} fillOpacity="0.35"/>
      </svg>
    ),
  },
  {
    view:"planificacion", label:"Planificación", color:"#f59e0b",
    desc:"Timeline, avisos y seguimiento",
    art:(c)=>(
      <svg viewBox="0 0 240 140" fill="none" style={{position:"absolute",inset:0,width:"100%",height:"100%",opacity:0.18}}>
        <rect x="18" y="14" width="90" height="112" rx="6" fill={c} fillOpacity="0.05" stroke={c} strokeWidth="1" strokeOpacity="0.4"/>
        <line x1="18" y1="32" x2="108" y2="32" stroke={c} strokeWidth="0.8" strokeOpacity="0.4"/>
        {[0,1,2,3,4,5,6].map(i=>(
          [0,1,2,3,4].map(j=>(
            <rect key={`${i}${j}`} x={22+i*12} y={36+j*18} width="9" height="9" rx="1.5"
              fill={c} fillOpacity={(i+j)%3===0?0.38:0.08}/>
          ))
        ))}
        <rect x="46" y="72" width="9" height="9" rx="1.5" fill={c} fillOpacity="0.75"/>
        {[{x:126,y:20,w:100,h:36,p:0.72},{x:126,y:64,w:100,h:36,p:0.44},{x:126,y:108,w:100,h:26,p:0.88}].map((k,i)=>(
          <g key={i}>
            <rect x={k.x} y={k.y} width={k.w} height={k.h} rx="5" fill={c} fillOpacity="0.05" stroke={c} strokeWidth="0.8" strokeOpacity="0.3"/>
            <rect x={k.x+6} y={k.y+k.h-10} width={k.w-12} height="5" rx="2" fill="none" stroke={c} strokeWidth="0.5" strokeOpacity="0.3"/>
            <rect x={k.x+6} y={k.y+k.h-10} width={(k.w-12)*k.p} height="5" rx="2" fill={c} fillOpacity="0.45"/>
          </g>
        ))}
      </svg>
    ),
  },
  {
    view:"piezas_lam", label:"Piezas Lam.", color:"#34d399",
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
];

// ─── HOOKS ───────────────────────────────────────────────────────
function useClock() {
  const [t, setT] = useState(new Date());
  useEffect(()=>{ const id=setInterval(()=>setT(new Date()),1000); return()=>clearInterval(id); },[]);
  return t;
}

function useLiveData(obrasProp) {
  const [data, setData] = useState({ activas:0,pausadas:0,terminadas:0,loaded:false });
  const load = useCallback(async () => {
    try {
      const { data: rows } = await supabase.from("produccion_obras").select("estado");
      const obras = rows ?? [];
      setData({ activas:obras.filter(o=>o.estado==="activa").length,
        pausadas:obras.filter(o=>o.estado==="pausada").length,
        terminadas:obras.filter(o=>o.estado==="terminada").length, loaded:true });
    } catch { setData(d=>({...d,loaded:true})); }
  },[]);
  useEffect(()=>{
    if(obrasProp?.length){
      setData({ activas:obrasProp.filter(o=>o.estado==="activa").length,
        pausadas:obrasProp.filter(o=>o.estado==="pausada").length,
        terminadas:obrasProp.filter(o=>o.estado==="terminada").length, loaded:true });
      return;
    }
    load(); const id=setInterval(load,30000); return()=>clearInterval(id);
  },[obrasProp,load]);
  return data;
}

// ─── ANIMNUM ─────────────────────────────────────────────────────
function AnimNum({ to, color }) {
  const [v,setV]=useState(0); const prev=useRef(0);
  useEffect(()=>{
    if(!to) return;
    const from=prev.current,start=performance.now();
    const tick=now=>{ const p=Math.min((now-start)/1100,1),e=1-Math.pow(1-p,3);
      setV(Math.round(from+(to-from)*e)); if(p<1) requestAnimationFrame(tick); else prev.current=to; };
    requestAnimationFrame(tick);
  },[to]);
  return <span style={{color}}>{v}</span>;
}

// ─── TYPEWRITER ──────────────────────────────────────────────────
function Typewriter({ text, delay=0, speed=36 }) {
  const [shown,setShown]=useState(""); const [started,setStarted]=useState(false);
  useEffect(()=>{ const t=setTimeout(()=>setStarted(true),delay); return()=>clearTimeout(t); },[delay]);
  useEffect(()=>{
    if(!started||shown.length>=text.length) return;
    const id=setTimeout(()=>setShown(text.slice(0,shown.length+1)),speed);
    return()=>clearTimeout(id);
  },[started,shown,text,speed]);
  return(
    <span>{shown}
      {shown.length<text.length&&started&&(
        <span style={{animation:"oh-blink .7s step-end infinite",borderRight:"1.5px solid currentColor",marginLeft:1}}/>
      )}
    </span>
  );
}

// ─── PARTICLES ───────────────────────────────────────────────────
function Particles() {
  const ref=useRef(null);
  useEffect(()=>{
    const canvas=ref.current; if(!canvas) return;
    const ctx=canvas.getContext("2d"); let W,H,raf;
    const resize=()=>{ W=canvas.width=canvas.offsetWidth; H=canvas.height=canvas.offsetHeight; };
    resize(); window.addEventListener("resize",resize);
    const N=45,pts=Array.from({length:N},()=>({x:Math.random()*W,y:Math.random()*H,vx:(Math.random()-.5)*.18,vy:(Math.random()-.5)*.18,r:Math.random()*1.1+.3}));
    const draw=()=>{
      ctx.clearRect(0,0,W,H);
      for(let i=0;i<N;i++) for(let j=i+1;j<N;j++){
        const dx=pts[i].x-pts[j].x,dy=pts[i].y-pts[j].y,d=Math.sqrt(dx*dx+dy*dy);
        if(d<130){ ctx.beginPath();ctx.moveTo(pts[i].x,pts[i].y);ctx.lineTo(pts[j].x,pts[j].y);
          ctx.strokeStyle=`rgba(255,255,255,${.018*(1-d/130)})`;ctx.lineWidth=.5;ctx.stroke(); }
      }
      pts.forEach(p=>{ ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fillStyle="rgba(255,255,255,0.18)";ctx.fill();
        p.x+=p.vx;p.y+=p.vy; if(p.x<0||p.x>W) p.vx*=-1; if(p.y<0||p.y>H) p.vy*=-1; });
      raf=requestAnimationFrame(draw);
    };
    draw(); return()=>{ cancelAnimationFrame(raf);window.removeEventListener("resize",resize); };
  },[]);
  return <canvas ref={ref} style={{position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none",opacity:.45}}/>;
}

// ─── RING ────────────────────────────────────────────────────────
function Ring({ value, total, color, label, delay=0 }) {
  const pct=total>0?Math.min(value/total,1):0;
  const sz=52,r=(sz-7)/2,circ=2*Math.PI*r;
  const [anim,setAnim]=useState(false);
  useEffect(()=>{ const t=setTimeout(()=>setAnim(true),delay+200); return()=>clearTimeout(t); },[delay]);
  return(
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6,animation:`oh-fadeSlideUp 0.5s ease ${delay}ms both`}}>
      <div style={{position:"relative",width:sz,height:sz}}>
        <svg width={sz} height={sz} style={{transform:"rotate(-90deg)",display:"block"}}>
          <circle cx={sz/2} cy={sz/2} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="3.5"/>
          <circle cx={sz/2} cy={sz/2} r={r} fill="none" stroke={color} strokeWidth="3.5"
            strokeLinecap="round" strokeDasharray={circ}
            strokeDashoffset={anim?circ*(1-pct):circ}
            style={{transition:"stroke-dashoffset 1.4s cubic-bezier(0.22,1,0.36,1)",filter:`drop-shadow(0 0 4px ${color}88)`}}/>
        </svg>
        <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:C.mono,fontSize:12,fontWeight:700,color}}>
          <AnimNum to={value} color={color}/>
        </div>
      </div>
      <span style={{fontSize:8.5,color:C.t2,letterSpacing:2,textTransform:"uppercase",fontFamily:C.mono}}>{label}</span>
    </div>
  );
}

// ─── CARD ────────────────────────────────────────────────────────
function Card({ vista, delay, onClick }) {
  const [hov,setHov]=useState(false);
  const [ripples,setRipples]=useState([]);
  const [tilt,setTilt]=useState({x:0,y:0});
  const [shimmer,setShimmer]=useState(false);
  const cardRef=useRef(null); const shimmerRef=useRef(null);
  const BL=13;

  const onMouseMove=e=>{ const el=cardRef.current; if(!el) return;
    const r=el.getBoundingClientRect();
    setTilt({x:(e.clientY-(r.top+r.height/2))/(r.height/2)*-7,y:(e.clientX-(r.left+r.width/2))/(r.width/2)*7}); };
  const onMouseEnter=e=>{ setHov(true);onMouseMove(e); clearTimeout(shimmerRef.current);
    shimmerRef.current=setTimeout(()=>setShimmer(true),40); };
  const onMouseLeave=()=>{ setHov(false);setTilt({x:0,y:0});setShimmer(false); };
  const handleClick=e=>{ const rect=cardRef.current.getBoundingClientRect(); const id=Date.now();
    setRipples(r=>[...r,{id,x:e.clientX-rect.left,y:e.clientY-rect.top}]);
    setTimeout(()=>setRipples(r=>r.filter(rr=>rr.id!==id)),700); onClick(); };
  useEffect(()=>()=>clearTimeout(shimmerRef.current),[]);

  const transform=hov
    ?`perspective(900px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) translateY(-5px) scale(1.02)`
    :"perspective(900px) rotateX(0) rotateY(0) translateY(0) scale(1)";

  return(
    <button ref={cardRef} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}
      onMouseMove={hov?onMouseMove:undefined} onClick={handleClick}
      style={{
        display:"flex",flexDirection:"column",justifyContent:"flex-end",
        padding:"18px 18px 16px",
        background:hov?"rgba(255,255,255,0.05)":"rgba(255,255,255,0.025)",
        border:`1px solid ${hov?vista.color+"65":"rgba(255,255,255,0.07)"}`,
        borderRadius:14,cursor:"pointer",textAlign:"left",fontFamily:C.sans,
        transition:"transform 0.18s cubic-bezier(0.22,1,0.36,1),box-shadow 0.22s,border-color 0.22s,background 0.2s",
        transform,
        boxShadow:hov?`0 28px 65px rgba(0,0,0,0.6),0 0 0 1px ${vista.color}25,inset 0 0 60px ${vista.color}08`:"0 2px 12px rgba(0,0,0,0.4)",
        animation:`oh-cardIn 0.55s cubic-bezier(0.22,1,0.36,1) ${delay}ms both`,
        position:"relative",overflow:"hidden",minHeight:160,willChange:"transform",
      }}>
      {/* Arte SVG */}
      <div style={{position:"absolute",inset:0,pointerEvents:"none",transition:"opacity 0.3s",opacity:hov?1:0.65}}>
        {vista.art(vista.color)}
      </div>
      {/* Gradiente legibilidad */}
      <div style={{position:"absolute",inset:0,pointerEvents:"none",
        background:`linear-gradient(to top,${hov?"rgba(9,9,11,0.82)":"rgba(9,9,11,0.72)"} 0%,rgba(9,9,11,0.1) 55%,transparent 100%)`,
        transition:"background 0.25s"}}/>
      {/* Glow */}
      <div style={{position:"absolute",top:-40,right:-40,width:130,height:130,borderRadius:"50%",
        background:`${vista.color}${hov?"1a":"0e"}`,filter:"blur(35px)",pointerEvents:"none",
        transition:"background 0.3s,transform 0.4s",transform:hov?"scale(1.3)":"scale(1)"}}/>
      {/* Ripples */}
      {ripples.map(rip=>(
        <div key={rip.id} style={{position:"absolute",left:rip.x-70,top:rip.y-70,width:140,height:140,
          borderRadius:"50%",pointerEvents:"none",
          background:`radial-gradient(circle,${vista.color}30 0%,transparent 70%)`,
          animation:"oh-bigRipple 0.7s cubic-bezier(0.22,1,0.36,1) forwards",zIndex:12}}/>
      ))}
      {/* Shimmer */}
      {shimmer&&<div style={{position:"absolute",top:0,left:"-100%",width:"60%",height:"100%",
        background:`linear-gradient(105deg,transparent 25%,${vista.color}15 50%,transparent 75%)`,
        animation:"oh-shimmer 0.7s cubic-bezier(0.22,1,0.36,1) forwards",pointerEvents:"none",zIndex:8}}/>}
      {/* Corner brackets */}
      {hov&&(
        <svg style={{position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none",zIndex:9,overflow:"visible"}}>
          {[`M ${BL},4 L 4,4 L 4,${BL}`,`M calc(100% - ${BL}),4 L calc(100% - 4),4 L calc(100% - 4),${BL}`,
            `M 4,calc(100% - ${BL}) L 4,calc(100% - 4) L ${BL},calc(100% - 4)`,
            `M calc(100% - ${BL}),calc(100% - 4) L calc(100% - 4),calc(100% - 4) L calc(100% - 4),calc(100% - ${BL})`
          ].map((d,i)=>(
            <path key={i} d={d} fill="none" stroke={vista.color} strokeWidth="1.8" strokeLinecap="round"
              style={{filter:`drop-shadow(0 0 5px ${vista.color})`,strokeDasharray:BL*2+4,strokeDashoffset:BL*2+4,
                animation:`oh-bracketDraw 0.22s ease ${i*0.04}s forwards`}}/>
          ))}
        </svg>
      )}
      {/* Contenido */}
      <div style={{position:"relative",zIndex:10}}>
        <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:7}}>
          <div style={{position:"relative",flexShrink:0}}>
            {hov&&<div style={{position:"absolute",inset:-5,borderRadius:"50%",border:`1px solid ${vista.color}55`,animation:"oh-ringExpand 1.2s ease-out infinite"}}/>}
            <div style={{width:9,height:9,borderRadius:"50%",background:vista.color,
              boxShadow:hov?`0 0 0 2px rgba(0,0,0,0.5),0 0 18px ${vista.color},0 0 36px ${vista.color}55`:`0 0 9px ${vista.color}80`,
              transition:"box-shadow 0.25s"}}/>
          </div>
          <span style={{fontSize:14,fontWeight:700,letterSpacing:"0.2px",
            ...(hov?{background:`linear-gradient(90deg,#fff 0%,#fff 35%,${vista.color} 52%,#fff 68%,#fff 100%)`,
              backgroundSize:"200% auto",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",
              animation:"oh-labelShimmer 1.2s linear 0.08s 1 forwards"}:{color:"#f4f4f5"})}}>
            {vista.label}
          </span>
        </div>
        <div style={{fontSize:11,lineHeight:1.6,color:hov?"#9ca3af":"#52525b",transition:"color 0.2s",paddingRight:28}}>
          {vista.desc}
        </div>
      </div>
      {/* Flecha */}
      <div style={{position:"absolute",bottom:16,right:14,zIndex:10,fontSize:15,fontWeight:700,
        color:hov?vista.color:"rgba(255,255,255,0.08)",transition:"all 0.2s cubic-bezier(0.22,1,0.36,1)",
        transform:hov?"translate(0,0) scale(1.2)":"translate(3px,3px) scale(1)",
        filter:hov?`drop-shadow(0 0 8px ${vista.color})`:"none"}}>→</div>
      {/* Línea inferior */}
      <div style={{position:"absolute",bottom:0,left:hov?0:"50%",right:hov?0:"50%",height:2,borderRadius:2,
        background:`linear-gradient(90deg,transparent 0%,${vista.color} 50%,transparent 100%)`,
        opacity:hov?1:0,
        transition:"left 0.38s cubic-bezier(0.22,1,0.36,1),right 0.38s cubic-bezier(0.22,1,0.36,1),opacity 0.2s",
        boxShadow:`0 0 12px ${vista.color}90`}}/>
    </button>
  );
}

// ─── TICKER ──────────────────────────────────────────────────────
function Ticker({ items }) {
  return(
    <div style={{flexShrink:0,height:26,borderTop:`1px solid rgba(255,255,255,0.08)`,
      overflow:"hidden",display:"flex",alignItems:"center",
      background:"rgba(0,0,0,0.35)",backdropFilter:"blur(8px)"}}>
      <div style={{padding:"0 12px",borderRight:`1px solid rgba(255,255,255,0.08)`,height:"100%",display:"flex",alignItems:"center",flexShrink:0}}>
        <span style={{fontSize:8,fontFamily:C.mono,color:C.t2,letterSpacing:2}}>LIVE</span>
      </div>
      <div style={{overflow:"hidden",flex:1}}>
        <div style={{display:"flex",whiteSpace:"nowrap",animation:"oh-tickerScroll 32s linear infinite"}}>
          {[...items,...items].map((it,i)=>(
            <span key={i} style={{display:"inline-flex",alignItems:"center",gap:7,fontFamily:C.mono,fontSize:9,color:C.t1,paddingRight:40}}>
              <span style={{color:it.color,fontSize:5}}>◆</span>
              <span style={{color:C.t2}}>{it.label.toUpperCase()}</span>
              <span style={{color:it.color,fontWeight:700}}>{it.value}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════
export default function ObrasHome({ obras: obrasProp, profile, onEnterMapa }) {
  const live  = useLiveData(obrasProp);
  const clock = useClock();

  const username = profile?.username ?? "—";
  const hora     = clock.getHours();
  const greeting = `${hora<12?"Buenos días":hora<19?"Buenas tardes":"Buenas noches"}, ${username}`;
  const hh=String(clock.getHours()).padStart(2,"0");
  const mm=String(clock.getMinutes()).padStart(2,"0");
  const ss=String(clock.getSeconds()).padStart(2,"0");
  const fecha=clock.toLocaleDateString("es-AR",{weekday:"long",day:"2-digit",month:"long"});
  const total=live.activas+live.pausadas+live.terminadas;

  const tickerItems=[
    {label:"Activas",    value:live.activas,    color:C.blue },
    {label:"Pausadas",   value:live.pausadas,   color:C.amber},
    {label:"Terminadas", value:live.terminadas, color:C.green},
    {label:"Sistema",    value:"OK",            color:C.green},
  ];

  return(
    <>
      <style>{`
        @keyframes oh-cardIn       { from{opacity:0;transform:translateY(20px) scale(0.96)} to{opacity:1;transform:none} }
        @keyframes oh-bigRipple    { from{transform:scale(0);opacity:1} to{transform:scale(4);opacity:0} }
        @keyframes oh-shimmer      { from{left:-100%} to{left:200%} }
        @keyframes oh-bracketDraw  { to{stroke-dashoffset:0} }
        @keyframes oh-ringExpand   { 0%{transform:scale(1);opacity:0.7} 100%{transform:scale(2.4);opacity:0} }
        @keyframes oh-labelShimmer { 0%{background-position:-200% center} 100%{background-position:200% center} }
        @keyframes oh-fadeSlideUp  { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:none} }
        @keyframes oh-headerIn     { from{opacity:0;transform:translateY(-16px)} to{opacity:1;transform:none} }
        @keyframes oh-logoReveal   { from{opacity:0;transform:scale(0.86);filter:blur(10px)} to{opacity:1;transform:none;filter:blur(0)} }
        @keyframes oh-lineExpand   { from{transform:scaleX(0);opacity:0} to{transform:scaleX(1);opacity:1} }
        @keyframes oh-blink        { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes oh-pulseOnline  { 0%,100%{box-shadow:0 0 0 0 #10b98155} 60%{box-shadow:0 0 0 7px #10b98100} }
        @keyframes oh-dotBeat      { 0%,100%{transform:scale(1);opacity:1} 50%{transform:scale(1.9);opacity:.45} }
        @keyframes oh-scanDown     { 0%{top:-1px;opacity:0} 4%{opacity:.25} 96%{opacity:.25} 100%{top:100%;opacity:0} }
        @keyframes oh-glowPulse    { 0%,100%{filter:brightness(1.05) drop-shadow(0 0 28px rgba(59,130,246,0.28))} 50%{filter:brightness(1.12) drop-shadow(0 0 44px rgba(59,130,246,0.48))} }
        @keyframes oh-tickerScroll { from{transform:translateX(0)} to{transform:translateX(-50%)} }
      `}</style>

      <div style={{display:"flex",flexDirection:"column",height:"100%",background:C.bg,fontFamily:C.sans,overflow:"hidden",position:"relative"}}>

        {/* FONDO */}
        <Particles/>
        <div style={{position:"absolute",inset:0,pointerEvents:"none",background:[
          "radial-gradient(ellipse at 65% 0%, rgba(59,130,246,0.07) 0%, transparent 48%)",
          "radial-gradient(ellipse at 8% 90%, rgba(16,185,129,0.05) 0%, transparent 42%)",
        ].join(",")}}/>
        <div style={{position:"absolute",inset:0,pointerEvents:"none",
          backgroundImage:["linear-gradient(rgba(255,255,255,0.017) 1px,transparent 1px)",
            "linear-gradient(90deg,rgba(255,255,255,0.017) 1px,transparent 1px)"].join(","),
          backgroundSize:"72px 72px"}}/>
        <div style={{position:"absolute",left:0,right:0,height:1,zIndex:10,pointerEvents:"none",
          animation:"oh-scanDown 16s linear infinite 1.5s",
          background:"linear-gradient(90deg,transparent,rgba(255,255,255,0.11),transparent)"}}/>

        {/* TOPBAR */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
          padding:"0 28px",height:46,flexShrink:0,
          borderBottom:`1px solid ${C.b0}`,background:"rgba(9,9,11,0.78)",backdropFilter:"blur(20px)",
          position:"relative",zIndex:2,animation:"oh-headerIn 0.45s cubic-bezier(0.22,1,0.36,1) both"}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:7,height:7,borderRadius:"50%",background:C.green,animation:"oh-pulseOnline 2.4s ease-out infinite"}}/>
            <span style={{fontSize:9,color:C.t2,letterSpacing:2.5,textTransform:"uppercase",fontFamily:C.mono}}>Online</span>
          </div>
          {live.loaded&&(
            <div style={{display:"flex",alignItems:"center",gap:20}}>
              {[{v:live.activas,c:C.blue,l:"Activas"},{v:live.pausadas,c:C.amber,l:"Pausadas"},{v:live.terminadas,c:C.green,l:"Terminadas"}].map(k=>(
                <div key={k.l} style={{display:"flex",alignItems:"center",gap:5}}>
                  <div style={{width:4,height:4,borderRadius:"50%",background:k.c,boxShadow:`0 0 7px ${k.c}`,animation:"oh-dotBeat 2.6s ease-in-out infinite"}}/>
                  <span style={{fontFamily:C.mono,fontSize:13,fontWeight:700,color:k.c}}><AnimNum to={k.v} color={k.c}/></span>
                  <span style={{fontSize:9,color:C.t2,letterSpacing:1.5,textTransform:"uppercase"}}>{k.l}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:1}}>
            <div style={{display:"flex",alignItems:"baseline",gap:2}}>
              <span style={{fontFamily:C.mono,fontSize:19,fontWeight:700,color:C.t0,letterSpacing:2.5}}>
                {hh}<span style={{opacity:.28,animation:"oh-blink 1s step-end infinite"}}>:</span>{mm}
              </span>
              <span style={{fontFamily:C.mono,fontSize:10,color:C.t2,marginLeft:2}}>{ss}</span>
            </div>
            <span style={{fontSize:8.5,color:C.t2,fontFamily:C.mono,letterSpacing:1.5}}>{fecha.toUpperCase()}</span>
          </div>
        </div>

        {/* HERO */}
        <div style={{padding:"24px 28px 20px",flexShrink:0,borderBottom:`1px solid ${C.b0}`,position:"relative",zIndex:1}}>
          <div style={{fontSize:10.5,color:C.t2,letterSpacing:3,textTransform:"uppercase",marginBottom:14,fontFamily:C.mono,animation:"oh-fadeSlideUp 0.4s ease 0.05s both"}}>
            <Typewriter text={greeting} delay={200} speed={32}/>
          </div>
          <div style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between",gap:20}}>
            <div style={{animation:"oh-logoReveal 0.7s cubic-bezier(0.22,1,0.36,1) 0.12s both"}}>
              <img src={logoKlasea} alt="Klase A"
                style={{height:72,objectFit:"contain",display:"block",animation:"oh-glowPulse 4s ease-in-out 1.2s infinite"}}
                onError={e=>{e.currentTarget.src=logoK;e.currentTarget.style.height="56px";}}/>
              <div style={{height:1,width:300,marginTop:10,
                background:`linear-gradient(90deg,${C.blue}95,${C.cyan}45,transparent)`,
                transformOrigin:"left",animation:"oh-lineExpand 0.85s cubic-bezier(0.22,1,0.36,1) 0.55s both",
                boxShadow:`0 0 12px ${C.blue}45`}}/>
              <div style={{fontSize:10,color:C.t2,marginTop:8,letterSpacing:2.5,textTransform:"uppercase",fontFamily:C.mono,
                display:"flex",alignItems:"center",gap:10,animation:"oh-fadeSlideUp 0.4s ease 0.6s both"}}>
                <span>Astillero · Mapa de Producción</span>
                {total>0&&<span style={{padding:"1px 8px",borderRadius:4,background:"rgba(59,130,246,0.08)",border:`1px solid ${C.b0}`,fontSize:9,letterSpacing:1.5,color:C.blue}}>{live.activas} activas</span>}
              </div>
            </div>
            {live.loaded&&total>0&&(
              <div style={{display:"flex",gap:24,flexShrink:0,paddingBottom:2}}>
                <Ring value={live.activas}    total={total} color={C.blue}  label="Activas"    delay={700}/>
                <Ring value={live.pausadas}   total={total} color={C.amber} label="Pausadas"   delay={820}/>
                <Ring value={live.terminadas} total={total} color={C.green} label="Terminadas" delay={940}/>
              </div>
            )}
          </div>
        </div>

        {/* CARDS */}
        <div style={{flex:1,display:"flex",flexDirection:"column",padding:"16px 28px 20px",position:"relative",zIndex:1,overflow:"hidden"}}>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12,flexShrink:0,animation:"oh-fadeSlideUp 0.4s ease 0.26s both"}}>
            <span style={{fontSize:9,color:C.t2,letterSpacing:3,textTransform:"uppercase",fontFamily:C.mono}}>Acceso rápido</span>
            <div style={{flex:1,height:1,background:`linear-gradient(90deg,${C.b0},transparent)`}}/>
            <span style={{fontSize:9,color:"rgba(255,255,255,0.09)",fontFamily:C.mono,letterSpacing:2}}>KLASE A · ASTILLERO · OBRAS</span>
          </div>
          <div style={{flex:1,display:"grid",gridTemplateColumns:`repeat(${VISTAS.length},1fr)`,gap:10}}>
            {VISTAS.map((vista,i)=>(
              <Card key={vista.view} vista={vista} delay={i*50} onClick={()=>onEnterMapa(vista.view)}/>
            ))}
          </div>
        </div>

        {/* TICKER */}
        {live.loaded&&<Ticker items={tickerItems}/>}
      </div>
    </>
  );
}
