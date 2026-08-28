import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, LoaderCircle, RotateCcw, Search, Table2 } from "lucide-react";
import { C } from "@/theme";
import { useToast } from "@/components/ui/Toast";
import { calcularPlanillaDeLinea } from "@/features/compras/planillaObrasApi";

/**
 * La planilla de una linea: materiales en las filas, obras en las columnas.
 *
 * En cada cruce, las tres cosas que hoy hay que ir a buscar de a una: que ya se
 * entrego a ese barco, que sigue esperando, y si el pañol lo tiene guardado.
 *
 * Agrupado por rubro o por proveedor segun para que se este mirando: por rubro
 * cuando se revisa una etapa de la obra, por proveedor cuando se va a comprar.
 */

const AGRUPACIONES = [
  { valor: "rubro", etiqueta: "Por rubro" },
  { valor: "proveedor", etiqueta: "Por proveedor" },
];

/** Que mostrar en el cruce. Se prioriza lo entregado, que es lo que ya es un hecho. */
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

export default function PlanillaObrasPanel({ isMobile = false }) {
  const toast = useToast();
  const [linea, setLinea] = useState("K37");
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [agrupar, setAgrupar] = useState("rubro");
  const [soloPendientes, setSoloPendientes] = useState(false);

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

  const grupos = useMemo(() => {
    if (!datos) return [];
    const q = busqueda.trim().toLowerCase();
    const filtradas = datos.filas.filter((f) => {
      if (soloPendientes && !(f.totales.pendiente > 0)) return false;
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
      }))
      .sort((a, b) => {
        // "Sin proveedor" al final: son los que no se pueden pedir.
        if ((a.nombre === "Sin proveedor") !== (b.nombre === "Sin proveedor")) {
          return a.nombre === "Sin proveedor" ? 1 : -1;
        }
        return a.nombre.localeCompare(b.nombre);
      });
  }, [datos, busqueda, agrupar, soloPendientes]);

  function exportar() {
    if (!datos) return;
    const obras = datos.obras;
    const cabecera = [
      agrupar === "rubro" ? "Rubro" : "Proveedor",
      "Material", "Código", "Unidad", "En pañol",
      ...obras.flatMap((o) => [`${o.codigo} entregado`, `${o.codigo} en pañol`, `${o.codigo} pendiente`]),
    ];
    const filas = grupos.flatMap((g) => g.filas.map((f) => [
      g.nombre, f.descripcion, f.codigo, f.unidad, f.enPanolGeneral,
      ...obras.flatMap((o) => {
        const c = f.porObra[o.id];
        return [c?.egresado ?? "", c?.enPanol ?? "", c?.pendiente ?? ""];
      }),
    ]));
    // Punto y coma y BOM: es lo que Excel en español abre sin preguntar nada.
    const csv = [cabecera, ...filas]
      .map((fila) => fila.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";"))
      .join("\r\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `Planilla_${datos.linea}_${new Date().toLocaleDateString("es-AR").replace(/\//g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success(`${filas.length} materiales exportados.`);
  }

  const tarjeta = { background: C.panelSolid, border: `1px solid ${C.border}`, borderRadius: 12 };
  const th = {
    position: "sticky", top: 0, zIndex: 3, background: C.panelSolid,
    textAlign: "center", fontSize: 10.5, fontWeight: 900, letterSpacing: 0.4, textTransform: "uppercase",
    color: C.dim, padding: "9px 6px", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap",
  };
  const primeraCol = {
    position: "sticky", left: 0, zIndex: 2, background: C.panelSolid,
    borderRight: `1px solid ${C.border}`,
  };

  return (
    <div style={{ display: "grid", gap: 14, padding: isMobile ? 12 : 0, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <Table2 size={18} color={C.blue} />
        <div style={{ flex: 1, minWidth: 190 }}>
          <div style={{ color: C.text, fontSize: 16, fontWeight: 950 }}>Planilla por obra</div>
          <div style={{ color: C.dim, fontSize: 12, fontWeight: 700 }}>
            Cada barco de la línea, con lo entregado, lo pendiente y lo que hay en pañol.
          </div>
        </div>
        <select
          value={linea}
          onChange={(e) => setLinea(e.target.value)}
          style={{ border: `1px solid ${C.blueB}`, background: C.blueL, color: C.blue, borderRadius: 9, padding: "8px 11px", fontFamily: C.sans, fontSize: 13, fontWeight: 900, outline: "none" }}
        >
          {(datos?.lineasDisponibles ?? [linea]).map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <div style={{ display: "flex", alignItems: "center", gap: 7, border: `1px solid ${C.border2}`, background: C.panelSolid, borderRadius: 9, padding: "7px 10px", minWidth: isMobile ? "100%" : 200 }}>
          <Search size={14} color={C.dim} />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Material, rubro…"
            style={{ flex: 1, border: "none", background: "transparent", color: C.text, outline: "none", fontFamily: C.sans, fontSize: 12.5, fontWeight: 700, minWidth: 0 }}
          />
        </div>
        <select
          value={agrupar}
          onChange={(e) => setAgrupar(e.target.value)}
          style={{ border: `1px solid ${C.border2}`, background: C.panelSolid, color: C.text, borderRadius: 9, padding: "8px 10px", fontFamily: C.sans, fontSize: 12.5, fontWeight: 800, outline: "none" }}
        >
          {AGRUPACIONES.map((a) => <option key={a.valor} value={a.valor}>{a.etiqueta}</option>)}
        </select>
        <button
          type="button"
          onClick={() => setSoloPendientes((v) => !v)}
          style={{ border: `1px solid ${soloPendientes ? C.blueB : C.border2}`, background: soloPendientes ? C.blueL : C.panelSolid, color: soloPendientes ? C.blue : C.text, borderRadius: 9, padding: "8px 11px", cursor: "pointer", fontFamily: C.sans, fontSize: 12.5, fontWeight: 850 }}
        >
          {soloPendientes ? "Con pendientes" : "Todos"}
        </button>
        <button
          type="button"
          onClick={exportar}
          disabled={!datos}
          title="Descargar como CSV para abrir en Excel"
          style={{ border: `1px solid ${C.border2}`, background: C.panelSolid, color: C.text, borderRadius: 9, padding: "8px 11px", cursor: datos ? "pointer" : "default", display: "inline-flex", alignItems: "center", gap: 6, fontFamily: C.sans, fontSize: 12.5, fontWeight: 850 }}
        >
          <Download size={14} /> Excel
        </button>
        <button
          type="button"
          onClick={() => cargar(linea)}
          disabled={cargando}
          style={{ border: `1px solid ${C.border2}`, background: C.panelSolid, color: C.text, borderRadius: 9, padding: "8px 11px", cursor: cargando ? "default" : "pointer" }}
        >
          {cargando ? <LoaderCircle size={14} className="spin" /> : <RotateCcw size={14} />}
        </button>
      </div>

      {datos ? (
        <div style={{ ...tarjeta, padding: "11px 14px", display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
          <div><span style={{ color: C.text, fontSize: 18, fontWeight: 950, fontFamily: C.mono }}>{datos.resumen.materiales}</span>
            <span style={{ color: C.muted, fontSize: 12.5, fontWeight: 750, marginLeft: 6 }}>materiales</span></div>
          <div><span style={{ color: C.text, fontSize: 18, fontWeight: 950, fontFamily: C.mono }}>{datos.resumen.obras}</span>
            <span style={{ color: C.muted, fontSize: 12.5, fontWeight: 750, marginLeft: 6 }}>obras en curso</span></div>
          <div><span style={{ color: C.red, fontSize: 18, fontWeight: 950, fontFamily: C.mono }}>{datos.resumen.conPendiente}</span>
            <span style={{ color: C.muted, fontSize: 12.5, fontWeight: 750, marginLeft: 6 }}>con algo pendiente</span></div>
          {datos.resumen.sinProveedor > 0 ? (
            <div><span style={{ color: C.red, fontSize: 18, fontWeight: 950, fontFamily: C.mono }}>{datos.resumen.sinProveedor}</span>
              <span style={{ color: C.muted, fontSize: 12.5, fontWeight: 750, marginLeft: 6 }}>sin proveedor</span></div>
          ) : null}
          <div style={{ marginLeft: "auto", display: "flex", gap: 12, fontSize: 11, fontWeight: 800 }}>
            <span style={{ color: C.green }}>■ entregado</span>
            <span style={{ color: C.cyan }}>■ en pañol</span>
            <span style={{ color: C.red }}>■ pendiente</span>
          </div>
        </div>
      ) : null}

      {error ? (
        <div style={{ ...tarjeta, borderColor: C.redB, background: C.redL, padding: "11px 14px", fontSize: 12.5, color: C.red, fontWeight: 800 }}>{error}</div>
      ) : null}

      {cargando && !datos ? (
        <div style={{ ...tarjeta, padding: 30, textAlign: "center", color: C.dim, fontSize: 13, fontWeight: 750 }}>
          <LoaderCircle size={20} className="spin" style={{ marginBottom: 8 }} />
          <div>Armando la planilla de {linea}…</div>
        </div>
      ) : !grupos.length ? (
        <div style={{ ...tarjeta, padding: 30, textAlign: "center", color: C.dim, fontSize: 13, fontWeight: 750 }}>
          No hay materiales que coincidan en {linea}.
        </div>
      ) : (
        <div style={{ ...tarjeta, overflowX: "auto", position: "relative" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 340 + (datos?.obras.length || 0) * 62, fontFamily: C.sans }}>
            <thead>
              <tr>
                <th style={{ ...th, ...primeraCol, textAlign: "left", minWidth: 250, zIndex: 4 }}>Material</th>
                <th style={{ ...th, minWidth: 54 }}>Pañol</th>
                {(datos?.obras ?? []).map((o) => (
                  <th key={o.id} style={{ ...th, minWidth: 62 }}>{o.codigo}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grupos.map((grupo) => (
                <>
                  <tr key={`g-${grupo.nombre}`}>
                    <td
                      colSpan={2 + (datos?.obras.length || 0)}
                      style={{
                        background: grupo.nombre === "Sin proveedor" ? C.redL : C.panel2,
                        borderTop: `1px solid ${C.border}`,
                        borderBottom: `1px solid ${C.border}`,
                        padding: "7px 12px",
                        color: grupo.nombre === "Sin proveedor" ? C.red : C.text,
                        fontSize: 11.5,
                        fontWeight: 900,
                        letterSpacing: 0.3,
                        textTransform: "uppercase",
                      }}
                    >
                      {grupo.nombre}
                      <span style={{ color: C.dim, fontWeight: 750, textTransform: "none", letterSpacing: 0, marginLeft: 8 }}>
                        {grupo.filas.length} materiales
                        {grupo.pendientes > 0 ? ` · ${grupo.pendientes} con pendientes` : ""}
                      </span>
                    </td>
                  </tr>
                  {grupo.filas.map((f) => (
                    <tr key={f.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ ...primeraCol, padding: "8px 12px", maxWidth: 260 }}>
                        <div style={{ color: C.text, fontSize: 12.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {f.descripcion}
                        </div>
                        <div style={{ color: C.dim, fontSize: 10.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {f.unidad}
                          {agrupar === "rubro" && f.proveedor ? ` · ${f.proveedor}` : ""}
                          {agrupar === "proveedor" ? ` · ${f.rubro}` : ""}
                        </div>
                      </td>
                      <td style={{ padding: "8px 6px", textAlign: "center", fontFamily: C.mono, fontSize: 12.5, fontWeight: 800, color: f.enPanolGeneral > 0 ? C.muted : C.dim }}>
                        {f.enPanolGeneral || "—"}
                      </td>
                      {(datos?.obras ?? []).map((o) => {
                        const celda = celdaDeObra(f.porObra[o.id]);
                        if (!celda) {
                          return <td key={o.id} style={{ padding: "8px 6px", textAlign: "center", color: C.border2, fontSize: 12 }}>·</td>;
                        }
                        const tono = TONOS[celda.tono];
                        return (
                          <td key={o.id} style={{ padding: "6px 5px", textAlign: "center" }}>
                            <span style={{
                              display: "inline-block", minWidth: 26,
                              background: tono.fondo, border: `1px solid ${tono.borde}`, color: tono.color,
                              borderRadius: 6, padding: "2px 6px",
                              fontFamily: C.mono, fontSize: 12, fontWeight: 900,
                            }}>
                              {celda.texto}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
