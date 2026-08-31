import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, Check, Link2, PackageCheck, Search, Settings2, X } from "lucide-react";
import { useResponsive } from "@/hooks/useResponsive";
import { C } from "@/theme";
import {
  PRODUCT_SPEC_FIELDS,
  normalizeProductSpecs,
  productSpecEntries,
} from "./especificacionesProducto";

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
        transition: "border-color .16s ease, transform .16s ease, box-shadow .16s ease",
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

function ScopeButton({ active, title, description, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "grid",
        gap: 3,
        textAlign: "left",
        border: `1px solid ${active ? C.blueB : C.b0}`,
        background: active ? C.blueL : C.bg,
        color: C.t0,
        borderRadius: 10,
        padding: "9px 10px",
        cursor: "pointer",
        fontFamily: C.sans,
      }}
    >
      <span style={{ fontSize: 11.5, fontWeight: 900, color: active ? C.blue : C.t0 }}>{title}</span>
      <span style={{ fontSize: 10.5, color: C.t2, lineHeight: 1.35 }}>{description}</span>
    </button>
  );
}

export default function ProductoAsignadoControl({
  row,
  materiales = [],
  compatibles = [],
  busy = false,
  obraCodigo = "esta obra",
  linea = "",
  specOnly = false,
  allowLineScope = true,
  triggerVariant = "default",
  onSave,
}) {
  const { isMobile } = useResponsive();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [scope, setScope] = useState("obra");
  const [applyExisting, setApplyExisting] = useState(false);
  const [specs, setSpecs] = useState({});
  const currentSelectedId = row?.productoMaterialId || null;
  const selected = specOnly
    ? row?.material || materiales.find((material) => material.id === row?.materialId) || null
    : row?.producto || materiales.find((material) => material.id === currentSelectedId) || null;
  const currentSpecs = normalizeProductSpecs(row?.especificaciones);
  const specEntries = productSpecEntries(currentSpecs);
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
      .slice(0, query.trim() ? 80 : 30);
  }, [compatibleIds, materiales, query, requirementId]);

  function openModal() {
    setSelectedProductId(specOnly ? "" : currentSelectedId || "");
    setSpecs(currentSpecs);
    setScope("obra");
    setApplyExisting(false);
    setQuery("");
    setOpen(true);
  }

  async function save() {
    await onSave?.(row, {
      productoMaterialId: selectedProductId || null,
      especificaciones: normalizeProductSpecs(specs),
      alcance: scope,
      aplicarObrasExistentes: scope === "linea" && applyExisting,
    });
    setOpen(false);
  }

  const triggerDefault = (
    <button
      type="button"
      disabled={busy}
      onClick={openModal}
      title={specOnly ? "Configurar color, terminación, medida o detalle técnico" : selected ? `Producto asignado: ${selected.descripcion}` : "Asignar el producto real que llevará esta obra"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        maxWidth: 280,
        minHeight: 24,
        border: `1px solid ${specOnly ? (specEntries.length ? C.blueB : C.b0) : selected ? C.greenB : C.amberB}`,
        background: specOnly ? (specEntries.length ? C.blueL : C.s0) : selected ? C.greenL : C.amberL,
        color: specOnly ? (specEntries.length ? C.blue : C.t2) : selected ? C.green : C.amber,
        borderRadius: 999,
        padding: "3px 8px",
        fontSize: 10,
        fontWeight: 900,
        fontFamily: C.sans,
        cursor: busy ? "default" : "pointer",
        opacity: busy ? 0.6 : 1,
      }}
    >
      {specOnly ? <Settings2 size={12} /> : selected ? <PackageCheck size={12} /> : <AlertCircle size={12} />}
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {specOnly ? (specEntries.length ? `${specEntries.length} especificación${specEntries.length === 1 ? "" : "es"}` : "Especificar") : selected ? selected.descripcion : "Producto pendiente"}
      </span>
      {!specOnly && row?.productoEstandar && <span style={{ color: C.blue, fontSize: 9 }}>· estándar K{linea}</span>}
      {!specOnly && specEntries.length > 0 && <Settings2 size={11} />}
    </button>
  );

  const triggerPlanilla = (
    <button
      type="button"
      disabled={busy}
      onClick={openModal}
      aria-label={`Buscar en el catálogo un producto para ${row?.descripcion || "el requisito"}`}
      style={{
        width: "fit-content",
        minHeight: 25,
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        border: `1px solid ${C.blueB}`,
        background: C.blueL,
        color: C.blue,
        borderRadius: 7,
        padding: "4px 7px",
        textAlign: "left",
        fontFamily: C.sans,
        cursor: busy ? "wait" : "pointer",
        opacity: busy ? .65 : 1,
      }}
    >
      {busy
        ? <span className="spin" style={{ width: 12, height: 12, border: "2px solid currentColor", borderRightColor: "transparent", borderRadius: 999 }} />
        : <Search size={12} />}
      <span style={{ whiteSpace: "nowrap", fontSize: 9.5, fontWeight: 900 }}>Buscar en catálogo</span>
    </button>
  );

  const trigger = triggerVariant === "planilla" ? triggerPlanilla : triggerDefault;

  if (!open || typeof document === "undefined") return trigger;

  const selectedDraft = materiales.find((material) => material.id === selectedProductId) || null;

  return (
    <>
      {trigger}
      {createPortal(
        <div
          role="dialog"
          aria-modal="true"
          onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setOpen(false); }}
          style={{ position: "fixed", inset: 0, zIndex: 10020, display: "grid", placeItems: "center", padding: isMobile ? 8 : 18, background: "rgba(2,6,23,.58)", backdropFilter: "blur(5px)" }}
        >
          <section style={{ width: specOnly ? "min(620px, 100%)" : "min(980px, 100%)", maxHeight: isMobile ? "calc(100vh - 16px)" : "min(820px, calc(100vh - 36px))", display: "grid", gridTemplateRows: "auto minmax(0,1fr) auto", overflow: "hidden", border: `1px solid ${C.b1}`, borderRadius: isMobile ? 12 : 16, background: "var(--panel-solid)", boxShadow: "0 26px 80px rgba(0,0,0,.32)" }}>
            <header style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 12, alignItems: "start", padding: "14px 16px", borderBottom: `1px solid ${C.b0}` }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: C.t0, fontSize: 15, fontWeight: 950 }}>{specOnly ? "Especificaciones de la obra" : "Producto y especificaciones"}</div>
                <div style={{ color: C.t2, fontSize: 11.5, marginTop: 3 }}>
                  Requisito: <strong style={{ color: C.t1 }}>{row?.descripcion || "Material de matriz"}</strong>
                </div>
              </div>
              <button type="button" disabled={busy} onClick={() => setOpen(false)} aria-label="Cerrar selector de producto" style={{ width: 32, height: 32, display: "grid", placeItems: "center", border: `1px solid ${C.b0}`, background: C.s0, color: C.t1, borderRadius: 9, cursor: "pointer" }}>
                <X size={16} />
              </button>
            </header>

            <div style={{ overflowY: "auto", padding: isMobile ? 10 : 14, display: "grid", gridTemplateColumns: isMobile || specOnly ? "1fr" : "minmax(0,1.2fr) minmax(280px,.8fr)", gap: 14, alignItems: "start" }}>
              {!specOnly && <div style={{ display: "grid", gap: 10, minWidth: 0 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${C.b0}`, background: C.bg, borderRadius: 10, padding: "0 11px" }}>
                  <Search size={15} color={C.t2} />
                  <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar descripción, marca, modelo, código, proveedor u observación…" style={{ width: "100%", border: "none", outline: "none", background: "transparent", color: C.t0, padding: "10px 0", fontFamily: C.sans, fontSize: 12.5 }} />
                </label>
                <div style={{ color: C.t2, fontSize: 10.5 }}>Los compatibles aparecen primero, pero podés elegir cualquier producto concreto del catálogo.</div>
                <button type="button" onClick={() => setSelectedProductId("")} style={{ border: `1px solid ${!selectedProductId ? C.amberB : C.b0}`, background: !selectedProductId ? C.amberL : C.bg, color: !selectedProductId ? C.amber : C.t2, borderRadius: 10, padding: "9px 11px", textAlign: "left", fontFamily: C.sans, fontSize: 11.5, fontWeight: 850, cursor: "pointer" }}>
                  Dejar producto pendiente
                </button>
                <div style={{ display: "grid", gap: 7 }}>
                  {products.map((product) => (
                    <ProductRow key={product.id} product={product} linked={compatibleIds.has(product.id)} selected={selectedProductId === product.id} busy={busy} onSelect={(item) => setSelectedProductId(item.id)} />
                  ))}
                  {!products.length && <div style={{ padding: 28, textAlign: "center", color: C.t2, fontSize: 12.5 }}>No encontramos productos con esa búsqueda. Crealo primero en el catálogo completo.</div>}
                </div>
              </div>}

              <aside style={{ display: "grid", gap: 12, minWidth: 0 }}>
                <section style={{ display: "grid", gap: 8, padding: 11, border: `1px solid ${C.b0}`, borderRadius: 12, background: C.s0 }}>
                  <div style={{ color: C.t0, fontSize: 11.5, fontWeight: 950 }}>{allowLineScope ? "Aplicar cambio a" : "Alcance del cambio"}</div>
                  <ScopeButton active={scope === "obra"} title={`Solo obra ${obraCodigo}`} description="Cambia este barco sin modificar la matriz ni las demás obras." onClick={() => setScope("obra")} />
                  {allowLineScope ? <ScopeButton active={scope === "linea"} title={`Estándar de línea K${linea}`} description="Queda como producto recomendado para las próximas obras de esta línea." onClick={() => setScope("linea")} /> : null}
                  {allowLineScope && scope === "linea" && (
                    <label style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "7px 3px", color: C.t1, fontSize: 10.5, lineHeight: 1.4, cursor: "pointer" }}>
                      <input type="checkbox" checked={applyExisting} onChange={(event) => setApplyExisting(event.target.checked)} style={{ marginTop: 2 }} />
                      <span><strong>Actualizar obras existentes sin movimientos.</strong><br />Las que ya tengan compras o ingresos quedan intactas y se informan como omitidas.</span>
                    </label>
                  )}
                </section>

                <section style={{ display: "grid", gap: 9, padding: 11, border: `1px solid ${C.b0}`, borderRadius: 12, background: C.s0 }}>
                  <div>
                    <div style={{ color: C.t0, fontSize: 11.5, fontWeight: 950 }}>Especificaciones</div>
                    <div style={{ color: C.t2, fontSize: 10.5, marginTop: 2, lineHeight: 1.4 }}>Usalas cuando el dato cambia por obra pero no representa otro producto de stock.</div>
                  </div>
                  {PRODUCT_SPEC_FIELDS.map((field) => (
                    <label key={field.key} style={{ display: "grid", gap: 4 }}>
                      <span style={{ color: C.t2, fontSize: 9.5, fontWeight: 850, textTransform: "uppercase", letterSpacing: .7 }}>{field.label}</span>
                      {field.key === "detalle" ? (
                        <textarea value={specs[field.key] || ""} onChange={(event) => setSpecs((current) => ({ ...current, [field.key]: event.target.value }))} placeholder={field.placeholder} rows={3} style={{ width: "100%", resize: "vertical", border: `1px solid ${C.b0}`, background: C.bg, color: C.t0, borderRadius: 9, padding: "8px 9px", outline: "none", fontFamily: C.sans, fontSize: 11.5 }} />
                      ) : (
                        <input value={specs[field.key] || ""} onChange={(event) => setSpecs((current) => ({ ...current, [field.key]: event.target.value }))} placeholder={field.placeholder} style={{ width: "100%", border: `1px solid ${C.b0}`, background: C.bg, color: C.t0, borderRadius: 9, padding: "8px 9px", outline: "none", fontFamily: C.sans, fontSize: 11.5 }} />
                      )}
                    </label>
                  ))}
                </section>
              </aside>
            </div>

            <footer style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "11px 14px", borderTop: `1px solid ${C.b0}`, background: C.s0 }}>
              <div style={{ minWidth: 0, color: C.t2, fontSize: 10.5 }}>
                {specOnly ? <>Producto: <strong style={{ color: C.t0 }}>{selected?.descripcion || row?.descripcion}</strong></> : selectedDraft ? <>Seleccionado: <strong style={{ color: C.t0 }}>{selectedDraft.descripcion}</strong></> : <strong style={{ color: C.amber }}>Producto pendiente</strong>}
              </div>
              <div style={{ display: "flex", gap: 7 }}>
                <button type="button" disabled={busy} onClick={() => setOpen(false)} style={{ border: `1px solid ${C.b0}`, background: C.bg, color: C.t1, borderRadius: 9, padding: "8px 12px", fontFamily: C.sans, fontWeight: 850, cursor: "pointer" }}>Cancelar</button>
                <button type="button" disabled={busy} onClick={save} style={{ border: `1px solid ${C.blueB}`, background: C.blue, color: "white", borderRadius: 9, padding: "8px 13px", fontFamily: C.sans, fontWeight: 900, cursor: busy ? "default" : "pointer", opacity: busy ? .6 : 1 }}>
                  {busy ? "Guardando…" : "Guardar configuración"}
                </button>
              </div>
            </footer>
          </section>
        </div>,
        document.body,
      )}
    </>
  );
}
