// Dashboard RRHH: lectura diaria y tendencias de asistencia.
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, BarChart3, CalendarDays, CheckCircle2, Clock3, RefreshCw,
  Search, UsersRound, UserRoundCheck, UserRoundX,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { C } from "@/theme";
import {
  addDays, diaSemana, duracionMin, fetchJustificaciones, fetchMarcaciones, hoyIso, minToHM, SEDES, timeToMin,
} from "./api";
import { Cargando, ErrorBox, GrupoBadge, INP, KpiCard } from "./ui";

const PERIODOS = [
  { value: 7, label: "7 dias" },
  { value: 30, label: "30 dias" },
  { value: 90, label: "90 dias" },
];

const BTN = {
  border: "1px solid var(--border)", background: "var(--panel-solid)", color: C.t1,
  borderRadius: 8, padding: "7px 10px", fontFamily: C.sans, fontWeight: 650,
  fontSize: 12, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6,
};

function diaCorto(fecha) {
  return `${fecha.slice(8)}/${fecha.slice(5, 7)}`;
}

function nombreCorto(nombre) {
  const parts = String(nombre ?? "").trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).join(" ") || "Sin nombre";
}

function Panel({ children, style }) {
  return (
    <section style={{
      background: "var(--panel-solid)", border: "1px solid var(--border)", borderRadius: 12,
      boxShadow: "0 8px 24px rgba(15,23,42,.035)", overflow: "hidden", ...style,
    }}>
      {children}
    </section>
  );
}

function PanelHeader({ icon: Icon, title, detail, action }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
      padding: "13px 15px 10px",
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, color: C.t0, fontWeight: 750 }}>
          {Icon && <Icon size={15} color={C.blue} strokeWidth={2} />}
          {title}
        </div>
        {detail && <div style={{ color: C.t2, fontSize: 11, marginTop: 3 }}>{detail}</div>}
      </div>
      {action}
    </div>
  );
}

function EstadoRow({ emp, meta, onClick }) {
  const accent = meta.kind === "late" ? C.amber : meta.kind === "incomplete" ? C.red : C.t2;
  const label = meta.kind === "late" ? `Llego ${meta.entrada}` : meta.kind === "incomplete" ? "Fichada incompleta" : "Ausente";
  return (
    <button type="button" onClick={onClick} style={{
      width: "100%", border: "0", borderTop: "1px solid var(--panel)", background: "transparent",
      padding: "10px 15px", display: "flex", alignItems: "center", gap: 10, textAlign: "left",
      cursor: onClick ? "pointer" : "default", fontFamily: C.sans,
    }} className="rrhh-dashboard-row">
      <div style={{
        width: 28, height: 28, borderRadius: 8, display: "grid", placeItems: "center", flexShrink: 0,
        background: meta.kind === "late" ? C.amberL : meta.kind === "incomplete" ? C.redL : C.s2,
        color: accent, fontSize: 10, fontWeight: 750,
      }}>{String(emp.nombre ?? "?").slice(0, 2).toUpperCase()}</div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 12.5, color: C.t0, fontWeight: 680, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nombreCorto(emp.nombre)}</div>
        <div style={{ fontSize: 10.5, color: C.t2, marginTop: 2 }}>{label}</div>
      </div>
      <GrupoBadge grupo={emp.grupo} contratistaNombre={emp.contratista?.nombre} />
    </button>
  );
}

