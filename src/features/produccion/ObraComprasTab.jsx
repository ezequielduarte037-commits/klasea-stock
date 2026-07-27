import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowDown, ArrowUp, Boxes, CalendarDays, ClipboardList, Copy, History, LayoutTemplate,
  Loader2, Package, Pencil, Plus, Ship, Trash2, X,
} from "lucide-react";
import { C } from "@/theme";
import HistorialModal from "@/features/produccion/HistorialModal";
import MaterialesEtapa from "@/features/produccion/MaterialesEtapa";
import { fetchEtapasModelo, fetchObras } from "@/features/produccion/comprasEtapasApi";
import {
  actualizarEtapaCompraObra, actualizarMaterialEtapa, agregarMaterialesEtapa, borrarEtapaCompraObra,
  COMPRA_ETAPA_ESTADOS, colorSugerido, copiarMaterialesDeEtapa, copiarPlantillaAObra,
  crearEtapaCompraObra, fetchEtapasCompraObra, fetchMaterialesEtapa, fetchPlantillaCompra,
  fetchUltimosCambios, generarPedidoDesdeEtapaCompra, pedidosDeEtapaCompra, quitarMaterialEtapa,
  reordenarEtapasCompraObra, setProcesosEtapaCompra,
} from "@/features/produccion/comprasObraApi";
import { INPUT, LBL, tint } from "@/features/produccion/comprasTokens";
import { Cta, EmptyState, EstadoSelect, Ghost, IconBtn, Pill } from "@/features/produccion/comprasUI";

// ─────────────────────────────────────────────────────────────────────────────
// Las etapas de compra de una obra. Cada etapa es una tanda: tiene sus propios
// materiales cargados adentro y, si sirve, la etiqueta de qué etapas de
// producción cubre.
// ─────────────────────────────────────────────────────────────────────────────

function cuando(iso) {
  const d = new Date(iso);
  const hoy = new Date();
  const hora = d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === hoy.toDateString()) return `hoy ${hora}`;
  return `${d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })} ${hora}`;
}

/* ── alta de etapa ────────────────────────────────────────────────────────── */
function NuevaEtapaForm({ orden, onCrear, onCancel }) {
  const [nombre, setNombre] = useState("");
  const [fecha, setFecha] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!nombre.trim() || busy) return;
    setBusy(true);
    try { await onCrear({ nombre, fecha_objetivo: fecha || null, orden, color: colorSugerido(orden) }); }
    finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="ce-surface" style={{ padding: 10, display: "grid", gap: 7 }}>
      <input
        autoFocus
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        placeholder="Ej: Etapa 1 · Estructura"
        style={{ ...INPUT, fontSize: 12.5 }}
      />
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          title="Fecha objetivo (opcional)"
          style={{ ...INPUT, flex: 1, fontSize: 11.5, padding: "6px 8px", colorScheme: "light dark" }}
        />
        <Cta type="submit" size="sm" tono="azul" disabled={!nombre.trim() || busy} icon={busy ? Loader2 : Plus}>Crear</Cta>
        <IconBtn icon={X} title="Cancelar" onClick={onCancel} />
      </div>
    </form>
  );
}

