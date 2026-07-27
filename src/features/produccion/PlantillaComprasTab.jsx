import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDown, ArrowUp, Boxes, History, Loader2, Package, Pencil, Plus, Ship, Trash2, X,
} from "lucide-react";
import { C } from "@/theme";
import HistorialModal from "@/features/produccion/HistorialModal";
import MaterialesEtapa from "@/features/produccion/MaterialesEtapa";
import { fetchEtapasModelo, fetchModelos } from "@/features/produccion/comprasEtapasApi";
import {
  actualizarEtapaPlantilla, actualizarMaterialPlantilla, agregarMaterialesPlantilla,
  borrarEtapaPlantilla, colorSugerido, crearEtapaPlantilla, fetchMaterialesPlantilla,
  fetchPlantillaCompra, quitarMaterialPlantilla, reordenarPlantilla, setProcesosPlantilla,
} from "@/features/produccion/comprasObraApi";
import { INPUT, LBL, tint } from "@/features/produccion/comprasTokens";
import { Cta, EmptyState, Ghost, IconBtn, Pill } from "@/features/produccion/comprasUI";

// ─────────────────────────────────────────────────────────────────────────────
// Plantilla de compras por modelo: las tandas típicas del K37 con sus
// materiales. Se cargan una vez y cada obra nueva las copia y las ajusta.
// Misma estructura que la pestaña de obra, para no aprender dos pantallas.
// ─────────────────────────────────────────────────────────────────────────────

function NuevaForm({ orden, onCrear, onCancel }) {
  const [nombre, setNombre] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    if (!nombre.trim() || busy) return;
    setBusy(true);
    try { await onCrear({ nombre, orden, color: colorSugerido(orden) }); }
    finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="ce-surface" style={{ padding: 10, display: "flex", gap: 6, alignItems: "center" }}>
      <input
        autoFocus
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        placeholder="Ej: Etapa 1 · Estructura"
        style={{ ...INPUT, flex: 1, fontSize: 12.5 }}
      />
      <Cta type="submit" size="sm" tono="azul" disabled={!nombre.trim() || busy} icon={busy ? Loader2 : Plus}>Crear</Cta>
      <IconBtn icon={X} title="Cancelar" onClick={onCancel} />
    </form>
  );
}

function EtapaItem({ etapa, activa, onSelect, onSubir, onBajar, primera, ultima }) {
  const color = etapa.color || "#8b5cf6";
  return (
    <div
      className="ce-etapa"
      style={{
        display: "flex", alignItems: "stretch", borderRadius: 12, overflow: "hidden",
        border: `1px solid ${activa ? tint(color, 45) : C.border}`,
        background: activa ? `linear-gradient(135deg, ${tint(color, 14)}, ${tint(color, 4)})` : C.panelSolid,
        boxShadow: activa ? `0 4px 14px -7px ${tint(color, 45)}` : "0 1px 2px var(--shadow)",
      }}
    >
      <div style={{ width: 4, flexShrink: 0, background: color }} />
      <button
        type="button"
        onClick={onSelect}
        style={{ flex: 1, minWidth: 0, textAlign: "left", background: "transparent", border: "none", cursor: "pointer", padding: "9px 6px 9px 11px" }}
      >
        <div style={{ color: activa ? C.text : C.muted, fontSize: 13, fontWeight: 850, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 3 }}>
          {etapa.nombre}
        </div>
        <div style={{ fontSize: 11, color: C.dim, fontFamily: C.mono }}>{etapa.totalMateriales} materiales</div>
      </button>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flexShrink: 0, paddingRight: 3 }}>
        <IconBtn icon={ArrowUp} title="Subir" onClick={onSubir} disabled={primera} size={21} />
        <IconBtn icon={ArrowDown} title="Bajar" onClick={onBajar} disabled={ultima} size={21} />
      </div>
    </div>
  );
}

