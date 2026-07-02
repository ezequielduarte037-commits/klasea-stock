import { useMemo, useState } from "react";
import { C } from "@/theme";
import { INP } from "@/features/rrhh/ui";
import { norm } from "./materialesParser";

function variantList(value) {
  const raw = Array.isArray(value) ? value : [];
  const seen = new Set();
  return raw
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .filter((item) => {
      const key = norm(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export default function VariantesMarcasTab({ materiales = [] }) {
  const [q, setQ] = useState("");
  const [modo, setModo] = useState("con");

  const rows = useMemo(() => {
    const term = norm(q);
    return (materiales || [])
      .filter((material) => material.activo !== false)
      .map((material) => ({ material, variantes: variantList(material.variantes) }))
      .filter((row) => (modo === "con" ? row.variantes.length > 0 : row.variantes.length === 0))
      .filter((row) => {
        if (!term) return true;
        return norm([row.material.descripcion, row.material.codigo, row.material.proveedor, row.variantes.join(" ")].filter(Boolean).join(" ")).includes(term);
      })
      .sort((a, b) => a.material.descripcion.localeCompare(b.material.descripcion, "es", { numeric: true }));
  }, [materiales, modo, q]);

  const stats = useMemo(() => {
    const active = (materiales || []).filter((material) => material.activo !== false);
    const withVariants = active.filter((material) => variantList(material.variantes).length > 0).length;
    return { total: active.length, withVariants, withoutVariants: active.length - withVariants };
  }, [materiales]);

  return (
    <div style={{ display: "grid", gap: 14, maxWidth: 1080 }}>
      <div style={{ border: `1px solid ${C.b0}`, background: C.s0, borderRadius: 14, padding: 16, display: "grid", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 950, color: C.t0 }}>Variantes / marcas</div>
            <div style={{ color: C.t2, fontSize: 12.5, marginTop: 4 }}>Marcas o modelos equivalentes dentro de un mismo producto.</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Stat label="Con variantes" value={stats.withVariants} color={C.green} />
            <Stat label="Sin variantes" value={stats.withoutVariants} color={C.amber} />
            <Stat label="Activos" value={stats.total} color={C.blue} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Buscar producto, codigo, proveedor o variante..." style={{ ...INP, flex: "1 1 280px" }} />
          <select value={modo} onChange={(event) => setModo(event.target.value)} style={{ ...INP, width: 180 }}>
            <option value="con">Con variantes</option>
            <option value="sin">Sin variantes</option>
          </select>
        </div>
      </div>

      <div style={{ display: "grid", gap: 7 }}>
        {rows.map(({ material, variantes }) => (
          <div key={material.id} style={{ border: `1px solid ${C.b0}`, background: C.s0, borderRadius: 11, padding: 11, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, alignItems: "center" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: C.t0, fontSize: 13, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{material.descripcion}</div>
              <div style={{ color: C.t3, fontSize: 11, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{[material.codigo, material.proveedor].filter(Boolean).join(" · ") || "sin codigo"}</div>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {variantes.length ? variantes.map((variant) => (
                <span key={variant} style={{ color: C.violet, background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.28)", borderRadius: 999, padding: "3px 8px", fontSize: 11, fontWeight: 850 }}>
                  {variant}
                </span>
              )) : <span style={{ color: C.t3, fontSize: 12 }}>Sin variantes cargadas</span>}
            </div>
          </div>
        ))}
        {!rows.length && (
          <div style={{ border: `1px dashed ${C.b0}`, borderRadius: 12, padding: 24, color: C.t2, textAlign: "center", fontSize: 13 }}>
            No hay materiales con esos filtros.
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{ border: `1px solid ${C.b0}`, background: C.bg, borderRadius: 10, padding: "8px 11px", minWidth: 112 }}>
      <div style={{ color, fontFamily: C.mono, fontSize: 18, fontWeight: 950 }}>{value}</div>
      <div style={{ color: C.t2, fontSize: 10.5, fontWeight: 850, textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</div>
    </div>
  );
}
