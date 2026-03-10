/**
 * ClientePanelScreen — TITANIUM HMI EDITION
 * Design: Aeronautical Precision · Zero Warmth · Technical Telemetry
 * Palette: #030304 void · #0e0e12 carbon · #dde2e8 titanium · #7a8898 steel
 * Typography: Neue Montreal (define via CSS vars, fallback Inter)
 */

import React, { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "../supabaseClient";
import logoK from "../assets/logo-k.png";
import {
  Home, Settings, Compass, Zap, Anchor, Shield, Play, MessageSquare,
  Wind, Thermometer, Activity, Battery, AlertTriangle, Check,
  RefreshCw, ChevronDown, ChevronRight, X, Wifi,
  MapPin, Power, Gauge, RotateCcw, Phone, Flame, Droplets, Radio,
  Navigation, ShieldAlert, Info, Wrench, Eye, EyeOff,
  FileText, Upload, Paperclip, Image as ImageIcon, Video as VideoIcon,
  Trash2, ZoomIn
} from "lucide-react";

/* ─────────────────────────────────────────────────────────────
   CSS — TITANIUM SYSTEM
   ───────────────────────────────────────────────────────────── */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700&family=JetBrains+Mono:wght@300;400;500&display=swap');

*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{background:#030304;color:#dde2e8;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}

:root{
  /* ── Neue Montreal system (inject font via @font-face when ready) ── */
  --nm-regular: 300;
  --nm-medium:  400;
  --nm-bold:    600;
  --font-nm: 'Neue Montreal','Inter',system-ui,sans-serif;
  --font-mono: 'JetBrains Mono','Fira Code',monospace;

  /* ── Surfaces ── */
  --void:   #030304;
  --carbon: #070709;
  --s1:     #0c0c10;
  --s2:     #111116;
  --s3:     #18181e;
  --s4:     #1f1f26;

  /* ── Borders ── */
  --e1: rgba(255,255,255,0.050);
  --e2: rgba(255,255,255,0.090);
  --e3: rgba(255,255,255,0.140);

  /* ── Text ── */
  --t1: #e8edf2;
  --t2: #7a8898;
  --t3: #3c4450;
  --white: #ffffff;

  /* ── Status Colors ── */
  --ok:    #2db87a;
  --ok2:   rgba(45,184,122,0.10);
  --warn:  #d4892a;
  --warn2: rgba(212,137,42,0.10);
  --err:   #c04848;
  --err2:  rgba(192,72,72,0.09);
  --info:  #3a7fd0;
  --info2: rgba(58,127,208,0.10);

  /* ── Active ── */
  --active-border: rgba(255,255,255,0.75);
  --active-bg:     rgba(255,255,255,0.038);

  /* ── Layout ── */
  --sw: 238px;
  --ez: cubic-bezier(0.22,1,0.36,1);
}

::-webkit-scrollbar{width:2px;height:2px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.08);border-radius:2px}
::-webkit-scrollbar-thumb:hover{background:rgba(255,255,255,0.14)}

/* ── GRAIN OVERLAY ── */
.grain::after{
  content:'';position:fixed;inset:0;z-index:9999;pointer-events:none;
  background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.025'/%3E%3C/svg%3E");
  opacity:0.45
}

/* ── LAYOUT ── */
.shell{display:flex;min-height:100vh;width:100%}
.sidebar{
  width:var(--sw);flex-shrink:0;position:fixed;top:0;left:0;bottom:0;
  background:var(--void);border-right:1px solid var(--e1);
  display:flex;flex-direction:column;z-index:900;overflow-y:auto
}
.content{flex:1;min-width:0;margin-left:var(--sw)}

/* ── SIDEBAR NAV ITEM ── */
.ni{
  display:flex;align-items:center;gap:10px;width:100%;
  padding:10px 20px 10px 22px;
  font-family:var(--font-nm);font-size:9.5px;font-weight:500;
  letter-spacing:.18em;text-transform:uppercase;color:var(--t3);
  background:transparent;border:none;cursor:pointer;text-align:left;
  border-left:1.5px solid transparent;transition:color .2s,border-color .2s,background .2s
}
.ni:hover{color:var(--t2);background:rgba(255,255,255,0.012)}
.ni.on{color:var(--t1);border-left-color:var(--white);background:var(--active-bg)}
.ni.on .nico{opacity:1;color:var(--white)}
.nico{opacity:.28;flex-shrink:0;transition:opacity .2s,color .2s;display:flex;align-items:center}

/* ── CARDS ── */
.card{background:var(--s2);border:1px solid var(--e1);border-radius:1px}
.card-glass{
  background:rgba(8,8,12,0.70);border:1px solid var(--e2);
  backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-radius:1px
}

/* ── INPUTS ── */
.inp,.sel,.ta{
  background:transparent;border:none;border-bottom:1px solid var(--e2);
  color:var(--t1);padding:9px 0;width:100%;
  font-family:var(--font-nm);font-size:13px;font-weight:300;
  outline:none;border-radius:0;transition:border-color .2s;
  -webkit-appearance:none;appearance:none
}
.inp::placeholder{color:var(--t3)}
.inp:focus,.sel:focus,.ta:focus{border-bottom-color:rgba(255,255,255,0.4)}
.sel option{background:#111116;color:var(--t2)}
.ta{resize:vertical;min-height:88px;line-height:1.7}

/* ── ANIMATIONS ── */
@keyframes fup{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
@keyframes fin{from{opacity:0}to{opacity:1}}
@keyframes lgrow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes ken{from{transform:scale(1.05)}to{transform:scale(1)}}
@keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.25}}
@keyframes tslide{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}
@keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
@keyframes scanline{from{transform:translateY(-100%)}to{transform:translateY(100vh)}}

.senter{animation:fup .5s var(--ez) both}

/* ── STAGGER ── */
.stg>*{animation:fup .48s var(--ez) both}
.stg>*:nth-child(1){animation-delay:.04s}
.stg>*:nth-child(2){animation-delay:.10s}
.stg>*:nth-child(3){animation-delay:.16s}
.stg>*:nth-child(4){animation-delay:.22s}
.stg>*:nth-child(5){animation-delay:.28s}
.stg>*:nth-child(6){animation-delay:.34s}
.stg>*:nth-child(n+7){animation-delay:.40s}

/* ── DIVIDER LINE ── */
.wline{height:1px;width:36px;background:linear-gradient(90deg,rgba(255,255,255,0.5),transparent);animation:lgrow .7s var(--ez) both;transform-origin:left}

/* ── CHECKLIST ROW ── */
.cr{
  display:flex;align-items:flex-start;gap:12px;padding:11px 0;
  border-bottom:1px solid rgba(255,255,255,.035);
  cursor:pointer;user-select:none;transition:padding-left .18s var(--ez)
}
.cr:hover{padding-left:4px}

/* ── ACCORDION ── */
details>summary{list-style:none;cursor:pointer;user-select:none}
details>summary::-webkit-details-marker{display:none}
.arr{display:inline-flex;align-items:center;transition:transform .22s var(--ez);color:var(--t3)}
details[open] .arr{transform:rotate(90deg)}

/* ── VIDEO CARD ── */
.vid{position:relative;overflow:hidden;cursor:pointer;aspect-ratio:16/9;border-radius:1px}
.vov{position:absolute;inset:0;background:#030304;opacity:0;transition:opacity .3s}
.vid:hover .vov{opacity:.22}
.vply{
  position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) scale(.75);
  opacity:0;transition:all .3s var(--ez);width:50px;height:50px;
  border:1px solid rgba(255,255,255,.55);border-radius:50%;
  display:flex;align-items:center;justify-content:center
}
.vid:hover .vply{transform:translate(-50%,-50%) scale(1);opacity:1}
.vid img{width:100%;height:100%;object-fit:cover;transition:transform .5s var(--ez)}
.vid:hover img{transform:scale(1.04)}

/* ── BLUEPRINT VIDEO CARD ── */
.bp-card{
  position:relative;overflow:hidden;cursor:pointer;aspect-ratio:16/9;
  background:var(--s1);border:1px solid rgba(58,127,208,0.18)
}
.bp-corner{position:absolute;width:12px;height:12px;border-color:rgba(58,127,208,0.55);border-style:solid}
.bp-corner.tl{top:8px;left:8px;border-width:1px 0 0 1px}
.bp-corner.tr{top:8px;right:8px;border-width:1px 1px 0 0}
.bp-corner.bl{bottom:8px;left:8px;border-width:0 0 1px 1px}
.bp-corner.br{bottom:8px;right:8px;border-width:0 1px 1px 0}
.bp-card:hover .bp-corner{border-color:rgba(58,127,208,0.9);transition:border-color .25s}
.bp-grid{
  position:absolute;inset:0;opacity:.07;
  background-image:linear-gradient(rgba(58,127,208,1) 1px,transparent 1px),
    linear-gradient(90deg,rgba(58,127,208,1) 1px,transparent 1px);
  background-size:28px 28px
}
.bp-scan{
  position:absolute;top:0;left:0;right:0;height:1px;
  background:linear-gradient(90deg,transparent,rgba(58,127,208,0.6),transparent);
  animation:scanline 3.5s ease-in-out infinite;pointer-events:none;opacity:0
}
.bp-card:hover .bp-scan{opacity:1}
.bp-overlay{position:absolute;inset:0;background:linear-gradient(to top,rgba(3,3,4,.95) 28%,rgba(3,3,4,.15) 65%,transparent)}
.bp-play{
  position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) scale(.8);
  opacity:0;transition:all .28s var(--ez);
  width:46px;height:46px;border:1px solid rgba(58,127,208,.7);
  display:flex;align-items:center;justify-content:center
}
.bp-card:hover .bp-play{opacity:1;transform:translate(-50%,-50%) scale(1)}

/* ── QUICK ACCESS ── */
.qa{position:relative;overflow:hidden;cursor:pointer}
.qa::after{
  content:'';position:absolute;bottom:0;left:0;right:0;height:1px;
  background:rgba(255,255,255,0.5);transform:scaleX(0);
  transition:transform .4s var(--ez);transform-origin:left
}
.qa:hover::after{transform:scaleX(1)}
.qa .qn{transition:color .25s}
.qa:hover .qn{color:var(--t1)}

/* ── TOAST ── */
.twrap{position:fixed;bottom:22px;right:22px;z-index:99999;display:flex;flex-direction:column;gap:7px;pointer-events:none}
.tst{
  padding:11px 16px;font-family:var(--font-nm);font-size:10px;
  letter-spacing:.1em;animation:tslide .35s var(--ez) both;
  max-width:300px;line-height:1.55;border-radius:1px
}
.tok{background:#060f0a;border:1px solid rgba(45,184,122,.35);color:#5ccc98}
.terr{background:#0f0606;border:1px solid rgba(192,72,72,.38);color:#d98080}
.tinf{background:var(--s2);border:1px solid var(--e2);color:var(--t2)}

/* ── SHIMMER SKELETON ── */
.shim{
  background:linear-gradient(90deg,var(--s2) 0%,var(--s3) 50%,var(--s2) 100%);
  background-size:200% 100%;animation:shimmer 1.5s ease-in-out infinite;border-radius:1px
}

/* ── STATUS BADGE ── */
.sbadge{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:1px}

/* ── CONSOLE ── */
.console-line{
  font-family:var(--font-mono);font-size:10px;color:#2fba7a;
  line-height:2;letter-spacing:.04em;white-space:pre
}
.console-dim{color:rgba(47,186,122,0.38)}
.console-muted{color:rgba(47,186,122,0.22)}

/* ── BATTERY BAR ── */
.bat-bar{
  width:22px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);
  border-radius:1px;overflow:hidden;position:relative
}
.bat-fill{
  position:absolute;bottom:0;left:0;right:0;
  transition:height 1.2s var(--ez);border-radius:0
}
.bat-cap{
  width:10px;height:3px;background:rgba(255,255,255,0.15);
  border:1px solid rgba(255,255,255,0.12);border-radius:1px;
  margin:0 auto 2px;flex-shrink:0
}

/* ── PROGRESS BAR ── */
.pbar{height:1.5px;background:rgba(255,255,255,0.07);border-radius:1px;overflow:hidden}
.pbar-fill{height:100%;transition:width .5s var(--ez);border-radius:1px}

/* ── TABS ── */
.tab-btn{
  flex:1;padding:13px 8px;background:transparent;border:none;cursor:pointer;
  font-family:var(--font-nm);font-size:9px;letter-spacing:.18em;
  text-transform:uppercase;font-weight:600;transition:color .2s;
  border-bottom:1.5px solid transparent;margin-bottom:-1px
}
.tab-btn.on{color:var(--t1);border-bottom-color:var(--white)}
.tab-btn:not(.on){color:var(--t3)}
.tab-btn:hover:not(.on){color:var(--t2)}

/* ── MOBILE ── */
/* ── UPLOAD ZONE ── */
.upzone{
  border:1px dashed var(--e2);border-radius:1px;padding:22px 18px;text-align:center;
  cursor:pointer;transition:border-color .18s,background .18s;background:transparent
}
.upzone:hover,.upzone.drag{border-color:rgba(255,255,255,.3);background:rgba(255,255,255,.018)}
.upzone input[type=file]{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%}

/* ── MEDIA THUMBS ── */
.mthumb{
  position:relative;aspect-ratio:16/9;overflow:hidden;border-radius:1px;
  border:1px solid var(--e1);cursor:pointer;background:var(--s1)
}
.mthumb img,.mthumb video{width:100%;height:100%;object-fit:cover}
.mthumb-del{
  position:absolute;top:5px;right:5px;
  width:22px;height:22px;border-radius:50%;
  background:rgba(192,72,72,.85);border:none;cursor:pointer;
  display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .18s
}
.mthumb:hover .mthumb-del{opacity:1}
.mthumb-overlay{
  position:absolute;inset:0;background:rgba(3,3,4,.5);
  display:flex;align-items:center;justify-content:center;
  opacity:0;transition:opacity .2s
}
.mthumb:hover .mthumb-overlay{opacity:1}

/* ── PHOTO GALLERY (tableros) ── */
.pgallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:1px}
.pgallery-item{position:relative;aspect-ratio:4/3;overflow:hidden;cursor:pointer;background:var(--s1);border:1px solid var(--e1)}
.pgallery-item img{width:100%;height:100%;object-fit:cover;transition:transform .35s var(--ez)}
.pgallery-item:hover img{transform:scale(1.04)}
.pgallery-add{
  aspect-ratio:4/3;border:1px dashed var(--e2);display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:7px;cursor:pointer;
  background:transparent;transition:background .18s,border-color .18s;position:relative
}
.pgallery-add:hover{background:rgba(255,255,255,.012);border-color:rgba(255,255,255,.2)}