function DetalleEtapa({ etapa, procesos, onReload, toast }) {
  const [materiales, setMateriales] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [historial, setHistorial] = useState(false);
  const [editandoNombre, setEditandoNombre] = useState(false);
  const [nombre, setNombre] = useState(etapa.nombre);

  const cargar = useCallback(async () => {
    setCargando(true);
    try { setMateriales(await fetchMaterialesPlantilla(etapa.id)); }
    catch (err) { toast?.error(err.message); setMateriales([]); }
    finally { setCargando(false); }
  }, [etapa.id, toast]);

  useEffect(() => { cargar(); }, [cargar]);

  async function recargarTodo() { await Promise.all([cargar(), onReload()]); }

  async function agregar(seleccion) {
    try {
      const n = await agregarMaterialesPlantilla(etapa.id, seleccion);
      toast?.success(`${n} ${n === 1 ? "material agregado" : "materiales agregados"} a la plantilla.`);
      await recargarTodo();
    } catch (err) { toast?.error(err.message); }
  }
  async function cambiarCantidad(row, valor) {
    try { await actualizarMaterialPlantilla(row.id, { cantidad: valor }); await cargar(); }
    catch (err) { toast?.error(err.message); }
  }
  async function cambiarProceso(row, procId) {
    try { await actualizarMaterialPlantilla(row.id, { linea_proceso_id: procId }); await cargar(); }
    catch (err) { toast?.error(err.message); }
  }
  async function quitar(row) {
    try { await quitarMaterialPlantilla(row.id); await recargarTodo(); }
    catch (err) { toast?.error(err.message); }
  }
  async function guardarNombre() {
    const limpio = nombre.trim();
    setEditandoNombre(false);
    if (!limpio || limpio === etapa.nombre) { setNombre(etapa.nombre); return; }
    try { await actualizarEtapaPlantilla(etapa.id, { nombre: limpio }); await onReload(); }
    catch (err) { toast?.error(err.message); setNombre(etapa.nombre); }
  }
  async function toggleProceso(procId) {
    const actuales = etapa.procesoIds ?? [];
    const next = actuales.includes(procId) ? actuales.filter((id) => id !== procId) : [...actuales, procId];
    try { await setProcesosPlantilla(etapa.id, next); await onReload(); }
    catch (err) { toast?.error(err.message); }
  }
  async function borrar() {
    if (!window.confirm(`¿Borrar "${etapa.nombre}" de la plantilla?\n\nLas obras que ya la copiaron no se tocan.`)) return;
    try { await borrarEtapaPlantilla(etapa.id); await onReload(); }
    catch (err) { toast?.error(err.message); }
  }

  const color = etapa.color || "#8b5cf6";
  const asignados = etapa.procesoIds ?? [];

  return (
    <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
      <div className="ce-surface">
        <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "12px 14px", flexWrap: "wrap" }}>
          <span style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 10, display: "grid", placeItems: "center", background: tint(color, 15), border: `1px solid ${tint(color, 28)}`, color }}>
            <Boxes size={16} />
          </span>
          {editandoNombre ? (
            <input
              autoFocus
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              onBlur={guardarNombre}
              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { setNombre(etapa.nombre); setEditandoNombre(false); } }}
              style={{ ...INPUT, flex: 1, minWidth: 140, fontSize: 15, fontWeight: 900, padding: "5px 9px" }}
            />
          ) : (
            <h2 style={{ margin: 0, flex: 1, minWidth: 120, fontSize: 15.5, fontWeight: 900, color: C.text, display: "flex", alignItems: "center", gap: 7 }}>
              {etapa.nombre}
              <IconBtn icon={Pencil} title="Renombrar" size={24} onClick={() => { setNombre(etapa.nombre); setEditandoNombre(true); }} />
            </h2>
          )}
          <IconBtn icon={Trash2} title="Borrar de la plantilla" tono="rojo" onClick={borrar} />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", padding: "10px 14px", borderTop: `1px solid ${C.border}` }}>
          <span style={{ ...LBL }}>Cubre</span>
          {!procesos.length && <span style={{ fontSize: 12, color: C.dim }}>este modelo no tiene etapas de producción</span>}
          {procesos.filter((p) => asignados.includes(p.id)).map((p) => {
            const pc = p.color || "#64748b";
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => toggleProceso(p.id)}
                className="ce-chip"
                title="Quitar"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 9,
                  fontSize: 11.5, fontWeight: 750, cursor: "pointer",
                  border: `1px solid ${tint(pc, 32)}`, background: tint(pc, 12), color: C.muted,
                }}
              >
                <span style={{ width: 7, height: 7, borderRadius: 2, background: pc, flexShrink: 0 }} />
                {p.nombre}
              </button>
            );
          })}
          {procesos.some((p) => !asignados.includes(p.id)) && (
            <select
              value=""
              onChange={(e) => { if (e.target.value) toggleProceso(e.target.value); }}
              style={{ ...INPUT, width: "auto", padding: "4px 8px", fontSize: 11.5, borderRadius: 9, cursor: "pointer", color: C.dim, background: "transparent", borderStyle: "dashed" }}
            >
              <option value="">+ etapa de producción</option>
              {procesos.filter((p) => !asignados.includes(p.id)).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          )}
          <span style={{ marginLeft: "auto", fontSize: 11, color: C.dim }}>opcional · sólo para saber para qué es</span>
        </div>
      </div>

      {cargando ? (
        <div className="ce-surface" style={{ padding: 22, display: "flex", alignItems: "center", gap: 9, color: C.dim, fontSize: 13 }}>
          <Loader2 size={16} className="spin" /> Cargando materiales…
        </div>
      ) : (
        <MaterialesEtapa
          etapaNombre={etapa.nombre}
          materiales={materiales}
          procesos={procesos}
          onAgregar={agregar}
          onCantidad={cambiarCantidad}
          onProceso={cambiarProceso}
          onQuitar={quitar}
          footer={
            <>
              <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: C.dim }}>
                Esto se copia a cada obra nueva del modelo.
              </span>
              <Ghost icon={History} size="sm" onClick={() => setHistorial(true)}>Ver historial</Ghost>
            </>
          }
        />
      )}

      {historial && <HistorialModal etapa={etapa.nombre} compraEtapaId={etapa.id} onClose={() => setHistorial(false)} />}
    </div>
  );
}

