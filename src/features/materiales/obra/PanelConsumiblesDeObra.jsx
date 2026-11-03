import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Package } from "lucide-react";
import { C } from "@/theme";
import { agruparConsumidos } from "./consumiblesDeObra.js";
import { fetchConsumiblesDeObra } from "./consumiblesDeObraApi.js";

const numberStyle = { fontFamily: C.mono, fontVariantNumeric: "tabular-nums", textAlign: "right", whiteSpace: "nowrap" };

function fmtCantidad(value) {
  return Number(value || 0).toLocaleString("es-AR", { maximumFractionDigits: 2 });
}

function fmtFecha(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

/**
 * Apartado plegable con lo que se retiró de Consumibles para la obra. Los
 * consumibles no van en la lista del barco: acá sólo se consulta lo consumido.
 */
export default function PanelConsumiblesDeObra({ obraId, obraLabel = "" }) {
  const [abierto, setAbierto] = useState(false);
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");

  // Quien lo usa le pone key={obraId}: al cambiar de obra se monta de nuevo y
  // arranca vacío, sin arrastrar los datos de la anterior.
  useEffect(() => {
    let vivo = true;
    fetchConsumiblesDeObra(obraId)
      .then((res) => { if (vivo) setDatos(res); })
      .catch((err) => { if (vivo) setError(err?.message || "No se pudieron cargar los consumibles."); });
    return () => { vivo = false; };
  }, [obraId]);

  const items = useMemo(() => (datos ? agruparConsumidos(datos) : []), [datos]);
  const visibles = useMemo(() => {
    const term = q.trim().toLowerCase();
    return term ? items.filter((item) => item.descripcion.toLowerCase().includes(term)) : items;
  }, [items, q]);
  const retiros = items.reduce((sum, item) => sum + item.retiros, 0);

  const resumen = error
    ? "No se pudieron cargar"
    : !datos
      ? "Cargando…"
      : items.length
        ? `${items.length} ${items.length === 1 ? "producto" : "productos"} · ${retiros} ${retiros === 1 ? "retiro" : "retiros"}`
        : "Sin retiros";

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, background: C.panel, minWidth: 0 }}>
      <button
        type="button"
        aria-expanded={abierto}
        onClick={() => setAbierto(!abierto)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, border: 0, background: "transparent", color: C.text, padding: "7px 9px", cursor: "pointer", fontFamily: C.sans, fontSize: 12, textAlign: "left" }}
      >
        {abierto ? <ChevronDown size={14} color={C.muted} /> : <ChevronRight size={14} color={C.muted} />}
        <Package size={13} color={C.cyan} />
        <span style={{ fontWeight: 650 }}>Consumibles consumidos</span>
        <span style={{ color: error ? C.red : C.muted }}>{resumen}</span>
        <span style={{ marginLeft: "auto", color: C.muted, fontSize: 11 }}>Fuera de la lista del barco</span>
      </button>
      {abierto && (
        <div style={{ borderTop: `1px solid ${C.border}`, padding: "8px 9px", display: "grid", gap: 8 }}>
          {error && <div role="alert" style={{ fontSize: 12, color: C.red }}>{error}</div>}
          {!error && datos && !items.length && (
            <div style={{ fontSize: 12, color: C.muted }}>No hay retiros de consumibles cargados para {obraLabel || "esta obra"}.</div>
          )}
          {!!items.length && (
            <>
              <input
                id={`consumibles-obra-${obraId}`}
                type="search"
                value={q}
                onChange={(event) => setQ(event.target.value)}
                placeholder="Buscar consumible"
                aria-label="Buscar consumible"
                style={{ width: "100%", maxWidth: 320, boxSizing: "border-box", border: `1px solid ${C.border}`, borderRadius: 6, background: C.panelSolid, color: C.text, padding: "6px 9px", fontFamily: C.sans, fontSize: 12 }}
              />
              <div style={{ overflowX: "auto", maxHeight: 340, overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ color: C.muted, fontSize: 10.5, textTransform: "uppercase", letterSpacing: 0.5 }}>
                      <th style={{ textAlign: "left", fontWeight: 600, padding: "4px 6px" }}>Producto</th>
                      <th style={{ ...numberStyle, fontWeight: 600, padding: "4px 6px" }}>Cantidad</th>
                      <th style={{ ...numberStyle, fontWeight: 600, padding: "4px 6px" }}>Retiros</th>
                      <th style={{ ...numberStyle, fontWeight: 600, padding: "4px 6px" }}>Último</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibles.map((item) => (
                      <tr key={item.key} style={{ borderTop: `1px solid ${C.border}` }}>
                        <td style={{ padding: "5px 6px", color: C.text, minWidth: 160 }}>{item.descripcion || "Sin descripción"}</td>
                        <td style={{ ...numberStyle, padding: "5px 6px", color: C.text }}>{fmtCantidad(item.cantidad)} <span style={{ color: C.muted, fontFamily: C.sans }}>{item.unidad}</span></td>
                        <td style={{ ...numberStyle, padding: "5px 6px", color: C.muted }}>{item.retiros}</td>
                        <td style={{ ...numberStyle, padding: "5px 6px", color: C.muted }}>{fmtFecha(item.ultimo)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <a href="/consumibles?tab=movimientos" style={{ fontSize: 11.5, color: C.blue, textDecoration: "none" }}>Ver el detalle en Consumibles → Movimientos</a>
            </>
          )}
        </div>
      )}
    </div>
  );
}
