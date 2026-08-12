import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, Check, Link2, PackageCheck, Search, X } from "lucide-react";
import { C } from "@/theme";

function norm(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function productHaystack(product) {
  return norm([
    product?.descripcion,
    product?.alias,
    product?.codigo,
    product?.codigo_barra,
    product?.proveedor,
    product?.notas,
  ].filter(Boolean).join(" "));
}

function ProductRow({ product, linked = false, selected = false, busy = false, onSelect }) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => onSelect?.(product)}
      style={{
        width: "100%",
        display: "grid",
        gridTemplateColumns: "minmax(0,1fr) auto",
        gap: 12,
        alignItems: "center",
        textAlign: "left",
        border: `1px solid ${selected ? C.greenB : C.b0}`,
        background: selected ? C.greenL : C.bg,
        color: C.t0,
        borderRadius: 11,
        padding: "10px 12px",
        cursor: busy ? "default" : "pointer",
        fontFamily: C.sans,
        opacity: busy ? 0.65 : 1,
      }}
    >
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis" }}>{product.descripcion}</span>
          {linked && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: C.blue, background: C.blueL, border: `1px solid ${C.blueB}`, borderRadius: 999, padding: "2px 7px", fontSize: 9.5, fontWeight: 900 }}>
              <Link2 size={10} /> Compatible
            </span>
          )}
        </span>
        <span style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4, color: C.t2, fontSize: 10.5 }}>
          {product.codigo && <span style={{ fontFamily: C.mono }}>{product.codigo}</span>}
          <span>{product.proveedor || "Sin proveedor"}</span>
          <span>{product.unidad_medida || "unidad"}</span>
        </span>
      </span>
      {selected ? <Check size={17} color={C.green} /> : <PackageCheck size={17} color={C.t2} />}
    </button>
  );
}

export default function ProductoAsignadoControl({
  row,
  materiales = [],
  compatibles = [],
  busy = false,
  onAssign,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selectedId = row?.productoMaterialId || null;
  const selected = row?.producto || materiales.find((material) => material.id === selectedId) || null;
  const compatibleIds = useMemo(() => new Set((compatibles || []).map((item) => item.producto_material_id)), [compatibles]);
  const requirementId = row?.requisitoMaterialId || row?.materialId || null;

  const products = useMemo(() => {
    const term = norm(query);
    return (materiales || [])
      .filter((material) => material?.activo !== false)
      .filter((material) => material.id !== requirementId)
      .filter((material) => material.es_requisito !== true)
      .filter((material) => !term || term.split(" ").every((token) => productHaystack(material).includes(token)))
      .sort((a, b) => {
        const aLinked = compatibleIds.has(a.id) ? 1 : 0;
        const bLinked = compatibleIds.has(b.id) ? 1 : 0;
        if (aLinked !== bLinked) return bLinked - aLinked;
        return String(a.descripcion || "").localeCompare(String(b.descripcion || ""), "es", { numeric: true });
      })
      .slice(0, query.trim() ? 80 : 24);
  }, [compatibleIds, materiales, query, requirementId]);

  async function choose(productId) {
    await onAssign?.(row, productId || null);
    setOpen(false);
    setQuery("");
  }

  const trigger = (
    <button
      type="button"
      disabled={busy}
      onClick={() => setOpen(true)}
      title={selected ? `Producto asignado: ${selected.descripcion}` : "Asignar el producto real que llevará esta obra"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        maxWidth: 240,
        minHeight: 23,
        border: `1px solid ${selected ? C.greenB : C.amberB}`,
        background: selected ? C.greenL : C.amberL,
        color: selected ? C.green : C.amber,
        borderRadius: 999,
        padding: "3px 8px",
        fontSize: 10,
        fontWeight: 900,
        fontFamily: C.sans,
        cursor: busy ? "default" : "pointer",
        opacity: busy ? 0.6 : 1,
      }}
    >
      {selected ? <PackageCheck size={12} /> : <AlertCircle size={12} />}
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {selected ? selected.descripcion : "Producto pendiente"}
      </span>
    </button>
  );

  if (!open || typeof document === "undefined") return trigger;

  return (
    <>
      {trigger}
      {createPortal(
        <div
          role="dialog"
          aria-modal="true"
          onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setOpen(false); }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10020,
            display: "grid",
            placeItems: "center",
            padding: 18,
            background: "rgba(2,6,23,.58)",
            backdropFilter: "blur(5px)",
          }}
        >
          <section style={{ width: "min(760px, 100%)", maxHeight: "min(760px, calc(100vh - 36px))", display: "grid", gridTemplateRows: "auto auto minmax(0,1fr)", overflow: "hidden", border: `1px solid ${C.b1}`, borderRadius: 16, background: "var(--panel-solid)", boxShadow: "0 26px 80px rgba(0,0,0,.32)" }}>
            <header style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 12, alignItems: "start", padding: "15px 16px", borderBottom: `1px solid ${C.b0}` }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: C.t0, fontSize: 15, fontWeight: 950 }}>Asignar producto real</div>
                <div style={{ color: C.t2, fontSize: 11.5, marginTop: 3 }}>
                  Requisito: <strong style={{ color: C.t1 }}>{row?.descripcion || "Material de matriz"}</strong>
                </div>
              </div>
              <button type="button" disabled={busy} onClick={() => setOpen(false)} style={{ width: 32, height: 32, display: "grid", placeItems: "center", border: `1px solid ${C.b0}`, background: C.s0, color: C.t1, borderRadius: 9, cursor: "pointer" }}>
                <X size={16} />
              </button>
            </header>

            <div style={{ padding: 12, borderBottom: `1px solid ${C.b0}`, display: "grid", gap: 9 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${C.b0}`, background: C.bg, borderRadius: 10, padding: "0 11px" }}>
                <Search size={15} color={C.t2} />
                <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar descripción, marca, modelo, código, proveedor u observación…" style={{ width: "100%", border: "none", outline: "none", background: "transparent", color: C.t0, padding: "10px 0", fontFamily: C.sans, fontSize: 12.5 }} />
              </label>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", color: C.t2, fontSize: 10.5 }}>
                <span>Los compatibles aparecen primero. También podés elegir cualquier producto del catálogo.</span>
                {selected && <button type="button" disabled={busy} onClick={() => choose(null)} style={{ border: "none", background: "transparent", color: C.red, fontFamily: C.sans, fontWeight: 850, cursor: "pointer" }}>Quitar asignación</button>}
              </div>
            </div>

            <div style={{ overflowY: "auto", padding: 12, display: "grid", alignContent: "start", gap: 7 }}>
              {products.map((product) => (
                <ProductRow key={product.id} product={product} linked={compatibleIds.has(product.id)} selected={selectedId === product.id} busy={busy} onSelect={(item) => choose(item.id)} />
              ))}
              {!products.length && (
                <div style={{ padding: 28, textAlign: "center", color: C.t2, fontSize: 12.5 }}>
                  No encontramos productos con esa búsqueda. Crealo primero en el catálogo completo.
                </div>
              )}
            </div>
          </section>
        </div>,
        document.body,
      )}
    </>
  );
}

