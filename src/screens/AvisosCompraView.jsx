/**
 * AvisosCompraView v4
 * Replica exacta del HTML de referencia K43
 * — Stats por barco (días, ítems, triggers, motor)
 * — Timeline fiel: triggers en azul, ítems de compra en ámbar como filas separadas
 * — Cards de detalle por ítem (Motor, Grupo, Muebles, Teca, Tanques, Herrajes)
 * — USA obra_etapas.genera_orden_compra (NO lProcs, que no tiene esa columna)
 *
 * INTEGRACIÓN ObrasScreen.jsx — mismo render que antes, con lProcs={lProcs}
 */

import { useMemo, useState } from "react";

// ─── PALETA ──────────────────────────────────────────────────────────────────
const C = {
  bg:     "#09090b",
  bg1:    "#111114",
  bg2:    "#18181c",
  b0:     "rgba(255,255,255,0.07)",
  b1:     "rgba(255,255,255,0.12)",
  b2:     "rgba(255,255,255,0.20)",
  t0:     "#f0f0f2",
  t1:     "#9090a0",
  t2:     "#505060",
  mono:   "'JetBrains Mono','Space Mono',monospace",
  sans:   "'Outfit','DM Sans',system-ui,sans-serif",
  blue:   "#3b82f6",
  amber:  "#f59e0b",
  green:  "#10b981",
  red:    "#ef4444",
  purple: "#8b5cf6",
};

const GLASS = {
  backdropFilter: "blur(24px) saturate(130%)",
  WebkitBackdropFilter: "blur(24px) saturate(130%)",
};

// ─── UTILS ───────────────────────────────────────────────────────────────────
const num = v => { const x = Number(v); return isFinite(x) ? x : 0; };

const fmtFecha = d => d
  ? new Date(d + "T00:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" })
  : null;

const diasDesde = f => f
  ? Math.max(0, Math.floor((Date.now() - new Date(f + "T00:00:00")) / 86400000))
  : null;

/**
 * Parsea "(1) ITEM: detalle. (2) ITEM2: ..." en array de objetos
 */
function parsearItems(descripcion) {
  if (!descripcion) return [];
  const partes = descripcion.split(/\s*\(\d+\)\s+/).filter(Boolean);
  return partes.map(p => {
    const texto = p.trim().replace(/\.$/, "");
    // Nota de instalación "instalación en +Nd (día +Nd)"
    const mInst = texto.match(/instalaci[oó]n en \+?(\d+)\s*d[ií]as?\s*\(d[ií]a \+?(\d+)/i);
    const notaInst = mInst ? `instalación +${mInst[1]}d → día +${mInst[2]}` : null;
    return { texto, notaInst };
  });
}

/**
 * Calcula días acumulados por lProc ordenado
 */
function calcDiasAcum(lProcs) {
  const sorted = [...lProcs].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  let acum = 0;
  return sorted.map(p => {
    const diaInicio = acum;
    acum += num(p.dias_estimados);
    return { ...p, diaInicio };
  });
}

// ─── CHIP ────────────────────────────────────────────────────────────────────
const CHIP_V = {
  trigger: { bg: "rgba(59,130,246,0.08)",  c: "#3b82f6", b: "rgba(59,130,246,0.2)"  },
  compra:  { bg: "rgba(245,158,11,0.13)",  c: "#f59e0b", b: "rgba(245,158,11,0.28)" },
  aviso:   { bg: "rgba(245,158,11,0.07)",  c: "#f59e0b", b: "rgba(245,158,11,0.18)" },
  inst:    { bg: "rgba(139,92,246,0.1)",   c: "#8b5cf6", b: "rgba(139,92,246,0.22)" },
  ok:      { bg: "rgba(16,185,129,0.1)",   c: "#10b981", b: "rgba(16,185,129,0.22)" },
  hito:    { bg: "rgba(255,255,255,0.04)", c: "#9090a0", b: "rgba(255,255,255,0.1)" },
};

function Chip({ label, variant = "hito" }) {
  const s = CHIP_V[variant] ?? CHIP_V.hito;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      fontSize: 9, padding: "2px 8px", borderRadius: 3,
      background: s.bg, color: s.c, border: `1px solid ${s.b}`,
      fontFamily: C.mono, letterSpacing: 1.2, textTransform: "uppercase",
      whiteSpace: "nowrap", flexShrink: 0, fontWeight: 700, lineHeight: 1.7,
    }}>
      {label}
    </span>
  );
}

