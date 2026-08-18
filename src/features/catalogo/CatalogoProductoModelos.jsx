import { useEffect, useState } from "react";
import { Ship } from "lucide-react";
import { C } from "@/theme";
import { fetchModelosDeMaterial } from "@/features/catalogo/catalogoModelosApi";

// "¿Qué barcos llevan esto y cuántos?" — dentro de la ficha del producto.
// Es el dato que evita comprar de más: si el K37 lleva 3 y hay cuatro K37 en
// curso, ya sabés que necesitás doce, sin abrir cuatro obras para contarlas.

function fmtQty(value) {
  const n = Number(value || 0);
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
}

// La matriz guarda el modelo como "37" y toda la app lo muestra como "K37".
// Si el dato ya viene con la K, no se la duplicamos.
function modeloLabel(modelo) {
  const texto = String(modelo || "").trim();
  return /^k/i.test(texto) ? texto.toUpperCase() : `K${texto}`;
}

export default function CatalogoProductoModelos({ materialId, unidad = "unidad" }) {
  // El resultado guarda de qué producto es. Mientras no coincida con el que se
  // está mirando, se muestra "cargando": así cambiar de ficha nunca deja a la
  // vista los modelos del producto anterior.
  const [data, setData] = useState({ id: null, rows: [], error: "" });

  useEffect(() => {
    if (!materialId) return undefined;
    let vivo = true;
    fetchModelosDeMaterial(materialId)
      .then((result) => {
        if (vivo) setData({ id: materialId, rows: result.rows, error: "" });
      })
      .catch((err) => {
        if (vivo) setData({ id: materialId, rows: [], error: err?.message || "No se pudieron cargar los modelos." });
      });
    return () => { vivo = false; };
  }, [materialId]);

  if (!materialId) return null;

  const listo = data.id === materialId;
  const estado = !listo ? "cargando" : (data.error ? "error" : "listo");
  const rows = listo ? data.rows : [];
  const error = data.error;

  const total = rows.reduce((sum, row) => sum + Number(row.cantidad || 0), 0);
  const porDefecto = rows.filter((row) => row.via === "predeterminado").length;

  return (
    <section style={{ border: `1px solid ${C.border}`, background: C.panelSolid, borderRadius: 12, overflow: "hidden" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 9, padding: "11px 13px", borderBottom: `1px solid ${C.border}` }}>
        <span style={{ width: 26, height: 26, borderRadius: 8, display: "grid", placeItems: "center", background: C.blueL, border: `1px solid ${C.blueB}`, color: C.blue, flexShrink: 0 }}>
          <Ship size={14} />
        </span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{ display: "block", color: C.text, fontSize: 13, fontWeight: 900 }}>En qué modelos entra</span>
          <span style={{ display: "block", color: C.dim, fontSize: 10.5, marginTop: 1 }}>
            Cuántas unidades lleva cada barco, según la matriz
          </span>
        </span>
        {estado === "listo" && rows.length > 0 && (
          <span style={{ textAlign: "right", flexShrink: 0 }}>
            <span style={{ display: "block", color: C.dim, fontSize: 9, fontWeight: 900, letterSpacing: 0.8, textTransform: "uppercase" }}>Por barco entero</span>
            <span style={{ display: "block", color: C.text, fontFamily: C.mono, fontSize: 15, fontWeight: 950 }}>{fmtQty(total)}</span>
          </span>
        )}
      </header>

      {estado === "cargando" && (
        <div style={{ padding: 16, color: C.dim, fontSize: 12.5 }}>Buscando en las matrices…</div>
      )}

      {estado === "error" && (
        <div style={{ padding: 16, color: C.red, fontSize: 12.5, lineHeight: 1.45 }}>{error}</div>
      )}

      {estado === "listo" && !rows.length && (
        <div style={{ padding: 16, color: C.dim, fontSize: 12.5, lineHeight: 1.45 }}>
          Este producto no figura en la matriz de ningún modelo. Puede ser un consumible,
          un adicional, o puede que falte cargarlo.
        </div>
      )}

      {estado === "listo" && rows.length > 0 && (
        <>
          <div style={{ display: "grid" }}>
            {rows.map((row) => (
              <div
                key={row.modelo}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  alignItems: "baseline",
                  gap: 10,
                  padding: "9px 13px",
                  borderTop: `1px solid ${C.border}`,
                }}
              >
                <span style={{ minWidth: 0 }}>
                  <span style={{ color: C.text, fontSize: 13, fontWeight: 850 }}>{modeloLabel(row.modelo)}</span>
                  {row.via === "predeterminado" && (
                    <span style={{ color: C.dim, fontSize: 10.5, marginLeft: 7 }}>
                      por defecto del requisito
                    </span>
                  )}
                  {row.variantes.length > 0 && (
                    <span style={{ display: "block", color: C.dim, fontSize: 10.5, marginTop: 2 }}>
                      {row.variantes.map((v) => `${v.variante}: ${fmtQty(v.cantidad)}`).join(" · ")}
                    </span>
                  )}
                </span>
                <span style={{ color: C.text, fontFamily: C.mono, fontSize: 13.5, fontWeight: 900, whiteSpace: "nowrap" }}>
                  {fmtQty(row.cantidad)} <span style={{ color: C.dim, fontSize: 11, fontWeight: 700 }}>{unidad}</span>
                </span>
              </div>
            ))}
          </div>

          {porDefecto > 0 && (
            // Aclararlo importa: si alguien eligió otro producto para una obra,
            // ese barco no lo lleva, por más que la matriz lo diga.
            <div style={{ padding: "9px 13px", borderTop: `1px solid ${C.border}`, background: C.panel2, color: C.dim, fontSize: 10.5, lineHeight: 1.45 }}>
              {porDefecto === 1 ? "Un modelo lo lleva" : `${porDefecto} modelos lo llevan`} como producto por
              defecto de un requisito genérico: si en una obra eligieron otro producto, ese barco no lo lleva.
            </div>
          )}
        </>
      )}
    </section>
  );
}
