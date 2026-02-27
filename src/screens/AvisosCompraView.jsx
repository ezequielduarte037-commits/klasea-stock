import { useMemo, useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
//  AvisosCompraView — diseño "Premium Dashboard"
//  Fuentes: Plus Jakarta Sans (UI) + Geist Mono (datos)
//  Tema: oscuro con altísimo contraste, solo 3 colores de acento
//  Principio: silencio visual para etapas normales,
//             protagonismo absoluto para bloques de compra
// ─────────────────────────────────────────────────────────────────────────────

const GFONTS = `@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700&family=Geist+Mono:wght@400;500&display=swap');`;

const D = {
  // Backgrounds
  bg:    "#09090F",
  panel: "#0F0F18",
  card:  "#141420",
  hover: "#1A1A28",
  input: "#1F1F30",

  // Bordes
  line:  "rgba(255,255,255,0.06)",
  line2: "rgba(255,255,255,0.10)",
  line3: "rgba(255,255,255,0.16)",

  // Texto — 3 niveles
  t1: "#FFFFFF",
  t2: "#A0A0B8",
  t3: "#484860",

  // Naranja — compras pendientes
  or:   "#F97316",
  orBg: "rgba(249,115,22,0.08)",
  orBd: "rgba(249,115,22,0.20)",

  // Verde — completado / ok
  gr:   "#22C55E",
  grBg: "rgba(34,197,94,0.08)",
  grBd: "rgba(34,197,94,0.18)",

  // Azul — etapa activa
  bl:   "#3B82F6",
  blBg: "rgba(59,130,246,0.08)",
  blBd: "rgba(59,130,246,0.18)",

  // Rojo — urgente
  rd:   "#EF4444",

  sans: "'Plus Jakarta Sans', system-ui, sans-serif",
  mono: "'Geist Mono', 'JetBrains Mono', monospace",
};

// ─── UTILS ───────────────────────────────────────────────────────────────────
const num = v => { const n = Number(v); return isFinite(n) ? n : 0; };
const rd  = v => Math.round(num(v));

const fmtCorto = d =>
  d ? new Date(d + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "short" }) : null;

const fmtLargo = d =>
  d ? new Date(d + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : null;

const diasDesde = f =>
  f ? Math.max(0, Math.floor((Date.now() - new Date(f + "T12:00:00")) / 86400000)) : null;

function fechaEtapa(inicio, diasOffset) {
  if (!inicio) return null;
  const d = new Date(inicio + "T12:00:00");
  d.setDate(d.getDate() + diasOffset);
  return d.toISOString().slice(0, 10);
}

function cuandoPedir(fechaStr) {
  if (!fechaStr) return null;
  const diff = Math.round((new Date(fechaStr + "T12:00:00") - Date.now()) / 86400000);
  if (diff < 0)  return { texto: `hace ${-diff} días`,  urgente: false };
  if (diff === 0) return { texto: "hoy",                 urgente: true  };
  if (diff <= 7)  return { texto: `en ${diff} días`,     urgente: true  };
  return               { texto: `en ${diff} días`,      urgente: false };
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

// ─── CHIP ─────────────────────────────────────────────────────────────────────
function Chip({ label, color, bg, bd }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      fontFamily: D.sans, fontWeight: 500, fontSize: 11,
      color: color,
      background: bg ?? "transparent",
      border: bd ? `1px solid ${bd}` : "none",
      padding: "2px 8px", borderRadius: 5,
      whiteSpace: "nowrap", flexShrink: 0, lineHeight: 1.6,
    }}>
      {label}
    </span>
  );
}