// ─── DOT ─────────────────────────────────────────────────────────────────────
function TLDot({ color, size = 8, glow = false }) {
  return (
    <div style={{
      width: 30, display: "flex", alignItems: "center",
      justifyContent: "center", flexShrink: 0,
    }}>
      <div style={{
        width: size, height: size, borderRadius: "50%",
        background: color, flexShrink: 0,
        border: `2px solid ${C.bg}`,
        boxShadow: glow ? `0 0 10px ${color}80` : "none",
      }} />
    </div>
  );
}

// ─── DÍA LABEL ───────────────────────────────────────────────────────────────
function DayLabel({ dia }) {
  return (
    <div style={{
      width: 50, textAlign: "right", flexShrink: 0,
      fontFamily: C.mono, fontSize: 10, lineHeight: 1,
      color: dia === 0 ? C.blue : C.t2,
      fontWeight: dia === 0 ? 700 : 400,
    }}>
      {dia === 0 ? "día 0" : `+${dia}d`}
    </div>
  );
}

// ─── FILA HITO (etapa sin compra) ────────────────────────────────────────────
function RowHito({ dia, nombre, estado }) {
  const isDone   = estado === "completado";
  const isActive = estado === "en_curso";
  const isInst   = /subir (cabina|motor)|coloc[a]r consol|muebles llegan/i.test(nombre);
  const dotColor = isDone ? C.green : isActive ? C.blue : isInst ? C.purple : C.t2;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 5 }}>
      <DayLabel dia={dia} />
      <TLDot color={dotColor} size={isActive ? 10 : 7} glow={isActive} />
      <div style={{
        flex: 1, display: "flex", alignItems: "center", gap: 8,
        padding: "9px 14px", borderRadius: 7,
        border: `1px solid ${isActive ? "rgba(59,130,246,0.22)" : isDone ? "rgba(16,185,129,0.1)" : C.b0}`,
        background: isActive ? "rgba(59,130,246,0.04)" : isDone ? "rgba(16,185,129,0.02)" : C.bg1,
        opacity: isDone ? 0.65 : 1,
        transition: "border-color .15s",
        fontSize: 13, color: isDone ? C.t1 : C.t0,
      }}>
        <span style={{ flex: 1, minWidth: 0 }}>{isDone ? "✓ " : ""}{nombre}</span>
        {isInst && !isDone && <Chip label="instalación" variant="inst" />}
        {isActive          && <Chip label="en curso"    variant="trigger" />}
        {isDone && isInst  && <Chip label="instalado"   variant="ok" />}
        {isDone && !isInst && <Chip label="listo"        variant="ok" />}
      </div>
    </div>
  );
}

// ─── FILA TRIGGER ────────────────────────────────────────────────────────────
function RowTrigger({ dia, nombre, estado }) {
  const isDone   = estado === "completado";
  const isActive = estado === "en_curso";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 4 }}>
      <DayLabel dia={dia} />
      <TLDot color={isDone ? C.green : C.blue} size={isActive ? 11 : 9} glow={!isDone} />
      <div style={{
        flex: 1, display: "flex", alignItems: "center", gap: 8,
        padding: "9px 14px", borderRadius: 7,
        border: `1px solid ${isDone ? "rgba(16,185,129,0.2)" : "rgba(59,130,246,0.28)"}`,
        background: isDone ? "rgba(16,185,129,0.03)" : "rgba(59,130,246,0.05)",
        fontSize: 13,
      }}>
        <span style={{ color: isDone ? C.t1 : C.t0, fontWeight: 600, flex: 1 }}>
          {isDone ? "✓ " : "⚡ "}{nombre}
        </span>
        <Chip label="etapa trigger" variant="trigger" />
        {isDone && <Chip label="completada" variant="ok" />}
      </div>
    </div>
  );
}

