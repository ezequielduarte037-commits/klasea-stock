// Presentismo: vista por día (con ausentes) o por rango. Filtros por grupo /
// contratista / búsqueda, anomalías (sin salida, tarde) y export CSV.
import { useEffect, useMemo, useState } from "react";
import { C } from "@/theme";
import {
  addDays, diaSemana, downloadCsv, duracionMin, fetchMarcaciones, fmtFecha,
  fmtFechaCorta, hhmm, hoyIso, minToHM, timeToMin,
} from "./api";
import { BTN, Cargando, ErrorBox, GrupoBadge, INP, KpiCard, Td, Th } from "./ui";

export default function PresentismoTab({ empleados, contratistas, config }) {
  const hoy = hoyIso();
  const [modo, setModo] = useState("dia");       // "dia" | "rango"
  const [fecha, setFecha] = useState(hoy);
  const [desde, setDesde] = useState(addDays(hoy, -6));
  const [hasta, setHasta] = useState(hoy);
  const [marcas, setMarcas] = useState(null);
  const [error, setError] = useState(null);
  const [q, setQ] = useState("");
  const [filtroGrupo, setFiltroGrupo] = useState("todos"); // todos | casa | sin_asignar | c:<id>
  const [soloAnomalias, setSoloAnomalias] = useState(false);

  const d1 = modo === "dia" ? fecha : desde;
  const d2 = modo === "dia" ? fecha : hasta;

  useEffect(() => {
    let alive = true;
    setMarcas(null); setError(null);
    fetchMarcaciones(d1, d2)
      .then(rows => { if (alive) setMarcas(rows); })
      .catch(e => { if (alive) setError(e); });
    return () => { alive = false; };
  }, [d1, d2]);

  const empById = useMemo(() => new Map((empleados ?? []).map(e => [e.id, e])), [empleados]);
  const tardeMin = timeToMin(config.tolerancia_tarde) ?? 435;

  // Filas enriquecidas (solo empleados que fichan)
  const filas = useMemo(() => {
    if (!marcas) return null;
    const out = [];
    for (const m of marcas) {
      const emp = empById.get(m.empleado_id);
      if (!emp || emp.ficha === false) continue;
      const entrada = hhmm(m.entrada);
      const salida = hhmm(m.salida);
      const min = duracionMin(m);
      const esDiaHabil = diaSemana(m.fecha) !== 0;
      out.push({
        key: m.id, emp, fecha: m.fecha, entrada, salida, min,
        sinSalida: !!entrada && !salida,
        tarde: esDiaHabil && entrada != null && timeToMin(entrada) > tardeMin,
        fichadas: Array.isArray(m.fichadas) ? m.fichadas : [],
      });
    }
    return out;
  }, [marcas, empById, tardeMin]);

  const filtradas = useMemo(() => {
    if (!filas) return null;
    let rows = filas;
    if (filtroGrupo === "casa") rows = rows.filter(r => r.emp.grupo === "casa");
    else if (filtroGrupo === "sin_asignar") rows = rows.filter(r => r.emp.grupo === "sin_asignar");
    else if (filtroGrupo === "contratistas") rows = rows.filter(r => r.emp.grupo === "contratista");
    else if (filtroGrupo.startsWith("c:")) rows = rows.filter(r => r.emp.contratista_id === filtroGrupo.slice(2));
    if (q.trim()) {
      const qq = q.toLowerCase();
      rows = rows.filter(r => r.emp.nombre.toLowerCase().includes(qq) || r.emp.dni.includes(qq));
    }
    if (soloAnomalias) rows = rows.filter(r => r.sinSalida || r.tarde);
    return [...rows].sort((a, b) =>
      a.fecha !== b.fecha ? a.fecha.localeCompare(b.fecha) : a.emp.nombre.localeCompare(b.emp.nombre, "es"));
  }, [filas, filtroGrupo, q, soloAnomalias]);

  // Ausentes (solo modo día): activos que fichan y no tienen marcación
  const ausentes = useMemo(() => {
    if (modo !== "dia" || !filas) return [];
    const presentes = new Set(filas.filter(r => r.fecha === fecha).map(r => r.emp.id));
    let rows = (empleados ?? []).filter(e => e.activo !== false && e.ficha !== false && !presentes.has(e.id));
    if (filtroGrupo === "casa") rows = rows.filter(e => e.grupo === "casa");
    else if (filtroGrupo === "sin_asignar") rows = rows.filter(e => e.grupo === "sin_asignar");
    else if (filtroGrupo === "contratistas") rows = rows.filter(e => e.grupo === "contratista");
    else if (filtroGrupo.startsWith("c:")) rows = rows.filter(e => e.contratista_id === filtroGrupo.slice(2));
    if (q.trim()) {
      const qq = q.toLowerCase();
      rows = rows.filter(e => e.nombre.toLowerCase().includes(qq) || e.dni.includes(qq));
    }
    return rows.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, [modo, filas, fecha, empleados, filtroGrupo, q]);

  const stats = useMemo(() => {
    if (!filtradas) return null;
    const personas = new Set(filtradas.map(r => r.emp.id));
    return {
      presentes: personas.size,
      casa: new Set(filtradas.filter(r => r.emp.grupo === "casa").map(r => r.emp.id)).size,
      contr: new Set(filtradas.filter(r => r.emp.grupo === "contratista").map(r => r.emp.id)).size,
      anomalias: filtradas.filter(r => r.sinSalida || r.tarde).length,
    };
  }, [filtradas]);

  function exportar() {
    if (!filtradas) return;
    downloadCsv(
      `presentismo_${d1}_${d2}.csv`,
      ["Fecha", "DNI", "Nombre", "Grupo", "Contratista", "Entrada", "Salida", "Horas", "Observación"],
      filtradas.map(r => [
        fmtFecha(r.fecha), r.emp.dni, r.emp.nombre,
        r.emp.grupo === "casa" ? "Casa" : r.emp.grupo === "contratista" ? "Contratista" : "Sin asignar",
        r.emp.contratista?.nombre ?? "",
        r.entrada ?? "", r.salida ?? "", r.min != null ? minToHM(r.min) : "",
        [r.sinSalida ? "sin salida" : null, r.tarde ? "tarde" : null].filter(Boolean).join(", "),
      ]),
    );
  }

  const selSt = (on) => ({
    ...BTN, padding: "6px 13px",
    background: on ? "rgba(59,130,246,0.13)" : C.s0,
    border: `1px solid ${on ? "rgba(59,130,246,0.35)" : C.b0}`,
    color: on ? "#60a5fa" : C.t2,
  });

  return (
    <div>
      {/* Controles */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        <button style={selSt(modo === "dia")} onClick={() => setModo("dia")}>Por día</button>
        <button style={selSt(modo === "rango")} onClick={() => setModo("rango")}>Rango</button>
        {modo === "dia" ? (
          <>
            <button style={BTN} onClick={() => setFecha(addDays(fecha, -1))}>‹</button>
            <input type="date" style={INP} value={fecha} onChange={e => e.target.value && setFecha(e.target.value)} />
            <button style={BTN} onClick={() => setFecha(addDays(fecha, 1))}>›</button>
            {fecha !== hoy && <button style={BTN} onClick={() => setFecha(hoy)}>Hoy</button>}
          </>
        ) : (
          <>
            <input type="date" style={INP} value={desde} onChange={e => e.target.value && setDesde(e.target.value)} />
            <span style={{ color: C.t2, fontSize: 12 }}>→</span>
            <input type="date" style={INP} value={hasta} onChange={e => e.target.value && setHasta(e.target.value)} />
          </>
        )}
        <div style={{ flex: 1 }} />
        <button style={BTN} onClick={exportar}>⬇ Exportar CSV</button>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
        <select style={{ ...INP, minWidth: 170 }} value={filtroGrupo} onChange={e => setFiltroGrupo(e.target.value)}>
          <option value="todos">Todos los grupos</option>
          <option value="casa">Gente de la casa</option>
          <option value="contratistas">Todos los contratistas</option>
          <option value="sin_asignar">Sin asignar</option>
          {(contratistas ?? []).map(c => <option key={c.id} value={`c:${c.id}`}>↳ {c.nombre}</option>)}
        </select>
        <input style={{ ...INP, flex: 1, minWidth: 150 }} placeholder="Buscar nombre o DNI…" value={q} onChange={e => setQ(e.target.value)} />
        <button style={selSt(soloAnomalias)} onClick={() => setSoloAnomalias(v => !v)}>⚠ Solo anomalías</button>
      </div>

      {error && <ErrorBox error={error} />}
      {!error && filtradas == null && <Cargando />}

      {filtradas != null && (
        <>
          {/* KPIs */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
            <KpiCard label={modo === "dia" ? "Presentes" : "Personas"} value={stats.presentes} color={C.green} />
            <KpiCard label="Casa" value={stats.casa} color="#60a5fa" />
            <KpiCard label="Contratistas" value={stats.contr} color="#fbbf24" />
            {modo === "dia" && <KpiCard label="Ausentes" value={ausentes.length} color={ausentes.length ? "#f87171" : C.green} />}
            <KpiCard label="Anomalías" value={stats.anomalias} color={stats.anomalias ? C.amber : C.green} sub="sin salida / tarde" />
          </div>

          {/* Tabla */}
          {filtradas.length === 0 ? (
            <div style={{ color: C.t2, fontSize: 13, padding: "40px 0", textAlign: "center" }}>Sin marcaciones para este filtro.</div>
          ) : (
            <div style={{ overflowX: "auto", border: `1px solid ${C.b0}`, borderRadius: 12 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {modo === "rango" && <Th>Fecha</Th>}
                    <Th>Empleado</Th>
                    <Th>Grupo</Th>
                    <Th right>Entrada</Th>
                    <Th right>Salida</Th>
                    <Th right>Horas</Th>
                    <Th>Obs.</Th>
                  </tr>
                </thead>
                <tbody>
                  {filtradas.map(r => (
                    <tr key={r.key}>
                      {modo === "rango" && <Td mono color={C.t2}>{fmtFechaCorta(r.fecha)}</Td>}
                      <Td>
                        {r.emp.nombre}
                        <span style={{ fontSize: 11, color: C.t2, fontFamily: C.mono, marginLeft: 8 }}>{r.emp.dni}</span>
                      </Td>
                      <Td><GrupoBadge grupo={r.emp.grupo} contratistaNombre={r.emp.contratista?.nombre} /></Td>
                      <Td right mono color={r.tarde ? C.amber : C.t0}>{r.entrada ?? "—"}</Td>
                      <Td right mono>{r.salida ?? "—"}</Td>
                      <Td right mono color={r.min != null ? C.t0 : C.t2}>{r.min != null ? minToHM(r.min) : "—"}</Td>
                      <Td>
                        {r.tarde && <span style={{ fontSize: 11, color: C.amber, marginRight: 6 }}>tarde</span>}
                        {r.sinSalida && <span style={{ fontSize: 11, color: "#f87171" }}>sin salida</span>}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Ausentes */}
          {modo === "dia" && ausentes.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 11, letterSpacing: 1.3, textTransform: "uppercase", color: "#f87171", fontWeight: 700, marginBottom: 8 }}>
                Ausentes ({ausentes.length}) — {fmtFecha(fecha)}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {ausentes.map(e => (
                  <div key={e.id} style={{ fontSize: 12, color: C.t1, background: C.s0, border: `1px solid ${C.b0}`, padding: "5px 11px", borderRadius: 7, display: "flex", gap: 7, alignItems: "center" }}>
                    {e.nombre}
                    <GrupoBadge grupo={e.grupo} contratistaNombre={e.contratista?.nombre} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
