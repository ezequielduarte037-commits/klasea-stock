import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive, Check, CircleCheck, Layers3, Loader2, PackagePlus, Search, Trash2,
} from "lucide-react";
import { C } from "@/theme";
import MaterialPicker from "@/features/produccion/MaterialPicker";
import {
  assignProduccionMaterials,
  fetchProduccionMateriales,
  removeProduccionMaterial,
  updateProduccionMaterial,
} from "./produccionMaterialesApi";

const STAGE_PREFIX = "stage:";
const TASK_PREFIX = "task:";

const control = {
  minHeight: 32,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  background: C.panel,
  color: C.text,
  fontFamily: C.sans,
  fontSize: 11.5,
  outline: "none",
};

function targetForProcess(processId) {
  return `${STAGE_PREFIX}${processId}`;
}

function parseTarget(value, tasksById) {
  if (String(value).startsWith(TASK_PREFIX)) {
    const taskId = String(value).slice(TASK_PREFIX.length);
    const task = tasksById.get(taskId);
    if (task) return { processId: task.linea_proceso_id, taskId };
  }
  return {
    processId: String(value).startsWith(STAGE_PREFIX)
      ? String(value).slice(STAGE_PREFIX.length)
      : "",
    taskId: null,
  };
}

function shortQuantity(value) {
  const number = Number(value);
  return Number.isFinite(number)
    ? number.toLocaleString("es-AR", { maximumFractionDigits: 2 })
    : "1";
}

function Metric({ value, label, tone = C.text }) {
  return (
    <div style={{ minWidth: 76 }}>
      <div style={{ color: tone, fontFamily: C.mono, fontSize: 14, fontWeight: 900 }}>{value}</div>
      <div style={{ marginTop: 2, color: C.dim, fontSize: 8.5, fontWeight: 800, letterSpacing: 0.75, textTransform: "uppercase" }}>{label}</div>
    </div>
  );
}