// ─── FILA ÍTEM DE COMPRA ─────────────────────────────────────────────────────
function RowCompra({ dia, texto, notaInst, isDone, isAviso, tieneOC }) {
  // Limpiar texto de notas de instalación internas
  const textoLimpio = texto
    .replace(/\s*—\s*instalaci[oó]n en \+?\d+[^)]*\)/gi, "")
    .replace(/\s*\(?instalaci[oó]n[^)]*\)/gi, "")
    .trim();

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 5 }}>
      <DayLabel dia={dia} />
      <TLDot color={isDone ? C.green : C.amber} size={isDone ? 7 : 8} glow={!isDone} />
      <div style={{
        flex: 1, display: "flex", alignItems: "center", gap: 8,
        padding: "9px 14px", borderRadius: 7,
        border: `1px solid ${isDone ? "rgba(16,185,129,0.12)" : "rgba(245,158,11,0.25)"}`,
        background: isDone ? "rgba(16,185,129,0.02)" : "rgba(245,158,11,0.04)",
        opacity: isDone ? 0.6 : 1,
        fontSize: 13,
      }}>
        <span style={{ color: isDone ? C.t1 : C.t0, fontWeight: isDone ? 400 : 500, flex: 1, minWidth: 0 }}>
          {isDone ? "✓ " : ""}{textoLimpio}
        </span>
        {notaInst && !isDone && (
          <span style={{ fontSize: 10, color: C.t2, fontFamily: C.mono, flexShrink: 0, whiteSpace: "nowrap" }}>
            {notaInst}
          </span>
        )}
        {!isDone && tieneOC   && <Chip label="OC generada" variant="ok"     />}
        {!isDone && !tieneOC && !isAviso && <Chip label="pedir hoy" variant="compra" />}
        {!isDone && !tieneOC &&  isAviso && <Chip label="avisar"    variant="aviso"  />}
        {isDone && <Chip label="listo" variant="ok" />}
      </div>
    </div>
  );
}

// ─── FILA ENTREGA ─────────────────────────────────────────────────────────────
function RowEntrega({ dia, fecha }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, marginTop: 10 }}>
      <DayLabel dia={dia} />
      <div style={{ width: 30, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <div style={{
          width: 13, height: 13, borderRadius: "50%",
          background: C.green, border: `2px solid ${C.bg}`,
          boxShadow: `0 0 12px rgba(16,185,129,0.65)`,
        }} />
      </div>
      <div style={{
        flex: 1, display: "flex", alignItems: "center", gap: 10,
        padding: "10px 14px", borderRadius: 7,
        border: "1px solid rgba(16,185,129,0.3)",
        background: "rgba(16,185,129,0.06)",
        fontSize: 13,
      }}>
        <span style={{ color: C.green, fontWeight: 700, flex: 1 }}>✅ ENTREGA</span>
        {fecha && <span style={{ fontSize: 10, color: C.t2, fontFamily: C.mono }}>{fecha}</span>}
        <span style={{ fontSize: 10, color: C.t2, fontFamily: C.mono }}>{dia} días exactos</span>
      </div>
    </div>
  );
}

// ─── STAT CARD ───────────────────────────────────────────────────────────────
function StatCard({ n, label, sub, color = C.t0 }) {
  return (
    <div style={{ background: C.bg1, border: `1px solid ${C.b0}`, borderRadius: 10, padding: "16px 18px" }}>
      <div style={{ fontFamily: C.mono, fontSize: 28, fontWeight: 700, color, lineHeight: 1 }}>{n}</div>
      <div style={{ fontSize: 10, color: C.t1, marginTop: 5, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: C.t2, marginTop: 3, fontFamily: C.mono }}>{sub}</div>}
    </div>
  );
}

// ─── DETAIL CARD ─────────────────────────────────────────────────────────────
function DetailCard({ icon, title, rows }) {
  return (
    <div style={{ background: C.bg1, border: `1px solid ${C.b0}`, borderRadius: 10, padding: "16px 18px" }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: C.t0, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
        {icon} {title}
      </div>
      {rows.map((r, i) => (
        <div key={i} style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "6px 0",
          borderBottom: i < rows.length - 1 ? `1px solid ${C.b0}` : "none",
          fontSize: 11,
        }}>
          <span style={{ color: C.t1 }}>{r.l}</span>
          <span style={{ fontFamily: C.mono, fontSize: 10, color: r.c ?? C.amber }}>{r.v}</span>
        </div>
      ))}
    </div>
  );
}

