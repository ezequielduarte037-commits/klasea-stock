/**
 * PanelEnhanced.jsx — Klase-A Premium HMI Upgrade
 *
 * Exporta:
 *   - SecEstado          → nueva sección "Estado de la Unidad"
 *   - SecBienvenidaPlus  → reemplazo mejorado de SecBienvenida
 *   - ENHANCED_CSS       → styles adicionales (agregar al CSS global del panel)
 *
 * ── INTEGRACIÓN ──────────────────────────────────────────────────
 * 1. Importar en ClientePanelScreen.jsx:
 *      import { SecEstado, SecBienvenidaPlus, ENHANCED_CSS } from "./PanelEnhanced";
 *
 * 2. En la constante CSS del panel, al final antes del backtick de cierre, agregar:
 *      ${ENHANCED_CSS}
 *
 * 3. En NAV_ITEMS, agregar (después de bienvenida):
 *      { id:"estado", l:"Estado", ico:<Activity size={13}/> }
 *
 * 4. En el bloque de secciones:
 *      {sec==="bienvenida" && <SecBienvenidaPlus {...sp}/>}   ← reemplaza el actual
 *      {sec==="estado"     && <SecEstado         {...sp}/>}   ← nueva sección
 * ─────────────────────────────────────────────────────────────────
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  Zap, Droplets, Activity, Shield, Settings, Play,
  MessageSquare, Gauge, Navigation, Wind, Thermometer,
  AlertTriangle, ChevronRight, TrendingUp, Clock, Anchor,
  CheckCircle, Circle, Battery, Fuel, Wrench, Calendar,
  ArrowUp, ArrowDown, Minus
} from "lucide-react";

/* ══════════════════════════════════════════════════════════════
   ENHANCED CSS
   ══════════════════════════════════════════════════════════════ */
export const ENHANCED_CSS = `

/* ── Gauge animations ── */
@keyframes gaugeFill {
  from { stroke-dashoffset: var(--gauge-full); }
  to   { stroke-dashoffset: var(--gauge-target); }
}
@keyframes countUp {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes radarSweep {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
@keyframes vitalPulse {
  0%,100% { box-shadow: 0 0 0 0 rgba(45,184,122,0); }
  50%      { box-shadow: 0 0 0 6px rgba(45,184,122,0.08); }
}
@keyframes slideRight {
  from { opacity:0; transform:translateX(-16px); }
  to   { opacity:1; transform:translateX(0); }
}
@keyframes borderGlow {
  0%,100% { border-color: rgba(58,127,208,0.12); }
  50%      { border-color: rgba(58,127,208,0.35); }
}
@keyframes heroKen {
  from { transform: scale(1.08); }
  to   { transform: scale(1); }
}
@keyframes scanH {
  0%   { transform: translateY(-100%); opacity:0; }
  10%  { opacity:1; }
  90%  { opacity:1; }
  100% { transform: translateY(1400%); opacity:0; }
}

/* ── Vitals strip ── */
.vital-item {
  display:flex; flex-direction:column; align-items:center; gap:4px;
  padding: 14px 20px; cursor:pointer; transition:background .22s;
  border-right:1px solid rgba(255,255,255,0.06);
  position:relative; overflow:hidden;
}
.vital-item:last-child { border-right:none; }
.vital-item:hover { background:rgba(255,255,255,0.025); }
.vital-item::after {
  content:''; position:absolute; bottom:0; left:0; right:0; height:1px;
  background:var(--vital-color,rgba(255,255,255,0.1));
  transform:scaleX(0); transition:transform .38s var(--ez);
  transform-origin:left;
}
.vital-item:hover::after { transform:scaleX(1); }

/* ── Gauge card ── */
.gauge-card {
  background:var(--s2); border:1px solid var(--e1); border-radius:1px;
  padding:28px 24px; display:flex; flex-direction:column; align-items:center;
  transition:border-color .3s, box-shadow .3s;
  position:relative; overflow:hidden;
}
.gauge-card:hover {
  border-color:var(--e2);
  box-shadow: 0 0 32px rgba(0,0,0,0.4);
}
.gauge-card::before {
  content:''; position:absolute; top:0; left:0; right:0; height:1px;
  background:linear-gradient(90deg,transparent,var(--g-color,rgba(255,255,255,0.08)),transparent);
  opacity:0; transition:opacity .35s;
}
.gauge-card:hover::before { opacity:1; }

/* ── System status row ── */
.sys-row {
  display:flex; align-items:center; gap:14px;
  padding:13px 18px; border-bottom:1px solid rgba(255,255,255,.035);
  cursor:default; transition:background .18s;
}
.sys-row:hover { background:rgba(255,255,255,.018); }
.sys-row:last-child { border-bottom:none; }

/* ── Timeline ── */
.tl-track { position:relative; }
.tl-track::before {
  content:''; position:absolute; left:8px; top:0; bottom:0; width:1px;
  background:linear-gradient(to bottom,transparent,rgba(255,255,255,0.08),transparent);
}
.tl-dot {
  width:17px; height:17px; border-radius:50%; flex-shrink:0;
  display:flex; align-items:center; justify-content:center;
  position:relative; z-index:1;
}
.tl-item {
  display:flex; gap:18px; padding:14px 0; align-items:flex-start;
  animation:slideRight .4s var(--ez) both;
}

/* ── QA card enhanced ── */
.qa-plus {
  position:relative; overflow:hidden; cursor:pointer;
  padding:24px 18px 20px; background:var(--s2);
  border:1px solid var(--e1); transition:all .25s var(--ez);
  display:flex; flex-direction:column; gap:0;
}
.qa-plus:hover {
  background:var(--s3); border-color:var(--e2);
  transform:translateY(-2px);
  box-shadow:0 8px 28px rgba(0,0,0,0.35);
}
.qa-plus .qa-ico {
  margin-bottom:16px; transition:transform .3s var(--ez), color .3s;
}
.qa-plus:hover .qa-ico { transform:scale(1.12); }
.qa-plus::after {
  content:''; position:absolute; bottom:0; left:0; right:0; height:1.5px;
  background:var(--qa-color,rgba(255,255,255,.07));
  transform:scaleX(0); transition:transform .35s var(--ez); transform-origin:left;
}
.qa-plus:hover::after { transform:scaleX(1); }

/* ── Score ring ── */
.score-ring { filter:drop-shadow(0 0 12px var(--ring-glow,rgba(45,184,122,0.15))); }

/* ── Hero scan line ── */
.hero-scanline {
  position:absolute; left:0; right:0; height:1px; pointer-events:none;
  background:linear-gradient(90deg,transparent 0%,rgba(58,127,208,0.25) 30%,rgba(58,127,208,0.5) 50%,rgba(58,127,208,0.25) 70%,transparent 100%);
  animation:scanH 5s ease-in-out infinite; z-index:3;
}

/* ── Weather pill ── */
.wx-pill {
  display:flex; align-items:center; gap:8px; padding:8px 14px;
  background:rgba(5,6,9,0.75); border:1px solid rgba(255,255,255,0.08);
  backdrop-filter:blur(16px); transition:border-color .25s;
  border-radius:1px;
}
.wx-pill:hover { border-color:rgba(255,255,255,0.16); }

/* ── Clock ── */
.clock-hand {
  transform-origin:50% 100%;
  transition:transform 0.5s cubic-bezier(0.4,2.08,0.55,0.44);
}
`;

