// Importador del reporte del fichero Hikvision (AllReport_*.xls).
// Flujo: elegir/arrastrar archivo → preview (período, empleados, desconocidos) →
// confirmar → upsert idempotente (reimportar el mismo archivo no duplica).
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/supabaseClient";
import { C } from "@/theme";
import { parseHikvisionReport } from "./hikvisionParser";
import { fetchBatches, fmtFecha, SEDES } from "./api";
import { BTN, BTN_GREEN, BTN_PRIMARY, Cargando, INP, KpiCard } from "./ui";

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

  useEffect(() => { fetchBatches().then(setBatches).catch(() => setBatches([])); }, [result]);

  async function onFile(file) {
    if (!file) return;
    setParseErr(null); setParsed(null); setResult(null); setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      setParsed(parseHikvisionReport(buf));
    } catch (e) {
      setParseErr(e);
    }
  }

  const dniMap = new Map((empleados ?? []).map(e => [e.dni, e]));
  const desconocidos = parsed ? parsed.empleados.filter(e => !dniMap.has(e.dni)) : [];
  const conDatos = parsed ? parsed.empleados.filter(e => e.marcaciones.length) : [];

  async function confirmar() {
    if (!parsed || importing || !sede) return;
    setImporting(true);
    try {
      // 1) Alta automática de DNIs desconocidos como "sin asignar"
      let nuevosIds = new Map();
      if (desconocidos.length) {
        const { data, error } = await supabase
          .from("rrhh_empleados")
          .upsert(desconocidos.map(e => ({ dni: e.dni, nombre: e.nombre, grupo: "casa", sede })), { onConflict: "dni" })
          .select("id, dni");
        if (error) throw error;
        nuevosIds = new Map((data ?? []).map(r => [r.dni, r.id]));
      }
      const idOf = (dni) => dniMap.get(dni)?.id ?? nuevosIds.get(dni);

      const existentesSinSede = parsed.empleados
        .map(e => dniMap.get(e.dni))
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
      const rows = [];
      for (const emp of parsed.empleados) {
        const eid = idOf(emp.dni);
        if (!eid) continue;
        for (const m of emp.marcaciones) {
          rows.push({
            empleado_id: eid, fecha: m.fecha, entrada: m.entrada,
            salida: m.salida, fichadas: m.fichadas, batch_id: batch.id, sede,
          });
        }
      }

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
        desconocidos: desconocidos.length,
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
            {result.desconocidos > 0 && <> Se dieron de alta <strong>{result.desconocidos}</strong> empleados nuevos como gente de la casa.</>}
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
            <KpiCard label="DNIs nuevos" value={desconocidos.length} color={desconocidos.length ? C.amber : C.green}
              sub={desconocidos.length ? "se crean como casa" : "todos ya en el maestro"} />
          </div>

          {desconocidos.length > 0 && (
            <div style={{ background: "rgba(245,158,11,0.05)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 9, padding: "10px 14px", marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: C.amber, fontWeight: 700, marginBottom: 6, letterSpacing: 1, textTransform: "uppercase" }}>No están en el maestro:</div>
              <div style={{ fontSize: 12, color: C.t1, lineHeight: 1.8 }}>
                {desconocidos.slice(0, 12).map(e => `${e.nombre} (${e.dni})`).join(" · ")}
                {desconocidos.length > 12 && ` · y ${desconocidos.length - 12} más…`}
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
