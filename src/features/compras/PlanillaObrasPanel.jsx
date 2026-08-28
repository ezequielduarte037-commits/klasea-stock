import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Download, LoaderCircle, RotateCcw, Search, ShoppingCart, SquarePen, Table2, X } from "lucide-react";
import { C } from "@/theme";
import { useToast } from "@/components/ui/Toast";
import { calcularPlanillaDeLinea } from "@/features/compras/planillaObrasApi";

/**
 * La planilla de una linea: materiales en las filas, obras ACTIVAS en las
 * columnas, y en cada cruce lo entregado, lo que espera en el pañol y lo que
 * todavia falta.
 *
 * Se trabaja desde aca: se tildan renglones, se copian, o se mandan derecho a un
 * pedido de compras con la obra y el proveedor ya puestos. Mirar una planilla y
 * despues cargar el pedido en otra pantalla es donde se pierde la mitad de lo
 * que uno vino a hacer.
 */

const AGRUPACIONES = [
  { valor: "rubro", etiqueta: "Por rubro" },
  { valor: "proveedor", etiqueta: "Por proveedor" },
];

/** Que numero mostrar en el cruce. Manda lo entregado, que ya es un hecho. */
function celdaDeObra(celda) {
  if (!celda) return null;
  if (celda.egresado > 0) return { texto: celda.egresado, tono: "egresado" };
  if (celda.enPanol > 0) return { texto: celda.enPanol, tono: "panol" };
  if (celda.pendiente > 0) return { texto: celda.pendiente, tono: "pendiente" };
  return null;
}

const TONOS = {
  egresado: { color: C.green, fondo: "var(--green-soft)", borde: C.greenB },
  panol: { color: C.cyan, fondo: C.cyanL, borde: C.cyanB },
  pendiente: { color: C.red, fondo: C.redL, borde: C.redB },
};

/** KPI compacto: la metrica sin robarle alto a la tabla. */
function Chip({ valor, etiqueta, color = C.text }) {
  return (
    <div style={{
      display: "inline-flex", alignItems: "baseline", gap: 6,
      background: "var(--panel-2)", border: `1px solid ${C.border}`,
      borderRadius: 9, padding: "5px 10px", whiteSpace: "nowrap",
    }}>
      <span style={{ color, fontSize: 15, fontWeight: 950, fontFamily: C.mono, fontVariantNumeric: "tabular-nums" }}>{valor}</span>
      <span style={{ color: C.dim, fontSize: 11.5, fontWeight: 750 }}>{etiqueta}</span>
    </div>
  );
}