// ─── ETAPA NORMAL — fila silenciosa ───────────────────────────────────────────
function FilaEtapa({ dia, nombre, estado, fechaAbsoluta }) {
  const hecha  = estado === "completado";
  const activa = estado === "en_curso";

  return (
    <div style={{
      display: "flex", alignItems: "center",
      padding: "5px 0",
      opacity: hecha ? 0.35 : 1,
      transition: "opacity .15s",
    }}>
      {/* Día */}
      <div style={{ width: 52, flexShrink: 0, textAlign: "right", paddingRight: 14 }}>
        <span style={{
          fontFamily: D.mono, fontSize: 11,
          color: activa ? D.bl : D.t3,
          fontWeight: activa ? "500" : "400",
        }}>
          {dia === 0 ? "0" : `+${dia}`}
          <span style={{ fontSize: 9, marginLeft: 1 }}>d</span>
        </span>
      </div>

      {/* Punto + línea */}
      <div style={{ width: 20, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{
          width: activa ? 8 : 5, height: activa ? 8 : 5,
          borderRadius: "50%",
          background: hecha ? D.gr : activa ? D.bl : D.t3,
          boxShadow: activa ? `0 0 0 3px ${D.blBd}` : "none",
          transition: "all .2s",
        }} />
      </div>

      {/* Nombre */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, paddingLeft: 10 }}>
        <span style={{
          fontFamily: D.sans, fontSize: 13, fontWeight: 400,
          color: hecha ? D.t2 : activa ? D.t1 : D.t2,
        }}>
          {nombre}
        </span>
        {fechaAbsoluta && !hecha && (
          <span style={{ fontFamily: D.mono, fontSize: 10, color: D.t3 }}>
            {fmtCorto(fechaAbsoluta)}
          </span>
        )}
        {activa && <Chip label="En curso" color={D.bl} bg={D.blBg} bd={D.blBd} />}
        {hecha  && <span style={{ fontFamily: D.mono, fontSize: 10, color: D.gr }}>✓</span>}
      </div>
    </div>
  );
}