@media(max-width:820px){
  .sidebar{transform:translateX(-100%);transition:transform .28s var(--ez)}
  .sidebar.open{transform:translateX(0)}
  .content{margin-left:0!important;padding-top:50px!important}
  .mob-hdr{display:flex!important}
  .mob-ovl{display:block!important}
}
`;

/* ─────────────────────────────────────────────────────────────
   HELPERS
   ───────────────────────────────────────────────────────────── */
const ls = (k,v) => { try{if(v!==undefined)localStorage.setItem("ka_"+k,v);return localStorage.getItem("ka_"+k)||"";}catch{return ""} };
const df = d => d?new Date(d).toLocaleDateString("es-AR",{day:"2-digit",month:"short",year:"numeric"}):"";
const tf = d => d?new Date(d).toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"}):"";
const pad = n => String(n).padStart(2,"0");

/* ─────────────────────────────────────────────────────────────
   TOAST
   ───────────────────────────────────────────────────────────── */
function useToast(){
  const [list,setL]=useState([]);
  const push=useCallback((msg,type="inf")=>{
    const id=Date.now()+Math.random();
    setL(t=>[...t,{id,msg,type}]);
    setTimeout(()=>setL(t=>t.filter(x=>x.id!==id)),4200);
  },[]);
  return{list,push};
}
function Toasts({list}){
  return(<div className="twrap">{list.map(t=>{const k=t.type.slice(0,2);return<div key={t.id} className={`tst ${k==="ok"?"tok":k==="er"?"terr":"tinf"}`}>{t.msg}</div>})}</div>);
}

/* ─────────────────────────────────────────────────────────────
   MICRO-COMPONENTS
   ───────────────────────────────────────────────────────────── */
function Cap({children,style:st={},sm}){
  return <span style={{fontFamily:"var(--font-nm)",fontSize:sm?8:9,letterSpacing:".2em",textTransform:"uppercase",fontWeight:600,color:"var(--t3)",...st}}>{children}</span>;
}
function SH({eyebrow,title}){
  return(
    <div style={{marginBottom:44}}>
      <div className="wline" style={{marginBottom:16}}/>
      {eyebrow&&<div style={{marginBottom:10}}><Cap>{eyebrow}</Cap></div>}
      <h1 style={{fontFamily:"var(--font-nm)",fontWeight:200,fontSize:"clamp(26px,3vw,40px)",color:"var(--t1)",lineHeight:1.05,letterSpacing:"-.025em"}}>{title}</h1>
    </div>
  );
}
function Lbl({children}){
  return <label style={{display:"block",fontFamily:"var(--font-nm)",fontSize:8.5,letterSpacing:".2em",textTransform:"uppercase",fontWeight:600,color:"var(--t3)",marginBottom:8}}>{children}</label>;
}
function SBadge({estado}){
  const m={
    pendiente:{c:"var(--warn)",bg:"var(--warn2)",l:"Pendiente"},
    en_proceso:{c:"var(--info)",bg:"var(--info2)",l:"En Proceso"},
    solucionado:{c:"var(--ok)",bg:"var(--ok2)",l:"Solucionado"}
  };
  const e=m[estado]||m.pendiente;
  return(<span className="sbadge" style={{background:e.bg,border:`1px solid ${e.c}40`}}>
    <span style={{width:4,height:4,borderRadius:"50%",background:e.c,flexShrink:0}}/>
    <Cap sm style={{color:e.c}}>{e.l}</Cap>
  </span>);
}
function StatusDot({ok,pulse}){
  return <span style={{width:5,height:5,borderRadius:"50%",background:ok?"var(--ok)":"var(--err)",flexShrink:0,display:"inline-block",animation:pulse?"pulse 2s ease-in-out infinite":"none"}}/>;
}
function Divider(){
  return <div style={{height:1,background:"var(--e1)",margin:"0"}}/>
}







/* ─────────────────────────────────────────────────────────────
   WINDY EMBED WIDGET
   ───────────────────────────────────────────────────────────── */
function WindyWidget(){
  const [loaded,setLoaded]=useState(false);
  const src="https://embed.windy.com/embed.html?type=map&location=coordinates&metricRain=default&metricTemp=%C2%B0C&metricWind=km%2Fh&zoom=10&overlay=wind&product=ecmwf&level=surface&lat=-34.40&lon=-58.58";
  return(
    <div style={{border:"1px solid var(--e2)",borderRadius:1,overflow:"hidden",background:"var(--s1)"}}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:10,padding:"11px 18px",borderBottom:"1px solid var(--e1)",background:"rgba(5,6,9,0.9)"}}>
        <Wind size={11} color="var(--t3)"/>
        <Cap>Radar Meteorológico · ECMWF</Cap>
        <div style={{display:"flex",alignItems:"center",gap:6,marginLeft:"auto"}}>
          {loaded&&<><span style={{width:5,height:5,borderRadius:"50%",background:"var(--ok)",animation:"pulse 2s ease-in-out infinite"}}/>
          <span style={{fontFamily:"var(--font-mono)",fontSize:8,color:"var(--ok)",letterSpacing:".08em"}}>LIVE</span></>}
          {!loaded&&<span style={{fontFamily:"var(--font-mono)",fontSize:8,color:"var(--t3)",letterSpacing:".06em"}}>CARGANDO…</span>}
        </div>
        <span style={{fontFamily:"var(--font-mono)",fontSize:7.5,color:"var(--t3)",marginLeft:8,letterSpacing:".06em"}}>POWERED BY WINDY</span>
      </div>
      {/* Iframe wrapper with filter overlay */}
      <div style={{position:"relative",overflow:"hidden",height:420}}>
        {/* Monochrome overlay — pointer-events:none so the map sigue siendo interactivo */}
        <div style={{
          position:"absolute",inset:0,zIndex:2,pointerEvents:"none",
          background:"rgba(5,5,8,0.28)",
          boxShadow:"inset 0 0 0 1px rgba(255,255,255,0.04)"
        }}/>
        {!loaded&&(
          <div style={{position:"absolute",inset:0,zIndex:3,display:"flex",alignItems:"center",justifyContent:"center",background:"#050609"}}>
            <div style={{textAlign:"center"}}>
              <div style={{display:"flex",flexDirection:"column",gap:3,alignItems:"center",marginBottom:14}}>
                {[100,70,50,70,100].map((w,i)=><div key={i} className="shim" style={{height:2,width:w+"%",maxWidth:180}}/>)}
              </div>
              <Cap sm style={{color:"var(--t3)"}}>Iniciando radar...</Cap>
            </div>
          </div>
        )}
        <iframe
          src={src}
          onLoad={()=>setLoaded(true)}
          width="100%"
          height="100%"
          style={{
            border:"none",
            display:"block",
            filter:"grayscale(75%) contrast(115%) brightness(0.88)",
            width:"100%",height:"100%"
          }}
          title="Windy Weather Radar"
          loading="lazy"
          allow="geolocation"
        />
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   SEC BIENVENIDA
   ───────────────────────────────────────────────────────────── */
function SecBienvenida({cliente,goTo}){
  const [wx,setWx]=useState(null);
  const [loaded,setLoaded]=useState(false);
  useEffect(()=>{
    const get=async(lat,lon)=>{
      try{
        const r=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,wind_speed_10m,wind_direction_10m&timezone=auto`);
        const d=await r.json();
        const dirs=["N","NE","E","SE","S","SO","O","NO"];
        setWx({t:Math.round(d.current.temperature_2m),w:Math.round(d.current.wind_speed_10m),d:dirs[Math.round(d.current.wind_direction_10m/45)%8]});
      }catch{setWx({t:"—",w:"—",d:"—"})}
    };
    if(navigator.geolocation)navigator.geolocation.getCurrentPosition(p=>get(p.coords.latitude,p.coords.longitude),()=>get(-34.425,-58.544));
    else get(-34.425,-58.544);
  },[]);

  const img=cliente?.imagen_unidad||"https://images.unsplash.com/photo-1567899378494-47b22a2ae96a?w=1800&q=90";
  const name=(cliente?.nombre_completo||"").split(" ")[0];
  const hull=[cliente?.nombre_barco,cliente?.numero_unidad].filter(Boolean).join("  ·  ");
  const QA=[
    {n:"01",t:"Energía",d:"Tableros · 12V · 220V",s:"energia",ico:<Zap size={14}/>},
    {n:"02",t:"Propulsión",d:"Motores · Maniobra",s:"propulsion",ico:<Gauge size={14}/>},
    {n:"03",t:"Sistemas",d:"Tanques · Bombas",s:"sistemas",ico:<Settings size={14}/>},
    {n:"04",t:"Seguridad",d:"Emergencia · Diagnóstico",s:"seguridad",ico:<Shield size={14}/>},
    {n:"05",t:"Videoteca",d:"Procedimientos técnicos",s:"tutoriales",ico:<Play size={14}/>},
    {n:"06",t:"Garantía",d:"Reportar una novedad",s:"soporte",ico:<MessageSquare size={14}/>},
  ];
  return(
    <div>
      {/* ── HERO ── */}
      <div style={{position:"relative",width:"100%",height:"min(78vh,620px)",overflow:"hidden"}}>
        <img src={img} onLoad={()=>setLoaded(true)}
          style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",objectPosition:"center 35%",
            animation:loaded?"ken 16s ease-out both":"none",opacity:loaded?1:0,transition:"opacity .9s"}} alt=""/>
        {/* Color grade overlays */}
        <div style={{position:"absolute",inset:0,background:"linear-gradient(120deg,rgba(3,3,4,.95) 0%,rgba(3,3,4,.55) 40%,rgba(3,3,4,.22) 100%)"}}/>
        <div style={{position:"absolute",inset:0,background:"linear-gradient(to top,rgba(3,3,4,1) 0%,rgba(3,3,4,.5) 24%,transparent 52%)"}}/>
        {/* Subtle vignette */}
        <div style={{position:"absolute",inset:0,background:"radial-gradient(ellipse at 100% 0%,rgba(58,127,208,0.055) 0%,transparent 55%)"}}/>

        {/* Weather pill — top right */}
        {wx&&(
          <div style={{position:"absolute",top:"clamp(16px,3.5vw,30px)",right:"clamp(16px,3.5vw,36px)",display:"flex",gap:1,animation:"fin 1.2s .6s both"}}>
            <div className="card-glass" style={{padding:"8px 14px",display:"flex",alignItems:"center",gap:9}}>
              <StatusDot ok pulse/>
              <span style={{fontFamily:"var(--font-mono)",fontSize:9,color:"var(--t1)",letterSpacing:".12em"}}>{wx.t}°C</span>
              <span style={{width:1,height:10,background:"var(--e2)"}}/>
              <Wind size={9} color="var(--t3)"/>
              <span style={{fontFamily:"var(--font-mono)",fontSize:9,color:"var(--t2)",letterSpacing:".08em"}}>{wx.d} {wx.w} KM/H</span>
            </div>
          </div>
        )}

        {/* Hero text */}
        <div style={{position:"absolute",bottom:"clamp(28px,6vw,60px)",left:"clamp(24px,5vw,60px)",maxWidth:600}}>
          <div style={{marginBottom:14,animation:"fup .7s .06s var(--ez) both"}}>
            <Cap style={{letterSpacing:".28em"}}>{cliente?.modelo_barco}</Cap>
          </div>
          <div style={{animation:"fup .8s .16s var(--ez) both"}}>
            <h1 style={{fontFamily:"var(--font-nm)",fontWeight:200,fontSize:"clamp(44px,8vw,94px)",color:"var(--white)",lineHeight:.88,letterSpacing:"-.04em"}}>{name}</h1>
          </div>
          {hull&&(
            <div style={{marginTop:18,animation:"fup .8s .28s var(--ez) both"}}>
              <div style={{display:"inline-flex",alignItems:"center",gap:10,paddingLeft:12,borderLeft:"1px solid rgba(255,255,255,0.3)"}}>
                <span style={{fontFamily:"var(--font-mono)",fontSize:9.5,color:"rgba(255,255,255,0.55)",letterSpacing:".12em"}}>{hull}</span>
              </div>
            </div>
          )}
          {/* Warm greeting */}
          <div style={{marginTop:16,animation:"fup .8s .36s var(--ez) both"}}>
            <p style={{fontFamily:"var(--font-nm)",fontSize:14,fontWeight:300,color:"rgba(255,255,255,0.45)",lineHeight:1.6,maxWidth:440}}>
              Bienvenido a su manual digital. Aquí encontrará todo lo que necesita para operar y mantener su embarcación con confianza.
            </p>
          </div>
          <div style={{display:"flex",gap:8,marginTop:26,animation:"fup .8s .46s var(--ez) both",flexWrap:"wrap"}}>
            <button onClick={()=>goTo("soporte")}
              style={{padding:"12px 28px",background:"var(--white)",color:"#030304",border:"none",fontFamily:"var(--font-nm)",fontWeight:600,fontSize:9,letterSpacing:".2em",textTransform:"uppercase",cursor:"pointer",borderRadius:1,transition:"opacity .2s,transform .2s"}}
              onMouseEnter={e=>{e.currentTarget.style.opacity=".88";e.currentTarget.style.transform="translateY(-1px)"}}
              onMouseLeave={e=>{e.currentTarget.style.opacity="1";e.currentTarget.style.transform="translateY(0)"}}>
              Reportar Falla
            </button>
            <button onClick={()=>goTo("seguridad")}
              style={{padding:"12px 24px",background:"rgba(255,255,255,.05)",color:"rgba(255,255,255,.7)",border:"1px solid rgba(255,255,255,.15)",fontFamily:"var(--font-nm)",fontWeight:400,fontSize:9,letterSpacing:".2em",textTransform:"uppercase",cursor:"pointer",borderRadius:1,backdropFilter:"blur(8px)",transition:"border-color .2s,color .2s"}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor="rgba(255,255,255,.35)";e.currentTarget.style.color="rgba(255,255,255,.95)"}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(255,255,255,.15)";e.currentTarget.style.color="rgba(255,255,255,.7)"}}>
              Emergencia
            </button>
          </div>
        </div>
        {/* Bottom rule line */}
        <div style={{position:"absolute",bottom:0,left:0,right:0,height:1,background:"linear-gradient(90deg,rgba(255,255,255,0.18),rgba(255,255,255,0.04),transparent 70%)"}}/>
      </div>

      {/* ── WINDY RADAR ── */}
      <div style={{background:"var(--void)"}}>
        <WindyWidget/>
      </div>

      {/* ── QUICK ACCESS ── */}
      <div className="stg" style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:1,marginTop:1}}>
        {QA.map(a=>(
          <button key={a.s} className="qa"
            onClick={()=>goTo(a.s)}
            style={{padding:"22px 16px 18px",background:"var(--s2)",border:"none",borderTop:"1px solid var(--e1)",cursor:"pointer",textAlign:"left",transition:"background .22s"}}
            onMouseEnter={e=>e.currentTarget.style.background="var(--s3)"}
            onMouseLeave={e=>e.currentTarget.style.background="var(--s2)"}>
            <span className="qn" style={{display:"block",color:"var(--t3)",marginBottom:12}}>{a.ico}</span>
            <span style={{display:"block",fontFamily:"var(--font-mono)",fontSize:8.5,color:"var(--t3)",marginBottom:10,letterSpacing:".06em"}}>{a.n}</span>
            <span style={{display:"block",fontFamily:"var(--font-nm)",fontSize:9.5,fontWeight:600,letterSpacing:".14em",textTransform:"uppercase",color:"var(--t2)",marginBottom:4}}>{a.t}</span>
            <span style={{display:"block",fontFamily:"var(--font-nm)",fontSize:10.5,color:"var(--t3)",fontWeight:300}}>{a.d}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   SEC IDENTIDAD
   ───────────────────────────────────────────────────────────── */
function SecIdentidad({cliente,push}){
  const KS=["mat","mmsi","senal","wssid","wpass","scia","spol","svto","tmec","trem"];
  const [v,setV]=useState(()=>Object.fromEntries(KS.map(k=>[k,ls(k)])));
  const [saved,setSaved]=useState(false);
  const [showPass,setShowPass]=useState(false);
  const up=(k,val)=>setV(p=>({...p,[k]:val}));
  const save=()=>{KS.forEach(k=>ls(k,v[k]||""));setSaved(true);push("Guardado en este dispositivo","ok");setTimeout(()=>setSaved(false),3000)};
  const F=({k,l,ph,type="text"})=>(<div style={{marginBottom:20}}><Lbl>{l}</Lbl><input className="inp" type={type} value={v[k]} placeholder={ph} onChange={e=>up(k,e.target.value)}/></div>);
  return(
    <div className="senter">
      <SH eyebrow="Manual" title="Identidad de la Unidad"/>
      <div className="stg" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(310px,1fr))",gap:1}}>
        <div className="card" style={{padding:"34px 28px"}}>
          <div style={{display:"flex",alignItems:"center",gap:14,paddingBottom:22,marginBottom:22,borderBottom:"1px solid var(--e1)"}}>
            <div style={{width:44,height:44,border:"1px solid var(--e2)",display:"flex",alignItems:"center",justifyContent:"center",background:"var(--s3)",flexShrink:0}}>
              <Anchor size={18} color="var(--t3)"/>
            </div>
            <div>
              <p style={{fontFamily:"var(--font-nm)",fontSize:20,fontWeight:300,color:"var(--t1)",letterSpacing:"-.02em"}}>{cliente?.modelo_barco}</p>
              <p style={{fontFamily:"var(--font-mono)",fontSize:9.5,color:"var(--t3)",letterSpacing:".1em",marginTop:3}}>{[cliente?.nombre_barco,cliente?.numero_unidad].filter(Boolean).join("  ·  ")}</p>
            </div>
          </div>
          <F k="mat" l="Matrícula" ph="RP-123456"/>
          <F k="mmsi" l="MMSI / Radio VHF" ph="701000452"/>
          <F k="senal" l="Señal Distintiva" ph="LW 9844"/>
          <div style={{padding:"16px 18px",background:"var(--info2)",border:"1px solid rgba(58,127,208,.15)",borderRadius:1,marginTop:8}}>
            <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:12}}><Wifi size={10} color="var(--info)"/><Lbl>Red WiFi Abordo</Lbl></div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
              <div><Lbl>Red</Lbl><input className="inp" value={v["wssid"]} placeholder="Nombre" onChange={e=>up("wssid",e.target.value)}/></div>
              <div style={{position:"relative"}}>
                <Lbl>Clave</Lbl>
                <input className="inp" type={showPass?"text":"password"} value={v["wpass"]} placeholder="Contraseña" onChange={e=>up("wpass",e.target.value)}
                  style={{paddingRight:28}}/>
                <button onClick={()=>setShowPass(s=>!s)} style={{position:"absolute",right:0,bottom:9,background:"transparent",border:"none",cursor:"pointer",color:"var(--t3)",display:"flex",padding:0}}>
                  {showPass?<EyeOff size={13}/>:<Eye size={13}/>}
                </button>
              </div>
            </div>
          </div>
        </div>
        <div className="card" style={{padding:"34px 28px"}}>
          <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:22}}><FileText size={11} color="var(--t3)"/><Cap>Documentación y Seguros</Cap></div>
          <F k="scia" l="Compañía de Seguros" ph="Ej: Sancor Seguros"/>
          <F k="spol" l="Número de Póliza" ph="Número"/>
          <F k="svto" l="Vencimiento" ph="" type="date"/>
          <div style={{padding:"16px 18px",background:"var(--ok2)",border:"1px solid rgba(45,184,122,.15)",borderRadius:1,margin:"22px 0"}}>
            <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:12}}><Phone size={10} color="var(--ok)"/><Lbl>Contactos de Emergencia</Lbl></div>
            <div style={{marginBottom:14}}><Lbl>Mecánico / Técnico</Lbl><input className="inp" value={v["tmec"]} placeholder="+54 9 11 ···· ····" onChange={e=>up("tmec",e.target.value)}/></div>
            <Lbl>Asistencia / Remolque</Lbl>
            <input className="inp" value={v["trem"]} placeholder="+54 9 ···· ···· ····" onChange={e=>up("trem",e.target.value)}/>
          </div>
          <button onClick={save}
            style={{width:"100%",padding:"13px",background:saved?"var(--ok2)":"transparent",border:`1px solid ${saved?"rgba(45,184,122,.4)":"var(--e2)"}`,color:saved?"var(--ok)":"var(--t3)",fontFamily:"var(--font-nm)",fontWeight:600,fontSize:8.5,letterSpacing:".2em",textTransform:"uppercase",cursor:"pointer",transition:"all .3s",borderRadius:1,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            {saved?<><Check size={11}/> GUARDADO</>:"GUARDAR EN ESTE DISPOSITIVO"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   SEC PLANIFICADOR
   ───────────────────────────────────────────────────────────── */
function SecPlanificador({mc}){
  const maxF=mc?.combustible||1200;
  const [pct,setP]=useState(50),[spd,setS]=useState(22),[con,setC]=useState(120);
  const lts=Math.round(pct/100*maxF);
  const hrs=con>0?(lts/con).toFixed(1):"--";
  const nm=isNaN(+hrs)?"--":Math.round(+hrs*spd);
  const ITEMS=[
    {id:"c1",t:"Bancos de Baterías — Voltaje OK"},
    {id:"c2",t:"Cable 220V Desconectado del muelle",hl:true},
    {id:"c3",t:"Aceite y Refrigerante — Niveles OK"},
    {id:"c4",t:"Grifos de Fondo ABIERTOS",hl:true},
    {id:"c5",t:"Sentinas Secas"},
    {id:"c6",t:"Chalecos Salvavidas Accesibles"},
    {id:"c7",t:"Combustible y Válvulas Abiertas"},
    {id:"c8",t:"GPS, VHF y Luces de Navegación"},
    {id:"c9",t:"Documentación a Bordo"},
    {id:"c10",t:"Pronóstico Consultado"},
  ];
  const [chk,setChk]=useState(()=>Object.fromEntries(ITEMS.map(c=>[c.id,ls("c_"+c.id)==="true"])));
  const tog=id=>{const n=!chk[id];setChk(p=>({...p,[id]:n}));ls("c_"+id,n)};
  const done=Object.values(chk).filter(Boolean).length;
  const pDone=Math.round(done/ITEMS.length*100);
  return(
    <div className="senter">
      <SH eyebrow="Navegación" title="Planificador de Viaje"/>
      <div className="stg" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(310px,1fr))",gap:1,marginBottom:1}}>
        {/* Autonomía */}
        <div className="card" style={{padding:"34px 28px"}}>
          <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:24}}><Gauge size={11} color="var(--t3)"/><Cap>Calculadora de Autonomía</Cap></div>
          <div style={{marginBottom:22}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:12}}>
              <Lbl>Nivel de Combustible</Lbl>
              <span style={{fontFamily:"var(--font-mono)",fontSize:28,color:"var(--t1)",fontWeight:400,lineHeight:1}}>{pct}<span style={{fontSize:11,color:"var(--t3)",marginLeft:1}}>%</span></span>
            </div>
            <div className="pbar" style={{marginBottom:6}}>
              <div className="pbar-fill" style={{width:pct+"%",background:pct>60?"var(--ok)":pct>30?"var(--warn)":"var(--err)"}}/>
            </div>
            <input type="range" min="0" max="100" value={pct} onChange={e=>setP(+e.target.value)}
              style={{width:"100%",opacity:0,height:16,marginTop:-10,cursor:"pointer",position:"relative",zIndex:2}}/>
            <p style={{fontFamily:"var(--font-mono)",fontSize:9,color:"var(--t3)",textAlign:"right",marginTop:2}}>{lts} L · Cap. {maxF} L</p>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:22,marginBottom:24}}>
            {[{l:"Velocidad (Kn)",v:spd,s:setS},{l:"Consumo (L/h)",v:con,s:setC}].map(f=>(
              <div key={f.l}><Lbl>{f.l}</Lbl><input type="number" className="inp" value={f.v} onChange={e=>f.s(+e.target.value)}
                style={{fontFamily:"var(--font-mono)",fontSize:28,color:"var(--t1)",textAlign:"center",letterSpacing:"-.01em"}}/></div>
            ))}
          </div>
          <div style={{padding:"18px 22px",border:"1px solid rgba(255,255,255,.1)",background:"rgba(255,255,255,.025)",textAlign:"center",borderRadius:1}}>
            <Cap sm>Autonomía Estimada</Cap>
            <p style={{fontFamily:"var(--font-mono)",fontSize:34,color:"var(--t1)",fontWeight:400,letterSpacing:"-.02em",marginTop:8,lineHeight:1}}>
              {hrs}<span style={{fontSize:14,color:"var(--t3)",marginLeft:4}}>h</span>
              <span style={{fontSize:20,color:"var(--e2)",margin:"0 10px"}}>/</span>
              {nm}<span style={{fontSize:14,color:"var(--t3)",marginLeft:4}}>NM</span>
            </p>
          </div>
        </div>
        {/* Checklist */}
        <div className="card" style={{padding:"34px 28px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{display:"flex",alignItems:"center",gap:7}}><Navigation size={11} color="var(--t3)"/><Cap>Protocolo Pre-Zarpe</Cap></div>
            <span style={{fontFamily:"var(--font-mono)",fontSize:10,color:done===ITEMS.length?"var(--ok)":"var(--t3)"}}>{done}/{ITEMS.length}</span>
          </div>
          <div style={{marginBottom:18}}>
            <div className="pbar"><div className="pbar-fill" style={{width:pDone+"%",background:done===ITEMS.length?"var(--ok)":"var(--info)"}}/></div>
            <div style={{display:"flex",justifyContent:"space-between",marginTop:7}}>
              <Cap sm>{pDone}% completado</Cap>
              <button onClick={()=>{setChk(Object.fromEntries(ITEMS.map(c=>[c.id,false])));ITEMS.forEach(c=>ls("c_"+c.id,"false"))}}
                style={{fontFamily:"var(--font-nm)",fontSize:7.5,letterSpacing:".14em",color:"var(--t3)",background:"transparent",border:"none",cursor:"pointer",textTransform:"uppercase",padding:0,transition:"color .18s",display:"flex",alignItems:"center",gap:5}}
                onMouseEnter={e=>e.currentTarget.style.color="var(--t2)"} onMouseLeave={e=>e.currentTarget.style.color="var(--t3)"}>
                <RotateCcw size={9}/>REINICIAR
              </button>
            </div>
          </div>
          {ITEMS.map(c=>(
            <div key={c.id} className="cr" onClick={()=>tog(c.id)}>
              <div style={{width:15,height:15,border:`1px solid ${chk[c.id]?"var(--ok)":"var(--e2)"}`,flexShrink:0,marginTop:1,display:"flex",alignItems:"center",justifyContent:"center",transition:"all .18s",background:chk[c.id]?"var(--ok2)":"transparent"}}>
                {chk[c.id]&&<Check size={8} color="var(--ok)"/>}
              </div>
              <span style={{fontSize:12,fontWeight:300,color:c.hl?chk[c.id]?"var(--warn)":"var(--warn)":chk[c.id]?"var(--t1)":"var(--t2)",transition:"color .18s"}}>{c.t}</span>
            </div>
          ))}
        </div>
      </div>
      {/* Bitácora */}
      <div className="card" style={{padding:"30px 28px"}}>
        <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:20}}><Activity size={11} color="var(--t3)"/><Cap>Bitácora de Mantenimiento</Cap></div>
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead><tr style={{borderBottom:"1px solid var(--e1)"}}>{["Ítem","Estado","Observaciones"].map(h=><th key={h} style={{textAlign:"left",paddingBottom:11,paddingRight:18}}><Cap sm>{h}</Cap></th>)}</tr></thead>
          <tbody>{["Motores","Generador","Fondo / Pintura","Hélices","Ánodos"].map(it=>(
            <tr key={it} style={{borderBottom:"1px solid rgba(255,255,255,.025)"}}>
              <td style={{padding:"12px 18px 12px 0",color:"var(--t1)",fontSize:13,fontWeight:300,whiteSpace:"nowrap"}}>{it}</td>
              <td style={{padding:"12px 18px 12px 0"}}><select className="sel" style={{width:"auto",fontSize:11,color:"var(--t2)",padding:"3px 0"}}><option>OK</option><option>Atención</option><option>Service Pendiente</option></select></td>
              <td style={{padding:"12px 0"}}><input className="inp" style={{fontSize:12,color:"var(--t2)"}} placeholder="Sin observaciones"/></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   SEC ENERGÍA
   ───────────────────────────────────────────────────────────── */
function SecEnergia({mc}){
  const tieneGrupo=mc?.tiene_grupo??true;
  const [tab,setTab]=useState("puerto");
  const TABS=[{id:"puerto",l:"Puerto 220V"},...(tieneGrupo?[{id:"grupo",l:"Generador"}]:[]),{id:"inv",l:"Inverter"}];
  const DATA={
    puerto:{t:"Conexión a Marina — 220V",steps:["Selector de fuente en APAGADO antes de conectar.","Conectar cable Marechal del muelle al barco.","Selectora a C.A. TIERRA — testigo VERDE = polaridad OK.","Testigo ROJO: invertir ficha en muelle (fase invertida)."],note:"No opere equipos con polaridad invertida — riesgo de daño eléctrico."},
    grupo:{t:"Grupo Electrógeno",steps:["Apagar todos los Aires Acondicionados.","Verificar combustible y agua de refrigeración del grupo.","Arrancar — esperar 30 seg a régimen estable.","Selectora a C.A. GRUPO."],note:"Dejar enfriar 3 minutos en marcha mínima antes de apagar."},
    inv:{t:"Inverter — Baterías",steps:["Encender Inverter desde panel remoto.","Selectora pequeña a C.A. CONVERTIDOR.","NO usar Aires Acondicionados en este modo.","Monitorear voltaje — mínimo recomendado 12.0V."],note:"Para uso nocturno prolongado, mantener al menos 50% de carga."},
  };
  const ct=DATA[tab];
  const PANELS=[
    {t:"Cortes de Batería",d:"Principal · Servicio",c:"var(--err)",ico:<Power size={14}/>},
    {t:"Tablero 12V",d:"Luces · Bombas · Nav",c:"var(--warn)",ico:<Zap size={14}/>},
    {t:"Gestión 220V",d:"Puerto · Grupo · Inverter",c:"var(--info)",ico:<Activity size={14}/>},
  ];
  return(
    <div className="senter">
      <SH eyebrow="Energía" title="Tableros y Sistemas 220V"/>
      <div className="stg">
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:1,marginBottom:1}}>
          {PANELS.map(b=>(
            <div key={b.t} className="card" style={{padding:"22px 20px",borderLeft:`1.5px solid ${b.c}`,display:"flex",gap:14,alignItems:"center"}}>
              <div style={{width:36,height:36,display:"flex",alignItems:"center",justifyContent:"center",background:`${b.c}12`,flexShrink:0,borderRadius:1,color:b.c}}>{b.ico}</div>
              <div>
                <p style={{color:"var(--t1)",fontSize:13,fontWeight:400,marginBottom:3}}>{b.t}</p>
                <Cap sm>{b.d}</Cap>
              </div>
              <StatusDot ok style={{marginLeft:"auto",flexShrink:0}}/>
            </div>
          ))}
        </div>
        <div className="card">
          <div style={{display:"flex",borderBottom:"1px solid var(--e1)"}}>
            {TABS.map(t=>(
              <button key={t.id} onClick={()=>setTab(t.id)} className={`tab-btn${tab===t.id?" on":""}`}>{t.l}</button>
            ))}
          </div>
          <div style={{padding:"34px 28px",animation:"fin .3s both"}} key={tab}>
            <h3 style={{fontFamily:"var(--font-nm)",fontSize:22,fontWeight:300,color:"var(--t1)",marginBottom:26,letterSpacing:"-.02em"}}>{ct.t}</h3>
            <div style={{display:"flex",flexDirection:"column",gap:18,marginBottom:24}}>
              {ct.steps.map((s,i)=>(
                <div key={i} style={{display:"flex",gap:22,alignItems:"flex-start"}}>
                  <span style={{fontFamily:"var(--font-mono)",fontSize:9.5,color:"rgba(255,255,255,0.3)",flexShrink:0,marginTop:3}}>0{i+1}</span>
                  <p style={{color:"var(--t2)",fontSize:14,lineHeight:1.7,fontWeight:300}}>{s}</p>
                </div>
              ))}
            </div>
            {ct.note&&<div style={{padding:"13px 16px",borderLeft:"1.5px solid rgba(212,137,42,.5)",background:"var(--warn2)"}}><p style={{color:"var(--warn)",fontSize:12,fontWeight:400,lineHeight:1.7,fontFamily:"var(--font-nm)"}}>{ct.note}</p></div>}
          </div>
        </div>
        {/* ── FOTO TABLEROS ── */}
        <TableroFotos/>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   TABLERO FOTOS (galería de referencia visual)
   ───────────────────────────────────────────────────────────── */
function TableroFotos(){
  const [fotos,setFotos]=useState([]);
  const [lightbox,setLb]=useState(null);
  const [uploading,setUploading]=useState(false);
  const inputRef=useRef();

  const handleFiles=async(files)=>{
    const validos=[...files].filter(f=>f.type.startsWith("image/"));
    if(!validos.length)return;
    setUploading(true);
    const nuevas=await Promise.all(validos.map(f=>new Promise(res=>{
      const r=new FileReader();
      r.onload=e=>res({url:e.target.result,name:f.name,id:Date.now()+Math.random()});
      r.readAsDataURL(f);
    })));
    setFotos(p=>[...p,...nuevas]);
    setUploading(false);
  };

  const [drag,setDrag]=useState(false);
  return(
    <div className="card" style={{padding:"28px"}}>
      <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:18}}>
        <ImageIcon size={11} color="var(--t3)"/>
        <Cap>Referencia Visual — Tableros y Paneles</Cap>
        <span style={{marginLeft:"auto",fontFamily:"var(--font-mono)",fontSize:8,color:"var(--t3)"}}>{fotos.length} foto{fotos.length!==1?"s":""}</span>
      </div>
      <p style={{color:"var(--t3)",fontSize:12,fontWeight:300,lineHeight:1.65,marginBottom:18}}>
        Agregue fotos de sus tableros, paneles y componentes para tenerlos como referencia rápida. Se guardan solo en este dispositivo.
      </p>
      <div className="pgallery" style={{marginBottom:fotos.length?12:0}}>
        {fotos.map((f,i)=>(
          <div key={f.id} className="pgallery-item" onClick={()=>setLb(i)}>
            <img src={f.url} alt={f.name}/>
            <div style={{position:"absolute",inset:0,background:"rgba(3,3,4,.5)",opacity:0,transition:"opacity .2s",display:"flex",alignItems:"center",justifyContent:"center"}}
              onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=0}>
              <ZoomIn size={18} color="rgba(255,255,255,0.8)"/>
            </div>
            <button
              onClick={e=>{e.stopPropagation();setFotos(p=>p.filter(x=>x.id!==f.id))}}
              style={{position:"absolute",top:5,right:5,width:22,height:22,borderRadius:"50%",background:"rgba(192,72,72,.85)",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",opacity:0,transition:"opacity .18s"}}
              onMouseEnter={e=>{e.currentTarget.style.opacity=1;e.stopPropagation()}}
              onMouseLeave={e=>e.currentTarget.style.opacity=0}>
              <Trash2 size={9} color="#fff"/>
            </button>
          </div>
        ))}
        {/* Add button */}
        <div
          className={`pgallery-add${drag?" drag":""}`}
          onDragOver={e=>{e.preventDefault();setDrag(true)}}
          onDragLeave={()=>setDrag(false)}
          onDrop={e=>{e.preventDefault();setDrag(false);handleFiles(e.dataTransfer.files)}}
          onClick={()=>inputRef.current?.click()}>
          <input ref={inputRef} type="file" accept="image/*" multiple style={{display:"none"}} onChange={e=>handleFiles(e.target.files)}/>
          {uploading
            ?<div className="shim" style={{width:28,height:28,borderRadius:"50%"}}/>
            :<><Upload size={14} color="var(--t3)"/><Cap sm>Agregar foto</Cap></>}
        </div>
      </div>
      {fotos.length===0&&(
        <p style={{fontFamily:"var(--font-mono)",fontSize:9,color:"var(--t3)",textAlign:"center",padding:"8px 0"}}>Sin fotos guardadas · las imágenes no se suben a ningún servidor</p>
      )}
      {/* Lightbox */}
      {lightbox!==null&&(
        <div onClick={()=>setLb(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.96)",zIndex:99999,display:"flex",alignItems:"center",justifyContent:"center",padding:24,animation:"fin .2s both"}}>
          <button onClick={()=>setLb(null)} style={{position:"absolute",top:20,right:20,background:"transparent",border:"1px solid var(--e2)",color:"var(--t2)",padding:"7px 14px",cursor:"pointer",fontFamily:"var(--font-nm)",fontSize:9,letterSpacing:".14em",borderRadius:1,display:"flex",gap:6,alignItems:"center"}}><X size={11}/>CERRAR</button>
          <img src={fotos[lightbox]?.url} alt="" style={{maxWidth:"100%",maxHeight:"90vh",objectFit:"contain",animation:"fup .3s var(--ez) both"}}/>
          {fotos.length>1&&<>
            <button onClick={e=>{e.stopPropagation();setLb(i=>(i-1+fotos.length)%fotos.length)}} style={{position:"absolute",left:20,top:"50%",transform:"translateY(-50%)",background:"rgba(255,255,255,.06)",border:"1px solid var(--e2)",color:"var(--t2)",padding:"12px 10px",cursor:"pointer",borderRadius:1,fontSize:16}}>‹</button>
            <button onClick={e=>{e.stopPropagation();setLb(i=>(i+1)%fotos.length)}} style={{position:"absolute",right:20,top:"50%",transform:"translateY(-50%)",background:"rgba(255,255,255,.06)",border:"1px solid var(--e2)",color:"var(--t2)",padding:"12px 10px",cursor:"pointer",borderRadius:1,fontSize:16}}>›</button>
          </>}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   SEC PROPULSIÓN
   ───────────────────────────────────────────────────────────── */
function SecPropulsion({mc}){
  const tieneMando=mc?.tiene_mando_electronico??false;
  const [chk,setChk]=useState({});
  const steps=[
    {id:"p1",t:"Aceite y Refrigerante",d:"Varillas en ambos motores. Nivel entre Min y Max."},
    {id:"p2",t:"Grifos de Fondo ABIERTOS",d:"Apertura completa — entrada de agua salada.",hl:true},
    {id:"p3",t:"Palancas en NEUTRAL",d:"Punto muerto antes de dar contacto."},
    {id:"p4",t:"Ignition ON",d:"Esperar test de alarmas del panel (5 seg)."},
    {id:"p5",t:"Arranque y Verificación",d:"Verificar presión de aceite y temperatura."},
  ];
  const done=Object.values(chk).filter(Boolean).length;
  return(
    <div className="senter">
      <SH eyebrow="Propulsión" title="Motores y Sistemas de Mando"/>
      <div className="stg" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(310px,1fr))",gap:1,marginBottom:1}}>
        {/* Secuencia arranque */}
        <div className="card" style={{padding:"34px 28px"}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:20}}>
            <div style={{display:"flex",alignItems:"center",gap:7}}><Power size={11} color="var(--t3)"/><Cap>Secuencia de Arranque</Cap></div>
            <div style={{display:"flex",gap:10,alignItems:"center"}}>
              <span style={{fontFamily:"var(--font-mono)",fontSize:10,color:done===steps.length?"var(--ok)":"var(--t3)"}}>{done}/{steps.length}</span>
              <button onClick={()=>setChk({})}
                style={{background:"transparent",border:"none",cursor:"pointer",color:"var(--t3)",display:"flex",alignItems:"center",transition:"color .18s",padding:0}}
                onMouseEnter={e=>e.currentTarget.style.color="var(--t2)"} onMouseLeave={e=>e.currentTarget.style.color="var(--t3)"}><RotateCcw size={11}/></button>
            </div>
          </div>
          <div className="pbar" style={{marginBottom:20}}><div className="pbar-fill" style={{width:Math.round(done/steps.length*100)+"%",background:done===steps.length?"var(--ok)":"var(--info)"}}/></div>
          {steps.map(s=>{const on=!!chk[s.id];return(
            <div key={s.id} onClick={()=>setChk(p=>({...p,[s.id]:!p[s.id]}))} className="cr">
              <div style={{width:16,height:16,border:`1px solid ${on?"var(--ok)":"var(--e2)"}`,flexShrink:0,marginTop:2,display:"flex",alignItems:"center",justifyContent:"center",background:on?"var(--ok2)":"transparent",transition:"all .18s"}}>
                {on&&<Check size={8} color="var(--ok)"/>}
              </div>
              <div>
                <p style={{color:on?"var(--t1)":s.hl?"var(--warn)":"var(--t2)",fontSize:13,fontWeight:400,marginBottom:2,transition:"color .18s"}}>{s.t}</p>
                <p style={{color:"var(--t3)",fontSize:11,fontWeight:300,lineHeight:1.55}}>{s.d}</p>
              </div>
            </div>
          )})}
        </div>
        {/* Right column */}
        <div style={{display:"flex",flexDirection:"column",gap:1}}>
          {tieneMando&&(
            <div className="card" style={{padding:"26px 28px"}}>
              <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:16}}><Settings size={11} color="var(--t3)"/><Cap>Mando Electrónico</Cap></div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:1}}>
                {[{c:"var(--info)",t:"Tomar Mando",d:"Neutral · COMMAND 1.5s"},{c:"var(--warn)",t:"Calentamiento",d:"WARM 1.5s · luz parpadea"},{c:"#7a5fc0",t:"Sincronizar",d:"ENGINE 1.5s · una palanca"},{c:"var(--err)",t:"Falla Electrónica",d:"Override → mecánico"}].map(item=>(
                  <div key={item.t} style={{padding:"12px",borderLeft:`1.5px solid ${item.c}30`,background:`${item.c}06`}}>
                    <p style={{fontFamily:"var(--font-nm)",fontSize:7.5,fontWeight:600,letterSpacing:".12em",color:item.c,textTransform:"uppercase",marginBottom:5}}>{item.t}</p>
                    <p style={{color:"var(--t3)",fontSize:11,lineHeight:1.55,fontWeight:300}}>{item.d}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="card" style={{padding:"24px 28px"}}>
            <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:12}}><AlertTriangle size={11} color="var(--err)"/><Cap style={{color:"rgba(192,72,72,0.5)"}}>Protocolo de Apagado</Cap></div>
            <p style={{color:"var(--t2)",fontSize:13,fontWeight:300,lineHeight:1.75,marginBottom:12}}>Use siempre la <strong style={{color:"var(--t1)",fontWeight:500}}>LLAVE DE CONTACTO</strong>. Deje enfriar 5 minutos antes de apagar el panel.</p>
            <div style={{padding:"11px 14px",borderLeft:"1.5px solid rgba(192,72,72,.4)",background:"var(--err2)"}}><p style={{color:"#d08080",fontSize:11.5,fontWeight:300,lineHeight:1.65}}>El botón STOP ROJO es solo para emergencias. Usarlo habitualmente daña la inyección.</p></div>
          </div>
          <div className="card" style={{padding:"20px 28px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:14}}>
            <div><p style={{color:"var(--t1)",fontSize:13,fontWeight:400,marginBottom:3}}>Hélice de Proa</p><p style={{color:"var(--t3)",fontSize:11,fontWeight:300}}>Máximo 30 s continuo · Pausa 2 min</p></div>
            <div style={{width:40,height:40,borderRadius:"50%",border:"1px solid var(--e2)",display:"flex",alignItems:"center",justifyContent:"center",background:"var(--s3)",flexShrink:0}}>
              <Compass size={16} color="var(--t3)"/>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   SEC SISTEMAS
   ───────────────────────────────────────────────────────────── */
function SecSistemas({mc}){
  const ta=mc?.tiene_aguas??true,cc=mc?.combustible||1200,ac=mc?.agua||400;
  return(
    <div className="senter">
      <SH eyebrow="Sistemas" title="Tanques y Equipos a Bordo"/>
      <div className="stg">
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:1,marginBottom:1}}>
          {[{l:"Combustible Diesel",v:`${cc} L`,c:"var(--warn)",ico:<Droplets size={14}/>},{l:"Agua Potable",v:`${ac} L`,c:"var(--info)",ico:<Droplets size={14}/>},...(ta?[{l:"Aguas Negras",v:"Mar / Puerto",c:"var(--s4)",ico:<Activity size={14}/>}]:[])].map(it=>(
            <div key={it.l} className="card" style={{padding:"24px 20px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
                <div style={{width:1,height:28,background:it.c,opacity:.6}}/>
                <span style={{color:it.c,opacity:.6}}>{it.ico}</span>
              </div>
              <Cap sm style={{display:"block",marginBottom:8}}>{it.l}</Cap>
              <p style={{fontFamily:"var(--font-mono)",fontSize:24,fontWeight:400,color:"var(--t1)",lineHeight:1}}>{it.v}</p>
            </div>
          ))}
        </div>
        <div className="card" style={{padding:"30px 28px",marginBottom:1}}>
          <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:20}}><Zap size={11} color="var(--t3)"/><Cap>Guía de Consumo 220V</Cap></div>
          <div>
            {[{t:"Alto Consumo — Generador o Puerto",items:["Aire Acondicionado","Anafe Eléctrico","Termotanque","Horno"],c:"var(--err)"},{t:"Bajo Consumo — Inverter y Baterías",items:["Heladera","TV · Audio","Carga Dispositivos","Microondas (breve)"],c:"var(--ok)"}].map((row,ri)=>(
              <div key={ri} style={{display:"flex",gap:16,padding:"16px 0",borderBottom:ri===0?"1px solid rgba(255,255,255,.04)":"none"}}>
                <div style={{width:1.5,background:row.c,flexShrink:0,opacity:.45,borderRadius:1}}/>
                <div>
                  <p style={{color:"var(--t2)",fontSize:13,fontWeight:400,marginBottom:10}}>{row.t}</p>
                  <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                    {row.items.map(i=><span key={i} style={{padding:"4px 10px",border:"1px solid var(--e1)",borderRadius:1,fontSize:10,fontFamily:"var(--font-nm)",letterSpacing:".08em",color:"var(--t3)"}}>{i}</span>)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="card" style={{padding:"30px 28px"}}>
          <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:18}}><Activity size={11} color="var(--t3)"/><Cap>Bombas y Equipos Críticos</Cap></div>
          {[{t:"Bomba de Achique (Bilge)",d:"Automática. Verificar acumulación de agua diariamente."},{t:"Bomba de Agua Potable",d:"Activación constante indica pérdida de presión — revisar grifería."},{t:"Intercambiadores de Calor",d:"Verificar flujo en escape — debe salir agua salada continua."},{t:"Bomba de Combustible",d:"Demanda de motores. Sin accionamiento manual en condiciones normales."}].map((item,i)=>(
            <div key={i} style={{display:"flex",gap:20,padding:"13px 0",borderBottom:"1px solid rgba(255,255,255,.03)"}}>
              <span style={{fontFamily:"var(--font-mono)",fontSize:9,color:"var(--t3)",flexShrink:0,marginTop:1}}>0{i+1}</span>
              <div><p style={{color:"var(--t1)",fontSize:13,fontWeight:400,marginBottom:3}}>{item.t}</p><p style={{color:"var(--t3)",fontSize:12,fontWeight:300,lineHeight:1.65}}>{item.d}</p></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   SEC SEGURIDAD
   ───────────────────────────────────────────────────────────── */
function SecSeguridad(){
  const P=[
    {t:"Incendio",ico:<Flame size={16}/>,c:"var(--err)",ps:["Cortar motor y fuente de combustible.","Extintor CO₂ a la base del fuego.","MAYDAY · VHF Canal 16 · posición GPS.","Si no cede, abandonar barco."]},
    {t:"Hombre al Agua",ico:<Droplets size={16}/>,c:"var(--info)",ps:["Lanzar aro salvavidas.","MOB en GPS — registrar posición.","Reducir velocidad · popa al náufrago.","Recuperar con bichero o escalera."]},
    {t:"Ingreso de Agua",ico:<AlertTriangle size={16}/>,c:"var(--warn)",ps:["Localizar punto de ingreso.","Activar bombas de achique.","MAYDAY si no se puede controlar.","Preparar equipo de abandono."]},
  ];
  return(
    <div className="senter">
      <div style={{padding:"12px 16px",background:"var(--err2)",border:"1px solid rgba(192,72,72,.22)",borderRadius:1,marginBottom:28,display:"flex",alignItems:"center",gap:10}}>
        <Radio size={13} color="var(--err)"/>
        <p style={{fontFamily:"var(--font-nm)",fontSize:10.5,letterSpacing:".06em",color:"#d08080",lineHeight:1.6}}>MAYDAY · VHF Canal 16 · Prefectura Naval: 106 · Guardia Costa: 0800-666-3500</p>
      </div>
      <SH eyebrow="Seguridad" title="Emergencia y Diagnóstico"/>
      <div className="stg">
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(255px,1fr))",gap:1,marginBottom:1}}>
          {P.map(e=>(
            <div key={e.t} className="card" style={{padding:"26px 24px",borderTop:`1.5px solid ${e.c}40`}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:18}}>
                <div style={{color:e.c,opacity:.7,display:"flex"}}>{e.ico}</div>
                <Cap style={{color:`${e.c}80`}}>{e.t}</Cap>
              </div>
              {e.ps.map((p,i)=>(
                <div key={i} style={{display:"flex",gap:12,marginBottom:12}}>
                  <span style={{fontFamily:"var(--font-mono)",fontSize:9,color:`${e.c}50`,flexShrink:0,marginTop:2}}>0{i+1}</span>
                  <p style={{color:"var(--t2)",fontSize:12,lineHeight:1.75,fontWeight:300}}>{p}</p>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="card" style={{padding:"28px",marginBottom:1}}>
          <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:16}}><Info size={11} color="var(--t3)"/><Cap>Diagnóstico Rápido</Cap></div>
          {[{t:"El motor no arranca",b:"Verificar cortes de batería en ON. Switch Parallel para unir bancos. Si hay olor a combustible, espere 5 min para despejar gases."},{t:"Bomba de agua no corta",b:"Pérdida de presión o aire en el circuito. Causa más común: duchador de popa mal cerrado."},{t:"Inodoro no funciona",b:"Grifo de fondo de salida ABIERTO. Tanque de aguas negras puede estar lleno. Revisar macerador."},{t:"Alta temperatura motor",b:"Cortar motor inmediatamente. Grifo de fondo abierto y libre de obstáculos. Controlar nivel de refrigerante."}].map((d,i)=>(
            <details key={d.t} style={{borderBottom:"1px solid rgba(255,255,255,.04)"}}>
              <summary style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"15px 0"}}>
                <div style={{display:"flex",alignItems:"center",gap:12}}>
                  <span style={{fontFamily:"var(--font-mono)",fontSize:9,color:"var(--t3)"}}>0{i+1}</span>
                  <span style={{color:"var(--t2)",fontSize:13,fontWeight:400}}>{d.t}</span>
                </div>
                <i className="arr"><ChevronRight size={12}/></i>
              </summary>
              <div style={{paddingBottom:16,paddingLeft:28}}><p style={{color:"var(--t3)",fontSize:13,fontWeight:300,lineHeight:1.8}}>{d.b}</p></div>
            </details>
          ))}
        </div>
        <div className="card" style={{padding:"28px"}}>
          <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:16}}><AlertTriangle size={11} color="var(--t3)"/><Cap>Fusibles de Alta Potencia</Cap></div>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead><tr style={{borderBottom:"1px solid var(--e1)"}}>{["Sistema","Amperaje","Ubicación"].map(h=><th key={h} style={{textAlign:"left",paddingBottom:10,paddingRight:16}}><Cap sm>{h}</Cap></th>)}</tr></thead>
            <tbody>{[["Bow Thruster","630 A","Sala Máquinas · Caja Principal"],["Malacate","250 A","Sala Máquinas · Panel Proa"],["Inverter","200 A","Sala Máquinas · Baterías"],["Bomba de Achique","40 A","Panel 12V · Sentinas"]].map((r,i)=>(
              <tr key={i} style={{borderBottom:"1px solid rgba(255,255,255,.025)"}}>
                {r.map((c,j)=><td key={j} style={{padding:"11px 16px 11px 0",color:j===0?"var(--t1)":"var(--t3)",fontWeight:300,fontSize:13,fontFamily:j===1?"var(--font-mono)":"inherit"}}>{c}</td>)}
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   SEC TUTORIALES — BLUEPRINT EDITION
   ───────────────────────────────────────────────────────────── */
function SecTutoriales(){
  const [vid,setVid]=useState(null);
  const [filter,setFilter]=useState("todos");
  const V=[
    {id:"GRRk7-_oz98",t:"Chequeo de Motores",d:"Niveles, correas y pre-arranque",c:"Mantenimiento",ref:"DOC-MT-001"},
    {id:"nAECKiKmdZY",t:"Conexión a Puerto",d:"Cable 220V de forma segura",c:"Energía",ref:"DOC-EN-001"},
    {id:"pEX04f1fR_4",t:"Generador Marino",d:"Conceptos básicos y operación",c:"Energía",ref:"DOC-EN-002"},
    {id:"Xc96Kgbv5w0",t:"Maniobra de Fondeo",d:"Técnica correcta de anclaje",c:"Navegación",ref:"DOC-NV-001"},
    {id:"5Ylng2lJ6aQ",t:"Sistema Sanitario",d:"Uso del inodoro eléctrico",c:"Sistemas",ref:"DOC-SY-001"},
    {id:"rA5oHEjK3tE",t:"Hélice de Proa",d:"Tips de uso efectivo",c:"Propulsión",ref:"DOC-PR-001"},
    {id:"6cPRVzIXDbM",t:"Purgado de Motor",d:"Sacar aire del circuito diesel",c:"Mantenimiento",ref:"DOC-MT-002"},
    {id:"kxwduznfXnQ",t:"Control de Incendios",d:"Equipos y procedimientos",c:"Seguridad",ref:"DOC-SG-001"},
    {id:"5WoAT5RopNE",t:"Hombre al Agua",d:"Maniobra de recuperación",c:"Seguridad",ref:"DOC-SG-002"},
  ];
  const cats=["todos",...[...new Set(V.map(v=>v.c))]];
  const filtered=filter==="todos"?V:V.filter(v=>v.c===filter);
  const catColor={Mantenimiento:"var(--warn)",Energía:"var(--info)",Navegación:"var(--ok)",Sistemas:"#7a5fc0",Propulsión:"var(--t2)",Seguridad:"var(--err)"};
  return(
    <div className="senter">
      {/* Blueprint header */}
      <div style={{marginBottom:36}}>
        <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:16}}>
          <div className="wline"/>
          <span style={{fontFamily:"var(--font-mono)",fontSize:9,color:"rgba(58,127,208,0.45)",letterSpacing:".14em"}}>KLASE-A · TECHNICAL LIBRARY</span>
        </div>
        <h1 style={{fontFamily:"var(--font-nm)",fontWeight:200,fontSize:"clamp(24px,3vw,38px)",color:"var(--t1)",letterSpacing:"-.025em",marginBottom:6}}>Videoteca Técnica</h1>
        <p style={{fontFamily:"var(--font-mono)",fontSize:9,color:"var(--t3)",letterSpacing:".06em"}}>{V.length} PROCEDIMIENTOS DOCUMENTADOS · REV. 2024</p>
      </div>

      {/* Category filter */}
      <div style={{display:"flex",gap:1,marginBottom:1,flexWrap:"wrap"}}>
        {cats.map(c=>(
          <button key={c} onClick={()=>setFilter(c)}
            style={{padding:"7px 14px",background:filter===c?"var(--s3)":"var(--s2)",border:`1px solid ${filter===c?"var(--e3)":"var(--e1)"}`,cursor:"pointer",fontFamily:"var(--font-mono)",fontSize:8.5,letterSpacing:".1em",color:filter===c?"var(--t1)":"var(--t3)",textTransform:"uppercase",transition:"all .18s",borderRadius:1}}>
            {c}
          </button>
        ))}
        <span style={{marginLeft:"auto",fontFamily:"var(--font-mono)",fontSize:8,color:"var(--t3)",display:"flex",alignItems:"center",letterSpacing:".06em"}}>{filtered.length} docs</span>
      </div>

      {/* Blueprint grid */}
      <div className="stg" style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(290px,1fr))",gap:1}}>
        {filtered.map((v,i)=>{
          const color=catColor[v.c]||"var(--t2)";
          return(
          <div key={v.id} className="bp-card" onClick={()=>setVid(v.id)}>
            {/* Grid texture */}
            <div className="bp-grid"/>
            {/* Thumbnail */}
            <img src={`https://img.youtube.com/vi/${v.id}/maxresdefault.jpg`} alt={v.t}
              style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",opacity:.35,transition:"opacity .3s"}}
              onMouseOver={e=>e.target.style.opacity=".5"} onMouseOut={e=>e.target.style.opacity=".35"}/>
            <div className="bp-overlay"/>
            <div className="bp-scan"/>
            {/* Corner markers */}
            {["tl","tr","bl","br"].map(pos=><div key={pos} className={`bp-corner ${pos}`}/>)}
            {/* Play */}
            <div className="bp-play"><Play size={16} color="rgba(58,127,208,0.9)"/></div>
            {/* Top labels */}
            <div style={{position:"absolute",top:0,left:0,right:0,padding:"14px",display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div style={{padding:"3px 8px",background:"rgba(3,3,4,0.8)",border:`1px solid ${color}30`,backdropFilter:"blur(8px)"}}>
                <span style={{fontFamily:"var(--font-mono)",fontSize:7.5,color:color,letterSpacing:".1em"}}>{v.c.toUpperCase()}</span>
              </div>
              <span style={{fontFamily:"var(--font-mono)",fontSize:7,color:"rgba(58,127,208,0.4)",letterSpacing:".08em"}}>{v.ref}</span>
            </div>
            {/* Bottom info */}
            <div style={{position:"absolute",bottom:0,left:0,right:0,padding:"16px"}}>
              <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:8}}>
                <div style={{height:1,flex:1,background:`linear-gradient(90deg,${color}40,transparent)`}}/>
                <span style={{fontFamily:"var(--font-mono)",fontSize:8,color:"rgba(58,127,208,0.35)",letterSpacing:".06em"}}>{pad(i+1)}/{pad(V.length)}</span>
              </div>
              <p style={{fontFamily:"var(--font-nm)",color:"var(--white)",fontSize:14,fontWeight:500,marginBottom:3,lineHeight:1.2}}>{v.t}</p>
              <p style={{fontFamily:"var(--font-nm)",color:"rgba(255,255,255,.35)",fontSize:11,fontWeight:300}}>{v.d}</p>
            </div>
          </div>
        )})}
      </div>

      {/* Video modal */}
      {vid&&(
        <div onClick={e=>e.target===e.currentTarget&&setVid(null)}
          style={{position:"fixed",inset:0,background:"rgba(0,0,0,.97)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:99999,padding:24,animation:"fin .25s both"}}>
          <div style={{width:"100%",maxWidth:960,animation:"fup .35s var(--ez) both"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <span style={{fontFamily:"var(--font-mono)",fontSize:9,color:"var(--t3)",letterSpacing:".1em"}}>{V.find(x=>x.id===vid)?.ref}</span>
              <button onClick={()=>setVid(null)}
                style={{background:"transparent",border:"1px solid var(--e2)",color:"var(--t2)",padding:"7px 16px",cursor:"pointer",fontFamily:"var(--font-nm)",fontSize:9,letterSpacing:".14em",transition:"all .18s",display:"flex",alignItems:"center",gap:7,borderRadius:1}}
                onMouseEnter={e=>e.currentTarget.style.borderColor="var(--e3)"} onMouseLeave={e=>e.currentTarget.style.borderColor="var(--e2)"}>
                <X size={11}/> CERRAR
              </button>
            </div>
            <div style={{aspectRatio:"16/9",position:"relative"}}>
              <iframe src={`https://www.youtube.com/embed/${vid}?autoplay=1`} style={{width:"100%",height:"100%",border:"none"}} allowFullScreen title="v"/>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   SEC SOPORTE
   ───────────────────────────────────────────────────────────── */
function SecSoporte({clienteId,nombreBarco,obraId,push}){
  const AREAS=["Electricidad / Tableros","Motores / Propulsión","Agua / Baños","Casco / Fibra / Filtraciones","Malacate / Bow Thruster","Climatización","Otros"];
  const B={area:"",desc:"",phone:"",ubi:""};
  const [fm,setFm]=useState(B),[send,setSend]=useState(false),[tks,setTks]=useState([]),[load,setLoad]=useState(true),[done,setDone]=useState(false);
  const [archivos,setArchivos]=useState([]);
  const [drag,setDrag]=useState(false);
  const [lightbox,setLb]=useState(null);
  const inputRef=useRef();

  const fetch2=useCallback(async()=>{
    if(!clienteId)return;
    setLoad(true);
    const{data,error}=await supabase.from("tickets").select("*").eq("cliente_id",clienteId).order("fecha_creacion",{ascending:false}).limit(20);
    if(!error)setTks(data||[]);
    setLoad(false);
  },[clienteId]);

  useEffect(()=>{fetch2();},[fetch2]);

  const handleFiles=async(files)=>{
    const validos=[...files].filter(f=>f.type.startsWith("image/")||f.type.startsWith("video/"));
    if(!validos.length)return;
    const nuevos=await Promise.all(validos.map(f=>new Promise(res=>{
      const r=new FileReader();
      r.onload=e=>res({url:e.target.result,name:f.name,type:f.type,size:f.size,id:Date.now()+Math.random(),file:f});
      r.readAsDataURL(f);
    })));
    setArchivos(p=>[...p,...nuevos]);
  };

  const removeFile=id=>setArchivos(p=>p.filter(x=>x.id!==id));

  const uploadToStorage=async(file,tempId)=>{
    const path=`tickets/${tempId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;
    const{data:upData,error}=await supabase.storage
      .from("ticket-attachments")
      .upload(path,file,{cacheControl:"3600",upsert:true});
    if(error) throw new Error(error.message||JSON.stringify(error));
    const{data}=supabase.storage.from("ticket-attachments").getPublicUrl(path);
    return data.publicUrl;
  };

  const submit=async()=>{
    if(!fm.area){push("Seleccione el área afectada","err");return}
    if(!fm.desc||fm.desc.trim().length<10){push("Descripción muy breve — agregue más detalle","err");return}
    if(!fm.phone){push("Ingrese número de WhatsApp","err");return}
    if(send)return;
    setSend(true);
    try{
      // 1. Subir archivos PRIMERO usando clienteId como carpeta temporal
      let urls=[];
      if(archivos.length>0){
        push(`Subiendo ${archivos.length} archivo(s)…`,"inf");
        const tempFolder=`${clienteId}_${Date.now()}`;
        for(const a of archivos){
          try{
            const url=await uploadToStorage(a.file,tempFolder);
            urls.push(url);
          }catch(e){
            push(`✗ ${a.name.slice(0,24)}: ${e.message}`,"err");
            console.error("[upload fail]",a.name,e);
          }
        }
      }

      // 2. Insert ticket con adjuntos YA incluidos (un solo INSERT, sin UPDATE)
      const{error:tkErr}=await supabase.from("tickets").insert([{
        cliente_id:clienteId,
        area:fm.area,
        descripcion:fm.desc.trim(),
        telefono:fm.phone,
        ubicacion_barco:fm.ubi,
        nombre_barco_ticket:nombreBarco,
        estado:"pendiente",
        adjuntos:urls,          // ← se guarda en el insert directo
      }]);
      if(tkErr)throw tkErr;

      setFm(B);setArchivos([]);setDone(true);
      push(`Reporte enviado${urls.length?" con "+urls.length+" foto(s)":""}`, "ok");
      setTimeout(()=>fetch2(),800);
    }catch(e){
      push("Error: "+e.message,"err");
      console.error("[submit fail]",e);
    }finally{
      setSend(false);
    }
  };

  const fmtSize=b=>b<1024*1024?(b/1024).toFixed(0)+" KB":(b/1024/1024).toFixed(1)+" MB";

  return(
    <div className="senter">
      <SH eyebrow="Post-Venta" title="Garantía y Soporte Técnico"/>
      <div className="stg" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(310px,1fr))",gap:1}}>
        {/* ── FORM ── */}
        <div className="card" style={{padding:"34px 28px"}}>
          <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:22}}><MessageSquare size={11} color="var(--t3)"/><Cap>Nuevo Reporte</Cap></div>
          {done?(
            <div style={{marginTop:18,padding:"34px 20px",textAlign:"center",border:"1px solid rgba(45,184,122,.18)",background:"var(--ok2)",animation:"fup .5s var(--ez) both",borderRadius:1}}>
              <div style={{width:40,height:40,border:"1px solid rgba(45,184,122,.4)",borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px"}}>
                <Check size={16} color="var(--ok)"/>
              </div>
              <p style={{fontFamily:"var(--font-nm)",fontSize:20,fontWeight:300,color:"var(--t1)",marginBottom:8,letterSpacing:"-.02em"}}>Enviado</p>
              <p style={{color:"var(--t3)",fontSize:13,lineHeight:1.8,fontWeight:300}}>Nuestro equipo revisará su reporte y se contactará por WhatsApp a la brevedad.</p>
              <button onClick={()=>setDone(false)} style={{marginTop:18,padding:"9px 18px",background:"transparent",border:"1px solid var(--e2)",color:"var(--t3)",fontFamily:"var(--font-nm)",fontSize:8.5,letterSpacing:".16em",textTransform:"uppercase",cursor:"pointer",transition:"all .22s",borderRadius:1}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor="var(--e3)";e.currentTarget.style.color="var(--t2)"}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--e2)";e.currentTarget.style.color="var(--t3)"}}>NUEVO REPORTE</button>
            </div>
          ):(
            <div>
              <div style={{marginBottom:20}}><Lbl>Área Afectada *</Lbl>
                <select className="sel" value={fm.area} onChange={e=>setFm(f=>({...f,area:e.target.value}))}>
                  <option value="">Seleccione…</option>{AREAS.map(a=><option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div style={{marginBottom:20}}><Lbl>Ubicación del Barco</Lbl>
                <input className="inp" value={fm.ubi} onChange={e=>setFm(f=>({...f,ubi:e.target.value}))} placeholder="Puerto Madero · Amarra 24"/>
              </div>
              <div style={{marginBottom:20}}><Lbl>Descripción del Problema *</Lbl>
                <textarea className="ta" value={fm.desc} onChange={e=>setFm(f=>({...f,desc:e.target.value}))} placeholder="Describa la falla — cuándo ocurrió, síntomas, condiciones…"/>
              </div>
              <div style={{marginBottom:20}}><Lbl>WhatsApp *</Lbl>
                <input className="inp" type="tel" value={fm.phone} onChange={e=>setFm(f=>({...f,phone:e.target.value}))} placeholder="+54 9 ···· ··· ····"/>
              </div>

              {/* ── ADJUNTOS ── */}
              <div style={{marginBottom:24}}>
                <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:10}}>
                  <Paperclip size={10} color="var(--t3)"/>
                  <Lbl>Fotos y Videos</Lbl>
                  <span style={{fontFamily:"var(--font-mono)",fontSize:8,color:"var(--t3)",marginLeft:"auto"}}>{archivos.length}/10 archivos</span>
                </div>

                {/* Previews */}
                {archivos.length>0&&(
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(80px,1fr))",gap:6,marginBottom:10}}>
                    {archivos.map(a=>(
                      <div key={a.id} className="mthumb" style={{cursor:"pointer"}} onClick={()=>setLb(a)}>
                        {a.type.startsWith("image/")
                          ?<img src={a.url} alt={a.name}/>
                          :<div style={{width:"100%",height:"100%",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4,background:"var(--s3)"}}>
                            <VideoIcon size={18} color="var(--t3)"/>
                            <span style={{fontFamily:"var(--font-mono)",fontSize:7,color:"var(--t3)",textAlign:"center",padding:"0 4px",lineHeight:1.3}}>{a.name.slice(0,14)}</span>
                          </div>}
                        <div className="mthumb-overlay"><ZoomIn size={12} color="rgba(255,255,255,.8)"/></div>
                        <button className="mthumb-del" onClick={e=>{e.stopPropagation();removeFile(a.id)}}><Trash2 size={8} color="#fff"/></button>
                        <div style={{position:"absolute",bottom:0,left:0,right:0,padding:"3px 5px",background:"rgba(0,0,0,.65)"}}>
                          <span style={{fontFamily:"var(--font-mono)",fontSize:7,color:"rgba(255,255,255,.5)"}}>{fmtSize(a.size)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Drop zone */}
                {archivos.length<10&&(
                  <div
                    className={`upzone${drag?" drag":""}`}
                    style={{position:"relative"}}
                    onDragOver={e=>{e.preventDefault();setDrag(true)}}
                    onDragLeave={()=>setDrag(false)}
                    onDrop={e=>{e.preventDefault();setDrag(false);handleFiles(e.dataTransfer.files)}}
                    onClick={()=>inputRef.current?.click()}>
                    <input ref={inputRef} type="file" accept="image/*,video/*" multiple style={{display:"none"}} onChange={e=>handleFiles(e.target.files)}/>
                    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:7,pointerEvents:"none"}}>
                      <Upload size={16} color="var(--t3)"/>
                      <Cap sm>Arrastrá o hacé clic para adjuntar</Cap>
                      <span style={{fontFamily:"var(--font-mono)",fontSize:8,color:"var(--t3)"}}>JPG · PNG · MP4 · MOV</span>
                    </div>
                  </div>
                )}
              </div>

              <button onClick={submit} disabled={send}
                style={{width:"100%",padding:"14px",background:send?"var(--s3)":"var(--white)",color:send?"var(--t3)":"#030304",border:"none",fontFamily:"var(--font-nm)",fontWeight:600,fontSize:9,letterSpacing:".22em",textTransform:"uppercase",cursor:send?"not-allowed":"pointer",transition:"all .22s",borderRadius:1}}>
                {send?"ENVIANDO…":`ENVIAR REPORTE${archivos.length?" + "+archivos.length+" ARCH.":""}`}
              </button>
            </div>
          )}
        </div>

        {/* ── HISTORY ── */}
        <div className="card" style={{padding:"34px 28px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
            <div style={{display:"flex",alignItems:"center",gap:7}}><Activity size={11} color="var(--t3)"/><Cap>Historial de Reportes</Cap></div>
            <button onClick={fetch2}
              style={{background:"transparent",border:"none",cursor:"pointer",color:"var(--t3)",display:"flex",alignItems:"center",gap:5,fontFamily:"var(--font-nm)",fontSize:8,letterSpacing:".12em",textTransform:"uppercase",padding:0,transition:"color .18s"}}
              onMouseEnter={e=>e.currentTarget.style.color="var(--t2)"} onMouseLeave={e=>e.currentTarget.style.color="var(--t3)"}>
              <RefreshCw size={9}/>ACTUALIZAR
            </button>
          </div>
          {load?(
            <div style={{display:"flex",flexDirection:"column",gap:9}}>{[80,60,90].map((w,i)=><div key={i} className="shim" style={{height:12,width:w+"%"}}/>)}</div>
          ):tks.length===0?(
            <div style={{padding:"42px 0",textAlign:"center",borderTop:"1px solid var(--e1)"}}>
              <MessageSquare size={28} color="var(--t3)" style={{margin:"0 auto 12px"}}/>
              <p style={{fontFamily:"var(--font-nm)",fontSize:18,fontWeight:300,color:"var(--t3)"}}>Sin reportes registrados.</p>
              <p style={{color:"var(--t3)",fontSize:11,marginTop:6,fontWeight:300}}>Sus reportes aparecerán aquí.</p>
            </div>
          ):(
            tks.map(t=>(
              <div key={t.id} style={{borderBottom:"1px solid rgba(255,255,255,.04)",transition:"background .18s",borderRadius:1,overflow:"hidden"}}
                onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,.012)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>

                {/* Header del ticket */}
                <div style={{padding:"14px 8px 10px",display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:7}}>
                      <SBadge estado={t.estado}/>
                      {Array.isArray(t.adjuntos)&&t.adjuntos.length>0&&(
                        <span style={{display:"flex",alignItems:"center",gap:3,padding:"2px 7px",borderRadius:4,background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.08)"}}>
                          <Paperclip size={8} color="var(--t3)"/>
                          <span style={{fontFamily:"var(--font-mono)",fontSize:7.5,color:"var(--t3)"}}>{t.adjuntos.length}</span>
                        </span>
                      )}
                    </div>
                    <p style={{color:"var(--t1)",fontSize:13,fontWeight:500,marginBottom:4,lineHeight:1.2}}>{t.area}</p>
                    <p style={{color:"var(--t3)",fontSize:12,fontWeight:300,lineHeight:1.65,margin:0}}>{t.descripcion}</p>
                  </div>
                  <span style={{fontFamily:"var(--font-mono)",fontSize:8,color:"var(--t3)",flexShrink:0,letterSpacing:"0.08em"}}>#{String(t.id).slice(-6)}</span>
                </div>

                {/* Adjuntos — grid con lightbox */}
                {Array.isArray(t.adjuntos)&&t.adjuntos.length>0&&(
                  <div style={{padding:"0 8px 12px"}}>
                    <p style={{fontFamily:"var(--font-mono)",fontSize:8,color:"var(--t3)",letterSpacing:".06em",marginBottom:8}}>
                      📎 {t.adjuntos.length} archivo{t.adjuntos.length>1?"s":""} adjunto{t.adjuntos.length>1?"s":""}
                    </p>
                    <div style={{display:"flex",flexDirection:"column",gap:8}}>
                      {t.adjuntos.map((url,i)=>{
                        const cleanUrl=url.split("?")[0].toLowerCase();
                        const isVideo=/\.(mp4|mov|webm|avi|mkv)$/.test(cleanUrl);
                        const fileName=decodeURIComponent(url.split("/").pop().split("?")[0]).slice(0,50);

                        if(isVideo) return(
                          <div key={i} style={{borderRadius:8,overflow:"hidden",border:"1px solid var(--e2)",background:"var(--s1)"}}>
                            <video controls style={{width:"100%",display:"block",maxHeight:260,background:"#000"}}
                              onError={e=>{e.currentTarget.style.display="none";e.currentTarget.nextSibling.style.display="flex"}}>
                              <source src={url}/>
                            </video>
                            <div style={{display:"none",padding:"10px 14px",alignItems:"center",justifyContent:"space-between"}}>
                              <span style={{fontFamily:"var(--font-mono)",fontSize:9,color:"var(--t3)"}}>▶ {fileName}</span>
                              <a href={url} target="_blank" rel="noopener noreferrer"
                                style={{fontFamily:"var(--font-mono)",fontSize:9,color:"var(--info)",textDecoration:"none",fontWeight:600}}>Abrir ↗</a>
                            </div>
                            <div style={{padding:"8px 12px",borderTop:"1px solid var(--e1)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                              <span style={{fontFamily:"var(--font-mono)",fontSize:8,color:"var(--t3)"}}>{fileName}</span>
                              <a href={url} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()}
                                style={{fontFamily:"var(--font-mono)",fontSize:8,color:"var(--info)",textDecoration:"none"}}>Descargar ↗</a>
                            </div>
                          </div>
                        );

                        // Para todo lo que no es video, intentamos mostrar como imagen
                        return(
                          <div key={i} style={{borderRadius:8,overflow:"hidden",border:"1px solid var(--e2)",background:"var(--s1)"}}>
                            <img
                              src={url}
                              alt={"Foto "+(i+1)}
                              style={{width:"100%",display:"block",maxHeight:340,objectFit:"contain",background:"#050508",cursor:"zoom-in"}}
                              onClick={()=>setLb({url,type:"image/jpeg"})}
                              onError={e=>{
                                // Si la imagen falla, ocultar y mostrar fallback
                                e.currentTarget.style.display="none";
                                const fb=e.currentTarget.parentElement.querySelector(".adj-fb");
                                if(fb)fb.style.display="flex";
                              }}
                            />
                            <div className="adj-fb" style={{display:"none",padding:"16px",flexDirection:"column",alignItems:"center",gap:8,background:"var(--s2)"}}>
                              <ImageIcon size={22} color="var(--t3)"/>
                              <span style={{fontFamily:"var(--font-mono)",fontSize:9,color:"var(--t3)",textAlign:"center"}}>
                                No se pudo previsualizar
                              </span>
                            </div>
                            <div style={{padding:"8px 12px",borderTop:"1px solid var(--e1)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                              <span style={{fontFamily:"var(--font-mono)",fontSize:8,color:"var(--t3)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"70%"}}>
                                🖼 {fileName}
                              </span>
                              <div style={{display:"flex",gap:10,flexShrink:0}}>
                                <span style={{fontSize:9,color:"var(--t3)",cursor:"pointer"}}
                                  onClick={()=>setLb({url,type:"image/jpeg"})}>🔍 ver</span>
                                <a href={url} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()}
                                  style={{fontFamily:"var(--font-mono)",fontSize:9,color:"var(--info)",textDecoration:"none",fontWeight:600}}>
                                  Abrir ↗
                                </a>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Footer: fecha, ubicación */}
                <div style={{padding:"0 8px 10px",display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
                  {t.fecha_creacion&&<span style={{fontFamily:"var(--font-mono)",fontSize:8,color:"var(--t3)"}}>{df(t.fecha_creacion)} · {tf(t.fecha_creacion)}</span>}
                  {t.ubicacion_barco&&<span style={{fontSize:10,color:"var(--t3)",fontWeight:300,display:"flex",alignItems:"center",gap:3}}><MapPin size={8}/>{t.ubicacion_barco}</span>}
                </div>

                {/* Respuesta técnica */}
                {t.seguimiento&&(
                  <div style={{margin:"0 8px 12px",padding:"10px 12px",borderLeft:"1.5px solid rgba(58,127,208,.45)",background:"var(--info2)",borderRadius:"0 4px 4px 0"}}>
                    <Cap sm style={{display:"block",marginBottom:5,color:"rgba(58,127,208,0.55)"}}>Respuesta técnica</Cap>
                    <p style={{fontSize:12,color:"#7aabdc",lineHeight:1.7,fontStyle:"italic",fontFamily:"var(--font-nm)",margin:0}}>{t.seguimiento}</p>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Lightbox */}
      {lightbox&&(
        <div onClick={()=>setLb(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.97)",zIndex:99999,display:"flex",alignItems:"center",justifyContent:"center",padding:24,animation:"fin .2s both"}}>
          <button onClick={()=>setLb(null)} style={{position:"absolute",top:18,right:18,background:"rgba(255,255,255,0.07)",border:"1px solid var(--e2)",color:"var(--t2)",padding:"7px 14px",cursor:"pointer",fontFamily:"var(--font-nm)",fontSize:9,letterSpacing:".14em",borderRadius:4,display:"flex",gap:6,alignItems:"center"}}>
            <X size={11}/>CERRAR
          </button>
          <a href={lightbox.url} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()}
            style={{position:"absolute",top:18,left:18,background:"rgba(255,255,255,0.07)",border:"1px solid var(--e2)",color:"var(--t2)",padding:"7px 14px",cursor:"pointer",fontFamily:"var(--font-nm)",fontSize:9,letterSpacing:".14em",borderRadius:4,display:"flex",gap:6,alignItems:"center",textDecoration:"none"}}>
            ↗ ABRIR ORIGINAL
          </a>
          {lightbox.type?.startsWith("image/")
            ?<img src={lightbox.url} alt="" style={{maxWidth:"92vw",maxHeight:"88vh",objectFit:"contain",borderRadius:6,boxShadow:"0 0 80px rgba(0,0,0,0.7)",animation:"fup .3s var(--ez) both"}}/>
            :<video src={lightbox.url} controls autoPlay style={{maxWidth:"92vw",maxHeight:"88vh",borderRadius:6,animation:"fup .3s var(--ez) both"}}/>
          }
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   NAV CONFIG
   ───────────────────────────────────────────────────────────── */
const NAV_ITEMS = [
  {id:"bienvenida",    l:"Inicio",            ico:<Home size={13}/>},
  {id:"configuracion", l:"Identidad",          ico:<Settings size={13}/>},
  {id:"resumen",       l:"Planificador",       ico:<Navigation size={13}/>},
  {id:"energia",       l:"Energía y Tableros", ico:<Zap size={13}/>},
  {id:"propulsion",    l:"Propulsión",         ico:<Gauge size={13}/>},
  {id:"sistemas",      l:"Sistemas",           ico:<Activity size={13}/>},
  {id:"seguridad",     l:"Seguridad",          ico:<Shield size={13}/>},
  {id:"tutoriales",    l:"Videoteca",          ico:<Play size={13}/>},
  {id:"soporte",       l:"Soporte y Garantía", ico:<MessageSquare size={13}/>},
];

/* ─────────────────────────────────────────────────────────────
   MAIN EXPORT
   ───────────────────────────────────────────────────────────── */
export default function ClientePanelScreen({session,onSignOut}){
  const [cliente,setC]=useState(null),[mc,setMc]=useState({}),[loading,setL]=useState(true);
  const [sec,setSec]=useState("bienvenida"),[navOpen,setNav]=useState(false);
  const {list:toasts,push}=useToast();

  useEffect(()=>{
    (async()=>{
      if(!session?.user?.id)return;
      const[r1,r2]=await Promise.all([
        supabase.from("clientes").select("*").eq("id",session.user.id).single(),
        supabase.from("modelo_configuracion").select("*"),
      ]);
      if(r1.data){setC(r1.data);const m=r2.data?.find(x=>x.modelo_barco===r1.data.modelo_barco);setMc(m?.caracteristicas||{})}
      setL(false);
    })();
  },[session]);

  const go=s=>{setSec(s);setNav(false);window.scrollTo({top:0,behavior:"smooth"})};

  /* Loading screen */
  if(loading)return(
    <div style={{background:"#030304",minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:0}}>
      <style>{CSS}</style>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:20,animation:"fin 1s both"}}>
        <div style={{width:1,height:80,background:"linear-gradient(to bottom,transparent,rgba(255,255,255,0.15))"}}/>
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8}}>
          <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:8,letterSpacing:".5em",color:"rgba(255,255,255,0.08)",textTransform:"uppercase"}}>KLASE A</span>
          <div style={{display:"flex",gap:3}}>
            {[0,.2,.4].map(d=><div key={d} style={{width:3,height:3,background:"rgba(255,255,255,0.12)",borderRadius:"50%",animation:`pulse 1.4s ${d}s ease-in-out infinite`}}/>)}
          </div>
        </div>
      </div>
    </div>
  );

  const sp={cliente,mc,goTo:go,clienteId:session?.user?.id,nombreBarco:cliente?.nombre_barco,obraId:cliente?.obra_id,push};

  return(
    <div className="grain" style={{background:"#030304",minHeight:"100vh"}}>
      <style>{CSS}</style>
      <Toasts list={toasts}/>

      {/* Mobile overlay */}
      {navOpen&&<div onClick={()=>setNav(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.8)",zIndex:899,backdropFilter:"blur(3px)"}}/>}

      <div className="shell">
        {/* ── SIDEBAR ── */}
        <aside className={`sidebar${navOpen?" open":""}`}>
          {/* Brand */}
          <div style={{padding:"22px 20px 18px",borderBottom:"1px solid var(--e1)"}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
              <img src={logoK} alt="K" style={{width:22,height:22,objectFit:"contain",opacity:.7,flexShrink:0,filter:"grayscale(100%) brightness(1.5)"}}/>
              <span style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:500,fontSize:10,letterSpacing:".32em",color:"var(--t1)"}}>KLASE A</span>
            </div>
            <div style={{height:1,background:"var(--e1)",marginBottom:12}}/>
            <p style={{fontFamily:"'JetBrains Mono',monospace",fontSize:7.5,letterSpacing:".18em",color:"var(--t3)",textTransform:"uppercase",marginBottom:4}}>Manual Digital</p>
            <p style={{fontFamily:"var(--font-nm)",fontWeight:300,fontSize:17,color:"var(--t2)",letterSpacing:"-.01em"}}>{cliente?.modelo_barco} <span style={{fontWeight:200,opacity:.6}}>Ed.</span></p>
            {(cliente?.nombre_barco||cliente?.numero_unidad)&&(
              <p style={{fontFamily:"'JetBrains Mono',monospace",fontSize:8.5,color:"rgba(255,255,255,0.22)",marginTop:6,letterSpacing:".1em"}}>
                {[cliente.nombre_barco,cliente.numero_unidad].filter(Boolean).join("  ·  ")}
              </p>
            )}
          </div>

          {/* Nav */}
          <nav style={{flex:1,paddingTop:8,paddingBottom:8}}>
            {NAV_ITEMS.map(item=>(
              <button key={item.id} className={`ni${sec===item.id?" on":""}`} onClick={()=>go(item.id)}>
                <span className="nico">{item.ico}</span>
                {item.l}
              </button>
            ))}
          </nav>

          {/* Footer */}
          <div style={{padding:"14px 20px",borderTop:"1px solid var(--e1)"}}>
            <p style={{fontFamily:"'JetBrains Mono',monospace",fontSize:8.5,color:"var(--t3)",marginBottom:10,letterSpacing:".06em"}}>
              {cliente?.nombre_completo?.split(" ").slice(0,2).join(" ")}
            </p>
            <button onClick={onSignOut}
              style={{background:"transparent",border:"1px solid var(--e1)",color:"var(--t3)",padding:"8px 14px",cursor:"pointer",fontFamily:"var(--font-nm)",fontSize:7.5,letterSpacing:".18em",textTransform:"uppercase",width:"100%",transition:"color .2s,border-color .2s",borderRadius:1}}
              onMouseEnter={e=>{e.currentTarget.style.color="var(--err)";e.currentTarget.style.borderColor="rgba(192,72,72,.3)"}}
              onMouseLeave={e=>{e.currentTarget.style.color="var(--t3)";e.currentTarget.style.borderColor="var(--e1)"}}>
              Cerrar Sesión
            </button>
          </div>
        </aside>

        {/* ── MAIN CONTENT ── */}
        <main className="content" style={{minWidth:0}}>
          {/* Mobile header */}
          <div className="mob-hdr"
            style={{display:"none",position:"fixed",top:0,left:0,right:0,height:50,background:"var(--void)",borderBottom:"1px solid var(--e1)",zIndex:800,alignItems:"center",padding:"0 14px",justifyContent:"space-between"}}>
            <button onClick={()=>setNav(o=>!o)}
              style={{background:"transparent",border:"1px solid var(--e1)",color:"var(--t2)",padding:"7px 11px",cursor:"pointer",borderRadius:1,display:"flex",alignItems:"center"}}>
              <Activity size={14}/>
            </button>
            <span style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:500,fontSize:9.5,letterSpacing:".28em",color:"var(--t1)"}}>KLASE A</span>
            <div style={{width:36}}/>
          </div>

          {/* Section */}
          <div key={sec} className="senter"
            style={{padding:sec==="bienvenida"?"0":"clamp(20px,4vw,48px) clamp(16px,4vw,48px)"}}>
            {sec==="bienvenida"    &&<SecBienvenida    {...sp}/>}
            {sec==="configuracion" &&<SecIdentidad     {...sp}/>}
            {sec==="resumen"       &&<SecPlanificador  {...sp}/>}
            {sec==="energia"       &&<SecEnergia       {...sp}/>}
            {sec==="propulsion"    &&<SecPropulsion    {...sp}/>}
            {sec==="sistemas"      &&<SecSistemas      {...sp}/>}
            {sec==="seguridad"     &&<SecSeguridad     {...sp}/>}
            {sec==="tutoriales"    &&<SecTutoriales    {...sp}/>}
            {sec==="soporte"       &&<SecSoporte       {...sp}/>}
          </div>
        </main>
      </div>
    </div>
  );
}
