import { useCallback, useEffect, useMemo, useState } from "react";
import { PackageCheck, Plus, RefreshCw, Search, X } from "lucide-react";
import { C } from "@/theme";
import { INP } from "@/features/rrhh/ui";
import { norm } from "./materialesParser";
import {
  desvincularProductoDeRequisito,
  fetchEstadoMigracionProductos,
  fetchRequisitoProductos,
  vincularProductoARequisito,
} from "./productosAsignadosApi";

function legacyVariants(value) {
  const raw = Array.isArray(value) ? value : [];
  return [...new Set(raw.map((item) => String(item || "").trim()).filter(Boolean))];
}

export default function VariantesMarcasTab({ materiales = [] }) {
  const [q, setQ] = useState("");
  const [mode, setMode] = useState("todos");
  const [links, setLinks] = useState([]);
  const [status, setStatus] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editingRequirementId, setEditingRequirementId] = useState("");
  const [productQuery, setProductQuery] = useState("");
  const [busyKey, setBusyKey] = useState("");

  const materialById = useMemo(
    () => new Map((materiales || []).map((material) => [material.id, material])),
    [materiales],
  );
  const requirementIds = useMemo(
    () => (materiales || [])
      .filter((material) => material.activo !== false)
      .filter((material) => material.es_requisito === true || legacyVariants(material.variantes).length > 0)
      .map((material) => material.id),
    [materiales],
  );

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [nextLinks, nextStatus] = await Promise.all([
        fetchRequisitoProductos(requirementIds),
        fetchEstadoMigracionProductos(),
      ]);
      setLinks(nextLinks);
      setStatus(nextStatus);
    } catch (nextError) {
      setError(nextError?.message || "No se pudo leer el estado de la migración.");
    } finally {
      setLoading(false);
    }
  }, [requirementIds]);

  useEffect(() => { reload(); }, [reload]);

  const linksByRequirement = useMemo(() => {
    const map = new Map();
    links.forEach((link) => {
      const list = map.get(link.requisito_material_id) || [];
      list.push(link);
      map.set(link.requisito_material_id, list);
    });
    return map;
  }, [links]);
  const statusByRequirement = useMemo(
    () => new Map(status.map((row) => [row.requisito_material_id, row])),
    [status],
  );

  const rows = useMemo(() => {
    const term = norm(q);
    return requirementIds
      .map((id) => {
        const requirement = materialById.get(id);
        const compatibleLinks = linksByRequirement.get(id) || [];
        const products = compatibleLinks
          .map((link) => ({ link, product: materialById.get(link.producto_material_id) || null }))
          .filter((row) => row.product);
        const migration = statusByRequirement.get(id) || {};
        const pending = Number(migration.obras_pendientes || 0);
        return {
          requirement,
          products,
          migration,
          pending,
          legacy: legacyVariants(requirement?.variantes),
        };
      })
      .filter((row) => row.requirement)
      .filter((row) => {
        if (mode === "pendientes") return row.pending > 0;
        if (mode === "resueltos") return Number(row.migration.obras_total || 0) > 0 && row.pending === 0;
        if (mode === "sin_productos") return row.products.length === 0;
        return true;
      })
      .filter((row) => {
        if (!term) return true;
        return norm([
          row.requirement.descripcion,
          row.requirement.codigo,
          row.legacy.join(" "),
          row.products.map(({ product }) => `${product.descripcion} ${product.codigo || ""} ${product.proveedor || ""}`).join(" "),
        ].join(" ")).includes(term);
      })
      .sort((a, b) => b.pending - a.pending || a.requirement.descripcion.localeCompare(b.requirement.descripcion, "es", { numeric: true }));
  }, [requirementIds, materialById, linksByRequirement, statusByRequirement, mode, q]);

  const stats = useMemo(() => ({
    requirements: requirementIds.length,
    products: new Set(links.map((link) => link.producto_material_id)).size,
    resolved: status.reduce((sum, row) => sum + Number(row.obras_resueltas || 0), 0),
    pending: status.reduce((sum, row) => sum + Number(row.obras_pendientes || 0), 0),
  }), [links, requirementIds.length, status]);

  const productOptions = useMemo(() => {
    const term = norm(productQuery);
    return (materiales || [])
      .filter((material) => material.activo !== false && material.es_requisito !== true)
      .filter((material) => !term || norm([
        material.descripcion,
        material.codigo,
        material.alias,
        material.proveedor,
      ].filter(Boolean).join(" ")).includes(term))
      .sort((a, b) => String(a.descripcion || "").localeCompare(String(b.descripcion || ""), "es", { numeric: true }))
      .slice(0, 12);
  }, [materiales, productQuery]);

  async function linkProduct(requirement, product) {
    const key = `link:${requirement.id}:${product.id}`;
    setBusyKey(key);
    setError("");
    try {
      await vincularProductoARequisito({ requisitoMaterialId: requirement.id, productoMaterialId: product.id });
      setProductQuery("");
      setEditingRequirementId("");
      await reload();
    } catch (nextError) {
      setError(nextError?.message || "No se pudo vincular el producto.");
    } finally {
      setBusyKey("");
    }
  }

  async function unlinkProduct(requirement, product) {
    const key = `unlink:${requirement.id}:${product.id}`;
    setBusyKey(key);
    setError("");
    try {
      await desvincularProductoDeRequisito({ requisitoMaterialId: requirement.id, productoMaterialId: product.id });
      await reload();
    } catch (nextError) {
      setError(nextError?.message || "No se pudo desvincular el producto.");
    } finally {
      setBusyKey("");
    }
  }

  return (
    <div style={{ display: "grid", gap: 14, maxWidth: 1180 }}>
      <section style={{ display: "grid", gap: 26, marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <h2 className="az-subtitulo">Requisitos y productos</h2>
            <p className="az-texto" style={{ marginTop: 8, maxWidth: 650 }}>
              La matriz define qué necesita el barco. Cada obra elige un producto real del catálogo; compras y Pañol trabajan siempre con ese producto.
            </p>
          </div>
          <button type="button" onClick={reload} disabled={loading} style={{ border: `1px solid ${C.b0}`, background: "transparent", color: C.t1, borderRadius: 3, padding: "8px 11px", fontFamily: C.sans, fontWeight: 500, cursor: loading ? "default" : "pointer", opacity: loading ? 0.6 : 1 }}>
            <RefreshCw size={14} /> {loading ? "Actualizando…" : "Actualizar"}
          </button>
        </div>

        <div className="az-ficha">
          <Stat label="Requisitos" value={stats.requirements} />
          <Stat label="Productos vinculados" value={stats.products} />
          <Stat label="Obras resueltas" value={stats.resolved} />
          <Stat label="Obras pendientes" value={stats.pending} color={stats.pending ? C.cyan : undefined} />
        </div>

        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label className="az-buscar" style={{ flex: "1 1 320px" }}>
            <Search size={15} />
            <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Buscar requisito, producto, código, proveedor o marca anterior…" />
          </label>
          <select value={mode} onChange={(event) => setMode(event.target.value)} style={{ ...INP, width: 205 }}>
            <option value="todos">Todos los requisitos</option>
            <option value="pendientes">Con obras pendientes</option>
            <option value="resueltos">Obras resueltas</option>
            <option value="sin_productos">Sin productos vinculados</option>
          </select>
        </div>
        {error && (
          <div style={{ border: `1px solid ${C.redB}`, background: C.redL, color: C.red, borderRadius: 3, padding: "9px 11px", fontSize: 12, fontWeight: 500 }}>
            {error}
          </div>
        )}
      </section>

      <div style={{ display: "grid", gap: 8 }}>
        {rows.map(({ requirement, products, migration, pending, legacy }) => {
          const total = Number(migration.obras_total || 0);
          const resolved = Number(migration.obras_resueltas || 0);
          return (
            <section key={requirement.id} style={{ border: `1px solid ${pending ? C.cyanB : C.b0}`, background: "transparent", borderRadius: 3, padding: 12, display: "grid", gap: 10 }}>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 12, alignItems: "start" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                    <span style={{ color: C.t0, fontSize: 13.5, fontWeight: 600 }}>{requirement.descripcion}</span>
                    <span style={{ color: C.blue, background: C.blueL, border: `1px solid ${C.blueB}`, borderRadius: 999, padding: "2px 7px", fontSize: 9.5, fontWeight: 600 }}>REQUISITO</span>
                  </div>
                  <div style={{ color: C.t3, fontSize: 10.8, marginTop: 3 }}>{[requirement.codigo, requirement.proveedor].filter(Boolean).join(" · ") || "sin código"}</div>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <span style={{ color: C.green, background: C.greenL, border: `1px solid ${C.greenB}`, borderRadius: 999, padding: "3px 8px", fontSize: 10.5, fontWeight: 600 }}>{resolved}/{total} obras resueltas</span>
                  {pending > 0 && <span style={{ color: C.cyan, background: C.cyanL, border: `1px solid ${C.cyanB}`, borderRadius: 999, padding: "3px 8px", fontSize: 10.5, fontWeight: 600 }}>{pending} pendientes</span>}
                </div>
              </div>

                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  {products.map(({ product, link }) => (
                    <span key={product.id} title={link.variante_legacy ? `Migrado desde: ${link.variante_legacy}` : "Producto recomendado"} style={{ display: "inline-flex", alignItems: "center", gap: 5, color: C.t1, background: C.bg, border: `1px solid ${C.b0}`, borderRadius: 999, padding: "3px 5px 3px 9px", fontSize: 10.8, fontWeight: 600 }}>
                      <PackageCheck size={11} color={C.green} /> {product.descripcion}
                      <button type="button" disabled={!!busyKey} aria-label={`Quitar ${product.descripcion} de ${requirement.descripcion}`} title="Quitar recomendación" onClick={() => unlinkProduct(requirement, product)} style={{ width: 20, height: 20, border: "none", display: "grid", placeItems: "center", color: C.t3, background: "transparent", cursor: busyKey ? "default" : "pointer", borderRadius: 999 }}>
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                  {!products.length && <span style={{ color: C.cyan, fontSize: 11.5, fontWeight: 500 }}>Todavía no tiene productos compatibles.</span>}
                  <button type="button" onClick={() => { setEditingRequirementId((current) => current === requirement.id ? "" : requirement.id); setProductQuery(""); }} style={{ display: "inline-flex", alignItems: "center", gap: 5, border: `1px solid ${C.blueB}`, background: editingRequirementId === requirement.id ? C.blueL : C.bg, color: C.blue, borderRadius: 999, padding: "4px 9px", fontFamily: C.sans, fontSize: 10.5, fontWeight: 600, cursor: "pointer" }}>
                    <Plus size={12} /> Vincular producto
                  </button>
                </div>

                {editingRequirementId === requirement.id && (
                  <div style={{ display: "grid", gap: 8, padding: 10, border: `1px solid ${C.blueB}`, background: C.blueL, borderRadius: 3 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 7, border: `1px solid ${C.b0}`, background: C.bg, borderRadius: 8, padding: "0 9px" }}>
                      <Search size={13} color={C.t2} />
                      <input autoFocus value={productQuery} onChange={(event) => setProductQuery(event.target.value)} placeholder="Buscar producto físico por nombre, código o proveedor…" style={{ minWidth: 0, width: "100%", border: "none", outline: "none", background: "transparent", color: C.t0, padding: "8px 0", fontFamily: C.sans, fontSize: 11.5 }} />
                    </label>
                    <div style={{ display: "grid", gap: 5 }}>
                      {productOptions.filter((product) => product.id !== requirement.id && !products.some((item) => item.product.id === product.id)).map((product) => {
                        const key = `link:${requirement.id}:${product.id}`;
                        return <button key={product.id} type="button" disabled={!!busyKey} onClick={() => linkProduct(requirement, product)} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", alignItems: "center", gap: 10, textAlign: "left", border: `1px solid ${C.b0}`, background: C.bg, color: C.t0, borderRadius: 8, padding: "7px 9px", fontFamily: C.sans, cursor: busyKey ? "default" : "pointer" }}>
                          <span style={{ minWidth: 0 }}><strong style={{ fontSize: 11.5 }}>{product.descripcion}</strong><span style={{ display: "block", color: C.t2, fontSize: 10, marginTop: 2 }}>{[product.codigo, product.proveedor].filter(Boolean).join(" · ") || "sin código"}</span></span>
                          <span style={{ color: C.blue, fontSize: 10.5, fontWeight: 600 }}>{busyKey === key ? "Vinculando…" : "Vincular"}</span>
                        </button>;
                      })}
                      {!productOptions.filter((product) => product.id !== requirement.id && !products.some((item) => item.product.id === product.id)).length && <span style={{ color: C.t2, fontSize: 11 }}>No hay otro producto que coincida con esa búsqueda.</span>}
                    </div>
                  </div>
                )}

              {legacy.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", borderTop: `1px solid ${C.b0}`, paddingTop: 8 }}>
                  <span className="az-rotulo">Variantes anteriores</span>
                  {legacy.map((variant) => <span key={variant} style={{ color: C.t2, fontSize: 10.5 }}>{variant}</span>)}
                </div>
              )}
            </section>
          );
        })}
        {!rows.length && !loading && (
          <div style={{ border: `1px dashed ${C.b0}`, borderRadius: 3, padding: 26, color: C.t2, textAlign: "center", fontSize: 12.5 }}>
            No hay requisitos con esos filtros.
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div className="az-dato">
      <div className="az-cifra" style={color ? { color } : undefined}>{value}</div>
      <div className="az-rotulo">{label}</div>
    </div>
  );
}
