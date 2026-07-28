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
  reordenarEtapasCompraObra, semaforoMeta, transferirMateriales,
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
        </div>
        {/* Fecha calculada + semáforo. Es lo que hace que la lista se lea como un
            cronograma y no como un menú: de un vistazo se ve qué toca comprar. */}
        {(etapa.fecha_compra || etapa.semaforo) && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5, flexWrap: "wrap" }}>
            {etapa.fecha_compra && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10.5, color: C.dim, fontFamily: C.mono }}>
                <CalendarDays size={10} />
                {new Date(`${etapa.fecha_compra}T00:00:00`).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" })}
              </span>
            )}
            {etapa.semaforo && etapa.semaforo !== "sin_fecha" && (() => {
              const sm = semaforoMeta(etapa.semaforo);
              const d = etapa.dias_restantes;
              return (
                <Pill color={sm.color} soft={sm.soft} borde={sm.borde}>
                  {sm.label}
                  {typeof d === "number" && etapa.semaforo !== "hecha" && (
                    <span style={{ fontFamily: C.mono, opacity: 0.85 }}>
                      {d < 0 ? ` ${Math.abs(d)}d` : ` ${d}d`}
                    </span>
                  )}
                </Pill>
              );
            })()}
          </div>
        )}
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

  // Se edita como texto para poder dejarlo vacío (= sin regla de fecha) sin que
  // el input lo convierta en 0.
  // En la base el signo codifica el sentido (positivo = antes del hito,
  // negativo = después). En pantalla se separa en dos controles: un número sin
  // signo y un "antes/después", que es como lo dice la gente.
  const sinSigno = (v) => (v == null || v === "" ? "" : String(Math.abs(Number(v))));
  const [semanas, setSemanas] = useState(sinSigno(etapa.semanas_antes));
  const [refSemanas, setRefSemanas] = useState(etapa.semanas_antes);
  if (refSemanas !== etapa.semanas_antes) {
    setRefSemanas(etapa.semanas_antes);
    setSemanas(sinSigno(etapa.semanas_antes));
  }
  const sentido = Number(etapa.semanas_antes) < 0 ? "despues" : "antes";
  const [gracia, setGracia] = useState(String(etapa.dias_gracia ?? 3));
  const [refGracia, setRefGracia] = useState(etapa.dias_gracia);
  if (refGracia !== etapa.dias_gracia) {
    setRefGracia(etapa.dias_gracia);
    setGracia(String(etapa.dias_gracia ?? 3));
  }

  const sem = semaforoMeta(etapa.semaforo);
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
  // Asignar la etapa de producción a varios materiales de una. Antes había que
  // hacerlo fila por fila con el desplegable de cada renglón.
  async function asignarProcesoMasivo(ids, procesoId) {
    try {
      await Promise.all(ids.map((id) => actualizarMaterialEtapa(id, { linea_proceso_id: procesoId })));
      const nombre = procesoId ? procesosById.get(procesoId)?.nombre : null;
      toast?.success(
        procesoId
          ? `${ids.length} ${ids.length === 1 ? "material asignado" : "materiales asignados"} a "${nombre ?? "la etapa"}".`
          : `${ids.length} ${ids.length === 1 ? "material quedó" : "materiales quedaron"} sin etapa asignada.`
      );
      await cargar();
    } catch (err) { toast?.error(err.message || "No se pudieron asignar."); }
  }

  async function transferir(ids, destinoId) {
    const destino = etapas.find((e) => e.id === destinoId);
    try {
      const { movidos, duplicados } = await transferirMateriales(ids, destinoId);
      if (movidos) {
        toast?.success(`${movidos} ${movidos === 1 ? "material movido" : "materiales movidos"} a "${destino?.nombre ?? "la otra etapa"}".`);
      }
      // Los que ya estaban en el destino no se mueven: la etapa no puede tener
      // el mismo material dos veces. Se avisa en vez de fallar en silencio.
      if (duplicados) {
        const aviso = `${duplicados} ${duplicados === 1 ? "ya estaba" : "ya estaban"} en esa etapa y ${duplicados === 1 ? "quedó" : "quedaron"} acá.`;
        if (typeof toast?.warning === "function") toast.warning(aviso);
        else toast?.error(aviso);
      }
      await recargarTodo();
    } catch (err) { toast?.error(err.message || "No se pudieron mover."); }
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

  // Guardar cualquier campo de la cabecera y refrescar: la fecha la recalcula la
  // vista, así que hay que releer para verla.
  async function guardar(patch) {
    try { await actualizarEtapaCompraObra(etapa.id, patch); await onReloadEtapas(); }
    catch (err) { toast?.error(err.message); }
  }
  // El input muestra el valor SIN signo y el select dice el sentido; al guardar
  // se vuelve a componer. Si alguien escribe "-2" a mano se interpreta como
  // "2 después" en vez de guardar un doble negativo que daría cualquier cosa.
  async function guardarSemanas() {
    const crudo = semanas.trim();
    if (crudo === "") {
      if (etapa.semanas_antes == null) return;
      await guardar({ semanas_antes: null });
      return;
    }
    const n = Number(crudo.replace(",", "."));
    if (!Number.isFinite(n)) { setSemanas(String(Math.abs(etapa.semanas_antes ?? ""))); return; }
    const magnitud = Math.abs(n);
    // Un "-" tipeado a mano cambia el sentido del select.
    const haciaDespues = n < 0 ? true : sentido === "despues";
    const firmado = haciaDespues ? -magnitud : magnitud;
    setSemanas(String(magnitud));
    if (firmado === Number(etapa.semanas_antes)) return;
    await guardar({ semanas_antes: firmado });
  }

  async function guardarSentido(nuevo) {
    const magnitud = Math.abs(Number(semanas.replace(",", ".")) || 0);
    if (!magnitud) return;
    await guardar({ semanas_antes: nuevo === "despues" ? -magnitud : magnitud });
  }
  async function guardarGracia() {
    const valor = gracia.trim();
    const normalizado = valor === "" ? 0 : Math.max(0, Number(valor) || 0);
    setGracia(String(normalizado));
    if (normalizado === Number(etapa.dias_gracia ?? 3)) return;
    await guardar({ dias_gracia: normalizado });
  }
  async function cambiarEstado(estado) {
    try { await actualizarEtapaCompraObra(etapa.id, { estado }); await recargarTodo(); }
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
      const { cantidad, pedidos: nuevos } = await generarPedidoDesdeEtapaCompra(obra, etapa, procesosById);
      toast?.success(
        `${nuevos.length} ${nuevos.length === 1 ? "pedido generado" : "pedidos generados"} por proveedor · ${cantidad} ${cantidad === 1 ? "material" : "materiales"}.`
      );
      await recargarTodo();
      onPedidoGenerado?.();
    } catch (err) { toast?.error(err.message || "No se pudo generar el pedido."); }
    finally { setGenerando(false); }
  }

  const color = etapa.color || "#8b5cf6";
  // Qué etapas de producción cubre esta tanda: se deduce de la etapa asignada a
  // cada material, con cuántos aporta cada una.
  const cubre = useMemo(() => {
    const mapa = new Map();
    for (const m of materiales) {
      if (!m.linea_proceso_id) continue;
      const p = procesosById.get(m.linea_proceso_id);
      if (!p) continue;
      const prev = mapa.get(p.id);
      if (prev) prev.cantidad += 1;
      else mapa.set(p.id, { id: p.id, nombre: p.nombre, color: p.color, cantidad: 1 });
    }
    return [...mapa.values()].sort((a, b) => (a.nombre || "").localeCompare(b.nombre || "", "es"));
  }, [materiales, procesosById]);

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

        {/* Derivado de los materiales, no editable. Tener el mismo dato en dos
            controles independientes hacía que se contradijeran entre sí. */}
        {cubre.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", padding: "9px 14px", borderTop: `1px solid ${C.border}` }}>
            <span style={{ ...LBL }}>Cubre</span>
            {cubre.map((p) => {
              const pc = p.color || "#64748b";
              return (
                <span
                  key={p.id}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 9px", borderRadius: 9,
                    fontSize: 11, fontWeight: 750,
                    border: `1px solid ${tint(pc, 30)}`, background: tint(pc, 11), color: C.muted,
                  }}
                >
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: pc, flexShrink: 0 }} />
                  {p.nombre}
                  <span style={{ fontFamily: C.mono, fontSize: 10, color: C.dim }}>{p.cantidad}</span>
                </span>
              );
            })}
            <span style={{ marginLeft: "auto", fontSize: 10.5, color: C.dim }}>según la etapa de cada material</span>
          </div>
        )}

        {/* Cuándo se compra. La fecha NO se escribe: se define la regla y sale
            del desmolde de la obra. Así cuando se corre el barco, se corre todo. */}
        <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", padding: "10px 14px", borderTop: `1px solid ${C.border}` }}>
          <span style={{ ...LBL }}>Cuándo se compra</span>

          {/* Se escribe siempre en positivo y el sentido lo elige el select. La
              columna sigue siendo `semanas_antes` y la fórmula de la vista es
              `fecha_base - semanas*7`, así que "después" se guarda en negativo:
              no hizo falta tocar la base, sólo dejar de obligar a la gente a
              escribir "-3" para decir "tres semanas después". */}
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: C.muted }}>
            <input
              value={semanas}
              inputMode="decimal"
              placeholder="—"
              disabled={!puedeEditar}
              onChange={(e) => setSemanas(e.target.value)}
              onBlur={() => guardarSemanas()}
              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
              style={{ ...INPUT, width: 54, padding: "4px 7px", fontSize: 12, fontFamily: C.mono, textAlign: "right" }}
            />
            semanas
          </label>

          <select
            value={sentido}
            disabled={!puedeEditar || semanas.trim() === ""}
            onChange={(e) => guardarSentido(e.target.value)}
            style={{
              ...INPUT, width: "auto", padding: "4px 8px", fontSize: 12, borderRadius: 9,
              cursor: puedeEditar ? "pointer" : "default", fontWeight: 800,
              color: sentido === "despues" ? C.amber : C.text,
            }}
          >
            <option value="antes">antes de</option>
            <option value="despues">después de</option>
          </select>

          <select
            value={etapa.referencia || "desmolde"}
            disabled={!puedeEditar}
            onChange={(e) => guardar({ referencia: e.target.value })}
            style={{ ...INPUT, width: "auto", padding: "4px 8px", fontSize: 12, borderRadius: 9, cursor: "pointer" }}
          >
            <option value="desmolde">el desmolde</option>
            <option value="botada">la botada</option>
          </select>

          {/* Arranca APAGADO y hay que prenderlo a mano. Que el sistema compre
              solo es una decisión de una persona, no un default. Por eso el
              estado apagado se muestra explícito ("manual") en vez de dejar el
              control mudo: mudo se lee como "no sé si está prendido". */}
          <label
            title={
              etapa.auto_generar === true
                ? "Al vencer la tolerancia, el sistema genera el pedido solo y le avisa a Compras."
                : "Prendelo sólo si querés que el sistema compre por su cuenta al vencer la fecha. Apagado, el pedido lo generás vos."
            }
            style={{
              display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 9px",
              borderRadius: 9, border: `1px solid ${etapa.auto_generar === true ? C.greenB : C.border}`,
              background: etapa.auto_generar === true ? C.greenL : C.panel,
              color: etapa.auto_generar === true ? C.green : C.dim, fontSize: 11.5, fontWeight: 800,
              cursor: puedeEditar ? "pointer" : "default",
            }}
          >
            <input
              type="checkbox"
              checked={etapa.auto_generar === true}
              disabled={!puedeEditar}
              onChange={(e) => guardar({ auto_generar: e.target.checked })}
              style={{ accentColor: "var(--green)", cursor: puedeEditar ? "pointer" : "default" }}
            />
            {etapa.auto_generar === true ? "Compra automática" : "Compra manual"}
          </label>

          {etapa.auto_generar === true && (
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, color: C.dim, fontSize: 11.5 }}>
              tolerancia
              <input
                value={gracia}
                inputMode="numeric"
                disabled={!puedeEditar}
                aria-label="Días de gracia antes de generar el pedido"
                onChange={(e) => setGracia(e.target.value)}
                onBlur={guardarGracia}
                onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                style={{ ...INPUT, width: 48, padding: "4px 7px", fontSize: 11.5, fontFamily: C.mono, textAlign: "right" }}
              />
              días
            </label>
          )}

          {/* Resultado del cálculo, para que se vea el efecto de lo que se toca */}
          {etapa.fecha_compra ? (
            <>
              <Pill color={sem.color} soft={sem.soft} borde={sem.borde}>
                <CalendarDays size={10} />
                {new Date(`${etapa.fecha_compra}T00:00:00`).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })}
                {etapa.fecha_objetivo ? " · manual" : ""}
              </Pill>
              {/* La regla en palabras: es la forma más rápida de detectar que
                  quedó al revés de lo que se quería. */}
              {!etapa.fecha_objetivo && etapa.semanas_antes != null && (
                <span style={{ fontSize: 11, color: C.dim }}>
                  {Math.abs(Number(etapa.semanas_antes))} {Math.abs(Number(etapa.semanas_antes)) === 1 ? "semana" : "semanas"}{" "}
                  <b style={{ color: sentido === "despues" ? C.amber : C.muted, fontWeight: 800 }}>
                    {sentido === "despues" ? "después" : "antes"}
                  </b>{" "}
                  {etapa.referencia === "botada" ? "de la botada" : "del desmolde"}
                </span>
              )}
            </>
          ) : (
            <span style={{ fontSize: 11.5, color: C.dim }}>
              {etapa.fecha_base
                ? "poné las semanas para calcular la fecha"
                : `la obra no tiene ${etapa.referencia === "botada" ? "botada" : "desmolde"} cargado`}
            </span>
          )}

          {etapa.fecha_base && (
            <span style={{ fontSize: 10.5, color: C.dim, fontFamily: C.mono }}>
              {etapa.referencia === "botada" ? "botada" : "desmolde"}{" "}
              {new Date(`${etapa.fecha_base}T00:00:00`).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" })}
              {etapa.fecha_base_es_real ? " (real)" : " (est.)"}
              {Number(etapa.obra_atraso_dias) ? ` · atraso ${etapa.obra_atraso_dias}d` : ""}
            </span>
          )}
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
          otrasEtapas={etapas.filter((e) => e.id !== etapa.id).map((e) => ({ id: e.id, nombre: e.nombre }))}
          onTransferir={puedeEditar ? transferir : null}
          onProcesoMasivo={puedeEditar ? asignarProcesoMasivo : null}
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
