// Dashboard RRHH: asistencia del día, evolución de presentes, horas por
// contratista y top de tardanzas — sobre los últimos 30 días.
import { useEffect, useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { C } from "@/theme";
import {
  addDays, diaSemana, duracionMin, fetchMarcaciones, hoyIso, minToHM, SEDES, timeToMin,
} from "./api";
import { Cargando, ErrorBox, INP, KpiCard } from "./ui";

export default function DashboardTab({ empleados, config }) {
  const hoy = hoyIso();
  const desde = addDays(hoy, -29);
  const [marcas, setMarcas] = useState(null);
  const [error, setError] = useState(null);
  const [filtroSede, setFiltroSede] = useState("todas");

  useEffect(() => {
    let alive = true;
    fetchMarcaciones(desde, hoy)
      .then(rows => { if (alive) setMarcas(rows); })
      .catch(e => { if (alive) setError(e); });
    return () => { alive = false; };
  }, [desde, hoy]);

  const empById = useMemo(() => new Map((empleados ?? []).map(e => [e.id, e])), [empleados]);
  const tardeMin = timeToMin(config.tolerancia_tarde) ?? 435;

  const data = useMemo(() => {
    if (!marcas) return null;
    let rows = marcas
      .map(m => ({ m, emp: empById.get(m.empleado_id) }))
      .filter(r => r.emp && r.emp.ficha !== false);
    if (filtroSede !== "todas") rows = rows.filter(r => r.m.sede === filtroSede);

    // Hoy
    const deHoy = rows.filter(r => r.m.fecha === hoy);
    const presHoy = new Set(deHoy.map(r => r.emp.id));
    const casaHoy = new Set(deHoy.filter(r => r.emp.grupo === "casa").map(r => r.emp.id)).size;
    const contrHoy = new Set(deHoy.filter(r => r.emp.grupo === "contratista").map(r => r.emp.id)).size;
    let activos = (empleados ?? []).filter(e => e.activo !== false && e.ficha !== false);
    if (filtroSede !== "todas") activos = activos.filter(e => e.sede === filtroSede);
    const ausentesHoy = diaSemana(hoy) === 0 ? 0 : activos.filter(e => !presHoy.has(e.id)).length;

    // Serie: presentes por día
    const porDia = new Map();
    for (const r of rows) {
      let d = porDia.get(r.m.fecha);
      if (!d) { d = { fecha: r.m.fecha, presentes: new Set(), horasMin: 0 }; porDia.set(r.m.fecha, d); }
      d.presentes.add(r.emp.id);
      d.horasMin += duracionMin(r.m) ?? 0;
    }
    const serie = [...porDia.values()]
      .sort((a, b) => a.fecha.localeCompare(b.fecha))
      .map(d => ({ dia: d.fecha.slice(8) + "/" + d.fecha.slice(5, 7), presentes: d.presentes.size }));

    // Horas por contratista
    const porContr = new Map();
    for (const r of rows) {
      if (r.emp.grupo !== "contratista") continue;
      const nombre = r.emp.contratista?.nombre ?? "Sin asignar";
      porContr.set(nombre, (porContr.get(nombre) ?? 0) + (duracionMin(r.m) ?? 0));
    }
    const horasContr = [...porContr.entries()]
      .map(([nombre, min]) => ({ nombre: nombre.length > 16 ? nombre.slice(0, 15) + "…" : nombre, horas: Math.round(min / 60) }))
      .sort((a, b) => b.horas - a.horas)
      .slice(0, 12);

    // Top tardanzas (días hábiles, entrada > tolerancia)
    const tardes = new Map();
    for (const r of rows) {
      if (diaSemana(r.m.fecha) === 0) continue;
      const e = timeToMin(r.m.entrada);
      if (e != null && e > tardeMin) tardes.set(r.emp.id, (tardes.get(r.emp.id) ?? 0) + 1);
    }
    const topTardes = [...tardes.entries()]
      .map(([id, n]) => ({ emp: empById.get(id), n }))
      .filter(r => r.emp)
      .sort((a, b) => b.n - a.n)
      .slice(0, 8);

    const totalMin = rows.reduce((a, r) => a + (duracionMin(r.m) ?? 0), 0);

    return { presHoy: presHoy.size, casaHoy, contrHoy, ausentesHoy, serie, horasContr, topTardes, totalMin };
  }, [marcas, empById, empleados, hoy, tardeMin, filtroSede]);

  if (error) return <ErrorBox error={error} />;
  if (!data) return <Cargando />;

  const card = { background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 12, padding: 16 };
  const title = { fontSize: 10, letterSpacing: 1.3, textTransform: "uppercase", color: C.t2, fontWeight: 700, marginBottom: 12 };
  const tooltipStyle = { background: C.panelSolid, border: `1px solid ${C.b1}`, borderRadius: 8, fontSize: 12, fontFamily: C.sans };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
        <select style={{ ...INP, minWidth: 150 }} value={filtroSede} onChange={e => setFiltroSede(e.target.value)}>
          <option value="todas">Todas las sedes</option>
          {SEDES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <KpiCard label="Presentes hoy" value={data.presHoy} color={C.green} sub={`${data.casaHoy} casa · ${data.contrHoy} contratistas`} />
        <KpiCard label="Ausentes hoy" value={data.ausentesHoy} color={data.ausentesHoy ? "#f87171" : C.green} />
        <KpiCard label="Horas (30 días)" value={minToHM(data.totalMin)} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(330px, 1fr))", gap: 12 }}>
        <div style={card}>
          <div style={title}>Presentes por día (30 días)</div>
          <ResponsiveContainer width="100%" height={210}>
            <LineChart data={data.serie} margin={{ top: 4, right: 8, bottom: 0, left: -22 }}>
              <CartesianGrid stroke="var(--panel)" vertical={false} />
              <XAxis dataKey="dia" tick={{ fontSize: 10, fill: C.t2 }} tickLine={false} axisLine={{ stroke: C.b0 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fill: C.t2 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: C.t1 }} />
              <Line type="monotone" dataKey="presentes" name="Presentes" stroke="#60a5fa" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div style={card}>
          <div style={title}>Horas por contratista (30 días)</div>
          {data.horasContr.length === 0 ? (
            <div style={{ fontSize: 12, color: C.t2, padding: "40px 0", textAlign: "center" }}>Sin horas de contratistas en el período.</div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(210, data.horasContr.length * 26)}>
              <BarChart data={data.horasContr} layout="vertical" margin={{ top: 0, right: 24, bottom: 0, left: 8 }}>
                <CartesianGrid stroke="var(--panel)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: C.t2 }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="nombre" width={120} tick={{ fontSize: 11, fill: C.t1 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: C.t1 }} formatter={(v) => [`${v} h`, "Horas"]} />
                <Bar dataKey="horas" fill="#fbbf24" radius={[0, 4, 4, 0]} barSize={14} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div style={card}>
          <div style={title}>Top tardanzas (30 días · entrada después de las {config.tolerancia_tarde})</div>
          {data.topTardes.length === 0 ? (
            <div style={{ fontSize: 12, color: C.t2, padding: "30px 0", textAlign: "center" }}>Sin tardanzas registradas. 👏</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {data.topTardes.map((r, i) => (
                <div key={r.emp.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", background: "rgba(255,255,255,0.02)", borderRadius: 7 }}>
                  <span style={{ fontFamily: C.mono, fontSize: 11, color: C.t2, width: 18 }}>{i + 1}.</span>
                  <span style={{ fontSize: 13, color: C.t0, flex: 1 }}>{r.emp.nombre}</span>
                  <span style={{ fontFamily: C.mono, fontSize: 12, color: C.amber, fontWeight: 700 }}>{r.n} día{r.n !== 1 ? "s" : ""}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