export default function PlanillaObrasPanel({ isMobile = false, onPedir }) {
  const toast = useToast();
  const [linea, setLinea] = useState("K37");
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [agrupar, setAgrupar] = useState("rubro");
  const [soloPendientes, setSoloPendientes] = useState(false);
  const [obraFoco, setObraFoco] = useState("");
  const [elegidos, setElegidos] = useState(() => new Set());
  const [gruposCerrados, setGruposCerrados] = useState(() => new Set());
  const buscadorRef = useRef(null);

  const cargar = useCallback(async (cual) => {
    setCargando(true);
    try {
      setDatos(await calcularPlanillaDeLinea(cual));
      setError("");
    } catch (e) {
      setError(e.message || "No se pudo armar la planilla.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(linea); }, [cargar, linea]);
  // Cambiar de linea invalida lo tildado: los materiales son otros.
  useEffect(() => { setElegidos(new Set()); setObraFoco(""); }, [linea]);

  const obrasVisibles = useMemo(() => {
    if (!datos) return [];
    return obraFoco ? datos.obras.filter((o) => o.id === obraFoco) : datos.obras;
  }, [datos, obraFoco]);

  const grupos = useMemo(() => {
    if (!datos) return [];
    const q = busqueda.trim().toLowerCase();
    const filtradas = datos.filas.filter((f) => {
      if (obraFoco && !f.porObra[obraFoco]) return false;
      if (soloPendientes) {
        const pendiente = obraFoco ? (f.porObra[obraFoco]?.pendiente || 0) : f.totales.pendiente;
        if (!(pendiente > 0)) return false;
      }
      if (!q) return true;
      return [f.descripcion, f.codigo, f.proveedor, f.rubro].some((c) => String(c || "").toLowerCase().includes(q));
    });
    const mapa = new Map();
    for (const f of filtradas) {
      const clave = agrupar === "rubro" ? f.rubro : (f.proveedor || "Sin proveedor");
      if (!mapa.has(clave)) mapa.set(clave, []);
      mapa.get(clave).push(f);
    }
    return [...mapa.entries()]
      .map(([nombre, filas]) => ({
        nombre,
        filas,
        pendientes: filas.filter((f) => f.totales.pendiente > 0).length,
        sinProveedor: nombre === "Sin proveedor",
      }))
      .sort((a, b) => {
        if (a.sinProveedor !== b.sinProveedor) return a.sinProveedor ? 1 : -1;
        return a.nombre.localeCompare(b.nombre);
      });
  }, [datos, busqueda, agrupar, soloPendientes, obraFoco]);

  const seleccionados = useMemo(
    () => grupos.flatMap((g) => g.filas).filter((f) => elegidos.has(f.id)),
    [grupos, elegidos],
  );

  function alternarFila(id) {
    setElegidos((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  }

  function alternarGrupo(grupo) {
    const ids = grupo.filas.map((f) => f.id);
    const todosPuestos = ids.every((id) => elegidos.has(id));
    setElegidos((prev) => {
      const s = new Set(prev);
      for (const id of ids) { if (todosPuestos) s.delete(id); else s.add(id); }
      return s;
    });
  }

  function alternarCerrado(nombre) {
    setGruposCerrados((prev) => {
      const s = new Set(prev);
      if (s.has(nombre)) s.delete(nombre); else s.add(nombre);
      return s;
    });
  }

  /**
   * Lo que hay que COMPRAR de cada elegido: el pendiente menos lo que el pañol
   * tiene libre. Lo que ya esta libre en el pañol no se compra, se va a buscar,
   * asi que sale del pedido y se avisa cuantos fueron.
   *
   * Lo reservado a otra obra no descuenta: esta en el pañol pero no es de este
   * barco, y contarlo es exactamente lo que hace que algo no se compre y falte.
   */
  function lineasDePedido() {
    const renglones = [];
    let cubiertos = 0;
    for (const f of seleccionados) {
      const pendiente = obraFoco ? (f.porObra[obraFoco]?.pendiente || 0) : f.totales.pendiente;
      const aPedir = Math.round(Math.max(0, pendiente - f.enPanolLibre) * 100) / 100;
      if (pendiente > 0 && aPedir === 0) { cubiertos += 1; continue; }
      // Sin pendiente lo tildaron a proposito (reponer, tener de mas): va con 1.
      const cantidad = aPedir > 0 ? aPedir : 1;
      renglones.push(`${cantidad} ${f.unidad}  ${f.descripcion}${f.codigo ? ` (${f.codigo})` : ""}`);
    }
    return { renglones, cubiertos };
  }

  /** Abre la ficha del producto para corregirla sin perder la planilla. */
  function abrirFicha(evento, materialId) {
    evento.stopPropagation();
    window.open(`/catalogo-maestro?material=${materialId}`, "_blank", "noopener");
  }

  function copiar() {
    const { renglones, cubiertos } = lineasDePedido();
    if (!renglones.length) {
      toast.info(`Lo que elegiste ya está libre en el pañol (${cubiertos}). No hay nada para comprar.`);
      return;
    }
    const obra = obrasVisibles.length === 1 ? ` · ${obrasVisibles[0].codigo}` : "";
    navigator.clipboard?.writeText(`Pedido ${linea}${obra}\n\n${renglones.join("\n")}`)
      .then(() => toast.success(`${renglones.length} renglones copiados${cubiertos ? ` · ${cubiertos} ya están en el pañol` : ""}.`))
      .catch(() => toast.error("No se pudo copiar."));
  }

  function pedir() {
    if (!seleccionados.length) return;
    const { renglones, cubiertos } = lineasDePedido();
    if (!renglones.length) {
      toast.info(`Lo que elegiste ya está libre en el pañol (${cubiertos}). No hay nada para comprar.`);
      return;
    }
    const proveedores = [...new Set(seleccionados.map((f) => f.proveedor).filter(Boolean))];
    const obra = obrasVisibles.length === 1 ? obrasVisibles[0] : null;
    onPedir?.({
      titulo: `${linea}${obra ? ` ${obra.codigo}` : ""} · ${renglones.length} materiales`,
      descripcion: renglones.join("\n"),
      proveedorSugerido: proveedores.length === 1 ? proveedores[0] : "",
      obraId: obra?.id || "",
      obraCodigo: obra?.codigo || "",
    });
    setElegidos(new Set());
    if (cubiertos) toast.info(`${cubiertos} quedaron afuera: ya están libres en el pañol.`);
  }

  function exportar() {
    if (!datos) return;
    const obras = obrasVisibles;
    const cabecera = [
      agrupar === "rubro" ? "Rubro" : "Proveedor",
      "Material", "Código", "Unidad", "Libre en pañol", "Reservado a obras",
      ...obras.flatMap((o) => [`${o.codigo} entregado`, `${o.codigo} en pañol`, `${o.codigo} pendiente`]),
    ];
    const filas = grupos.flatMap((g) => g.filas.map((f) => [
      g.nombre, f.descripcion, f.codigo, f.unidad, f.enPanolLibre, f.reservado,
      ...obras.flatMap((o) => {
        const c = f.porObra[o.id];
        return [c?.egresado ?? "", c?.enPanol ?? "", c?.pendiente ?? ""];
      }),
    ]));
    // Punto y coma y BOM: lo que Excel en español abre sin preguntar ni romper acentos.
    const csv = [cabecera, ...filas]
      .map((fila) => fila.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";"))
      .join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `Planilla_${datos.linea}_${new Date().toLocaleDateString("es-AR").replace(/\//g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success(`${filas.length} materiales exportados.`);
  }

  const panel = {
    background: "var(--panel-solid)",
    border: `1px solid ${C.border}`,
    borderRadius: 12,
    backdropFilter: "var(--glass-filter)",
    WebkitBackdropFilter: "var(--glass-filter)",
  };
  const control = {
    border: `1px solid ${C.border2}`, background: "var(--panel-solid)", color: C.text,
    borderRadius: 9, padding: "7px 10px", fontFamily: C.sans, fontSize: 12.5, fontWeight: 800,
    outline: "none", cursor: "pointer",
  };
  const th = {
    position: "sticky", top: 0, zIndex: 3, background: "var(--panel-solid)",
    textAlign: "center", fontSize: 10.5, fontWeight: 900, letterSpacing: 0.4, textTransform: "uppercase",
    color: C.dim, padding: "8px 6px", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap",
  };
  const colFija = { position: "sticky", left: 0, zIndex: 2, background: "var(--panel-solid)", borderRight: `1px solid ${C.border}` };

  return (
    <div style={{ display: "grid", gap: 12, padding: isMobile ? 12 : 0, minWidth: 0 }}>
      <style>{`
        .planilla-fila:hover { background: var(--panel-2); }
        .planilla-fila:hover .planilla-celda-fija { background: var(--panel-2); }
        .planilla-check:focus-visible { outline: 2px solid ${C.blue}; outline-offset: 2px; }
        .planilla-ficha { transition: opacity .15s, border-color .15s, color .15s; }
        @media (hover: hover) {
          .planilla-ficha { opacity: 0; }
          .planilla-fila:hover .planilla-ficha { opacity: 1; }
        }
        .planilla-ficha:hover { border-color: ${C.blueB}; color: ${C.blue}; }
        .planilla-ficha:focus-visible { opacity: 1; outline: 2px solid ${C.blue}; outline-offset: 2px; }
        .planilla-obra-btn { transition: border-color .15s, color .15s, transform .15s; }
        .planilla-obra-btn:hover { border-color: ${C.blueB}; color: ${C.blue}; transform: translateY(-1px); }
      `}</style>

      {/* ── Una sola banda: titulo, linea, KPIs y controles ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
        <Table2 size={17} color={C.blue} />
        <div style={{ fontSize: 15.5, fontWeight: 950, color: C.text }}>Planilla por obra</div>
        <select
          value={linea}
          onChange={(e) => setLinea(e.target.value)}
          style={{ ...control, border: `1px solid ${C.blueB}`, background: C.blueL, color: C.blue, fontWeight: 900, fontSize: 13 }}
        >
          {(datos?.lineasDisponibles ?? [linea]).map((l) => <option key={l} value={l}>{l}</option>)}
        </select>

        {datos ? (
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
            <Chip valor={datos.resumen.materiales} etiqueta="materiales" />
            <Chip valor={datos.resumen.obras} etiqueta="obras activas" color={C.blue} />
            <Chip valor={datos.resumen.conPendiente} etiqueta="con pendientes" color={C.red} />
            {datos.resumen.cubiertos > 0 ? <Chip valor={datos.resumen.cubiertos} etiqueta="ya están en pañol" color={C.green} /> : null}
            {datos.resumen.sinProveedor > 0 ? <Chip valor={datos.resumen.sinProveedor} etiqueta="sin proveedor" color={C.red} /> : null}
          </div>
        ) : null}

        <div style={{ marginLeft: "auto", display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, border: `1px solid ${C.border2}`, background: "var(--panel-solid)", borderRadius: 9, padding: "6px 10px", minWidth: isMobile ? "100%" : 190 }}>
            <Search size={14} color={C.dim} />
            <input
              ref={buscadorRef}
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Material, rubro…"
              style={{ flex: 1, border: "none", background: "transparent", color: C.text, outline: "none", fontFamily: C.sans, fontSize: 12.5, fontWeight: 700, minWidth: 0 }}
            />
            {busqueda ? (
              <button type="button" onClick={() => { setBusqueda(""); buscadorRef.current?.focus(); }} aria-label="Limpiar búsqueda"
                style={{ border: "none", background: "transparent", color: C.dim, cursor: "pointer", display: "flex", padding: 0 }}>
                <X size={13} />
              </button>
            ) : null}
          </div>
          <select value={agrupar} onChange={(e) => setAgrupar(e.target.value)} style={control}>
            {AGRUPACIONES.map((a) => <option key={a.valor} value={a.valor}>{a.etiqueta}</option>)}
          </select>
          <button
            type="button"
            onClick={() => setSoloPendientes((v) => !v)}
            style={{ ...control, border: `1px solid ${soloPendientes ? C.blueB : C.border2}`, background: soloPendientes ? C.blueL : "var(--panel-solid)", color: soloPendientes ? C.blue : C.text }}
          >
            {soloPendientes ? "Con pendientes" : "Todos"}
          </button>
          <button type="button" onClick={exportar} disabled={!datos} title="Descargar para Excel"
            style={{ ...control, display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Download size={14} /> Excel
          </button>
          <button type="button" onClick={() => cargar(linea)} disabled={cargando} aria-label="Actualizar" style={control}>
            {cargando ? <LoaderCircle size={14} className="spin" /> : <RotateCcw size={14} />}
          </button>
        </div>
      </div>

      {/* ── Las obras son el filtro: tocar una deja la planilla de ese barco ── */}
      {datos?.obras.length ? (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ color: C.dim, fontSize: 11, fontWeight: 850, textTransform: "uppercase", letterSpacing: 0.4 }}>Obra</span>
          <button type="button" className="planilla-obra-btn" onClick={() => setObraFoco("")}
            style={{ ...control, padding: "5px 10px", fontSize: 12, border: `1px solid ${!obraFoco ? C.blueB : C.border2}`, background: !obraFoco ? C.blueL : "var(--panel-solid)", color: !obraFoco ? C.blue : C.muted }}>
            Todas
          </button>
          {datos.obras.map((o) => (
            <button key={o.id} type="button" className="planilla-obra-btn" onClick={() => setObraFoco(obraFoco === o.id ? "" : o.id)}
              style={{ ...control, padding: "5px 10px", fontSize: 12, border: `1px solid ${obraFoco === o.id ? C.blueB : C.border2}`, background: obraFoco === o.id ? C.blueL : "var(--panel-solid)", color: obraFoco === o.id ? C.blue : C.muted }}>
              {o.codigo}
            </button>
          ))}
          <div style={{ marginLeft: "auto", display: "flex", gap: 11, fontSize: 11, fontWeight: 850 }}>
            <span style={{ color: C.green }}>■ entregado</span>
            <span style={{ color: C.cyan }}>■ en pañol</span>
            <span style={{ color: C.red }}>■ pendiente</span>
          </div>
        </div>
      ) : null}

      {error ? (
        <div style={{ ...panel, borderColor: C.redB, background: C.redL, padding: "11px 14px", fontSize: 12.5, color: C.red, fontWeight: 800 }}>{error}</div>
      ) : null}

      {cargando && !datos ? (
        <div style={{ ...panel, padding: 32, textAlign: "center", color: C.dim, fontSize: 13, fontWeight: 750 }}>
          <LoaderCircle size={20} className="spin" style={{ marginBottom: 8 }} />
          <div>Armando la planilla de {linea}…</div>
        </div>
      ) : !grupos.length ? (
        <div style={{ ...panel, padding: 32, textAlign: "center", color: C.dim, fontSize: 13, fontWeight: 750 }}>
          No hay materiales que coincidan en {linea}.
        </div>
      ) : (
        <div style={{ ...panel, overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 320 + obrasVisibles.length * 62, fontFamily: C.sans }}>
            <thead>
              <tr>
                <th style={{ ...th, ...colFija, textAlign: "left", minWidth: 258, zIndex: 4, paddingLeft: 12 }}>Material</th>
                <th style={{ ...th, minWidth: 62 }} title="Lo que el pañol tiene sin obra asignada. Lo apartado para un barco no entra: está, pero no se puede usar acá.">
                  Pañol
                  <div style={{ fontSize: 9.5, fontWeight: 750, color: C.dim, textTransform: "none", letterSpacing: 0 }}>libre</div>
                </th>
                {obrasVisibles.map((o) => <th key={o.id} style={{ ...th, minWidth: 62 }}>{o.codigo}</th>)}
              </tr>
            </thead>
            <tbody>
              {grupos.flatMap((grupo) => {
                const cerrado = gruposCerrados.has(grupo.nombre);
                const todosPuestos = grupo.filas.every((f) => elegidos.has(f.id));
                const cabecera = (
                  <tr key={`g-${grupo.nombre}`}>
                    <td
                      colSpan={2 + obrasVisibles.length}
                      style={{
                        background: grupo.sinProveedor ? C.redL : "var(--panel-2)",
                        borderTop: `1px solid ${C.border}`,
                        borderBottom: `1px solid ${C.border}`,
                        padding: 0,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 12px" }}>
                        <input
                          type="checkbox"
                          className="planilla-check"
                          checked={todosPuestos}
                          onChange={() => alternarGrupo(grupo)}
                          title="Elegir todo el grupo"
                          style={{ accentColor: C.blue, width: 14, height: 14, cursor: "pointer", flexShrink: 0 }}
                        />
                        <button
                          type="button"
                          onClick={() => alternarCerrado(grupo.nombre)}
                          style={{ flex: 1, textAlign: "left", border: "none", background: "transparent", cursor: "pointer", padding: 0, fontFamily: C.sans }}
                        >
                          <span style={{ color: grupo.sinProveedor ? C.red : C.text, fontSize: 11.5, fontWeight: 900, letterSpacing: 0.3, textTransform: "uppercase" }}>
                            {cerrado ? "▸ " : "▾ "}{grupo.nombre}
                          </span>
                          <span style={{ color: C.dim, fontSize: 11.5, fontWeight: 750, marginLeft: 8 }}>
                            {grupo.filas.length} materiales
                            {grupo.pendientes > 0 ? ` · ${grupo.pendientes} con pendientes` : ""}
                          </span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
                if (cerrado) return [cabecera];
                return [cabecera, ...grupo.filas.map((f) => {
                  const puesto = elegidos.has(f.id);
                  return (
                    <tr
                      key={f.id}
                      className="planilla-fila"
                      onClick={() => alternarFila(f.id)}
                      style={{ borderBottom: `1px solid ${C.border}`, background: puesto ? C.blueL : "transparent", cursor: "pointer" }}
                    >
                      <td className="planilla-celda-fija" style={{ ...colFija, background: puesto ? C.blueL : "var(--panel-solid)", padding: "7px 12px", maxWidth: 268 }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
                          <input
                            type="checkbox"
                            className="planilla-check"
                            checked={puesto}
                            readOnly
                            tabIndex={-1}
                            style={{ accentColor: C.blue, width: 14, height: 14, marginTop: 2, cursor: "pointer", flexShrink: 0 }}
                          />
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ color: C.text, fontSize: 12.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {f.descripcion}
                            </div>
                            <div style={{ color: C.dim, fontSize: 10.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {f.unidad}
                              {agrupar === "rubro" ? (f.proveedor ? ` · ${f.proveedor}` : " · sin proveedor") : ` · ${f.rubro}`}
                            </div>
                          </div>
                          <button
                            type="button"
                            className="planilla-ficha"
                            onClick={(evento) => abrirFicha(evento, f.id)}
                            title="Abrir la ficha en el catálogo maestro (pestaña nueva) para corregirla"
                            aria-label={`Abrir la ficha de ${f.descripcion}`}
                            style={{
                              flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center",
                              width: 24, height: 24, marginTop: -1, borderRadius: 7, cursor: "pointer",
                              border: `1px solid ${C.border2}`, background: "var(--panel-2)", color: C.dim,
                            }}
                          >
                            <SquarePen size={12} />
                          </button>
                        </div>
                      </td>
                      <td
                        style={{ padding: "5px 6px", textAlign: "center" }}
                        title={f.reservado > 0
                          ? `${f.enPanolLibre} libre · ${f.reservado} ya apartado para obras (no se puede usar acá)`
                          : `${f.enPanolLibre} libre en el pañol`}
                      >
                        <div style={{ fontFamily: C.mono, fontSize: 12.5, fontWeight: 800, fontVariantNumeric: "tabular-nums", color: f.enPanolLibre > 0 ? C.text : C.dim }}>
                          {f.enPanolLibre || "—"}
                        </div>
                        {f.reservado > 0 ? (
                          <div style={{ fontFamily: C.mono, fontSize: 9.5, fontWeight: 750, color: C.dim, marginTop: 1, fontVariantNumeric: "tabular-nums" }}>
                            {f.reservado} apart.
                          </div>
                        ) : null}
                      </td>
                      {obrasVisibles.map((o) => {
                        const celda = celdaDeObra(f.porObra[o.id]);
                        if (!celda) return <td key={o.id} style={{ padding: "7px 6px", textAlign: "center", color: C.border2, fontSize: 12 }}>·</td>;
                        const tono = TONOS[celda.tono];
                        const c = f.porObra[o.id];
                        return (
                          <td
                            key={o.id}
                            style={{ padding: "5px 5px", textAlign: "center" }}
                            title={`${o.codigo} · entregado ${c.egresado} · en pañol ${c.enPanol} · pendiente ${c.pendiente}`}
                          >
                            <span style={{
                              display: "inline-block", minWidth: 26,
                              background: tono.fondo, border: `1px solid ${tono.borde}`, color: tono.color,
                              borderRadius: 6, padding: "2px 6px",
                              fontFamily: C.mono, fontSize: 12, fontWeight: 900, fontVariantNumeric: "tabular-nums",
                            }}>
                              {celda.texto}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })];
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Acciones: aparecen solo cuando hay algo tildado ── */}
      {seleccionados.length ? (
        <div style={{
          position: "sticky", bottom: 12, zIndex: 20,
          display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
          background: "var(--topbar-soft)", border: `1px solid ${C.blueB}`, borderRadius: 12,
          padding: "10px 14px", boxShadow: "0 10px 30px rgba(15,23,42,0.18)",
          backdropFilter: "var(--glass-filter)", WebkitBackdropFilter: "var(--glass-filter)",
        }}>
          <Check size={16} color={C.blue} />
          <span style={{ color: C.text, fontSize: 13, fontWeight: 900 }}>
            {seleccionados.length} material{seleccionados.length === 1 ? "" : "es"}
          </span>
          <span style={{ color: C.dim, fontSize: 11.5, fontWeight: 750 }}>
            {obrasVisibles.length === 1 ? `para ${obrasVisibles[0].codigo}` : `en ${linea}`}
          </span>
          <button type="button" onClick={() => setElegidos(new Set())} style={{ ...control, padding: "6px 10px", fontSize: 12, color: C.dim }}>
            Limpiar
          </button>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={copiar} style={{ ...control, display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 850 }}>
              <Copy size={14} /> Copiar
            </button>
            {onPedir ? (
              <button
                type="button"
                onClick={pedir}
                style={{ border: "none", background: C.blue, color: "#fff", borderRadius: 9, padding: "8px 14px", cursor: "pointer", fontFamily: C.sans, fontSize: 12.5, fontWeight: 900, display: "inline-flex", alignItems: "center", gap: 7 }}
              >
                <ShoppingCart size={14} /> Pedir a compras
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
