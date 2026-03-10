import { useMemo, useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
//  AvisosCompraView v2 — "Procurement Ops Center"
//  Arquitectura: Inbox de Compras con bandas de urgencia (VENCIDO / HOY / PRÓXIMO / RESUELTO)
//  Filosofía: El usuario entra a ver QUÉ hay que comprar AHORA. Nada más.
//  Estética: Titanium HMI — oscuro, alto contraste, densidad controlada
// ─────────────────────────────────────────────────────────────────────────────

const GFONTS = `@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@300;400;500;600&display=swap');`;

const D = {
  bg:      "#07070D",
  panel:   "#0C0C14",
  card:    "#10101A",
  cardHov: "#14141F",
  input:   "#1A1A28",
  line:    "rgba(255,255,255,0.05)",
  line2:   "rgba(255,255,255,0.09)",
  line3:   "rgba(255,255,255,0.14)",

  t1: "#F0F0FA",
  t2: "#7A7A96",
  t3: "#3A3A52",

  // Rojo — vencido (único acento cromático real)
  rd:   "#E84040",
  rdBg: "rgba(232,64,64,0.07)",
  rdBd: "rgba(232,64,64,0.22)",

  // Blanco atenuado — urgente/hoy (sin color, alto contraste)
  am:   "#D0D0E8",
  amBg: "rgba(208,208,232,0.05)",
  amBd: "rgba(208,208,232,0.18)",

  // Gris medio — próximo (casi invisible, solo estructura)
  or:   "#8888A8",
  orBg: "rgba(136,136,168,0.04)",
  orBd: "rgba(136,136,168,0.14)",

  // Gris oscuro — futuro
  bl:   "#555570",
  blBg: "transparent",
  blBd: "rgba(255,255,255,0.07)",

  // Verde apagado — resuelto
  gr:   "#4A9B6A",
  grBg: "rgba(74,155,106,0.06)",
  grBd: "rgba(74,155,106,0.16)",

  sans: "'IBM Plex Sans', system-ui, sans-serif",
  mono: "'IBM Plex Mono', 'Courier New', monospace",
};

// ─── UTILS ───────────────────────────────────────────────────────────────────
const num = v => { const n = Number(v); return isFinite(n) ? n : 0; };
const rd  = v => Math.round(num(v));

const fmtCorto = d =>
  d ? new Date(d + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "short" }) : "—";

const fmtMedio = d =>
  d ? new Date(d + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—";

function fechaOffset(inicio, diasOffset) {
  if (!inicio || typeof inicio !== "string") return null;
  const base = inicio.slice(0, 10);
  const parsed = new Date(base + "T12:00:00");
  if (isNaN(parsed.getTime())) return null;
  const dias = Number(diasOffset);
  if (!isFinite(dias)) return base;
  parsed.setDate(parsed.getDate() + dias);
  return parsed.toISOString().slice(0, 10);
}

// banda: "vencido" | "hoy" | "urgente" | "proximo" | "futuro" | "resuelto"
function clasificarUrgencia(fechaPedido, resuelta) {
  if (resuelta) {
    return { banda: "resuelto", label: "Resuelto", color: D.gr, bg: D.grBg, bd: D.grBd, dias: null };
  }
  if (!fechaPedido) {
    return { banda: "futuro", label: "Sin fecha", color: D.t3, bg: "transparent", bd: D.line, dias: null };
  }
  const fechaMs = new Date(fechaPedido + "T12:00:00").getTime();
  if (isNaN(fechaMs)) {
    return { banda: "futuro", label: "Sin fecha", color: D.t3, bg: "transparent", bd: D.line, dias: null };
  }
  // Usar medianoche local para evitar falsos +/-1 por zona horaria
  const hoyStr = new Date().toLocaleDateString("en-CA"); // "YYYY-MM-DD" local
  const hoyMs  = new Date(hoyStr + "T12:00:00").getTime();
  const diff   = Math.round((fechaMs - hoyMs) / 86400000);

  if (diff < 0)   return { banda: "vencido", label: `Hace ${-diff}d`, color: D.rd, bg: D.rdBg, bd: D.rdBd, dias: diff };
  if (diff === 0) return { banda: "hoy",     label: "HOY",             color: D.am, bg: D.amBg, bd: D.amBd, dias: 0   };
  if (diff <= 3)  return { banda: "urgente", label: `En ${diff}d`,     color: D.am, bg: D.amBg, bd: D.amBd, dias: diff };
  if (diff <= 14) return { banda: "proximo", label: `En ${diff}d`,     color: D.or, bg: D.orBg, bd: D.orBd, dias: diff };
  return               { banda: "futuro",  label: `En ${diff}d`,     color: D.bl, bg: D.blBg, bd: D.blBd, dias: diff };
}

function parsearItems(desc) {
  if (!desc?.trim()) return [];
  const partes = desc.split(/\s*\(\d+\)\s+/).filter(Boolean);
  return partes.length > 1
    ? partes.map(p => p.trim().replace(/\.$/, ""))
    : [desc.trim()];
}

function calcAcum(procs) {
  let acc = 0;
  return [...procs]
    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
    .map(p => {
      const diaInicio = acc;
      acc += rd(p.dias_estimados);
      return { ...p, diaInicio };
    });
}

const ORDEN_BANDAS = ["vencido", "hoy", "urgente", "proximo", "futuro", "resuelto"];

// ─── BADGE ────────────────────────────────────────────────────────────────────
function Badge({ label, color, bg, bd, size = 11 }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      fontFamily: D.mono, fontWeight: 500, fontSize: size,
      color, background: bg ?? "transparent",
      border: `1px solid ${bd ?? "transparent"}`,
      padding: "2px 7px", borderRadius: 4,
      whiteSpace: "nowrap", letterSpacing: "0.02em",
    }}>
      {label}
    </span>
  );
}

