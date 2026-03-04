/**
 * PlanificacionView
 * Props: obras, etapas, lProcs, ordenes, esGestion, onNuevaOC, onUpdateObra
 */
import { useMemo, useState } from "react";

// ─── Paleta: zinc neutro — sin tintes ────────────────────────────────────────
const P = {
  // Fondos zinc puros
  bg0:  "#0e0e0e",
  bg1:  "#161616",
  bg2:  "#1d1d1d",
  bg3:  "#252525",
  inp:  "#2d2d2d",

  // Bordes
  b0:   "rgba(255,255,255,0.05)",
  b1:   "rgba(255,255,255,0.09)",
  b2:   "rgba(255,255,255,0.16)",

  // Texto
  t1:   "#ececec",
  t2:   "#7e7e7e",
  t3:   "#404040",

  // Verde — completado / recibido
  or:   "#d4960d",
  orL:  "rgba(212,150,13,0.10)",
  orB:  "rgba(212,150,13,0.25)",

  gn:   "#1a9e68",
  gnL:  "rgba(26,158,104,0.08)",
  gnB:  "rgba(26,158,104,0.20)",

  bl:   "#3575b0",
  blL:  "rgba(53,117,176,0.10)",
  blB:  "rgba(53,117,176,0.22)",

  rd:   "#a83030",
  rdL:  "rgba(168,48,48,0.09)",
  rdB:  "rgba(168,48,48,0.22)",

  pu:   "#6a5a9e",

  sans: "'Inter','DM Sans',system-ui,sans-serif",
  mono: "'JetBrains Mono','Fira Mono',monospace",
};

// ─── Utils ────────────────────────────────────────────────────────────────────
const num = v => { const n = Number(v); return isFinite(n) ? n : 0; };
const rnd = v => Math.round(num(v));

const fmtD = d =>
  d ? new Date(d + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—";

const fmtS = d =>
  d ? new Date(d + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "short" }) : null;

const diasDesde = f =>
  f ? Math.max(0, Math.floor((Date.now() - new Date(f + "T12:00:00")) / 86400000)) : null;

function sumarDias(s, n) {
  if (!s) return null;
  const d = new Date(s + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10);
}
function diffDias(s) {
  if (!s) return null;
  return Math.round((new Date(s + "T12:00:00") - Date.now()) / 86400000);
}

function acumDias(procs) {
  let a = 0;
  return [...procs].sort((x, y) => (x.orden ?? 0) - (y.orden ?? 0))
    .map(p => { const d = a; a += rnd(p.dias_estimados); return { ...p, diaInicio: d }; });
}

// Parsea "(1) TITULO: texto" — filtra frases de timing vacías ("pedir HOY", etc.)
const VAGA = /^(pedir\s*(hoy|ya|ahora|urgente|en\s*\d+\s*d[ií]as?)?|sin\s*desc(ripci[oó]n)?|tbd|pendiente|-)\s*$/i;

function limpiarDesc(s) {
  return s.trim()
    .replace(/\.$/, "")
    .replace(/\.\s*(El|La|Los|Las)\s+\w+\s+est[aá]\s+en[^.]+\./gi, "")
    .trim();
}

function parseItems(raw) {
  if (!raw?.trim()) return [];
  const partes = raw.split(/\s*\(\d+\)\s+/).filter(Boolean);
  const proc = s => {
    const c  = limpiarDesc(s);
    const ci = c.indexOf(":");
    if (ci > 0 && ci < 35 && /^[A-ZÁÉÍÓÚÑ\s\-]+$/.test(c.slice(0, ci).trim())) {
      const rawDesc = c.slice(ci + 1).trim();
      return { titulo: c.slice(0, ci).trim(), desc: VAGA.test(rawDesc) ? null : rawDesc };
    }
    return { titulo: null, desc: VAGA.test(c) ? null : c };
  };
  return (partes.length > 1 ? partes.map(proc) : [proc(raw)])
    .filter(it => it.titulo || it.desc);
}

