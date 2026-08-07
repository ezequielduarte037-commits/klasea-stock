import { useCallback, useEffect, useMemo, useState } from "react";
import { Briefcase, Check, ChevronRight, HardHat, ListChecks, Plus, Save, Search, ShieldCheck, UserRound, UsersRound, X } from "lucide-react";
import { C } from "@/theme";
import { supabase } from "@/supabaseClient";
import {
  crearOficio,
  fetchAsignacionesVigentes,
  fetchOficioCategorias,
  fetchOficios,
  guardarCategoriasDeOficio,
  guardarFichaOperativaEmpleado,
  guardarFichasOperativasEmpleados,
} from "./api";
import { BTN_PRIMARY, INP, LBL, Cargando, ErrorBox } from "./ui";

const clean = (value) => String(value || "").trim().toLocaleLowerCase("es");

function initials(name) {
  return String(name || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function sameSet(left, right) {
  if (left.size !== right.size) return false;
  for (const value of left) if (!right.has(value)) return false;
  return true;
}

function Metric({ label, value, color, active = false, onClick }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      style={{
        border: `1px solid ${active ? color : C.b0}`,
        background: active ? `${color}12` : C.s0,
        borderRadius: 10,
        padding: "8px 11px",
        display: "flex",
        alignItems: "center",
        gap: 8,
        minWidth: 0,
        cursor: onClick ? "pointer" : "default",
        color: C.t0,
        fontFamily: C.sans,
        textAlign: "left",
      }}
    >
      <span style={{ color, fontFamily: C.mono, fontSize: 17, fontWeight: 950 }}>{value}</span>
      <span style={{ color: active ? color : C.t2, fontSize: 10.5, fontWeight: 850 }}>{label}</span>
    </Tag>
  );
}

function EmployeeRow({ empleado, oficio, obras, active, selected, disabled, onClick, onToggleSelection }) {
  const configured = !!oficio && obras.length > 0;
  return (
    <div
      style={{
        width: "100%",
        display: "grid",
        gridTemplateColumns: "24px 34px minmax(0, 1fr)",
        alignItems: "center",
        gap: 9,
        padding: "9px 10px",
        borderRadius: 10,
        border: `1px solid ${selected || active ? C.blueB : C.b0}`,
        background: selected ? C.blueL : active ? C.s1 : C.panelSolid,
        color: C.t0,
        textAlign: "left",
        fontFamily: C.sans,
        transition: "border-color .15s ease, background .15s ease, transform .15s ease",
      }}
    >
      <button
        type="button"
        disabled={disabled}
        aria-label={`${selected ? "Quitar" : "Seleccionar"} ${empleado.nombre}`}
        onClick={onToggleSelection}
        style={{ width: 20, height: 20, borderRadius: 6, display: "grid", placeItems: "center", padding: 0, border: `1px solid ${selected ? C.blue : C.b1}`, background: selected ? C.blue : "transparent", color: "white", cursor: disabled ? "default" : "pointer", opacity: disabled ? .5 : 1 }}
      >
        {selected && <Check size={12} strokeWidth={3} />}
      </button>
      <span style={{ width: 34, height: 34, borderRadius: 10, display: "grid", placeItems: "center", background: configured ? C.greenL : C.s1, border: `1px solid ${configured ? C.greenB : C.b0}`, color: configured ? C.green : C.t2, fontSize: 10.5, fontWeight: 950 }}>
        {initials(empleado.nombre)}
      </span>
      <button type="button" onClick={onClick} style={{ minWidth: 0, padding: 0, border: "none", background: "transparent", color: C.t0, cursor: "pointer", textAlign: "left", fontFamily: C.sans, display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{ display: "block", color: C.t0, fontSize: 12.5, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{empleado.nombre}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 3, minWidth: 0, color: C.t2, fontSize: 10.5 }}>
            <span style={{ color: oficio ? C.blue : C.amber, fontWeight: 800 }}>{oficio?.nombre || "Sin oficio"}</span>
            <span>·</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {obras.length ? obras.map((obra) => obra.obra?.codigo || "Obra").join(", ") : "Sin obra"}
            </span>
          </span>
        </span>
        <ChevronRight size={15} style={{ flexShrink: 0, color: active ? C.blue : C.t3 }} />
      </button>
    </div>
  );
}

function WorkToggle({ obra, selected, disabled, onClick }) {
  const finished = ["terminada", "cancelada", "archivada"].includes(obra.estado);
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        minWidth: 0,
        display: "flex",
        alignItems: "center",
        gap: 9,
        padding: "9px 10px",
        borderRadius: 10,
        border: `1px solid ${selected ? C.blueB : C.b0}`,
        background: selected ? C.blueL : C.panelSolid,
        color: selected ? C.blue : C.t1,
        cursor: disabled ? "default" : "pointer",
        opacity: finished && !selected ? 0.62 : 1,
        fontFamily: C.sans,
        textAlign: "left",
      }}
    >
      <span style={{ width: 18, height: 18, borderRadius: 6, display: "grid", placeItems: "center", flexShrink: 0, border: `1px solid ${selected ? C.blue : C.b1}`, background: selected ? C.blue : "transparent", color: "white" }}>
        {selected && <Check size={12} strokeWidth={3} />}
      </span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: "block", color: selected ? C.blue : C.t0, fontSize: 12, fontWeight: 900 }}>{obra.codigo}</span>
        <span style={{ display: "block", color: C.t2, fontSize: 9.5, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {[obra.linea_nombre, finished ? obra.estado : "activa"].filter(Boolean).join(" · ")}
        </span>
      </span>
    </button>
  );
}

