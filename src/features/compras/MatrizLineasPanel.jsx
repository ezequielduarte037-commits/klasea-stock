import { useCallback, useEffect, useMemo, useState } from "react";
import { Grid3x3, LoaderCircle, RotateCcw, Search, Ship } from "lucide-react";
import { C } from "@/theme";
import { calcularMatrizDeLineas } from "@/features/compras/matrizLineasApi";

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

/** Verde cuando ya lo confirmaron casi todas las obras; gris cuando es un caso suelto. */
function tonoDeCobertura(cobertura) {
  if (cobertura >= 0.75) return { color: C.green, peso: 900 };
  if (cobertura >= 0.4) return { color: C.text, peso: 850 };
  return { color: C.dim, peso: 750 };
}

export default function MatrizLineasPanel({ isMobile = false }) {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [lineaFiltro, setLineaFiltro] = useState("");
  const [soloFaltantes, setSoloFaltantes] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      setDatos(await calcularMatrizDeLineas());
      setError("");
    } catch (e) {
      setError(e.message || "No se pudo armar la matriz.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

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

  const tarjeta = { background: C.panelSolid, border: `1px solid ${C.border}`, borderRadius: 12 };
  const th = {
    position: "sticky", top: 0, background: C.panelSolid, zIndex: 2,
    textAlign: "left", fontSize: 10.5, fontWeight: 900, letterSpacing: 0.5, textTransform: "uppercase",
    color: C.dim, padding: "10px 10px", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap",
  };

  return (
    <div style={{ display: "grid", gap: 14, padding: isMobile ? 12 : 0, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <Grid3x3 size={18} color={C.blue} />
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ color: C.text, fontSize: 16, fontWeight: 950 }}>Matriz por línea</div>
          <div style={{ color: C.dim, fontSize: 12, fontWeight: 700 }}>
            Qué lleva cada modelo, deducido de lo que realmente salió del pañol para cada barco.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, border: `1px solid ${C.border2}`, background: C.panelSolid, borderRadius: 9, padding: "7px 10px", minWidth: isMobile ? "100%" : 220 }}>
          <Search size={14} color={C.dim} />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Material o proveedor…"
            style={{ flex: 1, border: "none", background: "transparent", color: C.text, outline: "none", fontFamily: C.sans, fontSize: 12.5, fontWeight: 700, minWidth: 0 }}
          />
        </div>
        <select
          value={lineaFiltro}
          onChange={(e) => setLineaFiltro(e.target.value)}
          style={{ border: `1px solid ${C.border2}`, background: C.panelSolid, color: C.text, borderRadius: 9, padding: "8px 10px", fontFamily: C.sans, fontSize: 12.5, fontWeight: 800, outline: "none" }}
        >
          <option value="">Todas las líneas</option>
          {(datos?.lineas ?? []).map((l) => <option key={l.nombre} value={l.nombre}>{l.nombre}</option>)}
        </select>
        <button
          type="button"
          onClick={() => setSoloFaltantes((v) => !v)}
          style={{ border: `1px solid ${soloFaltantes ? C.blueB : C.border2}`, background: soloFaltantes ? C.blueL : C.panelSolid, color: soloFaltantes ? C.blue : C.text, borderRadius: 9, padding: "8px 11px", cursor: "pointer", fontFamily: C.sans, fontSize: 12.5, fontWeight: 850 }}
        >
          {soloFaltantes ? "Con faltante" : "Todos"}
        </button>
        <button
          type="button"
          onClick={cargar}
          disabled={cargando}
          style={{ border: `1px solid ${C.border2}`, background: C.panelSolid, color: C.text, borderRadius: 9, padding: "8px 11px", cursor: cargando ? "default" : "pointer" }}
        >
          {cargando ? <LoaderCircle size={14} className="spin" /> : <RotateCcw size={14} />}
        </button>
      </div>

      {datos ? (
        <div style={{ ...tarjeta, padding: "11px 14px", display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <span style={{ color: C.text, fontSize: 19, fontWeight: 950, fontFamily: C.mono }}>{datos.resumen.materiales}</span>
            <span style={{ color: C.muted, fontSize: 12.5, fontWeight: 750, marginLeft: 7 }}>materiales en la matriz</span>
          </div>
          <div>
            <span style={{ color: C.blue, fontSize: 19, fontWeight: 950, fontFamily: C.mono }}>{datos.resumen.compartidos}</span>
            <span style={{ color: C.muted, fontSize: 12.5, fontWeight: 750, marginLeft: 7 }}>van a más de una línea</span>
          </div>
          <div style={{ marginLeft: "auto", color: C.dim, fontSize: 11.5, fontWeight: 700 }}>
            Armada con {datos.resumen.egresosUsados} egresos con obra asignada
          </div>
        </div>
      ) : null}

      {/* Que significa "faltan": es una proyeccion sobre todas las obras en curso,
          no una orden de compra. Sin decirlo, un numero como 600 asusta o enganha. */}
      <div style={{ ...tarjeta, background: C.cyanL, borderColor: C.cyanB, padding: "10px 14px", fontSize: 12, color: C.muted, fontWeight: 750, lineHeight: 1.5 }}>
        <b style={{ color: C.text }}>Cómo leerla.</b> La celda es cuánto lleva <b>cada barco</b>, y abajo
        cuántas obras de esa línea ya lo consumieron — <b>5/5 es una certeza, 1/11 puede ser una excepción</b>.
        La columna «faltan» proyecta sobre <b>todas las obras en curso</b>, así que es un horizonte, no un pedido:
        para saber qué comprar esta semana está la pestaña «Qué comprar».
      </div>

      {error ? (
        <div style={{ ...tarjeta, borderColor: C.redB, background: C.redL, padding: "11px 14px", fontSize: 12.5, color: C.red, fontWeight: 800 }}>{error}</div>
      ) : null}

      {cargando && !datos ? (
        <div style={{ ...tarjeta, padding: 30, textAlign: "center", color: C.dim, fontSize: 13, fontWeight: 750 }}>
          <LoaderCircle size={20} className="spin" style={{ marginBottom: 8 }} />
          <div>Cruzando egresos con obras y líneas…</div>
        </div>
      ) : (
        <div style={{ ...tarjeta, overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 520 + columnas.length * 78, fontFamily: C.sans }}>
            <thead>
              <tr>
                <th style={{ ...th, minWidth: 230 }}>Material</th>
                <th style={{ ...th, minWidth: 110 }}>Proveedor</th>
                {columnas.map((l) => (
                  <th key={l.nombre} style={{ ...th, textAlign: "center", minWidth: 78 }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: C.text, fontSize: 11.5 }}>
                        <Ship size={11} /> {l.nombre}
                      </span>
                      <span style={{ fontSize: 9.5, color: C.dim, fontWeight: 700, textTransform: "none", letterSpacing: 0 }}>
                        {l.activas} en curso
                      </span>
                    </div>
                  </th>
                ))}
                <th style={{ ...th, textAlign: "right", minWidth: 60 }}>Hay</th>
                <th style={{ ...th, textAlign: "right", minWidth: 72 }}>Faltan</th>
              </tr>
            </thead>
            <tbody>
              {filas.slice(0, 300).map((f, i) => (
                <tr key={f.id} style={{ borderTop: i === 0 ? "none" : `1px solid ${C.border}` }}>
                  <td style={{ padding: "9px 10px", minWidth: 0 }}>
                    <div style={{ color: C.text, fontSize: 12.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 260 }}>
                      {f.descripcion}
                    </div>
                    <div style={{ color: C.dim, fontSize: 10.5, fontWeight: 700 }}>
                      {f.unidad}
                      {f.lineasQueLoUsan > 1 ? ` · ${f.lineasQueLoUsan} líneas` : ""}
                      {f.esConsumible ? " · consumible" : ""}
                    </div>
                  </td>
                  <td style={{ padding: "9px 10px", color: f.proveedor ? C.muted : C.red, fontSize: 11.5, fontWeight: 750, whiteSpace: "nowrap" }}>
                    {f.proveedor || "sin asignar"}
                  </td>
                  {columnas.map((l) => {
                    const celda = f.porLinea[l.nombre];
                    if (!celda) {
                      return <td key={l.nombre} style={{ padding: "9px 6px", textAlign: "center", color: C.border2, fontSize: 13 }}>·</td>;
                    }
                    const tono = tonoDeCobertura(celda.cobertura);
                    return (
                      <td key={l.nombre} style={{ padding: "9px 6px", textAlign: "center" }}>
                        <div style={{ color: tono.color, fontSize: 13, fontWeight: tono.peso, fontFamily: C.mono }}>
                          {celda.porBarco}
                        </div>
                        <div style={{ color: C.dim, fontSize: 9.5, fontWeight: 700 }}>
                          {celda.obrasQueLoUsaron}/{celda.obrasDeLaLinea}
                        </div>
                      </td>
                    );
                  })}
                  <td style={{ padding: "9px 10px", textAlign: "right", color: C.muted, fontSize: 12.5, fontWeight: 800, fontFamily: C.mono }}>
                    {f.hay}
                  </td>
                  <td style={{ padding: "9px 10px", textAlign: "right", fontFamily: C.mono, fontSize: 12.5, fontWeight: 900, color: f.faltan > 0 ? C.red : C.dim }}>
                    {f.faltan > 0 ? f.faltan : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filas.length > 300 ? (
            <div style={{ padding: "10px 14px", color: C.dim, fontSize: 11.5, fontWeight: 700, borderTop: `1px solid ${C.border}` }}>
              Se muestran los primeros 300 de {filas.length}. Filtrá por línea o buscá para acotar.
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
