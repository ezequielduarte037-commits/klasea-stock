import { useCallback, useEffect, useMemo, useState } from "react";
import { Info, LoaderCircle, RotateCcw, Ship } from "lucide-react";
import Cargando from "@/components/ui/Cargando";
import { calcularMatrizDeLineas } from "@/features/compras/matrizLineasApi";
import { Aviso, Buscar, Cabecera } from "./ui";

/**
 * Que lleva cada linea de produccion, deducido del consumo real.
 *
 * Es la matriz que se intento armar con las etapas de compra y quedo en 7 filas:
 * nadie la va a cargar a mano. Pero cada egreso del pañol esta atado a una obra
 * y cada obra a su linea, asi que la matriz ya estaba escrita sin que nadie la
 * escribiera.
 *
 * La celda dice CUANTO LLEVA CADA BARCO. Debajo, en chico, cuantas obras de esa
 * linea ya lo consumieron: 5/5 es una certeza, 1/11 puede ser una excepcion o
 * puede ser que las otras diez todavia no llegaron a esa etapa. Ese numero es lo
 * que evita tomar el promedio como si fuera una ficha tecnica.
 */

/** Verde cuando ya lo confirmaron casi todas las obras; apagado cuando es un caso suelto. */
function claseDeCobertura(cobertura) {
  if (cobertura >= 0.75) return "segura";
  if (cobertura >= 0.4) return "";
  return "suelta";
}