// ─── TIMELINE INTERIOR DE UN BARCO ───────────────────────────────────────────
function ObraTimeline({ obra, procsConDias, etapasObra, ordenes }) {
  const durTotal = procsConDias.length > 0
    ? procsConDias[procsConDias.length - 1].diaInicio + num(procsConDias[procsConDias.length - 1].dias_estimados)
    : 0;

  // Stats
  const triggers = procsConDias.filter(p => {
    const er = etapasObra.find(e => e.linea_proceso_id === p.id || e.nombre === p.nombre);
    return er?.genera_orden_compra === true;
  });

  const totalItems = triggers.reduce((acc, p) => {
    const er = etapasObra.find(e => e.linea_proceso_id === p.id || e.nombre === p.nombre);
    return acc + Math.max(1, parsearItems(er?.orden_compra_descripcion).length);
  }, 0);

  // Detectar modelo de motor desde descripciones
  const motorDesc = etapasObra.find(e => e.genera_orden_compra && /motor/i.test(e.orden_compra_descripcion ?? ""))
    ?.orden_compra_descripcion ?? "";
  const motorModelo = motorDesc.match(/Iveco\s+\d+/gi)?.join(" / ") ?? "Iveco 450/570";

  return (
    <div>
      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 28 }}>
        <StatCard n={`${durTotal}d`}     label="Desmolde → Entrega" sub="Exacto · Sin variación"  color={C.blue}   />
        <StatCard n={totalItems}          label="Ítems a comprar"    sub="Motores, muebles, teca…"  color={C.amber}  />
        <StatCard n={triggers.length}     label="Etapas trigger"     sub="Que generan aviso OC"     color={C.green}  />
        <StatCard n={motorModelo.split(" ")[0]} label="Motor principal" sub={motorModelo}           color={C.purple} />
      </div>

      {/* Section title */}
      <div style={{ fontSize: 9, letterSpacing: 3, color: C.t2, textTransform: "uppercase", marginBottom: 14 }}>
        Timeline completo desde desmolde casco
      </div>

      {/* Timeline */}
      <div style={{ position: "relative" }}>
        {/* Línea vertical */}
        <div style={{
          position: "absolute", left: 80, top: 6, bottom: 16, width: 1,
          background: `linear-gradient(to bottom, transparent, ${C.b1} 3%, ${C.b1} 97%, transparent)`,
          pointerEvents: "none",
        }} />

        {procsConDias.map(proc => {
          const er      = etapasObra.find(e => e.linea_proceso_id === proc.id || e.nombre === proc.nombre);
          const estado  = er?.estado ?? "pendiente";
          const isDone  = estado === "completado";
          const esTrig  = er?.genera_orden_compra === true;
          const isAviso = er?.orden_compra_tipo === "aviso";
          const tieneOC = ordenes.some(oc => oc.obra_id === obra.id && oc.etapa_nombre === proc.nombre);
          const items   = esTrig ? parsearItems(er?.orden_compra_descripcion) : [];

          if (esTrig) {
            return (
              <div key={proc.id}>
                <RowTrigger dia={proc.diaInicio} nombre={proc.nombre} estado={estado} />
                {items.length > 0
                  ? items.map((item, i) => (
                      <RowCompra
                        key={i}
                        dia={proc.diaInicio}
                        texto={item.texto}
                        notaInst={item.notaInst}
                        isDone={isDone}
                        isAviso={isAviso}
                        tieneOC={tieneOC}
                      />
                    ))
                  : er?.orden_compra_descripcion && (
                      <RowCompra
                        key="fallback"
                        dia={proc.diaInicio}
                        texto={er.orden_compra_descripcion}
                        isDone={isDone}
                        isAviso={isAviso}
                        tieneOC={tieneOC}
                      />
                    )
                }
              </div>
            );
          }

          return (
            <RowHito key={proc.id} dia={proc.diaInicio} nombre={proc.nombre} estado={estado} />
          );
        })}

        {durTotal > 0 && (
          <RowEntrega dia={durTotal} fecha={fmtFecha(obra.fecha_fin_estimada)} />
        )}
      </div>

      {/* Detail cards */}
      <div style={{ fontSize: 9, letterSpacing: 3, color: C.t2, textTransform: "uppercase", margin: "32px 0 14px" }}>
        Detalle por ítem
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        <DetailCard icon="🔩" title="Motor" rows={[
          { l: "Pedido",       v: "+35d desde desmolde"    },
          { l: "Instalación",  v: "+98d (Subir Motor)"     },
          { l: "Lead time",    v: "21 días"                },
          { l: "Modelos K43",  v: "Iveco 450 · Iveco 570"  },
          { l: "Variación",    v: "0 días (8/8)", c: C.green },
        ]} />
        <DetailCard icon="⚡" title="Grupo Electrógeno" rows={[
          { l: "Pedido",       v: "+35d desde desmolde"       },
          { l: "Instalación",  v: "+112d (junto a consolas)"  },
          { l: "Lead time",    v: "35 días"                   },
          { l: "Modelos K43",  v: "Kohler 9 kva"              },
          { l: "Variación",    v: "0 días (8/8)", c: C.green  },
        ]} />
        <DetailCard icon="🛋" title="Muebles" rows={[
          { l: "Aviso interno",   v: "−90d antes desmolde"   },
          { l: "Pedido",          v: "Confirmar en desmolde" },
          { l: "Lead time",       v: "~4-6 semanas"          },
          { l: "Instalación",     v: "+49d (Subir Cabina)"   },
          { l: "Nota",            v: "Confirmar con cliente", c: C.amber },
        ]} />
        <DetailCard icon="🌿" title="Teca" rows={[
          { l: "Pedido",     v: "+126d desde desmolde", c: C.blue  },
          { l: "Colocación", v: "+140d (simultáneo)",   c: C.blue  },
          { l: "Variación",  v: "0 días (8/8)",         c: C.green },
          { l: "Zonas",      v: "Planchada · Cockpit · Escalones", c: C.t1 },
        ]} />
        <DetailCard icon="🚰" title="Tanques" rows={[
          { l: "Agua — pedido",        v: "día 0 (desmolde)"  },
          { l: "Agua — llegada",       v: "+9d"               },
          { l: "Combustible — pedido", v: "+70d"              },
          { l: "Variación",            v: "0 días (8/8)", c: C.green },
        ]} />
        <DetailCard icon="🔧" title="Herrajes & Otros" rows={[
          { l: "Herrajes Ramon",     v: "día 0 (desmolde)"     },
          { l: "Portón Inox pedido", v: "+35d (desde ensam.)" },
          { l: "Baranda Escalera",   v: "+126d exacto", c: C.blue },
          { l: "Hélices",            v: "+70d (ver modelo motor)" },
        ]} />
      </div>
    </div>
  );
}

