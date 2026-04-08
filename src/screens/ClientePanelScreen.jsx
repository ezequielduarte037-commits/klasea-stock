/**
 * KLASE A — MERIDIAN EDITION · COMPLETE + ELEVATED
 * Ocean Tech Theme · Modern Glass Bridge UI
 */
import React, { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "../supabaseClient";
import logoK from "../assets/logo-k.png";
import {
  Home, Settings, Compass, Zap, Anchor, Shield, Play, MessageSquare,
  Wind, Activity, AlertTriangle, Check, RefreshCw, ChevronRight,
  X, Wifi, Power, Gauge, RotateCcw, Phone, Flame, Droplets, Radio,
  Navigation, Info, Wrench, Eye, EyeOff, FileText, Upload, Paperclip,
  Image as ImageIcon, Trash2, ZoomIn, Menu, Thermometer, Battery
} from "lucide-react";

/* ═══════════════════════════════════════════════════════════════
   GLOBAL CSS — OCEAN TECH THEME
═══════════════════════════════════════════════════════════════ */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Outfit:wght@300;400;500;600;700;800&family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { scroll-behavior: smooth; overflow-x: hidden; }
body {
  background: #020617; color: #F8FAFC;
  font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  overflow-x: hidden;
}

:root {
  --void:  #020617; /* Slate 950 */
  --s1: #0F172A; /* Slate 900 */
  --s2: #1E293B; /* Slate 800 */
  --s3: #334155; /* Slate 700 */
  --s4: #475569;
  --e1: rgba(255,255,255,0.06); 
  --e2: rgba(255,255,255,0.12); 
  --e3: rgba(255,255,255,0.20);
  --t1: #F8FAFC; 
  --t2: #94A3B8; 
  --t3: #64748B;
  
  /* Technical Sky Blue Accent */
  --accent: #38BDF8; 
  --accent2: rgba(56, 189, 248, 0.10); 
  --accent3: rgba(56, 189, 248, 0.05);
  
  --ok: #10B981; --ok2: rgba(16, 185, 129, 0.10);
  --warn: #F59E0B; --warn2: rgba(245, 158, 11, 0.10);
  --err: #EF4444; --err2: rgba(239, 68, 68, 0.09);
  --info: #3B82F6; --info2: rgba(59, 130, 246, 0.10);
  
  --serif: 'Outfit', sans-serif;
  --cond:  'Plus Jakarta Sans', sans-serif;
  --mono:  'JetBrains Mono', monospace;
  --body:  'Plus Jakarta Sans', system-ui, sans-serif;
  
  --nav-h: 58px; --gutter: clamp(16px, 4vw, 56px); --ez: cubic-bezier(0.25, 1, 0.35, 1);
}

/* ── NOISE TEXTURE OVERLAY ── */
body::after {
  content: ''; position: fixed; inset: 0; z-index: 0; pointer-events: none;
  opacity: 0.02;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
  background-size: 128px 128px;
}

/* ── DOT GRID ── */
body::before {
  content: ''; position: fixed; inset: 0; z-index: 0; pointer-events: none;
  background-image: radial-gradient(circle, rgba(255,255,255,0.03) 1px, transparent 1px);
  background-size: 24px 24px;
}

::-webkit-scrollbar { width: 4px; height: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }

/* ── NAV ── */
.nav {
  position: fixed; top: 0; left: 0; right: 0; height: var(--nav-h); z-index: 900;
  display: flex; align-items: center; padding: 0 var(--gutter);
  background: rgba(2, 6, 23, 0.85); border-bottom: 1px solid var(--e1);
  backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
}
.nav-brand { display:flex; align-items:center; gap:10px; flex-shrink:0; margin-right:28px; }
.nav-div { width:1px; height:20px; background:var(--e2); margin-right:22px; flex-shrink:0; }
.nav-items { display:flex; flex:1; overflow-x:auto; overflow-y:hidden; scrollbar-width:none; }
.nav-items::-webkit-scrollbar { display:none; }
.nv {
  display:flex; flex-direction:column; align-items:center; justify-content:center;
  padding:0 12px; height:var(--nav-h); background:transparent; border:none;
  cursor:pointer; position:relative; gap:3px; white-space:nowrap; flex-shrink:0;
}
.nv-n { font-family:var(--mono); font-size:7.5px; color:var(--t3); letter-spacing:.08em; transition:color .22s; }
.nv-l { font-family:var(--cond); font-size:10px; font-weight:700; letter-spacing:.15em;
  text-transform:uppercase; color:var(--t3); transition:color .22s; }
.nv::after {
  content:''; position:absolute; bottom:0; left:50%; width:0; height:2px;
  background:var(--accent); transform:translateX(-50%); transition:width .3s var(--ez);
}
.nv:hover .nv-n, .nv:hover .nv-l { color:var(--t2); }
.nv.on .nv-n { color:var(--accent); }
.nv.on .nv-l { color:var(--t1); }
.nv.on::after { width:calc(100% - 24px); }
.nav-right { margin-left:auto; display:flex; align-items:center; gap:12px; flex-shrink:0; padding-left:16px; }

/* ── SHELL ── */
.shell { min-height:100vh; padding-top:var(--nav-h); position:relative; z-index:1; }
.page { max-width:1400px; margin:0 auto; padding:clamp(48px,6vw,84px) var(--gutter) 100px; }

/* ── SECTION HEADER ── */
.sh { position:relative; margin-bottom:56px; overflow:visible; }
.sh-eye { font-family:var(--cond); font-size:11px; font-weight:700; letter-spacing:.25em;
  text-transform:uppercase; color:var(--accent); margin-bottom:12px; display:block; }
.sh-t { font-family:var(--serif); font-weight:500;
  font-size:clamp(40px,5vw,64px); color:var(--t1); line-height:1.05; letter-spacing:-.02em; }
.sh-ghost {
  position:absolute; right:-6px; top:-40px;
  font-family:var(--cond); font-size:clamp(120px,15vw,200px); font-weight:800;
  color:rgba(255,255,255,0.015); line-height:1; letter-spacing:-.04em;
  user-select:none; pointer-events:none;
}
.sh-rule {
  height:1px; margin-top:24px;
  background:linear-gradient(90deg, var(--accent), rgba(56, 189, 248, .08), transparent);
  animation:ruleGrow .8s var(--ez) both; transform-origin:left;
}

/* ── CARDS ── */
.card { background:var(--s1); border:1px solid var(--e1); border-radius: 6px; position:relative; }
.card-dark { background:var(--void); border:1px solid var(--e1); border-radius: 6px; }

/* ── STEP / TIMELINE ── */
.step { display:flex; gap:22px; padding:18px 0; border-bottom:1px solid var(--e1); }
.step:last-child { border-bottom:none; }
.step-n { font-family:var(--mono); font-size:10px; color:var(--accent); font-weight: 700; opacity:.6; flex-shrink:0; min-width:20px; margin-top:3px; }

/* Timeline checklist */
.tl-wrap { position:relative; padding-left:42px; }
.tl-wrap::before {
  content:''; position:absolute; left:13px; top:22px; bottom:22px; width:1px;
  background:linear-gradient(to bottom, var(--e2) 0%, var(--e1) 80%, transparent 100%);
}
.tl-item { position:relative; margin-bottom:20px; cursor:pointer; user-select:none; transition:padding-right .15s; }
.tl-item:hover { padding-right:4px; }
.tl-mark {
  position:absolute; left:-42px; top:0; width:26px; height:26px; border-radius:50%;
  border:1px solid var(--e2); background:var(--s1); display:flex; align-items:center;
  justify-content:center; transition:all .25s var(--ez); flex-shrink:0;
}
.tl-mark.done { border-color:var(--ok); background:var(--ok2); }
.tl-mn { font-family:var(--mono); font-size:9px; color:var(--t3); }

/* ── INPUTS ── */
.inp, .sel, .ta {
  background:transparent; border:none; border-bottom:1px solid var(--e2);
  color:var(--t1); padding:10px 0; width:100%; font-family:var(--body);
  font-size:14px; font-weight:400; outline:none; transition:border-color .2s;
  -webkit-appearance:none; appearance:none;
}
.inp::placeholder { color:var(--t3); }
.inp:focus, .sel:focus, .ta:focus { border-bottom-color:var(--accent); }
.sel option { background:var(--s1); color:var(--t2); }
.ta { resize:vertical; min-height:88px; line-height:1.72; }

/* ── TABS ── */
.tabs { display:flex; border-bottom:1px solid var(--e1); }
.tab {
  flex:1; padding:16px 8px; background:transparent; border:none; cursor:pointer;
  font-family:var(--cond); font-size:11px; font-weight:700; letter-spacing:.15em;
  text-transform:uppercase; color:var(--t3); transition:color .2s;
  border-bottom:2px solid transparent; margin-bottom:-1px;
}
.tab.on { color:var(--t1); border-bottom-color:var(--accent); }
.tab:hover:not(.on) { color:var(--t2); }

/* ── PROGRESS ── */
.pbar { height:3px; background:rgba(255,255,255,.05); border-radius: 2px; overflow:hidden; }
.pbar-fill { height:100%; transition:width .7s var(--ez); }

/* ── BADGE ── */
.sbadge { display:inline-flex; align-items:center; gap:6px; padding:5px 12px; border-radius: 4px;}

/* ── TOAST ── */
.twrap { position:fixed; bottom:22px; right:22px; z-index:9999; display:flex; flex-direction:column; gap:8px; pointer-events:none; }
.tst { padding:14px 18px; font-family:var(--body); font-size:13px; font-weight:500; border-radius: 6px; animation:toast .3s var(--ez) both; max-width:320px; line-height:1.5; box-shadow: 0 4px 12px rgba(0,0,0,0.3); }
.tok { background:var(--s1); border:1px solid rgba(16,185,129,.3); color:var(--ok); }
.terr { background:var(--s1); border:1px solid rgba(239,68,68,.35); color:var(--err); }
.tinf { background:var(--s2); border:1px solid var(--e2); color:var(--t2); }

/* ── SHIMMER ── */
.shim { background:linear-gradient(90deg,var(--s2) 0%,var(--s3) 50%,var(--s2) 100%); background-size:200% 100%; animation:shimmer 1.5s ease-in-out infinite; border-radius: 4px; }

/* ── VIDEO CARD ── */
.vcard { position:relative; overflow:hidden; cursor:pointer; aspect-ratio:16/9; background:var(--s1); border:1px solid var(--e1); border-radius: 6px;}
.vcard-grid {
  position:absolute; inset:0; opacity:.04;
  background-image:linear-gradient(var(--accent) 1px,transparent 1px),linear-gradient(90deg,var(--accent) 1px,transparent 1px);
  background-size:28px 28px;
}
.vcard-scan {
  position:absolute; top:0; left:0; right:0; height:1px;
  background:linear-gradient(90deg,transparent,rgba(56,189,248,.55),transparent);
  animation:scan 3.5s ease-in-out infinite; pointer-events:none; opacity:0;
}
.vcard:hover .vcard-scan { opacity:1; }
.vcard-ov { position:absolute; inset:0; background:linear-gradient(to top,rgba(2,6,23,.96) 28%,rgba(2,6,23,.12) 68%,transparent); }
.vcard-play {
  position:absolute; top:50%; left:50%; transform:translate(-50%,-50%) scale(.78);
  opacity:0; transition:all .28s var(--ez);
  width:56px; height:56px; border-radius:50%;
  border:1px solid rgba(56,189,248,.6); background: rgba(2,6,23,0.5); backdrop-filter: blur(4px); display:flex; align-items:center; justify-content:center;
}
.vcard:hover .vcard-play { opacity:1; transform:translate(-50%,-50%) scale(1); }
.vcard-corner { position:absolute; width:12px; height:12px; border-color:rgba(56,189,248,.25); border-style:solid; transition:border-color .25s; }
.vcard:hover .vcard-corner { border-color:rgba(56,189,248,.65); }
.vcard-corner.tl { top:10px; left:10px; border-width:2px 0 0 2px; }
.vcard-corner.tr { top:10px; right:10px; border-width:2px 2px 0 0; }
.vcard-corner.bl { bottom:10px; left:10px; border-width:0 0 2px 2px; }
.vcard-corner.br { bottom:10px; right:10px; border-width:0 2px 2px 0; }

/* ── MOBILE ── */
.mob-btn { display:none; align-items:center; justify-content:center; background:transparent; border:1px solid var(--e1); border-radius:4px; color:var(--t2); padding:8px; cursor:pointer; flex-shrink:0; }
.mob-drawer { display:none; position:fixed; inset:0; z-index:899; padding-top:var(--nav-h); }
.mob-bg { position:absolute; inset:0; background:rgba(0,0,0,.88); backdrop-filter:blur(6px); }
.mob-nav { position:relative; background:var(--s1); border-bottom:1px solid var(--e1); }
.mob-nv { display:flex; align-items:center; gap:14px; padding:18px 24px; background:transparent; border:none; cursor:pointer; font-family:var(--cond); font-size:13px; font-weight:700; letter-spacing:.2em; text-transform:uppercase; color:var(--t3); width:100%; text-align:left; transition:color .18s; }
.mob-nv:hover { color:var(--t2); }
.mob-nv.on { color:var(--t1); }

/* ── MOTOR INSTRUMENT PANEL ── */
.motor-panel {
  background: radial-gradient(ellipse at 50% 0%, rgba(56,189,248,0.05) 0%, transparent 70%), var(--s1);
  border: 1px solid var(--e1); border-radius: 6px;
  position: relative;
  overflow: hidden;
}
.motor-panel::before {
  content: '';
  position: absolute; inset: 0;
  background-image: linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px),
                    linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px);
  background-size: 20px 20px;
  pointer-events: none;
}

/* ── POWER FLOW ANIMATION ── */
@keyframes flowDot {
  0%   { stroke-dashoffset: 200; opacity: 0; }
  10%  { opacity: 1; }
  90%  { opacity: 1; }
  100% { stroke-dashoffset: 0; opacity: 0; }
}

/* ── EMERGENCY OVERLAY ── */
.emerg-overlay {
  position: fixed; inset: 0; z-index: 9990;
  background: rgba(2,6,23,0.98); backdrop-filter: blur(10px);
  animation: fade .25s both;
  overflow-y: auto;
}
.emerg-header {
  background: rgba(239,68,68,0.1);
  border-bottom: 1px solid rgba(239,68,68,0.25);
  padding: 20px clamp(20px,5vw,60px);
  position: sticky; top: 0; z-index: 2;
  backdrop-filter: blur(12px);
}
.emerg-pulse {
  display: inline-block;
  width: 10px; height: 10px; border-radius: 50%;
  background: var(--err);
  animation: pulse 0.8s ease-in-out infinite;
  box-shadow: 0 0 14px var(--err);
}
.emerg-card {
  border: 1px solid rgba(239,68,68,0.2);
  background: rgba(239,68,68,0.05);
  border-radius: 8px;
  padding: 32px;
}

@media (max-width: 820px) {
  .nv-l { display:none; }
  .nv { padding:0 12px; }
  .nav-div { display:none; }
}
@media (max-width: 600px) {
  .nav-items { display:none; }
  .mob-btn { display:flex !important; }
  .mob-drawer.open { display:block; }
}

/* ── KEYFRAMES ── */
@keyframes enter { from{opacity:0;transform:translateY(22px)} to{opacity:1;transform:translateY(0)} }
@keyframes fade { from{opacity:0} to{opacity:1} }
@keyframes ruleGrow { from{transform:scaleX(0)} to{transform:scaleX(1)} }
@keyframes kenBurns { from{transform:scale(1.05)} to{transform:scale(1)} }
@keyframes rotCompass { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
@keyframes shimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.2} }
@keyframes gPulse { 0%,100%{opacity:.5} 50%{opacity:1} }
@keyframes scan { from{transform:translateY(-100%)} to{transform:translateY(100vh)} }
@keyframes toast { from{opacity:0;transform:translateX(18px)} to{opacity:1;transform:translateX(0)} }