// ─── HEADER DE BANDA ─────────────────────────────────────────────────────────
const BANDA_META = {
  vencido:  { titulo: "VENCIDO",       icon: "⊘", color: D.rd, desc: "Pedidos que ya debieron hacerse" },
  hoy:      { titulo: "HOY",           icon: "◉", color: D.am, desc: "Emitir o confirmar hoy" },
  urgente:  { titulo: "PRÓX. 3 DÍAS",  icon: "◈", color: D.am, desc: "Requieren acción esta semana" },
  proximo:  { titulo: "ESTA QUINCENA", icon: "◇", color: D.or, desc: "Prever en los próximos 14 días" },
  futuro:   { titulo: "MÁS ADELANTE",  icon: "○", color: D.bl, desc: "Planificados o sin fecha asignada" },
  resuelto: { titulo: "RESUELTO",      icon: "✓", color: D.gr, desc: "Órdenes emitidas o etapas completadas" },
};

function HeaderBanda({ banda, count, abierto, onClick }) {
  const m = BANDA_META[banda];
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "8px 16px",
        background: abierto ? `${m.color}0A` : "transparent",
        border: `1px solid ${abierto ? m.color + "28" : D.line}`,
        borderRadius: 7,
        cursor: "pointer", userSelect: "none",
        marginBottom: abierto ? 0 : 4,
        borderBottomLeftRadius: abierto ? 0 : 7,
        borderBottomRightRadius: abierto ? 0 : 7,
        transition: "all .15s",
      }}
    >
      <span style={{ fontFamily: D.mono, fontSize: 13, color: m.color, lineHeight: 1 }}>{m.icon}</span>
      <span style={{
        fontFamily: D.mono, fontWeight: 600, fontSize: 11,
        color: m.color, letterSpacing: "0.12em",
        textTransform: "uppercase",
      }}>
        {m.titulo}
      </span>
      <span style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        minWidth: 20, height: 18,
        fontFamily: D.mono, fontWeight: 600, fontSize: 11,
        color: m.color,
        background: `${m.color}18`,
        border: `1px solid ${m.color}30`,
        borderRadius: 4, padding: "0 5px",
      }}>
        {count}
      </span>
      <span style={{ flex: 1, fontFamily: D.sans, fontSize: 11, color: D.t3, paddingLeft: 2 }}>
        {m.desc}
      </span>
      <span style={{ fontFamily: D.mono, fontSize: 10, color: D.t3 }}>
        {abierto ? "▲" : "▼"}
      </span>
    </div>
  );
}