export default function OficiosObrasTab({ empleados = [], esAdmin = false, isMobile = false, onChanged }) {
  const [view, setView] = useState("personas");
  const [oficios, setOficios] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [oficioCats, setOficioCats] = useState([]);
  const [asignaciones, setAsignaciones] = useState([]);
  const [obras, setObras] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("activos");
  const [pendingOnly, setPendingOnly] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState(new Set());
  const [draftOffice, setDraftOffice] = useState("");
  const [draftWorks, setDraftWorks] = useState(new Set());
  const [workQuery, setWorkQuery] = useState("");
  const [showFinished, setShowFinished] = useState(false);
  const [bulkOffice, setBulkOffice] = useState("__keep__");
  const [bulkWorks, setBulkWorks] = useState(new Set());
  const [bulkWorksMode, setBulkWorksMode] = useState("agregar");
  const [bulkWorkQuery, setBulkWorkQuery] = useState("");
  const [bulkShowFinished, setBulkShowFinished] = useState(false);
  const [notice, setNotice] = useState("");
  const [openOffice, setOpenOffice] = useState("");
  const [newOffice, setNewOffice] = useState("");

  const cargar = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setCargando(true);
    setError("");
    try {
      const [officeRows, categoryResult, links, assignments, worksResult] = await Promise.all([
        fetchOficios(),
        supabase.from("panol_categorias").select("id, nombre").order("nombre"),
        fetchOficioCategorias(),
        fetchAsignacionesVigentes(),
        supabase.from("produccion_obras").select("id, codigo, estado, linea_nombre").order("codigo"),
      ]);
      if (categoryResult.error) throw categoryResult.error;
      if (worksResult.error) throw worksResult.error;
      setOficios(officeRows.filter((office) => office.activo !== false));
      setCategorias(categoryResult.data || []);
      setOficioCats(links);
      setAsignaciones(assignments);
      setObras(worksResult.data || []);
    } catch (cause) {
      setError(cause.message || "No se pudo cargar la configuración operativa.");
    } finally {
      if (!silent) setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const officeById = useMemo(() => new Map(oficios.map((office) => [office.id, office])), [oficios]);
  const assignmentsByEmployee = useMemo(() => {
    const map = new Map();
    asignaciones.forEach((assignment) => {
      if (!map.has(assignment.empleado_id)) map.set(assignment.empleado_id, []);
      map.get(assignment.empleado_id).push(assignment);
    });
    return map;
  }, [asignaciones]);
  const catsByOffice = useMemo(() => {
    const map = new Map();
    oficioCats.forEach((row) => {
      if (!map.has(row.oficio_id)) map.set(row.oficio_id, new Set());
      map.get(row.oficio_id).add(row.categoria_id);
    });
    return map;
  }, [oficioCats]);

  const metrics = useMemo(() => {
    const active = empleados.filter((employee) => employee.activo !== false);
    return {
      active: active.length,
      configured: active.filter((employee) => employee.oficio_id && (assignmentsByEmployee.get(employee.id) || []).length).length,
      noOffice: active.filter((employee) => !employee.oficio_id).length,
      noWork: active.filter((employee) => !(assignmentsByEmployee.get(employee.id) || []).length).length,
    };
  }, [assignmentsByEmployee, empleados]);

  const visibleEmployees = useMemo(() => {
    const term = clean(query);
    return [...empleados]
      .filter((employee) => statusFilter === "todos" || (statusFilter === "activos" ? employee.activo !== false : employee.activo === false))
      .filter((employee) => {
        if (!pendingOnly) return true;
        return !employee.oficio_id || !(assignmentsByEmployee.get(employee.id) || []).length;
      })
      .filter((employee) => {
        if (!term) return true;
        const office = officeById.get(employee.oficio_id)?.nombre || "";
        const works = (assignmentsByEmployee.get(employee.id) || []).map((assignment) => assignment.obra?.codigo).join(" ");
        return clean(`${employee.nombre} ${employee.dni || ""} ${employee.sede || ""} ${office} ${works}`).includes(term);
      })
      .sort((left, right) => left.nombre.localeCompare(right.nombre, "es"));
  }, [assignmentsByEmployee, empleados, officeById, pendingOnly, query, statusFilter]);

  useEffect(() => {
    if (!visibleEmployees.length) {
      setSelectedId("");
      return;
    }
    if (!visibleEmployees.some((employee) => employee.id === selectedId)) setSelectedId(visibleEmployees[0].id);
  }, [selectedId, visibleEmployees]);

  const selectedEmployee = empleados.find((employee) => employee.id === selectedId) || null;
  const selectedAssignments = useMemo(() => assignmentsByEmployee.get(selectedId) || [], [assignmentsByEmployee, selectedId]);
  useEffect(() => {
    setDraftOffice(selectedEmployee?.oficio_id || "");
    setDraftWorks(new Set(selectedAssignments.map((assignment) => assignment.obra_id)));
    setWorkQuery("");
  }, [selectedAssignments, selectedEmployee?.id, selectedEmployee?.oficio_id]);

  const initialWorks = useMemo(() => new Set(selectedAssignments.map((assignment) => assignment.obra_id)), [selectedAssignments]);
  const dirty = !!selectedEmployee && (draftOffice !== (selectedEmployee.oficio_id || "") || !sameSet(draftWorks, initialWorks));

  const visibleWorks = useMemo(() => {
    const term = clean(workQuery);
    return obras
      .filter((obra) => showFinished || !["terminada", "cancelada", "archivada"].includes(obra.estado) || draftWorks.has(obra.id))
      .filter((obra) => !term || clean(`${obra.codigo} ${obra.linea_nombre || ""}`).includes(term))
      .sort((left, right) => String(left.codigo).localeCompare(String(right.codigo), "es", { numeric: true }));
  }, [draftWorks, obras, showFinished, workQuery]);

  const bulkVisibleWorks = useMemo(() => {
    const term = clean(bulkWorkQuery);
    return obras
      .filter((obra) => bulkShowFinished || !["terminada", "cancelada", "archivada"].includes(obra.estado) || bulkWorks.has(obra.id))
      .filter((obra) => !term || clean(`${obra.codigo} ${obra.linea_nombre || ""}`).includes(term))
      .sort((left, right) => String(left.codigo).localeCompare(String(right.codigo), "es", { numeric: true }));
  }, [bulkShowFinished, bulkWorkQuery, bulkWorks, obras]);

  const selectedEmployees = useMemo(
    () => empleados.filter((employee) => selectedEmployeeIds.has(employee.id)),
    [empleados, selectedEmployeeIds],
  );
  const allVisibleSelected = visibleEmployees.length > 0 && visibleEmployees.every((employee) => selectedEmployeeIds.has(employee.id));
  const bulkHasChanges = bulkOffice !== "__keep__" || bulkWorks.size > 0;

  function toggleWork(obraId) {
    if (!esAdmin) return;
    setDraftWorks((current) => {
      const next = new Set(current);
      if (next.has(obraId)) next.delete(obraId);
      else next.add(obraId);
      return next;
    });
  }

  function toggleEmployeeSelection(employeeId) {
    if (!esAdmin) return;
    setNotice("");
    setSelectedEmployeeIds((current) => {
      const next = new Set(current);
      if (next.has(employeeId)) next.delete(employeeId);
      else next.add(employeeId);
      return next;
    });
  }

  function toggleVisibleSelection() {
    if (!esAdmin || !visibleEmployees.length) return;
    setNotice("");
    setSelectedEmployeeIds((current) => {
      const next = new Set(current);
      visibleEmployees.forEach((employee) => {
        if (allVisibleSelected) next.delete(employee.id);
        else next.add(employee.id);
      });
      return next;
    });
  }

  function clearBulkSelection() {
    setSelectedEmployeeIds(new Set());
    setBulkOffice("__keep__");
    setBulkWorks(new Set());
    setBulkWorksMode("agregar");
    setBulkWorkQuery("");
  }

  function toggleBulkWork(obraId) {
    if (!esAdmin) return;
    setBulkWorks((current) => {
      const next = new Set(current);
      if (next.has(obraId)) next.delete(obraId);
      else next.add(obraId);
      return next;
    });
  }

  async function saveEmployee() {
    if (!selectedEmployee || !dirty || guardando) return;
    setGuardando(`employee:${selectedEmployee.id}`);
    setError("");
    try {
      await guardarFichaOperativaEmpleado({
        empleadoId: selectedEmployee.id,
        oficioId: draftOffice || null,
        obraIds: [...draftWorks],
      });
      await Promise.all([cargar({ silent: true }), onChanged?.()]);
    } catch (cause) {
      setError(cause.message || "No se pudieron guardar el oficio y las obras.");
    } finally {
      setGuardando("");
    }
  }

  async function saveBulkEmployees() {
    if (!selectedEmployeeIds.size || !bulkHasChanges || guardando) return;
    const count = selectedEmployeeIds.size;
    setGuardando("bulk");
    setError("");
    setNotice("");
    try {
      await guardarFichasOperativasEmpleados({
        empleadoIds: [...selectedEmployeeIds],
        aplicarOficio: bulkOffice !== "__keep__",
        oficioId: bulkOffice === "__none__" ? null : bulkOffice,
        obraIds: [...bulkWorks],
        modoObras: bulkWorks.size ? bulkWorksMode : "conservar",
      });
      clearBulkSelection();
      setNotice(`Cambios aplicados a ${count} ${count === 1 ? "persona" : "personas"}.`);
      await Promise.all([cargar({ silent: true }), onChanged?.()]);
    } catch (cause) {
      setError(cause.message || "No se pudieron aplicar los cambios al grupo.");
    } finally {
      setGuardando("");
    }
  }

  async function toggleCategory(officeId, categoryId) {
    if (!esAdmin) return;
    const current = new Set(catsByOffice.get(officeId) || []);
    if (current.has(categoryId)) current.delete(categoryId);
    else current.add(categoryId);
    setGuardando(`office:${officeId}`);
    setError("");
    try {
      await guardarCategoriasDeOficio(officeId, [...current]);
      setOficioCats(await fetchOficioCategorias());
    } catch (cause) {
      setError(cause.message || "No se pudieron guardar las categorías.");
    } finally {
      setGuardando("");
    }
  }

  async function addOffice() {
    const name = newOffice.trim();
    if (!name || guardando) return;
    setGuardando("new-office");
    setError("");
    try {
      const created = await crearOficio({ nombre: name });
      setNewOffice("");
      await cargar({ silent: true });
      setOpenOffice(created.id);
    } catch (cause) {
      setError(cause.message || "No se pudo crear el oficio.");
    } finally {
      setGuardando("");
    }
  }

  if (cargando) return <Cargando />;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {error && <ErrorBox error={error} onRetry={cargar} />}
      {notice && <div style={{ border: `1px solid ${C.greenB}`, background: C.greenL, color: C.green, borderRadius: 10, padding: "9px 11px", fontSize: 11.5, fontWeight: 850 }}>{notice}</div>}

      <section style={{ border: `1px solid ${C.b0}`, background: C.s0, borderRadius: 13, padding: "11px 12px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ width: 34, height: 34, borderRadius: 10, display: "grid", placeItems: "center", background: C.blueL, border: `1px solid ${C.blueB}`, color: C.blue }}><UsersRound size={17} /></span>
        <span style={{ flex: "1 1 250px", minWidth: 0 }}>
          <span style={{ display: "block", color: C.t0, fontSize: 14, fontWeight: 950 }}>Organización del equipo</span>
          <span style={{ display: "block", color: C.t2, fontSize: 10.5, marginTop: 2 }}>Una persona tiene un oficio y puede estar asignada a varias obras al mismo tiempo.</span>
        </span>
        <div style={{ display: "inline-flex", gap: 3, padding: 3, border: `1px solid ${C.b0}`, borderRadius: 9, background: C.panelSolid }}>
          {[
            ["personas", "Personas y obras", <UserRound key="people-icon" size={13} />],
            ["reglas", "Reglas por oficio", <ShieldCheck key="rules-icon" size={13} />],
          ].map(([key, label, icon]) => (
            <button key={key} type="button" onClick={() => setView(key)} style={{ display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${view === key ? C.blueB : "transparent"}`, background: view === key ? C.blueL : "transparent", color: view === key ? C.blue : C.t2, borderRadius: 7, padding: "6px 9px", cursor: "pointer", fontFamily: C.sans, fontSize: 11, fontWeight: 900, whiteSpace: "nowrap" }}>
              {icon} {label}
            </button>
          ))}
        </div>
      </section>

      {view === "personas" ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(4, minmax(120px, 1fr))", gap: 7 }}>
            <Metric label="empleados activos" value={metrics.active} color={C.blue} />
            <Metric label="configurados" value={metrics.configured} color={C.green} />
            <Metric label="sin oficio" value={metrics.noOffice} color={C.amber} active={pendingOnly} onClick={() => setPendingOnly((value) => !value)} />
            <Metric label="sin obra" value={metrics.noWork} color={C.red} active={pendingOnly} onClick={() => setPendingOnly((value) => !value)} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(300px, .82fr) minmax(440px, 1.35fr)", gap: 10, alignItems: "start" }}>
            <section style={{ border: `1px solid ${C.b0}`, background: C.s0, borderRadius: 13, overflow: "hidden" }}>
              <div style={{ padding: 10, borderBottom: `1px solid ${C.b0}`, display: "grid", gap: 7, background: C.panelSolid }}>
                <div style={{ position: "relative" }}>
                  <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.t3 }} />
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar nombre, DNI, oficio u obra…" style={{ ...INP, width: "100%", paddingLeft: 31 }} />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                  {[["activos", "Activos"], ["todos", "Todos"], ["baja", "Ex empleados"]].map(([key, label]) => (
                    <button key={key} type="button" onClick={() => setStatusFilter(key)} style={{ border: `1px solid ${statusFilter === key ? C.blueB : C.b0}`, background: statusFilter === key ? C.blueL : "transparent", color: statusFilter === key ? C.blue : C.t2, borderRadius: 999, padding: "4px 8px", cursor: "pointer", fontFamily: C.sans, fontSize: 10.5, fontWeight: 850 }}>{label}</button>
                  ))}
                  <button type="button" onClick={() => setPendingOnly((value) => !value)} style={{ marginLeft: "auto", border: `1px solid ${pendingOnly ? C.amberB : C.b0}`, background: pendingOnly ? C.amberL : "transparent", color: pendingOnly ? C.amber : C.t2, borderRadius: 999, padding: "4px 8px", cursor: "pointer", fontFamily: C.sans, fontSize: 10.5, fontWeight: 850 }}>Solo pendientes</button>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ color: C.t3, fontSize: 9.5 }}>{visibleEmployees.length} personas visibles</span>
                  {esAdmin && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {!!selectedEmployeeIds.size && <button type="button" onClick={clearBulkSelection} style={{ border: "none", background: "transparent", color: C.t2, padding: 2, cursor: "pointer", fontFamily: C.sans, fontSize: 9.5, fontWeight: 800 }}>Limpiar</button>}
                      <button type="button" onClick={toggleVisibleSelection} disabled={!visibleEmployees.length} style={{ display: "inline-flex", alignItems: "center", gap: 5, border: `1px solid ${allVisibleSelected ? C.blueB : C.b0}`, background: allVisibleSelected ? C.blueL : "transparent", color: allVisibleSelected ? C.blue : C.t2, borderRadius: 7, padding: "4px 7px", cursor: visibleEmployees.length ? "pointer" : "default", fontFamily: C.sans, fontSize: 9.5, fontWeight: 850 }}>
                        <ListChecks size={11} /> {allVisibleSelected ? "Quitar visibles" : "Seleccionar visibles"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <div style={{ display: "grid", gap: 5, padding: 7, maxHeight: isMobile ? 350 : 620, overflowY: "auto" }}>
                {visibleEmployees.map((employee) => (
                  <EmployeeRow
                    key={employee.id}
                    empleado={employee}
                    oficio={officeById.get(employee.oficio_id)}
                    obras={assignmentsByEmployee.get(employee.id) || []}
                    active={employee.id === selectedId}
                    selected={selectedEmployeeIds.has(employee.id)}
                    disabled={!esAdmin}
                    onClick={() => setSelectedId(employee.id)}
                    onToggleSelection={() => toggleEmployeeSelection(employee.id)}
                  />
                ))}
                {!visibleEmployees.length && <div style={{ padding: 28, color: C.t2, fontSize: 12, textAlign: "center" }}>No hay empleados con esos filtros.</div>}
              </div>
            </section>

            <section style={{ border: `1px solid ${selectedEmployee || selectedEmployeeIds.size ? C.blueB : C.b0}`, background: C.s0, borderRadius: 13, overflow: "hidden", position: isMobile ? "static" : "sticky", top: 10 }}>
              {selectedEmployeeIds.size ? (
                <>
                  <div style={{ padding: "12px 13px", borderBottom: `1px solid ${C.b0}`, background: C.blueL, display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ width: 38, height: 38, borderRadius: 11, display: "grid", placeItems: "center", background: C.blue, color: "white" }}><UsersRound size={18} /></span>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: "block", color: C.blue, fontSize: 14, fontWeight: 950 }}>Edición masiva</span>
                      <span style={{ display: "block", color: C.t2, fontSize: 10.5, marginTop: 2 }}>{selectedEmployeeIds.size} personas seleccionadas</span>
                    </span>
                    <button type="button" onClick={clearBulkSelection} aria-label="Cerrar edición masiva" style={{ width: 30, height: 30, display: "grid", placeItems: "center", border: `1px solid ${C.b0}`, borderRadius: 8, background: C.panelSolid, color: C.t2, cursor: "pointer" }}><X size={14} /></button>
                  </div>

                  <div style={{ padding: 13, display: "grid", gap: 13 }}>
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap", maxHeight: 58, overflowY: "auto" }}>
                      {selectedEmployees.map((employee) => (
                        <span key={employee.id} style={{ display: "inline-flex", alignItems: "center", gap: 5, border: `1px solid ${C.b0}`, background: C.panelSolid, color: C.t1, borderRadius: 999, padding: "4px 7px", fontSize: 9.5, fontWeight: 800 }}>
                          {employee.nombre}
                          <button type="button" onClick={() => toggleEmployeeSelection(employee.id)} aria-label={`Quitar ${employee.nombre}`} style={{ padding: 0, border: "none", background: "transparent", color: C.t3, cursor: "pointer", lineHeight: 0 }}><X size={10} /></button>
                        </span>
                      ))}
                    </div>

                    <div>
                      <label style={LBL}>Oficio para el grupo</label>
                      <select value={bulkOffice} onChange={(event) => setBulkOffice(event.target.value)} disabled={!esAdmin} style={{ ...INP, width: "100%", minHeight: 36 }}>
                        <option value="__keep__">No cambiar los oficios actuales</option>
                        <option value="__none__">Quitar el oficio asignado</option>
                        {oficios.map((office) => <option key={office.id} value={office.id}>Aplicar {office.nombre}</option>)}
                      </select>
                      <div style={{ color: C.t3, fontSize: 9.5, marginTop: 4 }}>El oficio elegido se aplica a todas las personas seleccionadas.</div>
                    </div>

                    <div style={{ borderTop: `1px solid ${C.b0}`, paddingTop: 12 }}>
                      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                        <div>
                          <div style={{ color: C.t0, fontSize: 12.5, fontWeight: 950 }}>Obras para el grupo</div>
                          <div style={{ color: C.t2, fontSize: 10, marginTop: 2 }}>Elegí una o varias obras y cómo aplicarlas.</div>
                        </div>
                        <span style={{ border: `1px solid ${bulkWorks.size ? C.blueB : C.b0}`, background: bulkWorks.size ? C.blueL : C.panelSolid, color: bulkWorks.size ? C.blue : C.t2, borderRadius: 999, padding: "4px 8px", fontSize: 10, fontWeight: 900 }}>{bulkWorks.size} seleccionadas</span>
                      </div>

                      <div style={{ display: "inline-flex", gap: 3, padding: 3, border: `1px solid ${C.b0}`, borderRadius: 8, background: C.panelSolid, marginTop: 8 }}>
                        {[["agregar", "Sumar a las actuales"], ["reemplazar", "Reemplazar actuales"]].map(([key, label]) => (
                          <button key={key} type="button" onClick={() => setBulkWorksMode(key)} style={{ border: `1px solid ${bulkWorksMode === key ? C.blueB : "transparent"}`, background: bulkWorksMode === key ? C.blueL : "transparent", color: bulkWorksMode === key ? C.blue : C.t2, borderRadius: 6, padding: "5px 8px", cursor: "pointer", fontFamily: C.sans, fontSize: 9.5, fontWeight: 850 }}>{label}</button>
                        ))}
                      </div>

                      <div style={{ display: "flex", gap: 7, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <div style={{ position: "relative", flex: "1 1 200px" }}>
                          <Search size={13} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: C.t3 }} />
                          <input value={bulkWorkQuery} onChange={(event) => setBulkWorkQuery(event.target.value)} placeholder="Buscar obra…" style={{ ...INP, width: "100%", paddingLeft: 29 }} />
                        </div>
                        <label style={{ display: "inline-flex", alignItems: "center", gap: 5, color: C.t2, fontSize: 10.5, cursor: "pointer" }}>
                          <input type="checkbox" checked={bulkShowFinished} onChange={(event) => setBulkShowFinished(event.target.checked)} /> finalizadas
                        </label>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(150px, 1fr))", gap: 6, maxHeight: 260, overflowY: "auto", padding: "7px 1px 1px", marginTop: 2 }}>
                        {bulkVisibleWorks.map((obra) => <WorkToggle key={obra.id} obra={obra} selected={bulkWorks.has(obra.id)} disabled={!esAdmin} onClick={() => toggleBulkWork(obra.id)} />)}
                        {!bulkVisibleWorks.length && <div style={{ gridColumn: "1 / -1", padding: 20, color: C.t2, fontSize: 11.5, textAlign: "center" }}>No hay obras con ese filtro.</div>}
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, borderTop: `1px solid ${C.b0}`, paddingTop: 11, flexWrap: "wrap" }}>
                      <span style={{ color: bulkWorksMode === "reemplazar" && bulkWorks.size ? C.amber : C.t3, fontSize: 10.5, fontWeight: bulkWorksMode === "reemplazar" && bulkWorks.size ? 850 : 600 }}>
                        {bulkWorksMode === "reemplazar" && bulkWorks.size ? "Las obras actuales serán reemplazadas." : "Solo se modifican los datos que elijas."}
                      </span>
                      {esAdmin && <button type="button" onClick={saveBulkEmployees} disabled={!bulkHasChanges || !!guardando} style={{ ...BTN_PRIMARY, minHeight: 34, opacity: !bulkHasChanges || guardando ? 0.55 : 1 }}><Save size={13} /> {guardando === "bulk" ? "Aplicando…" : `Aplicar a ${selectedEmployeeIds.size}`}</button>}
                    </div>
                  </div>
                </>
              ) : selectedEmployee ? (
                <>
                  <div style={{ padding: "12px 13px", borderBottom: `1px solid ${C.b0}`, background: C.panelSolid, display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ width: 38, height: 38, borderRadius: 11, display: "grid", placeItems: "center", background: C.blueL, border: `1px solid ${C.blueB}`, color: C.blue, fontWeight: 950 }}>{initials(selectedEmployee.nombre)}</span>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: "block", color: C.t0, fontSize: 14, fontWeight: 950, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selectedEmployee.nombre}</span>
                      <span style={{ display: "block", color: C.t2, fontSize: 10.5, marginTop: 2 }}>DNI {selectedEmployee.dni || "sin cargar"} · {selectedEmployee.sede || "sin sede"}</span>
                    </span>
                    {selectedEmployee.activo === false && <span style={{ border: `1px solid ${C.redB}`, background: C.redL, color: C.red, borderRadius: 999, padding: "3px 7px", fontSize: 9.5, fontWeight: 900 }}>Baja</span>}
                  </div>

                  <div style={{ padding: 13, display: "grid", gap: 13 }}>
                    <div>
                      <label style={LBL}>Oficio de la persona</label>
                      <select value={draftOffice} onChange={(event) => setDraftOffice(event.target.value)} disabled={!esAdmin} style={{ ...INP, width: "100%", minHeight: 36 }}>
                        <option value="">Sin oficio asignado</option>
                        {oficios.map((office) => <option key={office.id} value={office.id}>{office.nombre}</option>)}
                      </select>
                      <div style={{ color: C.t3, fontSize: 9.5, marginTop: 4 }}>Se carga una sola vez. Define qué categorías puede retirar sin advertencias.</div>
                    </div>

                    <div style={{ borderTop: `1px solid ${C.b0}`, paddingTop: 12 }}>
                      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                        <div>
                          <div style={{ color: C.t0, fontSize: 12.5, fontWeight: 950 }}>Obras asignadas</div>
                          <div style={{ color: C.t2, fontSize: 10, marginTop: 2 }}>Marcá todas las obras en las que trabaja actualmente.</div>
                        </div>
                        <span style={{ border: `1px solid ${draftWorks.size ? C.blueB : C.b0}`, background: draftWorks.size ? C.blueL : C.panelSolid, color: draftWorks.size ? C.blue : C.t2, borderRadius: 999, padding: "4px 8px", fontSize: 10, fontWeight: 900 }}>{draftWorks.size} seleccionadas</span>
                      </div>
                      <div style={{ display: "flex", gap: 7, marginTop: 9, alignItems: "center", flexWrap: "wrap" }}>
                        <div style={{ position: "relative", flex: "1 1 200px" }}>
                          <Search size={13} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: C.t3 }} />
                          <input value={workQuery} onChange={(event) => setWorkQuery(event.target.value)} placeholder="Buscar obra…" style={{ ...INP, width: "100%", paddingLeft: 29 }} />
                        </div>
                        <label style={{ display: "inline-flex", alignItems: "center", gap: 5, color: C.t2, fontSize: 10.5, cursor: "pointer" }}>
                          <input type="checkbox" checked={showFinished} onChange={(event) => setShowFinished(event.target.checked)} /> finalizadas
                        </label>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(150px, 1fr))", gap: 6, maxHeight: 290, overflowY: "auto", padding: "7px 1px 1px", marginTop: 2 }}>
                        {visibleWorks.map((obra) => <WorkToggle key={obra.id} obra={obra} selected={draftWorks.has(obra.id)} disabled={!esAdmin} onClick={() => toggleWork(obra.id)} />)}
                        {!visibleWorks.length && <div style={{ gridColumn: "1 / -1", padding: 20, color: C.t2, fontSize: 11.5, textAlign: "center" }}>No hay obras con ese filtro.</div>}
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, borderTop: `1px solid ${C.b0}`, paddingTop: 11 }}>
                      <span style={{ color: dirty ? C.amber : C.t3, fontSize: 10.5, fontWeight: dirty ? 850 : 600 }}>{dirty ? "Hay cambios sin guardar" : "Ficha operativa actualizada"}</span>
                      {esAdmin && <button type="button" onClick={saveEmployee} disabled={!dirty || !!guardando} style={{ ...BTN_PRIMARY, minHeight: 34, opacity: !dirty || guardando ? 0.55 : 1 }}><Save size={13} /> {guardando === `employee:${selectedEmployee.id}` ? "Guardando…" : "Guardar cambios"}</button>}
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ minHeight: 260, display: "grid", placeItems: "center", padding: 30, color: C.t2, textAlign: "center" }}>
                  <div><UserRound size={28} style={{ opacity: 0.5, marginBottom: 8 }} /><div style={{ fontSize: 12 }}>Elegí una persona para editar su oficio y sus obras.</div></div>
                </div>
              )}
            </section>
          </div>
        </>
      ) : (
        <section style={{ border: `1px solid ${C.b0}`, background: C.s0, borderRadius: 13, padding: 13, display: "grid", gap: 11 }}>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div>
              <div style={{ color: C.t0, fontSize: 14, fontWeight: 950 }}>Qué puede retirar cada oficio</div>
              <div style={{ color: C.t2, fontSize: 10.5, marginTop: 3 }}>Marcá categorías completas. Por ahora una diferencia genera una advertencia y no bloquea el retiro.</div>
            </div>
            {esAdmin && (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input value={newOffice} onChange={(event) => setNewOffice(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addOffice(); }} placeholder="Nuevo oficio…" style={{ ...INP, width: 190 }} />
                <button type="button" onClick={addOffice} disabled={!newOffice.trim() || !!guardando} style={{ ...BTN_PRIMARY, minHeight: 33 }}><Plus size={13} /> Crear</button>
              </div>
            )}
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            {oficios.map((office) => {
              const selectedCategories = catsByOffice.get(office.id) || new Set();
              const isOpen = openOffice === office.id;
              const peopleCount = empleados.filter((employee) => employee.activo !== false && employee.oficio_id === office.id).length;
              return (
                <div key={office.id} style={{ border: `1px solid ${isOpen ? C.blueB : C.b0}`, background: C.panelSolid, borderRadius: 11, overflow: "hidden" }}>
                  <button type="button" onClick={() => setOpenOffice(isOpen ? "" : office.id)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 9, padding: "10px 11px", border: "none", background: "transparent", color: C.t0, cursor: "pointer", fontFamily: C.sans, textAlign: "left" }}>
                    <span style={{ width: 28, height: 28, borderRadius: 8, display: "grid", placeItems: "center", background: selectedCategories.size ? C.blueL : C.s1, border: `1px solid ${selectedCategories.size ? C.blueB : C.b0}`, color: selectedCategories.size ? C.blue : C.t3 }}><Briefcase size={14} /></span>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: "block", color: C.t0, fontSize: 12.5, fontWeight: 900 }}>{office.nombre}</span>
                      <span style={{ display: "block", color: C.t2, fontSize: 9.5, marginTop: 2 }}>{peopleCount} personas · {selectedCategories.size ? `${selectedCategories.size} categorías habilitadas` : "sin regla cargada"}</span>
                    </span>
                    <ChevronRight size={15} style={{ color: isOpen ? C.blue : C.t3, transform: isOpen ? "rotate(90deg)" : "none", transition: "transform .15s" }} />
                  </button>
                  {isOpen && (
                    <div style={{ borderTop: `1px solid ${C.b0}`, padding: 10 }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                        {categorias.map((category) => {
                          const selected = selectedCategories.has(category.id);
                          return (
                            <button key={category.id} type="button" disabled={!esAdmin || guardando === `office:${office.id}`} onClick={() => toggleCategory(office.id, category.id)} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 9px", borderRadius: 999, border: `1px solid ${selected ? C.blueB : C.b0}`, background: selected ? C.blueL : "transparent", color: selected ? C.blue : C.t2, cursor: esAdmin ? "pointer" : "default", fontFamily: C.sans, fontSize: 10.5, fontWeight: selected ? 900 : 700 }}>
                              {selected && <Check size={11} />} {category.nombre}
                            </button>
                          );
                        })}
                      </div>
                      {!categorias.length && <div style={{ color: C.t2, fontSize: 11.5, padding: 12 }}>Todavía no hay categorías en el catálogo.</div>}
                    </div>
                  )}
                </div>
              );
            })}
            {!oficios.length && <div style={{ padding: 28, color: C.t2, fontSize: 12, textAlign: "center" }}><HardHat size={22} style={{ opacity: .55, marginBottom: 6 }} /><div>Creá el primer oficio para empezar.</div></div>}
          </div>
        </section>
      )}
    </div>
  );
}
