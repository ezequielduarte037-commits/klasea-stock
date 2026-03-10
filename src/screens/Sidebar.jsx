import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import logoK from "../assets/logo-k.png";

const ICONS = {
  "/panol":            "⬡",
  "/laminacion":       "◈",
  "/obras":            "⬤",
  "/marmoleria":       "◆",
  "/muebles":          "▪",
  "/procedimientos":   "≡",
  "/obras-laminacion": "⬡",
  "/admin":            "▤",
  "/movimientos":      "⇅",
  "/pedidos":          "⊕",
  "/configuracion":    "⚙",
  "/postventa":        "⊙",
};

const SC = {
  movimientos:        "#a78bfa",
  produccion:         "#60a5fa",
  instrucciones:      "#94a3b8",
  gestion_laminacion: "#34d399",
  gestion_maderas:    "#fbbf24",
  sistema:            "#f87171",
  postventa:          "#67e8f9",
};

const CSS = `
  @keyframes sb-slide-in {
    from { opacity:0; transform:translateX(-10px); }
    to   { opacity:1; transform:translateX(0); }
  }
  @keyframes sb-brand-down {
    from { opacity:0; transform:translateY(-6px); }
    to   { opacity:1; transform:translateY(0); }
  }
  @keyframes sb-footer-up {
    from { opacity:0; transform:translateY(8px); }
    to   { opacity:1; transform:translateY(0); }
  }

  /* ── ACTIVE ITEM: titilando ── */
  @keyframes sb-active-bg {
    0%,100% { background: rgba(255,255,255,0.06); }
    50%      { background: rgba(255,255,255,0.11); }
  }
  @keyframes sb-active-bar {
    0%,100% { opacity:1;   box-shadow: var(--bar-glow-lo); }
    50%      { opacity:0.6; box-shadow: var(--bar-glow-hi); }
  }
  @keyframes sb-active-dot {
    0%,100% { transform:scale(1);   opacity:1; }
    50%      { transform:scale(1.6); opacity:0.6; }
  }
  @keyframes sb-active-icon {
    0%,100% { opacity:1; }
    50%      { opacity:0.5; }
  }
  @keyframes sb-active-text {
    0%,100% { opacity:1; }
    50%      { opacity:0.75; }
  }

  /* ── ONLINE DOT ── */
  @keyframes sb-online {
    0%,100% { box-shadow:0 0 4px #22c55e; opacity:1; }
    50%      { box-shadow:0 0 12px #22c55e, 0 0 24px #22c55e44; opacity:0.8; }
  }

  .sb-aside {
    animation: sb-slide-in 0.32s cubic-bezier(.22,1,.36,1) both;
  }
  .sb-brand  { animation: sb-brand-down 0.38s cubic-bezier(.22,1,.36,1) 0.06s both; }
  .sb-footer { animation: sb-footer-up  0.38s cubic-bezier(.22,1,.36,1) 0.10s both; }

  /* item base */
  .sb-item {
    position: relative;
    overflow: hidden;
    transition: color 0.18s, background 0.18s;
  }
  /* icon bounce on hover */
  .sb-icon {
    transition: color 0.18s, transform 0.22s cubic-bezier(.34,1.56,.64,1);
    flex-shrink: 0;
  }
  .sb-item:hover .sb-icon { transform: scale(1.22); }

  /* hover shine */
  .sb-shine {
    position: absolute; inset: 0; border-radius: 8px;
    opacity: 0; pointer-events: none;
    transition: opacity 0.18s;
  }
  .sb-item:hover .sb-shine { opacity: 1; }

  /* active item: background pulse */
  .sb-item.is-active {
    animation: sb-active-bg 2s ease-in-out infinite;
  }
  /* active bar */
  .sb-active-bar {
    animation: sb-active-bar 2s ease-in-out infinite;
  }
  /* active dot */
  .sb-active-dot {
    animation: sb-active-dot 2s ease-in-out infinite;
  }
  /* active icon flicker */
  .sb-item.is-active .sb-icon {
    animation: sb-active-icon 2s ease-in-out infinite;
  }
  /* active label flicker */
  .sb-item.is-active .sb-label {
    animation: sb-active-text 2s ease-in-out infinite;
  }

  .sb-online { animation: sb-online 3s ease-in-out infinite; }

  /* sign-out hover */
  .sb-out { transition: color .18s, background .18s, border-color .18s; }
  .sb-out:hover {
    color: #f87171 !important;
    border-color: rgba(248,113,113,.35) !important;
    background: rgba(248,113,113,.06) !important;
  }
`;