export default function MaterialesProduccionPanel({
  linea,
  processes = [],
  tasks = [],
  selectedProcessId,
  isMobile = false,
}) {
  const processIds = useMemo(() => processes.map((row) => row.id).filter(Boolean), [processes]);
  const processKey = processIds.join("|");
  const processById = useMemo(() => new Map(processes.map((row) => [row.id, row])), [processes]);
  const tasksById = useMemo(() => new Map(tasks.map((row) => [row.id, row])), [tasks]);
  const sortedTasks = useMemo(
    () => [...tasks].sort((a, b) => {
      const stageA = processById.get(a.linea_proceso_id)?.orden ?? 999;
      const stageB = processById.get(b.linea_proceso_id)?.orden ?? 999;
      if (stageA !== stageB) return stageA - stageB;
      return (a.orden ?? 0) - (b.orden ?? 0);
    }),
    [processById, tasks],
  );

  const [data, setData] = useState({
    modelo: "",
    matrix: [],
    assignments: [],
    purchaseStagesByProcess: new Map(),
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [view, setView] = useState("pending");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [target, setTarget] = useState(() => targetForProcess(selectedProcessId));
  const [picker, setPicker] = useState(false);

  const load = useCallback(async () => {
    if (!linea?.id || !processIds.length) {
      setData({ modelo: "", matrix: [], assignments: [], purchaseStagesByProcess: new Map() });
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      setData(await fetchProduccionMateriales({ linea, processIds }));
    } catch (loadError) {
      setError(loadError.message || "No se pudieron cargar los materiales.");
    } finally {
      setLoading(false);
    }
  }, [linea, processIds]);

  useEffect(() => {
    load();
  }, [load, processKey]);

  useEffect(() => {
    if (!selectedProcessId) return;
    setTarget(targetForProcess(selectedProcessId));
    setSelected(new Set());
  }, [selectedProcessId]);

  useEffect(() => {
    if (!notice) return undefined;
    const timeout = setTimeout(() => setNotice(""), 2600);
    return () => clearTimeout(timeout);
  }, [notice]);

  const assignedMaterialIds = useMemo(
    () => new Set(data.assignments.map((row) => row.material_id)),
    [data.assignments],
  );
  const matrixIds = useMemo(() => new Set(data.matrix.map((row) => row.id)), [data.matrix]);
  const pending = useMemo(
    () => data.matrix.filter((row) => !assignedMaterialIds.has(row.id)),
    [assignedMaterialIds, data.matrix],
  );
  const covered = data.matrix.length - pending.length;
  const coverage = data.matrix.length ? Math.round((covered / data.matrix.length) * 100) : 0;
  const selectedStageAssignments = useMemo(
    () => data.assignments.filter((row) => row.linea_proceso_id === selectedProcessId),
    [data.assignments, selectedProcessId],
  );
  const filteredPending = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("es");
    if (!term) return pending;
    return pending.filter((row) =>
      `${row.descripcion || ""} ${row.codigo || ""} ${row.proveedor || ""}`
        .toLocaleLowerCase("es")
        .includes(term));
  }, [pending, query]);

  const targetOptions = useMemo(() => processes.flatMap((process) => [
    {
      value: targetForProcess(process.id),
      label: `Etapa · ${process.nombre}`,
    },
    ...sortedTasks
      .filter((task) => task.linea_proceso_id === process.id)
      .map((task) => ({
        value: `${TASK_PREFIX}${task.id}`,
        label: `Tarea · ${process.nombre} / ${task.nombre}`,
      })),
  ]), [processes, sortedTasks]);
  const assignmentTargetOptions = useMemo(
    () => targetOptions.filter((option) => {
      const parsed = parseTarget(option.value, tasksById);
      return parsed.processId === selectedProcessId;
    }),
    [selectedProcessId, targetOptions, tasksById],
  );

  const selectedTarget = parseTarget(target, tasksById);
  const purchaseStages = data.purchaseStagesByProcess.get(selectedTarget.processId) ?? [];

  function toggle(id) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelected((current) => {
      const next = new Set(current);
      const all = filteredPending.length > 0 && filteredPending.every((row) => next.has(row.id));
      filteredPending.forEach((row) => {
        if (all) next.delete(row.id);
        else next.add(row.id);
      });
      return next;
    });
  }

  async function assign(rows) {
    if (!rows.length || !selectedTarget.processId) return;
    setBusy(true);
    setError("");
    try {
      const count = await assignProduccionMaterials({
        processIds,
        processId: selectedTarget.processId,
        taskId: selectedTarget.taskId,
        materials: rows,
      });
      setSelected(new Set());
      setNotice(`${count} ${count === 1 ? "producto asignado" : "productos asignados"}.`);
      await load();
    } catch (assignError) {
      setError(assignError.message || "No se pudo guardar la asignación.");
    } finally {
      setBusy(false);
    }
  }

  async function changeTarget(row, nextTarget) {
    const parsed = parseTarget(nextTarget, tasksById);
    if (!parsed.processId) return;
    setBusy(true);
    setError("");
    try {
      await updateProduccionMaterial(row.id, {
        processId: parsed.processId,
        taskId: parsed.taskId,
      });
      setNotice("Producto reasignado.");
      await load();
    } catch (moveError) {
      setError(moveError.message || "No se pudo mover el producto.");
    } finally {
      setBusy(false);
    }
  }

  async function updateRow(row, patch) {
    setBusy(true);
    setError("");
    try {
      await updateProduccionMaterial(row.id, patch);
      setNotice("Cantidad actualizada.");
      await load();
    } catch (updateError) {
      setError(updateError.message || "No se pudo actualizar el producto.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(row) {
    setBusy(true);
    setError("");
    try {
      await removeProduccionMaterial(row.id);
      setNotice("Producto devuelto a la bandeja.");
      await load();
    } catch (removeError) {
      setError(removeError.message || "No se pudo quitar el producto.");
    } finally {
      setBusy(false);
    }
  }

  if (!selectedProcessId) return null;

  return (
    <section
      data-tour="obras-materiales-produccion"
      style={{
        margin: "0 12px 12px",
        overflow: "hidden",
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        background: C.panel,
      }}
    >
      <style>{`
        .op-material-row{transition:background .14s ease,border-color .14s ease}
        .op-material-row:hover{background:var(--panel-2)}
        .op-material-button{transition:transform .14s ease,filter .14s ease}
        .op-material-button:hover:not(:disabled){transform:translateY(-1px);filter:brightness(1.07)}
      `}</style>

      <div style={{ padding: isMobile ? 11 : "11px 13px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <span style={{
            width: 34,
            height: 34,
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
            border: `1px solid ${C.blueB}`,
            borderRadius: 10,
            background: C.blueL,
            color: C.blue,
          }}>
            <Layers3 size={17} />
          </span>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ color: C.text, fontSize: 13, fontWeight: 900 }}>Productos de producción</div>
            <div style={{ marginTop: 3, color: C.dim, fontSize: 10.5, lineHeight: 1.45 }}>
              Asigná cada producto a la etapa completa o a la tarea exacta que lo utiliza.
            </div>
          </div>
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <Metric value={data.matrix.length || "—"} label={data.modelo ? `Matriz K${data.modelo}` : "Sin matriz"} />
            <Metric value={covered} label="Asignados" tone={C.green} />
            <Metric value={pending.length} label="Pendientes" tone={pending.length ? C.amber : C.green} />
          </div>
        </div>

        {data.matrix.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div style={{ height: 5, overflow: "hidden", borderRadius: 999, background: C.panel2 }}>
              <div style={{
                width: `${coverage}%`,
                height: "100%",
                borderRadius: 999,
                background: pending.length ? C.blue : C.green,
                transition: "width .25s ease",
              }} />
            </div>
            <div style={{ marginTop: 4, color: pending.length ? C.dim : C.green, fontSize: 9.5, fontWeight: pending.length ? 650 : 850 }}>
              {pending.length
                ? `${coverage}% de la matriz ubicado en el proceso`
                : "Matriz completa: no quedan productos por ubicar"}
            </div>
          </div>
        )}
      </div>

      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        borderBottom: `1px solid ${C.border}`,
        background: C.panel2,
        flexWrap: "wrap",
      }}>
        <span style={{ color: C.dim, fontSize: 9, fontWeight: 850, letterSpacing: 0.7, textTransform: "uppercase" }}>Asignar a</span>
        <select
          value={target}
          onChange={(event) => setTarget(event.target.value)}
          style={{ ...control, flex: "1 1 260px", maxWidth: 470, padding: "5px 9px", cursor: "pointer" }}
        >
          {assignmentTargetOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setPicker(true)}
          className="op-material-button"
          disabled={busy}
          style={{
            minHeight: 32,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "5px 10px",
            border: `1px solid ${C.blueB}`,
            borderRadius: 8,
            background: C.blueL,
            color: C.blue,
            cursor: busy ? "wait" : "pointer",
            fontFamily: C.sans,
            fontSize: 11,
            fontWeight: 850,
          }}
        >
          <PackagePlus size={13} /> Buscar en catálogo completo
        </button>
      </div>

      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        minHeight: 36,
        padding: "0 12px",
        borderBottom: `1px solid ${C.border}`,
        overflowX: "auto",
      }}>
        {[
          ["pending", "Bandeja pendiente", pending.length],
          ["assigned", "Asignados a esta etapa", selectedStageAssignments.length],
        ].map(([key, label, count]) => {
          const active = view === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              style={{
                alignSelf: "stretch",
                position: "relative",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                border: 0,
                background: "transparent",
                color: active ? C.text : C.dim,
                cursor: "pointer",
                fontFamily: C.sans,
                fontSize: 10.5,
                fontWeight: active ? 850 : 700,
                whiteSpace: "nowrap",
              }}
            >
              {label}
              <span style={{ color: active ? C.blue : C.dim, fontFamily: C.mono, fontSize: 9.5 }}>{count}</span>
              {active && <span style={{ position: "absolute", right: 0, bottom: 0, left: 0, height: 2, borderRadius: 99, background: C.blue }} />}
            </button>
          );
        })}
        {busy && <span style={{ display: "inline-flex", alignItems: "center", gap: 5, marginLeft: "auto", color: C.dim, fontSize: 10 }}><Loader2 size={12} className="spin" /> Guardando</span>}
      </div>

      {error && (
        <div style={{ padding: "8px 12px", borderBottom: `1px solid ${C.redB}`, background: C.redL, color: C.red, fontSize: 10.5 }}>
          {error}
        </div>
      )}
      {notice && (
        <div style={{ padding: "8px 12px", borderBottom: `1px solid ${C.greenB}`, background: C.greenL, color: C.green, fontSize: 10.5, fontWeight: 750 }}>
          {notice}
        </div>
      )}

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 7, padding: 24, color: C.dim, fontSize: 11 }}>
          <Loader2 size={14} className="spin" /> Cargando productos…
        </div>
      ) : view === "pending" ? (
        <>
          {pending.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: `1px solid ${C.border}`, flexWrap: "wrap" }}>
              <div style={{ position: "relative", flex: "1 1 210px", maxWidth: 360 }}>
                <Search size={12} style={{ position: "absolute", top: 9, left: 9, color: C.dim, pointerEvents: "none" }} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar en la bandeja…"
                  style={{ ...control, width: "100%", boxSizing: "border-box", padding: "5px 9px 5px 27px" }}
                />
              </div>
              <button type="button" onClick={toggleAllVisible} style={{ border: 0, background: "transparent", color: C.blue, cursor: "pointer", fontFamily: C.sans, fontSize: 10.5, fontWeight: 800 }}>
                {filteredPending.length > 0 && filteredPending.every((row) => selected.has(row.id))
                  ? "Desmarcar visibles"
                  : "Seleccionar visibles"}
              </button>
              {selected.size > 0 && (
                <button
                  type="button"
                  onClick={() => assign(pending.filter((row) => selected.has(row.id)))}
                  disabled={busy}
                  className="op-material-button"
                  style={{
                    minHeight: 30,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    marginLeft: "auto",
                    padding: "5px 10px",
                    border: `1px solid ${C.greenB}`,
                    borderRadius: 8,
                    background: C.greenL,
                    color: C.green,
                    cursor: busy ? "wait" : "pointer",
                    fontFamily: C.sans,
                    fontSize: 10.5,
                    fontWeight: 900,
                  }}
                >
                  <Check size={12} /> Asignar {selected.size}
                </button>
              )}
            </div>
          )}

          {!data.matrix.length ? (
            <div style={{ display: "grid", justifyItems: "center", gap: 7, padding: "25px 14px", textAlign: "center" }}>
              <span style={{ width: 42, height: 42, display: "grid", placeItems: "center", border: `1px solid ${C.border}`, borderRadius: 13, background: C.panel2, color: C.dim }}>
                <Archive size={20} />
              </span>
              <div style={{ color: C.text, fontSize: 12, fontWeight: 900 }}>Esta línea todavía no tiene matriz</div>
              <div style={{ maxWidth: 430, color: C.dim, fontSize: 10.5, lineHeight: 1.5 }}>
                Podés empezar con “Buscar en catálogo completo” o cargar primero la lista matriz del modelo.
              </div>
            </div>
          ) : !pending.length ? (
            <div style={{ display: "grid", justifyItems: "center", gap: 7, padding: "25px 14px", textAlign: "center" }}>
              <span style={{ width: 42, height: 42, display: "grid", placeItems: "center", border: `1px solid ${C.greenB}`, borderRadius: 13, background: C.greenL, color: C.green }}>
                <CircleCheck size={21} />
              </span>
              <div style={{ color: C.text, fontSize: 12, fontWeight: 900 }}>Bandeja en cero</div>
              <div style={{ maxWidth: 390, color: C.dim, fontSize: 10.5, lineHeight: 1.5 }}>
                Todos los productos de la matriz K{data.modelo || "—"} ya tienen una etapa o tarea asignada.
              </div>
            </div>
          ) : !filteredPending.length ? (
            <div style={{ padding: 22, color: C.dim, fontSize: 11, textAlign: "center" }}>No hay productos que coincidan con “{query}”.</div>
          ) : (
            <div style={{ maxHeight: 250, overflowY: "auto" }}>
              {filteredPending.map((row) => {
                const checked = selected.has(row.id);
                return (
                  <button
                    type="button"
                    key={row.id}
                    onClick={() => toggle(row.id)}
                    className="op-material-row"
                    style={{
                      width: "100%",
                      display: "grid",
                      gridTemplateColumns: "20px minmax(0,1fr) auto",
                      alignItems: "center",
                      gap: 9,
                      padding: "8px 12px",
                      border: 0,
                      borderBottom: `1px solid ${C.border}`,
                      background: checked ? C.blueL : "transparent",
                      color: C.text,
                      cursor: "pointer",
                      textAlign: "left",
                      fontFamily: C.sans,
                    }}
                  >
                    <span style={{ width: 15, height: 15, display: "grid", placeItems: "center", border: `1px solid ${checked ? C.blue : C.border2}`, borderRadius: 4, background: checked ? C.blue : "transparent", color: "#fff" }}>
                      {checked && <Check size={10} strokeWidth={3} />}
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: "block", overflow: "hidden", color: C.text, fontSize: 11.5, fontWeight: 800, textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.descripcion}</span>
                      <span style={{ display: "flex", gap: 7, marginTop: 3, overflow: "hidden", color: C.dim, fontSize: 9.5, whiteSpace: "nowrap" }}>
                        {row.codigo && <span style={{ fontFamily: C.mono }}>{row.codigo}</span>}
                        {row.proveedor && <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{row.proveedor}</span>}
                      </span>
                    </span>
                    <span style={{ color: C.muted, fontFamily: C.mono, fontSize: 10, fontWeight: 800, whiteSpace: "nowrap" }}>
                      {shortQuantity(row.cantidad)} {row.unidad}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </>
      ) : !selectedStageAssignments.length ? (
        <div style={{ display: "grid", justifyItems: "center", gap: 7, padding: "24px 14px", color: C.dim, textAlign: "center" }}>
          <Archive size={22} strokeWidth={1.5} />
          <div style={{ fontSize: 11 }}>Esta etapa todavía no tiene productos asignados.</div>
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <div>
            {selectedStageAssignments.map((row) => {
              const material = row.material || {};
              const targetValue = row.linea_proceso_tarea_id
                ? `${TASK_PREFIX}${row.linea_proceso_tarea_id}`
                : targetForProcess(row.linea_proceso_id);
              const extra = !matrixIds.has(row.material_id);
              return (
                <div
                  key={row.id}
                  className="op-material-row"
                  style={{
                    display: "grid",
                    gridTemplateColumns: isMobile
                      ? "minmax(0,1fr) minmax(0,1fr) 28px"
                      : "minmax(180px,1fr) minmax(210px,.9fr) 72px 86px 28px",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 10px 8px 12px",
                    borderBottom: `1px solid ${C.border}`,
                  }}
                >
                  <div style={{ minWidth: 0, gridColumn: isMobile ? "1 / 3" : "auto" }}>
                    <div style={{ overflow: "hidden", color: C.text, fontSize: 11.5, fontWeight: 800, textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{material.descripcion || "Material sin nombre"}</div>
                    <div style={{ display: "flex", gap: 6, marginTop: 3, color: C.dim, fontSize: 9.5 }}>
                      {material.codigo && <span style={{ fontFamily: C.mono }}>{material.codigo}</span>}
                      {extra && <span style={{ color: C.violet, fontWeight: 800 }}>Catálogo adicional</span>}
                    </div>
                  </div>
                  <select
                    value={targetValue}
                    onChange={(event) => changeTarget(row, event.target.value)}
                    disabled={busy}
                    style={{
                      ...control,
                      width: "100%",
                      gridColumn: isMobile ? "1 / -1" : "auto",
                      padding: "4px 7px",
                      cursor: busy ? "wait" : "pointer",
                    }}
                  >
                    {targetOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                  <input
                    key={`${row.id}:${row.cantidad}`}
                    type="number"
                    min="0.01"
                    step="0.01"
                    defaultValue={row.cantidad ?? 1}
                    onBlur={(event) => {
                      if (Number(event.target.value) !== Number(row.cantidad)) updateRow(row, { cantidad: event.target.value });
                    }}
                    aria-label={`Cantidad de ${material.descripcion || "material"}`}
                    style={{ ...control, width: "100%", boxSizing: "border-box", padding: "4px 7px", fontFamily: C.mono }}
                  />
                  <input
                    key={`${row.id}:${row.unidad}`}
                    defaultValue={row.unidad || material.unidad_medida || "unidad"}
                    onBlur={(event) => {
                      if (event.target.value !== (row.unidad || material.unidad_medida || "unidad")) updateRow(row, { unidad: event.target.value });
                    }}
                    aria-label={`Unidad de ${material.descripcion || "material"}`}
                    style={{ ...control, width: "100%", boxSizing: "border-box", padding: "4px 7px" }}
                  />
                  <button
                    type="button"
                    title="Quitar y devolver a la bandeja"
                    onClick={() => remove(row)}
                    disabled={busy}
                    style={{
                      width: 27,
                      height: 27,
                      display: "grid",
                      gridColumn: isMobile ? "3" : "auto",
                      gridRow: isMobile ? "1" : "auto",
                      placeItems: "center",
                      border: 0,
                      borderRadius: 7,
                      background: "transparent",
                      color: C.red,
                      cursor: busy ? "wait" : "pointer",
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 7,
        padding: "8px 12px",
        borderTop: `1px solid ${C.border}`,
        background: purchaseStages.length ? C.greenL : C.amberL,
        color: purchaseStages.length ? C.green : C.amber,
        fontSize: 9.5,
        fontWeight: 750,
        lineHeight: 1.45,
      }}>
        {purchaseStages.length ? (
          <>
            <Check size={11} />
            Compras recibe esta etapa en: {purchaseStages.map((row) => row.nombre).join(" · ")}
          </>
        ) : (
          <>
            <Archive size={11} />
            La etapa aún no está vinculada a una tanda de compra. Los productos quedan guardados y se enviarán cuando se defina esa vinculación.
          </>
        )}
      </div>

      {picker && (
        <MaterialPicker
          titulo={`Agregar productos a ${processById.get(selectedTarget.processId)?.nombre || "producción"}`}
          yaCargados={assignedMaterialIds}
          onClose={() => setPicker(false)}
          onAdd={async (rows) => {
            await assign(rows);
            setPicker(false);
          }}
        />
      )}
    </section>
  );
}