.appear { animation:enter .45s var(--ez) both; }
.stg > * { animation:enter .5s var(--ez) both; }
.stg > *:nth-child(1){animation-delay:.04s} .stg > *:nth-child(2){animation-delay:.10s}
.stg > *:nth-child(3){animation-delay:.16s} .stg > *:nth-child(4){animation-delay:.22s}
.stg > *:nth-child(5){animation-delay:.28s} .stg > *:nth-child(n+6){animation-delay:.34s}
`;

/* ═══════════════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════════════ */
const ls  = (k,v) => { try{if(v!==undefined)localStorage.setItem("ka_"+k,v);return localStorage.getItem("ka_"+k)||"";}catch{return ""} };
const pad = n => String(n).padStart(2,"0");
const toRad = d => d * Math.PI / 180;
const polarPt = (cx,cy,r,deg) => ({x: cx + r*Math.cos(toRad(deg)), y: cy + r*Math.sin(toRad(deg))});
const arc = (cx,cy,r,startDeg,sweepDeg) => {
  const s = polarPt(cx,cy,r,startDeg);
  const e = polarPt(cx,cy,r,startDeg+sweepDeg);
  const la = sweepDeg > 180 ? 1 : 0;
  return `M${s.x},${s.y} A${r},${r} 0 ${la},1 ${e.x},${e.y}`;
};

/* ═══════════════════════════════════════════════════════════════
   TOAST
═══════════════════════════════════════════════════════════════ */
function useToast(){
  const [list,setL]=useState([]);
  const push=useCallback((msg,type="inf")=>{
    const id=Date.now()+Math.random();
    setL(t=>[...t,{id,msg,type}]);
    setTimeout(()=>setL(t=>t.filter(x=>x.id!==id)),4400);
  },[]);
  return{list,push};
}
function Toasts({list}){
  return(<div className="twrap">{list.map(t=>{const k=t.type.slice(0,2);return<div key={t.id} className={`tst ${k==="ok"?"tok":k==="er"?"terr":"tinf"}`}>{t.msg}</div>})}</div>);
}

/* ═══════════════════════════════════════════════════════════════
   MICRO-COMPONENTS
═══════════════════════════════════════════════════════════════ */
function Cap({children,style:st={},sm}){
  return <span style={{fontFamily:"var(--cond)",fontSize:sm?9:11,fontWeight:700,letterSpacing:".2em",textTransform:"uppercase",color:"var(--t3)",...st}}>{children}</span>;
}
function Lbl({children}){
  return <label style={{display:"block",fontFamily:"var(--cond)",fontSize:10,fontWeight:700,letterSpacing:".18em",textTransform:"uppercase",color:"var(--t3)",marginBottom:10}}>{children}</label>;
}
function GDot({pulse}){
  return <span style={{width:6,height:6,borderRadius:"50%",background:"var(--accent)",flexShrink:0,display:"inline-block",animation:pulse?"gPulse 2s ease-in-out infinite":"none"}}/>;
}
function SH({eyebrow,num,title,sub}){
  return(
    <div className="sh">
      {num&&<span className="sh-ghost">{num}</span>}
      <span className="sh-eye">{eyebrow}</span>
      <h1 className="sh-t">{title}</h1>
      {sub&&<p style={{fontFamily:"var(--body)",fontSize:15,fontWeight:400,color:"var(--t2)",marginTop:16,lineHeight:1.7,maxWidth:600}}>{sub}</p>}
      <div className="sh-rule"/>
    </div>
  );
}
function SBadge({estado}){
  const m={pendiente:{c:"var(--warn)",bg:"var(--warn2)",l:"Pendiente"},en_proceso:{c:"var(--info)",bg:"var(--info2)",l:"En Proceso"},solucionado:{c:"var(--ok)",bg:"var(--ok2)",l:"Solucionado"}};
  const e=m[estado]||m.pendiente;
  return(<span className="sbadge" style={{background:e.bg,border:`1px solid ${e.c}40`}}><span style={{width:5,height:5,borderRadius:"50%",background:e.c,flexShrink:0}}/><Cap sm style={{color:e.c}}>{e.l}</Cap></span>);
}

/* ═══════════════════════════════════════════════════════════════
   SVG INSTRUMENTS — BASE
═══════════════════════════════════════════════════════════════ */
function CircularGauge({pct,liters,maxL}){
  const CX=110,CY=108,R=78;
  const START=148,SWEEP=244;
  const fill=Math.max(0.01,(pct/100)*SWEEP);
  const color=pct>55?"var(--ok)":pct>25?"var(--warn)":"var(--err)";
  const ticks=Array.from({length:11},(_,i)=>i);
  const needleDeg=START+fill;
  const needleTip=polarPt(CX,CY,R+9,needleDeg);
  const needleBase=polarPt(CX,CY,R-26,needleDeg);
  return(
    <svg viewBox="0 0 220 195" style={{width:"100%",display:"block"}}>
      <circle cx={CX} cy={CY} r={R+20} fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1"/>
      <path d={arc(CX,CY,R,START,SWEEP)} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="10" strokeLinecap="round"/>
      <path d={arc(CX,CY,R,START,fill)} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
        style={{filter:`drop-shadow(0 0 6px ${pct>55?"rgba(16,185,129,.5)":pct>25?"rgba(245,158,11,.5)":"rgba(239,68,68,.5)"})`,transition:"all .9s cubic-bezier(0.25,1,0.35,1)"}}/>
      {ticks.map(i=>{
        const deg=START+(i/10)*SWEEP;
        const inner=polarPt(CX,CY,R-15,deg);
        const outer=polarPt(CX,CY,R+1,deg);
        return <line key={i} x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke={i===0||i===10?"rgba(255,255,255,0.2)":"rgba(255,255,255,0.07)"} strokeWidth={i===0||i===10?1.5:0.8}/>;
      })}
      <line x1={needleBase.x} y1={needleBase.y} x2={needleTip.x} y2={needleTip.y} stroke={color} strokeWidth="2" strokeLinecap="round" style={{transition:"all .9s cubic-bezier(0.25,1,0.35,1)"}}/>
      <circle cx={CX} cy={CY} r={6} fill={color} style={{filter:`drop-shadow(0 0 4px ${color})`}}/>
      <circle cx={CX} cy={CY} r={2.5} fill="var(--void)"/>
      <text x={CX} y={CY-8} textAnchor="middle" fill="#F8FAFC" style={{fontFamily:"var(--mono)",fontSize:34,fontWeight:700}}>{pct}</text>
      <text x={CX} y={CY+12} textAnchor="middle" fill="rgba(255,255,255,0.3)" style={{fontFamily:"var(--mono)",fontSize:10}}>% COMBUSTIBLE</text>
      <text x={CX} y={CY+30} textAnchor="middle" fill={color} style={{fontFamily:"var(--mono)",fontSize:12,fontWeight:700}}>{liters} L / {maxL} L</text>
    </svg>
  );
}

function TankBar({label,liters,maxL,color,icon}){
  const pct=Math.min(100,Math.round(liters/maxL*100));
  const H=130;
  const fillH=Math.round(pct/100*H);
  return(
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:12}}>
      <div style={{color,opacity:.7}}>{icon}</div>
      <div style={{position:"relative",width:36,height:H,border:"1px solid var(--e2)",borderRadius: "4px", background:"rgba(255,255,255,0.02)",overflow:"hidden"}}>
        <div style={{position:"absolute",bottom:0,left:0,right:0,height:fillH,background:`linear-gradient(to top, ${color}, ${color}90)`,transition:"height 1.1s cubic-bezier(0.25,1,0.35,1)"}}/>
        {pct>5&&<div style={{position:"absolute",bottom:fillH-1,left:0,right:0,height:1,background:"#fff",opacity:.4}}/>}
        {[25,50,75].map(m=>(
          <div key={m} style={{position:"absolute",left:0,right:0,bottom:`${m}%`,height:1,background:"rgba(255,255,255,0.08)"}}/>
        ))}
      </div>
      <div style={{textAlign:"center"}}>
        <p style={{fontFamily:"var(--mono)",fontSize:20,fontWeight:700,color,lineHeight:1}}>{pct}<span style={{fontSize:12,opacity:.6}}>%</span></p>
        <Cap sm style={{display:"block",marginTop:6}}>{label}</Cap>
        <p style={{fontFamily:"var(--mono)",fontSize:10,color:"var(--t3)",marginTop:4}}>{liters}L</p>
      </div>
    </div>
  );
}

function BatteryBank({label,voltage,pct,charging}){
  const color=pct>50?"var(--ok)":pct>25?"var(--warn)":"var(--err)";
  const H=68,W=30;
  const fillH=Math.round(pct/100*H);
  return(
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:10}}>
      <div style={{position:"relative",display:"flex",flexDirection:"column",alignItems:"center"}}>
        <div style={{width:16,height:6,background:"var(--e2)",border:"1px solid var(--e2)",marginBottom:1,borderRadius:"2px 2px 0 0"}}/>
        <div style={{width:W,height:H,border:"1px solid var(--e2)",borderRadius:"2px",background:"rgba(255,255,255,0.02)",overflow:"hidden",position:"relative"}}>
          <div style={{position:"absolute",bottom:0,left:0,right:0,height:fillH,background:`linear-gradient(to top,${color},${color}80)`,transition:"height 1s var(--ez)"}}/>
          {charging&&<div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",zIndex:2}}>
            <span style={{color:"rgba(255,255,255,0.6)",fontSize:16, filter:"drop-shadow(0 0 2px rgba(0,0,0,0.5))"}}>⚡</span>
          </div>}
        </div>
      </div>
      <p style={{fontFamily:"var(--mono)",fontSize:16,fontWeight:700,color,textAlign:"center",lineHeight:1}}>{voltage}V</p>
      <Cap sm style={{textAlign:"center"}}>{label}</Cap>
      <p style={{fontFamily:"var(--mono)",fontSize:10,color:"var(--t3)",textAlign:"center"}}>{pct}%</p>
    </div>
  );
}

function MotorGauge({ value, min, max, label, unit, zones, size=130, animated=true }){
  const CX=size/2, CY=size/2+4, R=size*0.37;
  const START=145, SWEEP=250;
  const clamped=Math.max(min,Math.min(max,value));
  const pct=(clamped-min)/(max-min);
  const fillSweep=pct*SWEEP;
  const needleDeg=START+fillSweep;
  const needleTip=polarPt(CX,CY,R-6,needleDeg);
  const needleBase=polarPt(CX,CY,R-R*0.65,needleDeg);

  let activeColor="var(--ok)";
  if(zones){
    for(const z of zones){
      const lo=min+(max-min)*z.from;
      const hi=min+(max-min)*z.to;
      if(clamped>=lo&&clamped<hi){ activeColor=z.color; }
    }
  }

  const ticks=Array.from({length:11},(_,i)=>i/10);

  return(
    <div style={{textAlign:"center"}}>
      <svg viewBox={`0 0 ${size} ${size+16}`} style={{width:size,height:size+16,display:"block",margin:"0 auto"}}>
        <circle cx={CX} cy={CY} r={R+14} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5"/>
        <circle cx={CX} cy={CY} r={R+8} fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="0.5"/>

        {zones?.map((z,i)=>{
          const sw=(z.to-z.from)*SWEEP;
          const sd=START+z.from*SWEEP;
          return <path key={i} d={arc(CX,CY,R,sd,sw)} fill="none"
            stroke={z.color} strokeWidth="8" strokeLinecap="round" opacity="0.15"/>;
        })}

        <path d={arc(CX,CY,R,START,SWEEP)} fill="none"
          stroke="rgba(255,255,255,0.05)" strokeWidth="8" strokeLinecap="round"/>

        <path d={arc(CX,CY,R,START,Math.max(0.01,fillSweep))} fill="none"
          stroke={activeColor} strokeWidth="8" strokeLinecap="round"
          style={{
            filter:`drop-shadow(0 0 5px ${activeColor}88)`,
            transition:animated?"all .8s cubic-bezier(0.25,1,0.35,1)":"none"
          }}/>

        {ticks.map((t,i)=>{
          const deg=START+t*SWEEP;
          const isMajor=i%5===0;
          const r1=isMajor?R-18:R-14;
          const r2=R+1;
          const {x:x1,y:y1}=polarPt(CX,CY,r1,deg);
          const {x:x2,y:y2}=polarPt(CX,CY,r2,deg);
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={isMajor?"rgba(255,255,255,0.25)":"rgba(255,255,255,0.08)"}
            strokeWidth={isMajor?1.5:1}/>;
        })}

        <line x1={needleBase.x} y1={needleBase.y} x2={needleTip.x} y2={needleTip.y}
          stroke={activeColor} strokeWidth="2" strokeLinecap="round"
          style={{transition:animated?"all .8s cubic-bezier(0.25,1,0.35,1)":"none",
            filter:`drop-shadow(0 0 3px ${activeColor})`}}/>

        <circle cx={CX} cy={CY} r={7} fill="rgba(15,23,42,0.95)" stroke={activeColor} strokeWidth="1"/>
        <circle cx={CX} cy={CY} r={3} fill={activeColor}
          style={{filter:`drop-shadow(0 0 4px ${activeColor})`}}/>

        <text x={CX} y={CY+28} textAnchor="middle" fill={activeColor}
          style={{fontFamily:"var(--mono)",fontSize:size*0.16,fontWeight:700,letterSpacing:"-.02em",
            transition:"fill .4s"}}>
          {Math.round(clamped)}
        </text>

        <text x={CX} y={CY+42} textAnchor="middle" fill="rgba(255,255,255,0.3)"
          style={{fontFamily:"var(--mono)",fontSize:8,letterSpacing:".1em"}}>
          {unit}
        </text>

        <text x={CX} y={size+14} textAnchor="middle" fill="rgba(255,255,255,0.4)"
          style={{fontFamily:"var(--cond)",fontSize:9,fontWeight:700,letterSpacing:".2em"}}>
          {label}
        </text>
      </svg>
    </div>
  );
}

function DualMotorCluster({ mc }){
  const [motorData, setMotorData] = useState({
    babor:  { rpm: 0,   temp: 22, oil: 52,  volt: 12.6 },
    estrib: { rpm: 0,   temp: 22, oil: 51,  volt: 12.7 },
  });
  const [running, setRunning] = useState(false);
  const intervalRef=useRef(null);

  useEffect(()=>{
    if(running){
      let step=0;
      intervalRef.current=setInterval(()=>{
        step++;
        setMotorData(p=>({
          babor: {
            rpm:  Math.min(800, step*80+Math.random()*30),
            temp: Math.min(85, 22+step*4+Math.random()*2),
            oil:  Math.min(55, 52+step*0.3),
            volt: Math.min(13.8, 12.6+step*0.12+Math.random()*0.05),
          },
          estrib: {
            rpm:  Math.min(800, step*78+Math.random()*32),
            temp: Math.min(83, 22+step*3.8+Math.random()*2),
            oil:  Math.min(54, 51+step*0.28),
            volt: Math.min(13.9, 12.7+step*0.11+Math.random()*0.05),
          },
        }));
        if(step>=12) clearInterval(intervalRef.current);
      },400);
    } else {
      clearInterval(intervalRef.current);
      setMotorData({
        babor:  { rpm: 0,   temp: 22, oil: 52,  volt: 12.6 },
        estrib: { rpm: 0,   temp: 22, oil: 51,  volt: 12.7 },
      });
    }
    return()=>clearInterval(intervalRef.current);
  },[running]);

  const rpmZones=[
    {from:0,   to:.6,  color:"var(--ok)"},
    {from:.6,  to:.85, color:"var(--warn)"},
    {from:.85, to:1,   color:"var(--err)"},
  ];
  const tempZones=[
    {from:0,   to:.55, color:"var(--info)"},
    {from:.55, to:.8,  color:"var(--ok)"},
    {from:.8,  to:1,   color:"var(--err)"},
  ];
  const oilZones=[
    {from:0,   to:.25, color:"var(--err)"},
    {from:.25, to:.85, color:"var(--ok)"},
    {from:.85, to:1,   color:"var(--warn)"},
  ];
  const voltZones=[
    {from:0,   to:.3,  color:"var(--err)"},
    {from:.3,  to:.65, color:"var(--warn)"},
    {from:.65, to:1,   color:"var(--ok)"},
  ];

  const G_SIZE=124;

  return(
    <div className="motor-panel" style={{padding:"32px 28px"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:28}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <Gauge size={16} color="var(--t3)"/>
          <Cap>Panel de Instrumentos — Motores</Cap>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          {running&&<><GDot pulse/><span style={{fontFamily:"var(--mono)",fontSize:10,color:"var(--ok)",letterSpacing:".08em",opacity:.9}}>EN MARCHA</span></>}
          <button
            onClick={()=>setRunning(r=>!r)}
            style={{
              padding:"10px 20px", borderRadius: "4px",
              background:running?"rgba(239,68,68,0.1)":"rgba(56,189,248,0.1)",
              border:`1px solid ${running?"rgba(239,68,68,0.3)":"rgba(56,189,248,0.3)"}`,
              color:running?"var(--err)":"var(--accent)",
              fontFamily:"var(--cond)",fontWeight:700,fontSize:10,
              letterSpacing:".2em",textTransform:"uppercase",
              cursor:"pointer",transition:"all .25s",
              display:"flex",alignItems:"center",gap:8,
            }}>
            <Power size={12}/>
            {running?"APAGAR":"SIMULAR ARRANQUE"}
          </button>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1px 1fr",gap:0}}>
        {["babor","estrib"].map((eng,ei)=>{
          const d=motorData[eng];
          return(
            <React.Fragment key={eng}>
              <div style={{padding:ei===0?"0 24px 0 0":"0 0 0 24px"}}>
                <div style={{
                  display:"flex",alignItems:"center",gap:12,
                  paddingBottom:20,marginBottom:20,
                  borderBottom:"1px solid var(--e1)"
                }}>
                  <div style={{
                    width:8,height:8,borderRadius:"50%",
                    background:running?"var(--ok)":"var(--t3)",
                    boxShadow:running?"0 0 10px var(--ok)":"none",
                    transition:"all .5s",flexShrink:0
                  }}/>
                  <p style={{
                    fontFamily:"var(--cond)",fontSize:15,fontWeight:800,
                    letterSpacing:".25em",textTransform:"uppercase",
                    color:running?"var(--t1)":"var(--t3)",transition:"color .5s"
                  }}>
                    Motor {eng==="babor"?"Babor":"Estribor"}
                  </p>
                  <span style={{
                    marginLeft:"auto",fontFamily:"var(--mono)",fontSize:10,
                    color:"var(--t3)",letterSpacing:".1em"
                  }}>
                    {eng==="babor"?"PORT":"STBD"}
                  </span>
                </div>

                <div style={{
                  display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(130px, 1fr))",
                  gap:12,
                }}>
                  <div style={{padding:"16px 10px",background:"rgba(0,0,0,0.2)",border:"1px solid rgba(255,255,255,0.04)", borderRadius: "6px"}}>
                    <MotorGauge value={d.rpm} min={0} max={3000} label="RPM" unit="rev/min" zones={rpmZones} size={G_SIZE}/>
                  </div>
                  <div style={{padding:"16px 10px",background:"rgba(0,0,0,0.2)",border:"1px solid rgba(255,255,255,0.04)", borderRadius: "6px"}}>
                    <MotorGauge value={d.temp} min={0} max={120} label="TEMP" unit="°C" zones={tempZones} size={G_SIZE}/>
                  </div>
                  <div style={{padding:"16px 10px",background:"rgba(0,0,0,0.2)",border:"1px solid rgba(255,255,255,0.04)", borderRadius: "6px"}}>
                    <MotorGauge value={d.oil} min={0} max={80} label="ACEITE" unit="psi" zones={oilZones} size={G_SIZE}/>
                  </div>
                  <div style={{padding:"16px 10px",background:"rgba(0,0,0,0.2)",border:"1px solid rgba(255,255,255,0.04)", borderRadius: "6px"}}>
                    <MotorGauge value={d.volt} min={11} max={16} label="VOLTAJE" unit="V" zones={voltZones} size={G_SIZE}/>
                  </div>
                </div>

                <div style={{
                  display:"grid",gridTemplateColumns:"1fr 1fr 1fr",
                  gap:2,marginTop:12
                }}>
                  {[
                    {l:"HORAS",v:eng==="babor"?"1.284":"1.291",u:"h"},
                    {l:"PRESIÓN",v:running?"52":"--",u:"psi"},
                    {l:"CAUDAL",v:running?"18.4":"--",u:"L/h"},
                  ].map(item=>(
                    <div key={item.l} style={{
                      padding:"12px 10px",
                      background:"rgba(255,255,255,0.02)",
                      border:"1px solid var(--e1)",textAlign:"center", borderRadius: "4px"
                    }}>
                      <p style={{fontFamily:"var(--mono)",fontSize:15,color:"var(--t1)",fontWeight:700,lineHeight:1}}>
                        {item.v}<span style={{fontSize:10,opacity:.5,marginLeft:4}}>{item.u}</span>
                      </p>
                      <Cap sm style={{marginTop:6,display:"block"}}>{item.l}</Cap>
                    </div>
                  ))}
                </div>
              </div>

              {ei===0&&(
                <div style={{
                  background:"linear-gradient(to bottom,transparent,var(--e2),var(--e2),transparent)",
                  width:1,margin:"0 0"
                }}/>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {!running&&(
        <div style={{
          marginTop:24,padding:"14px 20px", borderRadius: "6px",
          background:"rgba(245,158,11,0.05)",
          border:"1px solid rgba(245,158,11,0.15)",
          display:"flex",alignItems:"center",gap:12
        }}>
          <AlertTriangle size={14} color="var(--warn)" style={{opacity:.8,flexShrink:0}}/>
          <p style={{color:"var(--t2)",fontSize:13,fontWeight:400,lineHeight:1.6}}>
            Panel en modo <span style={{color:"var(--t1)"}}>reposo</span>. Use "Simular Arranque" para ver los instrumentos en operación, o conecte al sistema NMEA 2000 para datos reales.
          </p>
        </div>
      )}
    </div>
  );
}

function AnimatedPowerFlowDiagram({active}){
  const sources=[
    {id:"puerto",y:30, label:"SHORE",    sub:"220V CA",   color:"var(--info)"},
    {id:"grupo", y:90, label:"GENERADOR",sub:"220V CA",   color:"var(--warn)"},
    {id:"inv",   y:150,label:"INVERTER", sub:"12V→220V",  color:"var(--ok)"},
  ];
  const loads=["Climatización","Cocina · Horno","Termotanque","Carga 220V","Luces · Aux"];

  return(
    <svg viewBox="0 0 540 195" style={{width:"100%",display:"block",overflow:"visible"}}>
      <defs>
        {sources.map(s=>(
          <marker key={s.id} id={`arr-${s.id}`} viewBox="0 0 8 8" refX="6" refY="4"
            markerWidth="5" markerHeight="5" orient="auto">
            <path d="M0,0 L8,4 L0,8 Z" fill={s.color} opacity={active===s.id?0.8:0}/>
          </marker>
        ))}
      </defs>

      {sources.map(s=>{
        const isActive=active===s.id;
        const y2=95;
        const x1=118,x2=222;
        const pathD=`M${x1},${s.y+20} C${(x1+x2)/2},${s.y+20} ${(x1+x2)/2},${y2} ${x2},${y2}`;

        return(
          <g key={s.id}>
            <rect x="14" y={s.y} width="104" height="40" rx="4"
              fill={isActive?`color-mix(in srgb, ${s.color} 15%, transparent)`:"rgba(255,255,255,0.03)"}
              stroke={isActive?s.color:"rgba(255,255,255,0.08)"} strokeWidth={isActive?"1.5":"1"}
              style={{transition:"all .4s"}}/>
            <text x="66" y={s.y+16} textAnchor="middle"
              style={{fontFamily:"var(--cond)",fontSize:10,fontWeight:700,letterSpacing:".18em",
                fill:isActive?s.color:"rgba(255,255,255,0.3)",transition:"fill .4s"}}>
              {s.label}
            </text>
            <text x="66" y={s.y+30} textAnchor="middle"
              style={{fontFamily:"var(--mono)",fontSize:9,fill:isActive?s.color:"rgba(255,255,255,0.15)",
                transition:"fill .4s"}}>
              {s.sub}
            </text>
            {isActive&&<circle cx="22" cy={s.y+20} r="3" fill={s.color}
              style={{animation:"gPulse 1.4s ease-in-out infinite"}}/>}

            <path d={pathD} fill="none"
              stroke={isActive?s.color:"rgba(255,255,255,0.05)"}
              strokeWidth={isActive?"2":"1"}
              strokeDasharray={isActive?"none":"4 6"}
              style={{transition:"all .4s"}}
              markerEnd={isActive?`url(#arr-${s.id})`:"none"}/>

            {isActive&&[0,1,2].map(di=>(
              <circle key={di} r="3" fill={s.color}
                style={{filter:`drop-shadow(0 0 5px ${s.color})`}}>
                <animateMotion dur="1.4s" repeatCount="indefinite" begin={`${di*0.47}s`}>
                  <mpath xlinkHref={`#flow-path-${s.id}`}/>
                </animateMotion>
              </circle>
            ))}

            {isActive&&(
              <path id={`flow-path-${s.id}`} d={pathD} fill="none" stroke="none"/>
            )}
          </g>
        );
      })}

      <rect x="222" y="72" width="64" height="46" rx="4"
        fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.15)" strokeWidth="1"/>
      <text x="254" y="90" textAnchor="middle"
        style={{fontFamily:"var(--cond)",fontSize:9,fontWeight:700,letterSpacing:".18em",fill:"var(--t2)"}}>
        SELECTOR
      </text>
      <text x="254" y="107" textAnchor="middle"
        style={{fontFamily:"var(--mono)",fontSize:9,fill:"var(--t3)"}}>
        FUENTE
      </text>

      <line x1="286" y1="95" x2="340" y2="95" stroke="rgba(255,255,255,0.1)" strokeWidth="1.5"/>

      {active&&[0,1].map(di=>(
        <circle key={di} cx="0" cy="0" r="2.5" fill="rgba(255,255,255,0.3)">
          <animateMotion path={`M286,95 L340,95`} dur="0.7s" repeatCount="indefinite" begin={`${di*0.35}s`}/>
        </circle>
      ))}

      {loads.map((l,i)=>{
        const y=18+i*34;
        const sourceColor=active==="puerto"?"var(--info)":active==="grupo"?"var(--warn)":active==="inv"?"var(--ok)":"rgba(255,255,255,0.08)";
        return(
          <g key={l}>
            <line x1="340" y1="95" x2="340" y2={y+10}
              stroke="rgba(255,255,255,0.08)" strokeWidth="1"/>
            <line x1="340" y1={y+10} x2="366" y2={y+10}
              stroke="rgba(255,255,255,0.08)" strokeWidth="1"/>
            <rect x="366" y={y} width="150" height="20" rx="2"
              fill={active?"rgba(255,255,255,0.04)":"rgba(255,255,255,0.02)"}
              stroke="rgba(255,255,255,0.08)" strokeWidth="1"/>
            {active&&(
              <circle cx="0" cy="0" r="2"
                fill={sourceColor} opacity="0.7">
                <animateMotion
                  path={`M340,95 L340,${y+10} L366,${y+10}`}
                  dur={`${1.1+i*0.15}s`} repeatCount="indefinite" begin={`${i*0.22}s`}/>
              </circle>
            )}
            <text x="441" y={y+14} textAnchor="middle"
              style={{fontFamily:"var(--cond)",fontSize:9,fontWeight:600,
                letterSpacing:".15em",fill:"rgba(255,255,255,0.4)"}}>
              {l.toUpperCase()}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function EmergencyOverlay({ onClose }){
  const [activeProc, setActiveProc]=useState(null);
  const procedures=[
    {
      id:"incendio",
      t:"INCENDIO A BORDO",
      icon:<Flame size={28}/>,
      color:"var(--err)",
      steps:[
        {n:"01",t:"CORTAR MOTORES",d:"Llaves de contacto OFF en ambos motores. Cerrar válvulas de combustible."},
        {n:"02",t:"EXTINTOR CO₂",d:"Apuntar a la BASE del fuego. Barrer de costado, no a las llamas. 3 a 5 segundos de descarga continua."},
        {n:"03",t:"MAYDAY VHF CH16",d:'"MAYDAY MAYDAY MAYDAY — [nombre del barco] — posición GPS — incendio a bordo — [número de personas]"'},
        {n:"04",t:"ABANDONO SI NO CEDE",d:"60 segundos sin control → preparar balsa, chalecos, EPIRB activado."},
      ]
    },
    {
      id:"mob",
      t:"HOMBRE AL AGUA",
      icon:<Droplets size={28}/>,
      color:"var(--info)",
      steps:[
        {n:"01",t:"ARO SALVAVIDAS",d:"Lanzar INMEDIATAMENTE al agua. Gritar HOMBRE AL AGUA. Designar un observador que NO pierda contacto visual."},
        {n:"02",t:"MOB EN GPS",d:"Presionar botón MOB o marcar posición manual. No perder el waypoint."},
        {n:"03",t:"MANIOBRA DE RECUPERACIÓN",d:"Acercarse al náufrago con el viento desde proa. Reducir velocidad. Náufrago siempre a popa."},
        {n:"04",t:"IZAR A BORDO",d:"Usar escalera, bichero o arnés de rescate. Si está incapacitado: espía + andamio o balsa de rescate."},
      ]
    },
    {
      id:"agua",
      t:"INGRESO DE AGUA",
      icon:<AlertTriangle size={28}/>,
      color:"var(--warn)",
      steps:[
        {n:"01",t:"LOCALIZAR Y CONTROLAR",d:"Identificar punto de ingreso. Tapones de emergencia, ropa, madera. Activar TODAS las bombas de achique."},
        {n:"02",t:"EVALUAR EL CAUDAL",d:"Si la bomba controla el nivel: mantener en marcha y navegar a puerto más cercano."},
        {n:"03",t:"SI NO SE PUEDE CONTROLAR",d:"MAYDAY inmediato. Preparar chalecos, EPIRB, balsa. Documentación en bolsa waterproof."},
        {n:"04",t:"ABANDONO",d:"Orden: inflables, mujeres/niños, heridos, resto. Nunca abandonar si el barco está a flote."},
      ]
    },
  ];

  return(
    <div className="emerg-overlay">
      <div className="emerg-header">
        <div style={{
          display:"flex",alignItems:"center",
          justifyContent:"space-between",
          maxWidth:1200,margin:"0 auto"
        }}>
          <div style={{display:"flex",alignItems:"center",gap:16}}>
            <div className="emerg-pulse"/>
            <div>
              <p style={{
                fontFamily:"var(--cond)",fontSize:14,fontWeight:800,
                letterSpacing:".4em",color:"var(--err)",textTransform:"uppercase"
              }}>
                MODO EMERGENCIA
              </p>
              <p style={{
                fontFamily:"var(--mono)",fontSize:10,
                color:"rgba(239,68,68,0.7)",letterSpacing:".1em",marginTop:4
              }}>
                PREFECTURA NAVAL ARG: 106  ·  GUARDIA COSTERA: 0800-666-3500  ·  VHF CANAL 16
              </p>
            </div>
          </div>
          <button onClick={onClose}
            style={{
              padding:"10px 24px",background:"transparent",
              border:"1px solid rgba(255,255,255,0.15)", borderRadius: "6px",
              color:"rgba(255,255,255,0.6)",fontFamily:"var(--cond)",
              fontWeight:700,fontSize:10,letterSpacing:".2em",
              textTransform:"uppercase",cursor:"pointer",
              display:"flex",alignItems:"center",gap:8,transition:"all .2s"
            }}
            onMouseEnter={e=>{e.currentTarget.style.borderColor="rgba(255,255,255,0.3)"; e.currentTarget.style.color="#fff"}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(255,255,255,0.15)"; e.currentTarget.style.color="rgba(255,255,255,0.6)"}}>
            <X size={14}/>CERRAR EMERGENCIA
          </button>
        </div>
      </div>

      <div style={{
        maxWidth:1200,margin:"0 auto",
        padding:"clamp(24px,4vw,48px) clamp(20px,5vw,60px)"
      }}>
        <div style={{
          display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",
          gap:16,marginBottom:32
        }}>
          {procedures.map(p=>(
            <button key={p.id}
              onClick={()=>setActiveProc(activeProc===p.id?null:p.id)}
              style={{
                padding:"26px 24px",textAlign:"left",cursor:"pointer",
                background:activeProc===p.id?`color-mix(in srgb, ${p.color} 15%, rgba(2,6,23,0.95))`:"rgba(255,255,255,0.03)",
                border:`1px solid ${activeProc===p.id?p.color:"rgba(255,255,255,0.08)"}`,
                borderRadius: "8px", transition:"all .25s",
              }}
              onMouseEnter={e=>{if(activeProc!==p.id)e.currentTarget.style.background="rgba(255,255,255,0.06)"}}
              onMouseLeave={e=>{if(activeProc!==p.id)e.currentTarget.style.background="rgba(255,255,255,0.03)"}}>
              <div style={{color:p.color,opacity:activeProc===p.id?1:.6,marginBottom:16,transition:"opacity .25s"}}>{p.icon}</div>
              <p style={{
                fontFamily:"var(--cond)",fontSize:15,fontWeight:800,
                letterSpacing:".2em",color:activeProc===p.id?"var(--t1)":"var(--t3)",
                textTransform:"uppercase",transition:"color .25s"
              }}>
                {p.t}
              </p>
            </button>
          ))}
        </div>

        {activeProc&&(()=>{
          const proc=procedures.find(p=>p.id===activeProc);
          return(
            <div className="emerg-card" style={{
              borderColor:`${proc.color}40`,
              background:`color-mix(in srgb, ${proc.color} 8%, rgba(2,6,23,0.98))`,
              animation:"enter .35s var(--ez) both"
            }}>
              <div style={{
                display:"flex",alignItems:"center",gap:16,
                paddingBottom:24,marginBottom:12,
                borderBottom:`1px solid ${proc.color}30`
              }}>
                <div style={{color:proc.color}}>{proc.icon}</div>
                <h2 style={{
  fontFamily:"var(--serif)", fontSize: "clamp(22px, 4vw, 32px)",
  fontWeight:700, letterSpacing:"-.02em",
  color:"var(--t1)"
}}>
                }}>
                  {proc.t}
                </h2>
              </div>
              {proc.steps.map((s,i)=>(
                <div key={i} className="step" style={{ borderBottomColor: `${proc.color}15` }}>
                  <span style={{
                    fontFamily:"var(--mono)",fontSize:28,fontWeight:700,
                    color:proc.color,opacity:.4,flexShrink:0,lineHeight:1,
                    minWidth:44
                  }}>
                    {s.n}
                  </span>
                  <div>
                    <p style={{
                      fontFamily:"var(--cond)",fontSize:16,fontWeight:800,
                      letterSpacing:".15em",color:"var(--t1)",
                      textTransform:"uppercase",marginBottom:8
                    }}>
                      {s.t}
                    </p>
                    <p style={{
                      fontFamily:"var(--body)",fontSize:15,color:"var(--t2)",
                      fontWeight:400,lineHeight:1.8
                    }}>
                      {s.d}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          );
        })()}

        {!activeProc&&(
          <div style={{
            padding:"32px", borderRadius: "8px",
            background:"rgba(255,255,255,0.02)",
            border:"1px dashed rgba(255,255,255,0.1)",
            textAlign:"center",animation:"fade .4s .2s both"
          }}>
            <p style={{
              fontFamily:"var(--cond)",fontSize:12,fontWeight:700,letterSpacing:".25em",
              color:"var(--t3)",textTransform:"uppercase",marginBottom:8
            }}>
              Seleccione el tipo de emergencia
            </p>
            <p style={{color:"var(--t3)",fontSize:14,fontWeight:400}}>
              Los procedimientos aparecerán paso a paso
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function CompassRose({size=280,style={}}){
  const R=size/2;
  const cardinals=[{l:"N",d:0},{l:"E",d:90},{l:"S",d:180},{l:"O",d:270}];
  const intermediates=[{l:"NE",d:45},{l:"SE",d:135},{l:"SO",d:225},{l:"NO",d:315}];
  return(
    <svg viewBox={`0 0 ${size} ${size}`} style={{width:size,height:size,opacity:.3,...style}}>
      <circle cx={R} cy={R} r={R-2} fill="none" stroke="rgba(56,189,248,0.4)" strokeWidth=".5"/>
      <circle cx={R} cy={R} r={R*0.68} fill="none" stroke="rgba(56,189,248,0.2)" strokeWidth=".4"/>
      <circle cx={R} cy={R} r={R*0.36} fill="none" stroke="rgba(56,189,248,0.2)" strokeWidth=".4"/>
      {[0,22.5,45,67.5,90,112.5,135,157.5,180,202.5,225,247.5,270,292.5,315,337.5].map(d=>{
        const isCardinal=d%90===0;
        const isInter=d%45===0&&!isCardinal;
        const r1=isCardinal?R*0.68:isInter?R*0.72:R*0.82;
        const {x:x1,y:y1}=polarPt(R,R,r1,d-90);
        const {x:x2,y:y2}=polarPt(R,R,R-2,d-90);
        return <line key={d} x1={x1} y1={y1} x2={x2} y2={y2}
          stroke={isCardinal?"rgba(56,189,248,0.8)":isInter?"rgba(56,189,248,0.4)":"rgba(56,189,248,0.2)"}
          strokeWidth={isCardinal?1:0.5}/>;
      })}
      {cardinals.map(c=>{
        const {x,y}=polarPt(R,R,R*0.5,c.d-90);
        return <text key={c.l} x={x} y={y+5} textAnchor="middle"
          fill="rgba(56,189,248,0.9)"
          style={{fontFamily:"var(--cond)",fontSize:14,fontWeight:800,letterSpacing:".1em"}}>{c.l}</text>;
      })}
      {intermediates.map(c=>{
        const {x,y}=polarPt(R,R,R*0.52,c.d-90);
        return <text key={c.l} x={x} y={y+4} textAnchor="middle"
          fill="rgba(56,189,248,0.5)"
          style={{fontFamily:"var(--cond)",fontSize:10,fontWeight:600,letterSpacing:".1em"}}>{c.l}</text>;
      })}
      <circle cx={R} cy={R} r={5} fill="rgba(56,189,248,0.6)"/>
      <circle cx={R} cy={R} r={2} fill="rgba(56,189,248,1)"/>
    </svg>
  );
}

function WindyWidget(){
  const [loaded,setLoaded]=useState(false);
  const src="https://embed.windy.com/embed.html?type=map&location=coordinates&metricRain=default&metricTemp=%C2%B0C&metricWind=km%2Fh&zoom=10&overlay=wind&product=ecmwf&level=surface&lat=-34.40&lon=-58.58";
  return(
    <div className="card" style={{marginBottom:24,overflow:"hidden"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,padding:"14px 24px",borderBottom:"1px solid var(--e1)"}}>
        <Wind size={14} color="var(--t3)"/>
        <Cap>Radar Meteorológico · ECMWF</Cap>
        <div style={{display:"flex",alignItems:"center",gap:8,marginLeft:"auto"}}>
          {loaded&&<><GDot pulse/><span style={{fontFamily:"var(--mono)",fontSize:10,color:"var(--accent)",fontWeight:700,letterSpacing:".1em",opacity:.9}}>LIVE</span></>}
          {!loaded&&<Cap sm>CARGANDO…</Cap>}
        </div>
      </div>
      <div style={{position:"relative",height:460}}>
        <div style={{position:"absolute",inset:0,zIndex:2,pointerEvents:"none",background:"rgba(2,6,23,0.15)"}}/>
        {!loaded&&(
          <div style={{position:"absolute",inset:0,zIndex:3,display:"flex",alignItems:"center",justifyContent:"center",background:"var(--void)"}}>
            <div style={{display:"flex",flexDirection:"column",gap:6,alignItems:"center"}}>
              {[100,70,50,70,100].map((w,i)=><div key={i} className="shim" style={{height:3,width:`${w}%`,maxWidth:180}}/>)}
              <Cap sm style={{marginTop:16}}>Iniciando radar...</Cap>
            </div>
          </div>
        )}
        <iframe src={src} onLoad={()=>setLoaded(true)} width="100%" height="100%"
          style={{border:"none",display:"block",filter:"grayscale(40%) contrast(110%) brightness(0.9)",width:"100%",height:"100%"}}
          title="Windy" loading="lazy" allow="geolocation"/>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SEC BIENVENIDA
═══════════════════════════════════════════════════════════════ */
function SecBienvenida({cliente,goTo,onEmergency}){
  const [wx,setWx]=useState(null);
  const [loaded,setLoaded]=useState(false);
  const [time,setTime]=useState(new Date());

  useEffect(()=>{
    const t=setInterval(()=>setTime(new Date()),1000);
    return()=>clearInterval(t);
  },[]);

  useEffect(()=>{
    const get=async(lat,lon)=>{
      try{
        const r=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,wind_speed_10m,wind_direction_10m,surface_pressure,relative_humidity_2m&hourly=visibility&timezone=auto`);
        const d=await r.json();
        const dirs=["N","NE","E","SE","S","SO","O","NO"];
        setWx({
          t:Math.round(d.current.temperature_2m),
          w:Math.round(d.current.wind_speed_10m),
          d:dirs[Math.round(d.current.wind_direction_10m/45)%8],
          p:Math.round(d.current.surface_pressure),
          h:d.current.relative_humidity_2m,
        });
      }catch{setWx({t:"—",w:"—",d:"—",p:"—",h:"—"})}
    };
    if(navigator.geolocation)navigator.geolocation.getCurrentPosition(p=>get(p.coords.latitude,p.coords.longitude),()=>get(-34.425,-58.544));
    else get(-34.425,-58.544);
  },[]);

  const img=cliente?.imagen_unidad||"https://images.unsplash.com/photo-1567899378494-47b22a2ae96a?w=1800&q=90";
  const firstName=(cliente?.nombre_completo||"").split(" ")[0];
  const hull=[cliente?.nombre_barco,cliente?.numero_unidad].filter(Boolean).join("  ·  ");
  const hh=pad(time.getHours()),mm=pad(time.getMinutes()),ss=pad(time.getSeconds());

  const QA=[
    {n:"01",t:"Identidad",d:"Matrícula · Seguros",s:"configuracion",ico:<Anchor size={24}/>},
    {n:"02",t:"Planificador",d:"Autonomía · Zarpe",s:"resumen",ico:<Navigation size={24}/>},
    {n:"03",t:"Energía",d:"Tableros · Inverter",s:"energia",ico:<Zap size={24}/>},
    {n:"04",t:"Propulsión",d:"Motores · Mando",s:"propulsion",ico:<Gauge size={24}/>},
    {n:"05",t:"Sistemas",d:"Tanques · Bombas",s:"sistemas",ico:<Settings size={24}/>},
    {n:"06",t:"Seguridad",d:"Diagnóstico rápido",s:"seguridad",ico:<Shield size={24}/>},
    {n:"07",t:"Videoteca",d:"Tutoriales en video",s:"tutoriales",ico:<Play size={24}/>},
    {n:"08",t:"Soporte",d:"Reportes · Service",s:"soporte",ico:<MessageSquare size={24}/>},
  ];

  return(
    <div>
      {/* ── HERO ── */}
      <div style={{position:"relative",width:"100%",height:"min(92vh,760px)",overflow:"hidden"}}>
        <img src={img} onLoad={()=>setLoaded(true)} alt=""
          style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",objectPosition:"center 38%",
            animation:loaded?"kenBurns 18s ease-out both":"none",opacity:loaded?1:0,transition:"opacity 1.1s"}}/>
        <div style={{position:"absolute",inset:0,background:"linear-gradient(108deg,rgba(2,6,23,.98) 0%,rgba(2,6,23,.65) 36%,rgba(2,6,23,.2) 100%)"}}/>
        <div style={{position:"absolute",inset:0,background:"linear-gradient(to top,rgba(2,6,23,1) 0%,rgba(2,6,23,.5) 22%,transparent 50%)"}}/>
        <div style={{position:"absolute",inset:0,background:"radial-gradient(ellipse at 95% 5%,rgba(56,189,248,0.05),transparent 50%)"}}/>

        <div style={{position:"absolute",right:"clamp(-40px,0vw,40px)",top:"50%",transform:"translateY(-50%)",animation:"fade 2s 0.5s both",pointerEvents:"none"}}>
          <div style={{animation:"rotCompass 90s linear infinite"}}>
            <CompassRose size={420}/>
          </div>
        </div>

        {/* Clock */}
        <div style={{position:"absolute",top:"clamp(24px,3vw,36px)",left:"clamp(24px,5vw,64px)",animation:"fade 1s .3s both"}}>
          <p style={{fontFamily:"var(--mono)",fontSize:26,color:"rgba(255,255,255,0.9)",fontWeight:700,letterSpacing:".04em",lineHeight:1}}>
            {hh}<span style={{opacity:.4,animation:"pulse 1s ease-in-out infinite"}}>:</span>{mm}
            <span style={{opacity:.4,animation:"pulse 1s ease-in-out infinite",animationDelay:".5s"}}>:</span>
            <span style={{fontSize:16,opacity:.5}}>{ss}</span>
          </p>
          <p style={{fontFamily:"var(--mono)",fontSize:10,color:"var(--accent)",letterSpacing:".2em",marginTop:6}}>34°25′S  58°32′O · ARG</p>
        </div>

        {/* Weather pill */}
        {wx&&(
          <div style={{position:"absolute",top:"clamp(24px,3vw,36px)",right:"clamp(24px,5vw,64px)",animation:"fade 1.2s .6s both"}}>
            <div style={{display:"flex",alignItems:"center",gap:14,padding:"12px 20px", borderRadius: "30px",
              background:"rgba(15,23,42,0.6)",border:"1px solid var(--e2)",backdropFilter:"blur(16px)"}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <Thermometer size={14} color="var(--t2)"/>
                <span style={{fontFamily:"var(--mono)",fontSize:13,fontWeight:700,color:"var(--t1)",letterSpacing:".04em"}}>{wx.t}°C</span>
              </div>
              <div style={{width:1,height:16,background:"var(--e2)"}}/>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <Wind size={14} color="var(--t2)"/>
                <span style={{fontFamily:"var(--mono)",fontSize:12,color:"var(--t2)",letterSpacing:".04em"}}>{wx.d} {wx.w}<span style={{fontSize:9,opacity:.6}}> km/h</span></span>
              </div>
              <div style={{width:1,height:16,background:"var(--e2)"}}/>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <Activity size={14} color="var(--t2)"/>
                <span style={{fontFamily:"var(--mono)",fontSize:12,color:"var(--t2)",letterSpacing:".04em"}}>{wx.p}<span style={{fontSize:9,opacity:.6}}> hPa</span></span>
              </div>
              <GDot pulse/>
            </div>
          </div>
        )}

        {/* Hero text */}
        <div style={{position:"absolute",bottom:"clamp(40px,6vw,90px)",left:"clamp(24px,5vw,64px)",maxWidth:720}}>
          <div style={{marginBottom:10,animation:"enter .6s .04s var(--ez) both"}}>
            <span style={{fontFamily:"var(--cond)",fontSize:13,fontWeight:800,letterSpacing:".3em",color:"var(--accent)",textTransform:"uppercase"}}>{cliente?.modelo_barco||"KLASE A"}</span>
          </div>
          
          <div style={{animation:"enter .8s .12s var(--ez) both"}}>
            <h1 style={{
              fontFamily: "var(--serif)",
              fontWeight: 600,
              fontSize: "clamp(64px, 9vw, 120px)",
              color: "var(--t1)",
              lineHeight: 1.1, /* Fixed the clipping issue! */
              letterSpacing: "-.02em",
              textShadow: "0 10px 40px rgba(0,0,0,0.5)",
              paddingBottom: "10px"
            }}>
              {firstName || "Bienvenido"}
            </h1>
          </div>
          
          {hull&&(
            <div style={{marginTop:16,animation:"enter .8s .24s var(--ez) both"}}>
              <div style={{display:"inline-flex",alignItems:"center",gap:16,paddingLeft:18,borderLeft:"2px solid var(--accent)"}}>
                <span style={{fontFamily:"var(--mono)",fontSize:12,color:"rgba(255,255,255,0.6)",letterSpacing:".15em", fontWeight: 700}}>{hull}</span>
              </div>
            </div>
          )}
          <div style={{marginTop:20,animation:"enter .8s .32s var(--ez) both"}}>
            <p style={{fontFamily:"var(--body)",fontSize:17,fontWeight:400,color:"rgba(255,255,255,0.5)",lineHeight:1.6,maxWidth:520}}>
              Manual interactivo de su embarcación. Todo lo que necesita para operar con precisión y confianza.
            </p>
          </div>
          <div style={{display:"flex",gap:14,marginTop:32,animation:"enter .8s .42s var(--ez) both",flexWrap:"wrap"}}>
            <button onClick={()=>goTo("soporte")}
              style={{padding:"14px 32px",background:"var(--accent)",color:"#020617",border:"none", borderRadius:"4px",
                fontFamily:"var(--cond)",fontWeight:800,fontSize:11,letterSpacing:".25em",
                textTransform:"uppercase",cursor:"pointer",transition:"filter .2s,transform .15s"}}
              onMouseEnter={e=>{e.currentTarget.style.filter="brightness(1.15)";e.currentTarget.style.transform="translateY(-2px)"}}
              onMouseLeave={e=>{e.currentTarget.style.filter="brightness(1)";e.currentTarget.style.transform="translateY(0)"}}>
              Reportar Falla
            </button>
            <button onClick={onEmergency}
              style={{padding:"14px 28px",background:"rgba(239,68,68,0.1)", borderRadius:"4px",
                color:"var(--err)",border:"1px solid rgba(239,68,68,0.3)",
                fontFamily:"var(--cond)",fontWeight:700,fontSize:11,letterSpacing:".25em",
                textTransform:"uppercase",cursor:"pointer",transition:"all .2s",
                display:"flex",alignItems:"center",gap:10}}
              onMouseEnter={e=>{e.currentTarget.style.background="rgba(239,68,68,0.2)";e.currentTarget.style.borderColor="rgba(239,68,68,0.5)"}}
              onMouseLeave={e=>{e.currentTarget.style.background="rgba(239,68,68,0.1)";e.currentTarget.style.borderColor="rgba(239,68,68,0.3)"}}>
              <div style={{width:6,height:6,borderRadius:"50%",background:"var(--err)",animation:"pulse .8s ease-in-out infinite",boxShadow:"0 0 8px var(--err)"}}/>
              Emergencia
            </button>
          </div>
        </div>
        <div style={{position:"absolute",bottom:0,left:0,right:0,height:1,background:"linear-gradient(90deg,var(--accent),transparent 65%)", opacity: 0.4}}/>
      </div>

      {/* Module grid */}
      <div style={{maxWidth:1400,margin:"0 auto",padding:"0 var(--gutter)"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"28px 0 20px",borderBottom:"1px solid var(--e1)"}}>
          <Cap style={{fontSize: 12}}>Acceso Directo</Cap>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:48,height:1,background:"linear-gradient(90deg,transparent,var(--accent))"}}/>
            <span style={{fontFamily:"var(--mono)",fontSize:10,color:"var(--t3)",letterSpacing:".1em", fontWeight:700}}>08 MÓDULOS</span>
          </div>
        </div>
        
        {/* Responsive Grid Fix */}
        <div className="stg" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(260px, 1fr))",gap:16,paddingTop:16, paddingBottom: 48}}>
          {QA.map((a,i)=>(
            <button key={a.s} onClick={()=>goTo(a.s)}
              style={{
                padding:"32px 24px",background:"var(--s1)",border:"1px solid var(--e1)", borderRadius: "8px",
                cursor:"pointer",textAlign:"left",transition:"all .25s",
                position:"relative",overflow:"hidden"
              }}
              onMouseEnter={e=>{e.currentTarget.style.background="var(--s2)";e.currentTarget.style.borderColor="var(--e3)";e.currentTarget.style.transform="translateY(-2px)"}}
              onMouseLeave={e=>{e.currentTarget.style.background="var(--s1)";e.currentTarget.style.borderColor="var(--e1)";e.currentTarget.style.transform="translateY(0)"}}>
              <div style={{position:"absolute",bottom:0,left:0,right:0,height:2,background:"linear-gradient(90deg,var(--accent),transparent)"}}/>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
                <div style={{color:"var(--accent)",opacity:.8}}>{a.ico}</div>
                <span style={{fontFamily:"var(--mono)",fontSize:10,color:"var(--t3)",opacity:.7,letterSpacing:".08em", fontWeight: 700}}>{a.n}</span>
              </div>
              <p style={{fontFamily:"var(--serif)",fontSize:22,fontWeight:600,color:"var(--t1)",lineHeight:1.1,letterSpacing:"-.01em",marginBottom:8}}>{a.t}</p>
              <p style={{fontFamily:"var(--body)",fontSize:13,color:"var(--t3)",fontWeight:400,lineHeight:1.6}}>{a.d}</p>
            </button>
          ))}
        </div>
      </div>

      <div style={{maxWidth:1400,margin:"0 auto",padding:"0 var(--gutter) 40px"}}>
        <WindyWidget/>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SEC IDENTIDAD
═══════════════════════════════════════════════════════════════ */
function SecIdentidad({cliente,push}){
  const KS=["mat","mmsi","senal","wssid","wpass","scia","spol","svto","tmec","trem"];
  const [v,setV]=useState(()=>Object.fromEntries(KS.map(k=>[k,ls(k)])));
  const [saved,setSaved]=useState(false);
  const [showPass,setShowPass]=useState(false);
  const up=(k,val)=>setV(p=>({...p,[k]:val}));
  const save=()=>{KS.forEach(k=>ls(k,v[k]||""));setSaved(true);push("Guardado en este dispositivo","ok");setTimeout(()=>setSaved(false),3000)};
  return(
    <div className="appear">
      <SH eyebrow="Manual Digital" num="01" title={`Identidad\nde la Unidad`}
        sub="Matrícula, documentación y datos de acceso. Se almacena localmente en su dispositivo."/>
      <div className="stg" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(320px,1fr))",gap:16}}>
        <div className="card" style={{padding:"40px 32px"}}>
          <div style={{display:"flex",alignItems:"center",gap:16,paddingBottom:24,marginBottom:28,borderBottom:"1px solid var(--e1)"}}>
            <div style={{width:56,height:56,border:"1px solid var(--e2)",borderRadius:"8px",display:"flex",alignItems:"center",justifyContent:"center",background:"var(--s2)",flexShrink:0}}>
              <Anchor size={24} color="var(--accent)" style={{opacity:.8}}/>
            </div>
            <div>
              <p style={{fontFamily:"var(--serif)",fontSize:26,fontWeight:600,color:"var(--t1)",letterSpacing:"-.01em"}}>{cliente?.modelo_barco||"Mi Barco"}</p>
              <p style={{fontFamily:"var(--mono)",fontSize:11,color:"var(--t3)",letterSpacing:".1em",marginTop:4}}>{[cliente?.nombre_barco,cliente?.numero_unidad].filter(Boolean).join("  ·  ")||"Sin nombre asignado"}</p>
            </div>
          </div>
          {[["mat","Matrícula","RP-123456"],["mmsi","MMSI / Radio VHF","701000452"],["senal","Señal Distintiva","LW 9844"]].map(([k,l,ph])=>(
            <div key={k} style={{marginBottom:24}}><Lbl>{l}</Lbl><input className="inp" value={v[k]} placeholder={ph} onChange={e=>up(k,e.target.value)}/></div>
          ))}
          <div style={{padding:"20px 24px",borderRadius:"6px",background:"var(--s2)",border:"1px solid rgba(56,189,248,.15)",marginTop:16}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:18}}>
              <Wifi size={14} color="var(--info)"/>
              <Cap style={{color:"rgba(56,189,248,0.8)"}}>Red WiFi Abordo</Cap>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
              <div><Lbl>Red</Lbl><input className="inp" value={v["wssid"]} placeholder="Nombre" onChange={e=>up("wssid",e.target.value)}/></div>
              <div style={{position:"relative"}}>
                <Lbl>Clave</Lbl>
                <input className="inp" type={showPass?"text":"password"} value={v["wpass"]} placeholder="Contraseña" onChange={e=>up("wpass",e.target.value)} style={{paddingRight:32}}/>
                <button onClick={()=>setShowPass(s=>!s)} style={{position:"absolute",right:0,bottom:12,background:"transparent",border:"none",cursor:"pointer",color:"var(--t3)",display:"flex"}}>
                  {showPass?<EyeOff size={16}/>:<Eye size={16}/>}
                </button>
              </div>
            </div>
          </div>
        </div>
        <div className="card" style={{padding:"40px 32px"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:28}}><FileText size={16} color="var(--t3)"/><Cap>Documentación y Seguros</Cap></div>
          {[["scia","Compañía de Seguros","Ej: Sancor Seguros"],["spol","Número de Póliza","Número"]].map(([k,l,ph])=>(
            <div key={k} style={{marginBottom:24}}><Lbl>{l}</Lbl><input className="inp" value={v[k]} placeholder={ph} onChange={e=>up(k,e.target.value)}/></div>
          ))}
          <div style={{marginBottom:24}}><Lbl>Vencimiento de Póliza</Lbl><input className="inp" type="date" value={v["svto"]} onChange={e=>up("svto",e.target.value)}/></div>
          <div style={{padding:"20px 24px",borderRadius:"6px",background:"var(--s2)",border:"1px solid rgba(16,185,129,.15)",margin:"32px 0"}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:18}}>
              <Phone size={14} color="var(--ok)"/>
              <Cap style={{color:"rgba(16,185,129,0.8)"}}>Contactos de Emergencia</Cap>
            </div>
            <div style={{marginBottom:20}}><Lbl>Mecánico / Técnico</Lbl><input className="inp" value={v["tmec"]} placeholder="+54 9 11 ···· ····" onChange={e=>up("tmec",e.target.value)}/></div>
            <Lbl>Asistencia / Remolque</Lbl>
            <input className="inp" value={v["trem"]} placeholder="+54 9 ···· ···· ····" onChange={e=>up("trem",e.target.value)}/>
          </div>
          <button onClick={save} style={{width:"100%",padding:"16px",borderRadius:"4px",background:saved?"var(--ok2)":"transparent",border:`1px solid ${saved?"rgba(16,185,129,.4)":"var(--e2)"}`,color:saved?"var(--ok)":"var(--t1)",fontFamily:"var(--cond)",fontWeight:800,fontSize:11,letterSpacing:".25em",textTransform:"uppercase",cursor:"pointer",transition:"all .3s",display:"flex",alignItems:"center",justifyContent:"center",gap:10}}>
            {saved?<><Check size={14}/> GUARDADO</>:"GUARDAR EN ESTE DISPOSITIVO"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PRÓXIMO SERVICE
═══════════════════════════════════════════════════════════════ */
function ProximoService(){
  const KEY="ka_service_v1";
  const [data,setData]=useState(()=>{try{const s=localStorage.getItem(KEY);return s?JSON.parse(s):{fecha:"",tipo:"",horas:"",obs:""}}catch{return{fecha:"",tipo:"",horas:"",obs:""}}});
  const [saved,setSaved]=useState(false);
  const up=(k,v_)=>setData(p=>({...p,[k]:v_}));
  const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(data));setSaved(true);setTimeout(()=>setSaved(false),3000)}catch{}};
  const dias=data.fecha?Math.ceil((new Date(data.fecha)-new Date())/(1000*60*60*24)):null;
  const ac=dias===null?"var(--t3)":dias<0?"var(--err)":dias<30?"var(--warn)":"var(--ok)";
  return(
    <div className="card" style={{padding:"36px 32px",marginBottom:16}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:24}}>
        <Wrench size={16} color="var(--t3)"/><Cap>Próximo Service Programado</Cap>
        {dias!==null&&<div style={{marginLeft:"auto",padding:"6px 14px",borderRadius:"4px",border:`1px solid ${ac}30`,background:`${ac}0a`}}>
          <span style={{fontFamily:"var(--mono)",fontSize:10,color:ac,fontWeight:700,letterSpacing:".06em"}}>{dias<0?`Vencido hace ${Math.abs(dias)} días`:dias===0?"Hoy":`Faltan ${dias} días`}</span>
        </div>}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:24,marginBottom:24}}>
        <div><Lbl>Fecha de Service</Lbl><input className="inp" type="date" value={data.fecha} onChange={e=>up("fecha",e.target.value)}/></div>
        <div><Lbl>Tipo de Service</Lbl><input className="inp" value={data.tipo} onChange={e=>up("tipo",e.target.value)} placeholder="Ej: 250 hs · Cambio aceite"/></div>
        <div><Lbl>Horas de Motor Actuales</Lbl><input className="inp" type="number" value={data.horas} onChange={e=>up("horas",e.target.value)} placeholder="Ej: 1250"/></div>
      </div>
      <div style={{marginBottom:24}}><Lbl>Observaciones</Lbl><input className="inp" value={data.obs} onChange={e=>up("obs",e.target.value)} placeholder="Taller, teléfono, repuestos pendientes..."/></div>
      <button onClick={save} style={{padding:"12px 24px",borderRadius:"4px",background:saved?"var(--ok2)":"transparent",border:`1px solid ${saved?"rgba(16,185,129,.4)":"var(--e2)"}`,color:saved?"var(--ok)":"var(--t1)",fontFamily:"var(--cond)",fontWeight:700,fontSize:10,letterSpacing:".2em",textTransform:"uppercase",cursor:"pointer",transition:"all .3s",display:"inline-flex",alignItems:"center",gap:8}}>
        {saved?<><Check size={12}/>GUARDADO</>:<><RefreshCw size={12}/>GUARDAR</>}
      </button>
    </div>
  );
}

/* BITÁCORA */
const BIT_ITEMS=["Motores","Generador","Fondo / Pintura","Hélices","Ánodos","Timón y Servo"];
function BitacoraMantenimiento(){
  const KEY="ka_bitacora_v1";
  const [rows,setRows]=useState(()=>{try{const s=localStorage.getItem(KEY);return s?JSON.parse(s):BIT_ITEMS.map(n=>({n,e:"OK",o:""}))}catch{return BIT_ITEMS.map(n=>({n,e:"OK",o:""}))}});
  const [saved,setSaved]=useState(false);
  const [ts,setTs]=useState(()=>{try{return localStorage.getItem("ka_bitacora_ts")||null}catch{return null}});
  const upd=(i,k,v_)=>setRows(p=>p.map((r,j)=>j===i?{...r,[k]:v_}:r));
  const save=()=>{
    try{
      localStorage.setItem(KEY,JSON.stringify(rows));
      const t=new Date().toLocaleString("es-AR",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});
      localStorage.setItem("ka_bitacora_ts",t);setTs(t);setSaved(true);setTimeout(()=>setSaved(false),3000);
    }catch{}
  };
  const sc=e=>e==="OK"?"var(--ok)":e==="Atención"?"var(--warn)":"var(--err)";
  return(
    <div className="card" style={{padding:"36px 32px"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:24}}>
        <Activity size={16} color="var(--t3)"/><Cap>Bitácora de Mantenimiento</Cap>
        {ts&&<span style={{marginLeft:"auto",fontFamily:"var(--mono)",fontSize:9,color:"var(--t3)",letterSpacing:".04em"}}>Guardado {ts}</span>}
      </div>
      <table style={{width:"100%",borderCollapse:"collapse",marginBottom:28}}>
        <thead><tr style={{borderBottom:"1px solid var(--e2)"}}>{["Ítem","Estado","Observaciones / Fecha"].map(h=><th key={h} style={{textAlign:"left",paddingBottom:14,paddingRight:16}}><Cap sm>{h}</Cap></th>)}</tr></thead>
        <tbody>{rows.map((row,i)=>(
          <tr key={row.n} style={{borderBottom:"1px solid rgba(255,255,255,.04)"}}>
            <td style={{padding:"16px 16px 16px 0",color:"var(--t1)",fontSize:14,fontWeight:500,whiteSpace:"nowrap"}}>{row.n}</td>
            <td style={{padding:"16px 16px 16px 0",minWidth:140}}>
              <select className="sel" value={row.e} onChange={e=>upd(i,"e",e.target.value)} style={{width:"auto",fontSize:13,fontWeight:600,color:sc(row.e),padding:"4px 0", borderBottom: "none"}}>
                <option>OK</option><option>Atención</option><option>Service Pendiente</option>
              </select>
            </td>
            <td style={{padding:"16px 0"}}><input className="inp" value={row.o} onChange={e=>upd(i,"o",e.target.value)} style={{fontSize:13,color:"var(--t2)", borderBottom: "none"}} placeholder="Sin observaciones"/></td>
          </tr>
        ))}</tbody>
      </table>
      <button onClick={save} style={{padding:"12px 24px",borderRadius:"4px",background:saved?"var(--ok2)":"transparent",border:`1px solid ${saved?"rgba(16,185,129,.4)":"var(--e2)"}`,color:saved?"var(--ok)":"var(--t1)",fontFamily:"var(--cond)",fontWeight:700,fontSize:10,letterSpacing:".2em",textTransform:"uppercase",cursor:"pointer",transition:"all .3s",display:"inline-flex",alignItems:"center",gap:8}}>
        {saved?<><Check size={12}/>GUARDADO</>:<><RefreshCw size={12}/>GUARDAR</>}
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SEC PLANIFICADOR
═══════════════════════════════════════════════════════════════ */
function SecPlanificador({mc}){
  const maxF=mc?.combustible||1200;
  const [pct,setP]=useState(50),[spd,setS]=useState(22),[con,setC]=useState(120);
  const lts=Math.round(pct/100*maxF);
  const hrs=con>0?(lts/con).toFixed(1):"--";
  const nm=isNaN(+hrs)?"--":Math.round(+hrs*spd);
  const ITEMS=[
    {id:"c1",t:"Bancos de Baterías — Voltaje OK",hl:false},
    {id:"c2",t:"Cable 220V Desconectado del muelle",hl:true},
    {id:"c3",t:"Aceite y Refrigerante — Niveles OK",hl:false},
    {id:"c4",t:"Grifos de Fondo ABIERTOS",hl:true},
    {id:"c5",t:"Sentinas Secas",hl:false},
    {id:"c6",t:"Chalecos Salvavidas Accesibles",hl:false},
    {id:"c7",t:"Combustible y Válvulas Abiertas",hl:true},
    {id:"c8",t:"GPS, VHF y Luces de Navegación",hl:false},
    {id:"c9",t:"Documentación a Bordo",hl:false},
    {id:"c10",t:"Pronóstico Meteorológico Consultado",hl:false},
  ];
  const [chk,setChk]=useState(()=>Object.fromEntries(ITEMS.map(c=>[c.id,ls("c_"+c.id)==="true"])));
  const tog=id=>{const n=!chk[id];setChk(p=>({...p,[id]:n}));ls("c_"+id,n)};
  const done=Object.values(chk).filter(Boolean).length;
  const pDone=Math.round(done/ITEMS.length*100);
  return(
    <div className="appear">
      <SH eyebrow="Navegación" num="02" title="Planificador de Viaje"
        sub="Calculá la autonomía y completá el protocolo de pre-zarpe antes de salir."/>
      <div className="stg" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(360px, 1fr))",gap:16,marginBottom:16}}>
        <div className="card" style={{padding:"40px 32px"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:28}}><Gauge size={16} color="var(--t3)"/><Cap>Calculadora de Autonomía</Cap></div>
          <div style={{padding:"0 16px 12px"}}><CircularGauge pct={pct} liters={lts} maxL={maxF}/></div>
          <div style={{padding:"0 16px 24px",position:"relative"}}>
            <div className="pbar" style={{height:"4px"}}>
              <div className="pbar-fill" style={{width:pct+"%",background:pct>55?"var(--ok)":pct>25?"var(--warn)":"var(--err)"}}/>
            </div>
            <input type="range" min="0" max="100" value={pct} onChange={e=>setP(+e.target.value)}
              style={{position:"absolute",top:-6,left:16,right:16,width:"calc(100% - 32px)",opacity:0,height:24,cursor:"pointer",zIndex:2}}/>
            <div style={{display:"flex",justifyContent:"space-between",marginTop:10}}>
              <Cap sm>VACÍO</Cap><Cap sm>LLENO</Cap>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:24,borderTop:"1px solid var(--e1)",paddingTop:24}}>
            {[{l:"Velocidad (Kn)",v:spd,s:setS},{l:"Consumo (L/h)",v:con,s:setC}].map(f=>(
              <div key={f.l}>
                <Lbl>{f.l}</Lbl>
                <input type="number" className="inp" value={f.v} onChange={e=>f.s(+e.target.value)}
                  style={{fontFamily:"var(--mono)",fontSize:36,color:"var(--t1)",textAlign:"center",fontWeight:700,letterSpacing:"-.02em"}}/>
              </div>
            ))}
          </div>
          <div style={{marginTop:24,padding:"24px 28px",borderRadius:"6px",border:"1px solid rgba(56,189,248,.2)",background:"var(--accent3)"}}>
            <Cap sm style={{color:"var(--accent)",display:"block",marginBottom:14}}>Autonomía Estimada</Cap>
            <div style={{display:"flex",alignItems:"baseline",gap:16}}>
              <span style={{fontFamily:"var(--mono)",fontSize:48,color:"var(--t1)",fontWeight:700,lineHeight:1}}>{hrs}</span>
              <span style={{fontFamily:"var(--cond)",fontSize:13,fontWeight:700,color:"var(--t3)",letterSpacing:".15em"}}>HORAS</span>
              <span style={{color:"var(--e2)",fontSize:28,margin:"0 6px"}}>/</span>
              <span style={{fontFamily:"var(--mono)",fontSize:40,color:"var(--t1)",fontWeight:700}}>{nm}</span>
              <span style={{fontFamily:"var(--cond)",fontSize:13,fontWeight:700,color:"var(--t3)",letterSpacing:".15em"}}>NM</span>
            </div>
          </div>
        </div>
        <div className="card" style={{padding:"40px 32px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}><Navigation size={16} color="var(--t3)"/><Cap>Protocolo Pre-Zarpe</Cap></div>
            <span style={{fontFamily:"var(--mono)",fontSize:12,fontWeight:700,color:done===ITEMS.length?"var(--ok)":"var(--t3)"}}>{done}/{ITEMS.length}</span>
          </div>
          <div style={{marginBottom:28}}>
            <div className="pbar" style={{height:"4px"}}>
              <div className="pbar-fill" style={{width:pDone+"%",background:done===ITEMS.length?"var(--ok)":"var(--accent)"}}/>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",marginTop:10}}>
              <Cap sm style={{color:done===ITEMS.length?"var(--ok)":undefined}}>{pDone}% completado</Cap>
              <button onClick={()=>{setChk(Object.fromEntries(ITEMS.map(c=>[c.id,false])));ITEMS.forEach(c=>ls("c_"+c.id,"false"))}}
                style={{fontFamily:"var(--cond)",fontSize:9,fontWeight:800,letterSpacing:".15em",color:"var(--t3)",background:"transparent",border:"none",cursor:"pointer",textTransform:"uppercase",padding:0,display:"flex",alignItems:"center",gap:6}}>
                <RotateCcw size={10}/>REINICIAR
              </button>
            </div>
          </div>
          <div className="tl-wrap">
            {ITEMS.map((c,i)=>{
              const on=!!chk[c.id];
              return(
                <div key={c.id} className="tl-item" onClick={()=>tog(c.id)}>
                  <div className={`tl-mark${on?" done":""}`}>
                    {on?<Check size={12} color="var(--ok)"/>:<span className="tl-mn">{pad(i+1)}</span>}
                  </div>
                  <div style={{paddingTop:3}}>
                    <span style={{fontSize:14,fontWeight:400,lineHeight:1.6,display:"block",color:c.hl?"var(--warn)":on?"var(--t1)":"var(--t2)",transition:"color .18s",textDecoration:on?"line-through":"none",textDecorationColor:"var(--t3)"}}>{c.t}</span>
                    {c.hl&&!on&&<Cap sm style={{color:"rgba(245,158,11,0.6)",display:"block",marginTop:4}}>CRÍTICO</Cap>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <ProximoService/>
      <BitacoraMantenimiento/>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   TABLERO FOTOS
═══════════════════════════════════════════════════════════════ */
function TableroFotos(){
  const [fotos,setFotos]=useState([]);
  const [lb,setLb]=useState(null);
  const [uploading,setUploading]=useState(false);
  const [drag,setDrag]=useState(false);
  const inputRef=useRef();
  const handleFiles=async(files)=>{
    const val=[...files].filter(f=>f.type.startsWith("image/"));
    if(!val.length)return;
    setUploading(true);
    const new_=await Promise.all(val.map(f=>new Promise(res=>{const r=new FileReader();r.onload=e=>res({url:e.target.result,name:f.name,id:Date.now()+Math.random()});r.readAsDataURL(f);})));
    setFotos(p=>[...p,...new_]);setUploading(false);
  };
  return(
    <div className="card" style={{padding:"32px"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
        <ImageIcon size={14} color="var(--t3)"/><Cap>Referencia Visual — Tableros y Paneles</Cap>
        <span style={{marginLeft:"auto",fontFamily:"var(--mono)",fontSize:10,color:"var(--t3)"}}>{fotos.length} foto{fotos.length!==1?"s":""}</span>
      </div>
      <p style={{color:"var(--t2)",fontSize:14,fontWeight:400,lineHeight:1.65,marginBottom:20}}>Fotos de tableros y paneles para referencia rápida. Solo en este dispositivo.</p>
      <div className="pgallery" style={{marginBottom:fotos.length?16:0}}>
        {fotos.map((f,i)=>(
          <div key={f.id} className="pgallery-item" onClick={()=>setLb(i)}>
            <img src={f.url} alt={f.name}/>
            <div style={{position:"absolute",inset:0,background:"rgba(2,6,23,.55)",opacity:0,transition:"opacity .2s",display:"flex",alignItems:"center",justifyContent:"center"}}
              onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=0}><ZoomIn size={20} color="rgba(255,255,255,.9)"/></div>
            <button onClick={e=>{e.stopPropagation();setFotos(p=>p.filter(x=>x.id!==f.id))}}
              style={{position:"absolute",top:6,right:6,width:26,height:26,borderRadius:"50%",background:"rgba(239,68,68,.9)",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",opacity:0,transition:"opacity .18s"}}
              onMouseEnter={e=>{e.currentTarget.style.opacity=1;e.stopPropagation()}} onMouseLeave={e=>e.currentTarget.style.opacity=0}><Trash2 size={12} color="#fff"/></button>
          </div>
        ))}
        <div className={`pgallery-add${drag?" drag":""}`}
          onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)}
          onDrop={e=>{e.preventDefault();setDrag(false);handleFiles(e.dataTransfer.files)}}
          onClick={()=>inputRef.current?.click()} style={{ borderRadius: "6px" }}>
          <input ref={inputRef} type="file" accept="image/*" multiple style={{display:"none"}} onChange={e=>handleFiles(e.target.files)}/>
          {uploading?<div className="shim" style={{width:32,height:32,borderRadius:"50%"}}/>:<><Upload size={18} color="var(--t3)"/><Cap sm>Agregar foto</Cap></>}
        </div>
      </div>
      {fotos.length===0&&<p style={{fontFamily:"var(--mono)",fontSize:10,color:"var(--t3)",textAlign:"center",padding:"8px 0"}}>Sin fotos · no se sube ningún archivo a la nube</p>}
      {lb!==null&&(
        <div onClick={()=>setLb(null)} style={{position:"fixed",inset:0,background:"rgba(2,6,23,.96)",zIndex:99999,display:"flex",alignItems:"center",justifyContent:"center",padding:24,animation:"fade .2s both"}}>
          <button onClick={()=>setLb(null)} style={{position:"absolute",top:24,right:24,background:"transparent",border:"1px solid var(--e2)",borderRadius:"6px",color:"var(--t2)",padding:"8px 16px",cursor:"pointer",fontFamily:"var(--cond)",fontSize:10,fontWeight:700,letterSpacing:".15em",display:"flex",gap:8,alignItems:"center"}}><X size={14}/>CERRAR</button>
          <img src={fotos[lb]?.url} alt="" style={{maxWidth:"100%",maxHeight:"90vh",objectFit:"contain",animation:"enter .3s var(--ez) both"}}/>
          {fotos.length>1&&<>
            <button onClick={e=>{e.stopPropagation();setLb(i=>(i-1+fotos.length)%fotos.length)}} style={{position:"absolute",left:24,top:"50%",transform:"translateY(-50%)",background:"rgba(255,255,255,.05)",border:"1px solid var(--e2)",borderRadius:"50%",color:"var(--t1)",width:48,height:48,cursor:"pointer",fontSize:20}}>‹</button>
            <button onClick={e=>{e.stopPropagation();setLb(i=>(i+1)%fotos.length)}} style={{position:"absolute",right:24,top:"50%",transform:"translateY(-50%)",background:"rgba(255,255,255,.05)",border:"1px solid var(--e2)",borderRadius:"50%",color:"var(--t1)",width:48,height:48,cursor:"pointer",fontSize:20}}>›</button>
          </>}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SEC ENERGÍA
═══════════════════════════════════════════════════════════════ */
function SecEnergia({mc}){
  const tieneGrupo=mc?.tiene_grupo??true;
  const [tab,setTab]=useState("puerto");
  const [batPct]=useState({srv:68,mot:95});
  const TABS=[{id:"puerto",l:"Puerto 220V"},...(tieneGrupo?[{id:"grupo",l:"Generador"}]:[]),{id:"inv",l:"Inverter"}];
  const DATA={
    puerto:{t:"Conexión a Marina — 220V",steps:["Selector de fuente en APAGADO antes de conectar el cable.","Conectar cable Marechal del muelle al receptáculo del barco.","Mover selectora a C.A. TIERRA — testigo VERDE = polaridad correcta.","Si el testigo es ROJO: invertir la ficha en el muelle (fase invertida).","No opere equipos de alto consumo hasta verificar polaridad."],note:"Polaridad invertida daña inversores y equipos electrónicos. Verifique SIEMPRE antes de encender cargas."},
    grupo:{t:"Grupo Electrógeno",steps:["Apagar TODOS los Aires Acondicionados antes de arrancar.","Verificar nivel de combustible diesel y refrigerante del grupo.","Arrancar y dejar estabilizar 30 segundos a régimen.","Mover selectora a C.A. GRUPO. Ahora puede encender cargas.","Al finalizar: reducir cargas, dejar enfriar 3 min y apagar."],note:"Arrancar el grupo con los AA encendidos produce picos de corriente que dañan el equipo."},
    inv:{t:"Inverter — Baterías de Servicio",steps:["Verificar voltaje de baterías de servicio — mínimo 12.2V para operar.","Encender Inverter desde el panel remoto (botón verde).","Mover la selectora pequeña a C.A. CONVERTIDOR.","Monitorear el voltaje continuamente — cortar si baja de 12.0V.","Para apagar: cortar cargas, apagar Inverter, mover selectora a OFF."],note:"NUNCA use AA ni resistencias calefactoras en modo inverter. El consumo supera la capacidad de las baterías."},
  };
  const ct=DATA[tab];
  return(
    <div className="appear">
      <SH eyebrow="Energía" num="03" title="Tableros y Sistemas de Potencia"
        sub="El barco tiene tres fuentes de 220V. Entender cuándo usar cada una evita el 80% de los problemas eléctricos."/>

      <div className="card" style={{padding:"32px 28px",marginBottom:16}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:24}}>
          <Zap size={16} color="var(--t3)"/><Cap>Diagrama de Fuentes — Flujo en Tiempo Real</Cap>
          <div style={{marginLeft:"auto",padding:"6px 14px",borderRadius:"4px",background:"var(--accent3)",border:"1px solid rgba(56,189,248,.2)"}}>
            <span style={{fontFamily:"var(--mono)",fontSize:10,color:"var(--accent)",fontWeight:700,letterSpacing:".1em"}}>
              ACTIVO: {tab==="puerto"?"SHORE 220V":tab==="grupo"?"GENERADOR":"INVERTER"}
            </span>
          </div>
        </div>
        <AnimatedPowerFlowDiagram active={tab}/>
        <p style={{fontFamily:"var(--mono)",fontSize:10,color:"var(--t3)",textAlign:"center",marginTop:16,letterSpacing:".06em",opacity:.8}}>
          Los puntos animados representan flujo de energía activo hacia las cargas
        </p>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(320px, 1fr))",gap:16,marginBottom:16}}>
        <div className="card" style={{padding:"36px 32px"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:28}}><Battery size={16} color="var(--t3)"/><Cap>Bancos de Baterías</Cap></div>
          <div style={{display:"flex",justifyContent:"center",gap:40,marginBottom:28}}>
            <BatteryBank label="SERVICIO" voltage="12.6" pct={batPct.srv} charging={tab==="puerto"}/>
            <BatteryBank label="MOTORES" voltage="12.8" pct={batPct.mot} charging={false}/>
          </div>
          <div style={{padding:"16px 20px",borderRadius:"6px",background:"var(--err2)",border:"1px solid rgba(239,68,68,.2)",marginBottom:10}}>
            <Cap sm style={{color:"rgba(239,68,68,0.8)",display:"block",marginBottom:8}}>IMPORTANTE</Cap>
            <p style={{color:"#FCA5A5",fontSize:13,fontWeight:400,lineHeight:1.7}}>
              El switch <strong style={{fontWeight:700,color:"var(--err)"}}>PARALLEL</strong> une ambos bancos. Úselo SOLO en emergencia para arrancar motores.
            </p>
          </div>
        </div>
        <div className="card" style={{ gridColumn: "span 2" }}>
          <div className="tabs">{TABS.map(t=><button key={t.id} onClick={()=>setTab(t.id)} className={`tab${tab===t.id?" on":""}`}>{t.l}</button>)}</div>
          <div style={{padding:"40px 36px",animation:"fade .3s both"}} key={tab}>
            <h3 style={{fontFamily:"var(--serif)",fontSize:32,fontWeight:500,color:"var(--t1)",marginBottom:32,letterSpacing:"-.01em"}}>{ct.t}</h3>
            {ct.steps.map((s,i)=>(
              <div key={i} className="step">
                <span className="step-n">0{i+1}</span>
                <p style={{color:"var(--t1)",fontSize:15,lineHeight:1.75,fontWeight:400}}>{s}</p>
              </div>
            ))}
            {ct.note&&(
              <div style={{marginTop:24,padding:"16px 20px",borderRadius:"6px",borderLeft:"3px solid rgba(245,158,11,.6)",background:"var(--warn2)"}}>
                <p style={{color:"var(--warn)",fontSize:14,fontWeight:500,lineHeight:1.72}}>{ct.note}</p>
              </div>
            )}
          </div>
        </div>
      </div>
      <TableroFotos/>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SEC PROPULSIÓN
═══════════════════════════════════════════════════════════════ */
function SecPropulsion({mc}){
  const tieneMando=mc?.tiene_mando_electronico??false;
  const [chk,setChk]=useState({});
  const steps=[
    {id:"p1",t:"Aceite y Refrigerante",d:"Varillas en ambos motores. Nivel entre MIN y MAX con motor frío.",hl:false},
    {id:"p2",t:"Grifos de Fondo — ABIERTOS",d:"Apertura completa. Verifique visualmente, no solo tactilmente.",hl:true},
    {id:"p3",t:"Palancas en NEUTRAL",d:"Punto muerto en ambas palancas antes de dar contacto.",hl:false},
    {id:"p4",t:"Ignition ON — Test de alarmas",d:"Esperar 5 segundos. Las alarmas deben sonar brevemente y luego silenciarse.",hl:false},
    {id:"p5",t:"Arranque y Verificación",d:"Arrancar y verificar presión de aceite dentro de 10 segundos. Temperatura normal tras 2-3 min.",hl:false},
  ];
  const done=Object.values(chk).filter(Boolean).length;
  return(
    <div className="appear">
      <SH eyebrow="Propulsión" num="04" title="Motores y Panel de Instrumentos"
        sub="Panel de instrumentos interactivo con indicadores de RPM, temperatura, presión de aceite y voltaje. Use 'Simular Arranque' para ver los gauges en operación."/>

      <div style={{marginBottom:16}}>
        <DualMotorCluster mc={mc}/>
      </div>

      <div className="stg" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(360px,1fr))",gap:16}}>
        <div className="card" style={{padding:"40px 32px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}><Power size={16} color="var(--t3)"/><Cap>Secuencia de Arranque</Cap></div>
            <div style={{display:"flex",gap:12,alignItems:"center"}}>
              <span style={{fontFamily:"var(--mono)",fontSize:12,fontWeight:700,color:done===steps.length?"var(--ok)":"var(--t3)"}}>{done}/{steps.length}</span>
              <button onClick={()=>setChk({})} style={{background:"transparent",border:"none",cursor:"pointer",color:"var(--t3)",display:"flex",padding:0}}><RotateCcw size={14}/></button>
            </div>
          </div>
          <div className="pbar" style={{marginBottom:28,height:"4px"}}>
            <div className="pbar-fill" style={{width:Math.round(done/steps.length*100)+"%",background:done===steps.length?"var(--ok)":"var(--accent)"}}/>
          </div>
          <div className="tl-wrap">
            {steps.map((s,i)=>{
              const on=!!chk[s.id];
              return(
                <div key={s.id} className="tl-item" onClick={()=>setChk(p=>({...p,[s.id]:!p[s.id]}))}>
                  <div className={`tl-mark${on?" done":""}`} style={s.hl&&!on?{borderColor:"rgba(245,158,11,.5)",background:"rgba(245,158,11,.06)"}:{}}>
                    {on?<Check size={12} color="var(--ok)"/>:<span className="tl-mn">{pad(i+1)}</span>}
                  </div>
                  <div style={{paddingTop:2}}>
                    <p style={{color:s.hl&&!on?"var(--warn)":on?"var(--t2)":"var(--t1)",fontSize:15,fontWeight:500,marginBottom:4,transition:"color .18s",textDecoration:on?"line-through":"none",textDecorationColor:"var(--t3)"}}>{s.t}</p>
                    <p style={{color:"var(--t3)",fontSize:13,fontWeight:400,lineHeight:1.6}}>{s.d}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          {tieneMando&&(
            <div className="card" style={{padding:"36px 32px"}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20}}><Settings size={16} color="var(--t3)"/><Cap>Mando Electrónico</Cap></div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
                {[{c:"var(--info)",t:"Tomar Mando",d:"Neutral · COMMAND 1.5s"},{c:"var(--warn)",t:"Calentamiento",d:"WARM 1.5s · luz parpadea"},{c:"#A78BFA",t:"Sincronizar",d:"ENGINE 1.5s · una palanca"},{c:"var(--err)",t:"Falla Electrónica",d:"Override → mecánico"}].map(item=>(
                  <div key={item.t} style={{padding:"18px 16px",borderRadius:"6px",borderLeft:`3px solid ${item.c}60`,background:`${item.c}10`}}>
                    <p style={{fontFamily:"var(--cond)",fontSize:10,fontWeight:800,letterSpacing:".15em",color:item.c,textTransform:"uppercase",marginBottom:8}}>{item.t}</p>
                    <p style={{color:"var(--t1)",fontSize:13,lineHeight:1.6,fontWeight:400}}>{item.d}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="card" style={{padding:"32px"}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
              <AlertTriangle size={16} color="var(--err)" style={{opacity:.8}}/><Cap style={{color:"rgba(239,68,68,0.8)"}}>Protocolo de Apagado</Cap>
            </div>
            <p style={{color:"var(--t1)",fontSize:15,fontWeight:400,lineHeight:1.8,marginBottom:16}}>Use siempre la <strong style={{color:"var(--accent)",fontWeight:700}}>LLAVE DE CONTACTO</strong>. Deje enfriar 5 minutos antes de apagar el panel principal.</p>
            <div style={{padding:"16px 20px",borderRadius:"6px",borderLeft:"3px solid rgba(239,68,68,.5)",background:"var(--err2)"}}>
              <p style={{color:"#FCA5A5",fontSize:13,fontWeight:400,lineHeight:1.7}}>El botón <strong style={{fontWeight:700}}>STOP ROJO</strong> es solo para emergencias absolutas. Usarlo habitualmente daña el sistema de inyección.</p>
            </div>
          </div>
          <div className="card" style={{padding:"28px 32px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:20}}>
            <div>
              <p style={{color:"var(--t1)",fontSize:16,fontWeight:600,marginBottom:6}}>Hélice de Proa (Bow Thruster)</p>
              <p style={{color:"var(--t3)",fontSize:13,fontWeight:400,lineHeight:1.6}}>Máximo 30 segundos continuos · Pausa 2 minutos mínimo · Solo en maniobras, no navegando.</p>
            </div>
            <div style={{width:52,height:52,borderRadius:"8px",border:"1px solid var(--e2)",display:"flex",alignItems:"center",justifyContent:"center",background:"var(--s2)",flexShrink:0}}>
              <Compass size={24} color="var(--t3)"/>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SEC SISTEMAS
═══════════════════════════════════════════════════════════════ */
function SecSistemas({mc}){
  const ta=mc?.tiene_aguas??true,cc=mc?.combustible||1200,ac=mc?.agua||400;
  return(
    <div className="appear">
      <SH eyebrow="Sistemas" num="05" title="Tanques, Malacate y Equipos"
        sub="Los tres sistemas que más confusión generan: malacate, inverter y baterías. Acá están explicados con detalle."/>
      <div className="card" style={{padding:"40px",marginBottom:16}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:36}}><Droplets size={16} color="var(--t3)"/><Cap>Capacidad de Tanques</Cap></div>
        <div style={{display:"flex",justifyContent:"center",gap:56,alignItems:"flex-end",padding:"0 20px"}}>
          <TankBar label="DIESEL" liters={cc} maxL={cc} color="var(--warn)" icon={<Droplets size={24}/>}/>
          <TankBar label="AGUA POTABLE" liters={ac} maxL={ac} color="var(--info)" icon={<Droplets size={24}/>}/>
          {ta&&<TankBar label="AGUAS NEGRAS" liters={0} maxL={200} color="var(--t3)" icon={<Activity size={24}/>}/>}
        </div>
        <p style={{color:"var(--t3)",fontSize:13,fontWeight:400,lineHeight:1.65,textAlign:"center",marginTop:32}}>Los valores de capacidad son de referencia. El nivel real se lee en los sensores del tablero de navegación.</p>
      </div>
      <div className="card" style={{marginBottom:16,overflow:"hidden"}}>
        <div style={{padding:"24px 32px",borderBottom:"1px solid var(--e1)",display:"flex",alignItems:"center",gap:12,background:"rgba(56,189,248,0.05)"}}>
          <Anchor size={18} color="var(--accent)" style={{opacity:.9}}/>
          <Cap style={{color:"rgba(56,189,248,0.9)"}}>Malacate — Procedimiento Completo</Cap>
          <div style={{marginLeft:"auto",padding:"6px 14px",borderRadius:"4px",background:"var(--warn2)",border:"1px solid rgba(245,158,11,.3)"}}>
            <Cap sm style={{color:"var(--warn)"}}>LEER ANTES DE OPERAR</Cap>
          </div>
        </div>
        <div style={{padding:"36px",display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(320px,1fr))",gap:32}}>
          <div>
            <p style={{fontFamily:"var(--cond)",fontSize:12,fontWeight:800,letterSpacing:".2em",color:"var(--ok)",textTransform:"uppercase",marginBottom:20}}>Antes de Usar</p>
            {["Motor/es ENCENDIDOS — el malacate consume 600-800A y agota las baterías en segundos si no hay carga.","Verificar que la cadena esté bien guiada en el hawse pipe (guía). Jamás operar con la cadena torcida.","Asegurarse de que nadie esté parado sobre la cadena ni cerca del ancla.","En maniobra de fondeo: navegar a 0-1 kn sobre el punto elegido, no dejar caer el ancla desde velocidad."].map((t,i)=>(
              <div key={i} className="step"><span className="step-n">0{i+1}</span><p style={{color:"var(--t1)",fontSize:14,lineHeight:1.72,fontWeight:400}}>{t}</p></div>
            ))}
          </div>
          <div>
            <p style={{fontFamily:"var(--cond)",fontSize:12,fontWeight:800,letterSpacing:".2em",color:"var(--err)",textTransform:"uppercase",marginBottom:20}}>Errores Frecuentes</p>
            {[{e:"Usar el malacate para 'arrancar' el ancla trabada",s:"Girar el barco con el motor para liberarla, nunca forzar el malacate."},{e:"Correr el malacate sin parar más de 30 seg",s:"El motor se calienta. Pausas de 2 min cada 30 seg de uso continuo."},{e:"Usar con motores apagados",s:"Las baterías de servicio no toleran la descarga. Siempre con motores en marcha."},{e:"Subir el ancla a máxima velocidad desde mucha profundidad",s:"Use velocidad media y limpie la cadena con el manguerón mientras sube."}].map((item,i)=>(
              <div key={i} style={{padding:"16px 0",borderBottom:"1px solid rgba(255,255,255,.05)"}}>
                <p style={{color:"var(--err)",fontSize:14,fontWeight:600,marginBottom:6,opacity:.9}}>✕ {item.e}</p>
                <p style={{color:"var(--t2)",fontSize:13,fontWeight:400,lineHeight:1.6,paddingLeft:20}}>→ {item.s}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(320px,1fr))",gap:16}}>
        <div className="card" style={{padding:"36px 32px"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:24}}><Zap size={16} color="var(--t3)"/><Cap>Guía de Consumo 220V</Cap></div>
          {[{t:"Generador o Puerto obligatorio",items:["Aire Acondicionado","Anafe Eléctrico","Termotanque","Horno","Lava-vajillas"],c:"var(--err)"},{t:"Apto para Inverter",items:["Heladera","TV y Audio","Carga USB y teléfonos","Microondas (uso breve)","Luces LED"],c:"var(--ok)"}].map((row,ri)=>(
            <div key={ri} style={{display:"flex",gap:20,padding:"20px 0",borderBottom:ri===0?"1px solid rgba(255,255,255,.05)":"none"}}>
              <div style={{width:3,background:row.c,flexShrink:0,opacity:.6,borderRadius:2}}/>
              <div>
                <p style={{color:"var(--t1)",fontSize:15,fontWeight:600,marginBottom:12}}>{row.t}</p>
                <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                  {row.items.map(i=><span key={i} style={{padding:"6px 12px",borderRadius:"4px",border:"1px solid var(--e2)",fontSize:12,color:"var(--t2)", fontWeight:500}}>{i}</span>)}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="card" style={{padding:"36px 32px"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:24}}><Activity size={16} color="var(--t3)"/><Cap>Bombas y Equipos Críticos</Cap></div>
          {[{t:"Bomba de Achique (Bilge)",d:"Automática. Si se activa frecuentemente hay filtración — reportar inmediatamente."},{t:"Bomba de Agua Potable",d:"Activación constante = pérdida de presión. Revisar grifería. Verificar acumulador de presión."},{t:"Intercambiadores de Calor",d:"El escape debe expulsar agua salada continuamente. Chorro cortado = sobrecalentamiento inminente."},{t:"Macerador de Aguas Negras",d:"No verter papel ni toallitas. Solo papel higiénico de marca autorizada para embarcaciones."}].map((item,i)=>(
            <div key={i} className="step"><span className="step-n">0{i+1}</span><div><p style={{color:"var(--t1)",fontSize:15,fontWeight:600,marginBottom:4}}>{item.t}</p><p style={{color:"var(--t3)",fontSize:13,fontWeight:400,lineHeight:1.7}}>{item.d}</p></div></div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SEC SEGURIDAD
═══════════════════════════════════════════════════════════════ */
function SecSeguridad({onEmergency}){
  const P=[
    {t:"Incendio a Bordo",ico:<Flame size={24}/>,c:"var(--err)",steps:["Cortar motor y fuente de combustible INMEDIATAMENTE.","Extintor CO₂ — apuntar a la BASE del fuego, no a las llamas.","MAYDAY en VHF Canal 16 con posición GPS.","Si no cede en 60 segundos: preparar abandono del barco."]},
    {t:"Hombre al Agua",ico:<Droplets size={24}/>,c:"var(--info)",steps:["Lanzar aro salvavidas inmediatamente. Gritar 'HOMBRE AL AGUA'.","Marcar posición MOB en GPS. No perder contacto visual.","Reducir velocidad. Acercarse con el náufrago a popa.","Recuperar con bichero, escalera o arnés de rescate."]},
    {t:"Ingreso de Agua",ico:<AlertTriangle size={24}/>,c:"var(--warn)",steps:["Localizar punto de ingreso. Mantener la calma.","Activar bombas de achique. Tapar con tapones de emergencia.","Si no se puede controlar: MAYDAY inmediato.","Preparar equipo de abandono: chalecos, balsa, EPIRB."]},
  ];
  return(
    <div className="appear">
      {/* MAYDAY BANNER */}
      <div style={{padding:"20px 28px",borderRadius:"8px",background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,.3)",marginBottom:40,display:"flex",alignItems:"center",gap:20}}>
        <div style={{width:40,height:40,borderRadius:"50%",border:"1px solid rgba(239,68,68,.5)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
          <Radio size={18} color="var(--err)"/>
        </div>
        <div style={{flex:1}}>
          <p style={{fontFamily:"var(--cond)",fontSize:13,fontWeight:800,letterSpacing:".25em",color:"var(--err)",textTransform:"uppercase",marginBottom:4}}>Emergencia — MAYDAY</p>
          <p style={{fontFamily:"var(--mono)",fontSize:11,color:"rgba(239,68,68,0.8)",letterSpacing:".06em",lineHeight:1.6}}>VHF Canal 16 · Prefectura Naval Argentina: 106 · Guardia Costera: 0800-666-3500</p>
        </div>
        <button onClick={onEmergency}
          style={{padding:"12px 24px",borderRadius:"4px",background:"rgba(239,68,68,0.15)",border:"1px solid rgba(239,68,68,0.5)",color:"var(--err)",fontFamily:"var(--cond)",fontWeight:800,fontSize:10,letterSpacing:".2em",textTransform:"uppercase",cursor:"pointer",whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:10,transition:"all .2s",flexShrink:0}}
          onMouseEnter={e=>e.currentTarget.style.background="rgba(239,68,68,0.25)"}
          onMouseLeave={e=>e.currentTarget.style.background="rgba(239,68,68,0.15)"}>
          <div style={{width:6,height:6,borderRadius:"50%",background:"var(--err)",animation:"pulse .8s ease-in-out infinite"}}/>
          ABRIR MODO EMERGENCIA
        </button>
      </div>
      <SH eyebrow="Seguridad" num="06" title="Emergencia y Diagnóstico"/>
      <div className="stg" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(320px,1fr))",gap:16,marginBottom:16}}>
        {P.map(e=>(
          <div key={e.t} className="card" style={{padding:"36px 32px",borderTop:`3px solid ${e.c}`}}>
            <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:28}}>
              <div style={{color:e.c,display:"flex"}}>{e.ico}</div>
              <h3 style={{fontFamily:"var(--serif)",fontSize:24,fontWeight:600,color:"var(--t1)"}}>{e.t}</h3>
            </div>
            {e.steps.map((p,i)=>(
              <div key={i} className="step">
                <span className="step-n" style={{color:`${e.c}`}}>0{i+1}</span>
                <p style={{color:"var(--t1)",fontSize:14,lineHeight:1.78,fontWeight:400}}>{p}</p>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="card" style={{padding:"40px 36px",marginBottom:16}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:24}}><Info size={16} color="var(--t3)"/><Cap>Diagnóstico Rápido</Cap></div>
        {[{t:"El motor no arranca",b:"Verificar que los cortes de batería estén en ON. Usar switch Parallel solo en emergencia para unir bancos. Si hay olor a combustible, esperar 5 minutos con escotillas abiertas antes de volver a intentar."},{t:"La bomba de agua potable no corta",b:"Hay pérdida de presión en algún punto. Causa más común: duchador de popa mal cerrado, seguido de una grifo que gotea. Revisar también el acumulador de presión (debe tener 2 bar de precarga)."},{t:"El inodoro no funciona o hay mal olor",b:"Grifo de fondo de salida debe estar ABIERTO. Si el olor persiste, el tanque de aguas negras puede estar lleno o el venteo bloqueado. Revisar filtro de carbón del venteo."},{t:"Alta temperatura en motor",b:"Cortar motor INMEDIATAMENTE. Verificar que el grifo de fondo correspondiente esté abierto y libre de algas/obstáculos. Controlar nivel de refrigerante. No arrancar hasta identificar la causa."},{t:"El inverter se apaga solo",b:"Las baterías de servicio bajaron de 12.0V y el inverter se protegió automáticamente. Conectar a 220V de muelle o arrancar motores para cargar. Esperar 30 minutos antes de usar el inverter nuevamente."}].map((d,i)=>(
          <details key={d.t} style={{borderBottom:"1px solid rgba(255,255,255,.05)"}}>
            <summary style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"20px 0"}}>
              <div style={{display:"flex",alignItems:"center",gap:16}}>
                <span style={{fontFamily:"var(--mono)",fontSize:11,color:"var(--accent)",opacity:.6,letterSpacing:".04em", fontWeight:700}}>0{i+1}</span>
                <span style={{color:"var(--t1)",fontSize:15,fontWeight:500}}>{d.t}</span>
              </div>
              <i className="arr"><ChevronRight size={16}/></i>
            </summary>
            <div style={{paddingBottom:24,paddingLeft:44}}>
              <p style={{color:"var(--t3)",fontSize:14,fontWeight:400,lineHeight:1.85}}>{d.b}</p>
            </div>
          </details>
        ))}
      </div>
      <div className="card" style={{padding:"40px 36px"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:24}}><AlertTriangle size={16} color="var(--t3)"/><Cap>Fusibles de Alta Potencia</Cap></div>
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead><tr style={{borderBottom:"1px solid var(--e2)"}}>{["Sistema","Amperaje","Ubicación"].map(h=><th key={h} style={{textAlign:"left",paddingBottom:14,paddingRight:16}}><Cap sm>{h}</Cap></th>)}</tr></thead>
          <tbody>{[["Bow Thruster / Malacate","630 A","Sala de Máquinas · Caja Principal"],["Malacate (secundario)","250 A","Sala de Máquinas · Panel de Proa"],["Inverter","200 A","Sala de Máquinas · Junto a Baterías de Servicio"],["Bomba de Achique","40 A","Panel 12V · Sección Sentinas"],["Bomba de Agua Potable","20 A","Panel 12V · Sección Servicios"]].map((r,i)=>(
            <tr key={i} style={{borderBottom:"1px solid rgba(255,255,255,.04)"}}>
              {r.map((c,j)=><td key={j} style={{padding:"16px 16px 16px 0",color:j===0?"var(--t1)":j===1?"var(--warn)":"var(--t3)",fontWeight:400,fontSize:14,fontFamily:j===1?"var(--mono)":"inherit"}}>{c}</td>)}
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SEC TUTORIALES
═══════════════════════════════════════════════════════════════ */
function SecTutoriales(){
  const [vid,setVid]=useState(null);
  const [filter,setFilter]=useState("todos");
  const V=[
    {id:"GRRk7-_oz98",t:"Chequeo de Motores",d:"Niveles, correas y pre-arranque",c:"Mantenimiento",ref:"MT-001"},
    {id:"nAECKiKmdZY",t:"Conexión a Puerto",d:"Cable 220V de forma segura",c:"Energía",ref:"EN-001"},
    {id:"pEX04f1fR_4",t:"Generador Marino",d:"Conceptos básicos y operación",c:"Energía",ref:"EN-002"},
    {id:"Xc96Kgbv5w0",t:"Maniobra de Fondeo",d:"Técnica correcta de anclaje",c:"Navegación",ref:"NV-001"},
    {id:"5Ylng2lJ6aQ",t:"Sistema Sanitario",d:"Uso del inodoro eléctrico",c:"Sistemas",ref:"SY-001"},
    {id:"rA5oHEjK3tE",t:"Hélice de Proa",d:"Tips de uso efectivo y límites",c:"Propulsión",ref:"PR-001"},
    {id:"6cPRVzIXDbM",t:"Purgado de Motor",d:"Sacar aire del circuito diesel",c:"Mantenimiento",ref:"MT-002"},
    {id:"kxwduznfXnQ",t:"Control de Incendios",d:"Equipos y procedimientos",c:"Seguridad",ref:"SG-001"},
    {id:"5WoAT5RopNE",t:"Hombre al Agua",d:"Maniobra de recuperación MOB",c:"Seguridad",ref:"SG-002"},
  ];
  const cats=["todos",...[...new Set(V.map(v=>v.c))]];
  const filtered=filter==="todos"?V:V.filter(v=>v.c===filter);
  const catColor={Mantenimiento:"var(--warn)",Energía:"var(--info)",Navegación:"var(--ok)",Sistemas:"#A78BFA",Propulsión:"var(--accent)",Seguridad:"var(--err)"};
  return(
    <div className="appear">
      <SH eyebrow="Klase A · Technical Library" num="07" title="Videoteca Técnica"
        sub={`${V.length} procedimientos documentados en video. Cada uno corresponde a una sección del manual.`}/>
      <div style={{display:"flex",gap:8,marginBottom:24,flexWrap:"wrap",alignItems:"center"}}>
        {cats.map(c=>(
          <button key={c} onClick={()=>setFilter(c)}
            style={{padding:"10px 20px",borderRadius:"4px",background:filter===c?"var(--s2)":"var(--s1)",border:`1px solid ${filter===c?"rgba(56,189,248,.4)":"var(--e1)"}`,cursor:"pointer",fontFamily:"var(--cond)",fontSize:11,fontWeight:800,letterSpacing:".2em",color:filter===c?"var(--accent)":"var(--t3)",textTransform:"uppercase",transition:"all .18s"}}>
            {c}
          </button>
        ))}
        <span style={{marginLeft:"auto",fontFamily:"var(--mono)",fontSize:10,color:"var(--t3)",letterSpacing:".08em", fontWeight:700}}>{filtered.length} videos</span>
      </div>
      <div className="stg" style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(340px,1fr))",gap:16}}>
        {filtered.map((v,i)=>{
          const color=catColor[v.c]||"var(--t2)";
          return(
            <div key={v.id} className="vcard" onClick={()=>setVid(v.id)}>
              <div className="vcard-grid"/>
              <img src={`https://img.youtube.com/vi/${v.id}/maxresdefault.jpg`} alt={v.t}
                style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",opacity:.35,transition:"opacity .3s"}}
                onMouseOver={e=>e.target.style.opacity=".6"} onMouseOut={e=>e.target.style.opacity=".35"}/>
              <div className="vcard-ov"/>
              <div className="vcard-scan"/>
              {["tl","tr","bl","br"].map(p=><div key={p} className={`vcard-corner ${p}`}/>)}
              <div className="vcard-play"><Play size={24} color="rgba(56,189,248,.9)"/></div>
              <div style={{position:"absolute",top:0,left:0,right:0,padding:"18px",display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div style={{padding:"4px 12px",borderRadius:"4px",background:"rgba(2,6,23,.85)",border:`1px solid ${color}40`,backdropFilter:"blur(12px)"}}>
                  <span style={{fontFamily:"var(--cond)",fontSize:10,fontWeight:800,color,letterSpacing:".15em"}}>{v.c.toUpperCase()}</span>
                </div>
                <span style={{fontFamily:"var(--mono)",fontSize:9,color:"rgba(255,255,255,0.4)",letterSpacing:".1em", fontWeight:700}}>{v.ref}</span>
              </div>
              <div style={{position:"absolute",bottom:0,left:0,right:0,padding:"24px"}}>
                <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:12}}>
                  <div style={{height:2,flex:1,background:`linear-gradient(90deg,${color}60,transparent)`}}/>
                  <span style={{fontFamily:"var(--mono)",fontSize:10,color:"rgba(255,255,255,0.4)",letterSpacing:".08em", fontWeight:700}}>{pad(i+1)}/{pad(V.length)}</span>
                </div>
                <p style={{fontFamily:"var(--serif)",color:"var(--t1)",fontSize:22,fontWeight:600,marginBottom:6,lineHeight:1.2}}>{v.t}</p>
                <p style={{fontFamily:"var(--body)",color:"var(--t2)",fontSize:13,fontWeight:400}}>{v.d}</p>
              </div>
            </div>
          );
        })}
      </div>
      {vid&&(
        <div onClick={e=>e.target===e.currentTarget&&setVid(null)}
          style={{position:"fixed",inset:0,background:"rgba(2,6,23,.98)",backdropFilter:"blur(10px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:99999,padding:24,animation:"fade .25s both"}}>
          <div style={{width:"100%",maxWidth:1000,animation:"enter .35s var(--ez) both"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <span style={{fontFamily:"var(--mono)",fontSize:12,color:"var(--t2)",letterSpacing:".15em", fontWeight:700}}>{V.find(x=>x.id===vid)?.ref}</span>
              <button onClick={()=>setVid(null)} style={{background:"rgba(255,255,255,0.05)",border:"1px solid var(--e2)",borderRadius:"6px",color:"var(--t1)",padding:"10px 24px",cursor:"pointer",fontFamily:"var(--cond)",fontSize:11,fontWeight:800,letterSpacing:".2em",textTransform:"uppercase",display:"flex",alignItems:"center",gap:10}}>
                <X size={14}/> CERRAR
              </button>
            </div>
            <div style={{aspectRatio:"16/9", borderRadius:"8px", overflow:"hidden", border:"1px solid var(--e2)"}}>
              <iframe src={`https://www.youtube.com/embed/${vid}?autoplay=1`} style={{width:"100%",height:"100%",border:"none"}} allowFullScreen title="v"/>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SEC SOPORTE
═══════════════════════════════════════════════════════════════ */
function SecSoporte({clienteId,nombreBarco,push}){
  const AREAS=["Electricidad / Tableros","Motores / Propulsión","Agua / Baños / Sanitarios","Casco / Fibra / Filtraciones","Malacate / Bow Thruster","Climatización","Sistema de Baterías / Inverter","Otros"];
  const B={area:"",desc:"",phone:"",ubi:""};
  const [fm,setFm]=useState(B),[send,setSend]=useState(false),[tks,setTks]=useState([]),[load,setLoad]=useState(true),[done,setDone]=useState(false);
  const [archivos,setArchivos]=useState([]);
  const [drag,setDrag]=useState(false);
  const [lb,setLb]=useState(null);
  const inputRef=useRef();

  const fetch2=useCallback(async()=>{
    if(!clienteId)return;setLoad(true);
    const{data,error}=await supabase.from("tickets").select("*").eq("cliente_id",clienteId).order("fecha_creacion",{ascending:false}).limit(20);
    if(!error)setTks(data||[]);setLoad(false);
  },[clienteId]);

  useEffect(()=>{fetch2();},[fetch2]);

  const handleFiles=async(files)=>{
    const val=[...files].filter(f=>f.type.startsWith("image/")||f.type.startsWith("video/"));
    if(!val.length)return;
    const new_=await Promise.all(val.map(f=>new Promise(res=>{const r=new FileReader();r.onload=e=>res({url:e.target.result,name:f.name,type:f.type,size:f.size,id:Date.now()+Math.random(),file:f});r.readAsDataURL(f);})));
    setArchivos(p=>[...p,...new_]);
  };
  const removeFile=id=>setArchivos(p=>p.filter(x=>x.id!==id));
  const uploadToStorage=async(file,tempId)=>{
    const path=`tickets/${tempId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;
    const{data:upData,error}=await supabase.storage.from("ticket-attachments").upload(path,file,{cacheControl:"3600",upsert:true});
    if(error)throw new Error(error.message||JSON.stringify(error));
    const{data}=supabase.storage.from("ticket-attachments").getPublicUrl(path);
    return data.publicUrl;
  };
  const submit=async()=>{
    if(!fm.area){push("Seleccione el área afectada","err");return}
    if(!fm.desc||fm.desc.trim().length<10){push("Descripción muy breve — agregue más detalle","err");return}
    if(!fm.phone){push("Ingrese número de WhatsApp","err");return}
    if(send)return;setSend(true);
    try{
      let urls=[];
      if(archivos.length>0){push(`Subiendo ${archivos.length} archivo(s)…`,"inf");const tf=`${clienteId}_${Date.now()}`;for(const a of archivos){try{urls.push(await uploadToStorage(a.file,tf));}catch(e){push(`✗ ${a.name.slice(0,24)}: ${e.message}`,"err");}}}
      const{error:tkErr}=await supabase.from("tickets").insert([{cliente_id:clienteId,area:fm.area,descripcion:fm.desc.trim(),telefono:fm.phone,ubicacion_barco:fm.ubi,nombre_barco_ticket:nombreBarco,estado:"pendiente",adjuntos:urls}]);
      if(tkErr)throw tkErr;
      setFm(B);setArchivos([]);setDone(true);push(`Reporte enviado${urls.length?" con "+urls.length+" foto(s)":""}`, "ok");setTimeout(()=>fetch2(),800);
    }catch(e){push("Error: "+e.message,"err");}finally{setSend(false);}
  };
  const fmtSize=b=>b<1024*1024?(b/1024).toFixed(0)+" KB":(b/1024/1024).toFixed(1)+" MB";

  return(
    <div className="appear">
      <SH eyebrow="Post-Venta" num="08" title="Garantía y Soporte Técnico"
        sub="Reportá una falla o novedad con foto o video. Nuestro equipo responde a la brevedad por WhatsApp."/>
      <div className="stg" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(360px,1fr))",gap:16}}>
        <div className="card" style={{padding:"40px 32px"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:32}}><MessageSquare size={16} color="var(--t3)"/><Cap>Nuevo Reporte</Cap></div>
          {done?(
            <div style={{marginTop:24,padding:"40px 24px",textAlign:"center",borderRadius:"8px",border:"1px solid rgba(16,185,129,.2)",background:"var(--ok2)",animation:"enter .5s var(--ez) both"}}>
              <div style={{width:56,height:56,border:"1px solid rgba(16,185,129,.4)",borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 20px"}}>
                <Check size={24} color="var(--ok)"/>
              </div>
              <p style={{fontFamily:"var(--serif)",fontSize:32,fontWeight:600,color:"var(--t1)",marginBottom:12}}>Enviado</p>
              <p style={{color:"var(--t3)",fontSize:14,lineHeight:1.85,fontWeight:400}}>Nuestro equipo revisará su reporte y se contactará por WhatsApp.</p>
              <button onClick={()=>setDone(false)} style={{marginTop:24,padding:"12px 24px",borderRadius:"4px",background:"var(--s1)",border:"1px solid var(--e2)",color:"var(--t1)",fontFamily:"var(--cond)",fontSize:11,fontWeight:800,letterSpacing:".2em",textTransform:"uppercase",cursor:"pointer"}}>NUEVO REPORTE</button>
            </div>
          ):(
            <>
              <div style={{marginBottom:24}}><Lbl>Área Afectada *</Lbl><select className="sel" value={fm.area} onChange={e=>setFm(f=>({...f,area:e.target.value}))}><option value="">Seleccione…</option>{AREAS.map(a=><option key={a} value={a}>{a}</option>)}</select></div>
              <div style={{marginBottom:24}}><Lbl>Ubicación del Barco</Lbl><input className="inp" value={fm.ubi} onChange={e=>setFm(f=>({...f,ubi:e.target.value}))} placeholder="Puerto Madero · Amarra 24"/></div>
              <div style={{marginBottom:24}}><Lbl>Descripción del Problema *</Lbl><textarea className="ta" value={fm.desc} onChange={e=>setFm(f=>({...f,desc:e.target.value}))} placeholder="Cuándo ocurrió, síntomas, condiciones…"/></div>
              <div style={{marginBottom:32}}><Lbl>WhatsApp *</Lbl><input className="inp" type="tel" value={fm.phone} onChange={e=>setFm(f=>({...f,phone:e.target.value}))} placeholder="+54 9 ···· ··· ····"/></div>
              <div style={{marginBottom:32}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                  <Paperclip size={12} color="var(--t3)"/><Lbl style={{marginBottom:0}}>Fotos / Videos</Lbl>
                  {archivos.length>0&&<span style={{marginLeft:"auto",fontFamily:"var(--mono)",fontSize:10,color:"var(--t3)", fontWeight:700}}>{archivos.length} arch.</span>}
                </div>
                {archivos.length>0&&(
                  <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16}}>
                    {archivos.map(a=>(
                      <div key={a.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",borderRadius:"6px",background:"var(--s2)",border:"1px solid var(--e1)"}}>
                        {a.type.startsWith("image/")?<img src={a.url} alt="" style={{width:40,height:40,objectFit:"cover",borderRadius:"4px"}}/>:<div style={{width:40,height:40,background:"var(--s3)",borderRadius:"4px",display:"flex",alignItems:"center",justifyContent:"center"}}><Play size={16} color="var(--t1)"/></div>}
                        <div style={{flex:1,minWidth:0}}>
                          <p style={{fontSize:13,color:"var(--t1)",fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:2}}>{a.name}</p>
                          <p style={{fontFamily:"var(--mono)",fontSize:10,color:"var(--t3)"}}>{fmtSize(a.size)}</p>
                        </div>
                        <button onClick={()=>removeFile(a.id)} style={{background:"transparent",border:"none",cursor:"pointer",color:"var(--t3)",display:"flex",padding:6,transition:"color .18s"}}
                          onMouseEnter={e=>e.currentTarget.style.color="var(--err)"} onMouseLeave={e=>e.currentTarget.style.color="var(--t3)"}><Trash2 size={14}/></button>
                      </div>
                    ))}
                  </div>
                )}
                <div className={`upzone${drag?" drag":""}`}
                  onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)}
                  onDrop={e=>{e.preventDefault();setDrag(false);handleFiles(e.dataTransfer.files)}}
                  onClick={()=>inputRef.current?.click()} style={{borderRadius:"6px"}}>
                  <input ref={inputRef} type="file" accept="image/*,video/*" multiple style={{display:"none"}} onChange={e=>handleFiles(e.target.files)}/>
                  <Upload size={20} color="var(--t3)" style={{margin:"0 auto 10px",display:"block"}}/>
                  <p style={{fontFamily:"var(--body)",fontSize:13,color:"var(--t3)",fontWeight:400}}>Arrastrá o hacé clic para adjuntar</p>
                </div>
              </div>
              <button onClick={submit} disabled={send}
                style={{width:"100%",padding:"18px",borderRadius:"6px",background:send?"rgba(56,189,248,.05)":"var(--accent)",border:`1px solid ${send?"rgba(56,189,248,.2)":"var(--accent)"}`,color:send?"var(--accent)":"#020617",fontFamily:"var(--cond)",fontWeight:800,fontSize:11,letterSpacing:".25em",textTransform:"uppercase",cursor:send?"not-allowed":"pointer",transition:"all .25s",display:"flex",alignItems:"center",justifyContent:"center",gap:10,opacity:send?.7:1}}>
                {send?"ENVIANDO…":"ENVIAR REPORTE"}
              </button>
            </>
          )}
        </div>
        <div className="card" style={{padding:"40px 32px"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:28}}>
            <FileText size={16} color="var(--t3)"/><Cap>Historial de Reportes</Cap>
            <button onClick={fetch2} style={{marginLeft:"auto",background:"transparent",border:"none",cursor:"pointer",color:"var(--t3)",display:"flex",padding:0}}><RefreshCw size={14}/></button>
          </div>
          {load?(
            <div style={{display:"flex",flexDirection:"column",gap:12}}>{[1,2,3].map(i=><div key={i} className="shim" style={{height:70}}/>)}</div>
          ):(tks||[]).length===0?(
            <div style={{textAlign:"center",padding:"56px 20px"}}><p style={{fontFamily:"var(--mono)",fontSize:11,fontWeight:700,color:"var(--t3)",letterSpacing:".15em"}}>SIN REPORTES PREVIOS</p></div>
          ):(
            (tks||[]).map(t=>(
              <div key={t.id} style={{padding:"20px 0",borderBottom:"1px solid rgba(255,255,255,.05)"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,marginBottom:10}}>
                  <p style={{color:"var(--t1)",fontSize:15,fontWeight:600,flex:1}}>{t.area}</p>
                  <SBadge estado={t.estado}/>
                </div>
                <p style={{color:"var(--t3)",fontSize:13,fontWeight:400,lineHeight:1.7,marginBottom:12}}>{t.descripcion?.slice(0,140)}{t.descripcion?.length>140?"…":""}</p>
                {t.adjuntos?.length>0&&(
                  <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12}}>
                    {t.adjuntos.map((url,i)=>(
                      <div key={i} onClick={()=>setLb({url,type:"image/jpeg"})} style={{width:48,height:48,overflow:"hidden",cursor:"pointer",border:"1px solid var(--e2)",borderRadius:"4px",flexShrink:0}}>
                        <img src={url} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}} onError={e=>e.target.style.display="none"}/>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontFamily:"var(--mono)",fontSize:9,color:"var(--t3)",letterSpacing:".04em", fontWeight:700}}>{new Date(t.fecha_creacion).toLocaleDateString("es-AR",{day:"2-digit",month:"short",year:"numeric"})}</span>
                  {t.adjuntos?.length>0&&<span style={{fontFamily:"var(--mono)",fontSize:9,color:"var(--t3)", fontWeight:700}}>{t.adjuntos.length} adjunto{t.adjuntos.length>1?"s":""}</span>}
                </div>
                {t.seguimiento&&(
                  <div style={{marginTop:16,padding:"14px 18px",borderRadius:"6px",background:"var(--info2)",border:"1px solid rgba(59,130,246,.2)"}}>
                    <Cap sm style={{display:"block",marginBottom:6,color:"rgba(59,130,246,.8)"}}>Respuesta técnica</Cap>
                    <p style={{fontSize:13,color:"#93C5FD",lineHeight:1.75,fontWeight:400}}>{t.seguimiento}</p>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
      {lb&&(
        <div onClick={()=>setLb(null)} style={{position:"fixed",inset:0,background:"rgba(2,6,23,.98)",backdropFilter:"blur(8px)",zIndex:99999,display:"flex",alignItems:"center",justifyContent:"center",padding:24,animation:"fade .2s both"}}>
          <button onClick={()=>setLb(null)} style={{position:"absolute",top:24,right:24,background:"rgba(255,255,255,.05)",border:"1px solid var(--e2)",borderRadius:"6px",color:"var(--t1)",padding:"10px 20px",cursor:"pointer",fontFamily:"var(--cond)",fontSize:10,fontWeight:800,letterSpacing:".2em",display:"flex",gap:8,alignItems:"center"}}><X size={14}/>CERRAR</button>
          {lb.type?.startsWith("image/")?<img src={lb.url} alt="" style={{maxWidth:"92vw",maxHeight:"88vh",objectFit:"contain",animation:"enter .3s var(--ez) both"}}/>:<video src={lb.url} controls autoPlay style={{maxWidth:"92vw",maxHeight:"88vh",animation:"enter .3s var(--ez) both"}}/>}
        </div>
      )}
    </div>
  );
}

/* Helper */
function clamp(a,b){return Math.round((a+b)/2);}

/* ═══════════════════════════════════════════════════════════════
   NAV CONFIG
═══════════════════════════════════════════════════════════════ */
const NAV_ITEMS=[
  {id:"bienvenida",   l:"Inicio",      ico:<Home size={14}/>},
  {id:"configuracion",l:"Identidad",   ico:<Settings size={14}/>},
  {id:"resumen",      l:"Planificador",ico:<Navigation size={14}/>},
  {id:"energia",      l:"Energía",     ico:<Zap size={14}/>},
  {id:"propulsion",   l:"Propulsión",  ico:<Gauge size={14}/>},
  {id:"sistemas",     l:"Sistemas",    ico:<Activity size={14}/>},
  {id:"seguridad",    l:"Seguridad",   ico:<Shield size={14}/>},
  {id:"tutoriales",   l:"Videoteca",   ico:<Play size={14}/>},
  {id:"soporte",      l:"Soporte",     ico:<MessageSquare size={14}/>},
];

/* ═══════════════════════════════════════════════════════════════
   MAIN EXPORT — OCEAN TECH
═══════════════════════════════════════════════════════════════ */
export default function ClientePanelScreen({session,onSignOut}){
  const [cliente,setC]=useState(null),[mc,setMc]=useState({}),[loading,setL]=useState(true);
  const [sec,setSec]=useState("bienvenida"),[mobOpen,setMob]=useState(false);
  const [emergMode,setEmergMode]=useState(false);
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

  const go=s=>{setSec(s);setMob(false);window.scrollTo({top:0,behavior:"smooth"})};

  if(loading)return(
    <div style={{background:"#020617",minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
      <style>{CSS}</style>
      <div style={{animation:"fade 1s both"}}>
        <svg viewBox="0 0 160 160" style={{width:140,height:140,display:"block",margin:"0 auto"}}>
          <circle cx="80" cy="80" r="70" fill="none" stroke="rgba(56,189,248,0.15)" strokeWidth="1"/>
          <circle cx="80" cy="80" r="50" fill="none" stroke="rgba(56,189,248,0.1)" strokeWidth="0.8"/>
          {[0,90,180,270].map(d=>{const p=polarPt(80,80,70,d-90);return <line key={d} x1={80} y1={80} x2={p.x} y2={p.y} stroke="rgba(56,189,248,0.2)" strokeWidth="1"/>})}
          <circle cx="80" cy="80" r="4" fill="rgba(56,189,248,0.6)" style={{animation:"gPulse 1.4s ease-in-out infinite"}}/>
        </svg>
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:14,marginTop:28}}>
          <span style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:12,fontWeight:800,letterSpacing:".4em",color:"rgba(56,189,248,0.5)",textTransform:"uppercase"}}>KLASE A</span>
          <div style={{display:"flex",gap:6}}>
            {[0,.18,.36].map(d=><div key={d} style={{width:4,height:4,background:"rgba(56,189,248,0.4)",borderRadius:"50%",animation:`pulse 1.6s ${d}s ease-in-out infinite`}}/>)}
          </div>
        </div>
      </div>
    </div>
  );

  const sp={cliente,mc,goTo:go,clienteId:session?.user?.id,nombreBarco:cliente?.nombre_barco,push};

  return(
    <div style={{background:"#020617",minHeight:"100vh"}}>
      <style>{CSS}</style>
      <Toasts list={toasts}/>

      {emergMode&&<EmergencyOverlay onClose={()=>setEmergMode(false)}/>}

      {/* ── NAV ── */}
      <nav className="nav">
        <div className="nav-brand">
          <img src={logoK} alt="K" style={{width:24,height:24,objectFit:"contain",opacity:.8,flexShrink:0,filter:"grayscale(100%) brightness(2.5)"}}/>
          <span style={{fontFamily:"var(--cond)",fontWeight:800,fontSize:12,letterSpacing:".35em",color:"rgba(255,255,255,0.9)",marginLeft:4}}>KLASE A</span>
        </div>
        <div className="nav-div"/>
        <div className="nav-items">
          {NAV_ITEMS.map((item,i)=>(
            <button key={item.id} className={`nv${sec===item.id?" on":""}`} onClick={()=>go(item.id)}>
              <span className="nv-n">{pad(i+1)}</span>
              <span className="nv-l">{item.l}</span>
            </button>
          ))}
        </div>
        <div className="nav-right">
          {cliente?.nombre_barco&&(
            <span style={{fontFamily:"var(--mono)",fontSize:10,fontWeight:700,color:"var(--t2)",letterSpacing:".1em",whiteSpace:"nowrap"}}>{cliente.nombre_barco}</span>
          )}
          <button onClick={()=>setEmergMode(true)}
            style={{background:"transparent",border:"1px solid rgba(239,68,68,0.3)",borderRadius:"4px",color:"rgba(239,68,68,0.8)",
              fontFamily:"var(--cond)",fontWeight:800,fontSize:10,letterSpacing:".2em",textTransform:"uppercase",
              cursor:"pointer",padding:"8px 16px",display:"flex",alignItems:"center",gap:8,transition:"all .2s",flexShrink:0}}
            onMouseEnter={e=>{e.currentTarget.style.background="rgba(239,68,68,0.1)";e.currentTarget.style.color="var(--err)"}}
            onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color="rgba(239,68,68,0.8)"}}>
            <div style={{width:5,height:5,borderRadius:"50%",background:"var(--err)",animation:"pulse .8s ease-in-out infinite"}}/>
            SOS
          </button>
          <button onClick={onSignOut}
            style={{background:"transparent",border:"1px solid var(--e2)",borderRadius:"4px",color:"var(--t2)",
              fontFamily:"var(--cond)",fontWeight:800,fontSize:10,letterSpacing:".2em",
              textTransform:"uppercase",cursor:"pointer",padding:"8px 16px",
              display:"flex",alignItems:"center",gap:8,transition:"all .2s",flexShrink:0}}
            onMouseEnter={e=>{e.currentTarget.style.background="var(--s2)";e.currentTarget.style.color="var(--t1)"}}
            onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color="var(--t2)"}}>
            <Power size={12}/>SALIR
          </button>
          <button className="mob-btn" onClick={()=>setMob(true)} style={{marginLeft:8}}>
            <Menu size={18}/>
          </button>
        </div>
      </nav>

      {/* ── MOBILE DRAWER ── */}
      <div className={`mob-drawer${mobOpen?" open":""}`}>
        <div className="mob-bg" onClick={()=>setMob(false)}/>
        <div className="mob-nav">
          {NAV_ITEMS.map((item,i)=>(
            <button key={item.id} className={`mob-nv${sec===item.id?" on":""}`} onClick={()=>go(item.id)}>
              <span style={{color:sec===item.id?"var(--accent)":"var(--t3)",display:"flex"}}>{item.ico}</span>
              <span style={{fontFamily:"var(--mono)",fontSize:10,color:"var(--t3)",opacity:.6,letterSpacing:".06em"}}>{pad(i+1)}</span>
              {item.l}
            </button>
          ))}
          <button className="mob-nv" onClick={()=>{setEmergMode(true);setMob(false)}} style={{color:"rgba(239,68,68,0.9)"}}>
            <Radio size={14} color="var(--err)" style={{opacity:.9}}/>
            EMERGENCIA
          </button>
          <button className="mob-nv" onClick={onSignOut} style={{borderTop:"1px solid var(--e2)"}}>
            <Power size={14}/>CERRAR SESIÓN
          </button>
        </div>
      </div>

      {/* ── SHELL ── */}
      <div className="shell">
        {sec==="bienvenida"    &&<SecBienvenida {...sp} onEmergency={()=>setEmergMode(true)}/>}
        {sec==="configuracion" &&<div className="page"><SecIdentidad {...sp}/></div>}
        {sec==="resumen"       &&<div className="page"><SecPlanificador {...sp}/></div>}
        {sec==="energia"       &&<div className="page"><SecEnergia {...sp}/></div>}
        {sec==="propulsion"    &&<div className="page"><SecPropulsion {...sp}/></div>}
        {sec==="sistemas"      &&<div className="page"><SecSistemas {...sp}/></div>}
        {sec==="seguridad"     &&<div className="page"><SecSeguridad {...sp} onEmergency={()=>setEmergMode(true)}/></div>}
        {sec==="tutoriales"    &&<div className="page"><SecTutoriales {...sp}/></div>}
        {sec==="soporte"       &&<div className="page"><SecSoporte {...sp}/></div>}
      </div>
    </div>
  );
}