/* ══════════════════════════════════════════════════════════════
   PRIMITIVOS COMPARTIDOS
   ══════════════════════════════════════════════════════════════ */

/** Contador animado: cuenta de 0 → target en `ms` ms */
function AnimCount({ value, decimals = 0, ms = 1400, suffix = "" }) {
  const [v, setV] = useState(0);
  const raf = useRef(null);
  useEffect(() => {
    let start = null;
    const target = Number(value) || 0;
    const tick = (ts) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / ms, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(parseFloat((eased * target).toFixed(decimals)));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value, ms, decimals]);
  return <>{v.toFixed(decimals)}{suffix}</>;
}

/** Gauge circular SVG tipo instrumento náutico */
function ArcGauge({
  value, max = 100, label, unit = "%",
  color = "var(--ok)", warn = 30, critical = 15,
  size = 130, strokeW = 4, showTicks = false,
}) {
  const pct = Math.min(Math.max(value / max, 0), 1);
  const r = (size / 2) - strokeW - 4;
  const cx = size / 2, cy = size / 2;
  const C = 2 * Math.PI * r;
  const ARC = C * 0.75;          // 270° arc
  const fillLen = ARC * pct;

  const autoColor = (() => {
    const p = pct * 100;
    if (p <= critical) return "var(--err)";
    if (p <= warn)     return "var(--warn)";
    return color;
  })();

  const glowColor = (() => {
    const p = pct * 100;
    if (p <= critical) return "rgba(192,72,72,0.25)";
    if (p <= warn)     return "rgba(212,137,42,0.2)";
    return "rgba(45,184,122,0.15)";
  })();

  // Tick marks at 0%, 25%, 50%, 75%, 100%
  const ticks = showTicks ? [0, 0.25, 0.5, 0.75, 1].map(t => {
    const angle = (135 + t * 270) * (Math.PI / 180);
    const innerR = r - strokeW - 2;
    const outerR = r + strokeW + 1;
    return {
      x1: cx + Math.cos(angle) * innerR,
      y1: cy + Math.sin(angle) * innerR,
      x2: cx + Math.cos(angle) * outerR,
      y2: cy + Math.sin(angle) * outerR,
    };
  }) : [];

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size}
        style={{ filter: `drop-shadow(0 0 10px ${glowColor})`, overflow: "visible" }}>

        {/* Outer subtle ring */}
        <circle cx={cx} cy={cy} r={r + strokeW + 3}
          fill="none" stroke="rgba(255,255,255,0.025)" strokeWidth={1} />

        {/* Track */}
        <circle cx={cx} cy={cy} r={r}
          fill="none"
          stroke="rgba(255,255,255,0.055)"
          strokeWidth={strokeW}
          strokeDasharray={`${ARC} ${C - ARC}`}
          strokeLinecap="butt"
          style={{ transform: `rotate(135deg)`, transformOrigin: `${cx}px ${cy}px` }}
        />

        {/* Tick marks */}
        {ticks.map((t, i) => (
          <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
            stroke="rgba(255,255,255,0.1)" strokeWidth={1} />
        ))}

        {/* Fill — animated via CSS */}
        <circle cx={cx} cy={cy} r={r}
          fill="none"
          stroke={autoColor}
          strokeWidth={strokeW}
          strokeLinecap="round"
          strokeDasharray={`${ARC} ${C - ARC}`}
          strokeDashoffset={ARC - fillLen}
          style={{
            transform: `rotate(135deg)`,
            transformOrigin: `${cx}px ${cy}px`,
            transition: "stroke-dashoffset 1.6s cubic-bezier(0.22,1,0.36,1), stroke 0.5s",
          }}
        />

        {/* Center glow dot */}
        <circle cx={cx} cy={cy} r={3}
          fill={autoColor}
          opacity={0.5}
          style={{ filter: `blur(2px)` }}
        />
      </svg>

      {/* Center text */}
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        pointerEvents: "none",
      }}>
        <span style={{
          fontFamily: "var(--font-mono)",
          fontSize: size < 120 ? 18 : 22,
          fontWeight: 400,
          color: autoColor,
          lineHeight: 1,
          letterSpacing: "-.02em",
        }}>
          <AnimCount value={value} decimals={0} ms={1400} />
        </span>
        <span style={{
          fontFamily: "var(--font-mono)",
          fontSize: 8,
          color: "var(--t3)",
          letterSpacing: ".12em",
          marginTop: 3,
        }}>
          {unit}
        </span>
      </div>
    </div>
  );
}