// ─── TARJETA DE AVISO ────────────────────────────────────────────────────────
function TarjetaAviso({ aviso, onNuevaOC }) {
  const [expandida, setExpandida] = useState(false);
  const { urgencia, obra, etapaNombre, items, isAviso, tieneOC, etapaObra } = aviso;

  function emitirOC(e) {
    e.stopPropagation();
    onNuevaOC?.({
      obra_id:            obra.id,
      obra_codigo:        obra.codigo,
      etapa_id:           etapaObra?.id,
      etapa_nombre:       etapaNombre,
      linea_nombre:       obra.linea_nombre,
      tipo:               etapaObra?.orden_compra_tipo ?? "aviso",
      descripcion:        etapaObra?.orden_compra_descripcion ?? null,
      monto_estimado:     etapaObra?.orden_compra_monto_estimado ?? null,
      dias_previo_aviso:  etapaObra?.orden_compra_dias_previo ?? 7,
    });
  }

  const esResuelto   = urgencia.banda === "resuelto";
  const { color, bg, bd } = urgencia;
  const monto = etapaObra?.orden_compra_monto_estimado;

  return (
    <div style={{
      borderRadius: 7,
      border: `1px solid ${bd}`,
      borderLeft: `3px solid ${color}`,
      overflow: "hidden",
      marginBottom: 4,
      opacity: esResuelto ? 0.55 : 1,
      transition: "opacity .2s, box-shadow .2s",
    }}
      onMouseEnter={e => { if (!esResuelto) e.currentTarget.style.boxShadow = `0 0 0 1px ${color}30`; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; }}
    >
      {/* ── Fila principal ── */}
      <div
        onClick={() => setExpandida(v => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 0,
          background: expandida ? bg : D.card,
          cursor: "pointer", minHeight: 52,
          transition: "background .12s",
        }}
      >
        {/* Col: Urgencia */}
        <div style={{
          width: 64, flexShrink: 0,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          padding: "8px 4px",
          borderRight: `1px solid ${D.line}`,
          gap: 2,
        }}>
          <span style={{
            fontFamily: D.mono, fontWeight: 600,
            fontSize: urgencia.banda === "hoy" ? 10 : 10,
            color,
            letterSpacing: urgencia.banda === "hoy" ? "0.06em" : "0",
          }}>
            {urgencia.label}
          </span>
          {aviso.fechaPedido && (
            <span style={{ fontFamily: D.mono, fontSize: 9, color: D.t3 }}>
              {fmtCorto(aviso.fechaPedido)}
            </span>
          )}
        </div>

        {/* Col: Obra + Línea */}
        <div style={{
          width: 120, flexShrink: 0,
          padding: "8px 14px",
          borderRight: `1px solid ${D.line}`,
          display: "flex", flexDirection: "column", justifyContent: "center", gap: 3,
        }}>
          <span style={{
            fontFamily: D.mono, fontWeight: 600, fontSize: 14,
            color: D.t1, letterSpacing: "0.02em",
          }}>
            {obra.codigo}
          </span>
          {obra.linea_nombre && (
            <span style={{
              fontFamily: D.sans, fontSize: 9, color: D.t3,
              textTransform: "uppercase", letterSpacing: "0.08em",
            }}>
              {obra.linea_nombre}
            </span>
          )}
        </div>

        {/* Col: Etapa + descripción */}
        <div style={{
          flex: 1, display: "flex", flexDirection: "column", justifyContent: "center",
          padding: "8px 14px", gap: 4, minWidth: 0,
        }}>
          <div style={{
            fontFamily: D.sans, fontWeight: 500, fontSize: 13,
            color: esResuelto ? D.t2 : D.t1,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {etapaNombre}
          </div>
          <div style={{
            display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap",
          }}>
            {items.length > 0 && (
              <span style={{ fontFamily: D.mono, fontSize: 10, color: D.t3 }}>
                {items.length} ítem{items.length !== 1 ? "s" : ""}
              </span>
            )}
            <span style={{
              fontFamily: D.sans, fontSize: 10, color: D.t3,
              textTransform: "uppercase", letterSpacing: "0.06em",
            }}>
              {isAviso ? "confirmar" : "generar OC"}
            </span>
            {monto > 0 && (
              <span style={{ fontFamily: D.mono, fontSize: 10, color: color }}>
                ${num(monto).toLocaleString("es-AR")}
              </span>
            )}
          </div>
        </div>

        {/* Col: Acción + estado */}
        <div style={{
          flexShrink: 0, display: "flex", alignItems: "center", gap: 8,
          padding: "0 14px",
          borderLeft: `1px solid ${D.line}`,
        }}>
          {esResuelto ? (
            <Badge label={tieneOC ? "OC emitida" : "Listo"} color={D.gr} bg={D.grBg} bd={D.grBd} />
          ) : (
            <>
              {onNuevaOC && (
                <button
                  type="button"
                  onClick={emitirOC}
                  style={{
                    fontFamily: D.mono, fontWeight: 600, fontSize: 11,
                    color: "#000",
                    background: color,
                    border: "none", padding: "5px 12px", borderRadius: 5,
                    cursor: "pointer", letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    flexShrink: 0,
                  }}
                >
                  {isAviso ? "Confirmar" : "Generar OC"}
                </button>
              )}
            </>
          )}
          <span style={{ fontFamily: D.mono, fontSize: 9, color: D.t3, marginLeft: 4 }}>
            {expandida ? "▲" : "▼"}
          </span>
        </div>
      </div>

      {/* ── Panel de ítems expandido ── */}
      {expandida && (
        <div style={{
          background: D.bg,
          borderTop: `1px solid ${bd}`,
          padding: "12px 16px 14px 198px",
          animation: "fadeIn .15s ease",
        }}>
          {items.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {items.map((item, i) => {
                const matchNota = item.match(/\s*—\s*(instalaci[oó]n[^.]+\.?)/i);
                const nota = matchNota ? matchNota[1].trim() : null;
                const texto = item.replace(/\s*—\s*instalaci[oó]n[^.]+\.?/gi, "").trim();
                return (
                  <div key={i} style={{
                    display: "flex", gap: 12, alignItems: "flex-start",
                    padding: "7px 10px",
                    background: D.card,
                    border: `1px solid ${D.line2}`,
                    borderLeft: `2px solid ${color}60`,
                    borderRadius: 5,
                  }}>
                    <span style={{ fontFamily: D.mono, fontSize: 11, color: color, flexShrink: 0, marginTop: 1 }}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <p style={{
                        margin: 0, fontFamily: D.sans, fontSize: 13,
                        fontWeight: 400, color: D.t1, lineHeight: 1.5,
                      }}>
                        {texto}
                      </p>
                      {nota && (
                        <p style={{
                          margin: "3px 0 0", fontFamily: D.mono, fontSize: 10,
                          color: D.t3, lineHeight: 1.4,
                        }}>
                          ↳ {nota}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p style={{
              margin: 0, fontFamily: D.sans, fontSize: 12,
              color: D.t3, fontStyle: "italic",
            }}>
              Sin ítems especificados — revisar con el área técnica.
            </p>
          )}

          {/* Metadata extra */}
          <div style={{
            display: "flex", gap: 16, marginTop: 12, paddingTop: 10,
            borderTop: `1px solid ${D.line}`,
            flexWrap: "wrap",
          }}>
            {aviso.fechaEtapa && (
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ fontFamily: D.sans, fontSize: 10, color: D.t3, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Inicio etapa
                </span>
                <span style={{ fontFamily: D.mono, fontSize: 11, color: D.t2 }}>
                  {fmtMedio(aviso.fechaEtapa)}
                </span>
              </div>
            )}
            {aviso.diasPrevio > 0 && (
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ fontFamily: D.sans, fontSize: 10, color: D.t3, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Previo
                </span>
                <span style={{ fontFamily: D.mono, fontSize: 11, color: D.t2 }}>
                  {aviso.diasPrevio}d antes
                </span>
              </div>
            )}
            {monto > 0 && (
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ fontFamily: D.sans, fontSize: 10, color: D.t3, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Monto est.
                </span>
                <span style={{ fontFamily: D.mono, fontSize: 12, color, fontWeight: 500 }}>
                  ${num(monto).toLocaleString("es-AR")}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── SECCIÓN DE BANDA ────────────────────────────────────────────────────────
function SeccionBanda({ banda, avisos, onNuevaOC, defaultAbierto }) {
  const [abierto, setAbierto] = useState(defaultAbierto ?? true);
  if (avisos.length === 0) return null;

  return (
    <div style={{ marginBottom: 16 }}>
      <HeaderBanda
        banda={banda}
        count={avisos.length}
        abierto={abierto}
        onClick={() => setAbierto(v => !v)}
      />
      {abierto && (
        <div style={{
          border: `1px solid ${BANDA_META[banda].color}18`,
          borderTop: "none",
          borderRadius: "0 0 7px 7px",
          padding: "8px 8px 4px",
          background: `${BANDA_META[banda].color}03`,
        }}>
          {avisos.map((aviso, i) => (
            <TarjetaAviso key={i} aviso={aviso} onNuevaOC={onNuevaOC} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── BARRA SUPERIOR ──────────────────────────────────────────────────────────
function BarraSuperior({ busqueda, setBusqueda, filtroLinea, setFiltroLinea, lineas, contadores }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "10px 16px",
      background: D.panel,
      borderBottom: `1px solid ${D.line2}`,
      flexShrink: 0, flexWrap: "wrap",
    }}>
      {/* Input búsqueda */}
      <div style={{ position: "relative", flexShrink: 0 }}>
        <span style={{
          position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
          fontFamily: D.mono, fontSize: 11, color: D.t3, pointerEvents: "none",
        }}>⌕</span>
        <input
          style={{
            fontFamily: D.sans, fontSize: 12, color: D.t1,
            background: D.input, border: `1px solid ${D.line2}`,
            padding: "6px 12px 6px 26px",
            borderRadius: 6, outline: "none", width: 180,
            caretColor: D.am,
          }}
          placeholder="Filtrar obra…"
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
        />
      </div>

      <div style={{ width: 1, height: 20, background: D.line2, margin: "0 2px" }} />

      {/* Filtros línea */}
      {[{ id: "todas", nombre: "Todas" }, ...lineas].map(l => (
        <button
          key={l.id}
          type="button"
          onClick={() => setFiltroLinea(l.id)}
          style={{
            fontFamily: D.sans, fontWeight: filtroLinea === l.id ? 600 : 400,
            fontSize: 11, color: filtroLinea === l.id ? D.t1 : D.t2,
            background: filtroLinea === l.id ? D.input : "transparent",
            border: filtroLinea === l.id
              ? `1px solid ${l.color ?? D.line3}`
              : `1px solid ${D.line}`,
            borderLeft: filtroLinea === l.id && l.color
              ? `2px solid ${l.color}`
              : undefined,
            padding: "4px 11px", borderRadius: 5,
            cursor: "pointer", transition: "all .12s",
          }}
        >
          {l.nombre}
        </button>
      ))}

      <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
        {contadores.vencido > 0 && (
          <Badge label={`${contadores.vencido} vencido${contadores.vencido > 1 ? "s" : ""}`} color={D.rd} bg={D.rdBg} bd={D.rdBd} />
        )}
        {(contadores.hoy + contadores.urgente) > 0 && (
          <Badge label={`${contadores.hoy + contadores.urgente} urgente${(contadores.hoy + contadores.urgente) > 1 ? "s" : ""}`} color={D.am} bg={D.amBg} bd={D.amBd} />
        )}
      </div>
    </div>
  );
}

// ─── VISTA VACÍA ─────────────────────────────────────────────────────────────
function EmptyState({ busqueda }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      flex: 1, gap: 12, padding: 60,
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: "50%",
        border: `1px solid ${D.line2}`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <span style={{ fontFamily: D.mono, fontSize: 20, color: D.t3 }}>✓</span>
      </div>
      <div style={{ fontFamily: D.mono, fontSize: 11, color: D.t3, letterSpacing: "0.1em", textTransform: "uppercase" }}>
        {busqueda ? "Sin resultados para ese filtro" : "Sin avisos de compra activos"}
      </div>
      {busqueda && (
        <div style={{ fontFamily: D.sans, fontSize: 12, color: D.t3 }}>
          Intentá con otro código de obra o quitá el filtro
        </div>
      )}
    </div>
  );
}

// ─── COMPONENTE RAÍZ ─────────────────────────────────────────────────────────
export default function AvisosCompraView({ obras, etapas, lineas, lProcs = [], ordenes, onNuevaOC }) {
  const [busqueda,     setBusqueda]     = useState("");
  const [filtroLinea,  setFiltroLinea]  = useState("todas");
  const [mostrarResueltos, setMostrarResueltos] = useState(false);

  // ── Construir lista plana de avisos ──────────────────────────────────────
  const avisos = useMemo(() => {
    const lista = [];

    const obrasFilt = obras.filter(o => {
      if (o.estado === "cancelada") return false;
      if (filtroLinea !== "todas" && o.linea_id !== filtroLinea) return false;
      if (busqueda && !(o.codigo ?? "").toLowerCase().includes(busqueda.toLowerCase())) return false;
      return true;
    });

    obrasFilt.forEach(obra => {
      const etapasObra = etapas.filter(e => e.obra_id === obra.id);
      const procsLinea = lProcs
        .filter(p => p.linea_id === obra.linea_id)
        .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
      const procsAcum = calcAcum(procsLinea);

      procsAcum.forEach(proc => {
        const etapaObra = etapasObra.find(e => e.linea_proceso_id === proc.id || e.nombre === proc.nombre);
        if (!etapaObra?.genera_orden_compra) return;

        const hecha   = etapaObra.estado === "completado";
        const tieneOC = ordenes.some(o => o.obra_id === obra.id && o.etapa_nombre === proc.nombre);
        const resuelta = hecha || tieneOC;

        const diasPrevio  = rd(etapaObra.orden_compra_dias_previo ?? 0);
        const fechaEtapa  = fechaOffset(obra.fecha_inicio, proc.diaInicio);
        const fechaPedido = diasPrevio > 0
          ? fechaOffset(obra.fecha_inicio, proc.diaInicio - diasPrevio)
          : fechaEtapa;

        const urgencia = clasificarUrgencia(fechaPedido, resuelta);
        const items    = parsearItems(etapaObra.orden_compra_descripcion);

        lista.push({
          id:          `${obra.id}-${proc.id}`,
          obra,
          etapaNombre: proc.nombre,
          etapaObra,
          items,
          isAviso:     etapaObra.orden_compra_tipo === "aviso",
          tieneOC,
          resuelta,
          urgencia,
          fechaPedido,
          fechaEtapa,
          diasPrevio,
          // Para ordenar dentro de cada banda: fecha ascendente
          _sortKey: fechaPedido ?? "9999-99-99",
        });
      });
    });

    // Ordenar por fecha dentro de cada banda
    lista.sort((a, b) => a._sortKey.localeCompare(b._sortKey));
    return lista;
  }, [obras, etapas, lProcs, ordenes, filtroLinea, busqueda]);

  // ── Agrupar por banda ────────────────────────────────────────────────────
  const porBanda = useMemo(() => {
    const mapa = {};
    ORDEN_BANDAS.forEach(b => { mapa[b] = []; });
    avisos.forEach(a => mapa[a.urgencia.banda]?.push(a));
    return mapa;
  }, [avisos]);

  const contadores = useMemo(() => ({
    vencido: porBanda.vencido?.length ?? 0,
    hoy:     porBanda.hoy?.length     ?? 0,
    urgente: porBanda.urgente?.length ?? 0,
  }), [porBanda]);

  const totalActivos = avisos.filter(a => a.urgencia.banda !== "resuelto").length;

  return (
    <div style={{
      flex: 1, display: "flex", flexDirection: "column",
      overflow: "hidden", background: D.bg,
      color: D.t1, fontFamily: D.sans,
    }}>
      <style>{`
        ${GFONTS}
        *, *::before, *::after { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${D.line2}; border-radius: 2px; }
        input::placeholder { color: ${D.t3}; }
        input:focus { border-color: ${D.amBd} !important; }
        button { cursor: pointer; }
        button:active { transform: scale(0.97); }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
      `}</style>

      <BarraSuperior
        busqueda={busqueda}       setBusqueda={setBusqueda}
        filtroLinea={filtroLinea} setFiltroLinea={setFiltroLinea}
        lineas={lineas}           contadores={contadores}
      />

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 60px" }}>

        {totalActivos === 0 && avisos.length === 0 ? (
          <EmptyState busqueda={busqueda} />
        ) : (
          <>
            {/* Bandas activas */}
            {["vencido", "hoy", "urgente", "proximo", "futuro"].map(banda => (
              <SeccionBanda
                key={banda}
                banda={banda}
                avisos={porBanda[banda] ?? []}
                onNuevaOC={onNuevaOC}
                defaultAbierto={["vencido", "hoy", "urgente"].includes(banda)}
              />
            ))}

            {/* Toggle para resueltos */}
            {(porBanda.resuelto?.length ?? 0) > 0 && (
              <div style={{ marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => setMostrarResueltos(v => !v)}
                  style={{
                    fontFamily: D.mono, fontSize: 10, color: D.t3,
                    background: "transparent",
                    border: `1px solid ${D.line}`,
                    padding: "5px 14px", borderRadius: 5,
                    cursor: "pointer", letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    marginBottom: 8,
                  }}
                >
                  {mostrarResueltos ? "▲ Ocultar" : "▼ Ver"} resueltos ({porBanda.resuelto.length})
                </button>
                {mostrarResueltos && (
                  <SeccionBanda
                    banda="resuelto"
                    avisos={porBanda.resuelto}
                    onNuevaOC={onNuevaOC}
                    defaultAbierto={true}
                  />
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