// ─── CARD DE UN BARCO ────────────────────────────────────────────────────────
function ObraCard({ obra, procsConDias, etapas, ordenes, esGestion, onNuevaOC, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen ?? false);

  const etapasObra = useMemo(() => etapas.filter(e => e.obra_id === obra.id), [etapas, obra.id]);

  const completadas = procsConDias.filter(p => {
    const er = etapasObra.find(e => e.linea_proceso_id === p.id || e.nombre === p.nombre);
    return er?.estado === "completado";
  }).length;

  const activa = etapasObra.find(e => e.estado === "en_curso");

  const comprasPend = procsConDias.filter(p => {
    const er = etapasObra.find(e => e.linea_proceso_id === p.id || e.nombre === p.nombre);
    if (!er?.genera_orden_compra) return false;
    if (er?.estado === "completado") return false;
    return !ordenes.some(oc => oc.obra_id === obra.id && oc.etapa_nombre === p.nombre);
  }).length;

  const pct = procsConDias.length > 0
    ? Math.round((completadas / procsConDias.length) * 100) : 0;

  const diasActual = diasDesde(obra.fecha_inicio);

  const borderColor = comprasPend > 0
    ? "rgba(245,158,11,0.32)"
    : activa ? "rgba(59,130,246,0.24)" : C.b0;

  return (
    <div style={{ border: `1px solid ${borderColor}`, borderRadius: 12, marginBottom: 12, overflow: "hidden" }}>

      {/* Header clickeable */}
      <div
        onClick={() => setOpen(x => !x)}
        style={{
          padding: "12px 16px", background: C.bg1,
          cursor: "pointer", display: "flex", alignItems: "center", gap: 12,
          userSelect: "none",
        }}
      >
        {/* Estado dot */}
        <div style={{
          width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
          background: obra.estado === "activa" ? C.blue : obra.estado === "terminada" ? C.green : obra.estado === "pausada" ? C.amber : C.t2,
          boxShadow: obra.estado === "activa" ? `0 0 7px ${C.blue}80` : "none",
        }} />

        <span style={{ fontFamily: C.mono, fontSize: 15, color: C.t0, fontWeight: 700, letterSpacing: 0.5 }}>
          {obra.codigo}
        </span>

        {obra.linea_nombre && (
          <span style={{ fontSize: 9, color: C.t2, letterSpacing: 2, textTransform: "uppercase" }}>
            {obra.linea_nombre}
          </span>
        )}

        {obra.fecha_inicio && (
          <span style={{ fontSize: 10, color: C.t2, fontFamily: C.mono }}>
            desde {fmtFecha(obra.fecha_inicio)}
          </span>
        )}

        {diasActual !== null && obra.estado === "activa" && (
          <span style={{
            fontSize: 11, fontFamily: C.mono, color: C.t1,
            background: "rgba(59,130,246,0.07)", border: "1px solid rgba(59,130,246,0.15)",
            padding: "2px 10px", borderRadius: 4,
          }}>
            día <span style={{ color: C.blue, fontWeight: 700 }}>{diasActual}</span>
          </span>
        )}

        {activa && (
          <span style={{
            fontSize: 10, color: C.blue,
            background: "rgba(59,130,246,0.07)", border: "1px solid rgba(59,130,246,0.18)",
            padding: "2px 10px", borderRadius: 4,
          }}>
            ▶ {activa.nombre}
          </span>
        )}

        {comprasPend > 0 && (
          <span style={{
            fontSize: 10, color: C.amber, fontWeight: 700,
            background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)",
            padding: "2px 10px", borderRadius: 4,
          }}>
            🛒 {comprasPend} pendiente{comprasPend > 1 ? "s" : ""}
          </span>
        )}

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 90 }}>
            <div style={{ height: 4, background: "rgba(255,255,255,0.05)", borderRadius: 99, overflow: "hidden" }}>
              <div style={{
                height: "100%", width: `${pct}%`,
                background: pct === 100 ? C.green : C.blue,
                borderRadius: 99, transition: "width .6s ease",
              }} />
            </div>
          </div>
          <span style={{ fontFamily: C.mono, fontSize: 11, color: C.t1, minWidth: 36, textAlign: "right" }}>
            {pct}%
          </span>
          <span style={{ fontSize: 10, color: C.t2, marginLeft: 4 }}>{open ? "▲" : "▼"}</span>
        </div>
      </div>

      {/* Info bar */}
      {open && (
        <div style={{
          display: "flex", gap: 24, padding: "8px 16px",
          background: "rgba(0,0,0,0.35)", ...GLASS,
          borderTop: `1px solid ${C.b0}`, borderBottom: `1px solid ${C.b0}`,
          flexWrap: "wrap",
        }}>
          {[
            { l: "COMPLETADAS",   v: `${completadas}/${procsConDias.length}`, c: C.green },
            { l: "DÍA ACTUAL",    v: diasActual !== null ? `+${diasActual}d` : "—", c: C.blue },
            { l: "COMPRAS PEND.", v: String(comprasPend), c: comprasPend > 0 ? C.amber : C.t2 },
            obra.fecha_fin_estimada ? { l: "ENTREGA EST.", v: fmtFecha(obra.fecha_fin_estimada), c: C.t1 } : null,
          ].filter(Boolean).map(s => (
            <div key={s.l} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 8, color: C.t2, letterSpacing: 2, textTransform: "uppercase" }}>{s.l}</span>
              <span style={{ fontFamily: C.mono, fontSize: 12, color: s.c, fontWeight: 700 }}>{s.v}</span>
            </div>
          ))}
        </div>
      )}

      {/* Timeline */}
      {open && (
        <div style={{ padding: "24px 24px 28px", background: C.bg }}>
          <ObraTimeline
            obra={obra}
            procsConDias={procsConDias}
            etapasObra={etapasObra}
            ordenes={ordenes}
          />
        </div>
      )}
    </div>
  );
}

