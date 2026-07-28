import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarRange,
  CheckCircle2,
  Clock3,
  Milestone,
  Search,
  Settings2,
  X,
} from "lucide-react";
import { supabase } from "@/supabaseClient";
import { C } from "@/theme";
import { useResponsive } from "@/hooks/useResponsive";
import {
  addProductionDays,
  getDesmoldeReference,
  nonWorkingDaysCount,
  parseISODate,
  PRODUCTION_STAGE_OFFSET_PREFIX,
  productionStageOffsetKey,
  relativeWeekLabel,
} from "@/features/obras/fechasEngine";
const MS_DIA = 86_400_000;

const ESTADO_META = {
  pendiente: { label: "Pendiente", color: C.t2, bg: C.s1, border: C.b1 },
  en_curso: { label: "En curso", color: C.blue, bg: C.blueL, border: C.blueB },
  completado: { label: "Completada", color: C.green, bg: C.greenL, border: C.greenB },
  bloqueado: { label: "Bloqueada", color: C.red, bg: C.redL, border: C.redB },
};

function diffDias(later, earlier) {
  if (!later || !earlier) return null;
  return Math.round((later.getTime() - earlier.getTime()) / MS_DIA);
}

function fechaCorta(date) {
  if (!date) return "Sin fecha";
  return date.toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "2-digit" });
}

function normalizarEstado(value) {
  if (["completado", "completada", "finalizada", "terminada"].includes(value)) return "completado";
  if (["en_curso", "en_progreso", "iniciada"].includes(value)) return "en_curso";
  if (["bloqueado", "bloqueada"].includes(value)) return "bloqueado";
  return "pendiente";
}

function colorConAlpha(color, alpha) {
  if (typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color)) return `${color}${alpha}`;
  return color;
}

function asignarCarriles(processes) {
  const laneEnds = [];
  return processes
    .slice()
    .sort((a, b) => a.offset - b.offset || a.orden - b.orden)
    .map((process) => {
      const end = process.offset + process.durationWeeks;
      let lane = laneEnds.findIndex((laneEnd) => laneEnd <= process.offset);
      if (lane < 0) lane = laneEnds.length;
      laneEnds[lane] = end;
      return { ...process, lane };
    });
}

function estadoEtapa({ etapa, process, reference, today, nonWorkingPeriods = [] }) {
  const estado = normalizarEstado(etapa?.estado);
  const meta = ESTADO_META[estado] || ESTADO_META.pendiente;
  const plannedStart = parseISODate(etapa?.fecha_inicio)
    || addProductionDays(reference, process.offset * 7, nonWorkingPeriods);
  const plannedEnd = parseISODate(etapa?.fecha_fin_estimada)
    || addProductionDays(plannedStart, process.durationDays, nonWorkingPeriods);
  const actualEnd = parseISODate(etapa?.fecha_fin_real || etapa?.fecha_fin);
  let delayDays = 0;

  if (estado === "completado" && actualEnd && plannedEnd) {
    delayDays = Math.max(0, diffDias(actualEnd, plannedEnd));
  } else if (estado !== "completado" && plannedEnd && today > plannedEnd) {
    delayDays = Math.max(0, diffDias(today, plannedEnd));
  } else if (estado === "pendiente" && plannedStart && today > plannedStart) {
    delayDays = Math.max(0, diffDias(today, plannedStart));
  }

  const atrasada = estado !== "completado" && delayDays > 0;
  return {
    estado,
    plannedStart,
    plannedEnd,
    actualEnd,
    atrasada,
    delayDays,
    color: atrasada || estado === "bloqueado" ? C.red : meta.color,
    bg: atrasada || estado === "bloqueado" ? C.redL : meta.bg,
    border: atrasada || estado === "bloqueado" ? C.redB : meta.border,
    label: atrasada ? `${delayDays}d tarde` : meta.label,
  };
}