// ─── BLOQUE DE COMPRA — protagonista ─────────────────────────────────────────
function BloqueCompra({ proc, etapaObra, ordenes, obra, onNuevaOC }) {
  const [abierto, setAbierto] = useState(false);

  const estado   = etapaObra?.estado ?? "pendiente";
  const hecha    = estado === "completado";
  const tieneOC  = ordenes.some(o => o.obra_id === obra.id && o.etapa_nombre === proc.nombre);
  const items    = parsearItems(etapaObra?.orden_compra_descripcion);
  const isAviso  = etapaObra?.orden_compra_tipo === "aviso";
  const resuelta = hecha || tieneOC;

  const diasPrev  = rd(etapaObra?.orden_compra_dias_previo ?? 0);
  const fEtapa    = fechaEtapa(obra.fecha_inicio, proc.diaInicio);
  const fPedido   = diasPrev > 0 ? fechaEtapa(obra.fecha_inicio, proc.diaInicio - diasPrev) : fEtapa;
  const cuando    = cuandoPedir(fPedido);

  // Colores según estado
  const accent  = resuelta ? D.gr  : D.or;
  const accentBg= resuelta ? D.grBg: D.orBg;
  const accentBd= resuelta ? D.grBd: D.orBd;

  function emitirOC(e) {
    e.stopPropagation();
    onNuevaOC?.({
      obra_id: obra.id,
      obra_codigo: obra.codigo,
      etapa_id: etapaObra?.id,
      etapa_nombre: proc.nombre,
      linea_nombre: obra.linea_nombre,
      tipo: etapaObra?.orden_compra_tipo ?? "aviso",
      descripcion: etapaObra?.orden_compra_descripcion ?? null,
      monto_estimado: etapaObra?.orden_compra_monto_estimado ?? null,
      dias_previo_aviso: etapaObra?.orden_compra_dias_previo ?? 7,
    });
  }

  return (
    <div style={{ margin: "10px 0" }}>

      {/* ── Cabecera del bloque de compra ── */}
      <div
        onClick={() => setAbierto(v => !v)}
        style={{
          display: "flex", alignItems: "center",
          background: accentBg,
          border: `1px solid ${accentBd}`,
          borderLeft: `3px solid ${accent}`,
          borderRadius: abierto ? "8px 8px 0 0" : 8,
          padding: "0 14px 0 0",
          cursor: "pointer",
          minHeight: 52,
          transition: "filter .15s",
        }}
      >
        {/* Día */}
        <div style={{ width: 52, flexShrink: 0, textAlign: "right", paddingRight: 14, paddingLeft: 10 }}>
          <span style={{
            fontFamily: D.mono, fontSize: 11,
            color: resuelta ? D.t3 : accent,
            fontWeight: resuelta ? "400" : "500",
          }}>
            {proc.diaInicio === 0 ? "0" : `+${proc.diaInicio}`}
            <span style={{ fontSize: 9, marginLeft: 1 }}>d</span>
          </span>
          {fEtapa && (
            <div style={{ fontFamily: D.mono, fontSize: 9, color: D.t3, marginTop: 2 }}>
              {fmtCorto(fEtapa)}
            </div>
          )}
        </div>

        {/* Punto */}
        <div style={{ width: 20, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{
            width: 10, height: 10, borderRadius: "50%",
            background: accent,
            boxShadow: !resuelta ? `0 0 0 3px ${accentBd}` : "none",
          }} />
        </div>

        {/* Contenido principal */}
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, paddingLeft: 12, minWidth: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: D.sans, fontWeight: 600, fontSize: 14,
              color: resuelta ? D.t2 : D.t1,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {proc.nombre}
            </div>
            <div style={{
              marginTop: 3, fontFamily: D.sans, fontSize: 12,
              fontWeight: 400, color: D.t2,
              display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap",
            }}>
              {resuelta ? (
                tieneOC ? "Orden de compra emitida" : "Completado"
              ) : (
                <>
                  <span>
                    {items.length > 0
                      ? `${items.length} ${items.length === 1 ? "ítem" : "ítems"} · ${isAviso ? "confirmar con proveedor" : "generar pedido"}`
                      : isAviso ? "Confirmar con proveedor" : "Generar orden de compra"
                    }
                  </span>
                  {cuando && (
                    <span style={{
                      fontFamily: D.mono, fontSize: 10,
                      color: cuando.urgente ? D.rd : D.t3,
                      fontWeight: cuando.urgente ? "500" : "400",
                    }}>
                      · {cuando.texto}
                    </span>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Acciones derechas */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {resuelta ? (
              <Chip
                label={tieneOC ? "OC emitida" : "Listo"}
                color={D.gr} bg={D.grBg} bd={D.grBd}
              />
            ) : (
              <Chip
                label={isAviso ? "Confirmar" : "Pedir"}
                color={D.or} bg={D.orBg} bd={D.orBd}
              />
            )}

            {!resuelta && !tieneOC && onNuevaOC && (
              <button
                type="button"
                onClick={emitirOC}
                style={{
                  fontFamily: D.sans, fontWeight: 600, fontSize: 12,
                  color: "#000", background: D.or,
                  border: "none", padding: "5px 14px", borderRadius: 6,
                  cursor: "pointer", lineHeight: 1.5, flexShrink: 0,
                }}
              >
                Generar OC
              </button>
            )}

            <span style={{ fontFamily: D.mono, fontSize: 9, color: D.t3 }}>
              {abierto ? "▲" : "▼"}
            </span>
          </div>
        </div>
      </div>

      {/* ── Lista de ítems desplegada ── */}
      {abierto && (
        <div style={{
          border: `1px solid ${accentBd}`,
          borderTop: "none",
          borderRadius: "0 0 8px 8px",
          background: D.card,
          overflow: "hidden",
        }}>
          {items.length > 0 ? items.map((item, i) => {
            // Separar nota de instalación si existe en el texto
            const matchNota = item.match(/\s*—\s*(instalaci[oó]n[^.]+\.?)/i);
            const nota = matchNota ? matchNota[1].trim() : null;
            const textoLimpio = item.replace(/\s*—\s*instalaci[oó]n[^.]+\.?/gi, "").trim();

            return (
              <div key={i} style={{
                display: "flex", gap: 14, padding: "11px 16px 11px 82px",
                borderBottom: i < items.length - 1 ? `1px solid ${D.line}` : "none",
              }}>
                <span style={{
                  fontFamily: D.mono, fontSize: 12,
                  color: accent, flexShrink: 0,
                  minWidth: 20, marginTop: 1,
                }}>
                  {i + 1}.
                </span>
                <div>
                  <p style={{
                    margin: 0, fontFamily: D.sans, fontSize: 13,
                    fontWeight: 400, color: resuelta ? D.t2 : D.t1,
                    lineHeight: 1.55,
                  }}>
                    {textoLimpio}
                  </p>
                  {nota && (
                    <p style={{
                      margin: "4px 0 0",
                      fontFamily: D.mono, fontSize: 10,
                      color: D.t3, lineHeight: 1.4,
                    }}>
                      {nota}
                    </p>
                  )}
                </div>
              </div>
            );
          }) : (
            <div style={{
              padding: "11px 16px 11px 82px",
              fontFamily: D.sans, fontSize: 13, color: D.t3, fontStyle: "italic",
            }}>
              Sin descripción de ítems
            </div>
          )}

          {etapaObra?.orden_compra_monto_estimado && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "9px 16px 9px 82px",
              borderTop: `1px solid ${D.line}`,
            }}>
              <span style={{ fontFamily: D.sans, fontSize: 12, color: D.t2 }}>Monto estimado</span>
              <span style={{ fontFamily: D.mono, fontSize: 13, color: D.or, fontWeight: "500" }}>
                ${num(etapaObra.orden_compra_monto_estimado).toLocaleString("es-AR")}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── FILA ENTREGA ─────────────────────────────────────────────────────────────
function FilaEntrega({ dia, fecha }) {
  return (
    <div style={{
      display: "flex", alignItems: "center",
      marginTop: 16, paddingTop: 16,
      borderTop: `1px solid ${D.line2}`,
    }}>
      <div style={{ width: 52, flexShrink: 0, textAlign: "right", paddingRight: 14 }}>
        <span style={{ fontFamily: D.mono, fontSize: 11, color: D.gr, fontWeight: "500" }}>
          {`+${dia}`}<span style={{ fontSize: 9, marginLeft: 1 }}>d</span>
        </span>
      </div>
      <div style={{ width: 20, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{
          width: 12, height: 12, borderRadius: "50%",
          background: D.gr, boxShadow: `0 0 0 4px ${D.grBd}`,
        }} />
      </div>
      <div style={{
        flex: 1, display: "flex", alignItems: "center", gap: 10, paddingLeft: 12,
        padding: "10px 16px 10px 12px",
        background: D.grBg, border: `1px solid ${D.grBd}`,
        borderLeft: `3px solid ${D.gr}`,
        borderRadius: 8, marginLeft: 12,
      }}>
        <span style={{ fontFamily: D.sans, fontWeight: 600, fontSize: 13.5, color: D.gr, flex: 1 }}>
          Entrega estimada
        </span>
        {fecha && (
          <span style={{ fontFamily: D.mono, fontSize: 11, color: D.t2 }}>{fmtLargo(fecha)}</span>
        )}
        <span style={{ fontFamily: D.mono, fontSize: 11, color: D.t3 }}>{dia}d total</span>
      </div>
    </div>
  );
}

// ─── STATS DE OBRA ────────────────────────────────────────────────────────────
function StatsObra({ obra, procsConDias, etapasObra, ordenes, durTotal }) {
  const diaActual   = diasDesde(obra.fecha_inicio);
  const completadas = procsConDias.filter(p => {
    const e = etapasObra.find(e => e.linea_proceso_id === p.id || e.nombre === p.nombre);
    return e?.estado === "completado";
  }).length;
  const pendientes = procsConDias.filter(p => {
    const e = etapasObra.find(e => e.linea_proceso_id === p.id || e.nombre === p.nombre);
    return e?.genera_orden_compra && e.estado !== "completado"
      && !ordenes.some(o => o.obra_id === obra.id && o.etapa_nombre === p.nombre);
  }).length;

  const celdas = [
    { val: `${durTotal}d`,                    lbl: "Duración total",    color: D.bl,  highlight: true },
    { val: diaActual != null ? `+${diaActual}d` : "—", lbl: "Día actual", color: D.t1 },
    { val: `${completadas} / ${procsConDias.length}`,  lbl: "Etapas completadas", color: D.t1 },
    { val: pendientes > 0 ? pendientes : "—", lbl: "Compras pendientes",color: pendientes > 0 ? D.or : D.t3 },
    obra.fecha_fin_estimada
      ? { val: fmtLargo(obra.fecha_fin_estimada), lbl: "Entrega estimada", color: D.t2 }
      : null,
  ].filter(Boolean);

  return (
    <div style={{ display: "flex", borderBottom: `1px solid ${D.line}` }}>
      {celdas.map((c, i) => (
        <div key={c.lbl} style={{
          padding: "12px 20px",
          borderRight: i < celdas.length - 1 ? `1px solid ${D.line}` : "none",
          background: c.highlight ? D.blBg : "transparent",
          flexShrink: 0,
        }}>
          <div style={{
            fontFamily: D.mono,
            fontSize: c.highlight ? 20 : 14,
            fontWeight: c.highlight ? "500" : "400",
            color: c.color, lineHeight: 1,
          }}>
            {c.val}
          </div>
          <div style={{
            fontFamily: D.sans, fontSize: 10, fontWeight: 400,
            color: D.t3, marginTop: 5,
            textTransform: "uppercase", letterSpacing: "0.06em",
          }}>
            {c.lbl}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── TIMELINE INTERIOR DE UNA OBRA ───────────────────────────────────────────
function TimelineObra({ obra, procsConDias, etapasObra, ordenes, onNuevaOC }) {
  const last     = procsConDias[procsConDias.length - 1];
  const durTotal = last ? last.diaInicio + rd(last.dias_estimados) : 0;
  const fEntrega = fechaEtapa(obra.fecha_inicio, durTotal);

  return (
    <div>
      <StatsObra
        obra={obra}
        procsConDias={procsConDias}
        etapasObra={etapasObra}
        ordenes={ordenes}
        durTotal={durTotal}
      />

      {/* Timeline */}
      <div style={{ padding: "16px 16px 20px", position: "relative" }}>
        {/* Línea vertical */}
        <div style={{
          position: "absolute", left: 72, top: 22, bottom: 28, width: 1,
          background: `linear-gradient(to bottom, transparent, ${D.t3} 8%, ${D.t3} 92%, transparent)`,
          pointerEvents: "none",
        }} />

        {procsConDias.map(proc => {
          const etapa = etapasObra.find(e => e.linea_proceso_id === proc.id || e.nombre === proc.nombre);
          const fProc = fechaEtapa(obra.fecha_inicio, proc.diaInicio);

          return etapa?.genera_orden_compra ? (
            <BloqueCompra
              key={proc.id}
              proc={proc}
              etapaObra={etapa}
              ordenes={ordenes}
              obra={obra}
              onNuevaOC={onNuevaOC}
            />
          ) : (
            <FilaEtapa
              key={proc.id}
              dia={proc.diaInicio}
              nombre={proc.nombre}
              estado={etapa?.estado ?? "pendiente"}
              fechaAbsoluta={fProc}
            />
          );
        })}

        {durTotal > 0 && <FilaEntrega dia={durTotal} fecha={fEntrega} />}
      </div>
    </div>
  );
}

// ─── CARD DE OBRA ─────────────────────────────────────────────────────────────
function CardObra({ obra, procsConDias, etapas, ordenes, onNuevaOC, abrirPorDefecto }) {
  const [abierto, setAbierto] = useState(abrirPorDefecto ?? false);
  const etapasObra = useMemo(() => etapas.filter(e => e.obra_id === obra.id), [etapas, obra.id]);

  const completadas = procsConDias.filter(p => {
    const e = etapasObra.find(e => e.linea_proceso_id === p.id || e.nombre === p.nombre);
    return e?.estado === "completado";
  }).length;

  const etapaActiva = etapasObra.find(e => e.estado === "en_curso");

  const comprasPend = procsConDias.filter(p => {
    const e = etapasObra.find(e => e.linea_proceso_id === p.id || e.nombre === p.nombre);
    return e?.genera_orden_compra && e.estado !== "completado"
      && !ordenes.some(o => o.obra_id === obra.id && o.etapa_nombre === p.nombre);
  }).length;

  const pct     = procsConDias.length ? Math.round((completadas / procsConDias.length) * 100) : 0;
  const diaHoy  = diasDesde(obra.fecha_inicio);
  const urgente = comprasPend > 0;

  const colorEstado = obra.estado === "activa" ? D.bl
    : obra.estado === "terminada"              ? D.gr
    : obra.estado === "pausada"                ? D.or : D.t3;

  return (
    <div style={{
      borderRadius: 10,
      border: `1px solid ${urgente ? D.orBd : D.line2}`,
      overflow: "hidden",
      marginBottom: 8,
      transition: "border-color .2s",
    }}>
      {/* ── Header ── */}
      <div
        onClick={() => setAbierto(v => !v)}
        style={{
          display: "flex", alignItems: "stretch",
          background: abierto ? D.hover : D.card,
          cursor: "pointer", userSelect: "none",
          borderLeft: `4px solid ${urgente ? D.or : colorEstado}`,
          transition: "background .12s",
          minHeight: 56,
        }}
      >
        {/* Código */}
        <div style={{
          padding: "14px 18px",
          borderRight: `1px solid ${D.line}`,
          display: "flex", flexDirection: "column", justifyContent: "center",
          minWidth: 130, flexShrink: 0,
        }}>
          <div style={{
            fontFamily: D.mono, fontWeight: "500", fontSize: 15,
            color: D.t1, letterSpacing: "0.02em",
          }}>
            {obra.codigo}
          </div>
          {obra.linea_nombre && (
            <div style={{
              fontFamily: D.sans, fontSize: 10, fontWeight: 400,
              color: D.t3, marginTop: 3, textTransform: "uppercase", letterSpacing: "0.08em",
            }}>
              {obra.linea_nombre}
            </div>
          )}
        </div>

        {/* Info central */}
        <div style={{
          flex: 1, display: "flex", alignItems: "center", gap: 12,
          padding: "0 18px", flexWrap: "wrap", minWidth: 0,
        }}>
          {obra.fecha_inicio && (
            <span style={{ fontFamily: D.mono, fontSize: 11, color: D.t3 }}>
              Desde {fmtLargo(obra.fecha_inicio)}
            </span>
          )}
          {diaHoy != null && obra.estado === "activa" && (
            <span style={{ fontFamily: D.mono, fontSize: 12, color: D.bl, fontWeight: "500" }}>
              Día {diaHoy}
            </span>
          )}
          {etapaActiva && (
            <span style={{
              fontFamily: D.sans, fontSize: 11.5, fontWeight: 400, color: D.t1,
              background: D.blBg, border: `1px solid ${D.blBd}`,
              padding: "3px 10px", borderRadius: 6,
              maxWidth: 230, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              ▶ {etapaActiva.nombre}
            </span>
          )}
          {urgente && (
            <span style={{ fontFamily: D.sans, fontSize: 12, fontWeight: 600, color: D.or }}>
              {comprasPend} {comprasPend === 1 ? "compra pendiente" : "compras pendientes"}
            </span>
          )}
        </div>

        {/* Progreso */}
        <div style={{
          display: "flex", alignItems: "center", gap: 14,
          padding: "0 18px", flexShrink: 0,
          borderLeft: `1px solid ${D.line}`,
        }}>
          <div>
            <div style={{
              fontFamily: D.mono, fontSize: 14, fontWeight: "500",
              color: pct === 100 ? D.gr : D.t1,
              textAlign: "right", lineHeight: 1, marginBottom: 6,
            }}>
              {pct}%
            </div>
            <div style={{
              width: 80, height: 4, background: D.line2,
              borderRadius: 99, overflow: "hidden",
            }}>
              <div style={{
                height: "100%",
                width: `${pct}%`,
                background: pct === 100 ? D.gr : D.bl,
                borderRadius: 99,
                transition: "width .5s ease",
              }} />
            </div>
          </div>
          <span style={{ fontFamily: D.mono, fontSize: 10, color: D.t3 }}>
            {abierto ? "▲" : "▼"}
          </span>
        </div>
      </div>

      {/* ── Timeline desplegado ── */}
      {abierto && (
        <div style={{ borderTop: `1px solid ${D.line}`, background: D.bg }}>
          <TimelineObra
            obra={obra}
            procsConDias={procsConDias}
            etapasObra={etapasObra}
            ordenes={ordenes}
            onNuevaOC={onNuevaOC}
          />
        </div>
      )}
    </div>
  );
}

// ─── SECCIÓN POR LÍNEA ────────────────────────────────────────────────────────
function SeccionLinea({ linea, obras, lProcs, etapas, ordenes, onNuevaOC }) {
  const [cerrada, setCerrada] = useState(false);

  const obrasLinea = useMemo(() =>
    obras
      .filter(o => o.linea_id === linea.id && o.estado !== "cancelada")
      .sort((a, b) => {
        const p = { activa: 0, pausada: 1, terminada: 2 };
        const da = p[a.estado] ?? 3, db = p[b.estado] ?? 3;
        return da !== db ? da - db : new Date(b.fecha_inicio ?? 0) - new Date(a.fecha_inicio ?? 0);
      }),
  [obras, linea.id]);

  const procsLinea = useMemo(() =>
    lProcs.filter(p => p.linea_id === linea.id).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)),
  [lProcs, linea.id]);

  const procsAcum = useMemo(() => calcAcum(procsLinea), [procsLinea]);
  const last      = procsAcum[procsAcum.length - 1];
  const durLinea  = last ? last.diaInicio + rd(last.dias_estimados) : 0;

  // Compras pendientes de toda la línea
  const pendLinea = useMemo(() => {
    let c = 0;
    obrasLinea.forEach(obra => {
      const eo = etapas.filter(e => e.obra_id === obra.id);
      procsAcum.forEach(p => {
        const er = eo.find(e => e.linea_proceso_id === p.id || e.nombre === p.nombre);
        if (er?.genera_orden_compra && er.estado !== "completado"
          && !ordenes.some(o => o.obra_id === obra.id && o.etapa_nombre === p.nombre)) c++;
      });
    });
    return c;
  }, [obrasLinea, etapas, procsAcum, ordenes]);

  if (obrasLinea.length === 0 || procsLinea.length === 0) return null;

  return (
    <div style={{ marginBottom: 40 }}>
      {/* Header de línea */}
      <div
        onClick={() => setCerrada(v => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 12,
          paddingBottom: 14, marginBottom: 14,
          borderBottom: `1px solid ${D.line2}`,
          cursor: "pointer", userSelect: "none",
        }}
      >
        <div style={{
          width: 4, height: 26, flexShrink: 0,
          background: linea.color ?? D.bl, borderRadius: 2,
        }} />

        <span style={{
          fontFamily: D.mono, fontWeight: "500", fontSize: 18,
          color: D.t1, letterSpacing: "0.01em",
        }}>
          {linea.nombre}
        </span>

        {/* Badges */}
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {durLinea > 0 && (
            <Chip label={`${durLinea}d`} color={D.bl} bg={D.blBg} bd={D.blBd} />
          )}
          {pendLinea > 0 && (
            <Chip
              label={`${pendLinea} pendiente${pendLinea > 1 ? "s" : ""}`}
              color={D.or} bg={D.orBg} bd={D.orBd}
            />
          )}
          <span style={{ fontFamily: D.sans, fontSize: 11, fontWeight: 400, color: D.t3 }}>
            {obrasLinea.length} barco{obrasLinea.length !== 1 ? "s" : ""}
          </span>
        </div>

        <span style={{ marginLeft: "auto", fontFamily: D.mono, fontSize: 10, color: D.t3 }}>
          {cerrada ? "▼ mostrar" : "▲ ocultar"}
        </span>
      </div>

      {!cerrada && obrasLinea.map(obra => (
        <CardObra
          key={obra.id}
          obra={obra}
          procsConDias={procsAcum}
          etapas={etapas}
          ordenes={ordenes}
          onNuevaOC={onNuevaOC}
          abrirPorDefecto={obra.estado === "activa"}
        />
      ))}
    </div>
  );
}

// ─── BARRA DE FILTROS ─────────────────────────────────────────────────────────
function BarraFiltros({ busqueda, setBusqueda, filtroLinea, setFiltroLinea, filtroEstado, setFiltroEstado, lineas }) {
  const TabBtn = ({ activo, onClick, label, acento }) => (
    <button type="button" onClick={onClick} style={{
      fontFamily: D.sans, fontWeight: activo ? 600 : 400,
      fontSize: 12, color: activo ? D.t1 : D.t2,
      background: activo ? D.hover : "transparent",
      border: activo ? `1px solid ${acento ? acento + "45" : D.line3}` : `1px solid ${D.line}`,
      borderLeft: activo && acento ? `2px solid ${acento}` : undefined,
      padding: "5px 13px", borderRadius: 6,
      cursor: "pointer", transition: "all .12s",
      lineHeight: 1.5,
    }}>
      {label}
    </button>
  );

  return (
    <div style={{
      padding: "10px 20px",
      background: D.panel,
      borderBottom: `1px solid ${D.line2}`,
      display: "flex", alignItems: "center", gap: 6,
      flexShrink: 0, flexWrap: "wrap",
    }}>
      <input
        style={{
          fontFamily: D.sans, fontSize: 13, fontWeight: 400,
          color: D.t1, background: D.input,
          border: `1px solid ${D.line2}`,
          padding: "6px 13px", borderRadius: 6,
          outline: "none", width: 190,
          caretColor: D.bl,
        }}
        placeholder="Buscar obra…"
        value={busqueda}
        onChange={e => setBusqueda(e.target.value)}
      />

      <div style={{ width: 1, height: 20, background: D.line, margin: "0 4px" }} />

      {[["todos","Todos"],["activa","Activas"],["pausada","Pausadas"],["terminada","Terminadas"]].map(([v, l]) => (
        <TabBtn key={v} activo={filtroEstado === v} onClick={() => setFiltroEstado(v)} label={l} />
      ))}

      <div style={{ width: 1, height: 20, background: D.line, margin: "0 4px" }} />

      <TabBtn activo={filtroLinea === "todas"} onClick={() => setFiltroLinea("todas")} label="Todas" />
      {lineas.map(l => (
        <TabBtn
          key={l.id}
          activo={filtroLinea === l.id}
          onClick={() => setFiltroLinea(filtroLinea === l.id ? "todas" : l.id)}
          label={l.nombre}
          acento={l.color}
        />
      ))}
    </div>
  );
}

// ─── COMPONENTE RAÍZ ─────────────────────────────────────────────────────────
export default function AvisosCompraView({ obras, etapas, lineas, lProcs = [], ordenes, esGestion, onNuevaOC }) {
  const [filtroLinea,  setFiltroLinea]  = useState("todas");
  const [filtroEstado, setFiltroEstado] = useState("activa");
  const [busqueda,     setBusqueda]     = useState("");

  const obrasFilt = useMemo(() => obras.filter(o => {
    if (filtroEstado !== "todos" && o.estado !== filtroEstado) return false;
    if (filtroLinea  !== "todas" && o.linea_id !== filtroLinea) return false;
    if (busqueda && !(o.codigo ?? "").toLowerCase().includes(busqueda.toLowerCase())) return false;
    return true;
  }), [obras, filtroEstado, filtroLinea, busqueda]);

  const lineasConDatos = useMemo(() => {
    const ids = new Set(obrasFilt.map(o => o.linea_id).filter(Boolean));
    return lineas
      .filter(l => ids.has(l.id) && lProcs.some(p => p.linea_id === l.id))
      .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  }, [obrasFilt, lineas, lProcs]);

  const sinPlantilla = useMemo(() => {
    const ids = new Set(obrasFilt.map(o => o.linea_id).filter(Boolean));
    return lineas.filter(l => ids.has(l.id) && !lProcs.some(p => p.linea_id === l.id));
  }, [obrasFilt, lineas, lProcs]);

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
        input:focus { border-color: ${D.blBd} !important; }
        button { cursor: pointer; }
        button:active { transform: scale(0.98); }
      `}</style>

      <BarraFiltros
        busqueda={busqueda}         setBusqueda={setBusqueda}
        filtroLinea={filtroLinea}   setFiltroLinea={setFiltroLinea}
        filtroEstado={filtroEstado} setFiltroEstado={setFiltroEstado}
        lineas={lineas}
      />

      <div style={{ flex: 1, overflowY: "auto", padding: "24px 24px 60px" }}>

        {/* Aviso sin plantilla */}
        {sinPlantilla.length > 0 && (
          <div style={{
            marginBottom: 16, padding: "11px 16px",
            background: D.orBg,
            border: `1px solid ${D.orBd}`,
            borderLeft: `4px solid ${D.or}`,
            borderRadius: 8,
            fontFamily: D.sans, fontSize: 13, color: D.or,
          }}>
            <strong>Sin plantilla de etapas:</strong>{" "}
            {sinPlantilla.map(l => l.nombre).join(", ")} — configurá desde ⚙ en Obras.
          </div>
        )}

        {/* Estado vacío */}
        {lineasConDatos.length === 0 && (
          <div style={{ textAlign: "center", paddingTop: 80 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>—</div>
            <div style={{
              fontFamily: D.mono, fontSize: 12, color: D.t3,
              letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8,
            }}>
              Sin obras con este filtro
            </div>
            {filtroEstado === "activa" && (
              <div style={{ fontFamily: D.sans, fontSize: 13, fontWeight: 300, color: D.t3 }}>
                Probá seleccionando "Todos"
              </div>
            )}
          </div>
        )}

        {/* Líneas */}
        {lineasConDatos.map(linea => (
          <SeccionLinea
            key={linea.id}
            linea={linea}
            obras={obrasFilt}
            lProcs={lProcs}
            etapas={etapas}
            ordenes={ordenes}
            onNuevaOC={onNuevaOC}
          />
        ))}
      </div>
    </div>
  );
}