// ─── SECCIÓN POR LÍNEA ────────────────────────────────────────────────────────
function LineaSection({ linea, obras, lProcs, etapas, ordenes, esGestion, onNuevaOC }) {
  const [collapsed, setCollapsed] = useState(false);

  const obrasDeLinea = useMemo(() =>
    obras
      .filter(o => o.linea_id === linea.id && o.estado !== "cancelada")
      .sort((a, b) => {
        const ord = { activa: 0, pausada: 1, terminada: 2 };
        const da = ord[a.estado] ?? 3, db = ord[b.estado] ?? 3;
        if (da !== db) return da - db;
        return new Date(b.fecha_inicio ?? 0) - new Date(a.fecha_inicio ?? 0);
      }),
  [obras, linea.id]);

  const lProcsLinea = useMemo(() =>
    lProcs.filter(p => p.linea_id === linea.id).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)),
  [lProcs, linea.id]);

  const procsConDias = useMemo(() => calcDiasAcum(lProcsLinea), [lProcsLinea]);

  const duracionTotal = lProcsLinea.reduce((s, p) => s + num(p.dias_estimados), 0);

  // Contar triggers desde obra_etapas (de la primera obra activa o cualquiera)
  const cantTriggers = useMemo(() => {
    const obraRef = obrasDeLinea.find(o => o.estado === "activa") ?? obrasDeLinea[0];
    if (!obraRef) return 0;
    return etapas.filter(e => e.obra_id === obraRef.id && e.genera_orden_compra === true).length;
  }, [obrasDeLinea, etapas]);

  if (obrasDeLinea.length === 0 || lProcsLinea.length === 0) return null;

  return (
    <div style={{ marginBottom: 44 }}>
      {/* Header línea */}
      <div
        onClick={() => setCollapsed(x => !x)}
        style={{
          display: "flex", alignItems: "center", gap: 12,
          paddingBottom: 16, marginBottom: 20,
          borderBottom: `1px solid ${C.b1}`,
          cursor: "pointer", userSelect: "none",
        }}
      >
        <div style={{ width: 4, height: 28, borderRadius: 99, background: linea.color ?? C.blue }} />
        <div>
          <div style={{ fontFamily: C.mono, fontSize: 24, color: C.t0, fontWeight: 700, letterSpacing: -1 }}>
            {linea.nombre}
          </div>
          {linea.descripcion && (
            <div style={{ fontSize: 11, color: C.t2, marginTop: 2 }}>{linea.descripcion}</div>
          )}
        </div>

        <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
          {duracionTotal > 0 && (
            <span style={{
              fontFamily: C.mono, fontSize: 11, color: C.blue,
              background: "rgba(59,130,246,0.07)", border: "1px solid rgba(59,130,246,0.2)",
              padding: "3px 11px", borderRadius: 4,
            }}>{duracionTotal}d</span>
          )}
          {cantTriggers > 0 && (
            <span style={{
              fontSize: 10, color: C.amber,
              background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.18)",
              padding: "3px 11px", borderRadius: 4, fontFamily: C.mono,
            }}>{cantTriggers} 🛒 triggers</span>
          )}
          <span style={{ fontSize: 9, color: C.t2, letterSpacing: 2, textTransform: "uppercase" }}>
            {obrasDeLinea.length} barco{obrasDeLinea.length !== 1 ? "s" : ""}
          </span>
        </div>
        <span style={{ marginLeft: "auto", fontSize: 10, color: C.t2 }}>
          {collapsed ? "▼ mostrar" : "▲ ocultar"}
        </span>
      </div>

      {!collapsed && obrasDeLinea.map(obra => (
        <ObraCard
          key={obra.id}
          obra={obra}
          procsConDias={procsConDias}
          etapas={etapas}
          ordenes={ordenes}
          esGestion={esGestion}
          onNuevaOC={onNuevaOC}
          defaultOpen={obra.estado === "activa"}
        />
      ))}
    </div>
  );
}