// Texto de cuándo gestionar — siempre con días o fecha, nunca "hoy" solo
function textoTiming({ oc, done, fechaLimite, fechaBase, diasPrev, diaInicio }) {
  if (done) return null;

  // Con OC: mostrar tracking real
  if (oc) {
    const p = [];
    if (oc.fecha_pedido)           p.push(`Pedido: ${fmtS(oc.fecha_pedido)}`);
    if (oc.fecha_estimada_entrega) p.push(`Entrega est.: ${fmtS(oc.fecha_estimada_entrega)}`);
    if (oc.fecha_recepcion)        p.push(`Recibido: ${fmtS(oc.fecha_recepcion)}`);
    return p.join("  ·  ") || null;
  }

  const plur = n => n === 1 ? "día" : "días";

  // Con fecha límite calculada
  const df = diffDias(fechaLimite);
  if (fechaLimite && df !== null) {
    if (df < 0)  return `Atrasado ${-df} ${plur(-df)} — límite era el ${fmtS(fechaLimite)}`;
    if (df === 0) return `Límite de pedido: ${fmtS(fechaLimite)} — gestionar en el día`;
    if (df <= 7)  return `Gestionar en ${df} ${plur(df)} — límite ${fmtS(fechaLimite)}`;
    return `Gestionar antes del ${fmtD(fechaLimite)} — en ${df} días`;
  }

  // Sin fecha límite — referencia por etapa
  if (diasPrev > 0 && fechaBase) {
    const fb = diffDias(fechaBase);
    if (fb !== null && fb > 0) {
      const diasParaPedir = fb - diasPrev;
      return diasParaPedir > 0
        ? `Gestionar en ~${diasParaPedir} ${plur(diasParaPedir)} (${diasPrev}d antes del inicio de etapa)`
        : `Gestionar ahora — etapa en ${fb} ${plur(fb)}, requiere ${diasPrev}d de anticipación`;
    }
    return `Gestionar ${diasPrev} ${plur(diasPrev)} antes del inicio de etapa`;
  }

  if (fechaBase) {
    const fb = diffDias(fechaBase);
    if (fb !== null && fb > 0)  return `Etapa prevista para el ${fmtD(fechaBase)} — en ${fb} días`;
    if (fb !== null && fb <= 0) return `Gestionar al completar la etapa anterior`;
  }

  if (diaInicio > 0) return `Al completar la etapa anterior (+${diaInicio}d desde inicio)`;
  return "Al inicio de la obra";
}

// ─── Átomo: Tag ───────────────────────────────────────────────────────────────
function Tag({ text, color = P.t3 }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      fontSize: 9, padding: "2px 7px", borderRadius: 3,
      background: `${color}15`, color,
      border: `1px solid ${color}2a`,
      fontFamily: P.mono, fontWeight: 600,
      letterSpacing: "0.06em", textTransform: "uppercase",
      whiteSpace: "nowrap", flexShrink: 0, lineHeight: 1.6,
    }}>{text}</span>
  );
}

// ─── Átomo: Dot de estado ─────────────────────────────────────────────────────
function Dot({ color, glow = false, size = 7 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: color,
      boxShadow: glow ? `0 0 7px ${color}80` : "none",
    }} />
  );
}

// ─── Átomo: Botón ─────────────────────────────────────────────────────────────
function Btn({ children, onClick, variant = "ghost", sm = false, disabled = false, type = "button" }) {
  const pad = sm ? "4px 10px" : "6px 14px";
  const fsz = sm ? 11 : 12;
  const styles = {
    ghost:  { bg: "transparent",        color: P.t2,  border: `1px solid ${P.b1}` },
    solid:  { bg: P.bl,                 color: "#fff", border: "none"              },
    orange: { bg: P.orL,               color: P.or,  border: `1px solid ${P.orB}` },
    green:  { bg: P.gnL,               color: P.gn,  border: `1px solid ${P.gnB}` },
  };
  const s = styles[variant] ?? styles.ghost;
  return (
    <button type={type} onClick={onClick} disabled={disabled} style={{
      padding: pad, fontSize: fsz, fontFamily: P.sans, fontWeight: 500,
      background: s.bg, color: s.color, border: s.border,
      borderRadius: 4, cursor: disabled ? "default" : "pointer",
      opacity: disabled ? .4 : 1, outline: "none", transition: "opacity .1s",
    }}>{children}</button>
  );
}

// ─── Input genérico ───────────────────────────────────────────────────────────
const INP_STYLE = {
  width: "100%", boxSizing: "border-box",
  background: P.inp, border: `1px solid ${P.b1}`,
  color: P.t1, padding: "6px 10px", borderRadius: 4,
  fontSize: 12, outline: "none", fontFamily: P.sans,
};