export default function PlantillaComprasTab({ isMobile, toast }) {
  const [modelos, setModelos] = useState([]);
  const [modeloId, setModeloId] = useState(null);
  const [procesos, setProcesos] = useState([]);
  const [plantilla, setPlantilla] = useState([]);
  const [selId, setSelId] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [nueva, setNueva] = useState(false);

  useEffect(() => {
    fetchModelos().then((m) => { setModelos(m); setModeloId((cur) => cur ?? m[0]?.id ?? null); }).catch(() => setModelos([]));
  }, []);

  const cargar = useCallback(async () => {
    if (!modeloId) { setProcesos([]); setPlantilla([]); return; }
    setCargando(true);
    try {
      const [procs, plant] = await Promise.all([fetchEtapasModelo(modeloId), fetchPlantillaCompra(modeloId)]);
      setProcesos(procs);
      setPlantilla(plant);
      setSelId((cur) => (plant.some((p) => p.id === cur) ? cur : plant[0]?.id ?? null));
    } catch (err) { toast?.error(err.message); }
    finally { setCargando(false); }
  }, [modeloId, toast]);

  useEffect(() => { cargar(); }, [cargar]);

  const modeloActual = useMemo(() => modelos.find((m) => m.id === modeloId), [modelos, modeloId]);
  const seleccionada = plantilla.find((p) => p.id === selId) || null;
  const totalMateriales = plantilla.reduce((a, p) => a + (p.totalMateriales ?? 0), 0);

  async function crear(datos) {
    try {
      const { id } = await crearEtapaPlantilla(modeloId, datos);
      setNueva(false);
      await cargar();
      setSelId(id);
    } catch (err) { toast?.error(err.message); }
  }

  async function mover(idx, delta) {
    const next = [...plantilla];
    const destino = idx + delta;
    if (destino < 0 || destino >= next.length) return;
    [next[idx], next[destino]] = [next[destino], next[idx]];
    setPlantilla(next);
    try { await reordenarPlantilla(next.map((e) => e.id)); }
    catch (err) { toast?.error(err.message); await cargar(); }
  }

  return (
    <div style={{ display: "grid", gap: 13, height: "100%", minHeight: 0, gridTemplateRows: "auto minmax(0,1fr)" }}>
      <div className="ce-surface" style={{ padding: 11, display: "flex", alignItems: "center", gap: 11, flexWrap: "wrap" }}>
        <span style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 10, display: "grid", placeItems: "center", background: "linear-gradient(135deg,#8b5cf6 0%,#6366f1 55%,#3b82f6 100%)", color: "#fff" }}>
          <Ship size={16} />
        </span>
        <div style={{ minWidth: 170, flex: isMobile ? "1 1 100%" : "0 1 240px" }}>
          <label style={LBL} htmlFor="modelo-sel">Modelo</label>
          <select id="modelo-sel" value={modeloId ?? ""} onChange={(e) => setModeloId(e.target.value)} style={{ ...INPUT, cursor: "pointer", marginTop: 3, padding: "7px 10px" }}>
            {modelos.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          <Pill color={C.violet} soft={C.violetL} borde={C.violetB}><Boxes size={10} /> {plantilla.length} etapas</Pill>
          <Pill color={C.blue} soft={C.blueL} borde={C.blueB} mono><Package size={10} /> {totalMateriales} materiales</Pill>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <Cta icon={Plus} tono="azul" onClick={() => setNueva(true)} disabled={!modeloId}>Nueva etapa</Cta>
        </div>
      </div>

      <div style={{ display: "flex", gap: 13, minHeight: 0, flexDirection: isMobile ? "column" : "row" }}>
        <div style={{ width: isMobile ? "auto" : 252, flexShrink: 0, display: "grid", gap: 7, alignContent: "start", overflowY: "auto", maxHeight: isMobile ? 220 : "100%", paddingRight: 2 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 2px 1px" }}>
            <span style={LBL}>Plantilla de {modeloActual?.nombre || "—"}</span>
          </div>

          {nueva && <NuevaForm orden={plantilla.length} onCrear={crear} onCancel={() => setNueva(false)} />}

          {cargando && !plantilla.length && (
            <div style={{ display: "flex", alignItems: "center", gap: 9, color: C.dim, fontSize: 13, padding: 6 }}>
              <Loader2 size={16} className="spin" /> Cargando…
            </div>
          )}

          {!cargando && !plantilla.length && !nueva && (
            <EmptyState
              icon={Boxes}
              title="Sin plantilla"
              subtitle="Armá las tandas de compra típicas de este modelo con sus materiales. Es opcional, pero te ahorra cargarlas en cada obra."
              action={<Cta icon={Plus} size="sm" tono="azul" onClick={() => setNueva(true)}>Crear la primera</Cta>}
            />
          )}

          {plantilla.map((e, i) => (
            <EtapaItem
              key={e.id}
              etapa={e}
              activa={e.id === selId}
              onSelect={() => setSelId(e.id)}
              onSubir={() => mover(i, -1)}
              onBajar={() => mover(i, 1)}
              primera={i === 0}
              ultima={i === plantilla.length - 1}
            />
          ))}

          {plantilla.length > 0 && !nueva && (
            <button
              type="button"
              onClick={() => setNueva(true)}
              style={{ border: `1px dashed ${C.border2}`, background: "transparent", color: C.dim, borderRadius: 12, padding: 10, cursor: "pointer", fontSize: 12.5, fontWeight: 800, fontFamily: C.sans }}
            >
              + Nueva etapa
            </button>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0, overflowY: "auto", paddingRight: 2 }}>
          {seleccionada ? (
            <DetalleEtapa key={seleccionada.id} etapa={seleccionada} procesos={procesos} onReload={cargar} toast={toast} />
          ) : (
            !cargando && plantilla.length > 0 && (
              <EmptyState icon={Boxes} title="Elegí una etapa" subtitle="Tocá una etapa de la izquierda para cargarle materiales." />
            )
          )}
        </div>
      </div>
    </div>
  );
}
