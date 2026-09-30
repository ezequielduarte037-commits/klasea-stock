import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardList, Package, Plus, Route, Settings2, Trash2, X } from "lucide-react";
import { supabase } from "@/supabaseClient";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { NuevaLineaModal } from "@/features/obras/ObrasModales";
import { COLOR_PRESETS, hasMatrixDetailColumns, num } from "@/features/obras/obrasHelpers";
import { catalogModelForLine } from "@/features/obras/produccionMaterialesApi";
import ConfigRecorrido from "./ConfigRecorrido";
import ConfigTareas from "./ConfigTareas";
import ConfigProductos from "./ConfigProductos";
import { plural } from "./formato";

// Configuración de líneas: lo que toma cada obra de la línea. Tres pasos a la
// vista con su avance: el recorrido (etapas ubicadas respecto del desmolde),
// las tareas de cada etapa y los productos que usa cada etapa.
// `inicial` ({ lineaId, tab, procesoId }) llega desde el panel de una obra;
// ObrasScreen remonta la vista con otra key cuando cambia.

async function todo(consulta, paso = 1000) {
  const filas = [];
  for (let desde = 0; desde < 20000; desde += paso) {
    const { data, error } = await consulta().range(desde, desde + paso - 1);
    if (error) throw error;
    filas.push(...(data || []));
    if (!data || data.length < paso) break;
  }
  return filas;
}