function Stat({ icon, label, value, color = C.t0 }) {
  return (
    <div style={{
      minWidth: 130,
      padding: "9px 12px",
      borderRadius: 10,
      border: `1px solid ${C.b0}`,
      background: C.s0,
      display: "flex",
      alignItems: "center",
      gap: 9,
    }}>
      <div style={{ color, display: "flex" }}>{icon}</div>
      <div>
        <div style={{ color, fontFamily: C.mono, fontSize: 17, lineHeight: 1, fontWeight: 800 }}>{value}</div>
        <div style={{ color: C.t2, fontSize: 9.5, textTransform: "uppercase", letterSpacing: 1, marginTop: 3 }}>{label}</div>
      </div>
    </div>
  );
}

function ConfigModal({
  lineas,
  lProcs,
  offsetsMap,
  initialLineId,
  onClose,
  onSaved,
}) {
  const [lineId, setLineId] = useState(initialLineId || lineas[0]?.id || "");
  const [drafts, setDrafts] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const processes = useMemo(
    () => lProcs
      .filter((process) => process.linea_id === lineId)
      .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)),
    [lProcs, lineId],
  );

  useEffect(() => {
    const next = {};
    processes.forEach((process) => {
      const current = offsetsMap.get(process.id);
      next[process.id] = current == null ? "" : String(current);
    });
    setDrafts(next);
  }, [processes, offsetsMap]);

  async function guardar() {
    setSaving(true);
    setError("");
    try {
      const configured = processes.filter((process) => drafts[process.id] !== "");
      const cleared = processes.filter((process) => drafts[process.id] === "");

      if (cleared.length) {
        const { error: deleteError } = await supabase
          .from("fechas_offsets")
          .delete()
          .eq("modelo", "*")
          .in("evento_key", cleared.map((process) => productionStageOffsetKey(process.id)));
        if (deleteError) throw deleteError;
      }

      if (configured.length) {
        const rows = configured.map((process) => ({
          evento_key: productionStageOffsetKey(process.id),
          modelo: "*",
          semanas: Number(drafts[process.id]),
          referencia: "desmolde",
          updated_at: new Date().toISOString(),
        }));
        const { error: upsertError } = await supabase
          .from("fechas_offsets")
          .upsert(rows, { onConflict: "evento_key,modelo" });
        if (upsertError) throw upsertError;
      }

      await onSaved();
      onClose();
    } catch (err) {
      setError(err?.message || "No se pudieron guardar los offsets.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="timeline-config-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 120,
        background: "rgba(2,6,23,.62)",
        backdropFilter: "blur(8px)",
        display: "flex",
        justifyContent: "flex-end",
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div style={{
        width: "min(520px, 100vw)",
        height: "100%",
        background: C.bg1,
        borderLeft: `1px solid ${C.b1}`,
        boxShadow: "-24px 0 70px rgba(2,6,23,.35)",
        display: "flex",
        flexDirection: "column",
      }}>
        <div style={{
          padding: "18px 20px",
          borderBottom: `1px solid ${C.b0}`,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
        }}>
          <div>
            <div id="timeline-config-title" style={{ fontSize: 18, color: C.t0, fontWeight: 800 }}>
              Ubicar etapas en el cronograma
            </div>
            <div style={{ marginTop: 5, color: C.t2, fontSize: 12, lineHeight: 1.45 }}>
              Usá semanas negativas antes del desmolde y positivas después. La duración se toma de la plantilla de producción.
            </div>
          </div>
          <button
            type="button"
            aria-label="Cerrar configuración"
            onClick={onClose}
            style={{ border: 0, background: "transparent", color: C.t2, cursor: "pointer", padding: 4 }}
          >
            <X size={19} />
          </button>
        </div>

        <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.b0}` }}>
          <label style={{ display: "block", fontSize: 10, textTransform: "uppercase", letterSpacing: 1.1, color: C.t2, marginBottom: 6 }}>
            Línea de producción
          </label>
          <select
            value={lineId}
            onChange={(event) => setLineId(event.target.value)}
            style={{
              width: "100%",
              padding: "9px 11px",
              borderRadius: 8,
              border: `1px solid ${C.b1}`,
              background: C.s0,
              color: C.t0,
              fontFamily: C.sans,
            }}
          >
            {lineas.map((line) => <option key={line.id} value={line.id}>{line.nombre}</option>)}
          </select>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "14px 20px" }}>
          {!processes.length && (
            <div style={{ padding: 24, borderRadius: 10, border: `1px dashed ${C.b1}`, color: C.t2, textAlign: "center", fontSize: 12 }}>
              Esta línea todavía no tiene etapas de producción.
            </div>
          )}
          {processes.map((process) => {
            const value = drafts[process.id] ?? "";
            const numeric = value === "" ? null : Number(value);
            return (
              <div key={process.id} style={{
                display: "grid",
                gridTemplateColumns: "minmax(0,1fr) 116px",
                gap: 12,
                alignItems: "center",
                padding: "11px 0",
                borderBottom: `1px solid ${C.b0}`,
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 7, height: 7, borderRadius: 99, background: process.color || C.blue, flexShrink: 0 }} />
                    <span style={{ color: C.t0, fontSize: 12.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {process.nombre}
                    </span>
                  </div>
                  <div style={{ margin: "4px 0 0 15px", color: C.t2, fontSize: 10.5 }}>
                    {process.dias_estimados ? `${process.dias_estimados} días de duración` : "Duración sin configurar"}
                    {numeric != null && ` · ${relativeWeekLabel(numeric)}`}
                  </div>
                </div>
                <div style={{ position: "relative" }}>
                  <input
                    type="number"
                    step="0.5"
                    value={value}
                    aria-label={`Offset de ${process.nombre}`}
                    onChange={(event) => setDrafts((current) => ({ ...current, [process.id]: event.target.value }))}
                    placeholder="Ej. -4"
                    style={{
                      width: "100%",
                      padding: "8px 36px 8px 10px",
                      borderRadius: 8,
                      border: `1px solid ${value === "" ? C.b0 : C.blueB}`,
                      background: C.s0,
                      color: C.t0,
                      fontFamily: C.mono,
                      fontSize: 12,
                      outline: "none",
                    }}
                  />
                  <span style={{ position: "absolute", right: 9, top: 9, color: C.t2, fontSize: 10 }}>sem</span>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ padding: "14px 20px", borderTop: `1px solid ${C.b0}`, background: C.topbarSoft }}>
          {error && (
            <div style={{ color: C.red, fontSize: 11.5, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
              <AlertTriangle size={14} /> {error}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={onClose}
              style={{ padding: "8px 13px", borderRadius: 8, border: `1px solid ${C.b1}`, background: "transparent", color: C.t1, cursor: "pointer" }}
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={saving || !processes.length}
              onClick={guardar}
              style={{
                padding: "8px 15px",
                borderRadius: 8,
                border: `1px solid ${C.blueB}`,
                background: C.blueL,
                color: C.blue,
                cursor: saving ? "default" : "pointer",
                fontWeight: 800,
                opacity: saving || !processes.length ? 0.55 : 1,
              }}
            >
              {saving ? "Guardando…" : "Guardar cronograma"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TimelineDesmoldeView({
  obras = [],
  lineas = [],
  lProcs = [],
  etapas = [],
  timeline = [],
  nonWorkingPeriods = [],
  esGestion = false,
}) {
  const { isMobile } = useResponsive();
  const [offsetRows, setOffsetRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [lineFilter, setLineFilter] = useState("todas");
  const [stateFilter, setStateFilter] = useState("activas");
  const [configOpen, setConfigOpen] = useState(false);

  const cargarOffsets = useCallback(async () => {
    const { data, error: queryError } = await supabase
      .from("fechas_offsets")
      .select("evento_key,modelo,semanas,referencia,updated_at")
      .eq("modelo", "*")
      .like("evento_key", `${PRODUCTION_STAGE_OFFSET_PREFIX}%`);
    if (queryError) {
      setError(`No se pudo cargar la ubicación de etapas: ${queryError.message}`);
    } else {
      setError("");
      setOffsetRows(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const initialLoad = setTimeout(cargarOffsets, 0);
    const channel = supabase
      .channel("rt-obras-timeline-desmolde")
      .on("postgres_changes", { event: "*", schema: "public", table: "fechas_offsets" }, cargarOffsets)
      .subscribe();
    return () => {
      clearTimeout(initialLoad);
      supabase.removeChannel(channel);
    };
  }, [cargarOffsets]);

  const offsetsMap = useMemo(() => {
    const map = new Map();
    offsetRows.forEach((row) => {
      if (!row.evento_key?.startsWith(PRODUCTION_STAGE_OFFSET_PREFIX)) return;
      map.set(row.evento_key.slice(PRODUCTION_STAGE_OFFSET_PREFIX.length), Number(row.semanas));
    });
    return map;
  }, [offsetRows]);

  const processByLine = useMemo(() => {
    const map = new Map();
    lProcs.forEach((process) => {
      if (!map.has(process.linea_id)) map.set(process.linea_id, []);
      map.get(process.linea_id).push(process);
    });
    map.forEach((items, lineId) => {
      const configured = items
        .filter((process) => offsetsMap.has(process.id))
        .map((process) => ({
          ...process,
          orden: Number(process.orden || 0),
          offset: Number(offsetsMap.get(process.id)),
          durationDays: Math.max(0, Number(process.dias_estimados || 0)),
          durationWeeks: Math.max(0.35, Number(process.dias_estimados || 0) / 7),
        }));
      map.set(lineId, asignarCarriles(configured));
    });
    return map;
  }, [lProcs, offsetsMap]);

  const stageMap = useMemo(() => {
    const map = new Map();
    timeline.forEach((row) => {
      if (row.obra_id && row.linea_proceso_id) map.set(`${row.obra_id}|${row.linea_proceso_id}`, row);
    });
    etapas.forEach((row) => {
      if (row.obra_id && row.linea_proceso_id) map.set(`${row.obra_id}|${row.linea_proceso_id}`, row);
    });
    return map;
  }, [etapas, timeline]);

  const today = useMemo(() => {
    const value = new Date();
    value.setHours(0, 0, 0, 0);
    return value;
  }, []);

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return obras
      .filter((obra) => {
        if (stateFilter === "activas" && obra.estado !== "activa") return false;
        if (stateFilter === "no_terminadas" && obra.estado === "terminada") return false;
        if (lineFilter !== "todas" && obra.linea_id !== lineFilter) return false;
        if (query && !`${obra.codigo || ""} ${obra.descripcion || ""} ${obra.linea_nombre || ""}`.toLowerCase().includes(query)) return false;
        return true;
      })
      .map((obra) => {
        const reference = getDesmoldeReference(obra);
        const processes = processByLine.get(obra.linea_id) || [];
        const obraPeriods = nonWorkingPeriods.filter((period) => period.obra_id === obra.id);
        const stages = processes.map((process) => {
          const etapa = stageMap.get(`${obra.id}|${process.id}`);
          return {
            process,
            etapa,
            timing: estadoEtapa({
              etapa,
              process,
              reference: reference.projected,
              today,
              nonWorkingPeriods: obraPeriods,
            }),
          };
        });
        const delayed = stages.filter((stage) => stage.timing.atrasada || stage.timing.estado === "bloqueado").length;
        const current = stages.find((stage) => stage.timing.estado === "en_curso")
          || stages.find((stage) => stage.timing.estado === "pendiente");
        return {
          obra,
          reference,
          processes,
          stages,
          delayed,
          current,
          nonWorkingDays: nonWorkingDaysCount(obraPeriods),
        };
      })
      .sort((a, b) => {
        if (a.delayed !== b.delayed) return b.delayed - a.delayed;
        const dateA = a.reference.projected?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const dateB = b.reference.projected?.getTime() ?? Number.MAX_SAFE_INTEGER;
        return dateA - dateB;
      });
  }, [obras, search, stateFilter, lineFilter, processByLine, stageMap, today, nonWorkingPeriods]);

  const axis = useMemo(() => {
    const configured = [...processByLine.values()].flat();
    const minData = configured.length ? Math.min(...configured.map((process) => process.offset)) : -12;
    const maxData = configured.length
      ? Math.max(...configured.map((process) => process.offset + process.durationWeeks))
      : 24;
    const min = Math.min(-12, Math.floor(minData / 4) * 4);
    const max = Math.max(24, Math.ceil(maxData / 4) * 4);
    const ticks = [];
    for (let value = min; value <= max; value += 4) ticks.push(value);
    if (!ticks.includes(0)) ticks.push(0);
    ticks.sort((a, b) => a - b);
    return { min, max, range: max - min || 1, ticks };
  }, [processByLine]);

  const totals = useMemo(() => {
    const noDate = rows.filter((row) => !row.reference.projected).length;
    const delayed = rows.filter((row) => row.delayed > 0).length;
    const configuredIds = new Set(offsetsMap.keys());
    const missing = lProcs.filter((process) => !configuredIds.has(process.id)).length;
    return { noDate, delayed, missing };
  }, [rows, offsetsMap, lProcs]);

  const lineById = useMemo(() => new Map(lineas.map((line) => [line.id, line])), [lineas]);

  return (
    <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column", background: C.bg }}>
      <style>{`
        .otd-row { transition: background .16s ease; }
        .otd-row:hover { background: var(--panel) !important; }
        .otd-bar { transition: transform .16s ease, filter .16s ease, box-shadow .16s ease; }
        .otd-bar:hover, .otd-bar:focus-visible { transform: translateY(-1px); filter: brightness(1.08); outline: none; z-index: 4 !important; }
        .otd-control:focus { outline: none; border-color: var(--blue-border) !important; }
      `}</style>

      <div style={{
        padding: isMobile ? "14px 14px 12px" : "16px 20px 14px",
        borderBottom: `1px solid ${C.b0}`,
        background: C.bg1,
        flexShrink: 0,
      }}>
        <div style={{
          display: "flex",
          alignItems: isMobile ? "stretch" : "flex-start",
          flexDirection: isMobile ? "column" : "row",
          justifyContent: "space-between",
          gap: 14,
        }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                display: "grid",
                placeItems: "center",
                background: C.violetL,
                border: `1px solid ${C.violetB}`,
                color: C.violet,
              }}>
                <CalendarRange size={18} />
              </div>
              <div>
                <h1 style={{ margin: 0, color: C.t0, fontSize: 18, lineHeight: 1.1, fontWeight: 800 }}>
                  Línea de tiempo por desmolde
                </h1>
                <div style={{ color: C.t2, fontSize: 11.5, marginTop: 4 }}>
                  El desmolde es la semana 0. Antes se muestra en negativo y después en positivo.
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
            <span style={{ padding: "5px 9px", borderRadius: 99, color: C.t1, background: C.s0, border: `1px solid ${C.b0}`, fontSize: 10.5 }}>
              <b style={{ color: C.t0 }}>S−</b> antes
            </span>
            <span style={{ padding: "5px 9px", borderRadius: 99, color: C.violet, background: C.violetL, border: `1px solid ${C.violetB}`, fontSize: 10.5 }}>
              <b>S0</b> desmolde
            </span>
            <span style={{ padding: "5px 9px", borderRadius: 99, color: C.t1, background: C.s0, border: `1px solid ${C.b0}`, fontSize: 10.5 }}>
              <b style={{ color: C.t0 }}>S+</b> después
            </span>
            {esGestion && (
              <button
                type="button"
                onClick={() => setConfigOpen(true)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: `1px solid ${C.blueB}`,
                  background: C.blueL,
                  color: C.blue,
                  cursor: "pointer",
                  fontSize: 11,
                  fontWeight: 800,
                }}
              >
                <Settings2 size={14} /> Configurar etapas
              </button>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: 7, marginTop: 14, overflowX: "auto", paddingBottom: 1 }}>
          <Stat icon={<CalendarRange size={17} />} label="Obras visibles" value={rows.length} color={C.blue} />
          <Stat icon={<AlertTriangle size={17} />} label="Con atrasos" value={totals.delayed} color={totals.delayed ? C.red : C.green} />
          <Stat icon={<Milestone size={17} />} label="Sin desmolde" value={totals.noDate} color={totals.noDate ? C.amber : C.green} />
          <Stat icon={<Clock3 size={17} />} label="Etapas sin ubicar" value={totals.missing} color={totals.missing ? C.amber : C.green} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "minmax(220px,1fr) 170px 170px", gap: 8, marginTop: 12 }}>
          <div style={{ position: "relative", gridColumn: isMobile ? "1 / -1" : "auto" }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: 9, color: C.t2 }} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar obra, línea…"
              className="otd-control"
              style={{
                width: "100%",
                padding: "7px 10px 7px 31px",
                borderRadius: 8,
                border: `1px solid ${C.b0}`,
                background: C.s0,
                color: C.t0,
                fontFamily: C.sans,
                fontSize: 12,
              }}
            />
          </div>
          <select
            value={lineFilter}
            onChange={(event) => setLineFilter(event.target.value)}
            className="otd-control"
            aria-label="Filtrar por línea"
            style={{ padding: "7px 9px", borderRadius: 8, border: `1px solid ${C.b0}`, background: C.s0, color: C.t1, fontSize: 12 }}
          >
            <option value="todas">Todas las líneas</option>
            {lineas.map((line) => <option key={line.id} value={line.id}>{line.nombre}</option>)}
          </select>
          <select
            value={stateFilter}
            onChange={(event) => setStateFilter(event.target.value)}
            className="otd-control"
            aria-label="Filtrar por estado"
            style={{ padding: "7px 9px", borderRadius: 8, border: `1px solid ${C.b0}`, background: C.s0, color: C.t1, fontSize: 12 }}
          >
            <option value="activas">Solo activas</option>
            <option value="no_terminadas">Activas y pausadas</option>
            <option value="todas">Todas</option>
          </select>
        </div>

        {error && (
          <div style={{ marginTop: 10, color: C.red, fontSize: 11.5, display: "flex", alignItems: "center", gap: 6 }}>
            <AlertTriangle size={14} /> {error}
          </div>
        )}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        <div style={{ minWidth: isMobile ? 860 : 1040 }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "172px minmax(680px,1fr)" : "224px minmax(800px,1fr)",
            minHeight: 48,
            position: "sticky",
            top: 0,
            zIndex: 20,
            background: C.bg1,
            borderBottom: `1px solid ${C.b1}`,
          }}>
            <div style={{
              position: "sticky",
              left: 0,
              zIndex: 22,
              display: "flex",
              alignItems: "center",
              padding: "0 14px",
              background: C.bg1,
              borderRight: `1px solid ${C.b0}`,
              color: C.t2,
              fontSize: 9.5,
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: 1.2,
            }}>
              Obra / referencia
            </div>
            <div style={{ position: "relative", minHeight: 48 }}>
              {axis.ticks.map((tick) => {
                const left = ((tick - axis.min) / axis.range) * 100;
                return (
                  <div key={tick} style={{ position: "absolute", top: 0, bottom: 0, left: `${left}%`, transform: "translateX(-50%)" }}>
                    <div style={{
                      height: "100%",
                      borderLeft: `1px ${tick === 0 ? "solid" : "dashed"} ${tick === 0 ? C.violet : C.b0}`,
                      opacity: tick === 0 ? 1 : 0.85,
                    }} />
                    <span style={{
                      position: "absolute",
                      top: 16,
                      left: tick === axis.min ? 5 : 0,
                      transform: tick === axis.min ? "none" : "translateX(-50%)",
                      color: tick === 0 ? C.violet : C.t2,
                      fontFamily: C.mono,
                      fontWeight: tick === 0 ? 800 : 600,
                      fontSize: 10,
                      whiteSpace: "nowrap",
                    }}>
                      {relativeWeekLabel(tick)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {loading && (
            <div style={{ padding: 32, color: C.t2, textAlign: "center", fontSize: 12 }}>Cargando cronograma…</div>
          )}

          {!loading && !rows.length && (
            <div style={{ padding: 44, color: C.t2, textAlign: "center" }}>
              <CalendarRange size={28} style={{ marginBottom: 10, opacity: 0.55 }} />
              <div style={{ color: C.t0, fontSize: 13, fontWeight: 700 }}>No hay obras para estos filtros</div>
              <div style={{ fontSize: 11.5, marginTop: 4 }}>Probá otra línea, estado o búsqueda.</div>
            </div>
          )}

          {!loading && rows.map((row) => {
            const line = lineById.get(row.obra.linea_id);
            const laneCount = Math.max(1, ...row.processes.map((process) => process.lane + 1));
            const trackHeight = Math.max(68, laneCount * 30 + 20);
            const todayWeek = row.reference.projected ? diffDias(today, row.reference.projected) / 7 : null;
            const todayVisible = todayWeek != null && todayWeek >= axis.min && todayWeek <= axis.max;
            const todayPct = todayVisible ? ((todayWeek - axis.min) / axis.range) * 100 : null;

            return (
              <div
                key={row.obra.id}
                className="otd-row"
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "172px minmax(680px,1fr)" : "224px minmax(800px,1fr)",
                  minHeight: trackHeight,
                  borderBottom: `1px solid ${C.b0}`,
                  background: row.delayed ? "color-mix(in srgb, var(--red-soft) 28%, transparent)" : "transparent",
                }}
              >
                <div style={{
                  position: "sticky",
                  left: 0,
                  zIndex: 8,
                  padding: "11px 13px",
                  borderRight: `1px solid ${C.b0}`,
                  background: C.bg1,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ width: 7, height: 7, borderRadius: 99, background: line?.color || C.blue, boxShadow: `0 0 8px ${line?.color || C.blue}` }} />
                    <strong style={{ color: C.t0, fontFamily: C.mono, fontSize: 13 }}>{row.obra.codigo || "Sin código"}</strong>
                    {row.delayed > 0 && (
                      <span title={`${row.delayed} etapas atrasadas o bloqueadas`} style={{ color: C.red, display: "flex", marginLeft: "auto" }}>
                        <AlertTriangle size={13} />
                      </span>
                    )}
                  </div>
                  <div style={{ marginTop: 4, color: C.t2, fontSize: 10.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {line?.nombre || row.obra.linea_nombre || "Sin línea"}
                  </div>
                  {row.reference.projected ? (
                    <>
                      <div style={{ marginTop: 7, color: C.violet, fontFamily: C.mono, fontSize: 10.5, fontWeight: 700 }}>
                        S0 · {fechaCorta(row.reference.projected)}
                      </div>
                      <div style={{ marginTop: 2, color: C.t3, fontSize: 9.5 }}>
                        {row.reference.source === "real" ? "Desmolde real" : "Desmolde estimado"}
                        {row.reference.delayDays > 0 && ` · +${row.reference.delayDays}d atraso`}
                        {row.nonWorkingDays > 0 && ` · ${row.nonWorkingDays}d no laborables`}
                      </div>
                    </>
                  ) : (
                    <div style={{ marginTop: 7, color: C.amber, fontSize: 10.5, fontWeight: 700 }}>
                      Sin fecha de desmolde
                    </div>
                  )}
                </div>

                <div style={{ position: "relative", minHeight: trackHeight, overflow: "hidden" }}>
                  {axis.ticks.map((tick) => {
                    const left = ((tick - axis.min) / axis.range) * 100;
                    return (
                      <div
                        key={tick}
                        aria-hidden="true"
                        style={{
                          position: "absolute",
                          top: 0,
                          bottom: 0,
                          left: `${left}%`,
                          borderLeft: `1px ${tick === 0 ? "solid" : "dashed"} ${tick === 0 ? C.violetB : C.b0}`,
                          opacity: tick === 0 ? 0.95 : 0.65,
                        }}
                      />
                    );
                  })}

                  {todayVisible && (
                    <div style={{
                      position: "absolute",
                      top: 0,
                      bottom: 0,
                      left: `${todayPct}%`,
                      borderLeft: `1px solid ${C.amber}`,
                      zIndex: 2,
                      pointerEvents: "none",
                    }}>
                      <span style={{
                        position: "absolute",
                        top: 2,
                        left: 3,
                        color: C.amber,
                        background: C.bg1,
                        border: `1px solid ${C.amberB}`,
                        borderRadius: 4,
                        padding: "1px 4px",
                        fontSize: 8.5,
                        fontWeight: 800,
                        textTransform: "uppercase",
                      }}>
                        Hoy
                      </span>
                    </div>
                  )}

                  {!row.reference.projected && (
                    <div style={{
                      position: "absolute",
                      inset: 10,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      color: C.amber,
                      border: `1px dashed ${C.amberB}`,
                      borderRadius: 8,
                      background: C.amberL,
                      fontSize: 11.5,
                    }}>
                      <Milestone size={15} /> Cargá el desmolde estimado o real en Fechas para calcular el cronograma.
                    </div>
                  )}

                  {row.reference.projected && !row.processes.length && (
                    <div style={{
                      position: "absolute",
                      inset: 10,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      color: C.t2,
                      border: `1px dashed ${C.b1}`,
                      borderRadius: 8,
                      background: C.s0,
                      fontSize: 11.5,
                    }}>
                      <Clock3 size={15} /> Las etapas de esta línea todavía no tienen offset.
                    </div>
                  )}

                  {row.reference.projected && row.stages.map(({ process, timing }) => {
                    const left = ((process.offset - axis.min) / axis.range) * 100;
                    const width = (process.durationWeeks / axis.range) * 100;
                    const processColor = process.color || timing.color;
                    const labelColor = timing.atrasada ? C.red : timing.color;
                    return (
                      <button
                        key={process.id}
                        type="button"
                        className="otd-bar"
                        title={[
                          process.nombre,
                          `${relativeWeekLabel(process.offset)} · ${process.durationDays || "sin"} días`,
                          `${fechaCorta(timing.plannedStart)} → ${fechaCorta(timing.plannedEnd)}`,
                          timing.label,
                        ].join("\n")}
                        style={{
                          position: "absolute",
                          top: 10 + process.lane * 30,
                          left: `${left}%`,
                          width: `max(20px, ${width}%)`,
                          height: 24,
                          zIndex: 3,
                          borderRadius: 6,
                          border: `1px solid ${timing.border}`,
                          borderLeft: `3px solid ${timing.atrasada ? C.red : processColor}`,
                          background: timing.estado === "completado"
                            ? `linear-gradient(90deg, ${colorConAlpha(processColor, "35")}, ${timing.bg})`
                            : timing.bg,
                          color: labelColor,
                          cursor: "help",
                          padding: "0 7px",
                          display: "flex",
                          alignItems: "center",
                          gap: 5,
                          overflow: "hidden",
                          boxShadow: timing.atrasada ? `0 0 0 1px ${C.redB}, 0 4px 12px ${C.redL}` : "none",
                        }}
                      >
                        {timing.estado === "completado" && <CheckCircle2 size={11} style={{ flexShrink: 0 }} />}
                        {timing.atrasada && <AlertTriangle size={11} style={{ flexShrink: 0 }} />}
                        <span style={{ fontSize: 9.5, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {process.nombre}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{
        flexShrink: 0,
        padding: "7px 14px",
        borderTop: `1px solid ${C.b0}`,
        background: C.topbarSoft,
        display: "flex",
        alignItems: "center",
        gap: 14,
        overflowX: "auto",
        color: C.t2,
        fontSize: 9.5,
        whiteSpace: "nowrap",
      }}>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 7, height: 7, borderRadius: 99, background: C.green }} /> Completada</span>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 7, height: 7, borderRadius: 99, background: C.blue }} /> En curso</span>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 7, height: 7, borderRadius: 99, background: C.t2 }} /> Pendiente</span>
        <span style={{ display: "flex", alignItems: "center", gap: 5, color: C.red }}><AlertTriangle size={11} /> Atrasada o bloqueada</span>
        <span style={{ marginLeft: "auto" }}>La duración se lee de la plantilla de producción.</span>
      </div>

      {configOpen && (
        <ConfigModal
          lineas={lineas}
          lProcs={lProcs}
          offsetsMap={offsetsMap}
          initialLineId={lineFilter !== "todas" ? lineFilter : lineas[0]?.id}
          onClose={() => setConfigOpen(false)}
          onSaved={cargarOffsets}
        />
      )}
    </div>
  );
}
