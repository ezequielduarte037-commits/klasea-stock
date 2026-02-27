/**
 * PlanificacionView
 * Reemplaza AvisosCompraView — diseñado desde cero
 *
 * Props:
 *   obras        — array de produccion_obras
 *   etapas       — array de obra_etapas
 *   lProcs       — array de linea_procesos (plantilla)
 *   ordenes      — array de ordenes_compra
 *   esGestion    — boolean
 *   onNuevaOC    — callback(preload) → abre modal de OC
 *   onUpdateObra — async callback(obraId, fields) → guarda en DB
 */

import { useMemo, useState } from "react";

// ─── Tokens ───────────────────────────────────────────────────────────────────
const D = {
  bg:    "#08080d",
  side:  "#0c0c15",
  panel: "#0f0f1a",
  card:  "#131320",
  raise: "#181828",
  inp:   "#1c1c2c",

  l0: "rgba(255,255,255,0.04)",
  l1: "rgba(255,255,255,0.08)",
  l2: "rgba(255,255,255,0.13)",

  t1: "#ededf2",
  t2: "#8080a0",
  t3: "#42425a",

  am:  "#f59e0b",
  amL: "rgba(245,158,11,0.09)",
  amB: "rgba(245,158,11,0.22)",

  gn:  "#10b981",
  gnL: "rgba(16,185,129,0.09)",
  gnB: "rgba(16,185,129,0.20)",

  bl:  "#3b82f6",
  blL: "rgba(59,130,246,0.09)",
  blB: "rgba(59,130,246,0.20)",

  rd:  "#ef4444",
  rdL: "rgba(239,68,68,0.09)",
  rdB: "rgba(239,68,68,0.22)",

  sans: "'DM Sans','IBM Plex Sans',system-ui,sans-serif",
  mono: "'IBM Plex Mono','JetBrains Mono',monospace",
};

// ─── Utils ────────────────────────────────────────────────────────────────────
const num = v => { const n = Number(v); return isFinite(n) ? n : 0; };
const rd  = v => Math.round(num(v));

const fmtFull = d =>
  d ? new Date(d + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : null;

const fmtShort = d =>
  d ? new Date(d + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "short" }) : null;

const diasDesde = f =>
  f ? Math.max(0, Math.floor((Date.now() - new Date(f + "T12:00:00")) / 86400000)) : null;

function addDias(dateStr, days) {
  if (!dateStr || days == null) return null;
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function diasHasta(dateStr) {
  if (!dateStr) return null;
  return Math.round((new Date(dateStr + "T12:00:00") - Date.now()) / 86400000);
}

// Acumula días por orden de plantilla
function acumDias(procs) {
  let acc = 0;
  return [...procs]
    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
    .map(p => { const d = acc; acc += rd(p.dias_estimados); return { ...p, diaInicio: d }; });
}

// Parsea "(1) TITULO: descripcion. (2) ..." → [{ titulo, desc }]
// Filtra frases meta como "El desmolde está en ~X días"
function parseDesc(text) {
  if (!text?.trim()) return [];

  const limpiar = s => s
    .trim()
    .replace(/\.$/, "")
    .replace(/\.\s*(El|La|Los|Las)\s+\w+\s+est[aá]\s+en\s+~?\d+[^.]*\./gi, "")
    .trim();

  const partes = text.split(/\s*\(\d+\)\s+/).filter(Boolean);

  const procesar = raw => {
    const s = limpiar(raw);
    const ci = s.indexOf(":");
    if (ci > 0 && ci < 32 && /^[A-ZÁÉÍÓÚÑ\s]+$/.test(s.slice(0, ci).trim())) {
      return { titulo: s.slice(0, ci).trim(), desc: s.slice(ci + 1).trim() };
    }
    return { titulo: null, desc: s };
  };

  return partes.length > 1 ? partes.map(procesar) : [procesar(text)];
}

// ─── Átomo: Tag ───────────────────────────────────────────────────────────────
function Tag({ label, color = D.t3 }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      fontSize: 9, padding: "2px 8px", borderRadius: 3,
      background: `${color}18`, color,
      border: `1px solid ${color}28`,
      fontFamily: D.mono, fontWeight: 600,
      letterSpacing: "0.07em", textTransform: "uppercase",
      whiteSpace: "nowrap", flexShrink: 0,
    }}>{label}</span>
  );
}