export default function Sidebar({ profile, signOut }) {
  const loc    = useLocation();
  const path   = loc.pathname;
  const search = loc.search;
  const [hov, setHov] = useState(null);

  const role     = profile?.role ?? "invitado";
  const isAdmin  = !!profile?.is_admin;
  const username = profile?.username ?? "—";
  const esPanol   = role === "panol";
  const esGestion = isAdmin || role === "admin" || role === "oficina";
  const esAdmin   = isAdmin || role === "admin";
  const initials  = username.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();

  // ── NAV ITEM ─────────────────────────────────────────────────
  const item = (href, label, c, exact = true, delay = 0) => {
    const on  = exact ? path === href : path.startsWith(href);
    const isH = hov === href;
    const col = c ?? "#a0a0a0";
    return (
      <Link
        key={href}
        to={href}
        className={`sb-item${on ? " is-active" : ""}`}
        onMouseEnter={() => setHov(href)}
        onMouseLeave={() => setHov(null)}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "8px 16px 8px 20px", margin: "1px 8px", borderRadius: 8,
          color: on ? "#ffffff" : isH ? "#d4d4d8" : "#6b7280",
          fontSize: 11, letterSpacing: "1.2px",
          fontWeight: on ? 600 : 400, textTransform: "uppercase", textDecoration: "none",
          background: on ? "rgba(255,255,255,.07)" : isH ? "rgba(255,255,255,.04)" : "transparent",
          animation: `sb-slide-in .3s cubic-bezier(.22,1,.36,1) ${delay}ms both`,
        }}
      >
        {/* hover shine */}
        <div className="sb-shine" style={{ background: `linear-gradient(90deg,${col}14,transparent 60%)` }} />

        {/* active side bar */}
        {on && (
          <div
            className="sb-active-bar"
            style={{
              position: "absolute", left: 0, top: "15%", bottom: "15%",
              width: 2, borderRadius: "0 2px 2px 0",
              background: col,
              "--bar-glow-lo": `0 0 8px ${col}70`,
              "--bar-glow-hi": `0 0 18px ${col}cc, 0 0 32px ${col}44`,
            }}
          />
        )}

        {/* icon */}
        <span className="sb-icon" style={{
          fontSize: 10, width: 14, textAlign: "center", position: "relative",
          color: on ? col : isH ? `${col}aa` : "rgba(255,255,255,.2)",
        }}>
          {ICONS[href] ?? "·"}
        </span>

        {/* label */}
        <span className="sb-label" style={{ position: "relative" }}>{label}</span>

        {/* active dot */}
        {on && (
          <div
            className="sb-active-dot"
            style={{
              marginLeft: "auto", width: 4, height: 4, borderRadius: "50%",
              background: col, boxShadow: `0 0 6px ${col}`, flexShrink: 0,
            }}
          />
        )}
      </Link>
    );
  };

  // ── SUB ITEM ─────────────────────────────────────────────────
  const subItem = (href, label, qs = "", c, delay = 0) => {
    const key = `${href}${qs}`;
    const on  = path === href && (qs ? search === qs : !search);
    const isH = hov === key;
    const col = c ?? "#6b7280";
    return (
      <Link
        key={key}
        to={key}
        className={`sb-item${on ? " is-active" : ""}`}
        onMouseEnter={() => setHov(key)}
        onMouseLeave={() => setHov(null)}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "6px 16px 6px 44px", margin: "1px 8px", borderRadius: 7,
          color: on ? "#d4d4d8" : isH ? "#9ca3af" : "#4b5563",
          fontSize: 10, letterSpacing: "1px", textTransform: "uppercase", textDecoration: "none",
          fontWeight: on ? 600 : 400,
          background: on ? "rgba(255,255,255,.04)" : isH ? "rgba(255,255,255,.02)" : "transparent",
          animation: `sb-slide-in .3s cubic-bezier(.22,1,.36,1) ${delay}ms both`,
          transition: "color .18s, background .18s",
        }}
      >
        <div style={{
          width: 3, height: 3, borderRadius: "50%", flexShrink: 0,
          background: on ? col : "rgba(255,255,255,.15)",
          transition: "background .18s",
        }} />
        <span className="sb-label">{label}</span>
      </Link>
    );
  };

  // ── GROUP HEADER ──────────────────────────────────────────────
  const group = (label, c, delay = 0) => (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "18px 20px 6px",
      animation: `sb-slide-in .3s cubic-bezier(.22,1,.36,1) ${delay}ms both`,
    }}>
      <div style={{
        width: 3, height: 3, borderRadius: "50%", flexShrink: 0,
        background: c ?? "rgba(255,255,255,.25)",
        boxShadow: c ? `0 0 6px ${c}88` : "none",
      }} />
      <span style={{
        fontSize: 9, letterSpacing: "2.5px",
        color: c ? `${c}bb` : "rgba(255,255,255,.25)",
        textTransform: "uppercase", fontWeight: 700,
      }}>
        {label}
      </span>
    </div>
  );

  const divider = () => (
    <div style={{
      height: 1, margin: "6px 20px",
      background: "linear-gradient(90deg,transparent,rgba(255,255,255,.06),transparent)",
    }} />
  );

  return (
    <>
      <style>{CSS}</style>
      <aside className="sb-aside" style={{
        background: "#000", height: "100%", display: "flex", flexDirection: "column",
        borderRight: "1px solid rgba(255,255,255,.07)", position: "relative",
      }}>
        {/* top glow */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 120, pointerEvents: "none",
          background: "radial-gradient(ellipse at 30% 0%, rgba(255,255,255,.05) 0%, transparent 70%)",
        }} />

        {/* BRAND */}
        <div className="sb-brand" style={{
          padding: "22px 20px 18px",
          borderBottom: "1px solid rgba(255,255,255,.06)",
          position: "relative",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 7,
              background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              <img src={logoK} alt="K" style={{ width: 14, height: 14, objectFit: "contain" }} />
            </div>
            <div>
              <div style={{ fontWeight: 800, letterSpacing: "3px", color: "#fff", fontSize: 11, lineHeight: 1 }}>KLASE A</div>
              <div style={{ fontSize: 8, letterSpacing: "1.5px", color: "rgba(255,255,255,.25)", textTransform: "uppercase", marginTop: 3, fontWeight: 500 }}>
                Sistema de producción
              </div>
            </div>
          </div>
        </div>

        {/* NAV */}
        <nav style={{ flex: 1, overflowY: "auto", paddingBottom: 8, paddingTop: 4 }}>

          {/* 1 · MOVIMIENTOS */}
          {(esPanol || esGestion) && <>
            {group("Movimientos", SC.movimientos, 60)}
            {item("/panol",      "Maderas",    SC.movimientos, true, 80)}
            {item("/laminacion", "Laminación", SC.movimientos, true, 100)}
          </>}

          {/* 2 · PRODUCCIÓN */}
          {esGestion && <>
            {divider()}
            {group("Producción", SC.produccion, 120)}
            {item("/obras",      "Obras",      SC.produccion, true, 140)}
            {item("/marmoleria", "Marmolería", SC.produccion, true, 160)}
            {item("/muebles",    "Muebles",    SC.produccion, true, 180)}
          </>}

          {/* 3 · GESTIÓN LAMINACIÓN */}
          {esGestion && <>
            {divider()}
            {group("Gestión Laminación", SC.gestion_laminacion, 200)}
            {item("/obras-laminacion", "Por obra",   SC.gestion_laminacion, false, 220)}
            {subItem("/laminacion", "Ingresos",    "?tab=Ingresos",    SC.gestion_laminacion, 235)}
            {subItem("/laminacion", "Egresos",     "?tab=Egresos",     SC.gestion_laminacion, 250)}
            {subItem("/laminacion", "Movimientos", "?tab=Movimientos", SC.gestion_laminacion, 265)}
            {subItem("/laminacion", "Pedidos",     "?tab=Pedidos",     SC.gestion_laminacion, 280)}
          </>}

          {/* 4 · GESTIÓN MADERAS */}
          {esGestion && <>
            {divider()}
            {group("Gestión Maderas", SC.gestion_maderas, 300)}
            {item("/admin",       "Inventario",  SC.gestion_maderas, true, 320)}
            {item("/movimientos", "Movimientos", SC.gestion_maderas, true, 335)}
            {item("/pedidos",     "Pedidos",     SC.gestion_maderas, true, 350)}
          </>}

          {/* 5 · POST VENTA */}
          {esGestion && <>
            {divider()}
            {group("Post Venta", SC.postventa, 370)}
            {item("/postventa", "Barcos Entregados", SC.postventa, true, 390)}
          </>}

          {/* 6 · SISTEMA */}
          {esAdmin && <>
            {divider()}
            {group("Sistema", SC.sistema, 410)}
            {item("/configuracion", "Configuración", SC.sistema, true, 430)}
          </>}

          {/* 7 · INSTRUCCIONES — siempre al fondo */}
          <>
            {divider()}
            {group("Instrucciones", SC.instrucciones, 450)}
            {item("/procedimientos", "Procedimientos", SC.instrucciones, true, 470)}
          </>

        </nav>

        {/* PIE */}
        <div className="sb-footer" style={{
          borderTop: "1px solid rgba(255,255,255,.06)",
          padding: "14px 16px", display: "flex", alignItems: "center", gap: 10,
        }}>
          <div style={{
            width: 30, height: 30, borderRadius: 8,
            background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.1)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.6)", letterSpacing: .5, flexShrink: 0,
          }}>
            {initials || "?"}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 11, color: "#e4e4e7", letterSpacing: ".5px", fontWeight: 600,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 2,
            }}>
              {username}
            </div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <div className="sb-online" style={{ width: 4, height: 4, borderRadius: "50%", background: "#22c55e", flexShrink: 0 }} />
              <span style={{ fontSize: 8, color: "rgba(255,255,255,.3)", letterSpacing: "1.5px", textTransform: "uppercase", fontWeight: 600 }}>
                {role}
              </span>
            </div>
          </div>

          <button type="button" onClick={signOut} title="Cerrar sesión" className="sb-out"
            style={{
              background: "transparent", border: "1px solid rgba(255,255,255,.08)",
              borderRadius: 7, color: "rgba(255,255,255,.25)",
              width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", fontSize: 12, flexShrink: 0,
            }}>
            ↪
          </button>
        </div>

      </aside>
    </>
  );
}