// ─── FILTROS ──────────────────────────────────────────────────────────────────
function FiltersBar({ busqueda, setBusqueda, filtroLinea, setFiltroLinea, filtroEstado, setFiltroEstado, lineas }) {
  const TabBtn = ({ active, onClick, children, accent }) => (
    <button type="button" onClick={onClick} style={{
      border: active ? `1px solid ${accent ? accent + "55" : C.b2}` : `1px solid rgba(255,255,255,0.04)`,
      borderLeft: active && accent ? `2px solid ${accent}` : undefined,
      background: active ? "rgba(255,255,255,0.06)" : "transparent",
      color: active ? C.t0 : C.t1,
      padding: "3px 12px", borderRadius: 5, cursor: "pointer",
      fontSize: 10, fontFamily: C.sans, lineHeight: 1.7,
    }}>
      {children}
    </button>
  );

  return (
    <div style={{
      padding: "7px 20px", background: "rgba(10,10,12,0.92)", ...GLASS,
      borderBottom: `1px solid ${C.b0}`,
      display: "flex", alignItems: "center", gap: 7, flexShrink: 0, flexWrap: "wrap",
    }}>
      <input
        style={{
          background: "rgba(255,255,255,0.04)", border: `1px solid ${C.b0}`,
          color: C.t0, padding: "4px 12px", borderRadius: 7,
          fontSize: 11, outline: "none", width: 190, fontFamily: C.sans,
        }}
        placeholder="🔍 Buscar obra…"
        value={busqueda}
        onChange={e => setBusqueda(e.target.value)}
      />
      <div style={{ width: 1, height: 14, background: C.b0, margin: "0 2px" }} />
      <span style={{ fontSize: 8, color: C.t2, letterSpacing: 2, textTransform: "uppercase" }}>Estado</span>
      {[["todos","Todos"],["activa","Activas"],["pausada","Pausadas"],["terminada","Terminadas"]].map(([v, l]) => (
        <TabBtn key={v} active={filtroEstado === v} onClick={() => setFiltroEstado(v)}>{l}</TabBtn>
      ))}
      <div style={{ width: 1, height: 14, background: C.b0, margin: "0 2px" }} />
      <span style={{ fontSize: 8, color: C.t2, letterSpacing: 2, textTransform: "uppercase" }}>Línea</span>
      <TabBtn active={filtroLinea === "todas"} onClick={() => setFiltroLinea("todas")}>Todas</TabBtn>
      {lineas.map(l => (
        <TabBtn key={l.id} active={filtroLinea === l.id} onClick={() => setFiltroLinea(filtroLinea === l.id ? "todas" : l.id)} accent={l.color}>
          {l.nombre}
        </TabBtn>
      ))}
    </div>
  );
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
export default function AvisosCompraView({ obras, etapas, lineas, lProcs = [], ordenes, esGestion, onNuevaOC, onEditOC }) {
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

  const lineasSinPlantilla = useMemo(() => {
    const ids = new Set(obrasFilt.map(o => o.linea_id).filter(Boolean));
    return lineas.filter(l => ids.has(l.id) && !lProcs.some(p => p.linea_id === l.id));
  }, [obrasFilt, lineas, lProcs]);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: C.sans, color: C.t0 }}>
      <FiltersBar
        busqueda={busqueda}       setBusqueda={setBusqueda}
        filtroLinea={filtroLinea} setFiltroLinea={setFiltroLinea}
        filtroEstado={filtroEstado} setFiltroEstado={setFiltroEstado}
        lineas={lineas}
      />

      <div style={{ flex: 1, overflowY: "auto", padding: "28px 28px 60px" }}>

        {lineasSinPlantilla.length > 0 && (
          <div style={{
            marginBottom: 20, padding: "10px 16px",
            background: "rgba(245,158,11,0.05)", border: "1px solid rgba(245,158,11,0.2)",
            borderRadius: 8, fontSize: 11, color: C.amber,
          }}>
            ⚠ {lineasSinPlantilla.map(l => l.nombre).join(", ")} — sin etapas en la plantilla.
            Configurá desde ⚙ en la barra de Obras.
          </div>
        )}

        {lineasConDatos.length === 0 && (
          <div style={{ textAlign: "center", padding: "80px 0", color: C.t2 }}>
            <div style={{ fontSize: 36, marginBottom: 14 }}>🔔</div>
            <div style={{ fontSize: 12, letterSpacing: 3, textTransform: "uppercase" }}>
              Sin obras con el filtro actual
            </div>
            {filtroEstado === "activa" && (
              <div style={{ fontSize: 11, color: C.t2, marginTop: 10 }}>
                Probá con "Todos" para ver obras pausadas o terminadas
              </div>
            )}
          </div>
        )}

        {lineasConDatos.map(linea => (
          <LineaSection
            key={linea.id}
            linea={linea}
            obras={obrasFilt}
            lProcs={lProcs}
            etapas={etapas}
            ordenes={ordenes}
            esGestion={esGestion}
            onNuevaOC={onNuevaOC}
          />
        ))}
      </div>
    </div>
  );
}