/** Reloj náutico SVG */
function NauticalClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const s = time.getSeconds();
  const m = time.getMinutes() + s / 60;
  const h = (time.getHours() % 12) + m / 60;

  const handStyle = (deg) => ({
    position: "absolute",
    bottom: "50%",
    left: "50%",
    transformOrigin: "50% 100%",
    transform: `translateX(-50%) rotate(${deg}deg)`,
    transition: "transform 0.4s cubic-bezier(0.4,2.08,0.55,0.44)",
  });

  const cx = 52, r = 44;
  const ticks = Array.from({ length: 12 }, (_, i) => {
    const angle = (i * 30 - 90) * (Math.PI / 180);
    return {
      x1: cx + Math.cos(angle) * (r - 5),
      y1: cx + Math.sin(angle) * (r - 5),
      x2: cx + Math.cos(angle) * (r - (i % 3 === 0 ? 12 : 7)),
      y2: cx + Math.sin(angle) * (r - (i % 3 === 0 ? 12 : 7)),
    };
  });

  return (
    <div style={{ position: "relative", width: 104, height: 104, flexShrink: 0 }}>
      <svg width={104} height={104}>
        {/* Outer ring */}
        <circle cx={cx} cy={cx} r={r + 4} fill="none"
          stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
        {/* Face */}
        <circle cx={cx} cy={cx} r={r} fill="rgba(255,255,255,0.015)"
          stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
        {/* Inner ring */}
        <circle cx={cx} cy={cx} r={r - 8} fill="none"
          stroke="rgba(255,255,255,0.03)" strokeWidth={1} />
        {/* Tick marks */}
        {ticks.map((t, i) => (
          <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
            stroke={i % 3 === 0 ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.1)"}
            strokeWidth={i % 3 === 0 ? 1.5 : 1} />
        ))}
        {/* Glow center */}
        <circle cx={cx} cy={cx} r={2.5}
          fill="rgba(58,127,208,0.8)"
          style={{ filter: "blur(1px)" }} />
      </svg>

      {/* Hour hand */}
      <div style={{
        ...handStyle(h * 30),
        width: 2, height: 26,
        background: "rgba(255,255,255,0.7)",
        borderRadius: "2px 2px 0 0",
      }} />
      {/* Minute hand */}
      <div style={{
        ...handStyle(m * 6),
        width: 1.5, height: 34,
        background: "rgba(255,255,255,0.5)",
        borderRadius: "2px 2px 0 0",
      }} />
      {/* Second hand */}
      <div style={{
        ...handStyle(s * 6),
        width: 1, height: 38,
        background: "rgba(58,127,208,0.9)",
        borderRadius: "2px 2px 0 0",
      }} />
      {/* Cap */}
      <div style={{
        position: "absolute",
        top: "50%", left: "50%",
        transform: "translate(-50%,-50%)",
        width: 5, height: 5, borderRadius: "50%",
        background: "rgba(58,127,208,0.9)",
        zIndex: 10,
      }} />
    </div>
  );
}

