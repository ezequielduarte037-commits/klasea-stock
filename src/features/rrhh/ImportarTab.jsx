// Importador del reporte del fichero Hikvision (AllReport_*.xls).
// Flujo: elegir/arrastrar archivo → preview (período, empleados, desconocidos) →
// confirmar → upsert idempotente (reimportar el mismo archivo no duplica).
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/supabaseClient";
import { C } from "@/theme";
import { parseHikvisionReport } from "./hikvisionParser";
import { fetchBatches, fmtFecha, resolverEntradaSalida, SEDES } from "./api";
import { BTN, BTN_GREEN, BTN_PRIMARY, Cargando, INP, KpiCard } from "./ui";

function cleanText(value) {
  return String(value ?? "").trim();
}

function cleanDni(value) {
  return cleanText(value).replace(/\D/g, "");
}

function uniqueByDni(rows) {
  const out = new Map();
  for (const row of rows ?? []) {
    const dni = cleanDni(row?.dni);
    if (dni && !out.has(dni)) out.set(dni, row);
  }
  return [...out.values()];
}

function normName(value) {
  return cleanText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nameTokens(value) {
  return [...new Set(normName(value).split(" ").filter(t => t.length >= 2))];
}

function editDistance(a, b) {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  const curr = new Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(
        curr[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

function tokenScore(a, b) {
  if (a === b) return 1;
  const short = a.length <= b.length ? a : b;
  const long = a.length > b.length ? a : b;
  if (long === `${short}s` && short.length >= 4) return 0.97;
  const dist = editDistance(a, b);
  if (dist === 1 && Math.min(a.length, b.length) >= 5) return 0.92;
  if (long.startsWith(short) && short.length >= 5) return 0.9;
  return 0;
}

function nameMatchStats(reportName, candidateName) {
  const reportTokens = nameTokens(reportName);
  const candidateTokens = nameTokens(candidateName);
  if (!reportTokens.length || !candidateTokens.length) return { score: 0, matched: 0 };

  const used = new Set();
  const matches = [];
  for (let reportIndex = 0; reportIndex < reportTokens.length; reportIndex++) {
    const token = reportTokens[reportIndex];
    let best = { index: -1, score: 0 };
    for (let i = 0; i < candidateTokens.length; i++) {
      if (used.has(i)) continue;
      const score = tokenScore(token, candidateTokens[i]);
      if (score > best.score) best = { index: i, score };
    }
    if (best.score >= 0.9) {
      used.add(best.index);
      matches.push({ reportIndex, candidateIndex: best.index, score: best.score });
    }
  }

  const shorter = Math.min(reportTokens.length, candidateTokens.length);
  const matchedReport = new Set(matches.map(m => m.reportIndex));
  const matchedCandidate = new Set(matches.map(m => m.candidateIndex));
  const hasStrongAnchor = matches.some(m => m.score >= 0.97 && reportTokens[m.reportIndex].length >= 4 && candidateTokens[m.candidateIndex].length >= 4);
  const initialFallback = matches.length === 1 && shorter >= 2 && hasStrongAnchor && reportTokens.some((token, reportIndex) => {
    if (matchedReport.has(reportIndex) || token.length > 3) return false;
    return candidateTokens.some((candidate, candidateIndex) =>
      !matchedCandidate.has(candidateIndex)
      && candidate[0] === token[0]
      && candidate.length >= 5
    );
  });

  const effectiveMatched = matches.length + (initialFallback ? 1 : 0);
  const scoreSum = matches.reduce((sum, value) => sum + value.score, 0) + (initialFallback ? 0.82 : 0);
  const coverage = effectiveMatched / shorter;
  const avg = scoreSum / (effectiveMatched || 1);
  const enoughIdentity = shorter === 1 ? avg >= 0.98 : effectiveMatched >= 2;
  return {
    matched: effectiveMatched,
    score: enoughIdentity && coverage >= 0.86 && avg >= 0.9 ? coverage * avg : 0,
  };
}

function findUniqueNameMatch(reportName, candidates) {
  const matches = candidates
    .map(emp => ({ emp, ...nameMatchStats(reportName, emp.nombre) }))
    .filter(m => m.score >= 0.86)
    .sort((a, b) => b.score - a.score || b.matched - a.matched);

  if (!matches.length) return null;
  if (matches.length > 1 && Math.abs(matches[0].score - matches[1].score) < 0.08) return null;
  return matches[0].emp;
}

function mergeMarcacionRow(current, next) {
  if (!current) return next;
  const fichadas = [...new Set([...(current.fichadas ?? []), ...(next.fichadas ?? [])])]
    .filter(Boolean)
    .sort();
  const resuelta = resolverEntradaSalida({ fichadas, entrada: current.entrada ?? next.entrada, salida: current.salida ?? next.salida });
  if (current.editado_por) {
    return {
      ...current,
      ...next,
      entrada: current.entrada,
      salida: current.salida,
      fichadas,
      sede: current.sede ?? next.sede,
    };
  }
  return {
    ...current,
    ...next,
    entrada: resuelta.entrada,
    salida: resuelta.salida,
    fichadas,
    sede: current.sede ?? next.sede,
  };
}

export default function ImportarTab({ empleados, onImported }) {
  const fileRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [parsed, setParsed] = useState(null);     // resultado del parser
  const [fileName, setFileName] = useState("");
  const [parseErr, setParseErr] = useState(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [batches, setBatches] = useState(null);
  const [sede, setSede] = useState("");
  const [vincularDnis, setVincularDnis] = useState({});

  useEffect(() => { fetchBatches().then(setBatches).catch(() => setBatches([])); }, [result]);

  async function onFile(file) {
    if (!file) return;
    setParseErr(null); setParsed(null); setResult(null); setFileName(file.name); setVincularDnis({});
    try {
      const buf = await file.arrayBuffer();
      setParsed(parseHikvisionReport(buf));
    } catch (e) {
      setParseErr(e);
    }
  }

  const dniMap = new Map((empleados ?? []).filter(e => cleanDni(e.dni)).map(e => [cleanDni(e.dni), e]));
  const empleadosParaCruceNombre = (empleados ?? []).filter(e => e.activo !== false);
  const desconocidosRaw = parsed ? parsed.empleados.filter(e => !dniMap.has(cleanDni(e.dni))) : [];
  const absorbiblesPorNombre = desconocidosRaw
    .map(e => ({ ...e, match: findUniqueNameMatch(e.nombre, empleadosParaCruceNombre) }))
    .filter(e => e.match && e.marcaciones.length);
  const absorbibleDnis = new Set(absorbiblesPorNombre.map(e => cleanDni(e.dni)));
  const desconocidos = desconocidosRaw.filter(e => !absorbibleDnis.has(cleanDni(e.dni)));
  const desconocidosConFichadas = uniqueByDni(desconocidos.filter(e => e.marcaciones.length));
  const descartadosSinFichadas = uniqueByDni(desconocidos.filter(e => !e.marcaciones.length));
  const desconocidosConFichadasKey = desconocidosConFichadas.map(e => cleanDni(e.dni)).join("|");
  const conDatos = parsed ? parsed.empleados.filter(e => e.marcaciones.length) : [];

  useEffect(() => {
    if (!parsed) return;
    setVincularDnis(prev => {
      const next = {};
      for (const emp of desconocidosConFichadas) {
        next[cleanDni(emp.dni)] = prev[cleanDni(emp.dni)] ?? true;
      }
      return next;
    });
  }, [parsed, desconocidosConFichadasKey]);

  function setTodosVinculados(value) {
    setVincularDnis(Object.fromEntries(desconocidosConFichadas.map(e => [cleanDni(e.dni), value])));
  }

  async function confirmar() {
    if (!parsed || importing || !sede) return;
    setImporting(true);
    try {
      // 1) Absorber DNIs por nombre y crear solo los nuevos seleccionados.
      const absorbidosIds = new Map();
      for (const emp of absorbiblesPorNombre) {
        const dniNuevo = cleanDni(emp.dni);
        const dniAnterior = cleanDni(emp.match.dni);
        const notasDni = dniAnterior && dniAnterior !== dniNuevo
          ? [emp.match.notas, `DNI corregido desde reporte ${fileName}: ${emp.match.dni} -> ${dniNuevo}`].filter(Boolean).join("\n")
          : emp.match.notas;
        const { data, error } = await supabase
          .from("rrhh_empleados")
          .update({
            dni: dniNuevo,
            sede: emp.match.sede || sede,
            ficha: true,
            activo: true,
            notas: notasDni || null,
          })
          .eq("id", emp.match.id)
          .select("id, dni")
          .single();
        if (error) throw error;
        absorbidosIds.set(cleanDni(data.dni), data.id);
      }

      const seleccionados = uniqueByDni(desconocidosConFichadas.filter(e => vincularDnis[cleanDni(e.dni)]));
      let nuevosIds = new Map();
      if (seleccionados.length) {
        const { data, error } = await supabase
          .from("rrhh_empleados")
          .upsert(
            seleccionados.map(e => ({
              dni: cleanDni(e.dni),
              nombre: e.nombre,
              grupo: "sin_asignar",
              sede,
              ficha: true,
              activo: true,
              notas: `Alta desde reporte ${fileName}`,
            })),
            { onConflict: "dni" },
          )
          .select("id, dni");
        if (error) throw error;
        nuevosIds = new Map((data ?? []).map(r => [cleanDni(r.dni), r.id]));
      }
      const idOf = (dni) => dniMap.get(cleanDni(dni))?.id ?? absorbidosIds.get(cleanDni(dni)) ?? nuevosIds.get(cleanDni(dni));

      const existentesSinSede = parsed.empleados
        .map(e => dniMap.get(cleanDni(e.dni)))
        .filter(e => e?.id && !e.sede)
        .map(e => e.id);
      if (existentesSinSede.length) {
        const { error } = await supabase
          .from("rrhh_empleados")
          .update({ sede })
          .in("id", existentesSinSede);
        if (error) throw error;
      }

      // 2) Batch
      const { data: batch, error: bErr } = await supabase
        .from("rrhh_import_batches")
        .insert({ filename: fileName, periodo_desde: parsed.periodo.desde, periodo_hasta: parsed.periodo.hasta, sede })
        .select("id").single();
      if (bErr) throw bErr;

      // 3) Filas de marcaciones
      const rowsByKey = new Map();
      for (const emp of parsed.empleados) {
        const eid = idOf(emp.dni);
        if (!eid) continue;
        for (const m of emp.marcaciones) {
          const row = {
            empleado_id: eid, fecha: m.fecha, entrada: m.entrada,
            salida: m.salida, fichadas: m.fichadas, batch_id: batch.id, sede,
          };
          const key = `${eid}|${m.fecha}`;
          rowsByKey.set(key, mergeMarcacionRow(rowsByKey.get(key), row));
        }
      }

      const empleadoIds = [...new Set([...rowsByKey.values()].map(row => row.empleado_id).filter(Boolean))];
      if (empleadoIds.length) {
        const { data: existentesMarcaciones, error: existentesErr } = await supabase
          .from("rrhh_marcaciones")
          .select("empleado_id, fecha, entrada, salida, fichadas, editado_por, sede")
          .in("empleado_id", empleadoIds)
          .gte("fecha", parsed.periodo.desde)
          .lte("fecha", parsed.periodo.hasta);
        if (existentesErr) throw existentesErr;
        for (const existente of existentesMarcaciones ?? []) {
          const key = `${existente.empleado_id}|${existente.fecha}`;
          if (!rowsByKey.has(key)) continue;
          rowsByKey.set(key, mergeMarcacionRow(existente, rowsByKey.get(key)));
        }
      }

      const rows = [...rowsByKey.values()];

      // ¿cuántas ya existían? (para reportar nuevas vs actualizadas)
      const { count: existentes, error: cErr } = await supabase
        .from("rrhh_marcaciones")
        .select("id", { count: "exact", head: true })
        .gte("fecha", parsed.periodo.desde)
        .lte("fecha", parsed.periodo.hasta);
      if (cErr) throw cErr;

      // 4) Upsert por lotes (idempotente por (empleado_id, fecha))
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await supabase
          .from("rrhh_marcaciones")
          .upsert(rows.slice(i, i + 500), { onConflict: "empleado_id,fecha" });
        if (error) throw error;
      }

      const stats = {
        marcaciones: rows.length,
        nuevas: Math.max(0, rows.length - (existentes ?? 0)),
        actualizadas: Math.min(rows.length, existentes ?? 0),
        empleados: parsed.empleados.length,
        desconocidos: seleccionados.length,
        dni_absorbidos: absorbidosIds.size,
        descartados_sin_fichadas: descartadosSinFichadas.length,
        pendientes_no_vinculados: desconocidosConFichadas.length - seleccionados.length,
        sede,
      };
      await supabase.from("rrhh_import_batches").update({ stats }).eq("id", batch.id);

      setResult(stats);
      setParsed(null);
      onImported?.();
    } catch (e) {
      setParseErr(e);
    } finally {
      setImporting(false);
    }
  }

  return (
    <div>
      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); onFile(e.dataTransfer.files?.[0]); }}
        onClick={() => fileRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? "#60a5fa" : C.b0}`, borderRadius: 14,
          padding: "34px 20px", textAlign: "center", cursor: "pointer",
          background: dragging ? "rgba(59,130,246,0.05)" : C.s0, transition: "all .2s", marginBottom: 18,
        }}
      >
        <div style={{ fontSize: 30, marginBottom: 8 }}>📄</div>
        <div style={{ fontSize: 14, color: C.t0, fontWeight: 600 }}>Arrastrá el reporte del fichero acá</div>
        <div style={{ fontSize: 12, color: C.t2, marginTop: 5 }}>
          Export del Hikvision (AllReport_*.xls) · También podés hacer click para elegirlo
        </div>
        <input ref={fileRef} type="file" accept=".xls,.xlsx" style={{ display: "none" }}
          onChange={e => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
      </div>

      {parseErr && (
        <div style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 10, padding: 14, marginBottom: 16, fontSize: 13, color: "#f87171" }}>
          {String(parseErr.message ?? parseErr)}
        </div>
      )}

      {result && (
        <div style={{ background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: 12, padding: 18, marginBottom: 16 }}>
          <div style={{ fontSize: 14, color: C.green, fontWeight: 700, marginBottom: 6 }}>✓ Importación completada</div>
          <div style={{ fontSize: 13, color: C.t1, lineHeight: 1.8 }}>
            {result.marcaciones} marcaciones procesadas para <strong>{result.sede}</strong> ({result.nuevas} nuevas, {result.actualizadas} ya existían y se actualizaron).
            {result.dni_absorbidos > 0 && <> Se absorbieron <strong>{result.dni_absorbidos}</strong> DNI en empleados existentes.</>}
            {result.desconocidos > 0 && <> Se vincularon <strong>{result.desconocidos}</strong> empleados nuevos como sin asignar.</>}
            {result.descartados_sin_fichadas > 0 && <> Se descartaron <strong>{result.descartados_sin_fichadas}</strong> personas sin fichadas en el periodo.</>}
            {result.pendientes_no_vinculados > 0 && <> Quedaron <strong>{result.pendientes_no_vinculados}</strong> personas sin vincular.</>}
          </div>
        </div>
      )}

      {/* Preview */}
      {parsed && (
        <div style={{ background: C.s0, border: `1px solid ${C.b1}`, borderRadius: 14, padding: 20, marginBottom: 18 }}>
          <div style={{ fontSize: 11, letterSpacing: 1.3, textTransform: "uppercase", color: "#60a5fa", fontWeight: 700, marginBottom: 12 }}>
            Vista previa — {fileName}
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 10, letterSpacing: 1.3, color: C.t2, display: "block", marginBottom: 4, textTransform: "uppercase", fontWeight: 700 }}>
              Galpon del reporte *
            </label>
            <select style={{ ...INP, minWidth: 190 }} value={sede} onChange={e => setSede(e.target.value)}>
              <option value="">Elegir Pampa o Chubut</option>
              {SEDES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
            <KpiCard label="Período" value={`${fmtFecha(parsed.periodo.desde)} – ${fmtFecha(parsed.periodo.hasta)}`} sub={`${parsed.dias.length} día${parsed.dias.length !== 1 ? "s" : ""}`} />
            <KpiCard label="Empleados en el archivo" value={parsed.empleados.length} sub={`${conDatos.length} con fichadas`} />
            <KpiCard label="Marcaciones" value={parsed.totalMarcaciones} />
            <KpiCard label="DNI absorbibles" value={absorbiblesPorNombre.length} color={absorbiblesPorNombre.length ? C.blue : C.green}
              sub={absorbiblesPorNombre.length ? "matchean por nombre" : "sin coincidencias"} />
            <KpiCard label="Para vincular" value={desconocidosConFichadas.length} color={desconocidosConFichadas.length ? C.amber : C.green}
              sub={desconocidosConFichadas.length ? "selecciona cuales entran" : "sin nuevos con fichadas"} />
            <KpiCard label="Descartados" value={descartadosSinFichadas.length} color={descartadosSinFichadas.length ? C.red : C.green}
              sub="sin fichadas" />
          </div>

          {absorbiblesPorNombre.length > 0 && (
            <div style={{ background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.24)", borderRadius: 9, padding: "10px 14px", marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: C.blue, fontWeight: 800, marginBottom: 6, letterSpacing: 1, textTransform: "uppercase" }}>
                DNI detectado para empleados existentes
              </div>
              <div style={{ fontSize: 12, color: C.t1, lineHeight: 1.8 }}>
                {absorbiblesPorNombre.slice(0, 10).map(e => `${e.match.nombre} <- ${cleanDni(e.dni)} (${e.nombre})`).join("  |  ")}
                {absorbiblesPorNombre.length > 10 && `  |  y ${absorbiblesPorNombre.length - 10} mas...`}
              </div>
            </div>
          )}

          {desconocidosConFichadas.length > 0 && (
            <div style={{ background: "rgba(245,158,11,0.05)", border: "1px solid rgba(245,158,11,0.24)", borderRadius: 9, padding: "12px 14px", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 11, color: C.amber, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase" }}>
                    Vinculamos a estas personas?
                  </div>
                  <div style={{ fontSize: 12, color: C.t2, marginTop: 3 }}>
                    Solo las seleccionadas se crean como sin asignar. Las no seleccionadas se ignoran en esta importacion.
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button type="button" onClick={() => setTodosVinculados(true)} style={{ ...BTN, fontSize: 11, padding: "5px 9px" }}>Todos</button>
                  <button type="button" onClick={() => setTodosVinculados(false)} style={{ ...BTN, fontSize: 11, padding: "5px 9px" }}>Ninguno</button>
                </div>
              </div>
              <div style={{ display: "grid", gap: 6, maxHeight: 230, overflow: "auto", paddingRight: 4 }}>
                {desconocidosConFichadas.map(e => {
                  const dni = cleanDni(e.dni);
                  return (
                    <label key={dni} style={{ display: "grid", gridTemplateColumns: "22px 1fr auto auto", alignItems: "center", gap: 10, background: C.s1, border: `1px solid ${C.b0}`, borderRadius: 8, padding: "8px 10px", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={!!vincularDnis[dni]}
                        onChange={ev => setVincularDnis(prev => ({ ...prev, [dni]: ev.target.checked }))}
                      />
                      <span style={{ fontSize: 13, color: C.t0, fontWeight: 700 }}>{e.nombre}</span>
                      <span style={{ fontSize: 12, color: C.t2, fontFamily: C.mono }}>{dni}</span>
                      <span style={{ fontSize: 11, color: C.t2 }}>{e.marcaciones.length} fichadas</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {descartadosSinFichadas.length > 0 && (
            <div style={{ background: "rgba(113,113,122,0.08)", border: `1px solid ${C.b0}`, borderRadius: 9, padding: "10px 14px", marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: C.t2, fontWeight: 800, marginBottom: 5, letterSpacing: 1, textTransform: "uppercase" }}>
                Descartados automaticamente
              </div>
              <div style={{ fontSize: 12, color: C.t1, lineHeight: 1.7 }}>
                {descartadosSinFichadas.length} personas no se van a crear porque no tienen fichadas en este periodo.
                {descartadosSinFichadas.length <= 8 && ` ${descartadosSinFichadas.map(e => `${e.nombre} (${cleanDni(e.dni)})`).join(" | ")}`}
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={confirmar} disabled={importing || !sede} style={{ ...BTN_GREEN, opacity: importing || !sede ? 0.6 : 1, padding: "9px 22px", fontSize: 13 }}>
              {importing ? "Importando…" : "Confirmar e importar"}
            </button>
            <button onClick={() => setParsed(null)} disabled={importing} style={BTN}>Cancelar</button>
          </div>
          <div style={{ fontSize: 11, color: C.t2, marginTop: 10 }}>
            Reimportar el mismo archivo no duplica: las marcaciones existentes se actualizan.
          </div>
        </div>
      )}

      {/* Historial */}
      <div style={{ fontSize: 11, letterSpacing: 1.3, textTransform: "uppercase", color: C.t2, fontWeight: 700, margin: "20px 0 8px" }}>
        Importaciones anteriores
      </div>
      {batches == null ? <Cargando /> : batches.length === 0 ? (
        <div style={{ fontSize: 13, color: C.t2, padding: "14px 0" }}>Todavía no se importó ningún reporte.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {batches.map(b => (
            <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 14, background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 9, padding: "9px 14px", flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, color: C.t0, fontWeight: 600, flex: 1, minWidth: 140 }}>{b.filename}</span>
              {b.sede && <span style={{ fontSize: 11, color: "#60a5fa", background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.25)", padding: "3px 7px", borderRadius: 6 }}>{b.sede}</span>}
              <span style={{ fontSize: 12, color: C.t1, fontFamily: C.mono }}>{fmtFecha(b.periodo_desde)} – {fmtFecha(b.periodo_hasta)}</span>
              {b.stats && <span style={{ fontSize: 12, color: C.t2 }}>{b.stats.marcaciones} marc. · {b.stats.desconocidos ?? 0} nuevos</span>}
              <span style={{ fontSize: 11, color: C.t2 }}>{new Date(b.created_at).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
