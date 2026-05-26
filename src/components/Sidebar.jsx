import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import logoK from "@/assets/logos/logo-k.png";

// ─── SVG ICONS ────────────────────────────────────────────────────────────────
function Icon({ id, color = "currentColor", size = 14 }) {
  const p = { stroke: color, fill: "none", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" };
  const paths = {
   "/madera": <>
      <rect x="2" y="4" width="12" height="8" rx="2" {...p}/>
      <path d="M2 8h12" {...p}/>
    </>,
    "/panol": <>
      <path d="M3 7V5a5 5 0 0 1 10 0v2" {...p}/>
      <rect x="1" y="7" width="14" height="9" rx="2" {...p}/>
      <path d="M8 11v2" {...p}/>
    </>,
    "/laminacion": <>
      <path d="M1 6l7-4 7 4-7 4z" {...p}/>
      <path d="M1 11l7 4 7-4" {...p}/>
    </>,
    "/obras": <>
      <path d="M1 15s3-4 7-4 7 4 7 4" {...p}/>
      <circle cx="8" cy="7" r="3" {...p}/>
    </>,
    "/marmoleria": <>
      <path d="M8 1l7 7-7 7-7-7z" {...p}/>
      <path d="M8 5.5l2.5 2.5-2.5 2.5-2.5-2.5z" {...p}/>
    </>,
    "/muebles": <>
      <rect x="1" y="6" width="14" height="6" rx="1.5" {...p}/>
      <path d="M1 12v2M15 12v2M4 6V4M12 6V4" {...p}/>
    </>,
    "/procedimientos": <>
      <rect x="3" y="1" width="10" height="14" rx="1.5" {...p}/>
      <path d="M6 5h4M6 8h4M6 11h2.5" {...p}/>
    </>,
    "/obras-laminacion": <>
      <path d="M1 15V9L8 1l7 8v6H1z" {...p}/>
      <path d="M6 15v-5h4v5" {...p}/>
    </>,
    "/admin": <>
      <rect x="1" y="1" width="6" height="6" rx="1" {...p}/>
      <rect x="9" y="1" width="6" height="6" rx="1" {...p}/>
      <rect x="1" y="9" width="6" height="6" rx="1" {...p}/>
      <rect x="9" y="9" width="6" height="6" rx="1" {...p}/>
    </>,
    "/movimientos": <>
      <path d="M8 2v12" {...p}/>
      <path d="M5 5l3-3 3 3" {...p}/>
      <path d="M5 11l3 3 3-3" {...p}/>
    </>,
    "/pedidos": <>
      <rect x="3" y="1" width="10" height="14" rx="1.5" {...p}/>
      <path d="M6 6.5l1.5 1.5 3-3" {...p}/>
      <path d="M6 10.5h4" {...p}/>
    </>,
    "/compras": <>
      <path d="M2 3h2l1.4 7h6.8l1.4-4.5H5" {...p}/>
      <circle cx="6.2" cy="13" r="1" {...p}/>
      <circle cx="11.8" cy="13" r="1" {...p}/>
      <path d="M7 7h4" {...p}/>
    </>,
    "/configuracion": <>
      <circle cx="8" cy="8" r="2" {...p}/>
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.5 1.5M11.5 11.5L13 13M3 13l1.5-1.5M11.5 4.5L13 3" {...p}/>
    </>,
    "/calendario": <>
      <rect x="1" y="3" width="14" height="12" rx="2" {...p}/>
      <path d="M5 1v3M11 1v3M1 7h14" {...p}/>
      <path d="M4 10h2M7 10h2M10 10h2M4 13h2M7 13h2" {...p}/>
    </>,
    "/postventa": <>
      <path d="M4 8.5L6.5 11l5.5-6" {...p}/>
      <rect x="1" y="1" width="14" height="14" rx="3" {...p}/>
    </>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" style={{ display: "block", flexShrink: 0 }}>
      {paths[id] ?? <circle cx="8" cy="8" r="4" stroke={color} fill="none" strokeWidth={1.5}/>}
    </svg>
  );
}

// ─── SECTION ACCENT COLORS ────────────────────────────────────────────────────
const SC = {
  movimientos:        "#818cf8",   // indigo
  produccion:         "#60a5fa",   // blue
  instrucciones:      "#94a3b8",   // slate
  gestion_laminacion: "#34d399",   // emerald
  gestion_maderas:    "#fbbf24",   // amber
  sistema:            "#f87171",   // red
  postventa:          "#67e8f9",   // cyan
  compras:            "#f59e0b",   // amber
};

// ─── ANIMATIONS CSS ───────────────────────────────────────────────────────────
const CSS = `
  @keyframes sb-in    { from{opacity:0;transform:translateX(-14px)} to{opacity:1;transform:translateX(0)} }
  @keyframes sb-down  { from{opacity:0;transform:translateY(-8px)}  to{opacity:1;transform:translateY(0)} }
  @keyframes sb-up    { from{opacity:0;transform:translateY(8px)}   to{opacity:1;transform:translateY(0)} }
  @keyframes sb-breathe { 0%,100% { background: rgba(255,255,255,0.055); } 50% { background: rgba(255,255,255,0.09); } }
  @keyframes sb-neon { 0%,100% { opacity:.8; box-shadow: 0 0 6px var(--c)99, 0 0 16px var(--c)44; } 50% { opacity:1;  box-shadow: 0 0 14px var(--c), 0 0 28px var(--c)88, 0 0 44px var(--c)33; } }
  @keyframes sb-beat { 0%,100% { transform:scale(1); opacity:1; } 50% { transform:scale(1.8); opacity:.5; } }
  @keyframes sb-flicker { 0%,100%{opacity:1} 50%{opacity:.55} }
  @keyframes sb-online { 0%,100% { box-shadow: 0 0 4px #22c55e88; } 50% { box-shadow: 0 0 12px #22c55ecc, 0 0 24px #22c55e44; } }
  @keyframes sb-scan { 0% { top: -1px; opacity:0; } 5% { opacity:.6; } 95% { opacity:.6; } 100% { top: 100%; opacity:0; } }
  @keyframes sb-shimmer { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }

  .sb-item { position: relative; overflow: hidden; transition: color .16s, background .16s; text-decoration: none !important; }
  .sb-item.active { animation: sb-breathe 2.8s ease-in-out infinite; }
  .sb-icon { transition: transform .22s cubic-bezier(.34,1.56,.64,1); flex-shrink:0; display:flex; align-items:center; justify-content:center; }
  .sb-item:hover .sb-icon { transform: scale(1.18) translateX(1px); }
  .sb-item.active .sb-icon { animation: sb-flicker 2.8s ease-in-out infinite; }
  .sb-item.active .sb-label { animation: sb-flicker 2.8s ease-in-out infinite; }
  .sb-shine { position:absolute; inset:0; border-radius:8px; opacity:0; pointer-events:none; transition:opacity .16s; }
  .sb-item:hover .sb-shine { opacity:1; }
  .sb-bar { animation: sb-neon 2.8s ease-in-out infinite; }
  .sb-dot { animation: sb-beat 2.8s ease-in-out infinite; }
  .sb-online { animation: sb-online 3.5s ease-in-out infinite; }
  .sb-out { transition: color .18s, background .18s, border-color .18s; }
  .sb-out:hover { color: #f87171 !important; border-color: rgba(248,113,113,.3) !important; background: rgba(248,113,113,.06) !important; }
`;

// ─── COMPONENT ────────────────────────────────────────────────────────────────
export default function Sidebar({ profile, signOut }) {
  const loc    = useLocation();
  const path   = loc.pathname;
  const search = loc.search;
  
  const [hov, setHov] = useState(null);
  const [displayInfo, setDisplayInfo] = useState(""); // NUEVO: Estado para el panel inferior

  const role     = profile?.role ?? "invitado";
  const isAdmin  = !!profile?.is_admin;
  const username = profile?.username ?? "—";
  const esPanol   = role === "panol";
  const esTecnica = role === "tecnica" || role === "oficina";
  const esGestion = isAdmin || role === "admin" || esTecnica;
  const esAdmin   = isAdmin || role === "admin";
  const esCompras = role === "compras";
  const puedePedirCompras = esGestion || esPanol || esCompras;
  const comprasLabel = esCompras || esAdmin ? "Gestión de Compras" : "Pedidos";
  const comprasGroup = esCompras || esAdmin ? "Compras" : "Solicitudes";
  const initials  = username.split(" ").filter(Boolean).map(w => w[0]).slice(0, 2).join("").toUpperCase();

  // ── NAV ITEM ACTUALIZADO ──────────────────────────────────────────────────────
  const item = (href, label, c, exact = true, delay = 0, info = "") => {
    const on  = exact ? path === href : path.startsWith(href);
    const isH = hov === href;
    const col = c ?? "#a0a0a0";
    return (
      <Link
        key={href} to={href}
        className={`sb-item${on ? " active" : ""}`}
        onMouseEnter={() => { setHov(href); setDisplayInfo(info); }}
        onMouseLeave={() => { setHov(null); setDisplayInfo(""); }}
        style={{
          display: "flex", alignItems: "center", gap: 9,
          padding: "8px 16px 8px 18px", margin: "2px 8px", borderRadius: 8,
          color: on ? "#fff" : isH ? "rgba(255,255,255,.9)" : "rgba(255,255,255,.45)",
          fontSize: 11.5, letterSpacing: "0.5px", fontWeight: on ? 600 : 500,
          textTransform: "uppercase",
          background: on ? "rgba(255,255,255,.055)" : isH ? "rgba(255,255,255,.03)" : "transparent",
          animation: `sb-in .3s cubic-bezier(.22,1,.36,1) ${delay}ms both`,
        }}
      >
        <div className="sb-shine" style={{ background: `linear-gradient(90deg,${col}18,transparent 55%)` }} />
        {on && <div className="sb-bar" style={{ position: "absolute", left: 0, top: "12%", bottom: "12%", width: 2, borderRadius: "0 2px 2px 0", background: col, "--c": col }}/>}
        <span className="sb-icon" style={{ color: on ? col : isH ? `${col}` : "rgba(255,255,255,.4)" }}>
          <Icon id={href} color="currentColor" size={14} />
        </span>
        <span className="sb-label" style={{ flex: 1 }}>{label}</span>
        {on && <div className="sb-dot" style={{ width: 4, height: 4, borderRadius: "50%", flexShrink: 0, background: col, boxShadow: `0 0 8px ${col}` }}/>}
      </Link>
    );
  };

  // ── SUB ITEM ACTUALIZADO ──────────────────────────────────────────────────────
  const subItem = (href, label, qs = "", c, delay = 0, info = "") => {
    const key = `${href}${qs}`;
    const on  = path === href && (qs ? search === qs : !search);
    const isH = hov === key;
    const col = c ?? "#6b7280";
    return (
      <Link
        key={key} to={key}
        className={`sb-item${on ? " active" : ""}`}
        onMouseEnter={() => { setHov(key); setDisplayInfo(info); }}
        onMouseLeave={() => { setHov(null); setDisplayInfo(""); }}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "5px 16px 5px 42px", margin: "1px 8px", borderRadius: 7,
          color: on ? "rgba(255,255,255,.8)" : isH ? "rgba(255,255,255,.6)" : "rgba(255,255,255,.3)",
          fontSize: 10, letterSpacing: "1px", textTransform: "uppercase", fontWeight: on ? 600 : 500,
          background: on ? "rgba(255,255,255,.04)" : isH ? "rgba(255,255,255,.02)" : "transparent",
          animation: `sb-in .3s cubic-bezier(.22,1,.36,1) ${delay}ms both`,
        }}
      >
        {on && <div className="sb-bar" style={{ position: "absolute", left: 0, top: "12%", bottom: "12%", width: 2, borderRadius: "0 2px 2px 0", background: col, "--c": col }}/>}
        <div style={{ width: 3, height: 3, borderRadius: "50%", flexShrink: 0, background: on ? col : "rgba(255,255,255,.14)", boxShadow: on ? `0 0 5px ${col}` : "none", transition: "background .16s" }}/>
        <span className="sb-label">{label}</span>
      </Link>
    );
  };

  // ── GROUP & DIVIDER ─────────────────────────────────────────────────────
  const group = (label, c, delay = 0) => (
    <div key={`g${label}`} style={{ display: "flex", alignItems: "center", gap: 7, padding: "16px 20px 5px", animation: `sb-in .3s cubic-bezier(.22,1,.36,1) ${delay}ms both` }}>
      <div style={{ width: 3, height: 3, borderRadius: "50%", flexShrink: 0, background: c ? `${c}66` : "rgba(255,255,255,.18)", boxShadow: c ? `0 0 5px ${c}44` : "none" }}/>
      <span style={{ fontSize: 8.5, letterSpacing: "2.5px", color: c ? `${c}66` : "rgba(255,255,255,.2)", textTransform: "uppercase", fontWeight: 700 }}>{label}</span>
    </div>
  );

  const divider = (k) => (
    <div key={`d${k}`} style={{ height: 1, margin: "4px 20px", background: "linear-gradient(90deg,transparent,rgba(255,255,255,.05),transparent)" }}/>
  );

  return (
    <>
      <style>{CSS}</style>
      <aside style={{
        width: 280, flexShrink: 0, background: "#000", height: "100%",
        display: "flex", flexDirection: "column", borderRight: "1px solid rgba(255,255,255,.06)",
        position: "relative", overflow: "hidden", animation: "sb-in .38s cubic-bezier(.22,1,.36,1) both"
      }}>
        <div style={{ position: "absolute", left: 0, right: 0, height: 1, zIndex: 10, pointerEvents: "none", background: "linear-gradient(90deg,transparent,rgba(255,255,255,.15),transparent)", animation: "sb-scan 10s linear infinite 2s" }}/>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 180, pointerEvents: "none", background: "radial-gradient(ellipse at 35% 0%, rgba(255,255,255,.04) 0%, transparent 65%)" }}/>

        {/* BRAND ─────────────────────────────────────────────────────────── */}
        <div style={{ padding: "20px 18px 16px", borderBottom: "1px solid rgba(255,255,255,.05)", position: "relative", animation: "sb-down .42s cubic-bezier(.22,1,.36,1) .06s both" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.1)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 20px rgba(255,255,255,.04)" }}>
              <img src={logoK} alt="K" style={{ width: 15, height: 15, objectFit: "contain" }}/>
            </div>
            <div>
              <div style={{ fontWeight: 800, letterSpacing: "3.5px", fontSize: 11, lineHeight: 1, background: "linear-gradient(90deg, #fff 0%, #fff 40%, rgba(255,255,255,.45) 50%, #fff 60%, #fff 100%)", backgroundSize: "200% auto", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", animation: "sb-shimmer 4s linear infinite" }}>
                KLASE A
              </div>
              <div style={{ fontSize: 8, letterSpacing: "1.5px", color: "rgba(255,255,255,.2)", textTransform: "uppercase", marginTop: 3, fontWeight: 500 }}>
                Sistema de producción
              </div>
            </div>
          </div>
        </div>

        {/* NAV ───────────────────────────────────────────────────────────── */}
        <nav style={{ flex: 1, overflowY: "auto", paddingBottom: 8, paddingTop: 4 }}>
          {(esPanol || esGestion) && <>
            {group("Movimientos", SC.movimientos, 60)}
            {item("/panol",      "Maderas",    SC.movimientos, true, 80, "Control de stock y retiros de materiales de madera para producción.")}
            {item("/laminacion", "Laminación", SC.movimientos, true, 100, "Movimientos e insumos de resinas, fibras y consumibles generales.")}
          </>}

          {esGestion && <>
            {divider("prod")}
            {group("Producción", SC.produccion, 120)}
            {item("/obras",       "Obras",       SC.produccion, true, 140, "Gestión de tareas y seguimiento de avance de cascos en producción.")}
            {item("/marmoleria",  "Marmolería",  SC.produccion, true, 160, "Stock de materiales y cortes (ej. Dekton) para cubiertas y baños.")}
            {item("/muebles",     "Muebles",     SC.produccion, true, 180, "Producción, despiece y ensamblaje de mobiliario.")}
            {item("/calendario",  "Calendario",  SC.produccion, true, 200, "Cronograma general y planificación de fechas del astillero.")}
          </>}

          {puedePedirCompras && <>
            {divider("compras")}
            {group(comprasGroup, SC.compras, 205)}
            {item("/compras", comprasLabel, SC.compras, true, 215, "Solicitudes internas a compras con seguimiento y usuarios en copia.")}
          </>}

          {esGestion && <>
            {divider("lam")}
            {group("Gestión Laminación", SC.gestion_laminacion, 200)}
            {item("/obras-laminacion", "Por obra",   SC.gestion_laminacion, false, 220, "Detalle de materiales de laminación imputados por casco.")}
            {subItem("/laminacion", "Ingresos",    "?tab=Ingresos",    SC.gestion_laminacion, 235, "Registro de remitos y entradas de insumos de laminación.")}
            {subItem("/laminacion", "Egresos",     "?tab=Egresos",     SC.gestion_laminacion, 250, "Salida de materiales hacia los moldes y producción.")}
            {subItem("/laminacion", "Movimientos", "?tab=Movimientos", SC.gestion_laminacion, 265, "Historial completo de entradas y salidas de la nave.")}
            {subItem("/laminacion", "Pedidos",     "?tab=Pedidos",     SC.gestion_laminacion, 280, "Solicitudes internas y requerimientos a compras.")}
          </>}

          {esGestion && <>
            {divider("mad")}
            {group("Gestión Maderas", SC.gestion_maderas, 300)}
            {item("/admin",       "Inventario",  SC.gestion_maderas, true, 320, "Stock general de tableros, placas y listones de madera.")}
            {item("/movimientos", "Movimientos", SC.gestion_maderas, true, 335, "Historial de entradas y salidas del sector carpintería.")}
            {item("/pedidos",     "Pedidos",     SC.gestion_maderas, true, 350, "Gestión de solicitudes generales de materiales al pañol.")}
            {item("/madera",      "Pedidos Madera", SC.gestion_maderas, true, 365, "Requerimientos específicos de cortes y placas para muebles.")}
          </>}

          {esGestion && <>
            {divider("pv")}
            {group("Post Venta", SC.postventa, 370)}
            {item("/postventa", "Barcos Entregados", SC.postventa, true, 390, "Seguimiento de garantías y servicios realizados a clientes.")}
          </>}

          {esAdmin && <>
            {divider("sys")}
            {group("Sistema", SC.sistema, 410)}
            {item("/configuracion", "Configuración", SC.sistema, true, 430, "Ajustes globales del sistema, altas y permisos de usuarios.")}
          </>}

          {(esGestion || ["laminacion","muebles","mecanica","electricidad"].includes(role)) && <>
            {divider("ins")}
            {group("Instrucciones", SC.instrucciones, 450)}
            {item("/procedimientos", "Procedimientos", SC.instrucciones, true, 470, "Manuales, normativas y protocolos de trabajo del astillero.")}
          </>}
        </nav>

        {/* MINI DISPLAY / TOOLTIP PANEL ──────────────────────────────────── */}
        <div style={{
          height: 60, margin: "0 12px 10px 12px", padding: "8px 12px", borderRadius: 8,
          background: displayInfo ? "rgba(255,255,255,0.03)" : "transparent",
          border: displayInfo ? "1px solid rgba(255,255,255,0.08)" : "1px solid transparent",
          transition: "all 0.2s ease-in-out", display: "flex", alignItems: "center", flexShrink: 0
        }}>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.65)", lineHeight: 1.4, opacity: displayInfo ? 1 : 0, transition: "opacity 0.2s ease-in-out", pointerEvents: "none" }}>
            {displayInfo}
          </span>
        </div>

        {/* FOOTER ────────────────────────────────────────────────────────── */}
        <div style={{ borderTop: "1px solid rgba(255,255,255,.05)", padding: "12px 16px", display: "flex", alignItems: "center", gap: 10, animation: "sb-up .38s cubic-bezier(.22,1,.36,1) .12s both" }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.09)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.55)", letterSpacing: .5 }}>
            {initials || "?"}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: "#e4e4e7", letterSpacing: ".5px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 2 }}>
              {username}
            </div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <div className="sb-online" style={{ width: 5, height: 5, borderRadius: "50%", background: "#22c55e", flexShrink: 0 }}/>
              <span style={{ fontSize: 8, color: "rgba(255,255,255,.28)", letterSpacing: "1.5px", textTransform: "uppercase", fontWeight: 600 }}>{role}</span>
            </div>
          </div>
          <button type="button" onClick={signOut} title="Cerrar sesión" className="sb-out" style={{ background: "transparent", border: "1px solid rgba(255,255,255,.07)", borderRadius: 7, color: "rgba(255,255,255,.22)", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 13, flexShrink: 0 }}>
            ↪
          </button>
        </div>
      </aside>
    </>
  );
}
