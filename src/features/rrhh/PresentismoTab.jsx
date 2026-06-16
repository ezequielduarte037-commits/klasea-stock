// Presentismo: vista por dia o rango, ausentes, anomalias y justificaciones.
import { useEffect, useMemo, useState } from "react";
import { C } from "@/theme";
import {
  addDays,
  diaSemana,
  downloadCsv,
  duracionMin,
  fetchJustificaciones,
  fetchMarcaciones,
  fmtFecha,
  fmtFechaCorta,
  guardarJustificacion,
  hhmm,
  hoyIso,
  minToHM,
  SEDES,
  timeToMin,
} from "./api";
import { BTN, BTN_PRIMARY, Cargando, ErrorBox, GrupoBadge, INP, KpiCard, Td, Th } from "./ui";

const keyJust = (empleadoId, fecha) => `${empleadoId}::${fecha}`;

function sameGrupo(row, filtroGrupo) {
  const emp = row.emp ?? row;
  if (filtroGrupo === "casa") return emp.grupo === "casa";
  if (filtroGrupo === "sin_asignar") return emp.grupo === "sin_asignar";
  if (filtroGrupo === "contratistas") return emp.grupo === "contratista";
  if (filtroGrupo.startsWith("c:")) return emp.contratista_id === filtroGrupo.slice(2);
  return true;
}

