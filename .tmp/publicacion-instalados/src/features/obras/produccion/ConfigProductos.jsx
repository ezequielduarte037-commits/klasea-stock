import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Inbox, Link2, PackagePlus, Search, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import Cargando from "@/components/ui/Cargando";
import MaterialPicker from "@/features/produccion/MaterialPicker";
import { fetchRubros } from "@/features/produccion/catalogoBusquedaApi";
import {
  assignProduccionMaterials, fetchProduccionMateriales, removeProduccionMaterial, updateProduccionMaterial,
} from "@/features/obras/produccionMaterialesApi";
import { Anillo } from "./ui";
import { plural } from "./formato";

// Productos por etapa. A la izquierda las etapas con cuántos productos tiene
// cada una; a la derecha la bandeja con lo que falta ubicar de la matriz del
// modelo. Se eligen productos y se asignan a la etapa (o se arrastran encima
// de una etapa). Lo asignado viaja a Compras cuando la etapa está vinculada a
// una tanda.

const SIN_PROV = "Sin proveedor";
const SIN_RUBRO = "__sin_rubro__";
const TAREA = "tarea:";
const cant = (v) => Number(v || 1).toLocaleString("es-AR", { maximumFractionDigits: 2 });

export default function ConfigProductos({ linea, procesos, tareas, procesoSel, setProcesoSel, esGestion, isMobile, onCambio, onCobertura }) {
  const toast = useToast();
  const ids = useMemo(() => procesos.map((p) => p.id), [procesos]);
  const clave = ids.join("|");
  const [datos, setDatos] = useState({ modelo: "", matrix: [], assignments: [], purchaseStagesByProcess: new Map() });
  const [cargando, setCargando] = useState(true);
  const [vista, setVista] = useState("bandeja");
  const [q, setQ] = useState("");
  const [prov, setProv] = useState("");
  const [rubro, setRubro] = useState("");
  const [rubros, setRubros] = useState(() => new Map());
  const [sel, setSel] = useState(() => new Set());
  const [destinoTarea, setDestinoTarea] = useState("");
  const [sobre, setSobre] = useState(null);
  const [picker, setPicker] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const proceso = procesos.find((p) => p.id === procesoSel) || procesos[0] || null;

  const cargar = useCallback(async () => {
    if (!ids.length) { setCargando(false); return; }
    try {
      setDatos(await fetchProduccionMateriales({ linea, processIds: ids }));
    } catch (e) {
      toast.error(`No se pudieron cargar los productos: ${e.message}`);
    } finally {
      setCargando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linea?.id, clave, toast]);

  useEffect(() => { setCargando(true); cargar(); }, [cargar]);
  useEffect(() => {
    let vivo = true;
    fetchRubros().then((l) => { if (vivo) setRubros(new Map((l || []).map((r) => [r.id, r.nombre]))); }).catch(() => {});
    return () => { vivo = false; };
  }, []);
  useEffect(() => { setDestinoTarea(""); }, [proceso?.id]);

  const asignados = useMemo(() => new Set(datos.assignments.map((a) => a.material_id)), [datos.assignments]);
  const matrizIds = useMemo(() => new Set(datos.matrix.map((m) => m.id)), [datos.matrix]);
  const pendientes = useMemo(() => datos.matrix.filter((m) => !asignados.has(m.id)), [datos.matrix, asignados]);
  const porEtapa = useMemo(() => {
    const c = new Map();
    datos.assignments.forEach((a) => c.set(a.linea_proceso_id, (c.get(a.linea_proceso_id) || 0) + 1));
    return c;
  }, [datos.assignments]);
  const cubiertos = datos.matrix.length - pendientes.length;
  const cobertura = datos.matrix.length ? Math.round((cubiertos / datos.matrix.length) * 100) : null;
  // La tarjeta de la línea muestra el mismo número que esta bandeja.
  useEffect(() => {
    if (!cargando) onCobertura?.(linea.id, { cubiertos, total: datos.matrix.length, modelo: datos.modelo });
  }, [cargando, cubiertos, datos.matrix.length, datos.modelo, linea.id, onCobertura]);

  const rubroDe = useCallback((m) => ({ clave: m.categoria_id || SIN_RUBRO, nombre: rubros.get(m.categoria_id) || "Sin rubro" }), [rubros]);
  const opcionesProv = useMemo(() => {
    const c = new Map();
    pendientes.forEach((m) => { const n = String(m.proveedor || "").trim() || SIN_PROV; c.set(n, (c.get(n) || 0) + 1); });
    return [...c.entries()].sort((a, b) => a[0].localeCompare(b[0], "es"));
  }, [pendientes]);
  const opcionesRubro = useMemo(() => {
    const c = new Map();
    pendientes.forEach((m) => { const r = rubroDe(m); const p = c.get(r.clave); if (p) p.n += 1; else c.set(r.clave, { nombre: r.nombre, n: 1 }); });
    return [...c.entries()].sort((a, b) => a[1].nombre.localeCompare(b[1].nombre, "es"));
  }, [pendientes, rubroDe]);
  const filtrados = useMemo(() => {
    const t = q.trim().toLocaleLowerCase("es");
    return pendientes.filter((m) => {
      if (prov && (String(m.proveedor || "").trim() || SIN_PROV) !== prov) return false;
      if (rubro && rubroDe(m).clave !== rubro) return false;
      return !t || `${m.descripcion || ""} ${m.codigo || ""} ${m.proveedor || ""}`.toLocaleLowerCase("es").includes(t);
    });
  }, [pendientes, q, prov, rubro, rubroDe]);
  const deLaEtapa = useMemo(() => datos.assignments.filter((a) => a.linea_proceso_id === proceso?.id), [datos.assignments, proceso]);
  const tareasEtapa = useMemo(() => tareas.filter((t) => t.linea_proceso_id === proceso?.id).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)), [tareas, proceso]);
  const opcionesDestino = useMemo(() => procesos.flatMap((p) => [
    { v: p.id, t: p.nombre },
    ...tareas.filter((t) => t.linea_proceso_id === p.id).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)).map((t) => ({ v: `${TAREA}${t.id}`, t: `${p.nombre} › ${t.nombre}` })),
  ]), [procesos, tareas]);

  useEffect(() => {
    if (prov && !opcionesProv.some(([n]) => n === prov)) setProv("");
    if (rubro && !opcionesRubro.some(([c]) => c === rubro)) setRubro("");
  }, [opcionesProv, opcionesRubro, prov, rubro]);

  const alternar = (id) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const todosVisibles = filtrados.length > 0 && filtrados.every((m) => sel.has(m.id));

  async function asignar(filas, procesoId, tareaId = null) {
    if (!filas.length || !procesoId) return;
    setOcupado(true);
    try {
      const n = await assignProduccionMaterials({ processIds: ids, processId: procesoId, taskId: tareaId, materials: filas });
      setSel(new Set());
      const destino = procesos.find((p) => p.id === procesoId)?.nombre;
      toast.success(`${plural(n, "producto asignado", "productos asignados")} a ${destino}`);
      await cargar();
      onCambio?.();
    } catch (e) {
      toast.error(`No se pudo asignar: ${e.message}`);
    } finally {
      setOcupado(false);
    }
  }

  async function mover(fila, valor) {
    const esTarea = valor.startsWith(TAREA);
    const tareaId = esTarea ? valor.slice(TAREA.length) : null;
    const procesoId = esTarea ? tareas.find((t) => t.id === tareaId)?.linea_proceso_id : valor;
    if (!procesoId) return;
    setOcupado(true);
    try {
      await updateProduccionMaterial(fila.id, { processId: procesoId, taskId: tareaId });
      toast.success("Producto movido");
      await cargar();
    } catch (e) {
      toast.error(`No se pudo mover: ${e.message}`);
    } finally {
      setOcupado(false);
    }
  }

  async function actualizar(fila, patch) {
    try {
      await updateProduccionMaterial(fila.id, patch);
      setDatos((d) => ({ ...d, assignments: d.assignments.map((a) => (a.id === fila.id ? { ...a, ...(patch.cantidad != null ? { cantidad: Number(patch.cantidad) } : {}), ...(patch.unidad != null ? { unidad: patch.unidad } : {}) } : a)) }));
    } catch (e) {
      toast.error(`No se pudo guardar: ${e.message}`);
    }
  }

  async function quitar(fila) {
    setOcupado(true);
    try {
      await removeProduccionMaterial(fila.id);
      toast.info("Producto devuelto a la bandeja");
      await cargar();
      onCambio?.();
    } catch (e) {
      toast.error(`No se pudo quitar: ${e.message}`);
    } finally {
      setOcupado(false);
    }
  }

  // Arrastrar desde la bandeja hasta una etapa de la izquierda.
  const arrastrar = (e, m) => {
    const lote = sel.has(m.id) ? pendientes.filter((x) => sel.has(x.id)) : [m];
    e.dataTransfer.effectAllowed = "copy";
    e.dataTransfer.setData("application/x-klasea-productos", JSON.stringify(lote.map((x) => x.id)));
    e.dataTransfer.setData("text/plain", `${lote.length} productos`);
  };
  const soltarEn = (e, p) => {
    e.preventDefault();
    setSobre(null);
    let idsLote = [];
    try { idsLote = JSON.parse(e.dataTransfer.getData("application/x-klasea-productos") || "[]"); } catch { idsLote = []; }
    const filas = pendientes.filter((m) => idsLote.includes(m.id));
    if (filas.length) { setProcesoSel(p.id); asignar(filas, p.id); }
  };

  const compras = proceso ? datos.purchaseStagesByProcess.get(proceso.id) || [] : [];

  if (cargando) return <div className="prd-conf" style={{ position: "relative" }}><Cargando llenar texto="Cargando la matriz de productos…" /></div>;

  return (
    <div className="prd-conf" data-tour="obras-config-productos">
      <div className="prd-dos">
        <aside aria-label="Etapas">
          <div className="prd-cobertura">
            <Anillo valor={cobertura} tam={52} grosor={5} />
            <div>
              <b>{datos.matrix.length ? `${cubiertos} de ${datos.matrix.length} ubicados` : "Sin matriz del modelo"}</b>
              <small>{datos.matrix.length ? `Matriz K${datos.modelo}. ${pendientes.length ? `Faltan ${pendientes.length}.` : "No queda nada por ubicar."}` : "Se puede empezar con el catálogo completo."}</small>
            </div>
          </div>
          {procesos.map((p, i) => (
            <button
              key={p.id}
              type="button"
              className={`prd-et-item${proceso?.id === p.id ? " on" : ""}${sobre === p.id ? " destino" : ""}`}
              onClick={() => setProcesoSel(p.id)}
              onDragOver={(e) => { if (e.dataTransfer.types.includes("application/x-klasea-productos")) { e.preventDefault(); setSobre(p.id); } }}
              onDragLeave={() => setSobre((s) => (s === p.id ? null : s))}
              onDrop={(e) => soltarEn(e, p)}
            >
              <span className="prd-rec-num">{i + 1}</span>
              <span className="nom">{p.nombre}</span>
              <span className="cnt">{porEtapa.get(p.id) || 0}</span>
            </button>
          ))}
        </aside>

        <section>
          <div className="prd-prod-cab">
            <div className="prd-seg" role="tablist" aria-label="Productos">
              <button type="button" role="tab" aria-selected={vista === "bandeja"} className={vista === "bandeja" ? "on" : ""} onClick={() => setVista("bandeja")}><Inbox size={14} />Por ubicar<span className="n">{pendientes.length}</span></button>
              <button type="button" role="tab" aria-selected={vista === "etapa"} className={vista === "etapa" ? "on" : ""} onClick={() => setVista("etapa")}>En {proceso?.nombre || "la etapa"}<span className="n">{deLaEtapa.length}</span></button>
            </div>
            <span className="prd-sp" />
            {esGestion && proceso && <button type="button" className="ui-btn" onClick={() => setPicker(true)}><PackagePlus size={15} />Catálogo completo</button>}
          </div>

          {vista === "bandeja" ? (
            <>
              {pendientes.length > 0 && (
                <div className="prd-prod-cab">
                  <label className="prd-buscar" aria-label="Buscar en la bandeja">
                    <Search size={15} />
                    <input className="ui-input" id="prod-buscar" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar producto, código o proveedor" autoComplete="off" />
                  </label>
                  <select className="ui-input" id="prod-prov" value={prov} onChange={(e) => setProv(e.target.value)} aria-label="Proveedor">
                    <option value="">Todos los proveedores</option>
                    {opcionesProv.map(([n, c]) => <option key={n} value={n}>{n} ({c})</option>)}
                  </select>
                  <select className="ui-input" id="prod-rubro" value={rubro} onChange={(e) => setRubro(e.target.value)} aria-label="Rubro">
                    <option value="">Todos los rubros</option>
                    {opcionesRubro.map(([c, info]) => <option key={c} value={c}>{info.nombre} ({info.n})</option>)}
                  </select>
                  {esGestion && (
                    <button type="button" className="lnk" onClick={() => setSel((s) => { const n = new Set(s); filtrados.forEach((m) => (todosVisibles ? n.delete(m.id) : n.add(m.id))); return n; })}>
                      {todosVisibles ? "Desmarcar visibles" : `Elegir ${q || prov || rubro ? `los ${filtrados.length} filtrados` : "todos"}`}
                    </button>
                  )}
                </div>
              )}
              {!datos.matrix.length ? (
                <div className="prd-vacio"><strong>La línea no tiene matriz de productos</strong><span>Usá “Catálogo completo” para asignar productos a cada etapa.</span></div>
              ) : !pendientes.length ? (
                <div className="prd-vacio"><strong>Bandeja en cero</strong><span>Todos los productos de la matriz K{datos.modelo} tienen etapa.</span></div>
              ) : !filtrados.length ? (
                <div className="prd-vacio"><strong>Nada coincide con el filtro</strong><button type="button" className="ui-btn" onClick={() => { setQ(""); setProv(""); setRubro(""); }}>Limpiar filtros</button></div>
              ) : (
                <div className="prd-lista">
                  {filtrados.map((m) => {
                    const on = sel.has(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        className={`prd-prod-fila${on ? " on" : ""}`}
                        onClick={() => esGestion && alternar(m.id)}
                        draggable={esGestion && !isMobile}
                        onDragStart={(e) => arrastrar(e, m)}
                        aria-pressed={on}
                      >
                        <span className="box">{on && <Check size={12} strokeWidth={3} />}</span>
                        <span style={{ minWidth: 0 }}>
                          <span className="d" style={{ display: "block" }}>{m.descripcion}</span>
                          <span className="m">{m.codigo && <span className="mono">{m.codigo}</span>}{m.proveedor && <span>{m.proveedor}</span>}<span>{rubroDe(m).nombre}</span></span>
                        </span>
                        <span className="q">{cant(m.cantidad)} {m.unidad}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              {esGestion && sel.size > 0 && proceso && (
                <div className="prd-flotante">
                  <b>{plural(sel.size, "producto elegido", "productos elegidos")}</b>
                  <span style={{ color: "var(--dim)", fontSize: 12.5 }}>→</span>
                  <select className="ui-input" id="prod-destino" value={proceso.id} onChange={(e) => setProcesoSel(e.target.value)} aria-label="Etapa destino">
                    {procesos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>
                  {tareasEtapa.length > 0 && (
                    <select className="ui-input" id="prod-destino-tarea" value={destinoTarea} onChange={(e) => setDestinoTarea(e.target.value)} aria-label="Tarea (opcional)">
                      <option value="">Toda la etapa</option>
                      {tareasEtapa.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                    </select>
                  )}
                  <span className="prd-sp" />
                  <button type="button" className="ui-btn ui-btn-fantasma" onClick={() => setSel(new Set())}>Cancelar</button>
                  <button type="button" className="ui-btn ui-btn-primario" disabled={ocupado} onClick={() => asignar(pendientes.filter((m) => sel.has(m.id)), proceso.id, destinoTarea || null)}>
                    <Check size={15} />Asignar
                  </button>
                </div>
              )}
              {!isMobile && esGestion && pendientes.length > 0 && sel.size === 0 && (
                <p style={{ fontSize: 12, color: "var(--subtle)", marginTop: 10 }}>Elegí productos y asignalos, o arrastralos encima de una etapa de la izquierda.</p>
              )}
            </>
          ) : (
            <>
              {deLaEtapa.length ? (
                <div className="prd-lista">
                  {deLaEtapa.map((a) => {
                    const m = a.material || {};
                    const valor = a.linea_proceso_tarea_id ? `${TAREA}${a.linea_proceso_tarea_id}` : a.linea_proceso_id;
                    return (
                      <div key={a.id} className="prd-asig">
                        <span style={{ minWidth: 0 }}>
                          <span className="prd-g-l2" style={{ display: "block", color: "var(--text)", fontWeight: 600, fontSize: 12.5, marginTop: 0 }}>{m.descripcion || "Producto sin nombre"}</span>
                          <span style={{ display: "flex", gap: 8, fontSize: 11, color: "var(--subtle)", marginTop: 2 }}>
                            {m.codigo && <span className="mono">{m.codigo}</span>}
                            {!matrizIds.has(a.material_id) && <span style={{ color: "var(--violet)", fontWeight: 600 }}>fuera de la matriz</span>}
                          </span>
                        </span>
                        <select className="ui-input" value={valor} disabled={!esGestion || ocupado} onChange={(e) => mover(a, e.target.value)} aria-label="Etapa o tarea">
                          {opcionesDestino.map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}
                        </select>
                        <input key={`${a.id}:${a.cantidad}`} className="ui-input mono" type="number" min="0.01" step="0.01" defaultValue={a.cantidad ?? 1} disabled={!esGestion}
                          onBlur={(e) => Number(e.target.value) !== Number(a.cantidad) && actualizar(a, { cantidad: e.target.value })} aria-label="Cantidad" />
                        <input key={`${a.id}:${a.unidad}`} className="ui-input unidad" defaultValue={a.unidad || m.unidad_medida || "unidad"} disabled={!esGestion}
                          onBlur={(e) => e.target.value !== (a.unidad || m.unidad_medida || "unidad") && actualizar(a, { unidad: e.target.value })} aria-label="Unidad" />
                        {esGestion ? <button type="button" className="prd-mas" style={{ color: "var(--red)" }} onClick={() => quitar(a)} aria-label="Devolver a la bandeja" title="Devolver a la bandeja"><Trash2 size={14} /></button> : <span />}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="prd-vacio"><strong>{proceso?.nombre} no tiene productos</strong><span>Asignalos desde “Por ubicar” o desde el catálogo completo.</span></div>
              )}
            </>
          )}

          {proceso && (
            <div className="prd-nota" style={{ marginTop: 14, display: "flex", gap: 8, alignItems: "center" }}>
              <Link2 size={14} style={{ flexShrink: 0, color: compras.length ? "var(--green)" : "var(--cyan)" }} />
              {compras.length
                ? <span>Compras recibe {proceso.nombre} en: <b>{compras.map((c) => c.nombre).join(" · ")}</b></span>
                : <span>{proceso.nombre} todavía no está vinculada a una tanda de compra. Los productos quedan guardados y se envían cuando se vincule.</span>}
            </div>
          )}
        </section>
      </div>

      {picker && proceso && (
        <MaterialPicker
          titulo={`Agregar productos a ${proceso.nombre}`}
          yaCargados={asignados}
          onClose={() => setPicker(false)}
          onAdd={async (filas) => { await asignar(filas, proceso.id, destinoTarea || null); setPicker(false); }}
        />
      )}
    </div>
  );
}