const leer = (k, d) => { try { return window.localStorage.getItem(k) ?? d; } catch { return d; } };
const guardar = (k, v) => { try { window.localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };

export default function ConfigView({ datos, esGestion, isMobile, inicial }) {
  const toast = useToast();
  const { lineas, procsPorLinea, stageOffsets, obras, cargar } = datos;
  const [lineaId, setLineaId] = useState(() => inicial?.lineaId || leer("obras_config_linea", ""));
  const [tab, setTab] = useState(inicial?.tab || "recorrido");
  const [procesoSel, setProcesoSel] = useState(inicial?.procesoId || null);
  const [tareasTpl, setTareasTpl] = useState([]);
  const [resumen, setResumen] = useState({ matriz: new Map(), asignados: new Map() });
  const [cobertura, setCobertura] = useState({});
  const [nuevaLinea, setNuevaLinea] = useState(false);
  const [datosLinea, setDatosLinea] = useState(false);

  const linea = lineas.find((l) => l.id === lineaId) || lineas.find((l) => (procsPorLinea.get(l.id) || []).length) || lineas[0] || null;
  const procesos = useMemo(() => (linea ? procsPorLinea.get(linea.id) || [] : []), [linea, procsPorLinea]);
  useEffect(() => { if (linea) guardar("obras_config_linea", linea.id); }, [linea]);
  // La etapa elegida puede no ser de esta línea (recién se cambió): la primera.
  const procesoActivo = procesos.some((p) => p.id === procesoSel) ? procesoSel : procesos[0]?.id ?? null;

  const cargarResumen = useCallback(async () => {
    try {
      const [tpl, matriz, asig] = await Promise.all([
        todo(() => supabase.from("linea_proceso_tareas").select("*").order("linea_proceso_id").order("orden")),
        todo(() => supabase.from("panol_material_modelo").select("material_id,modelo")),
        todo(() => supabase.from("linea_proceso_materiales").select("linea_proceso_id,material_id")),
      ]);
      setTareasTpl(tpl);
      const m = new Map();
      matriz.forEach((r) => { const k = String(r.modelo); if (!m.has(k)) m.set(k, new Set()); m.get(k).add(r.material_id); });
      const a = new Map();
      asig.forEach((r) => { if (!a.has(r.linea_proceso_id)) a.set(r.linea_proceso_id, new Set()); a.get(r.linea_proceso_id).add(r.material_id); });
      setResumen({ matriz: m, asignados: a });
    } catch (e) {
      toast.error(`No se pudo leer la configuración: ${e.message}`);
    }
  }, [toast]);
  useEffect(() => {
    const t = setTimeout(cargarResumen, 0);
    return () => clearTimeout(t);
  }, [cargarResumen]);

  const estadoLinea = useCallback((l) => {
    const procs = procsPorLinea.get(l.id) || [];
    const ubicadas = procs.filter((p) => stageOffsets.has(p.id)).length;
    const ids = new Set(procs.map((p) => p.id));
    const tareas = tareasTpl.filter((t) => ids.has(t.linea_proceso_id)).length;
    const exacta = cobertura[l.id];
    let prodTotal = 0, prodUbicados = 0;
    if (exacta) { prodTotal = exacta.total; prodUbicados = exacta.cubiertos; }
    else {
      const matriz = resumen.matriz.get(catalogModelForLine(l)) || new Set();
      const usados = new Set();
      procs.forEach((p) => (resumen.asignados.get(p.id) || new Set()).forEach((id) => usados.add(id)));
      prodTotal = matriz.size;
      prodUbicados = [...matriz].filter((id) => usados.has(id)).length;
    }
    return {
      etapas: procs.length, ubicadas, tareas, prodTotal, prodUbicados,
      activas: obras.filter((o) => o.linea_id === l.id && o.estado === "activa").length,
    };
  }, [procsPorLinea, stageOffsets, tareasTpl, resumen, cobertura, obras]);

  const onCobertura = useCallback((id, c) => setCobertura((prev) => (prev[id]?.cubiertos === c.cubiertos && prev[id]?.total === c.total ? prev : { ...prev, [id]: c })), []);
  const e = linea ? estadoLinea(linea) : null;
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const detalleHabilitado = datos.lProcs.some(hasMatrixDetailColumns);
  const tareasLinea = useMemo(() => { const ids = new Set(procesos.map((p) => p.id)); return tareasTpl.filter((t) => ids.has(t.linea_proceso_id)); }, [tareasTpl, procesos]);

  const pasos = e ? [
    {
      k: "recorrido", Icono: Route, titulo: "Recorrido",
      detalle: e.etapas ? (e.ubicadas === e.etapas ? `Las ${e.etapas} etapas ubicadas` : `${e.ubicadas} de ${e.etapas} etapas ubicadas`) : "Sin etapas",
      tono: !e.etapas ? "neutro" : e.ubicadas === e.etapas ? "verde" : "cian", v: pct(e.ubicadas, e.etapas),
    },
    {
      k: "tareas", Icono: ClipboardList, titulo: "Tareas",
      detalle: e.tareas ? `${plural(e.tareas, "tarea", "tareas")} en ${plural(e.etapas, "etapa", "etapas")}` : "Sin tareas",
      tono: e.tareas ? "azul" : "neutro", v: e.tareas ? 100 : 0,
    },
    {
      k: "productos", Icono: Package, titulo: "Productos",
      detalle: e.prodTotal ? `${e.prodUbicados} de ${e.prodTotal} ubicados` : "Sin matriz del modelo",
      tono: !e.prodTotal ? "neutro" : e.prodUbicados >= e.prodTotal ? "verde" : "cian", v: pct(e.prodUbicados, e.prodTotal),
    },
  ] : [];

  return (
    <>
      <div className="prd-barra">
        <div className="prd-barra-fila">
          <div className="prd-titulos">
            <div className="prd-eyebrow">Producción</div>
            <h1 className="prd-h1">Configuración de <span className="acento">líneas</span></h1>
            <div className="prd-sub">Etapas, tareas y productos que toma cada obra de la línea.</div>
          </div>
          {esGestion && (
            <div className="prd-acciones">
              {linea && <button type="button" className="ui-btn" onClick={() => setDatosLinea(true)}><Settings2 size={15} />Datos de {linea.nombre}</button>}
              <button type="button" className="ui-btn ui-btn-suave" onClick={() => setNuevaLinea(true)}><Plus size={15} />Nueva línea</button>
            </div>
          )}
        </div>
      </div>

      <div className="prd-lineas" role="tablist" aria-label="Líneas">
        {lineas.map((l, i) => {
          const s = estadoLinea(l);
          return (
            <button key={l.id} type="button" role="tab" aria-selected={linea?.id === l.id} className={`prd-linea${linea?.id === l.id ? " on" : ""}`} style={{ "--c": l.color || "var(--muted)", "--i": i }} onClick={() => { setLineaId(l.id); setProcesoSel(null); }}>
              <span className="prd-linea-cab"><span className="pto" /><b>{l.nombre}</b><small>{s.activas ? plural(s.activas, "obra activa", "obras activas") : "sin obras"}</small></span>
              <span className="prd-linea-barras">
                <span className="prd-linea-barra"><span>Etapas</span><span className={`prd-mini${s.etapas && s.ubicadas === s.etapas ? " lleno" : ""}`}><i style={{ width: `${pct(s.ubicadas, s.etapas)}%` }} /></span><span className="mono">{s.etapas ? `${s.ubicadas}/${s.etapas}` : "—"}</span></span>
                <span className="prd-linea-barra"><span>Productos</span><span className={`prd-mini${s.prodTotal && s.prodUbicados >= s.prodTotal ? " lleno" : ""}`}><i style={{ width: `${pct(s.prodUbicados, s.prodTotal)}%` }} /></span><span className="mono">{s.prodTotal ? `${pct(s.prodUbicados, s.prodTotal)}%` : "—"}</span></span>
              </span>
            </button>
          );
        })}
      </div>

      {linea && (
        <div className="prd-pasos" role="tablist" aria-label="Pasos de la configuración" data-tour="obras-config-pasos">
          {pasos.map((p) => (
            <button key={p.k} type="button" role="tab" data-tour={`obras-config-paso-${p.k}`} aria-selected={tab === p.k} className={`prd-paso${tab === p.k ? " on" : ""}`} data-tono={p.tono} onClick={() => setTab(p.k)}>
              <span className="prd-paso-ic"><p.Icono size={18} /></span>
              <span style={{ minWidth: 0 }}><b>{p.titulo}</b><small>{p.detalle}</small></span>
              <span className={`prd-mini${p.v >= 100 ? " lleno" : ""}`}><i key={`${p.k}-${p.v}`} style={{ width: `${p.v}%` }} /></span>
            </button>
          ))}
        </div>
      )}

      {!linea ? (
        <div className="prd-vacio"><strong>No hay líneas de producción</strong>{esGestion && <button type="button" className="ui-btn ui-btn-suave" onClick={() => setNuevaLinea(true)}>Crear la primera</button>}</div>
      ) : tab === "recorrido" ? (
        <ConfigRecorrido
          linea={linea}
          procesos={procesos}
          offsets={stageOffsets}
          esGestion={esGestion}
          isMobile={isMobile}
          detalleHabilitado={detalleHabilitado}
          onCambio={cargar}
        />
      ) : tab === "tareas" ? (
        <ConfigTareas
          linea={linea}
          procesos={procesos}
          offsets={stageOffsets}
          tareas={tareasLinea}
          setTareas={(fn) => setTareasTpl((prev) => (typeof fn === "function" ? fn(prev) : fn))}
          procesoSel={procesoActivo}
          setProcesoSel={setProcesoSel}
          esGestion={esGestion}
          onCambio={cargar}
        />
      ) : (
        <ConfigProductos
          linea={linea}
          procesos={procesos}
          tareas={tareasLinea}
          procesoSel={procesoActivo}
          setProcesoSel={setProcesoSel}
          esGestion={esGestion}
          isMobile={isMobile}
          onCambio={cargarResumen}
          onCobertura={onCobertura}
        />
      )}

      {nuevaLinea && (
        <NuevaLineaModal onClose={() => setNuevaLinea(false)} onSaved={async () => { setNuevaLinea(false); await cargar(); toast.success("Línea creada. Armá su recorrido."); }} />
      )}
      {datosLinea && linea && (
        <DatosLinea linea={linea} onCerrar={() => setDatosLinea(false)} onGuardado={async () => { setDatosLinea(false); await cargar(); }} />
      )}
    </>
  );
}

function DatosLinea({ linea, onCerrar, onGuardado }) {
  const toast = useToast();
  const confirmar = useConfirm();
  const [f, setF] = useState({ nombre: linea.nombre || "", color: linea.color || "#3b82f6", orden: linea.orden ?? "", semanas: linea.semanas_produccion_estimadas ?? "" });
  const [guardando, setGuardando] = useState(false);

  async function guardarDatos(e) {
    e.preventDefault();
    if (!f.nombre.trim()) return;
    setGuardando(true);
    const { error } = await supabase.from("lineas_produccion").update({
      nombre: f.nombre.trim(), color: f.color, orden: f.orden !== "" ? num(f.orden) : null,
      semanas_produccion_estimadas: f.semanas !== "" ? num(f.semanas) : null,
    }).eq("id", linea.id);
    setGuardando(false);
    if (error) { toast.error(`No se pudo guardar: ${error.message}`); return; }
    toast.success("Línea actualizada");
    onGuardado();
  }

  async function eliminar() {
    const ok = await confirmar({ title: `Eliminar la línea ${linea.nombre}`, message: "Si tiene obras asignadas, la base puede impedirlo.", confirmLabel: "Eliminar línea", tone: "danger" });
    if (!ok) return;
    const { error } = await supabase.from("lineas_produccion").delete().eq("id", linea.id);
    if (error) { toast.error(`No se pudo eliminar: ${error.message}`); return; }
    toast.success(`Línea ${linea.nombre} eliminada`);
    onGuardado();
  }

  return (
    <form className="prd-cajon" onSubmit={guardarDatos} aria-label={`Datos de ${linea.nombre}`}>
      <div className="prd-cajon-cab"><h3>Datos de la línea</h3><button type="button" className="prd-btn-ic" onClick={onCerrar} aria-label="Cerrar"><X size={16} /></button></div>
      <div className="prd-cajon-cuerpo prd-form" style={{ border: 0, borderRadius: 0, background: "transparent" }}>
        <label>Nombre<input className="ui-input" id="linea-nombre" required value={f.nombre} onChange={(e) => setF((x) => ({ ...x, nombre: e.target.value }))} /></label>
        <div className="prd-form-g" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <label>Orden<input className="ui-input mono" id="linea-orden" type="number" value={f.orden} onChange={(e) => setF((x) => ({ ...x, orden: e.target.value }))} /></label>
          <label>Semanas estimadas<input className="ui-input mono" id="linea-semanas" type="number" min="0.5" step="0.5" value={f.semanas} onChange={(e) => setF((x) => ({ ...x, semanas: e.target.value }))} placeholder="Ej.: 24" /></label>
        </div>
        <label>Color
          <span style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
            <input type="color" id="linea-color" value={f.color} onChange={(e) => setF((x) => ({ ...x, color: e.target.value }))} style={{ width: 38, height: 34, border: 0, background: "none", padding: 0 }} />
            {COLOR_PRESETS.map((c) => (
              <button key={c} type="button" aria-label={`Color ${c}`} onClick={() => setF((x) => ({ ...x, color: c }))} style={{ width: 22, height: 22, borderRadius: 7, background: c, border: f.color === c ? "2px solid var(--text)" : "2px solid transparent", padding: 0 }} />
            ))}
          </span>
        </label>
        <p style={{ margin: 0, fontSize: 12, color: "var(--dim)" }}>Las semanas estimadas son una referencia general; cada etapa conserva su semana y su duración.</p>
      </div>
      <div className="prd-cajon-pie">
        <button type="submit" className="ui-btn ui-btn-primario" disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}</button>
        <button type="button" className="ui-btn ui-btn-fantasma" onClick={onCerrar}>Cancelar</button>
        <span className="prd-sp" />
        <button type="button" className="ui-btn ui-btn-peligro" onClick={eliminar} aria-label="Eliminar línea"><Trash2 size={15} /></button>
      </div>
    </form>
  );
}