/** Indicador de estado de sistema */
function SysIndicator({ status }) {
  const map = {
    ok:      { color: "var(--ok)",   label: "NOMINAL",   glow: "rgba(45,184,122,0.4)"  },
    warn:    { color: "var(--warn)", label: "ATENCIÓN",  glow: "rgba(212,137,42,0.4)"  },
    err:     { color: "var(--err)",  label: "FALLA",     glow: "rgba(192,72,72,0.4)"   },
    service: { color: "var(--info)", label: "SERVICE",   glow: "rgba(58,127,208,0.4)"  },
    off:     { color: "var(--t3)",   label: "APAGADO",   glow: "rgba(100,100,100,0.2)" },
  };
  const m = map[status] || map.ok;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{
        width: 6, height: 6, borderRadius: "50%",
        background: m.color,
        boxShadow: `0 0 6px ${m.glow}`,
        flexShrink: 0,
        animation: status === "ok" ? "pulse 2.8s ease-in-out infinite" :
                   status === "err" ? "pulse 0.8s ease-in-out infinite" : "none",
      }} />
      <span style={{
        fontFamily: "var(--font-mono)",
        fontSize: 7.5, letterSpacing: ".14em",
        color: m.color, textTransform: "uppercase",
      }}>
        {m.label}
      </span>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   CAP / LBL helpers (duplicate-safe)
   ══════════════════════════════════════════════════════════════ */
function Cap({ children, style: st = {}, sm }) {
  return (
    <span style={{
      fontFamily: "var(--font-nm)", fontSize: sm ? 8 : 9,
      letterSpacing: ".2em", textTransform: "uppercase",
      fontWeight: 600, color: "var(--t3)", ...st,
    }}>
      {children}
    </span>
  );
}

/* ══════════════════════════════════════════════════════════════
   SEC BIENVENIDA PLUS — reemplaza SecBienvenida
   ══════════════════════════════════════════════════════════════ */