/* ── elegir de dónde copiar materiales ────────────────────────────────────── */
function CopiarModal({ etapas, plantilla, actualId, onCopiar, onClose }) {
  const [busy, setBusy] = useState(null);
  const otras = etapas.filter((e) => e.id !== actualId && e.totalMateriales > 0);
  const tpl = plantilla.filter((p) => p.totalMateriales > 0);

  async function copiar(opts, key) {
    setBusy(key);
    try { await onCopiar(opts); }
    finally { setBusy(null); }
  }

  const Fila = ({ nombre, sub, color, onClick, activo }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={!!busy}
      className="ce-row"
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 11px", borderRadius: 11,
        border: `1px solid ${C.border}`, cursor: busy ? "default" : "pointer", textAlign: "left", marginBottom: 5,
      }}
    >
      <span style={{ width: 8, height: 30, borderRadius: 3, background: color, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nombre}</div>
        <div style={{ fontSize: 11, color: C.dim }}>{sub}</div>
      </div>
      {activo ? <Loader2 size={15} className="spin" color={C.dim} /> : <Copy size={15} color={C.dim} />}
    </button>
  );

  return createPortal(
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 210, display: "flex", justifyContent: "center", alignItems: "flex-start",
        padding: "12vh 16px 16px", background: "var(--overlay)", backdropFilter: "blur(7px)", WebkitBackdropFilter: "blur(7px)",
      }}
    >
      <div style={{
        width: "min(520px, 100%)", maxHeight: "68vh", display: "flex", flexDirection: "column", overflow: "hidden",
        background: C.panelSolid, border: `1px solid ${C.border2}`, borderRadius: 18,
        boxShadow: "0 32px 70px -20px var(--shadow-strong)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 12px 13px 16px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ flex: 1, fontSize: 13.5, fontWeight: 850, color: C.text }}>Copiar materiales de…</div>
          <button type="button" onClick={onClose} className="ce-ghost" style={{ width: 28, height: 28, display: "grid", placeItems: "center", borderRadius: 8, border: "none", background: C.panel2, color: C.dim, cursor: "pointer" }}>
            <X size={15} />
          </button>
        </div>
        <div style={{ overflowY: "auto", padding: 10 }}>
          {!otras.length && !tpl.length && (
            <div style={{ padding: "26px 14px", textAlign: "center", color: C.dim, fontSize: 13 }}>
              No hay otras etapas con materiales para copiar.
            </div>
          )}
          {otras.length > 0 && (
            <>
              <div style={{ ...LBL, padding: "4px 4px 7px" }}>Otras etapas de esta obra</div>
              {otras.map((e) => (
                <Fila
                  key={e.id}
                  nombre={e.nombre}
                  sub={`${e.totalMateriales} materiales`}
                  color={e.color || "#8b5cf6"}
                  activo={busy === `o${e.id}`}
                  onClick={() => copiar({ desdeEtapaObraId: e.id }, `o${e.id}`)}
                />
              ))}
            </>
          )}
          {tpl.length > 0 && (
            <>
              <div style={{ ...LBL, padding: "10px 4px 7px" }}>Plantilla del modelo</div>
              {tpl.map((p) => (
                <Fila
                  key={p.id}
                  nombre={p.nombre}
                  sub={`${p.totalMateriales} materiales`}
                  color={p.color || "#8b5cf6"}
                  activo={busy === `t${p.id}`}
                  onClick={() => copiar({ desdeEtapaPlantillaId: p.id }, `t${p.id}`)}
                />
              ))}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ── tarjeta de etapa en la lista lateral ─────────────────────────────────── */
function EtapaItem({ etapa, activa, onSelect, onSubir, onBajar, primera, ultima, puedeEditar }) {
  const color = etapa.color || "#8b5cf6";
  const est = COMPRA_ETAPA_ESTADOS.find((e) => e.value === etapa.estado) || COMPRA_ETAPA_ESTADOS[0];
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
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
          <span style={{ flex: 1, minWidth: 0, color: activa ? C.text : C.muted, fontSize: 13, fontWeight: 850, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {etapa.nombre}
          </span>
          <span style={{ flexShrink: 0, width: 7, height: 7, borderRadius: 999, background: est.color }} title={est.label} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11, color: C.dim, flexWrap: "wrap" }}>
          <span style={{ fontFamily: C.mono }}>{etapa.totalMateriales} materiales</span>
          <span>· {est.label.toLowerCase()}</span>
          {etapa.fecha_objetivo && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
              · <CalendarDays size={10} /> {new Date(`${etapa.fecha_objetivo}T00:00:00`).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })}
            </span>
          )}
        </div>
      </button>
      {puedeEditar && (
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flexShrink: 0, paddingRight: 3 }}>
          <IconBtn icon={ArrowUp} title="Subir" onClick={onSubir} disabled={primera} size={21} />
          <IconBtn icon={ArrowDown} title="Bajar" onClick={onBajar} disabled={ultima} size={21} />
        </div>
      )}
    </div>
  );
}