// ─── Átomo: Btn ───────────────────────────────────────────────────────────────
function Btn({ onClick, children, variant = "ghost", sm = false, disabled = false }) {
  const sz  = sm ? { fontSize: 11, padding: "4px 11px" } : { fontSize: 12, padding: "7px 14px" };
  const vs  = {
    ghost:  { background: "transparent",    color: D.t2, border: `1px solid ${D.l1}` },
    fill:   { background: D.bl,             color: "#fff", border: "none" },
    amber:  { background: D.amL,            color: D.am,  border: `1px solid ${D.amB}` },
    green:  { background: D.gnL,            color: D.gn,  border: `1px solid ${D.gnB}` },
    danger: { background: D.rdL,            color: D.rd,  border: `1px solid ${D.rdB}` },
  };
  return (
    <button type="button" onClick={onClick} disabled={disabled} style={{
      ...sz, ...vs[variant],
      borderRadius: 5, cursor: disabled ? "default" : "pointer",
      fontFamily: D.sans, fontWeight: 500, outline: "none",
      opacity: disabled ? 0.45 : 1, transition: "opacity .12s",
    }}>
      {children}
    </button>
  );
}

// ─── Átomo: Divider ───────────────────────────────────────────────────────────
const HR = ({ my = 0 }) => (
  <div style={{ height: 1, background: D.l0, margin: `${my}px 0` }} />
);

