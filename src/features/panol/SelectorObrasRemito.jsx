import { Ship, X } from "lucide-react";
import { C } from "@/theme";

function idsUnicos(ids) {
  return [...new Set((ids || []).map(String).filter(Boolean))];
}
/**
 * Selector compacto de obras para un remito documental.
 *
 * Se usa antes de escanear y tambien al reclasificar un PDF ya guardado. No
 * representa cantidades ni destinos de stock: solamente decide en que carpetas
 * virtuales se encuentra el mismo documento.
 */
export default function SelectorObrasRemito({ obras = [], value = [], onChange, disabled = false }) {
  const elegidas = idsUnicos(value);
  const elegidasSet = new Set(elegidas);
  const obrasPorId = new Map(obras.map((obra) => [String(obra.id), obra]));
  const disponibles = obras.filter((obra) => !elegidasSet.has(String(obra.id)));

  const porLinea = new Map();
  for (const obra of disponibles) {
    if (obra?.estado === "entregada" || obra?.estado === "cancelada") continue;
    const linea = String(obra.linea_nombre || "").trim() || "Sin línea";
    porLinea.set(linea, [...(porLinea.get(linea) || []), obra]);
  }
  const grupos = [...porLinea.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  function agregar(id) {
    if (!id || elegidasSet.has(String(id))) return;
    onChange?.([...elegidas, String(id)]);
  }

  function quitar(id) {
    onChange?.(elegidas.filter((actual) => actual !== String(id)));
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <select
        value=""
        onChange={(event) => agregar(event.target.value)}
        disabled={disabled || disponibles.length === 0}
        aria-label="Agregar obra al remito"
        style={{
          width: "100%",
          border: `1px solid ${elegidas.length ? C.blueB : C.border2}`,
          background: C.panelSolid,
          color: C.text,
          borderRadius: 9,
          padding: "9px 11px",
          fontFamily: C.sans,
          fontSize: 13,
          fontWeight: 750,
          outline: "none",
          cursor: disabled ? "default" : "pointer",
        }}
      >
        <option value="">
          {disponibles.length ? "+ Agregar una obra" : elegidas.length ? "Todas las obras disponibles agregadas" : "Sin obras disponibles"}
        </option>
        {grupos.map(([linea, lista]) => (
          <optgroup key={linea} label={linea}>
            {lista.map((obra) => (
              <option key={obra.id} value={String(obra.id)}>{obra.codigo}</option>
            ))}
          </optgroup>
        ))}
      </select>

      {elegidas.length ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {elegidas.map((id) => {
            const obra = obrasPorId.get(id);
            return (
              <span
                key={id}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  border: `1px solid ${C.blueB}`,
                  background: C.blueL,
                  color: C.blue,
                  borderRadius: 999,
                  padding: "4px 6px 4px 9px",
                  fontSize: 11.5,
                  fontWeight: 900,
                  maxWidth: "100%",
                }}
              >
                <Ship size={12} style={{ flexShrink: 0 }} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {obra?.codigo || "Obra no disponible"}
                </span>
                <button
                  type="button"
                  onClick={() => quitar(id)}
                  disabled={disabled}
                  aria-label={`Quitar ${obra?.codigo || "obra"}`}
                  style={{
                    width: 20,
                    height: 20,
                    border: "none",
                    borderRadius: 999,
                    background: "transparent",
                    color: C.blue,
                    cursor: disabled ? "default" : "pointer",
                    display: "grid",
                    placeItems: "center",
                    padding: 0,
                  }}
                >
                  <X size={12} />
                </button>
              </span>
            );
          })}
        </div>
      ) : (
        <div style={{ color: C.dim, fontSize: 11.5, fontWeight: 700 }}>
          Sin obra: el remito queda en el archivo general.
        </div>
      )}

      {elegidas.length > 1 ? (
        <div style={{ color: C.cyan, fontSize: 11.5, fontWeight: 800 }}>
          Multiobra · un solo PDF visible desde {elegidas.length} obras.
        </div>
      ) : null}
    </div>
  );
}
