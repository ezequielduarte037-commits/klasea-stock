// Horas extras por rango: compara lo trabajado contra la jornada esperada
// (lun-vie / sábado configurables; domingo todo cuenta como extra).
import { useEffect, useMemo, useState } from "react";
import { C } from "@/theme";
import {
  addDays, downloadCsv, duracionMin, fetchMarcaciones, fmtFechaCorta,
  hoyIso, jornadaDelDia, minToHM, saveConfig,
} from "./api";
import { BTN, Cargando, ErrorBox, GrupoBadge, INP, KpiCard, LBL, Td, Th } from "./ui";

export default function ExtrasTab({ empleados, contratistas, config, onConfigChange, esAdmin }) {
  const hoy = hoyIso();
  const [desde, setDesde] = useState(addDays(hoy, -13));
  const [hasta, setHasta] = useState(hoy);
  const [marcas, setMarcas] = useState(null);
  const [error, setError] = useState(null);
  const [filtroGrupo, setFiltroGrupo] = useState("todos");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState(null);
  const [showCfg, setShowCfg] = useState(false);
  const [cfgForm, setCfgForm] = useState({ jornada: config.jornada_min / 60, sabado: config.jornada_sabado_min / 60 });

  useEffect(() => {
    let alive = true;
    setMarcas(null); setError(null);
    fetchMarcaciones(desde, hasta)
      .then(rows => { if (alive) setMarcas(rows); })
      .catch(e => { if (alive) setError(e); });
    return () => { alive = false; };
  }, [desde, hasta]);

  const empById = useMemo(() => new Map((empleados ?? []).map(e => [e.id, e])), [empleados]);

  // Agregado por empleado
  const filas = useMemo(() => {
    if (!marcas) return null;
    const map = new Map();
    for (const m of marcas) {
      const emp = empById.get(m.empleado_id);
      if (!emp || emp.ficha === false) continue;
      const min = duracionMin(m);
      if (min == null) continue; // sin salida: no se puede computar
      const jornada = jornadaDelDia(m.fecha, config);
      const extra = Math.max(0, min - jornada);
      let row = map.get(emp.id);
      if (!row) { row = { emp, dias: 0, totalMin: 0, extraMin: 0, detalle: [] }; map.set(emp.id, row); }
      row.dias += 1;
      row.totalMin += min;
      row.extraMin += extra;
      row.detalle.push({ fecha: m.fecha, min, jornada, extra });
    }
    return [...map.values()].sort((a, b) => b.extraMin - a.extraMin || a.emp.nombre.localeCompare(b.emp.nombre, "es"));
  }, [marcas, empById, config]);

  const filtradas = useMemo(() => {
    if (!filas) return null;
    let rows = filas;
    if (filtroGrupo === "casa") rows = rows.filter(r => r.emp.grupo === "casa");
    else if (filtroGrupo === "contratistas") rows = rows.filter(r => r.emp.grupo === "contratista");
    else if (filtroGrupo === "sin_asignar") rows = rows.filter(r => r.emp.grupo === "sin_asignar");
    else if (filtroGrupo.startsWith("c:")) rows = rows.filter(r => r.emp.contratista_id === filtroGrupo.slice(2));
    if (q.trim()) {
      const qq = q.toLowerCase();
      rows = rows.filter(r => r.emp.nombre.toLowerCase().includes(qq) || r.emp.dni.includes(qq));
    }
    return rows;
  }, [filas, filtroGrupo, q]);

  const totales = useMemo(() => {
    if (!filtradas) return null;
    return {
      extra: filtradas.reduce((a, r) => a + r.extraMin, 0),
      conExtra: filtradas.filter(r => r.extraMin > 0).length,
      personas: filtradas.length,
    };
  }, [filtradas]);

  async function guardarCfg() {
    const j = Math.round(Number(cfgForm.jornada) * 60);
    const s = Math.round(Number(cfgForm.sabado) * 60);
    if (!Number.isFinite(j) || j <= 0 || !Number.isFinite(s) || s < 0) return;
    await saveConfig("jornada_min", j);
    await saveConfig("jornada_sabado_min", s);
    setShowCfg(false);
    onConfigChange?.();
  }

  function exportar() {
    if (!filtradas) return;
    downloadCsv(
      `horas_extras_${desde}_${hasta}.csv`,
      ["DNI", "Nombre", "Grupo", "Contratista", "Días", "Horas totales", "Horas extra"],
      filtradas.map(r => [
        r.emp.dni, r.emp.nombre,
        r.emp.grupo === "casa" ? "Casa" : r.emp.grupo === "contratista" ? "Contratista" : "Sin asignar",
        r.emp.contratista?.nombre ?? "", r.dias, minToHM(r.totalMin), minToHM(r.extraMin),
      ]),
    );
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        <input type="date" style={INP} value={desde} onChange={e => e.target.value && setDesde(e.target.value)} />
        <span style={{ color: C.t2, fontSize: 12 }}>→</span>
        <input type="date" style={INP} value={hasta} onChange={e => e.target.value && setHasta(e.target.value)} />
        <select style={{ ...INP, minWidth: 170 }} value={filtroGrupo} onChange={e => setFiltroGrupo(e.target.value)}>
          <option value="todos">Todos los grupos</option>
          <option value="casa">Gente de la casa</option>
          <option value="contratistas">Todos los contratistas</option>
          <option value="sin_asignar">Sin asignar</option>
          {(contratistas ?? []).map(c => <option key={c.id} value={`c:${c.id}`}>↳ {c.nombre}</option>)}
        </select>
        <input style={{ ...INP, flex: 1, minWidth: 140 }} placeholder="Buscar…" value={q} onChange={e => setQ(e.target.value)} />
        {esAdmin && <button style={BTN} onClick={() => setShowCfg(v => !v)}>⚙ Jornada</button>}
        <button style={BTN} onClick={exportar}>⬇ CSV</button>
      </div>

      {showCfg && (
        <div style={{ background: C.s0, border: `1px solid ${C.b1}`, borderRadius: 12, padding: 16, marginBottom: 16, display: "flex", gap: 14, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <label style={LBL}>Jornada lun–vie (horas)</label>
            <input type="number" step="0.5" min="1" style={{ ...INP, width: 110 }} value={cfgForm.jornada}
              onChange={e => setCfgForm(f => ({ ...f, jornada: e.target.value }))} />
          </div>
          <div>
            <label style={LBL}>Jornada sábado (horas)</label>
            <input type="number" step="0.5" min="0" style={{ ...INP, width: 110 }} value={cfgForm.sabado}
              onChange={e => setCfgForm(f => ({ ...f, sabado: e.target.value }))} />
          </div>
          <div style={{ fontSize: 11, color: C.t2, flex: 1, minWidth: 180, lineHeight: 1.6 }}>
            Lo que supere la jornada del día cuenta como extra. Sábado y domingo (jornada 0) todo es extra, salvo que cargues horas de sábado.
          </div>
          <button style={{ ...BTN, background: "rgba(59,130,246,0.12)", borderColor: "rgba(59,130,246,0.3)", color: "#60a5fa" }} onClick={guardarCfg}>Guardar</button>
        </div>
      )}

      {error && <ErrorBox error={error} />}
      {!error && filtradas == null && <Cargando />}

      {filtradas != null && (
        <>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
            <KpiCard label="Horas extra del rango" value={minToHM(totales.extra)} color={totales.extra > 0 ? C.amber : C.green} />
            <KpiCard label="Personas con extras" value={totales.conExtra} sub={`de ${totales.personas} con fichadas`} />
            <KpiCard label="Jornada" value={`${config.jornada_min / 60} h`} sub={config.jornada_sabado_min > 0 ? `L–V · sábado ${config.jornada_sabado_min / 60} h · resto extra` : "L–V 7 a 16 · fuera de eso, todo extra"} />
          </div>

          {filtradas.length === 0 ? (
            <div style={{ color: C.t2, fontSize: 13, padding: "40px 0", textAlign: "center" }}>Sin datos en este rango.</div>
          ) : (
            <div style={{ overflowX: "auto", border: `1px solid ${C.b0}`, borderRadius: 12 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <Th>Empleado</Th><Th>Grupo</Th>
                    <Th right>Días</Th><Th right>Horas</Th><Th right>Extras</Th><Th> </Th>
                  </tr>
                </thead>
                <tbody>
                  {filtradas.map(r => (
                    <FilaExtra key={r.emp.id} r={r} open={openId === r.emp.id}
                      onToggle={() => setOpenId(openId === r.emp.id ? null : r.emp.id)} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function FilaExtra({ r, open, onToggle }) {
  return (
    <>
      <tr onClick={onToggle} style={{ cursor: "pointer" }}>
        <Td>
          {r.emp.nombre}
          <span style={{ fontSize: 11, color: C.t2, fontFamily: C.mono, marginLeft: 8 }}>{r.emp.dni}</span>
        </Td>
        <Td><GrupoBadge grupo={r.emp.grupo} contratistaNombre={r.emp.contratista?.nombre} /></Td>
        <Td right mono>{r.dias}</Td>
        <Td right mono>{minToHM(r.totalMin)}</Td>
        <Td right mono color={r.extraMin > 0 ? C.amber : C.t2} style={{ fontWeight: r.extraMin > 0 ? 700 : 400 }}>
          {minToHM(r.extraMin)}
        </Td>
        <Td color={C.t2}>{open ? "▾" : "▸"}</Td>
      </tr>
      {open && (
        <tr>
          <td colSpan={6} style={{ padding: "4px 12px 12px", borderBottom: `1px solid ${C.b0}`, background: "rgba(255,255,255,0.015)" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {r.detalle.map(d => (
                <div key={d.fecha} style={{
                  fontSize: 11, fontFamily: C.mono, padding: "4px 9px", borderRadius: 6,
                  background: d.extra > 0 ? "rgba(245,158,11,0.08)" : C.s0,
                  border: `1px solid ${d.extra > 0 ? "rgba(245,158,11,0.25)" : C.b0}`,
                  color: d.extra > 0 ? C.amber : C.t2,
                }}>
                  {fmtFechaCorta(d.fecha)} · {minToHM(d.min)}{d.extra > 0 && ` (+${minToHM(d.extra)})`}
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