export default function MatrizLineasPanel() {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [lineaFiltro, setLineaFiltro] = useState("");
  const [soloFaltantes, setSoloFaltantes] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setDatos(await calcularMatrizDeLineas());
      setError("");
    } catch (e) {
      setError(e.message || "No se pudo armar la matriz.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => { void cargar(); }, 0);
    return () => window.clearTimeout(t);
  }, [cargar]);

  const columnas = useMemo(() => {
    if (!datos) return [];
    return lineaFiltro ? datos.lineas.filter((l) => l.nombre === lineaFiltro) : datos.lineas;
  }, [datos, lineaFiltro]);

  const filas = useMemo(() => {
    if (!datos) return [];
    const q = busqueda.trim().toLowerCase();
    return datos.filas.filter((f) => {
      if (lineaFiltro && !f.porLinea[lineaFiltro]) return false;
      if (soloFaltantes && !(f.faltan > 0)) return false;
      if (!q) return true;
      return [f.descripcion, f.codigo, f.proveedor].some((c) => String(c || "").toLowerCase().includes(q));
    });
  }, [datos, busqueda, lineaFiltro, soloFaltantes]);

  const r = datos?.resumen;

  return (
    <>
      <Cabecera
        eyebrow="Compras · Planificar"
        titulo="Matriz por"
        acento="línea"
        sub={r ? (
          <>
            <b className="mono">{r.materiales}</b> materiales · <b className="mono t" data-tono="azul">{r.compartidos}</b> van a más de una línea
            {" "}· armada con {r.egresosUsados} egresos con obra asignada
          </>
        ) : "Qué lleva cada modelo, deducido de lo que realmente salió del pañol para cada barco."}
        acciones={(
          <button type="button" className="cmp-btn-ic" onClick={() => { setCargando(true); void cargar(); }} disabled={cargando} title="Volver a calcular" aria-label="Volver a calcular">
            {cargando ? <LoaderCircle size={15} className="spin" /> : <RotateCcw size={15} />}
          </button>
        )}
      />

      <div className="cmp-filtros">
        <Buscar value={busqueda} onChange={setBusqueda} placeholder="Material o proveedor…" />
        <select className="ui-input" style={{ width: "auto", minHeight: 36 }} value={lineaFiltro} onChange={(e) => setLineaFiltro(e.target.value)} aria-label="Línea">
          <option value="">Todas las líneas</option>
          {(datos?.lineas ?? []).map((l) => <option key={l.nombre} value={l.nombre}>{l.nombre}</option>)}
        </select>
        <div className="cmp-seg" role="radiogroup" aria-label="Qué materiales">
          <button type="button" role="radio" aria-checked={!soloFaltantes} className={!soloFaltantes ? "on" : ""} onClick={() => setSoloFaltantes(false)}>Todos</button>
          <button type="button" role="radio" aria-checked={soloFaltantes} className={soloFaltantes ? "on" : ""} onClick={() => setSoloFaltantes(true)}>Con faltante</button>
        </div>
      </div>

      {/* Qué significa "faltan": es una proyección sobre todas las obras en curso,
          no una orden de compra. Sin decirlo, un número como 600 asusta o engaña. */}
      <Aviso tono="cian" icono={Info}>
        <b>Cómo leerla.</b> La celda es cuánto lleva <b>cada barco</b>, y abajo cuántas obras de esa línea ya lo consumieron:
        {" "}<b>5/5 es una certeza, 1/11 puede ser una excepción</b>. «Faltan» proyecta sobre <b>todas las obras en curso</b>:
        es un horizonte, no un pedido. Para lo de esta semana está «Qué comprar».
      </Aviso>

      {error && <Aviso tono="rojo">{error}</Aviso>}

      {cargando && !datos ? (
        <Cargando texto="Cruzando egresos con obras y líneas…" />
      ) : (
        <div className="cmp-tabla">
          <table className="cmp-t" style={{ minWidth: 520 + columnas.length * 78 }}>
            <thead>
              <tr>
                <th style={{ minWidth: 230 }}>Material</th>
                <th style={{ minWidth: 110 }}>Proveedor</th>
                {columnas.map((l) => (
                  <th key={l.nombre} className="centro" style={{ minWidth: 78 }}>
                    <span className="cmp-matriz-linea"><Ship size={11} /> {l.nombre}</span>
                    <span className="cmp-matriz-sub">{l.activas} en curso</span>
                  </th>
                ))}
                <th className="der" style={{ minWidth: 60 }}>Hay</th>
                <th className="der" style={{ minWidth: 72 }}>Faltan</th>
              </tr>
            </thead>
            <tbody>
              {filas.slice(0, 300).map((f) => (
                <tr key={f.id}>
                  <td>
                    <div className="nom" style={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.descripcion}</div>
                    <div className="chico">
                      {f.unidad}
                      {f.lineasQueLoUsan > 1 ? ` · ${f.lineasQueLoUsan} líneas` : ""}
                      {f.esConsumible ? " · consumible" : ""}
                    </div>
                  </td>
                  <td style={{ whiteSpace: "nowrap", color: f.proveedor ? "var(--muted)" : "var(--red)", fontSize: 12.5, fontWeight: 600 }}>{f.proveedor || "sin asignar"}</td>
                  {columnas.map((l) => {
                    const celda = f.porLinea[l.nombre];
                    if (!celda) return <td key={l.nombre} className="centro" style={{ color: "var(--border-3)" }}>·</td>;
                    return (
                      <td key={l.nombre} className={`centro cmp-matriz-celda ${claseDeCobertura(celda.cobertura)}`}>
                        <b>{celda.porBarco}</b>
                        <small>{celda.obrasQueLoUsaron}/{celda.obrasDeLaLinea}</small>
                      </td>
                    );
                  })}
                  <td className="der mono" style={{ color: "var(--muted)" }}>{f.hay}</td>
                  <td className="der mono" style={{ fontWeight: 650, color: f.faltan > 0 ? "var(--red)" : "var(--subtle)" }}>{f.faltan > 0 ? f.faltan : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filas.length > 300 && (
            <p className="cmp-ayuda" style={{ padding: "10px 14px", borderTop: "1px solid var(--border)" }}>
              Se muestran los primeros 300 de {filas.length}. Filtrá por línea o buscá para acotar.
            </p>
          )}
        </div>
      )}
    </>
  );
}