export default function DashboardTab({ empleados, config, onNavigate }) {
  const hoy = hoyIso();
  const [dias, setDias] = useState(30);
  const [marcas, setMarcas] = useState(null);
  const [justificaciones, setJustificaciones] = useState(null);
  const [error, setError] = useState(null);
  const [filtroSede, setFiltroSede] = useState("todas");
  const [filtroGrupo, setFiltroGrupo] = useState("todos");
  const [busqueda, setBusqueda] = useState("");
  const [refrescando, setRefrescando] = useState(false);

  const desde = useMemo(() => addDays(hoy, -(dias - 1)), [hoy, dias]);
  const cargar = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setMarcas(null);
    setError(null);
    try {
      const [rows, justs] = await Promise.all([fetchMarcaciones(desde, hoy), fetchJustificaciones(desde, hoy)]);
      setMarcas(rows);
      setJustificaciones(justs);
    } catch (e) {
      setError(e);
    } finally {
      setRefrescando(false);
    }
  }, [desde, hoy]);

  useEffect(() => { cargar(); }, [cargar]);

  const empById = useMemo(() => new Map((empleados ?? []).map(e => [e.id, e])), [empleados]);
  const tardeMin = timeToMin(config.tolerancia_tarde) ?? 435;

  const data = useMemo(() => {
    if (!marcas || !justificaciones) return null;
    const needle = busqueda.trim().toLowerCase();
    const aceptaEmpleado = (emp) => {
      if (!emp || emp.activo === false || emp.ficha === false) return false;
      if (filtroSede !== "todas" && emp.sede !== filtroSede) return false;
      if (filtroGrupo !== "todos" && emp.grupo !== filtroGrupo) return false;
      return !needle || `${emp.nombre ?? ""} ${emp.dni ?? ""} ${emp.contratista?.nombre ?? ""}`.toLowerCase().includes(needle);
    };
    const activos = (empleados ?? []).filter(aceptaEmpleado);
    const rows = marcas
      .map(m => ({ m, emp: empById.get(m.empleado_id) }))
      .filter(({ emp }) => aceptaEmpleado(emp));
    const justByKey = new Map((justificaciones ?? []).map(j => [`${j.empleado_id}:${j.fecha}`, j]));
    const rowsHoy = rows.filter(({ m }) => m.fecha === hoy);
    const presentes = new Set(rowsHoy.map(({ emp }) => emp.id));
    const ausentes = diaSemana(hoy) === 0 ? [] : activos.filter(emp => !presentes.has(emp.id) && !justByKey.has(`${emp.id}:${hoy}`));
    const justificados = diaSemana(hoy) === 0 ? [] : activos.filter(emp => !presentes.has(emp.id) && justByKey.has(`${emp.id}:${hoy}`));
    const tardanzasHoy = rowsHoy.filter(({ m }) => {
      const entrada = timeToMin(m.entrada);
      return entrada != null && entrada > tardeMin;
    });
    const incompletasHoy = rowsHoy.filter(({ m }) => !m.entrada || !m.salida);

    const porDia = new Map();
    for (let index = 0; index < dias; index += 1) {
      const fecha = addDays(desde, index);
      porDia.set(fecha, { fecha, presentes: new Set(), horasMin: 0, tardanzas: 0 });
    }
    for (const { m, emp } of rows) {
      const day = porDia.get(m.fecha);
      if (!day) continue;
      day.presentes.add(emp.id);
      day.horasMin += duracionMin(m) ?? 0;
      const entrada = timeToMin(m.entrada);
      if (entrada != null && entrada > tardeMin) day.tardanzas += 1;
    }
    const serie = [...porDia.values()].map(day => ({
      dia: diaCorto(day.fecha), presentes: day.presentes.size, horas: Math.round(day.horasMin / 60), tardanzas: day.tardanzas,
    }));
    const totalMin = rows.reduce((sum, { m }) => sum + (duracionMin(m) ?? 0), 0);
    const promedioPresentes = serie.length ? Math.round(serie.reduce((sum, day) => sum + day.presentes, 0) / serie.length) : 0;

    const porContr = new Map();
    for (const { m, emp } of rows) {
      if (emp.grupo !== "contratista") continue;
      const nombre = emp.contratista?.nombre ?? "Sin asignar";
      porContr.set(nombre, (porContr.get(nombre) ?? 0) + (duracionMin(m) ?? 0));
    }
    const horasContr = [...porContr.entries()]
      .map(([nombre, min]) => ({ nombre: nombre.length > 18 ? `${nombre.slice(0, 17)}...` : nombre, horas: Math.round(min / 60) }))
      .sort((a, b) => b.horas - a.horas)
      .slice(0, 8);

    const topTardes = new Map();
    for (const { m, emp } of rows) {
      if (diaSemana(m.fecha) === 0) continue;
      const entrada = timeToMin(m.entrada);
      if (entrada != null && entrada > tardeMin) topTardes.set(emp.id, (topTardes.get(emp.id) ?? 0) + 1);
    }
    const rankingTardes = [...topTardes.entries()]
      .map(([id, cantidad]) => ({ emp: empById.get(id), cantidad }))
      .filter(({ emp }) => emp)
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 7);

    return {
      activos, presentes: presentes.size, ausentes, justificados, tardanzasHoy, incompletasHoy,
      serie, horasContr, rankingTardes, totalMin, promedioPresentes,
      casa: rowsHoy.filter(({ emp }) => emp.grupo === "casa").length,
      contratistas: rowsHoy.filter(({ emp }) => emp.grupo === "contratista").length,
    };
  }, [marcas, justificaciones, empleados, empById, hoy, desde, dias, tardeMin, filtroSede, filtroGrupo, busqueda]);

  if (error) return <ErrorBox error={error} onRetry={cargar} />;
  if (!data) return <Cargando />;

  const card = { padding: "0 0 10px" };
  const tooltipStyle = { background: C.panelSolid, border: `1px solid ${C.b1}`, borderRadius: 8, fontSize: 12, fontFamily: C.sans };
  const attention = [
    ...data.tardanzasHoy.map(({ emp, m }) => ({ emp, kind: "late", entrada: m.entrada })),
    ...data.incompletasHoy.map(({ emp }) => ({ emp, kind: "incomplete" })),
    ...data.ausentes.map(emp => ({ emp, kind: "absent" })),
  ].slice(0, 8);

  return (
    <div>
      <style>{`
        @keyframes rrhh-dashboard-spin { to { transform: rotate(360deg); } }
        .rrhh-spin { animation: rrhh-dashboard-spin .8s linear infinite; }
        .rrhh-dashboard-row { transition: background .16s ease, transform .16s ease; }
        .rrhh-dashboard-row:hover { background: var(--panel) !important; }
        .rrhh-period:hover { border-color: var(--blue-border) !important; color: var(--blue) !important; }
        @media (max-width: 680px) { .rrhh-dashboard-toolbar { grid-template-columns: 1fr !important; } .rrhh-dashboard-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; } }
      `}</style>

      <Panel style={{ marginBottom: 12, padding: 14, background: "var(--topbar-soft)", backdropFilter: "blur(14px)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 30, height: 30, borderRadius: 9, display: "grid", placeItems: "center", background: C.blueL, color: C.blue, border: `1px solid ${C.blueB}` }}><BarChart3 size={16} /></div>
              <div>
                <h2 style={{ fontSize: 16, color: C.t0, margin: 0, fontWeight: 760 }}>Panorama de asistencia</h2>
                <div style={{ fontSize: 11, color: C.t2, marginTop: 2 }}>Actualizado con las fichadas importadas hasta hoy</div>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4, padding: 3, border: `1px solid ${C.b0}`, borderRadius: 9, background: "var(--panel-solid)" }}>
            {PERIODOS.map(periodo => (
              <button key={periodo.value} type="button" className="rrhh-period" onClick={() => setDias(periodo.value)} style={{
                border: `1px solid ${dias === periodo.value ? C.blueB : "transparent"}`, background: dias === periodo.value ? C.blueL : "transparent",
                color: dias === periodo.value ? C.blue : C.t2, borderRadius: 6, padding: "5px 8px", cursor: "pointer",
                fontSize: 11, fontWeight: 700, fontFamily: C.sans, transition: "all .16s ease",
              }}>{periodo.label}</button>
            ))}
            <button type="button" title="Actualizar datos" aria-label="Actualizar datos" onClick={() => { setRefrescando(true); cargar({ silent: true }); }} style={{ ...BTN, border: "0", padding: "5px 7px", color: C.t2 }}>
              <RefreshCw size={14} className={refrescando ? "rrhh-spin" : ""} />
            </button>
          </div>
        </div>

        <div className="rrhh-dashboard-toolbar" style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1fr) 160px 150px", gap: 8, marginTop: 14 }}>
          <div style={{ position: "relative" }}>
            <Search size={15} color={C.t2} style={{ position: "absolute", left: 10, top: 9 }} />
            <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar persona, DNI o contratista..." style={{ ...INP, width: "100%", paddingLeft: 32 }} />
          </div>
          <select value={filtroSede} onChange={e => setFiltroSede(e.target.value)} style={{ ...INP, width: "100%" }}>
            <option value="todas">Todas las sedes</option>
            {SEDES.map(sede => <option key={sede} value={sede}>{sede}</option>)}
          </select>
          <select value={filtroGrupo} onChange={e => setFiltroGrupo(e.target.value)} style={{ ...INP, width: "100%" }}>
            <option value="todos">Casa y contratistas</option>
            <option value="casa">Personal de casa</option>
            <option value="contratista">Contratistas</option>
          </select>
        </div>
      </Panel>

      <div className="rrhh-dashboard-kpis" style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 9, marginBottom: 12 }}>
        <KpiCard icon={UserRoundCheck} label="Presentes" value={data.presentes} color={C.green} sub={`${data.casa} casa · ${data.contratistas} contratistas`} />
        <KpiCard icon={UserRoundX} label="Ausentes" value={data.ausentes.length} color={data.ausentes.length ? C.red : C.green} sub={data.ausentes.length ? "requiere seguimiento" : "sin pendientes"} />
        <KpiCard icon={CheckCircle2} label="Justificados" value={data.justificados.length} color={C.blue} sub="vacaciones, reposo u otros" />
        <KpiCard icon={Clock3} label="Tardanzas" value={data.tardanzasHoy.length} color={data.tardanzasHoy.length ? C.amber : C.green} sub={`despues de ${config.tolerancia_tarde}`} />
        <KpiCard icon={CalendarDays} label="Horas del periodo" value={minToHM(data.totalMin)} color={C.blue} sub={`promedio ${data.promedioPresentes} presentes/dia`} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.55fr) minmax(280px, .85fr)", gap: 12, alignItems: "start" }}>
        <div style={{ display: "grid", gap: 12 }}>
          <Panel style={card}>
            <PanelHeader icon={UsersRound} title="Evolucion de asistencia" detail={`${dias} dias · promedio de ${data.promedioPresentes} presentes por dia`} />
            <div style={{ height: 230, padding: "0 10px 0 4px" }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.serie} margin={{ top: 7, right: 12, bottom: 0, left: -18 }}>
                  <CartesianGrid stroke="var(--panel)" vertical={false} />
                  <XAxis dataKey="dia" tick={{ fontSize: 10, fill: C.t2 }} tickLine={false} axisLine={{ stroke: C.b0 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10, fill: C.t2 }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: C.t1 }} formatter={(value, name) => [value, name === "presentes" ? "Presentes" : name]} />
                  <Line type="monotone" dataKey="presentes" stroke={C.blue} strokeWidth={2.4} dot={false} activeDot={{ r: 4, fill: C.blue }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel style={card}>
            <PanelHeader icon={BarChart3} title="Horas de contratistas" detail={`Acumulado de ${dias} dias`} />
            {data.horasContr.length === 0 ? (
              <div style={{ color: C.t2, fontSize: 12, padding: "38px 15px", textAlign: "center" }}>No hay horas de contratistas para estos filtros.</div>
            ) : (
              <div style={{ height: Math.max(210, data.horasContr.length * 29), padding: "0 12px 0 0" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.horasContr} layout="vertical" margin={{ top: 0, right: 24, bottom: 0, left: 8 }}>
                    <CartesianGrid stroke="var(--panel)" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: C.t2 }} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="nombre" width={130} tick={{ fontSize: 11, fill: C.t1 }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: C.t1 }} formatter={value => [`${value} h`, "Horas"]} />
                    <Bar dataKey="horas" fill={C.amber} radius={[0, 5, 5, 0]} barSize={15} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          <Panel>
            <PanelHeader
              icon={AlertTriangle}
              title="Atencion hoy"
              detail={attention.length ? `${data.tardanzasHoy.length} tardanzas · ${data.incompletasHoy.length} incompletas · ${data.ausentes.length} ausentes` : "Sin novedades que requieran accion"}
              action={<button type="button" onClick={() => onNavigate?.("presentismo")} style={{ ...BTN, padding: "5px 8px", fontSize: 11 }}>Ver presentismo</button>}
            />
            {attention.length === 0 ? (
              <div style={{ borderTop: "1px solid var(--panel)", padding: "24px 15px", textAlign: "center", color: C.t2, fontSize: 12 }}>Todo el personal filtrado esta al dia.</div>
            ) : attention.map((meta, index) => <EstadoRow key={`${meta.emp.id}:${meta.kind}:${index}`} emp={meta.emp} meta={meta} onClick={() => onNavigate?.("presentismo")} />)}
          </Panel>

          <Panel>
            <PanelHeader icon={Clock3} title="Tardanzas recurrentes" detail={`Mas dias despues de ${config.tolerancia_tarde} en el periodo`} />
            {data.rankingTardes.length === 0 ? (
              <div style={{ borderTop: "1px solid var(--panel)", padding: "24px 15px", textAlign: "center", color: C.t2, fontSize: 12 }}>Sin tardanzas registradas.</div>
            ) : data.rankingTardes.map(({ emp, cantidad }, index) => (
              <div key={emp.id} style={{ borderTop: "1px solid var(--panel)", padding: "10px 15px", display: "flex", alignItems: "center", gap: 9 }}>
                <span style={{ width: 18, color: C.t2, fontFamily: C.mono, fontSize: 11 }}>{index + 1}.</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: C.t0, fontWeight: 650, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nombreCorto(emp.nombre)}</span>
                <span style={{ padding: "3px 7px", borderRadius: 99, background: C.amberL, color: C.amber, border: `1px solid ${C.amberB}`, fontSize: 10.5, fontWeight: 750 }}>{cantidad} dias</span>
              </div>
            ))}
          </Panel>
        </div>
      </div>
    </div>
  );
}