// ─── Lista de obras (columna izquierda) ──────────────────────────────────────
function ObrasList({ obras, etapas, ordenes, selectedId, onSelect, filtroEstado, setFiltroEstado, busqueda, setBusqueda }) {
  return (
    <div style={{
      width: 264, flexShrink: 0, borderRight: `1px solid ${D.l1}`,
      background: D.side, display: "flex", flexDirection: "column",
      height: "100%", overflow: "hidden",
    }}>
      {/* Buscar */}
      <div style={{ padding: "12px 12px 8px" }}>
        <input
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar obra…"
          style={{
            width: "100%", background: D.inp, border: `1px solid ${D.l1}`,
            color: D.t1, padding: "7px 11px", borderRadius: 5,
            fontSize: 12, outline: "none", fontFamily: D.sans, boxSizing: "border-box",
          }}
        />
      </div>

      {/* Filtros estado */}
      <div style={{ display: "flex", gap: 3, padding: "0 12px 10px", flexWrap: "wrap" }}>
        {[["todos","Todos"],["activa","Activas"],["pausada","Pausadas"],["terminada","Terminadas"]].map(([v, l]) => {
          const act = filtroEstado === v;
          return (
            <button key={v} type="button" onClick={() => setFiltroEstado(v)} style={{
              padding: "3px 9px", borderRadius: 4, cursor: "pointer",
              fontSize: 10, fontFamily: D.sans, fontWeight: act ? 600 : 400,
              background: act ? D.bl : "transparent",
              color: act ? "#fff" : D.t3,
              border: act ? "none" : `1px solid ${D.l0}`,
              transition: "all .1s",
            }}>{l}</button>
          );
        })}
      </div>

      <HR />

      {/* Obra cards */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {obras.length === 0 && (
          <div style={{ padding: "48px 12px", textAlign: "center", fontSize: 12, color: D.t3, fontFamily: D.sans }}>
            Sin obras
          </div>
        )}
        {obras.map(o => {
          const sel       = o.id === selectedId;
          const etapasO   = etapas.filter(e => e.obra_id === o.id);
          const pend      = etapasO.filter(e =>
            e.genera_orden_compra && e.estado !== "completado" &&
            !ordenes.some(oc => oc.obra_id === o.id && oc.etapa_nombre === e.nombre)
          ).length;
          const enCurso   = etapasO.find(e => e.estado === "en_curso");
          const diasAct   = diasDesde(o.fecha_inicio);
          const stateC    = { activa: D.bl, terminada: D.gn, pausada: D.am }[o.estado] ?? D.t3;

          return (
            <div
              key={o.id}
              onClick={() => onSelect(o.id)}
              style={{
                padding: "11px 14px 10px",
                background: sel ? `${D.bl}10` : "transparent",
                borderLeft: `3px solid ${sel ? D.bl : pend > 0 ? D.am : "transparent"}`,
                borderBottom: `1px solid ${D.l0}`,
                cursor: "pointer", transition: "background .1s",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                <span style={{ fontFamily: D.mono, fontSize: 13, fontWeight: 600, color: D.t1 }}>
                  {o.codigo}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {pend > 0 && (
                    <span style={{ fontSize: 9, fontFamily: D.mono, color: D.am, background: D.amL, border: `1px solid ${D.amB}`, padding: "1px 6px", borderRadius: 2 }}>
                      {pend}
                    </span>
                  )}
                  <div style={{ width: 5, height: 5, borderRadius: "50%", background: stateC, flexShrink: 0 }} />
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {o.linea_nombre && (
                  <span style={{ fontSize: 9, color: D.t3, fontFamily: D.sans }}>{o.linea_nombre}</span>
                )}
                {diasAct !== null && o.estado === "activa" && (
                  <span style={{ fontSize: 9, fontFamily: D.mono, color: D.bl }}>día {diasAct}</span>
                )}
              </div>
              {enCurso && (
                <div style={{ fontSize: 10, color: D.t3, marginTop: 2, fontFamily: D.sans, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  ↳ {enCurso.nombre}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Ficha del barco (editable) ───────────────────────────────────────────────
function FichaBarco({ obra, onUpdateObra }) {
  const [editing, setEditing] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [form,    setForm]    = useState({});

  function openEdit() {
    setForm({
      motor_marca:      obra.motor_marca      ?? "",
      motor_modelo:     obra.motor_modelo     ?? "",
      grupo_marca:      obra.grupo_marca      ?? "",
      grupo_modelo:     obra.grupo_modelo     ?? "",
      muebles_estilo:   obra.muebles_estilo   ?? "",
      muebles_color:    obra.muebles_color    ?? "",
      muebles_tapizado: obra.muebles_tapizado ?? "",
      opcionales:       obra.opcionales       ?? "",
    });
    setEditing(true);
  }

  async function handleSave() {
    setSaving(true);
    const payload = {};
    Object.entries(form).forEach(([k, v]) => { payload[k] = v.trim() || null; });
    await onUpdateObra(obra.id, payload);
    setSaving(false);
    setEditing(false);
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const INP = {
    width: "100%", boxSizing: "border-box",
    background: D.inp, border: `1px solid ${D.l1}`,
    color: D.t1, padding: "6px 10px", borderRadius: 5,
    fontSize: 12, outline: "none", fontFamily: D.sans,
  };

  const motorStr  = [obra.motor_marca,  obra.motor_modelo].filter(Boolean).join("  ·  ");
  const grupoStr  = [obra.grupo_marca,  obra.grupo_modelo].filter(Boolean).join("  ·  ");
  const muebStr   = [obra.muebles_estilo, obra.muebles_color].filter(Boolean).join("  /  ");

  return (
    <section style={{ borderBottom: `1px solid ${D.l1}`, padding: "16px 20px" }}>
      {/* Título sección */}
      <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
        <span style={{ flex: 1, fontSize: 9, fontFamily: D.mono, color: D.t3, textTransform: "uppercase", letterSpacing: "0.1em" }}>
          Configuración del barco
        </span>
        {onUpdateObra && !editing && (
          <Btn sm onClick={openEdit}>Editar</Btn>
        )}
        {editing && (
          <div style={{ display: "flex", gap: 6 }}>
            <Btn sm onClick={() => setEditing(false)}>Cancelar</Btn>
            <Btn sm variant="fill" onClick={handleSave} disabled={saving}>
              {saving ? "Guardando…" : "Guardar"}
            </Btn>
          </div>
        )}
      </div>

      {!editing ? (
        /* ── Vista ── */
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 14 }}>
          {[
            { l: "Motor",          v: motorStr  },
            { l: "Grupo electrógeno", v: grupoStr  },
            { l: "Muebles",        v: muebStr   },
            { l: "Tapizado",       v: obra.muebles_tapizado },
          ].map(({ l, v }) => (
            <div key={l}>
              <div style={{ fontSize: 9, color: D.t3, fontFamily: D.mono, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{l}</div>
              <div style={{ fontSize: 12, color: v ? D.t1 : D.t3, fontFamily: D.sans }}>{v || "Sin definir"}</div>
            </div>
          ))}
          {obra.opcionales && (
            <div style={{ gridColumn: "1/-1" }}>
              <div style={{ fontSize: 9, color: D.t3, fontFamily: D.mono, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Opcionales / Extras</div>
              <div style={{ fontSize: 12, color: D.t2, fontFamily: D.sans, lineHeight: 1.5 }}>{obra.opcionales}</div>
            </div>
          )}
        </div>
      ) : (
        /* ── Edición ── */
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[
              ["motor_marca",      "Motor — Marca",         "Iveco, Volvo, Yanmar…"],
              ["motor_modelo",     "Motor — Modelo / HP",   "450, D4-300…"],
              ["grupo_marca",      "Grupo — Marca",         "Kohler, Onan, Lombardini…"],
              ["grupo_modelo",     "Grupo — Modelo / KVA",  "9 kva, 6 kva…"],
              ["muebles_estilo",   "Muebles — Madera",      "Roble, Wengué, Blanco…"],
              ["muebles_color",    "Muebles — Color",       "Oscuro, Natural, Blanqueado…"],
            ].map(([k, label, ph]) => (
              <div key={k}>
                <div style={{ fontSize: 10, color: D.t2, fontFamily: D.sans, marginBottom: 4 }}>{label}</div>
                <input style={INP} value={form[k]} onChange={e => set(k, e.target.value)} placeholder={ph} />
              </div>
            ))}
          </div>
          <div>
            <div style={{ fontSize: 10, color: D.t2, fontFamily: D.sans, marginBottom: 4 }}>Tapizado</div>
            <input style={INP} value={form.muebles_tapizado} onChange={e => set("muebles_tapizado", e.target.value)} placeholder="Cuero marrón, tela gris…" />
          </div>
          <div>
            <div style={{ fontSize: 10, color: D.t2, fontFamily: D.sans, marginBottom: 4 }}>Opcionales / Extras del cliente</div>
            <textarea
              style={{ ...INP, resize: "vertical", minHeight: 64 }}
              value={form.opcionales}
              onChange={e => set("opcionales", e.target.value)}
              placeholder="GPS, autopiloto, aire acondicionado, TV…"
            />
          </div>
        </div>
      )}
    </section>
  );
}

// ─── Card de una compra ───────────────────────────────────────────────────────
function CompraCard({ etapa, diaInicio, obra, oc, onNuevaOC }) {
  const [open, setOpen] = useState(false);

  const done   = etapa.estado === "completado";
  const active = etapa.estado === "en_curso";

  // Calcular fechas
  const diasPrev      = rd(etapa.orden_compra_dias_previo ?? 0);
  const fechaBase     = etapa.fecha_inicio ?? addDias(obra.fecha_inicio, diaInicio);
  const fechaLimite   = oc?.fecha_limite_pedido ?? (diasPrev > 0 ? addDias(fechaBase, -diasPrev) : null);
  const diffLimite    = diasHasta(fechaLimite);
  const urgente       = diffLimite !== null && diffLimite >= 0 && diffLimite <= 10 && !oc && !done;
  const vencido       = diffLimite !== null && diffLimite < 0 && !oc && !done;

  // Colores según estado
  const [acC, bgC, bdC] =
    done                          ? [D.gn, D.gnL, D.gnB] :
    oc?.estado === "recibida"     ? [D.gn, D.gnL, D.gnB] :
    oc                            ? [D.gn, `${D.gn}08`, D.gnB] :
    vencido                       ? [D.rd, D.rdL, D.rdB] :
    urgente                       ? [D.am, D.amL, D.amB] :
                                    [D.am, D.amL, `${D.am}28`];

  // Texto de estado
  const stLabel =
    done                        ? "Completado"  :
    oc?.estado === "recibida"   ? "Recibido"    :
    oc?.estado === "pedida"     ? "Pedido"      :
    oc                          ? "OC emitida"  :
    vencido                     ? "Atrasado"    :
    urgente                     ? "Urgente"     :
                                  "Pendiente";

  // Texto de timing — indica cuándo hay que gestionar la compra
  function textoTiming() {
    if (done) return null;

    // Si tiene OC con datos reales
    if (oc) {
      const parts = [];
      if (oc.fecha_pedido)           parts.push(`Pedido: ${fmtShort(oc.fecha_pedido)}`);
      if (oc.fecha_estimada_entrega) parts.push(`Entrega est.: ${fmtShort(oc.fecha_estimada_entrega)}`);
      if (oc.fecha_recepcion)        parts.push(`Recibido: ${fmtShort(oc.fecha_recepcion)}`);
      return parts.join("  ·  ") || null;
    }

    // Sin OC — mostrar cuándo hay que gestionarlo
    if (fechaLimite && diffLimite !== null) {
      if (diffLimite < 0)  return `Límite de pedido pasó hace ${-diffLimite}d (${fmtShort(fechaLimite)})`;
      if (diffLimite === 0) return `Límite de pedido: hoy`;
      return `Pedir antes del ${fmtFull(fechaLimite)} (en ${diffLimite}d)`;
    }
    if (diasPrev > 0) {
      return `Gestionar ${diasPrev} días antes del inicio de etapa`;
    }
    if (fechaBase) {
      const d = diasHasta(fechaBase);
      if (d !== null && d > 0)  return `Etapa prevista para ${fmtShort(fechaBase)} (en ${d}d)`;
      if (d !== null && d <= 0) return `Etapa: ${fmtShort(fechaBase)} — gestionar al completar la etapa anterior`;
    }
    if (diaInicio > 0) return `Al completar la etapa anterior (día +${diaInicio} desde inicio)`;
    return "Gestionar al inicio de la obra";
  }

  const items  = parseDesc(etapa.orden_compra_descripcion);
  const timing = textoTiming();

  return (
    <div style={{ borderRadius: 7, border: `1px solid ${bdC}`, background: bgC, overflow: "hidden" }}>
      {/* Encabezado */}
      <div
        onClick={() => setOpen(x => !x)}
        style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", cursor: "pointer" }}
      >
        {/* Dot */}
        <div style={{
          width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
          background: acC, boxShadow: (!done && !oc) ? `0 0 6px ${acC}70` : "none",
        }} />

        {/* Nombre + timing */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 600, fontFamily: D.sans, color: done ? D.t2 : D.t1 }}>
              {etapa.nombre}
            </span>
            {diaInicio >= 0 && (
              <span style={{ fontSize: 10, fontFamily: D.mono, color: D.t3 }}>+{diaInicio}d</span>
            )}
          </div>
          {timing && (
            <div style={{ fontSize: 11, color: vencido ? D.rd : urgente && !oc ? D.am : D.t3, marginTop: 2, fontFamily: D.sans }}>
              {timing}
            </div>
          )}
        </div>

        {/* Estado */}
        <Tag label={stLabel} color={acC} />

        {/* Botón crear OC */}
        {!done && !oc && onNuevaOC && (
          <Btn sm variant="amber" onClick={e => {
            e.stopPropagation();
            onNuevaOC({
              obra_id: obra.id, obra_codigo: obra.codigo,
              etapa_id: etapa.id, etapa_nombre: etapa.nombre,
              linea_nombre: obra.linea_nombre,
              tipo: etapa.orden_compra_tipo ?? "compra",
              descripcion: etapa.orden_compra_descripcion ?? null,
              monto_estimado: etapa.orden_compra_monto_estimado ?? null,
              dias_previo_aviso: etapa.orden_compra_dias_previo ?? 7,
            });
          }}>
            Crear OC
          </Btn>
        )}

        <span style={{ fontSize: 9, color: D.t3, marginLeft: 2 }}>{open ? "▲" : "▼"}</span>
      </div>

      {/* Contenido expandido */}
      {open && (
        <div style={{ borderTop: `1px solid ${bdC}`, padding: "12px 14px 14px" }}>

          {/* Ítems parseados de la descripción */}
          {items.length > 0 && (
            <div style={{ marginBottom: oc ? 14 : 0 }}>
              {items.map((it, i) => (
                <div key={i} style={{
                  paddingBottom: i < items.length - 1 ? 10 : 0,
                  marginBottom:  i < items.length - 1 ? 10 : 0,
                  borderBottom:  i < items.length - 1 ? `1px solid ${D.l0}` : "none",
                }}>
                  {it.titulo && (
                    <div style={{ fontSize: 9, fontFamily: D.mono, fontWeight: 600, color: acC, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 4 }}>
                      {it.titulo}
                    </div>
                  )}
                  <div style={{ fontSize: 12, color: D.t2, fontFamily: D.sans, lineHeight: 1.55 }}>
                    {it.desc}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Datos de OC existente */}
          {oc && (
            <div style={{
              marginTop: items.length > 0 ? 14 : 0,
              background: D.card, borderRadius: 6, padding: "10px 12px",
              border: `1px solid ${D.l1}`,
              display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10,
            }}>
              {[
                { l: "N° OC",           v: oc.numero_oc    },
                { l: "Proveedor",       v: oc.proveedor    },
                { l: "Estado",         v: oc.estado        },
                { l: "Fecha pedido",   v: fmtFull(oc.fecha_pedido)           },
                { l: "Entrega est.",   v: fmtFull(oc.fecha_estimada_entrega) },
                { l: "Recepción",      v: fmtFull(oc.fecha_recepcion)        },
                { l: "Monto est.",     v: oc.monto_estimado != null ? `$${num(oc.monto_estimado).toLocaleString("es-AR")}` : null },
                { l: "Monto real",     v: oc.monto_real    != null ? `$${num(oc.monto_real).toLocaleString("es-AR")}` : null },
              ].filter(x => x.v).map(x => (
                <div key={x.l}>
                  <div style={{ fontSize: 9, color: D.t3, fontFamily: D.mono, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>{x.l}</div>
                  <div style={{ fontSize: 12, color: D.t1, fontFamily: D.sans }}>{x.v}</div>
                </div>
              ))}
              {oc.notas && (
                <div style={{ gridColumn: "1/-1" }}>
                  <div style={{ fontSize: 9, color: D.t3, fontFamily: D.mono, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>Notas</div>
                  <div style={{ fontSize: 12, color: D.t2, fontFamily: D.sans, lineHeight: 1.5 }}>{oc.notas}</div>
                </div>
              )}
            </div>
          )}

          {/* Monto estimado sin OC */}
          {!oc && etapa.orden_compra_monto_estimado && (
            <div style={{ marginTop: items.length > 0 ? 10 : 0, fontSize: 11, color: D.t3, fontFamily: D.sans }}>
              Monto estimado:{" "}
              <span style={{ color: D.am, fontFamily: D.mono }}>
                ${num(etapa.orden_compra_monto_estimado).toLocaleString("es-AR")}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Sección de compras ───────────────────────────────────────────────────────
function ComprasSection({ obra, etapasObra, lProcsLinea, ordenes, onNuevaOC }) {
  const procsConDias = useMemo(() => acumDias(lProcsLinea), [lProcsLinea]);

  const compras = useMemo(() => {
    return etapasObra
      .filter(e => e.genera_orden_compra)
      .map(e => {
        const proc      = procsConDias.find(p => p.id === e.linea_proceso_id || p.nombre === e.nombre);
        const diaInicio = proc?.diaInicio ?? 0;
        const oc        = ordenes.find(o => o.obra_id === obra.id && (o.etapa_id === e.id || o.etapa_nombre === e.nombre));
        return { etapa: e, diaInicio, oc };
      })
      .sort((a, b) => a.diaInicio - b.diaInicio);
  }, [etapasObra, procsConDias, ordenes, obra]);

  const pend  = compras.filter(c => !c.oc && c.etapa.estado !== "completado").length;
  const conOC = compras.filter(c => !!c.oc).length;
  const done  = compras.filter(c => c.etapa.estado === "completado").length;

  if (compras.length === 0) {
    return (
      <section style={{ padding: "20px" }}>
        <div style={{ fontSize: 12, color: D.t3, fontFamily: D.sans }}>
          Sin compras configuradas para esta obra.
        </div>
      </section>
    );
  }

  return (
    <section style={{ padding: "16px 20px" }}>
      {/* Header sección */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <span style={{ fontSize: 9, fontFamily: D.mono, color: D.t3, textTransform: "uppercase", letterSpacing: "0.1em" }}>
          Compras
        </span>
        {pend  > 0 && <Tag label={`${pend} sin gestionar`}  color={D.am} />}
        {conOC > 0 && <Tag label={`${conOC} con OC`}        color={D.gn} />}
        {done  > 0 && <Tag label={`${done} completadas`}    color={D.t3} />}
      </div>

      {/* Cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {compras.map(c => (
          <CompraCard
            key={c.etapa.id}
            etapa={c.etapa}
            diaInicio={c.diaInicio}
            obra={obra}
            oc={c.oc}
            onNuevaOC={onNuevaOC}
          />
        ))}
      </div>
    </section>
  );
}

// ─── Detalle de obra (columna derecha) ────────────────────────────────────────
function ObraDetail({ obra, etapas, lProcs, ordenes, onNuevaOC, onUpdateObra }) {
  const etapasObra  = useMemo(() => etapas.filter(e => e.obra_id === obra.id), [etapas, obra.id]);
  const lProcsLinea = useMemo(() =>
    lProcs.filter(p => p.linea_id === obra.linea_id).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)),
  [lProcs, obra.linea_id]);

  const completadas = etapasObra.filter(e => e.estado === "completado").length;
  const total       = etapasObra.length;
  const pct         = total ? Math.round((completadas / total) * 100) : 0;
  const etapaAct    = etapasObra.find(e => e.estado === "en_curso");
  const diasAct     = diasDesde(obra.fecha_inicio);

  const stateColor  = { activa: D.bl, terminada: D.gn, pausada: D.am }[obra.estado] ?? D.t3;
  const stateLabel  = { activa: "Activa", terminada: "Terminada", pausada: "Pausada" }[obra.estado] ?? obra.estado;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: D.panel }}>
      {/* ── Cabecera obra ── */}
      <div style={{ padding: "16px 20px", borderBottom: `1px solid ${D.l1}`, background: D.card, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
              <span style={{ fontFamily: D.mono, fontSize: 22, fontWeight: 700, color: D.t1, letterSpacing: "0.01em" }}>
                {obra.codigo}
              </span>
              {obra.linea_nombre && <Tag label={obra.linea_nombre} color={D.t3} />}
              <Tag label={stateLabel} color={stateColor} />
            </div>

            {/* Metadatos en fila */}
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
              {obra.fecha_inicio && (
                <div>
                  <div style={{ fontSize: 9, color: D.t3, fontFamily: D.mono, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>Inicio</div>
                  <div style={{ fontSize: 12, color: D.t1, fontFamily: D.sans }}>{fmtFull(obra.fecha_inicio)}</div>
                </div>
              )}
              {diasAct !== null && obra.estado === "activa" && (
                <div>
                  <div style={{ fontSize: 9, color: D.t3, fontFamily: D.mono, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>Día</div>
                  <div style={{ fontSize: 12, color: D.bl, fontFamily: D.mono, fontWeight: 600 }}>{diasAct}</div>
                </div>
              )}
              {etapaAct && (
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 9, color: D.t3, fontFamily: D.mono, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>En curso</div>
                  <div style={{ fontSize: 12, color: D.t1, fontFamily: D.sans, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{etapaAct.nombre}</div>
                </div>
              )}
              {obra.fecha_fin_estimada && (
                <div>
                  <div style={{ fontSize: 9, color: D.t3, fontFamily: D.mono, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>Entrega est.</div>
                  <div style={{ fontSize: 12, color: D.t1, fontFamily: D.sans }}>{fmtFull(obra.fecha_fin_estimada)}</div>
                </div>
              )}
            </div>
          </div>

          {/* Progreso */}
          <div style={{ flexShrink: 0, textAlign: "right" }}>
            <div style={{ fontFamily: D.mono, fontSize: 22, fontWeight: 700, color: pct === 100 ? D.gn : D.t1, marginBottom: 6 }}>
              {pct}%
            </div>
            <div style={{ width: 90, height: 3, background: D.l1, borderRadius: 99, overflow: "hidden", marginBottom: 4 }}>
              <div style={{ height: "100%", width: `${pct}%`, background: pct === 100 ? D.gn : D.bl, borderRadius: 99, transition: "width .4s" }} />
            </div>
            <div style={{ fontSize: 10, color: D.t3, fontFamily: D.sans }}>{completadas}/{total} etapas</div>
          </div>
        </div>
      </div>

      {/* ── Contenido scroll ── */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        <FichaBarco obra={obra} onUpdateObra={onUpdateObra} />
        <ComprasSection
          obra={obra}
          etapasObra={etapasObra}
          lProcsLinea={lProcsLinea}
          ordenes={ordenes}
          onNuevaOC={onNuevaOC}
        />
      </div>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyPanel() {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: D.panel }}>
      <div style={{ fontFamily: D.mono, fontSize: 11, color: D.t3, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>
        Seleccioná una obra
      </div>
      <div style={{ fontFamily: D.sans, fontSize: 12, color: D.t3 }}>
        para ver su planificación de compras
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function PlanificacionView({ obras, etapas, lProcs = [], ordenes, esGestion, onNuevaOC, onUpdateObra }) {
  const [selectedId,   setSelectedId]   = useState(null);
  const [filtroEstado, setFiltroEstado] = useState("activa");
  const [busqueda,     setBusqueda]     = useState("");

  const obrasFilt = useMemo(() =>
    obras
      .filter(o => {
        if (filtroEstado !== "todos" && o.estado !== filtroEstado) return false;
        if (busqueda && !(o.codigo ?? "").toLowerCase().includes(busqueda.toLowerCase())) return false;
        return true;
      })
      .sort((a, b) => {
        const ord = { activa: 0, pausada: 1, terminada: 2 };
        return ((ord[a.estado] ?? 3) - (ord[b.estado] ?? 3)) ||
          new Date(b.fecha_inicio ?? 0) - new Date(a.fecha_inicio ?? 0);
      }),
  [obras, filtroEstado, busqueda]);

  // La obra actualmente visible: la seleccionada (si sigue en el filtro) o la primera
  const selectedObra = useMemo(() => {
    const inFilt = obrasFilt.find(o => o.id === selectedId);
    const target  = inFilt ?? obrasFilt[0];
    return target ? obras.find(o => o.id === target.id) : null;
  }, [selectedId, obrasFilt, obras]);

  return (
    <div style={{ flex: 1, display: "flex", overflow: "hidden", background: D.bg, fontFamily: D.sans, color: D.t1 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.07); border-radius: 2px; }
        input::placeholder, textarea::placeholder { color: ${D.t3} !important; }
        input:focus, textarea:focus { border-color: ${D.blB} !important; }
      `}</style>

      <ObrasList
        obras={obrasFilt}
        etapas={etapas}
        ordenes={ordenes}
        selectedId={selectedObra?.id ?? null}
        onSelect={id => setSelectedId(id)}
        filtroEstado={filtroEstado}
        setFiltroEstado={setFiltroEstado}
        busqueda={busqueda}
        setBusqueda={setBusqueda}
      />

      {selectedObra
        ? <ObraDetail
            obra={selectedObra}
            etapas={etapas}
            lProcs={lProcs}
            ordenes={ordenes}
            onNuevaOC={onNuevaOC}
            onUpdateObra={onUpdateObra}
          />
        : <EmptyPanel />
      }
    </div>
  );
}