/* ── detalle de la etapa ──────────────────────────────────────────────────── */
function DetalleEtapa({ obra, etapa, etapas, plantilla, procesos, onReloadEtapas, onPedidoGenerado, toast, puedeEditar }) {
  const [materiales, setMateriales] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [pedidos, setPedidos] = useState([]);
  const [generando, setGenerando] = useState(false);
  const [historial, setHistorial] = useState(false);
  const [copiar, setCopiar] = useState(false);
  const [editandoNombre, setEditandoNombre] = useState(false);
  const [nombre, setNombre] = useState(etapa.nombre);
  const [ultimo, setUltimo] = useState(null);

  const procesosById = useMemo(() => new Map(procesos.map((p) => [p.id, p])), [procesos]);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [mats, peds, cambios] = await Promise.all([
        fetchMaterialesEtapa(etapa.id),
        pedidosDeEtapaCompra(etapa.id),
        fetchUltimosCambios([etapa.id]),
      ]);
      setMateriales(mats);
      setPedidos(peds);
      setUltimo(cambios.get(etapa.id) ?? null);
    } catch (err) {
      toast?.error(err.message || "No se pudieron cargar los materiales.");
      setMateriales([]);
    } finally {
      setCargando(false);
    }
  }, [etapa.id, toast]);

  useEffect(() => { cargar(); }, [cargar]);

  async function recargarTodo() {
    await Promise.all([cargar(), onReloadEtapas()]);
  }

  async function agregar(seleccion) {
    try {
      const n = await agregarMaterialesEtapa(etapa.id, seleccion);
      toast?.success(`${n} ${n === 1 ? "material agregado" : "materiales agregados"}.`);
      await recargarTodo();
    } catch (err) { toast?.error(err.message || "No se pudieron agregar."); }
  }
  async function cambiarCantidad(row, valor) {
    try { await actualizarMaterialEtapa(row.id, { cantidad: valor }); await cargar(); }
    catch (err) { toast?.error(err.message); }
  }
  async function cambiarProceso(row, procId) {
    try { await actualizarMaterialEtapa(row.id, { linea_proceso_id: procId }); await cargar(); }
    catch (err) { toast?.error(err.message); }
  }
  async function quitar(row) {
    try { await quitarMaterialEtapa(row.id); await recargarTodo(); }
    catch (err) { toast?.error(err.message); }
  }
  async function copiarDe(opts) {
    try {
      const n = await copiarMaterialesDeEtapa(etapa.id, opts);
      setCopiar(false);
      toast?.success(`${n} ${n === 1 ? "material copiado" : "materiales copiados"}.`);
      await recargarTodo();
    } catch (err) { toast?.error(err.message); }
  }

  async function guardarNombre() {
    const limpio = nombre.trim();
    setEditandoNombre(false);
    if (!limpio || limpio === etapa.nombre) { setNombre(etapa.nombre); return; }
    try { await actualizarEtapaCompraObra(etapa.id, { nombre: limpio }); await recargarTodo(); }
    catch (err) { toast?.error(err.message); setNombre(etapa.nombre); }
  }
  async function cambiarEstado(estado) {
    try { await actualizarEtapaCompraObra(etapa.id, { estado }); await recargarTodo(); }
    catch (err) { toast?.error(err.message); }
  }
  async function toggleProceso(procId) {
    const actuales = etapa.procesoIds ?? [];
    const next = actuales.includes(procId) ? actuales.filter((id) => id !== procId) : [...actuales, procId];
    try { await setProcesosEtapaCompra(etapa.id, next); await onReloadEtapas(); }
    catch (err) { toast?.error(err.message); }
  }
  async function borrar() {
    if (!window.confirm(`¿Borrar la etapa "${etapa.nombre}"?\n\nSe pierden sus ${materiales.length} materiales. Los pedidos ya generados quedan.`)) return;
    try { await borrarEtapaCompraObra(etapa.id); await onReloadEtapas(); }
    catch (err) { toast?.error(err.message); }
  }
  async function generar() {
    if (pedidos.length && !window.confirm(`"${etapa.nombre}" ya tiene ${pedidos.length} pedido(s).\n\n¿Generar otro?`)) return;
    setGenerando(true);
    try {
      const { cantidad } = await generarPedidoDesdeEtapaCompra(obra, etapa, procesosById);
      toast?.success(`Pedido generado: ${cantidad} ${cantidad === 1 ? "material" : "materiales"}.`);
      await recargarTodo();
      onPedidoGenerado?.();
    } catch (err) { toast?.error(err.message || "No se pudo generar el pedido."); }
    finally { setGenerando(false); }
  }

  const color = etapa.color || "#8b5cf6";
  const asignados = etapa.procesoIds ?? [];

  return (
    <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
      {/* identidad + etiquetas */}
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
              {puedeEditar && <IconBtn icon={Pencil} title="Renombrar" size={24} onClick={() => { setNombre(etapa.nombre); setEditandoNombre(true); }} />}
            </h2>
          )}

          <EstadoSelect value={etapa.estado} options={COMPRA_ETAPA_ESTADOS} onChange={cambiarEstado} disabled={!puedeEditar} />
          {puedeEditar && <IconBtn icon={Trash2} title="Borrar etapa" tono="rojo" onClick={borrar} />}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", padding: "10px 14px", borderTop: `1px solid ${C.border}` }}>
          <span style={{ ...LBL }}>Cubre</span>
          {!procesos.length && <span style={{ fontSize: 12, color: C.dim }}>el modelo de esta obra no tiene etapas de producción</span>}
          {procesos.filter((p) => asignados.includes(p.id)).map((p) => {
            const pc = p.color || "#64748b";
            return (
              <button
                key={p.id}
                type="button"
                disabled={!puedeEditar}
                onClick={() => toggleProceso(p.id)}
                className="ce-chip"
                title={puedeEditar ? "Quitar" : undefined}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 9,
                  fontSize: 11.5, fontWeight: 750, cursor: puedeEditar ? "pointer" : "default",
                  border: `1px solid ${tint(pc, 32)}`, background: tint(pc, 12), color: C.muted,
                }}
              >
                <span style={{ width: 7, height: 7, borderRadius: 2, background: pc, flexShrink: 0 }} />
                {p.nombre}
              </button>
            );
          })}
          {puedeEditar && procesos.some((p) => !asignados.includes(p.id)) && (
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

      {/* materiales */}
      {cargando ? (
        <div className="ce-surface" style={{ padding: 22, display: "flex", alignItems: "center", gap: 9, color: C.dim, fontSize: 13 }}>
          <Loader2 size={16} className="spin" /> Cargando materiales…
        </div>
      ) : (
        <MaterialesEtapa
          etapaNombre={etapa.nombre}
          materiales={materiales}
          procesos={procesos}
          puedeEditar={puedeEditar}
          onAgregar={agregar}
          onCantidad={cambiarCantidad}
          onProceso={cambiarProceso}
          onQuitar={quitar}
          onCopiarDeOtra={puedeEditar ? () => setCopiar(true) : null}
          footer={
            <>
              <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: C.dim, minWidth: 0, flex: 1 }}>
                <Pencil size={11} style={{ flexShrink: 0 }} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {ultimo
                    ? <>Último cambio: <b style={{ fontWeight: 750, color: C.muted }}>{ultimo.actor_nombre}</b> · {cuando(ultimo.created_at)} — {ultimo.descripcion}</>
                    : "Sin cambios registrados todavía"}
                </span>
              </span>
              <Ghost icon={History} size="sm" onClick={() => setHistorial(true)}>Ver historial</Ghost>
              {pedidos.length > 0 && <Pill color={C.green} soft={C.greenL} borde={C.greenB}><ClipboardList size={10} /> {pedidos.length}</Pill>}
              {puedeEditar && (
                <span data-tour="generar-pedido" style={{ display: "inline-flex" }}>
                  <Cta icon={generando ? Loader2 : ClipboardList} onClick={generar} disabled={!materiales.length || generando}>
                    {pedidos.length ? "Generar otro pedido" : "Generar pedido"}
                  </Cta>
                </span>
              )}
            </>
          }
        />
      )}

      {historial && <HistorialModal etapa={etapa.nombre} obraCompraEtapaId={etapa.id} onClose={() => setHistorial(false)} />}
      {copiar && (
        <CopiarModal
          etapas={etapas}
          plantilla={plantilla}
          actualId={etapa.id}
          onCopiar={copiarDe}
          onClose={() => setCopiar(false)}
        />
      )}
    </div>
  );
}