// ─── Lista izquierda ──────────────────────────────────────────────────────────
function ObrasList({ obras, etapas, ordenes, selectedId, onSelect, filtro, setFiltro, busqueda, setBusqueda }) {
  return (
    <div style={{
      width: 256, flexShrink: 0,
      background: P.bg1, borderRight: `1px solid ${P.b1}`,
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      {/* Búsqueda */}
      <div style={{ padding: "12px 12px 8px" }}>
        <input
          value={busqueda} onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar…"
          style={{ ...INP_STYLE, background: P.bg3 }}
        />
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: 3, padding: "0 12px 10px", flexWrap: "wrap" }}>
        {[["todos","Todos"],["activa","Activas"],["pausada","Pausadas"],["terminada","Terminadas"]].map(([v, l]) => {
          const a = filtro === v;
          return (
            <button key={v} type="button" onClick={() => setFiltro(v)} style={{
              padding: "3px 9px", borderRadius: 3, cursor: "pointer",
              fontSize: 10, fontFamily: P.sans, fontWeight: a ? 600 : 400,
              background: a ? P.bl : "transparent",
              color: a ? "#fff" : P.t3,
              border: a ? "none" : `1px solid ${P.b0}`,
            }}>{l}</button>
          );
        })}
      </div>

      <div style={{ height: 1, background: P.b0 }} />

      {/* Listado */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {obras.length === 0 && (
          <p style={{ padding: "40px 12px", textAlign: "center", color: P.t3, fontSize: 12, fontFamily: P.sans, margin: 0 }}>
            Sin obras
          </p>
        )}
        {obras.map(o => {
          const sel     = o.id === selectedId;
          const eO      = etapas.filter(e => e.obra_id === o.id);
          const pend    = eO.filter(e => e.genera_orden_compra && e.estado !== "completado" && !ordenes.some(oc => oc.obra_id === o.id && oc.etapa_nombre === e.nombre)).length;
          const actEt   = eO.find(e => e.estado === "en_curso");
          const dias    = diasDesde(o.fecha_inicio);
          const sc      = { activa: P.bl, terminada: P.gn, pausada: P.or }[o.estado] ?? P.t3;

          return (
            <div key={o.id} onClick={() => onSelect(o.id)} style={{
              padding: "10px 14px 9px",
              background: sel ? `${P.bl}12` : "transparent",
              borderLeft: `3px solid ${sel ? P.bl : pend > 0 ? P.or : "transparent"}`,
              borderBottom: `1px solid ${P.b0}`,
              cursor: "pointer",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                <span style={{ fontFamily: P.mono, fontSize: 13, fontWeight: 600, color: sel ? P.t1 : P.t1 }}>
                  {o.codigo}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  {pend > 0 && (
                    <span style={{ fontSize: 9, fontFamily: P.mono, color: P.or, background: P.orL, border: `1px solid ${P.orB}`, padding: "1px 5px", borderRadius: 2 }}>
                      {pend}
                    </span>
                  )}
                  <Dot color={sc} size={5} />
                </div>
              </div>
              {o.linea_nombre && (
                <div style={{ fontSize: 10, color: P.t3, fontFamily: P.sans, marginBottom: 1 }}>{o.linea_nombre}</div>
              )}
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {dias !== null && o.estado === "activa" && (
                  <span style={{ fontSize: 9, fontFamily: P.mono, color: P.bl }}>día {dias}</span>
                )}
                {actEt && (
                  <span style={{ fontSize: 9, color: P.t3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>
                    {actEt.nombre}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Ficha editable del barco ─────────────────────────────────────────────────
function FichaBarco({ obra, onUpdateObra }) {
  const [editing, setEditing] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [form,    setForm]    = useState({});

  function abrirEdicion() {
    setForm({
      motor_marca:      obra.motor_marca      ?? "",
      motor_modelo:     obra.motor_modelo     ?? "",
      grupo_marca:      obra.grupo_marca      ?? "",
      grupo_modelo:     obra.grupo_modelo     ?? "",
      muebles_estilo:   obra.muebles_estilo   ?? "",
      muebles_color:    obra.muebles_color    ?? "",
      muebles_tapizado: obra.muebles_tapizado ?? "",
      mesadas_color:    obra.mesadas_color    ?? "",
      opcionales:       obra.opcionales       ?? "",
      cocina_desc:      obra.cocina_desc      ?? "",
      bano_desc:        obra.bano_desc        ?? "",
      cockpit_desc:     obra.cockpit_desc     ?? "",
      tiene_fly:        obra.tiene_fly        ?? false,
      fly_desc:         obra.fly_desc         ?? "",
    });
    setEditing(true);
  }

  async function guardar() {
    setSaving(true);
    const payload = {};
    Object.entries(form).forEach(([k, v]) => {
      payload[k] = typeof v === "boolean" ? v : (v.trim() || null);
    });
    await onUpdateObra(obra.id, payload);
    setSaving(false);
    setEditing(false);
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Vista — grupos de datos
  const motorStr   = [obra.motor_marca,  obra.motor_modelo].filter(Boolean).join(" · ");
  const grupoStr   = [obra.grupo_marca,  obra.grupo_modelo].filter(Boolean).join(" · ");
  const hasFly     = editing ? form.tiene_fly : (obra.tiene_fly ?? false);

  const SecLabel = ({ label, color = P.t3 }) => (
    <div style={{ fontSize: 9, fontFamily: P.mono, color, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>
      {label}
    </div>
  );

  const Field = ({ label, value }) => (
    <div>
      <SecLabel label={label} />
      <div style={{ fontSize: 12, color: value ? P.t1 : P.t3, fontFamily: P.sans }}>{value || "Sin definir"}</div>
    </div>
  );

  const InpField = ({ k, label, placeholder }) => (
    <div>
      <div style={{ fontSize: 10, color: P.t2, marginBottom: 3, fontFamily: P.sans }}>{label}</div>
      <input style={INP_STYLE} value={form[k]} onChange={e => set(k, e.target.value)} placeholder={placeholder} />
    </div>
  );

  const TaField = ({ k, label, placeholder }) => (
    <div>
      <div style={{ fontSize: 10, color: P.t2, marginBottom: 3, fontFamily: P.sans }}>{label}</div>
      <textarea style={{ ...INP_STYLE, resize: "vertical", minHeight: 56 }} value={form[k]} onChange={e => set(k, e.target.value)} placeholder={placeholder} />
    </div>
  );

  // Zonas para vista
  const zonas = [
    { key: "cocina_desc",  label: "Cocina",   color: P.or },
    { key: "bano_desc",    label: "Baño",     color: P.bl },
    { key: "cockpit_desc", label: "Cockpit",  color: P.gn },
    ...(hasFly ? [{ key: "fly_desc", label: "Fly", color: P.pu }] : []),
  ];

  return (
    <section style={{ borderBottom: `1px solid ${P.b1}`, padding: "16px 20px 18px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
        <span style={{ flex: 1, fontSize: 9, fontFamily: P.mono, color: P.t3, textTransform: "uppercase", letterSpacing: "0.1em" }}>
          Configuración del barco
        </span>
        {!editing
          ? <Btn sm onClick={abrirEdicion}>Editar</Btn>
          : <div style={{ display: "flex", gap: 6 }}>
              <Btn sm onClick={() => setEditing(false)}>Cancelar</Btn>
              <Btn sm variant="solid" onClick={guardar} disabled={saving}>{saving ? "Guardando…" : "Guardar"}</Btn>
            </div>
        }
      </div>

      {!editing ? (
        /* ─── Vista ─── */
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Mecánica */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 12 }}>
            <Field label="Motor"             value={motorStr} />
            <Field label="Grupo electrógeno" value={grupoStr} />
          </div>

          {/* Muebles */}
          <div>
            <div style={{ fontSize: 9, fontFamily: P.mono, color: P.t3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Muebles & Terminaciones</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 10 }}>
              <Field label="Estilo/Madera"  value={obra.muebles_estilo}   />
              <Field label="Color muebles"  value={obra.muebles_color}    />
              <Field label="Tapizado"        value={obra.muebles_tapizado} />
              <Field label="Color mesadas"   value={obra.mesadas_color}    />
            </div>
          </div>

          {/* Zonas */}
          {zonas.some(z => obra[z.key]) && (
            <div>
              <div style={{ fontSize: 9, fontFamily: P.mono, color: P.t3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Desglose por zona</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 10 }}>
                {zonas.filter(z => obra[z.key]).map(z => (
                  <div key={z.key} style={{ background: P.bg3, borderRadius: 5, padding: "10px 12px", border: `1px solid ${P.b1}`, borderTop: `2px solid ${z.color}` }}>
                    <div style={{ fontSize: 9, fontFamily: P.mono, color: z.color, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>{z.label}</div>
                    <div style={{ fontSize: 12, color: P.t2, fontFamily: P.sans, lineHeight: 1.5 }}>{obra[z.key]}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Opcionales */}
          {obra.opcionales && (
            <Field label="Opcionales / Extras" value={obra.opcionales} />
          )}

          {/* Todo vacío */}
          {!motorStr && !grupoStr && !obra.muebles_estilo && !obra.muebles_color && !obra.mesadas_color && !obra.opcionales && (
            <p style={{ fontSize: 12, color: P.t3, fontFamily: P.sans, margin: 0 }}>
              Sin datos cargados — <button type="button" onClick={abrirEdicion} style={{ background: "none", border: "none", color: P.bl, cursor: "pointer", fontSize: 12, fontFamily: P.sans, padding: 0 }}>Editar</button>
            </p>
          )}
        </div>
      ) : (
        /* ─── Edición ─── */
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {/* Mecánica */}
          <div>
            <div style={{ fontSize: 9, fontFamily: P.mono, color: P.t3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>Mecánica</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <InpField k="motor_marca"  label="Motor — Marca"    placeholder="Iveco, Volvo, Yanmar…" />
              <InpField k="motor_modelo" label="Motor — Modelo"   placeholder="450, D4-300, 4BTA…"   />
              <InpField k="grupo_marca"  label="Grupo — Marca"    placeholder="Kohler, Onan…"         />
              <InpField k="grupo_modelo" label="Grupo — Modelo"   placeholder="9 kva, 6.5 kva…"      />
            </div>
          </div>

          {/* Muebles */}
          <div>
            <div style={{ fontSize: 9, fontFamily: P.mono, color: P.t3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>Muebles & Terminaciones</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <InpField k="muebles_estilo"   label="Estilo / Madera"   placeholder="Roble, Wengué, Blanco…"       />
              <InpField k="muebles_color"    label="Color muebles"     placeholder="Natural, Oscuro, Blanqueado…" />
              <InpField k="muebles_tapizado" label="Tapizado"          placeholder="Cuero marrón, tela gris…"     />
              <InpField k="mesadas_color"    label="Color mesadas"     placeholder="Blanco, Mármol, Negro…"       />
            </div>
          </div>

          {/* Opcionales */}
          <TaField k="opcionales" label="Opcionales / Extras" placeholder="GPS, autopiloto, aire acondicionado, TV, bow thruster…" />

          {/* Zonas */}
          <div>
            <div style={{ fontSize: 9, fontFamily: P.mono, color: P.t3, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>Desglose por zona</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <TaField k="cocina_desc"  label="Cocina"  placeholder="Mesada: mármol blanco. Bachas: inox. Canilla: Cisal inox. Cubierta mueble: Roble natural…" />
              <TaField k="bano_desc"    label="Baño"    placeholder="Mesada: mármol negro. Sanitario: Roca. Ducha: mampara vidrio esmerilado…"                  />
              <TaField k="cockpit_desc" label="Cockpit" placeholder="Tapizado asientos: cuero beige. Alfombra: gris antideslizante. Madera: teca…"              />

              {/* Fly toggle */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12, color: P.t2, fontFamily: P.sans }}>
                  <input
                    type="checkbox"
                    checked={form.tiene_fly}
                    onChange={e => set("tiene_fly", e.target.checked)}
                    style={{ width: 14, height: 14, accentColor: P.pu, cursor: "pointer" }}
                  />
                  Incluye Fly
                </label>
              </div>

              {form.tiene_fly && (
                <TaField k="fly_desc" label="Fly" placeholder="Tapizado asientos fly: cuero gris. Consola fly: fibra de vidrio. Parlantes: …" />
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// ─── Card de compra ───────────────────────────────────────────────────────────
function CompraCard({ etapa, diaInicio, obra, oc, onNuevaOC, onUpdateOCEstado }) {
  const [open, setOpen] = useState(false);

  const done     = etapa.estado === "completado";
  const diasPrev = rnd(etapa.orden_compra_dias_previo ?? 0);
  const fechaBase = etapa.fecha_inicio ?? sumarDias(obra.fecha_inicio, diaInicio);
  const fechaLimOC = oc?.fecha_limite_pedido ?? null;
  const fechaLimCalc = diasPrev > 0 ? sumarDias(fechaBase, -diasPrev) : null;
  const fechaLimite = fechaLimOC ?? fechaLimCalc;
  const df = diffDias(fechaLimite);

  const vencido  = !done && !oc && df !== null && df < 0;
  const urgente  = !done && !oc && df !== null && df >= 0 && df <= 10;

  // Estado visual
  const [ac, bg, bd] =
    done                        ? [P.gn, P.gnL, P.gnB] :
    oc?.estado === "recibida"   ? [P.gn, P.gnL, P.gnB] :
    oc                          ? [P.gn, `${P.gn}06`, P.gnB] :
    vencido                     ? [P.rd, P.rdL, P.rdB] :
    urgente                     ? [P.or, P.orL, P.orB] :
                                  [P.or, "transparent", P.b1];

  const stText =
    done                        ? "Completado"  :
    oc?.estado === "recibida"   ? "Recibido"    :
    oc?.estado === "pedida"     ? "Pedido"      :
    oc?.estado === "aprobada"   ? "Aprobado"    :
    oc                          ? "OC emitida"  :
    vencido                     ? "Atrasado"    :
    urgente                     ? "Urgente"     :
                                  "Pendiente";

  const timing = textoTiming({ oc, done, fechaLimite, fechaBase, diasPrev, diaInicio });
  const items  = parseItems(etapa.orden_compra_descripcion);

  return (
    <div style={{ borderRadius: 6, border: `1px solid ${bd}`, background: bg, overflow: "hidden", transition: "border-color .15s" }}>
      {/* Header */}
      <div onClick={() => setOpen(x => !x)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", cursor: "pointer" }}>
        <Dot color={ac} glow={!done && !oc} size={7} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: timing ? 2 : 0 }}>
            <span style={{ fontSize: 13, fontWeight: 500, fontFamily: P.sans, color: done ? P.t2 : P.t1 }}>
              {etapa.nombre}
            </span>
            <span style={{ fontSize: 10, fontFamily: P.mono, color: P.t3 }}>+{diaInicio}d</span>
          </div>
          {timing && (
            <div style={{ fontSize: 11, color: vencido ? P.rd : urgente && !oc ? P.or : P.t3, fontFamily: P.sans }}>
              {timing}
            </div>
          )}
        </div>

        <Tag text={stText} color={ac} />

        {!done && !oc && onNuevaOC && (
          <button type="button" onClick={e => {
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
          }} style={{
            padding: "3px 10px", borderRadius: 3, cursor: "pointer",
            fontSize: 10, border: `1px solid ${P.orB}`,
            background: P.orL, color: P.or,
            fontFamily: P.sans, fontWeight: 500,
          }}>
            Crear OC
          </button>
        )}

        <span style={{ fontSize: 9, color: P.t3 }}>{open ? "▲" : "▼"}</span>
      </div>

      {/* Detalle */}
      {open && (
        <div style={{ borderTop: `1px solid ${bd}`, padding: "12px 14px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Ítems de descripción */}
          {items.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {items.map((it, i) => (
                <div key={i} style={{ paddingBottom: i < items.length - 1 ? 8 : 0, borderBottom: i < items.length - 1 ? `1px solid ${P.b0}` : "none" }}>
                  {it.titulo && (
                    <div style={{ fontSize: 9, fontFamily: P.mono, color: ac, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 3 }}>
                      {it.titulo}
                    </div>
                  )}
                  <div style={{ fontSize: 12, color: P.t2, fontFamily: P.sans, lineHeight: 1.55 }}>{it.desc}</div>
                </div>
              ))}
            </div>
          )}

          {/* OC: checklist de avance + datos */}
          {oc && (() => {
            const OC_STEPS = [
              { k: "pendiente", label: "Pendiente"  },
              { k: "pedida",    label: "Pedido"     },
              { k: "aprobada",  label: "Aprobado"   },
              { k: "recibida",  label: "Recibido"   },
            ];
            const FLOW  = OC_STEPS.map(s => s.k);
            const curI  = FLOW.indexOf(oc.estado ?? "pendiente");
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {/* Stepper */}
                <div style={{ background: P.bg3, borderRadius: 5, border: `1px solid ${P.b1}`, overflow: "hidden" }}>
                  <div style={{ padding: "7px 12px 6px", borderBottom: `1px solid ${P.b0}` }}>
                    <div style={{ fontSize: 9, fontFamily: P.mono, color: P.t3, textTransform: "uppercase", letterSpacing: "0.09em" }}>Estado del pedido</div>
                  </div>
                  <div style={{ display: "flex" }}>
                    {OC_STEPS.map((st, idx) => {
                      const past   = idx < curI;
                      const active = idx === curI;
                      const next   = idx === curI + 1;
                      const clr    = past || active ? P.gn : P.t3;
                      return (
                        <div key={st.k} style={{
                          flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
                          padding: "10px 6px 10px",
                          background: active ? `${P.gn}09` : "transparent",
                          borderRight: idx < OC_STEPS.length - 1 ? `1px solid ${P.b0}` : "none",
                        }}>
                          {/* Circulo */}
                          <div style={{
                            width: 22, height: 22, borderRadius: "50%",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: past || active ? 11 : 10,
                            background: active ? P.gn : past ? P.gnL : "transparent",
                            color: past || active ? (active ? "#fff" : P.gn) : P.t3,
                            border: `1.5px solid ${active ? P.gn : past ? P.gnB : P.b1}`,
                            marginBottom: 5, fontWeight: 700,
                          }}>
                            {past || active ? "✓" : idx + 1}
                          </div>
                          <div style={{ fontSize: 9, color: clr, fontFamily: P.sans, fontWeight: active ? 600 : 400, textAlign: "center" }}>
                            {st.label}
                          </div>
                          {/* Botón solo en el siguiente paso */}
                          {next && onUpdateOCEstado && (
                            <button
                              type="button"
                              onClick={e => { e.stopPropagation(); onUpdateOCEstado(oc.id, st.k); }}
                              style={{
                                marginTop: 6, padding: "2px 8px", borderRadius: 3,
                                fontSize: 9, border: `1px solid ${P.gnB}`,
                                background: P.gnL, color: P.gn,
                                fontFamily: P.sans, cursor: "pointer", fontWeight: 500,
                              }}
                            >Marcar</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Datos */}
                <div style={{ background: P.bg3, borderRadius: 5, padding: "10px 12px", border: `1px solid ${P.b1}`, display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(130px,1fr))", gap: 10 }}>
                  {[
                    { l: "N° OC",         v: oc.numero_oc                    },
                    { l: "Proveedor",     v: oc.proveedor                    },
                    { l: "Fecha pedido",  v: fmtD(oc.fecha_pedido)           },
                    { l: "Entrega est.",  v: fmtD(oc.fecha_estimada_entrega) },
                    { l: "Recepción",     v: fmtD(oc.fecha_recepcion)        },
                    { l: "Monto est.",    v: oc.monto_estimado != null ? `$${num(oc.monto_estimado).toLocaleString("es-AR")}` : null },
                    { l: "Monto real",    v: oc.monto_real    != null ? `$${num(oc.monto_real).toLocaleString("es-AR")}`    : null },
                  ].filter(x => x.v && x.v !== "—").map(x => (
                    <div key={x.l}>
                      <div style={{ fontSize: 9, fontFamily: P.mono, color: P.t3, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>{x.l}</div>
                      <div style={{ fontSize: 12, color: P.t1, fontFamily: P.sans }}>{x.v}</div>
                    </div>
                  ))}
                  {oc.notas && (
                    <div style={{ gridColumn: "1/-1" }}>
                      <div style={{ fontSize: 9, fontFamily: P.mono, color: P.t3, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>Notas</div>
                      <div style={{ fontSize: 12, color: P.t2, fontFamily: P.sans, lineHeight: 1.5 }}>{oc.notas}</div>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Monto estimado sin OC */}
          {!oc && etapa.orden_compra_monto_estimado && (
            <div style={{ fontSize: 11, color: P.t3, fontFamily: P.sans }}>
              Monto estimado: <span style={{ color: P.or, fontFamily: P.mono }}>${num(etapa.orden_compra_monto_estimado).toLocaleString("es-AR")}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Sección de compras ───────────────────────────────────────────────────────
function ComprasSection({ obra, etapasObra, lProcsLinea, ordenes, onNuevaOC, onUpdateOCEstado }) {
  const procsConDias = useMemo(() => acumDias(lProcsLinea), [lProcsLinea]);

  const compras = useMemo(() => etapasObra
    .filter(e => e.genera_orden_compra)
    .map(e => {
      const proc = procsConDias.find(p => p.id === e.linea_proceso_id || p.nombre === e.nombre);
      const oc   = ordenes.find(o => o.obra_id === obra.id && (o.etapa_id === e.id || o.etapa_nombre === e.nombre));
      return { etapa: e, diaInicio: proc?.diaInicio ?? 0, oc };
    })
    .sort((a, b) => a.diaInicio - b.diaInicio),
  [etapasObra, procsConDias, ordenes, obra]);

  const sinOC = compras.filter(c => !c.oc && c.etapa.estado !== "completado").length;
  const conOC = compras.filter(c => !!c.oc).length;
  const done  = compras.filter(c => c.etapa.estado === "completado").length;

  if (compras.length === 0) return (
    <section style={{ padding: "18px 20px" }}>
      <p style={{ margin: 0, fontSize: 12, color: P.t3, fontFamily: P.sans }}>Sin compras configuradas para esta obra.</p>
    </section>
  );

  return (
    <section style={{ padding: "16px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <span style={{ fontSize: 9, fontFamily: P.mono, color: P.t3, textTransform: "uppercase", letterSpacing: "0.1em" }}>Compras</span>
        {sinOC > 0 && <Tag text={`${sinOC} sin gestionar`} color={P.or} />}
        {conOC > 0 && <Tag text={`${conOC} con OC`}        color={P.gn} />}
        {done  > 0 && <Tag text={`${done} completadas`}    color={P.t3} />}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {compras.map(c => (
          <CompraCard key={c.etapa.id} etapa={c.etapa} diaInicio={c.diaInicio} obra={obra} oc={c.oc} onNuevaOC={onNuevaOC} onUpdateOCEstado={onUpdateOCEstado} />
        ))}
      </div>
    </section>
  );
}

// ─── Detalle obra (panel derecho) ─────────────────────────────────────────────
function ObraDetalle({ obra, etapas, lProcs, ordenes, onNuevaOC, onUpdateObra, onUpdateOCEstado }) {
  const etapasO  = useMemo(() => etapas.filter(e => e.obra_id === obra.id), [etapas, obra.id]);
  const procsL   = useMemo(() => lProcs.filter(p => p.linea_id === obra.linea_id).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)), [lProcs, obra.linea_id]);

  const comp  = etapasO.filter(e => e.estado === "completado").length;
  const total = etapasO.length;
  const pct   = total ? Math.round(comp / total * 100) : 0;
  const actEt = etapasO.find(e => e.estado === "en_curso");
  const dias  = diasDesde(obra.fecha_inicio);
  const sc    = { activa: P.bl, terminada: P.gn, pausada: P.or }[obra.estado] ?? P.t3;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: P.bg1 }}>
      {/* Cabecera */}
      <div style={{ padding: "16px 20px", background: P.bg2, borderBottom: `1px solid ${P.b1}`, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <span style={{ fontFamily: P.mono, fontSize: 22, fontWeight: 700, color: P.t1, letterSpacing: ".01em" }}>{obra.codigo}</span>
              {obra.linea_nombre && <Tag text={obra.linea_nombre} color={P.t3} />}
              <Tag text={obra.estado} color={sc} />
            </div>
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
              {obra.fecha_inicio && <div><div style={{ fontSize: 9, fontFamily: P.mono, color: P.t3, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>Inicio</div><div style={{ fontSize: 12, color: P.t1, fontFamily: P.sans }}>{fmtD(obra.fecha_inicio)}</div></div>}
              {dias !== null && obra.estado === "activa" && <div><div style={{ fontSize: 9, fontFamily: P.mono, color: P.t3, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>Día actual</div><div style={{ fontSize: 12, color: P.bl, fontFamily: P.mono, fontWeight: 600 }}>{dias}</div></div>}
              {actEt && <div><div style={{ fontSize: 9, fontFamily: P.mono, color: P.t3, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>En curso</div><div style={{ fontSize: 12, color: P.t1, fontFamily: P.sans }}>{actEt.nombre}</div></div>}
              {obra.fecha_fin_estimada && <div><div style={{ fontSize: 9, fontFamily: P.mono, color: P.t3, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>Entrega est.</div><div style={{ fontSize: 12, color: P.t1, fontFamily: P.sans }}>{fmtD(obra.fecha_fin_estimada)}</div></div>}
            </div>
          </div>
          <div style={{ flexShrink: 0, textAlign: "right" }}>
            <div style={{ fontFamily: P.mono, fontSize: 22, fontWeight: 700, color: pct === 100 ? P.gn : P.t1, marginBottom: 6 }}>{pct}%</div>
            <div style={{ width: 88, height: 3, background: P.b1, borderRadius: 2, overflow: "hidden", marginBottom: 4 }}>
              <div style={{ height: "100%", width: `${pct}%`, background: pct === 100 ? P.gn : P.bl, borderRadius: 2, transition: "width .4s" }} />
            </div>
            <div style={{ fontSize: 10, color: P.t3, fontFamily: P.sans }}>{comp}/{total} etapas</div>
          </div>
        </div>
      </div>

      {/* Contenido scrollable */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        <FichaBarco obra={obra} onUpdateObra={onUpdateObra} />
        <ComprasSection obra={obra} etapasObra={etapasO} lProcsLinea={procsL} ordenes={ordenes} onNuevaOC={onNuevaOC} onUpdateOCEstado={onUpdateOCEstado} />
      </div>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function Vacio() {
  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: P.bg1 }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 11, fontFamily: P.mono, color: P.t3, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 6 }}>
          Seleccioná una obra
        </div>
        <div style={{ fontSize: 12, color: P.t3, fontFamily: P.sans }}>para ver su planificación de compras</div>
      </div>
    </div>
  );
}

// ─── Principal ────────────────────────────────────────────────────────────────
export default function PlanificacionView({ obras, etapas, lProcs = [], ordenes, esGestion, onNuevaOC, onUpdateObra, onUpdateOCEstado }) {
  const [selectedId, setSelectedId] = useState(null);
  const [filtro,     setFiltro]     = useState("activa");
  const [busqueda,   setBusqueda]   = useState("");

  const obrasFilt = useMemo(() =>
    obras
      .filter(o => {
        if (filtro !== "todos" && o.estado !== filtro) return false;
        if (busqueda && !(o.codigo ?? "").toLowerCase().includes(busqueda.toLowerCase())) return false;
        return true;
      })
      .sort((a, b) => {
        const ord = { activa: 0, pausada: 1, terminada: 2 };
        return ((ord[a.estado] ?? 3) - (ord[b.estado] ?? 3)) ||
          new Date(b.fecha_inicio ?? 0) - new Date(a.fecha_inicio ?? 0);
      }),
  [obras, filtro, busqueda]);

  const selectedObra = useMemo(() => {
    const inFilt = obrasFilt.find(o => o.id === selectedId);
    const target = inFilt ?? obrasFilt[0];
    return target ? obras.find(o => o.id === target.id) : null;
  }, [selectedId, obrasFilt, obras]);

  return (
    <div style={{ flex: 1, display: "flex", overflow: "hidden", background: P.bg0, fontFamily: P.sans, color: P.t1 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 2px; }
        input::placeholder, textarea::placeholder { color: ${P.t3} !important; }
        input:focus, textarea:focus { border-color: ${P.blB} !important; }
        button:active { opacity: .75; }
      `}</style>

      <ObrasList
        obras={obrasFilt} etapas={etapas} ordenes={ordenes}
        selectedId={selectedObra?.id ?? null}
        onSelect={setSelectedId}
        filtro={filtro} setFiltro={setFiltro}
        busqueda={busqueda} setBusqueda={setBusqueda}
      />

      {selectedObra
        ? <ObraDetalle obra={selectedObra} etapas={etapas} lProcs={lProcs} ordenes={ordenes} onNuevaOC={onNuevaOC} onUpdateObra={onUpdateObra} onUpdateOCEstado={onUpdateOCEstado} />
        : <Vacio />
      }
    </div>
  );
}