export function SecBienvenidaPlus({ cliente, mc, goTo }) {
  const [wx, setWx] = useState(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const get = async (lat, lon) => {
      try {
        const r = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,wind_speed_10m,wind_direction_10m,weather_code&hourly=wave_height&timezone=auto&forecast_days=1`
        );
        const d = await r.json();
        const dirs = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
        const waveH = d.hourly?.wave_height?.[0] ?? null;
        setWx({
          t: Math.round(d.current.temperature_2m),
          w: Math.round(d.current.wind_speed_10m),
          dir: dirs[Math.round(d.current.wind_direction_10m / 45) % 8],
          wave: waveH !== null ? waveH.toFixed(1) : "—",
          code: d.current.weather_code,
        });
      } catch { setWx({ t: "—", w: "—", dir: "—", wave: "—", code: 0 }); }
    };
    if (navigator.geolocation)
      navigator.geolocation.getCurrentPosition(
        p => get(p.coords.latitude, p.coords.longitude),
        () => get(-34.425, -58.544)
      );
    else get(-34.425, -58.544);
  }, []);

  const img = cliente?.imagen_unidad ||
    "https://images.unsplash.com/photo-1567899378494-47b22a2ae96a?w=1800&q=90";
  const name = (cliente?.nombre_completo || "").split(" ")[0];
  const hull = [cliente?.nombre_barco, cliente?.numero_unidad].filter(Boolean).join("  ·  ");
  const timeStr = time.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const dateStr = time.toLocaleDateString("es-AR", { weekday: "long", day: "2-digit", month: "long" });

  const QA = [
    { n: "01", t: "Energía",    d: "Tableros · 12V · 220V",       s: "energia",    ico: <Zap size={15} />,          color: "var(--info)"  },
    { n: "02", t: "Propulsión", d: "Motores · Maniobra",           s: "propulsion", ico: <Gauge size={15} />,        color: "var(--warn)"  },
    { n: "03", t: "Sistemas",   d: "Tanques · Bombas",             s: "sistemas",   ico: <Settings size={15} />,     color: "#7a5fc0"      },
    { n: "04", t: "Seguridad",  d: "Emergencia · Diagnóstico",     s: "seguridad",  ico: <Shield size={15} />,       color: "var(--err)"   },
    { n: "05", t: "Videoteca",  d: "Procedimientos técnicos",      s: "tutoriales", ico: <Play size={15} />,         color: "var(--ok)"    },
    { n: "06", t: "Soporte",    d: "Reportar una novedad",         s: "soporte",    ico: <MessageSquare size={15} />, color: "var(--t2)"   },
  ];

  return (
    <div>
      {/* ── HERO ──────────────────────────────────────────────── */}
      <div style={{
        position: "relative", width: "100%",
        height: "min(76vh,600px)", overflow: "hidden",
      }}>
        <img src={img} onLoad={() => setImgLoaded(true)} alt=""
          style={{
            position: "absolute", inset: 0, width: "100%", height: "100%",
            objectFit: "cover", objectPosition: "center 35%",
            animation: imgLoaded ? "heroKen 18s ease-out both" : "none",
            opacity: imgLoaded ? 1 : 0,
            transition: "opacity 1s",
          }}
        />

        {/* Color grade */}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(120deg,rgba(3,3,4,.92) 0%,rgba(3,3,4,.5) 42%,rgba(3,3,4,.18) 100%)" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top,rgba(3,3,4,1) 0%,rgba(3,3,4,.45) 22%,transparent 50%)" }} />
        {/* Blue vignette */}
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 60% 50% at 100% 0%,rgba(58,127,208,0.07),transparent 60%)" }} />

        {/* Scan line */}
        <div className="hero-scanline" style={{ top: 0 }} />

        {/* HUD grid overlay — subtle */}
        <div style={{
          position: "absolute", inset: 0, opacity: .028, pointerEvents: "none",
          backgroundImage: "linear-gradient(rgba(58,127,208,1) 1px,transparent 1px),linear-gradient(90deg,rgba(58,127,208,1) 1px,transparent 1px)",
          backgroundSize: "48px 48px",
        }} />

        {/* ── TOP RIGHT: weather + clock ── */}
        <div style={{
          position: "absolute",
          top: "clamp(14px,3vw,28px)",
          right: "clamp(14px,3.5vw,34px)",
          display: "flex", flexDirection: "column", gap: 6,
          alignItems: "flex-end",
          animation: "fin 1s .5s both",
        }}>
          {/* Clock pill */}
          <div className="wx-pill">
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--ok)", animation: "pulse 2s ease-in-out infinite", flexShrink: 0 }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--t1)", letterSpacing: ".16em" }}>{timeStr}</span>
          </div>
          {/* Weather pill */}
          {wx && (
            <div className="wx-pill" style={{ gap: 10 }}>
              <Thermometer size={9} color="var(--t3)" />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--t1)", letterSpacing: ".1em" }}>{wx.t}°C</span>
              <span style={{ width: 1, height: 10, background: "rgba(255,255,255,0.1)" }} />
              <Wind size={9} color="var(--t3)" />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--t2)", letterSpacing: ".08em" }}>{wx.dir} {wx.w} KM/H</span>
              {wx.wave !== "—" && (
                <>
                  <span style={{ width: 1, height: 10, background: "rgba(255,255,255,0.1)" }} />
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--t2)", letterSpacing: ".08em" }}>OLA {wx.wave} M</span>
                </>
              )}
            </div>
          )}
          {/* Date pill */}
          <div style={{ padding: "4px 10px" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "rgba(255,255,255,0.2)", letterSpacing: ".12em", textTransform: "uppercase" }}>
              {dateStr}
            </span>
          </div>
        </div>

        {/* ── BOTTOM LEFT: hero text ── */}
        <div style={{
          position: "absolute",
          bottom: "clamp(80px,10vw,110px)",
          left: "clamp(24px,5vw,56px)",
          maxWidth: 560,
        }}>
          <div style={{ marginBottom: 12, animation: "fup .7s .06s var(--ez) both" }}>
            <Cap style={{ letterSpacing: ".28em" }}>{cliente?.modelo_barco}</Cap>
          </div>
          <div style={{ animation: "fup .8s .14s var(--ez) both" }}>
            <h1 style={{
              fontFamily: "var(--font-nm)", fontWeight: 200,
              fontSize: "clamp(44px,8vw,90px)", color: "var(--white)",
              lineHeight: .88, letterSpacing: "-.042em",
            }}>
              {name}
            </h1>
          </div>
          {hull && (
            <div style={{ marginTop: 16, animation: "fup .8s .24s var(--ez) both" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "rgba(255,255,255,0.38)", letterSpacing: ".14em" }}>
                {hull}
              </span>
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 26, animation: "fup .8s .34s var(--ez) both", flexWrap: "wrap" }}>
            <button onClick={() => goTo("soporte")}
              style={{ padding: "12px 28px", background: "var(--white)", color: "#030304", border: "none", fontFamily: "var(--font-nm)", fontWeight: 600, fontSize: 9, letterSpacing: ".2em", textTransform: "uppercase", cursor: "pointer", borderRadius: 1, transition: "opacity .2s,transform .2s" }}
              onMouseEnter={e => { e.currentTarget.style.opacity = ".88"; e.currentTarget.style.transform = "translateY(-1px)"; }}
              onMouseLeave={e => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.transform = "translateY(0)"; }}>
              Reportar Falla
            </button>
            <button onClick={() => goTo("estado")}
              style={{ padding: "12px 24px", background: "rgba(58,127,208,0.12)", color: "rgba(58,127,208,0.9)", border: "1px solid rgba(58,127,208,0.3)", fontFamily: "var(--font-nm)", fontWeight: 500, fontSize: 9, letterSpacing: ".2em", textTransform: "uppercase", cursor: "pointer", borderRadius: 1, transition: "all .2s", backdropFilter: "blur(8px)" }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(58,127,208,0.2)"; e.currentTarget.style.borderColor = "rgba(58,127,208,0.5)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "rgba(58,127,208,0.12)"; e.currentTarget.style.borderColor = "rgba(58,127,208,0.3)"; }}>
              Estado de la Unidad
            </button>
          </div>
        </div>

        {/* Bottom rule */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 1, background: "linear-gradient(90deg,rgba(255,255,255,0.14),rgba(255,255,255,0.04),transparent 70%)" }} />
      </div>

      {/* ── VITALS STRIP ─────────────────────────────────────────── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))",
        borderBottom: "1px solid var(--e1)",
        background: "rgba(5,5,8,0.95)",
        animation: "fup .5s .3s var(--ez) both",
      }}>
        {[
          { label: "Combustible", value: mc?.combustible || "1200", unit: "L cap.", color: "var(--warn)",  icon: <Droplets size={10} /> },
          { label: "Agua Potable", value: mc?.agua || "400",        unit: "L cap.", color: "var(--info)",  icon: <Droplets size={10} /> },
          { label: "Temperatura",  value: wx ? `${wx.t}°C` : "—",   unit: "exterior", color: "var(--t2)", icon: <Thermometer size={10} /> },
          { label: "Viento",       value: wx ? `${wx.w}` : "—",      unit: "km/h",    color: "var(--t2)", icon: <Wind size={10} /> },
          { label: "Oleaje",       value: wx?.wave || "—",           unit: "metros",  color: "var(--t2)", icon: <Activity size={10} /> },
          { label: "Hora Local",   value: timeStr.slice(0, 5),       unit: "ARG",     color: "rgba(58,127,208,0.8)", icon: <Clock size={10} /> },
        ].map(v => (
          <div key={v.label} className="vital-item"
            style={{ "--vital-color": v.color }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--t3)" }}>
              {v.icon}
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 7.5, color: "var(--t3)", letterSpacing: ".1em", textTransform: "uppercase" }}>
                {v.label}
              </span>
            </div>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 400, color: v.color, letterSpacing: "-.01em", lineHeight: 1 }}>
              {v.value}
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 7.5, color: "var(--t3)", letterSpacing: ".08em" }}>
              {v.unit}
            </span>
          </div>
        ))}
      </div>

      {/* ── QUICK ACCESS — enhanced ──────────────────────────────── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(6,1fr)",
        gap: 1,
        marginTop: 1,
        animation: "fup .5s .45s var(--ez) both",
      }}>
        {QA.map(a => (
          <button key={a.s} className="qa-plus"
            style={{ "--qa-color": a.color }}
            onClick={() => goTo(a.s)}>
            <div className="qa-ico" style={{ color: a.color, opacity: .7 }}>{a.ico}</div>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--t3)", marginBottom: 10, letterSpacing: ".06em", display: "block" }}>{a.n}</span>
            <span style={{ display: "block", fontFamily: "var(--font-nm)", fontSize: 9.5, fontWeight: 600, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--t2)", marginBottom: 5 }}>{a.t}</span>
            <span style={{ display: "block", fontFamily: "var(--font-nm)", fontSize: 10.5, color: "var(--t3)", fontWeight: 300 }}>{a.d}</span>
            <div style={{
              marginTop: "auto", paddingTop: 14,
              display: "flex", alignItems: "center", gap: 5,
              opacity: 0, transition: "opacity .25s",
            }}
              ref={el => el && el.parentElement && el.parentElement.addEventListener("mouseenter", () => el.style.opacity = "1")}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   SEC ESTADO — Vessel Status Dashboard
   ══════════════════════════════════════════════════════════════ */
export function SecEstado({ cliente, mc }) {
  const nombre = cliente?.nombre_barco || "—";
  const modelo = cliente?.modelo_barco || "—";

  /* Estado de sistemas — en una app real vendría de Supabase */
  const [sistemas] = useState([
    { id: "mot1",  label: "Motor Estribor",      grupo: "Propulsión",  status: "ok",      detail: "Oil OK · Temp 82°C",      hrs: "1.240 h" },
    { id: "mot2",  label: "Motor Babor",          grupo: "Propulsión",  status: "ok",      detail: "Oil OK · Temp 80°C",      hrs: "1.238 h" },
    { id: "elec",  label: "Tablero Eléctrico",    grupo: "Energía",     status: "ok",      detail: "220V estable",            hrs: null       },
    { id: "bat",   label: "Baterías de Servicio", grupo: "Energía",     status: "warn",    detail: "Batería #2: 11.9V",       hrs: null       },
    { id: "inv",   label: "Inverter",             grupo: "Energía",     status: "ok",      detail: "1.2 kW — ON",             hrs: null       },
    { id: "gen",   label: "Generador",            grupo: "Energía",     status: "ok",      detail: "Último uso: 3 días",      hrs: "420 h"    },
    { id: "bilge", label: "Bombas de Achique",    grupo: "Sistemas",    status: "ok",      detail: "Sentinas secas",          hrs: null       },
    { id: "agua",  label: "Bomba Agua Potable",   grupo: "Sistemas",    status: "ok",      detail: "Presión normal",          hrs: null       },
    { id: "bow",   label: "Hélice de Proa",       grupo: "Propulsión",  status: "service", detail: "Service en 50 h",         hrs: "980 h"    },
    { id: "casco", label: "Casco / Obra Viva",    grupo: "Estructura",  status: "ok",      detail: "Antifouling: 8 meses",    hrs: null       },
    { id: "vhf",   label: "Radio VHF",            grupo: "Comunicación", status: "ok",     detail: "Canal 16 activo",         hrs: null       },
    { id: "gps",   label: "GPS / Chartplotter",   grupo: "Navegación",  status: "ok",      detail: "Garmin GPSMAP 923xsv",    hrs: null       },
  ]);

  /* Historial de service */
  const timeline = [
    { date: "Dic 2024", label: "Service Anual Completo",     type: "done",     detail: "Motores · aceite · filtros · bombas impelentes" },
    { date: "Nov 2024", label: "Antifouling y Ánodos",       type: "done",     detail: "Varada completa · fondo pintado · ánodos nuevos" },
    { date: "Sep 2024", label: "Service Generador",          type: "done",     detail: "250 h — aceite y filtros" },
    { date: "Mar 2025", label: "Service Hélice de Proa",     type: "upcoming", detail: "Estimado: +50 h de uso" },
    { date: "Ago 2025", label: "Service Semestral",          type: "upcoming", detail: "Programado — motores + impelentes" },
    { date: "Dic 2025", label: "Service Anual",              type: "upcoming", detail: "Varada · fondo · service completo" },
  ];

  /* Métricas rápidas */
  const metrics = [
    { label: "Horas Motor Est.",   value: "1.240",  unit: "hrs",   trend: "up",  color: "var(--t1)" },
    { label: "Horas Motor Bab.",   value: "1.238",  unit: "hrs",   trend: "up",  color: "var(--t1)" },
    { label: "Días desde service", value: "87",     unit: "días",  trend: null,  color: "var(--warn)" },
    { label: "Próximo service",    value: "~50",    unit: "hrs",   trend: "down", color: "var(--info)" },
  ];

  /* Health score */
  const okCount = sistemas.filter(s => s.status === "ok").length;
  const healthPct = Math.round((okCount / sistemas.length) * 100);

  const groupColors = {
    "Propulsión":   "var(--warn)",
    "Energía":      "var(--info)",
    "Sistemas":     "var(--ok)",
    "Estructura":   "#7a5fc0",
    "Comunicación": "var(--t2)",
    "Navegación":   "rgba(58,127,208,0.8)",
  };

  const grupos = [...new Set(sistemas.map(s => s.grupo))];

  return (
    <div className="senter">
      {/* ── Header ── */}
      <div style={{ marginBottom: 36 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
          <div style={{ height: 1, width: 36, background: "linear-gradient(90deg,rgba(255,255,255,0.5),transparent)" }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "rgba(255,255,255,0.2)", letterSpacing: ".22em" }}>
            KLASE-A · VESSEL STATUS
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 20, flexWrap: "wrap" }}>
          <h1 style={{ fontFamily: "var(--font-nm)", fontWeight: 200, fontSize: "clamp(24px,3vw,38px)", color: "var(--t1)", letterSpacing: "-.025em", lineHeight: 1.05 }}>
            Estado de la Unidad
          </h1>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--t3)", letterSpacing: ".1em" }}>
            {nombre} · {modelo}
          </span>
        </div>
      </div>

      <div className="stg">

        {/* ── ROW 1: Score + Gauges ── */}
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 1, marginBottom: 1 }}>

          {/* Health Score */}
          <div style={{
            background: "var(--s2)", border: "1px solid var(--e1)",
            padding: "28px 32px",
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", gap: 14, minWidth: 200,
          }}>
            <Cap>Salud General</Cap>
            <div style={{ position: "relative" }}>
              <ArcGauge
                value={healthPct} max={100}
                label="Salud" unit="%"
                color="var(--ok)"
                warn={70} critical={50}
                size={150} strokeW={5}
                showTicks
              />
              {/* Concentric ring decoration */}
              <svg width={150} height={150}
                style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity: .15 }}>
                <circle cx={75} cy={75} r={55} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth={0.5} strokeDasharray="2 4" />
              </svg>
            </div>
            <div style={{ textAlign: "center" }}>
              <p style={{ fontFamily: "var(--font-nm)", fontSize: 12, color: "var(--t2)", fontWeight: 300, marginBottom: 4 }}>
                {okCount} de {sistemas.length} sistemas
              </p>
              <SysIndicator status={healthPct >= 90 ? "ok" : healthPct >= 70 ? "warn" : "err"} />
            </div>
          </div>

          {/* Gauges: Combustible + Agua + Baterías */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 1 }}>
            {[
              { label: "Combustible",  value: 68, max: 100, unit: "%", color: "var(--warn)", detail: `${Math.round(0.68 * (mc?.combustible || 1200))} L de ${mc?.combustible || 1200} L`, icon: <Droplets size={11} />, gcol: "rgba(212,137,42,0.12)" },
              { label: "Agua Potable", value: 55, max: 100, unit: "%", color: "var(--info)", detail: `${Math.round(0.55 * (mc?.agua || 400))} L de ${mc?.agua || 400} L`,       icon: <Droplets size={11} />, gcol: "rgba(58,127,208,0.1)"  },
              { label: "Batería Serv.", value: 78, max: 100, unit: "%", color: "var(--ok)",  detail: "12.6V · Banco principal",                                                   icon: <Battery size={11} />,  gcol: "rgba(45,184,122,0.08)" },
            ].map(g => (
              <div key={g.label} className="gauge-card"
                style={{ "--g-color": g.gcol, background: `linear-gradient(160deg,var(--s2) 60%,${g.gcol})` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 18, alignSelf: "flex-start" }}>
                  <span style={{ color: g.color, opacity: .7 }}>{g.icon}</span>
                  <Cap sm>{g.label}</Cap>
                </div>
                <ArcGauge value={g.value} max={g.max} unit={g.unit} color={g.color} size={130} strokeW={4} />
                <p style={{
                  fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--t3)",
                  letterSpacing: ".06em", marginTop: 14, textAlign: "center",
                }}>
                  {g.detail}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* ── ROW 2: Métricas + Reloj ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 1, marginBottom: 1 }}>
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 1,
          }}>
            {metrics.map(m => (
              <div key={m.label} style={{
                background: "var(--s2)", border: "1px solid var(--e1)",
                padding: "20px 18px",
                display: "flex", flexDirection: "column", gap: 6,
              }}>
                <Cap sm>{m.label}</Cap>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 26, fontWeight: 400, color: m.color, letterSpacing: "-.02em", lineHeight: 1 }}>
                    {m.value}
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--t3)" }}>{m.unit}</span>
                  {m.trend === "up" && <ArrowUp size={10} color="var(--ok)" />}
                  {m.trend === "down" && <ArrowDown size={10} color="var(--info)" />}
                </div>
              </div>
            ))}
          </div>

          {/* Reloj + Coordenadas */}
          <div style={{
            background: "var(--s2)", border: "1px solid var(--e1)",
            padding: "22px 28px",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14,
          }}>
            <NauticalClock />
            <div style={{ textAlign: "center" }}>
              <Cap sm style={{ display: "block", marginBottom: 4 }}>Última Posición</Cap>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "rgba(58,127,208,0.6)", letterSpacing: ".08em" }}>
                34°25'S · 58°32'O
              </span>
            </div>
          </div>
        </div>

        {/* ── ROW 3: Sistemas por grupo ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 1, marginBottom: 1 }}>
          {grupos.map(grupo => {
            const items = sistemas.filter(s => s.grupo === grupo);
            const allOk = items.every(s => s.status === "ok");
            return (
              <div key={grupo} style={{
                background: "var(--s2)", border: "1px solid var(--e1)",
                borderTop: `1.5px solid ${allOk ? "rgba(45,184,122,0.2)" : "rgba(212,137,42,0.3)"}`,
              }}>
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "14px 18px", borderBottom: "1px solid var(--e1)",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 2, height: 12, background: groupColors[grupo] || "var(--t3)", borderRadius: 1 }} />
                    <Cap style={{ color: groupColors[grupo] || "var(--t3)" }}>{grupo}</Cap>
                  </div>
                  <SysIndicator status={allOk ? "ok" : "warn"} />
                </div>
                <div>
                  {items.map(sys => (
                    <div key={sys.id} className="sys-row">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontFamily: "var(--font-nm)", fontSize: 12, color: "var(--t1)", fontWeight: 400, marginBottom: 2 }}>
                          {sys.label}
                        </p>
                        <p style={{ fontFamily: "var(--font-nm)", fontSize: 10.5, color: "var(--t3)", fontWeight: 300 }}>
                          {sys.detail}
                        </p>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, flexShrink: 0 }}>
                        <SysIndicator status={sys.status} />
                        {sys.hrs && (
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--t3)", letterSpacing: ".06em" }}>
                            {sys.hrs}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── ROW 4: Service Timeline ── */}
        <div style={{ background: "var(--s2)", border: "1px solid var(--e1)", padding: "28px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 24 }}>
            <Wrench size={11} color="var(--t3)" />
            <Cap>Historial y Planificación de Service</Cap>
          </div>
          <div className="tl-track">
            {timeline.map((item, i) => {
              const done = item.type === "done";
              return (
                <div key={i} className="tl-item"
                  style={{ animationDelay: `${i * 0.08}s` }}>
                  {/* Dot */}
                  <div className="tl-dot"
                    style={{
                      background: done ? "rgba(45,184,122,0.12)" : "rgba(58,127,208,0.1)",
                      border: `1px solid ${done ? "rgba(45,184,122,0.35)" : "rgba(58,127,208,0.3)"}`,
                    }}>
                    {done
                      ? <CheckCircle size={9} color="var(--ok)" />
                      : <Calendar size={9} color="var(--info)" />
                    }
                  </div>
                  {/* Content */}
                  <div style={{ flex: 1, paddingBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 3, flexWrap: "wrap" }}>
                      <span style={{ fontFamily: "var(--font-nm)", fontSize: 13, fontWeight: 400, color: done ? "var(--t1)" : "var(--t2)" }}>
                        {item.label}
                      </span>
                      <span style={{
                        fontFamily: "var(--font-mono)", fontSize: 8,
                        color: done ? "var(--ok)" : "var(--info)",
                        letterSpacing: ".1em", padding: "2px 8px",
                        background: done ? "rgba(45,184,122,0.08)" : "rgba(58,127,208,0.08)",
                        border: `1px solid ${done ? "rgba(45,184,122,0.2)" : "rgba(58,127,208,0.2)"}`,
                        borderRadius: 1,
                      }}>
                        {done ? "REALIZADO" : "PRÓXIMO"}
                      </span>
                    </div>
                    <p style={{ fontFamily: "var(--font-nm)", fontSize: 11, color: "var(--t3)", fontWeight: 300, marginBottom: 2 }}>
                      {item.detail}
                    </p>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--t3)", letterSpacing: ".08em" }}>
                      {item.date}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}