/* ── pestaña ──────────────────────────────────────────────────────────────── */
export default function ObraComprasTab({ isMobile, toast, puedeEditar = true, onPedidoGenerado }) {
  const [obras, setObras] = useState([]);
  const [obraId, setObraId] = useState("");
  const [procesos, setProcesos] = useState([]);
  const [plantilla, setPlantilla] = useState([]);
  const [etapas, setEtapas] = useState([]);
  const [selId, setSelId] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [nueva, setNueva] = useState(false);
  const [copiando, setCopiando] = useState(false);

  useEffect(() => { fetchObras().then(setObras).catch(() => setObras([])); }, []);

  const obra = obras.find((o) => o.id === obraId) || null;

  const cargarEtapas = useCallback(async () => {
    if (!obra?.id) { setEtapas([]); setProcesos([]); setPlantilla([]); return; }
    setCargando(true);
    try {
      const [es, procs, tpl] = await Promise.all([
        fetchEtapasCompraObra(obra.id),
        obra.linea_id ? fetchEtapasModelo(obra.linea_id) : Promise.resolve([]),
        obra.linea_id ? fetchPlantillaCompra(obra.linea_id) : Promise.resolve([]),
      ]);
      setEtapas(es);
      setProcesos(procs);
      setPlantilla(tpl);
      setSelId((cur) => (es.some((e) => e.id === cur) ? cur : es[0]?.id ?? null));
    } catch (err) {
      toast?.error(err.message || "No se pudieron cargar las etapas.");
    } finally {
      setCargando(false);
    }
  }, [obra, toast]);

  useEffect(() => { cargarEtapas(); }, [cargarEtapas]);

  const seleccionada = etapas.find((e) => e.id === selId) || null;
  const totalMateriales = etapas.reduce((a, e) => a + (e.totalMateriales ?? 0), 0);

  async function crear(datos) {
    try {
      const { id } = await crearEtapaCompraObra(obra.id, datos);
      setNueva(false);
      await cargarEtapas();
      setSelId(id);
    } catch (err) { toast?.error(err.message); }
  }

  async function copiarPlantilla() {
    setCopiando(true);
    try {
      const { etapas: n, materiales: m } = await copiarPlantillaAObra(obra);
      toast?.success(`${n} ${n === 1 ? "etapa copiada" : "etapas copiadas"} con ${m} materiales.`);
      await cargarEtapas();
    } catch (err) { toast?.error(err.message); }
    finally { setCopiando(false); }
  }

  async function mover(idx, delta) {
    const next = [...etapas];
    const destino = idx + delta;
    if (destino < 0 || destino >= next.length) return;
    [next[idx], next[destino]] = [next[destino], next[idx]];
    setEtapas(next); // optimista
    try { await reordenarEtapasCompraObra(next.map((e) => e.id)); }
    catch (err) { toast?.error(err.message); await cargarEtapas(); }
  }

  return (
    <div style={{ display: "grid", gap: 13, height: "100%", minHeight: 0, gridTemplateRows: "auto minmax(0,1fr)" }}>
      {/* obra */}
      <div className="ce-surface" style={{ padding: 11, display: "flex", alignItems: "center", gap: 11, flexWrap: "wrap" }}>
        <span style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 10, display: "grid", placeItems: "center", background: "linear-gradient(135deg,#8b5cf6 0%,#6366f1 55%,#3b82f6 100%)", color: "#fff" }}>
          <Ship size={16} />
        </span>
        <div data-tour="obra-selector" style={{ minWidth: 180, flex: isMobile ? "1 1 100%" : "0 1 280px" }}>
          <label style={LBL} htmlFor="obra-sel">Obra</label>
          <select id="obra-sel" value={obraId} onChange={(e) => setObraId(e.target.value)} style={{ ...INPUT, cursor: "pointer", marginTop: 3, padding: "7px 10px" }}>
            <option value="">— Elegí una obra —</option>
            {obras.map((o) => (
              <option key={o.id} value={o.id}>
                {o.codigo || o.descripcion || o.id.slice(0, 8)}{o.linea_nombre ? ` · ${o.linea_nombre}` : ""}
              </option>
            ))}
          </select>
        </div>

        {obra && (
          <>
            <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap", fontSize: 12, color: C.dim }}>
              <Pill color={C.violet} soft={C.violetL} borde={C.violetB}><Boxes size={10} /> {etapas.length} etapas</Pill>
              <Pill color={C.blue} soft={C.blueL} borde={C.blueB} mono><Package size={10} /> {totalMateriales} materiales</Pill>
            </div>
            {puedeEditar && (
              <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Ghost
                  icon={copiando ? Loader2 : LayoutTemplate}
                  onClick={copiarPlantilla}
                  disabled={copiando || !obra.linea_id || !plantilla.length}
                  title={!plantilla.length ? "Este modelo no tiene plantilla cargada" : undefined}
                >
                  Copiar plantilla
                </Ghost>
                <span data-tour="nueva-etapa" style={{ display: "inline-flex" }}>
                  <Cta icon={Plus} tono="azul" onClick={() => setNueva(true)}>Nueva etapa</Cta>
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {/* cuerpo */}
      {!obra ? (
        <EmptyState
          icon={Ship}
          title="Elegí una obra para empezar"
          subtitle="Cada obra arma sus propias tandas de compra. Podés copiarlas de la plantilla del modelo y después ajustarlas."
        />
      ) : (
        <div style={{ display: "flex", gap: 13, minHeight: 0, flexDirection: isMobile ? "column" : "row" }}>
          <div data-tour="etapas-lista" style={{ width: isMobile ? "auto" : 252, flexShrink: 0, display: "grid", gap: 7, alignContent: "start", overflowY: "auto", maxHeight: isMobile ? 240 : "100%", paddingRight: 2 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 2px 1px" }}>
              <span style={LBL}>Etapas de compra</span>
              <span style={{ marginLeft: "auto", fontSize: 11, color: C.dim, fontFamily: C.mono }}>{etapas.length}</span>
            </div>

            {nueva && <NuevaEtapaForm orden={etapas.length} onCrear={crear} onCancel={() => setNueva(false)} />}

            {cargando && !etapas.length && (
              <div style={{ display: "flex", alignItems: "center", gap: 9, color: C.dim, fontSize: 13, padding: 6 }}>
                <Loader2 size={16} className="spin" /> Cargando…
              </div>
            )}

            {!cargando && !etapas.length && !nueva && (
              <EmptyState
                icon={Boxes}
                title="Sin etapas de compra"
                subtitle="Creá la primera tanda de compra de esta obra, o copiala de la plantilla del modelo."
                action={puedeEditar ? <Cta icon={Plus} size="sm" tono="azul" onClick={() => setNueva(true)}>Nueva etapa</Cta> : null}
              />
            )}

            {etapas.map((e, i) => (
              <EtapaItem
                key={e.id}
                etapa={e}
                activa={e.id === selId}
                puedeEditar={puedeEditar}
                onSelect={() => setSelId(e.id)}
                onSubir={() => mover(i, -1)}
                onBajar={() => mover(i, 1)}
                primera={i === 0}
                ultima={i === etapas.length - 1}
              />
            ))}

            {puedeEditar && etapas.length > 0 && !nueva && (
              <button
                type="button"
                onClick={() => setNueva(true)}
                className="ce-dashed"
                style={{ border: `1px dashed ${C.border2}`, background: "transparent", color: C.dim, borderRadius: 12, padding: 10, cursor: "pointer", fontSize: 12.5, fontWeight: 800, fontFamily: C.sans }}
              >
                + Nueva etapa
              </button>
            )}
          </div>

          <div style={{ flex: 1, minWidth: 0, overflowY: "auto", paddingRight: 2 }}>
            {seleccionada ? (
              <DetalleEtapa
                key={seleccionada.id}
                obra={obra}
                etapa={seleccionada}
                etapas={etapas}
                plantilla={plantilla}
                procesos={procesos}
                onReloadEtapas={cargarEtapas}
                onPedidoGenerado={onPedidoGenerado}
                toast={toast}
                puedeEditar={puedeEditar}
              />
            ) : (
              !cargando && (
                <EmptyState
                  icon={Boxes}
                  title="Elegí una etapa"
                  subtitle="A la izquierda están las tandas de compra de esta obra. Tocá una para cargarle materiales."
                />
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