export default function PresentismoTab({ empleados, contratistas, config }) {
  const hoy = hoyIso();
  const [modo, setModo] = useState("dia");
  const [fecha, setFecha] = useState(hoy);
  const [desde, setDesde] = useState(addDays(hoy, -6));
  const [hasta, setHasta] = useState(hoy);
  const [marcas, setMarcas] = useState(null);
  const [justificaciones, setJustificaciones] = useState([]);
  const [error, setError] = useState(null);
  const [q, setQ] = useState("");
  const [filtroGrupo, setFiltroGrupo] = useState("todos");
  const [filtroSede, setFiltroSede] = useState("todas");
  const [soloAnomalias, setSoloAnomalias] = useState(false);
  const [justModal, setJustModal] = useState(null);

  const d1 = modo === "dia" ? fecha : desde;
  const d2 = modo === "dia" ? fecha : hasta;

  useEffect(() => {
    let alive = true;
    setMarcas(null);
    setError(null);
    Promise.all([fetchMarcaciones(d1, d2), fetchJustificaciones(d1, d2)])
      .then(([rows, justs]) => {
        if (!alive) return;
        setMarcas(rows);
        setJustificaciones(justs);
      })
      .catch(e => { if (alive) setError(e); });
    return () => { alive = false; };
  }, [d1, d2]);

  const empById = useMemo(() => new Map((empleados ?? []).map(e => [e.id, e])), [empleados]);
  const justByKey = useMemo(() => new Map((justificaciones ?? []).map(j => [keyJust(j.empleado_id, j.fecha), j])), [justificaciones]);
  const tardeMin = timeToMin(config.tolerancia_tarde) ?? 430;

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
        key: m.id,
        emp,
        fecha: m.fecha,
        sede: m.sede,
        entrada,
        salida,
        min,
        sinSalida: !!entrada && !salida,
        tarde: esDiaHabil && entrada != null && timeToMin(entrada) > tardeMin,
        fichadas: Array.isArray(m.fichadas) ? m.fichadas : [],
        justificacion: justByKey.get(keyJust(emp.id, m.fecha)) ?? null,
      });
    }
    return out;
  }, [marcas, empById, tardeMin, justByKey]);

  const filtradas = useMemo(() => {
    if (!filas) return null;
    let rows = filas;
    if (filtroSede !== "todas") rows = rows.filter(r => r.sede === filtroSede);
    rows = rows.filter(r => sameGrupo(r, filtroGrupo));
    if (q.trim()) {
      const qq = q.toLowerCase();
      rows = rows.filter(r => r.emp.nombre.toLowerCase().includes(qq) || r.emp.dni.includes(qq));
    }
    if (soloAnomalias) rows = rows.filter(r => r.sinSalida || r.tarde);
    return [...rows].sort((a, b) =>
      a.fecha !== b.fecha ? a.fecha.localeCompare(b.fecha) : a.emp.nombre.localeCompare(b.emp.nombre, "es"));
  }, [filas, filtroSede, filtroGrupo, q, soloAnomalias]);

  const ausentes = useMemo(() => {
    if (modo !== "dia" || !filas) return [];
    const presentes = new Set(
      filas
        .filter(r => r.fecha === fecha && (filtroSede === "todas" || r.sede === filtroSede))
        .map(r => r.emp.id),
    );
    let rows = (empleados ?? []).filter(e => e.activo !== false && e.ficha !== false && !presentes.has(e.id));
    if (filtroSede !== "todas") rows = rows.filter(e => e.sede === filtroSede);
    rows = rows.filter(e => sameGrupo(e, filtroGrupo));
    if (q.trim()) {
      const qq = q.toLowerCase();
      rows = rows.filter(e => e.nombre.toLowerCase().includes(qq) || e.dni.includes(qq));
    }
    return rows
      .map(emp => ({ emp, justificacion: justByKey.get(keyJust(emp.id, fecha)) ?? null }))
      .sort((a, b) => a.emp.nombre.localeCompare(b.emp.nombre, "es"));
  }, [modo, filas, fecha, empleados, filtroSede, filtroGrupo, q, justByKey]);

  const stats = useMemo(() => {
    if (!filtradas) return null;
    const personas = new Set(filtradas.map(r => r.emp.id));
    return {
      presentes: personas.size,
      casa: new Set(filtradas.filter(r => r.emp.grupo === "casa").map(r => r.emp.id)).size,
      contr: new Set(filtradas.filter(r => r.emp.grupo === "contratista").map(r => r.emp.id)).size,
      anomalias: filtradas.filter(r => r.sinSalida || r.tarde).length,
      ausentesJustificados: ausentes.filter(r => r.justificacion).length,
    };
  }, [filtradas, ausentes]);

  async function guardarMotivo(empleadoId, fechaJust, motivo) {
    const saved = await guardarJustificacion(empleadoId, fechaJust, motivo);
    setJustificaciones(prev => {
      const key = keyJust(empleadoId, fechaJust);
      const clean = prev.filter(j => keyJust(j.empleado_id, j.fecha) !== key);
      return saved ? [...clean, saved] : clean;
    });
    setJustModal(null);
  }

  function exportar() {
    if (!filtradas) return;
    const presentRows = filtradas.map(r => [
      fmtFecha(r.fecha),
      r.emp.dni,
      r.emp.nombre,
      r.sede ?? r.emp.sede ?? "",
      r.emp.grupo === "casa" ? "Casa" : r.emp.grupo === "contratista" ? "Contratista" : "Sin asignar",
      r.emp.contratista?.nombre ?? "",
      r.entrada ?? "",
      r.salida ?? "",
      r.min != null ? minToHM(r.min) : "",
      r.justificacion ? "presente (justificada)" : "presente",
      [r.sinSalida ? "sin salida" : null, r.tarde ? "tarde" : null].filter(Boolean).join(", "),
      r.justificacion?.motivo ?? "",
    ]);
    const absentRows = modo === "dia" ? ausentes.map(r => [
      fmtFecha(fecha),
      r.emp.dni,
      r.emp.nombre,
      r.emp.sede ?? "",
      r.emp.grupo === "casa" ? "Casa" : r.emp.grupo === "contratista" ? "Contratista" : "Sin asignar",
      r.emp.contratista?.nombre ?? "",
      "",
      "",
      "",
      r.justificacion ? "ausente justificada" : "ausente injustificada",
      "",
      r.justificacion?.motivo ?? "",
    ]) : [];

    downloadCsv(
      `presentismo_${d1}_${d2}.csv`,
      ["Fecha", "DNI", "Nombre", "Sede", "Grupo", "Contratista", "Entrada", "Salida", "Horas", "Estado", "Observacion", "Motivo justificacion"],
      [...presentRows, ...absentRows],
    );
  }

  const selSt = (on) => ({
    ...BTN,
    padding: "6px 13px",
    background: on ? "rgba(59,130,246,0.13)" : C.s0,
    border: `1px solid ${on ? "rgba(59,130,246,0.35)" : C.b0}`,
    color: on ? "#60a5fa" : C.t2,
  });

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        <button style={selSt(modo === "dia")} onClick={() => setModo("dia")}>Por dia</button>
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
        <select style={{ ...INP, minWidth: 140 }} value={filtroSede} onChange={e => setFiltroSede(e.target.value)}>
          <option value="todas">Todas las sedes</option>
          {SEDES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <input style={{ ...INP, flex: 1, minWidth: 150 }} placeholder="Buscar nombre o DNI..." value={q} onChange={e => setQ(e.target.value)} />
        <button style={selSt(soloAnomalias)} onClick={() => setSoloAnomalias(v => !v)}>⚠ Solo anomalías</button>
      </div>

      {error && <ErrorBox error={error} />}
      {!error && filtradas == null && <Cargando />}

      {filtradas != null && (
        <>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
            <KpiCard label={modo === "dia" ? "Presentes" : "Personas"} value={stats.presentes} color={C.green} />
            <KpiCard label="Casa" value={stats.casa} color="#60a5fa" />
            <KpiCard label="Contratistas" value={stats.contr} color="#fbbf24" />
            {modo === "dia" && <KpiCard label="Ausentes" value={ausentes.length} color={ausentes.length ? "#f87171" : C.green} sub={stats.ausentesJustificados ? `${stats.ausentesJustificados} just.` : ""} />}
            <KpiCard label="Anomalias" value={stats.anomalias} color={stats.anomalias ? C.amber : C.green} sub="sin salida / tarde" />
          </div>

          {filtradas.length === 0 ? (
            <div style={{ color: C.t2, fontSize: 13, padding: "40px 0", textAlign: "center" }}>Sin marcaciones para este filtro.</div>
          ) : (
            <div style={{ overflowX: "auto", border: `1px solid ${C.b0}`, borderRadius: 12 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {modo === "rango" && <Th>Fecha</Th>}
                    <Th>Empleado</Th>
                    <Th>Sede</Th>
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
                      <Td color={r.sede ? C.t1 : C.t2}>{r.sede ?? "—"}</Td>
                      <Td><GrupoBadge grupo={r.emp.grupo} contratistaNombre={r.emp.contratista?.nombre} /></Td>
                      <Td right mono color={r.tarde ? C.amber : C.t0}>{r.entrada ?? "—"}</Td>
                      <Td right mono>{r.salida ?? "—"}</Td>
                      <Td right mono color={r.min != null ? C.t0 : C.t2}>{r.min != null ? minToHM(r.min) : "—"}</Td>
                      <Td style={{ whiteSpace: "normal", minWidth: 190 }}>
                        {r.tarde && <span style={{ fontSize: 11, color: C.amber, marginRight: 6 }}>tarde</span>}
                        {r.sinSalida && <span style={{ fontSize: 11, color: "#f87171", marginRight: 6 }}>sin salida</span>}
                        {r.justificacion && <span title={r.justificacion.motivo} style={{ fontSize: 11, color: C.green, marginRight: 6 }}>justificada</span>}
                        <button
                          type="button"
                          style={{ ...BTN, padding: "3px 8px", fontSize: 11 }}
                          onClick={() => setJustModal({ emp: r.emp, fecha: r.fecha, actual: r.justificacion })}
                        >
                          {r.justificacion ? "Editar" : "Justificar"}
                        </button>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {modo === "dia" && ausentes.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 11, letterSpacing: 1.3, textTransform: "uppercase", color: "#f87171", fontWeight: 700, marginBottom: 8 }}>
                Ausentes ({ausentes.length}) — {fmtFecha(fecha)}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {ausentes.map(({ emp, justificacion }) => (
                  <div key={emp.id} style={{ fontSize: 12, color: C.t1, background: C.s0, border: `1px solid ${justificacion ? "rgba(16,185,129,0.28)" : C.b0}`, padding: "5px 11px", borderRadius: 7, display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
                    {emp.nombre}
                    {emp.sede && <span style={{ fontSize: 11, color: C.t2 }}>{emp.sede}</span>}
                    <GrupoBadge grupo={emp.grupo} contratistaNombre={emp.contratista?.nombre} />
                    <span style={{ fontSize: 11, color: justificacion ? C.green : "#f87171" }}>
                      ausente{justificacion ? " (justificada)" : ""}
                    </span>
                    <button
                      type="button"
                      style={{ ...BTN, padding: "2px 7px", fontSize: 11 }}
                      onClick={() => setJustModal({ emp, fecha, actual: justificacion })}
                    >
                      {justificacion ? "Editar" : "Justificar"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {justModal && (
        <JustificacionModal
          data={justModal}
          onClose={() => setJustModal(null)}
          onSave={guardarMotivo}
        />
      )}
    </div>
  );
}

function JustificacionModal({ data, onClose, onSave }) {
  const [motivo, setMotivo] = useState(data.actual?.motivo ?? "");
  const [saving, setSaving] = useState(false);
  const canSave = motivo.trim() || data.actual;

  async function guardar() {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSave(data.emp.id, data.fecha, motivo);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 2200, background: "var(--overlay-strong)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.panelSolid, border: `1px solid ${C.b1}`, borderRadius: 14, padding: 20, width: "min(430px,94vw)" }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.t0, marginBottom: 6 }}>Falta justificada</div>
        <div style={{ fontSize: 12, color: C.t2, marginBottom: 14 }}>{data.emp.nombre} · {fmtFecha(data.fecha)}</div>
        <textarea
          value={motivo}
          onChange={e => setMotivo(e.target.value)}
          placeholder="Motivo..."
          autoFocus
          style={{ ...INP, width: "100%", minHeight: 86, resize: "vertical", marginBottom: 12 }}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <button disabled={saving || !canSave} onClick={guardar} style={{ ...BTN_PRIMARY, flex: 1, opacity: saving || !canSave ? 0.55 : 1 }}>
            {saving ? "Guardando..." : motivo.trim() ? "Guardar" : "Quitar justificación"}
          </button>
          <button onClick={onClose} style={BTN}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}
